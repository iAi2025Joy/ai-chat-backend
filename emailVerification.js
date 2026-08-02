// emailVerification.js
// ====================
//
// Same bug, same fix as passwordReset.js -- see that file's header
// comment for the full explanation. Short version: Firebase's web
// action links (both password reset AND email verification) always
// point to firebaseapp.com by default, regardless of handleCodeInApp,
// unless the project's "Customize action URL" Console setting is
// configured -- which fails on this project with a confirmed
// EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED error. Confirmed for THIS specific
// link type too (not just password reset) via a real test: a fresh
// verification email's link landed on
// garnet-chat-7d04a.firebaseapp.com/__/auth/action?mode=verifyEmail...
// instead of garnet.institute-of-ai.org.
//
// Same fix: generate the link via the Admin SDK (to get a valid
// oobCode), extract just that oobCode, and build our own link pointing
// straight at garnet.institute-of-ai.org -- then email it ourselves via
// Resend, instead of relying on Firebase's built-in verification email
// (which we can't fully control the destination of anyway, per the bug
// above).
//
// The frontend's existing handleEmailActionFromUrl() (in index.html)
// already handles ?mode=verifyEmail&oobCode=... arriving at ANY URL --
// it doesn't care that the link used to come from Firebase's own
// hosted page, so no frontend changes are needed for the link-handling
// itself. The only frontend change needed is calling this new backend
// endpoint instead of Firebase's client-side sendEmailVerification()
// when a fresh verification email needs to be (re)sent.

import fetch from "node-fetch";
import admin from "firebase-admin";
import { getFirebaseAdmin } from "./adminUsers.js";

const RESET_LINK_SETTINGS = {
  url: "https://garnet.institute-of-ai.org/",
  handleCodeInApp: true,
};

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "GARNET-26 Chat <noreply@institute-of-ai.org>";

// ------------------------------------------------------------------
// RATE LIMITING -- same simple in-memory pattern as passwordReset.js,
// same reasoning (this endpoint's cost is an email send, and the
// existing "Resend Verification Email" button already gives a
// legitimate signed-in user a way to trigger this repeatedly, so a
// deliberately generous but still-real cap matters here).
// ------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) return true;
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return false;
}

export async function handleRequestEmailVerification(req, res) {
  try {
    const ip = req.ip || "unknown";
    if (isRateLimited(ip)) {
      return res.status(429).json({
        error: "Too many requests. Please wait a moment before trying again.",
      });
    }

    const email = (req.body && req.body.email || "").trim();
    if (!email) {
      return res.status(400).json({ error: "Missing 'email' in request body." });
    }

    getFirebaseAdmin();

    let link;
    try {
      link = await admin.auth().generateEmailVerificationLink(email, RESET_LINK_SETTINGS);
    } catch (err) {
      // Same anti-enumeration stance as passwordReset.js -- report
      // success either way rather than revealing whether an account
      // exists for this email.
      if (err.code === "auth/user-not-found") {
        return res.json({ success: true });
      }
      throw err;
    }

    const oobCode = new URL(link).searchParams.get("oobCode");
    const directLink = `https://garnet.institute-of-ai.org/?mode=verifyEmail&oobCode=${encodeURIComponent(oobCode)}`;

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set.");
    }

    const emailHtml =
      "<p>Hello,</p>" +
      `<p>Follow this link to verify your email address for GARNET-26 Chat (${email}).</p>` +
      `<p><a href="${directLink}">${directLink}</a></p>` +
      "<p>If you didn't create this account, you can ignore this email.</p>" +
      "<p>Thanks,<br>Your GARNET-26 Chat team</p>";

    const resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: email,
        subject: "Verify your email for GARNET-26 Chat",
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error("Resend API error:", resendResponse.status, errText);
      throw new Error("Failed to send verification email.");
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Email verification error:", err);
    res.status(500).json({
      error: "Something went wrong sending the verification email. Please try again.",
    });
  }
}
