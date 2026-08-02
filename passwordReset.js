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
// code, and there's no console workaround for it.
//
// THE FIX: skip Firebase's built-in "send the email for me" flow
// entirely. The Firebase ADMIN SDK's generatePasswordResetLink() lets
// us generate the exact same kind of reset link, but with FULL control
// over actionCodeSettings (url + handleCodeInApp) -- completely
// independent of the broken Console template setting. We then send that
// link ourselves via Resend (a simple transactional email API), instead
// of letting Firebase email it.
//
// The frontend's "Forgot password" button calls THIS backend endpoint
// (POST /request-password-reset) instead of calling Firebase's
// auth.sendPasswordResetEmail() directly from the browser.

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

// Resend's shared testing address -- works immediately with zero DNS
// setup, so the reset flow works today. SWITCH THIS to a verified
// address on your own domain (e.g. "GARNET-26 <noreply@institute-of-ai.org>")
// once that domain is verified in the Resend dashboard -- until then,
// emails will show as sent "via resend.dev" in some mail clients.
const FROM_ADDRESS = "GARNET-26 Chat <onboarding@resend.dev>";

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

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set.");
    }

    const emailHtml =
      "<p>Hello,</p>" +
      `<p>Follow this link to reset your GARNET-26 Chat password for your ${email} account.</p>` +
      `<p><a href="${link}">${link}</a></p>` +
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
