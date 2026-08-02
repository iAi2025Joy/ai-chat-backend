// passwordReset.js
// ====================
//
// WHY THIS FILE EXISTS: Firebase's Console has a "Customize action URL"
// setting (Authentication > Templates > Password reset) meant to make
// password reset emails link DIRECTLY to our own site
// (garnet.institute-of-ai.org) instead of Firebase's generic
// firebaseapp.com default page. Saving that setting fails on this
// project with a real, confirmed API error --
// EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED -- verified via the browser's
// Network tab against Firebase's own identitytoolkit API, not a guess.
// This is a Firebase-side restriction, not something wrong with our
// code, and there's no Console workaround for it.
//
// A DEAD END WE TRIED FIRST: switching to the Admin SDK's
// generatePasswordResetLink() with actionCodeSettings (url +
// handleCodeInApp) -- this does NOT fix the routing either.
// handleCodeInApp only controls MOBILE app deep-linking; for web,
// EVERY Firebase-generated action link points at firebaseapp.com
// regardless of which SDK generated it, UNLESS the project has a
// custom email action handler configured via Firebase Hosting -- the
// same underlying setting that's blocked by the Console bug above.
//
// THE ACTUAL FIX: skip Firebase's generated link's domain entirely.
// Our frontend's handlePasswordResetFromUrl() (in index.html) only
// needs `mode` and `oobCode` from the URL -- it calls Firebase's
// client SDK directly with the oobCode value itself, which works no
// matter what URL delivered it to the browser. So below, we generate
// the link via the Admin SDK (to get a valid oobCode), extract just
// that oobCode, and build our OWN link pointing straight at
// garnet.institute-of-ai.org -- then email THAT via Resend, instead of
// Firebase's own email system (which we can't use anyway, per the bug
// above) or Firebase's generated firebaseapp.com link.

import fetch from "node-fetch";
import admin from "firebase-admin";
import { getFirebaseAdmin } from "./adminUsers.js";

// Must exactly match the authorized custom domain already configured in
// Firebase Console > Authentication > Settings > Authorized domains, and
// the emailActionSettings.url previously used on the frontend for the
// (now-removed) direct sendPasswordResetEmail() call.
const RESET_LINK_SETTINGS = {
  url: "https://garnet.institute-of-ai.org/",
  handleCodeInApp: true,
};

const RESEND_API_URL = "https://api.resend.com/emails";

// Uses the verified institute-of-ai.org domain in Resend (DNS records --
// DKIM, SPF, and the "send" subdomain MX record -- added directly in
// Webnode's DNS management, verified via Resend's domain verification
// flow). Real recipients can now receive these emails, not just the
// Resend account's own test address.
const FROM_ADDRESS = "GARNET-26 Chat <noreply@institute-of-ai.org>";

// ------------------------------------------------------------------
// RATE LIMITING -- same simple in-memory pattern already used for
// /chat in server.js. Deliberately stricter here (5/min/IP, not 15) --
// this endpoint's cost is an email send, not just an OpenAI call, and
// there's no legitimate reason a real user needs more than a couple of
// reset requests per minute.
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

export async function handleRequestPasswordReset(req, res) {
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
      link = await admin.auth().generatePasswordResetLink(email, RESET_LINK_SETTINGS);
    } catch (err) {
      // Deliberately report success even if the account doesn't exist --
      // an intentional anti-enumeration measure, matching how Firebase's
      // own client-side sendPasswordResetEmail() behaved (it never
      // revealed whether a given email had an account or not).
      if (err.code === "auth/user-not-found") {
        return res.json({ success: true });
      }
      throw err;
    }

    // IMPORTANT: Firebase's generated link ALWAYS points at its own
    // hosted domain (firebaseapp.com/__/auth/action) for web -- this is
    // true regardless of handleCodeInApp/url in RESET_LINK_SETTINGS
    // above (those only affect MOBILE deep-linking; confirmed against
    // Firebase's own docs, not a guess). Redirecting web links to our
    // own domain requires a separate "custom email action handler" via
    // Firebase Hosting -- the same underlying project setting that's
    // been failing with EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED in the
    // Console, so that path is blocked too.
    //
    // WORKAROUND (no Hosting/Console dependency at all): our frontend's
    // handlePasswordResetFromUrl() only needs `mode` and `oobCode` from
    // the URL -- it calls Firebase's client SDK directly with the
    // oobCode value itself, which works no matter what URL delivered it
    // to the browser. So we extract the oobCode from Firebase's
    // generated link and build our OWN link straight to our domain,
    // instead of emailing Firebase's firebaseapp.com link as-is.
    const oobCode = new URL(link).searchParams.get("oobCode");
    const directLink = `https://garnet.institute-of-ai.org/?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set.");
    }

    const emailHtml =
      "<p>Hello,</p>" +
      `<p>Follow this link to reset your GARNET-26 Chat password for your ${email} account.</p>` +
      `<p><a href="${directLink}">${directLink}</a></p>` +
      "<p>If you didn't ask to reset your password, you can ignore this email.</p>" +
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
        subject: "Reset your password for GARNET-26 Chat",
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error("Resend API error:", resendResponse.status, errText);
      throw new Error("Failed to send reset email.");
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).json({
      error: "Something went wrong sending the reset email. Please try again.",
    });
  }
}
