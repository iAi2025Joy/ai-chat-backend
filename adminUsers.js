// adminUsers.js
// ====================
//
// Real admin capabilities for managing registered GARNET-26 chat users --
// listing everyone, disabling, re-enabling, and deleting accounts.
//
// WHY THIS HAS TO LIVE HERE (the backend), NOT in the static garnet-chat
// page: Firebase's CLIENT-SIDE SDK (what runs in a browser) has no
// ability to list all users or manage accounts other than the one
// currently signed in -- that's a deliberate security boundary, not a
// missing feature. Only the Firebase ADMIN SDK can do this, and it
// requires a service account private key that must NEVER be exposed to
// a browser (anyone with it would have full control over your entire
// Firebase project). This backend is a trusted server environment
// (unlike GitHub Pages), so it's the correct place for this.
//
// AUTHORIZATION MODEL: being "admin" is controlled by a Firebase custom
// claim (admin: true) set on a user's account via the Admin SDK -- NOT
// a Firestore field a user could set on their own document (Firestore
// security rules as configured let a user write their OWN document,
// which would let anyone self-grant admin if it were stored there
// instead). Custom claims are embedded in the user's ID token by
// Firebase itself and cannot be forged or self-assigned by a client.
// Every admin action below re-verifies this claim server-side on every
// request -- the frontend showing/hiding an "Admin Panel" link is just
// UI convenience, not the actual security boundary.

import admin from "firebase-admin";

let adminApp = null;

function getFirebaseAdmin() {
  if (adminApp) return adminApp;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. " +
      "Admin features are disabled until this is configured."
    );
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  adminApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  return adminApp;
}

// Verifies the request actually comes from a real, currently-admin user
// -- checks the Firebase ID token in the Authorization header and its
// admin:true custom claim. Returns the decoded token on success, or
// throws with a clear reason on failure (caller turns this into the
// appropriate HTTP error response).
async function verifyAdminRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    const err = new Error("Missing Authorization header.");
    err.statusCode = 401;
    throw err;
  }
  const idToken = match[1];

  getFirebaseAdmin();
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    const wrapped = new Error("Invalid or expired sign-in token.");
    wrapped.statusCode = 401;
    throw wrapped;
  }

  if (decoded.admin !== true) {
    const err = new Error("This account does not have admin access.");
    err.statusCode = 403;
    throw err;
  }

  return decoded;
}

export async function handleListUsers(req, res) {
  try {
    await verifyAdminRequest(req);
    getFirebaseAdmin();

    const result = await admin.auth().listUsers(1000); // free tier: plenty of headroom for a project this size
    const users = result.users.map((u) => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName || null,
      emailVerified: u.emailVerified,
      disabled: u.disabled,
      createdAt: u.metadata.creationTime,
      lastSignInAt: u.metadata.lastSignInTime,
    }));
    // Newest accounts first -- more useful default ordering for an admin skimming the list.
    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ users });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

export async function handleDisableUser(req, res) {
  try {
    await verifyAdminRequest(req);
    getFirebaseAdmin();
    const { uid } = req.params;
    await admin.auth().updateUser(uid, { disabled: true });
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

export async function handleEnableUser(req, res) {
  try {
    await verifyAdminRequest(req);
    getFirebaseAdmin();
    const { uid } = req.params;
    await admin.auth().updateUser(uid, { disabled: false });
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

export async function handleDeleteUser(req, res) {
  try {
    await verifyAdminRequest(req);
    getFirebaseAdmin();
    const { uid } = req.params;
    await admin.auth().deleteUser(uid);
    // NOTE: this deletes the AUTH account only. Their saved chats in
    // Firestore (users/{uid}/chats/...) are intentionally left in place
    // rather than auto-deleted here -- a genuine, separate cleanup
    // decision, not an oversight. Add a Firestore cleanup step here
    // later if you want deletion to also purge their chat history.
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

// ------------------------------------------------------------------
// ONE-TIME BOOTSTRAP: grants the very first admin, since there's a
// chicken-and-egg problem otherwise (you need an existing admin to
// grant admin access, but there isn't one yet on a fresh setup).
// Protected by a SEPARATE secret (ADMIN_BOOTSTRAP_SECRET), not by an
// existing admin's token. STRONGLY RECOMMENDED: remove/rotate this
// secret from Render's environment variables once you've bootstrapped
// your one admin account, since anyone who ever learns this secret
// could grant themselves (or anyone) admin access via this endpoint.
// ------------------------------------------------------------------
export async function handleBootstrapAdmin(req, res) {
  try {
    const providedSecret = req.headers["x-bootstrap-secret"] || "";
    const realSecret = process.env.ADMIN_BOOTSTRAP_SECRET || "";
    if (!realSecret) {
      return res.status(500).json({ error: "ADMIN_BOOTSTRAP_SECRET is not configured on the server." });
    }
    if (providedSecret !== realSecret) {
      return res.status(403).json({ error: "Invalid bootstrap secret." });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Missing 'email' in request body." });
    }

    getFirebaseAdmin();
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });

    res.json({ success: true, message: `${email} is now an admin. Remove ADMIN_BOOTSTRAP_SECRET from Render now.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
