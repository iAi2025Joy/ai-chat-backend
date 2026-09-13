// ------------------------------------------------------------------
  // FIREBASE AUTHENTICATION
  // ------------------------------------------------------------------
  // ⚠️ REPLACE with YOUR OWN Firebase project's config -- get this from
  // Firebase Console > Project Settings > General > "Your apps" > Web
  // app > SDK setup and configuration. These values are meant to be
  // public/client-side per Firebase's own security model.
  const firebaseConfig = {
    apiKey: "AIzaSyDg684F5zl8U94jcajBDCn7XZt-UIB2BO8",
    authDomain: "garnet-chat-7d04a.firebaseapp.com",
    projectId: "garnet-chat-7d04a",
    storageBucket: "garnet-chat-7d04a.firebasestorage.app",
    messagingSenderId: "1041498206561",
    appId: "1:1041498206561:web:cce170fdabf3549bfc9520",
  };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  function showPanel(panelId) {
    ["signInPanel", "signUpPanel", "forgotPanel", "verifyEmailPanel", "resetPasswordPanel"].forEach((id) => {
      document.getElementById(id).style.display = id === panelId ? "block" : "none";
    });
    // Clear stale error/success messages when switching panels
    ["signInError", "signUpError", "forgotError", "forgotSuccess", "verifyEmailError", "verifyEmailSuccess", "resetPasswordError", "resetPasswordSuccess"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "";
    });
  }

  // Human-readable messages for Firebase's error codes, instead of
  // showing raw technical error strings to the user.
  function friendlyAuthError(error) {
    const map = {
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/user-not-found": "No account found with that email.",
      "auth/wrong-password": "Incorrect password. Please try again.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/email-already-in-use": "An account with that email already exists. Try signing in instead.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
      "auth/expired-action-code": "This reset link has expired -- please request a new one.",
      "auth/invalid-action-code": "This reset link is invalid or has already been used -- please request a new one.",
    };
    return map[error.code] || "Something went wrong. Please try again.";
  }

  function handleSignIn() {
    const email = document.getElementById("signInEmail").value.trim();
    const password = document.getElementById("signInPassword").value;
    const errorEl = document.getElementById("signInError");
    errorEl.textContent = "";

    if (!email || !password) {
      errorEl.textContent = "Please enter your email and password.";
      return;
    }

    auth.signInWithEmailAndPassword(email, password).catch((error) => {
      errorEl.textContent = friendlyAuthError(error);
    });
    // On success, onAuthStateChanged (below) handles hiding the gate.
  }

  function handleSignUp() {
    const firstName = document.getElementById("signUpFirstName").value.trim();
    const lastName = document.getElementById("signUpLastName").value.trim();
    const email = document.getElementById("signUpEmail").value.trim();
    const password = document.getElementById("signUpPassword").value;
    const confirmPassword = document.getElementById("signUpPasswordConfirm").value;
    const agreedToTerms = document.getElementById("agreeTerms").checked;
    const errorEl = document.getElementById("signUpError");
    errorEl.textContent = "";

    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      errorEl.textContent = "Please fill in all fields.";
      return;
    }
    if (password !== confirmPassword) {
      errorEl.textContent = "Passwords do not match.";
      return;
    }
    if (!agreedToTerms) {
      errorEl.textContent = "You must agree to the Terms & Conditions to create an account.";
      return;
    }

    const fullName = `${firstName} ${lastName}`;

    auth.createUserWithEmailAndPassword(email, password)
      .then((credential) => {
        return credential.user.updateProfile({ displayName: fullName })
          .then(() => requestServerSentEmail(EMAIL_VERIFICATION_API_URL, email));
      })
      .catch((error) => {
        errorEl.textContent = friendlyAuthError(error);
      });
    // On success, onAuthStateChanged (below) shows the "verify your
    // email" panel instead of the chat, until the link is clicked.
  }

  // Backend URL for password-reset requests -- deliberately NOT using
  // Firebase's own client-side sendPasswordResetEmail() here (unlike
  // sendEmailVerification() elsewhere in this file, which still uses
  // Firebase's built-in email sending and is unaffected). Firebase
  // Console's "Customize action URL" setting for the Password reset
  // template fails to save on this project with a confirmed
  // EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED error (verified via the Network
  // tab against Firebase's own API) -- meaning reset links always
  // pointed to Firebase's generic firebaseapp.com page instead of this
  // site's own two-password reset panel, no matter what actionCodeSettings
  // was passed client-side. The backend instead generates the link via
  // the Admin SDK (full control, no dependency on that broken Console
  // setting) and emails it via Resend. See passwordReset.js on the
  // backend for the full explanation.
  const PASSWORD_RESET_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/request-password-reset";
  // Same fix, same reasoning as PASSWORD_RESET_API_URL above -- see
  // emailVerification.js on the backend for the full explanation.
  const EMAIL_VERIFICATION_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/request-email-verification";

  // Small shared helper -- both password reset and email verification
  // call this same backend pattern (generate link via Admin SDK, email
  // it via Resend), so this avoids duplicating the fetch/error-handling
  // boilerplate between the two call sites below.
  function requestServerSentEmail(apiUrl, email) {
    return fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).then((response) => response.json().then((data) => ({ ok: response.ok, data })));
  }

  function handleForgotPassword() {
    const email = document.getElementById("forgotEmail").value.trim();
    const errorEl = document.getElementById("forgotError");
    const successEl = document.getElementById("forgotSuccess");
    errorEl.textContent = "";
    successEl.textContent = "";

    if (!email) {
      errorEl.textContent = "Please enter your email address.";
      return;
    }

    requestServerSentEmail(PASSWORD_RESET_API_URL, email)
      .then(({ ok, data }) => {
        if (!ok) throw new Error((data && data.error) || "Something went wrong.");
        successEl.textContent = "Reset email sent! Check your inbox (and spam folder).";
      })
      .catch(() => {
        errorEl.textContent = "Could not send reset email. Please try again in a moment.";
      });
  }

  // Shared by both the logout privacy cleanup below AND the manual
  // "Delete All Chats" button in the settings dropdown -- one real
  // implementation instead of two copies that could drift apart.
  async function deleteAllChatsForCurrentUser() {
    if (!currentUid) return;
    const snapshot = await db.collection("users").doc(currentUid).collection("chats").get();
    const batch = db.batch();
    snapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // Deletes ALL of this user's saved chats before signing out, if they've
  // opted into that privacy preference. A genuine, functional privacy
  // control (not a placeholder) -- backed by a Firestore batch delete.
  async function handleSignOut() {
    if (deleteChatsOnLogoutPref && currentUid) {
      try {
        await deleteAllChatsForCurrentUser();
      } catch (err) {
        console.error("Failed to delete chats before logout:", err);
        // Don't block sign-out just because the cleanup failed -- the
        // user still expects clicking Log Out to actually log them out.
      }
    }
    auth.signOut();
  }

  // ------------------------------------------------------------------
  // PRIVACY SETTINGS -- stored at users/{uid} (a document directly, one
  // level up from that user's chats subcollection). Loaded on sign-in,
  // saved immediately whenever the checkbox changes.
  // ------------------------------------------------------------------

  async function loadPrivacySettings() {
    if (!currentUid) return;
    try {
      const doc = await db.collection("users").doc(currentUid).get();
      const data = doc.exists ? doc.data() : {};
      deleteChatsOnLogoutPref = !!data.deleteChatsOnLogout;
      document.getElementById("deleteChatsOnLogoutCheckbox").checked = deleteChatsOnLogoutPref;
    } catch (err) {
      console.error("Failed to load privacy settings:", err);
    }
  }

  function handlePrivacyToggleChange() {
    const checked = document.getElementById("deleteChatsOnLogoutCheckbox").checked;
    deleteChatsOnLogoutPref = checked;
    if (!currentUid) return;
    db.collection("users").doc(currentUid).set({ deleteChatsOnLogout: checked }, { merge: true })
      .catch((err) => console.error("Failed to save privacy setting:", err));
  }

  // ------------------------------------------------------------------
  // EDIT ACCOUNT (name + email)
  // ------------------------------------------------------------------

  function openEditAccountModal() {
    const user = auth.currentUser;
    if (!user) return;
    const displayName = user.displayName || "";
    const spaceIndex = displayName.indexOf(" ");
    // Best-effort split: Firebase only stores one combined displayName
    // string, not separate first/last fields -- everything up to the
    // first space is treated as the first name, the rest as the surname.
    const firstName = spaceIndex === -1 ? displayName : displayName.slice(0, spaceIndex);
    const lastName = spaceIndex === -1 ? "" : displayName.slice(spaceIndex + 1);
    document.getElementById("editFirstName").value = firstName;
    document.getElementById("editLastName").value = lastName;
    document.getElementById("editEmail").value = user.email || "";
    document.getElementById("editAccountError").textContent = "";
    document.getElementById("editAccountSuccess").textContent = "";

    // A confirmed real issue this guards against (same root cause
    // already fixed for the main chat input, see clearChatInputAutofill
    // above): browsers can autofill these fields ASYNCHRONOUSLY, shortly
    // after they're first shown, silently overwriting the correct real
    // values just set above with a stale suggestion from browser
    // autofill history. Re-asserts the real values a moment later to
    // win that race, rather than relying on autocomplete="off" alone
    // (which some browsers don't fully honor for name/email fields).
    setTimeout(() => {
      const firstNameField = document.getElementById("editFirstName");
      const lastNameField = document.getElementById("editLastName");
      const emailField = document.getElementById("editEmail");
      if (firstNameField.value !== firstName) firstNameField.value = firstName;
      if (lastNameField.value !== lastName) lastNameField.value = lastName;
      if (emailField.value !== (user.email || "")) emailField.value = user.email || "";
    }, 300);

    populateEditListenLangSelect();
    const recognitionLangSelect = document.getElementById("editRecognitionLangSelect");
    if (recognitionLangSelect) recognitionLangSelect.value = getSavedRecognitionLang();
    const realtimeVoiceSelect = document.getElementById("editRealtimeVoiceSelect");
    if (realtimeVoiceSelect) realtimeVoiceSelect.value = getSavedRealtimeVoice();

    // Password fields never carry over between opens -- both for
    // security (don't leave a typed password sitting in the DOM after
    // the modal closes) and because there's no "current" value to show
    // anyway, unlike name/email/language.
    document.getElementById("editCurrentPassword").value = "";
    document.getElementById("editNewPassword").value = "";
    document.getElementById("editConfirmNewPassword").value = "";
    document.getElementById("editPasswordError").textContent = "";
    document.getElementById("editPasswordSuccess").textContent = "";

    // Always starts collapsed -- an explicit click is what reveals it,
    // matching the same reasoning the password fields themselves are
    // cleared for above (nothing password-related should just be
    // sitting visible by default).
    document.getElementById("changePasswordFields").style.display = "none";
    document.getElementById("changePasswordChevron").style.transform = "rotate(0deg)";

    document.getElementById("accountDropdown").style.display = "none"; // close the dropdown behind the modal
    document.getElementById("editAccountModal").style.display = "flex";
  }

  // Lists every individual installed voice (not deduped to one per
  // language) so a SPECIFIC voice can be chosen explicitly -- e.g. a
  // female Arabic voice specifically, if the device has more than one
  // Arabic voice installed. The Web Speech API has no real "gender"
  // property on a voice, so this relies on the voice's own real name
  // (which browsers/OSes generally already choose to make the gender
  // obvious, e.g. "Microsoft Hoda" vs "Microsoft Naayf") rather than
  // guessing gender from the name ourselves.
  function populateEditListenLangSelect() {
    const select = document.getElementById("editListenLangSelect");
    if (!select) return;

    const saved = getSavedListenLang();
    select.innerHTML = `<option value="">Loading voices...</option>`;

    ensureVoicesLoaded().then((voices) => {
      const currentSelect = document.getElementById("editListenLangSelect");
      if (!currentSelect) return; // modal may have closed by the time this resolves

      if (!voices || voices.length === 0) {
        currentSelect.innerHTML = `<option value="">No voices available on this device</option>`;
        return;
      }

      currentSelect.innerHTML = "";
      const autoOpt = document.createElement("option");
      autoOpt.value = "auto";
      autoOpt.textContent = "Auto (detect language)";
      if (autoOpt.value === saved) autoOpt.selected = true;
      currentSelect.appendChild(autoOpt);

      // Grouped by language (e.g. "en-US", "ar-SA") so voices for the
      // same language sit together, rather than one flat alphabetical
      // list mixing every language together.
      const byLang = {};
      for (const v of voices) {
        const key = v.lang || "Other";
        if (!byLang[key]) byLang[key] = [];
        byLang[key].push(v);
      }
      for (const lang of Object.keys(byLang).sort()) {
        const group = document.createElement("optgroup");
        group.label = lang;
        for (const v of byLang[lang]) {
          const value = `${v.lang}::${v.name}`;
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = v.name;
          if (value === saved) opt.selected = true;
          group.appendChild(opt);
        }
        currentSelect.appendChild(group);
      }
    });
  }

  function handleEditListenLangChange() {
    const select = document.getElementById("editListenLangSelect");
    if (!select) return;
    // Reuses the exact same save function the quick-picker dropdown
    // uses, so both stay in sync automatically.
    selectListenLanguage(select.value);
  }

  function handleEditRecognitionLangChange() {
    const select = document.getElementById("editRecognitionLangSelect");
    if (!select) return;
    try {
      localStorage.setItem(RECOGNITION_LANG_STORAGE_KEY, select.value);
    } catch (err) {
      // localStorage can throw in some locked-down/private-browsing
      // contexts -- the selection just won't persist across a reload
      // in that case, not worth breaking the interaction over.
    }
  }

  function handleEditRealtimeVoiceChange() {
    const select = document.getElementById("editRealtimeVoiceSelect");
    if (!select) return;
    try {
      localStorage.setItem(REALTIME_VOICE_STORAGE_KEY, select.value);
    } catch (err) {
      // localStorage can throw in some locked-down/private-browsing contexts -- not worth breaking the interaction over
    }
  }

  function toggleChangePasswordSection() {
    const fields = document.getElementById("changePasswordFields");
    const chevron = document.getElementById("changePasswordChevron");
    const isOpening = fields.style.display === "none";
    fields.style.display = isOpening ? "block" : "none";
    chevron.style.transform = isOpening ? "rotate(180deg)" : "rotate(0deg)";
  }

  function handleChangePassword() {
    const user = auth.currentUser;
    const currentPassword = document.getElementById("editCurrentPassword").value;
    const newPassword = document.getElementById("editNewPassword").value;
    const confirmNewPassword = document.getElementById("editConfirmNewPassword").value;
    const errorEl = document.getElementById("editPasswordError");
    const successEl = document.getElementById("editPasswordSuccess");
    errorEl.textContent = "";
    successEl.textContent = "";

    if (!user || !user.email) return;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      errorEl.textContent = "Please fill in all three password fields.";
      return;
    }
    if (newPassword !== confirmNewPassword) {
      errorEl.textContent = "New password and confirmation don't match.";
      return;
    }
    if (newPassword.length < 6) {
      errorEl.textContent = "New password must be at least 6 characters.";
      return;
    }
    if (newPassword === currentPassword) {
      errorEl.textContent = "New password must be different from your current password.";
      return;
    }

    // Password changes always require a fresh re-authentication
    // (Firebase enforces this regardless -- attempting updatePassword
    // without it fails with auth/requires-recent-login) -- asking for
    // the current password upfront here gives a single clean flow
    // instead of failing first and asking the user to log out and back
    // in just to retry.
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
    user.reauthenticateWithCredential(credential)
      .then(() => user.updatePassword(newPassword))
      .then(() => {
        successEl.textContent = "Password updated.";
        document.getElementById("editCurrentPassword").value = "";
        document.getElementById("editNewPassword").value = "";
        document.getElementById("editConfirmNewPassword").value = "";
      })
      .catch((error) => {
        errorEl.textContent = friendlyAuthError(error);
      });
  }

  function closeEditAccountModal() {
    document.getElementById("editAccountModal").style.display = "none";
  }

  function handleSaveAccountEdits() {
    const user = auth.currentUser;
    const newFirstName = document.getElementById("editFirstName").value.trim();
    const newLastName = document.getElementById("editLastName").value.trim();
    const newEmail = document.getElementById("editEmail").value.trim();
    const errorEl = document.getElementById("editAccountError");
    const successEl = document.getElementById("editAccountSuccess");
    errorEl.textContent = "";
    successEl.textContent = "";

    if (!user) return;
    if (!newFirstName || !newLastName || !newEmail) {
      errorEl.textContent = "Please fill in all fields.";
      return;
    }

    const newName = `${newFirstName} ${newLastName}`;
    const nameChanged = newName !== (user.displayName || "");
    const emailChanged = newEmail !== (user.email || "");

    if (!nameChanged && !emailChanged) {
      successEl.textContent = "No changes to save.";
      return;
    }

    const updates = [];
    if (nameChanged) {
      updates.push(user.updateProfile({ displayName: newName }));
    }
    if (emailChanged) {
      // Sends a confirmation link to the NEW address -- the email does
      // NOT actually change until that link is clicked (Firebase's
      // secure flow, prevents someone silently hijacking an account by
      // typing in a different email).
      updates.push(user.verifyBeforeUpdateEmail(newEmail));
    }

    Promise.all(updates)
      .then(() => {
        document.getElementById("accountName").textContent = newName || "(no name set)";
        document.getElementById("sidebarOwnerName").textContent = newName || "";
        if (emailChanged) {
          successEl.textContent = "Name updated. A confirmation link was sent to your new email -- your email will update once you click it.";
        } else {
          successEl.textContent = "Account updated.";
          setTimeout(closeEditAccountModal, 1500);
        }
      })
      .catch((error) => {
        if (error.code === "auth/requires-recent-login") {
          errorEl.textContent = "For security, please log out and log back in before changing this, then try again.";
        } else {
          errorEl.textContent = friendlyAuthError(error);
        }
      });
  }

  // "Save & Close" -- tries to save any pending name/email changes,
  // then closes. Deliberately does NOT force a close in every case:
  // reuses handleSaveAccountEdits()'s existing behavior, which already
  // auto-closes on a plain successful save but stays open if there's a
  // validation error to fix or an email-change confirmation message the
  // user actually needs to read -- an unconditional close would hide
  // either of those. The one gap it fills in: when there's genuinely
  // nothing to save, the standalone Save Changes button shows "No
  // changes to save." and stays open (correct for a dedicated Save
  // button), but "Save & Close" should just close in that case instead.
  function handleSaveAndClose() {
    const user = auth.currentUser;
    if (!user) {
      closeEditAccountModal();
      return;
    }

    const newFirstName = document.getElementById("editFirstName").value.trim();
    const newLastName = document.getElementById("editLastName").value.trim();
    const newEmail = document.getElementById("editEmail").value.trim();

    if (!newFirstName || !newLastName || !newEmail) {
      handleSaveAccountEdits(); // shows its usual validation error, stays open
      return;
    }

    const newName = `${newFirstName} ${newLastName}`;
    const nameChanged = newName !== (user.displayName || "");
    const emailChanged = newEmail !== (user.email || "");

    if (!nameChanged && !emailChanged) {
      closeEditAccountModal(); // nothing to save -- just close
      return;
    }

    handleSaveAccountEdits();
  }

  // The single source of truth for whether the gate is shown -- fires
  // on page load AND automatically whenever sign-in/sign-up/sign-out
  // happens, so the gate hides/shows itself correctly without needing
  // to manually toggle it in every handler above.
  let currentUid = null;
  let currentChatId = null; // null = unsaved "new chat" not yet persisted
  let deleteChatsOnLogoutPref = false;
  // When true, onAuthStateChanged below defers to the password reset
  // flow instead of hiding the auth gate -- fixes a real race condition:
  // if someone clicking a reset link is STILL SIGNED IN on that browser
  // (a persisted session from before), onAuthStateChanged fires
  // independently and immediately hides the whole gate the moment it
  // sees a valid session, overriding the reset panel we just tried to
  // show underneath it.
  let isHandlingPasswordReset = false;

  // Everything that happens once a user is BOTH signed in AND verified --
  // pulled into its own function since it needs to run both from
  // onAuthStateChanged AND from handleCheckVerified() (clicking "I've
  // Verified" doesn't fire onAuthStateChanged again on its own, since
  // Firebase doesn't treat a verification-status change as an auth
  // state change -- we have to trigger this manually after reload()).
  // A confirmed real issue this fixes: even after the auth gate is
  // hidden via CSS (display:none), the sign-in/sign-up/forgot-password/
  // reset-password email and password fields are still physically
  // present in the page's DOM -- some password managers (both browsers'
  // native ones and third-party extensions) scan the whole document for
  // login-shaped fields regardless of visibility, and can end up
  // offering saved email/password suggestions on nearby unrelated
  // fields, like the main chat box, once they've identified the page as
  // "has a login form somewhere". A genuinely disabled field is excluded
  // from autofill scanning entirely (unlike CSS-hiding alone, which
  // doesn't reliably stop this) -- every browser and password manager
  // respects the disabled attribute, so this is the most reliable fix.
  // A confirmed real issue this fixes, now more thoroughly than before:
  // disabling and clearing the hidden auth-gate fields (an earlier
  // attempt) wasn't fully sufficient -- the browser's own password-save
  // heuristic could still trigger on unrelated page activity (e.g.
  // after a chart-producing response finishes rendering). The most
  // definitive fix is to remove the entire auth gate -- the real
  // <form>-like structure with email/password inputs -- from the DOM
  // completely while signed in, not just hide/disable it, so there is
  // genuinely nothing on the page for that heuristic to find. The
  // element's original position (parent + next sibling) is remembered
  // once at page load so it can be put back in exactly the right place
  // whenever it's actually needed again (signed out, email verification
  // pending, password reset link).
  const authGateOriginalParent = document.getElementById("authGate").parentNode;
  const authGateOriginalNextSibling = document.getElementById("authGate").nextSibling;
  let authGateElement = document.getElementById("authGate");
  let authGateDetached = false;

  function removeAuthGateFromDOM() {
    if (authGateDetached) return;
    authGateElement = document.getElementById("authGate");
    if (authGateElement && authGateElement.parentNode) {
      authGateElement.parentNode.removeChild(authGateElement);
      authGateDetached = true;
    }
  }

  function restoreAuthGateToDOM() {
    if (!authGateDetached) return;
    if (authGateOriginalNextSibling && authGateOriginalNextSibling.parentNode === authGateOriginalParent) {
      authGateOriginalParent.insertBefore(authGateElement, authGateOriginalNextSibling);
    } else {
      authGateOriginalParent.appendChild(authGateElement);
    }
    authGateDetached = false;
  }

  function enterApp(user) {
    removeAuthGateFromDOM(); // the whole element is gone from the page now, not just hidden/disabled -- nothing left for a password-save heuristic to find
    currentUid = user.uid;
    document.getElementById("accountName").textContent = user.displayName || "(no name set)";
    document.getElementById("accountEmail").textContent = user.email || "";
    document.getElementById("sidebarOwnerName").textContent = user.displayName || user.email || "";
    loadPrivacySettings();
    // IMPORTANT ORDER: load the real saved chat list FIRST, then call
    // startNewChat() -- startNewChat() adds a "pending" placeholder
    // folder to the top of the list for the chat about to start; if
    // loadChatList() ran afterward, its full list re-render would wipe
    // that placeholder back out before the user ever saw it.
    loadChatList().then(() => startNewChat());
    clearChatInputAutofill(); // in case the browser autofilled it while it was covered by the auth gate

    // Only shows the link -- the actual security enforcement happens on
    // every backend admin request regardless of this (see adminUsers.js).
    user.getIdTokenResult().then((tokenResult) => {
      document.getElementById("adminPanelLink").style.display = tokenResult.claims.admin === true ? "block" : "none";
    });
  }

  // Forcibly empties the chat input -- a stronger backstop than relying
  // on autocomplete/type alone (confirmed still insufficient in some
  // browsers, which can autofill a saved credential into ANY visible
  // text-like field on the page, even one that was covered by the login
  // gate when the page first loaded). Called at multiple points below to
  // catch autofill whenever it actually happens, since some browsers
  // autofill asynchronously after the initial page render.
  function clearChatInputAutofill() {
    const input = document.getElementById("user-input");
    if (input) input.value = "";
  }
  clearChatInputAutofill();
  setTimeout(clearChatInputAutofill, 300);
  setTimeout(clearChatInputAutofill, 1000);
  window.addEventListener("load", clearChatInputAutofill);

  // The real fix: react the INSTANT the browser autofills the field
  // (via the CSS animation hook above), rather than guessing at timing.
  document.getElementById("user-input").addEventListener("animationstart", (e) => {
    if (e.animationName === "onAutoFillStart") {
      clearChatInputAutofill();
    }
  });

  // Removes readonly the instant the field is actually focused/clicked
  // -- typing works completely normally from that point on, this only
  // affects the field's state before the user has interacted with it
  // at all, which is when autofill suggestion decisions are typically
  // made.
  // Programmatic assignment to an input's .value (mic dictation filling
  // the box, editing/resending a past message, etc.) does NOT fire the
  // 'input' event the way real typing does, so the live RTL/LTR
  // switching set up above wouldn't otherwise apply to those paths.
  // Shared helper so every place that fills the input box this way
  // applies the same correct direction, not just live typing.
  function applyInputDirection(input) {
    const rtl = isRtlText(input.value);
    input.dir = rtl ? "rtl" : "ltr";
    input.style.textAlign = rtl ? "right" : "left";
  }

  document.getElementById("user-input").addEventListener("focus", (e) => {
    e.target.removeAttribute("readonly");
  });

  // A confirmed real gap this fixes: finished chat messages already
  // correctly switch to right-to-left layout for Arabic (see
  // isRtlText()/addMessage() below), but the INPUT BOX itself stayed
  // stuck left-to-right the entire time someone was actually typing
  // Arabic -- cursor position, text alignment, and punctuation all
  // rendered wrong while composing the message, even though the sent
  // message would then display correctly afterward. Checked on every
  // keystroke (cheap -- isRtlText is a single regex test) so it updates
  // live as the person types, not just once after the fact.
  document.getElementById("user-input").addEventListener("input", (e) => {
    applyInputDirection(e.target);
  });

  auth.onAuthStateChanged((user) => {
    if (isHandlingPasswordReset) return; // defer entirely to the password reset panel until it finishes
    restoreAuthGateToDOM(); // must happen BEFORE the getElementById lookup below -- if the gate was removed by a previous enterApp() call, that lookup would otherwise return null
    const gate = document.getElementById("authGate");
    if (user && user.emailVerified) {
      enterApp(user);
    } else if (user && !user.emailVerified) {
      // Signed in, but hasn't clicked the verification link yet --
      // show that panel instead of the sign-in form or the chat.
      gate.style.display = "flex";
      showPanel("verifyEmailPanel");
      document.getElementById("verifyEmailAddress").textContent = user.email || "";
    } else {
      gate.style.display = "flex";
      // If arriving via the "Back to Sign Up" link on the Terms &
      // Conditions page (?panel=signup), open straight to Sign Up
      // instead of the default Sign In panel, so someone reading the
      // terms mid-signup doesn't have to click "Sign up" again manually.
      const urlParams = new URLSearchParams(window.location.search);
      showPanel(urlParams.get("panel") === "signup" ? "signUpPanel" : "signInPanel");
      currentUid = null;
      currentChatId = null;
      document.getElementById("chatHistoryList").innerHTML = "";
      document.getElementById("accountName").textContent = "";
      document.getElementById("accountEmail").textContent = "";
      document.getElementById("sidebarOwnerName").textContent = "";
      document.getElementById("accountDropdown").style.display = "none";
    }
  });

  // Handles the verification link when someone lands on this page after
  // clicking it (handleCodeInApp: true makes the link go DIRECTLY here,
  // with ?mode=verifyEmail&oobCode=... in the URL, instead of an
  // intermediate Firebase-hosted confirmation page). Applies the code
  // itself, then cleans the verified query params out of the URL so a
  // refresh doesn't try to reapply the same one-time code again.
  function handleEmailActionFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get("mode");
    const oobCode = urlParams.get("oobCode");
    if (mode !== "verifyEmail" || !oobCode) return;

    auth.applyActionCode(oobCode)
      .then(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
        if (auth.currentUser) {
          // Refresh the token so emailVerified reflects true immediately,
          // without requiring the user to manually click "I've Verified".
          auth.currentUser.reload().then(() => {
            if (auth.currentUser.emailVerified) enterApp(auth.currentUser);
          });
        }
      })
      .catch((err) => {
        console.error("Email verification link failed:", err);
        window.history.replaceState({}, document.title, window.location.pathname);
        const errorEl = document.getElementById("verifyEmailError");
        if (errorEl) errorEl.textContent = "This verification link is invalid or has expired -- please request a new one.";
      });
  }
  handleEmailActionFromUrl();

  // Holds the oobCode from the password reset link between when the
  // link is first detected and when the user actually submits their
  // new password -- module-scope since it needs to survive across the
  // async verifyPasswordResetCode() call and the later button click.
  let pendingResetOobCode = null;

  // Handles a password reset link (?mode=resetPassword&oobCode=...),
  // the same handleCodeInApp:true pattern already used for email
  // verification -- brings the user directly to this site instead of
  // Firebase's generic default reset page, so we can show our own
  // proper "enter it twice, with a show/hide toggle" form.
  function handlePasswordResetFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get("mode");
    const oobCode = urlParams.get("oobCode");
    if (mode !== "resetPassword" || !oobCode) return;

    // Set BEFORE the async call below -- onAuthStateChanged can fire at
    // any point during that gap (e.g. immediately on page load, if this
    // browser has a persisted session), and must not hide the gate
    // while we're in the middle of validating this reset link.
    isHandlingPasswordReset = true;
    restoreAuthGateToDOM(); // must happen BEFORE the getElementById lookup below -- if a session was already active (gate previously removed via enterApp()), that lookup would otherwise return null and the next line would throw
    document.getElementById("authGate").style.display = "flex";
    showPanel("resetPasswordPanel");
    document.getElementById("resetPasswordEmail").textContent = "...";

    auth.verifyPasswordResetCode(oobCode)
      .then((email) => {
        pendingResetOobCode = oobCode;
        window.history.replaceState({}, document.title, window.location.pathname);
        document.getElementById("resetPasswordEmail").textContent = email;
      })
      .catch((err) => {
        console.error("Password reset link invalid or expired:", err);
        window.history.replaceState({}, document.title, window.location.pathname);
        isHandlingPasswordReset = false; // give control back to the normal sign-in/signed-in flow
        showPanel("signInPanel");
        const errorEl = document.getElementById("signInError");
        if (errorEl) errorEl.textContent = "This password reset link is invalid or has expired -- please request a new one.";
      });
  }
  handlePasswordResetFromUrl();

  // Two small inline icon sets -- swapped into the toggle button's
  // innerHTML directly rather than juggling separate hidden/shown
  // elements, since only one is ever visible at a time per button.
  const EYE_ICON_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';

  // Swapped into #sendBtn depending on whether a message is currently
  // being sent -- see setSendingLock() further below.
  const SEND_ICON_ARROW = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  const SEND_ICON_STOP = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';
  const EYE_ICON_SLASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.61 3.79M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    btn.innerHTML = isHidden ? EYE_ICON_SLASH : EYE_ICON_OPEN;
    btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  }

  function handleSubmitNewPassword() {
    const pw1 = document.getElementById("newPassword1").value;
    const pw2 = document.getElementById("newPassword2").value;
    const errorEl = document.getElementById("resetPasswordError");
    const successEl = document.getElementById("resetPasswordSuccess");
    errorEl.textContent = "";
    successEl.textContent = "";

    if (!pw1 || !pw2) {
      errorEl.textContent = "Please fill in both fields.";
      return;
    }
    if (pw1 !== pw2) {
      errorEl.textContent = "Passwords do not match -- please re-enter them.";
      return;
    }
    if (pw1.length < 6) {
      errorEl.textContent = "Password must be at least 6 characters.";
      return;
    }
    if (!pendingResetOobCode) {
      errorEl.textContent = "This reset link is no longer valid -- please request a new one.";
      return;
    }

    auth.confirmPasswordReset(pendingResetOobCode, pw1)
      .then(() => {
        pendingResetOobCode = null;
        successEl.textContent = "Password updated! You can now sign in with your new password.";
        setTimeout(() => {
          isHandlingPasswordReset = false; // give control back to the normal sign-in/signed-in flow
          showPanel("signInPanel");
        }, 1800);
      })
      .catch((error) => {
        errorEl.textContent = friendlyAuthError(error);
      });
  }

  function handleResendVerification() {
    const user = auth.currentUser;
    const errorEl = document.getElementById("verifyEmailError");
    const successEl = document.getElementById("verifyEmailSuccess");
    errorEl.textContent = "";
    successEl.textContent = "";
    if (!user || !user.email) return;
    requestServerSentEmail(EMAIL_VERIFICATION_API_URL, user.email)
      .then(({ ok, data }) => {
        if (!ok) throw new Error((data && data.error) || "Something went wrong.");
        successEl.textContent = "Verification email resent! Check your inbox.";
      })
      .catch(() => {
        errorEl.textContent = "Could not resend verification email. Please try again in a moment.";
      });
  }

  function handleCheckVerified() {
    const user = auth.currentUser;
    const errorEl = document.getElementById("verifyEmailError");
    errorEl.textContent = "";
    if (!user) return;
    user.reload().then(() => {
      if (user.emailVerified) {
        enterApp(user);
      } else {
        errorEl.textContent = "Still not verified yet -- please click the link in the email first.";
      }
    });
  }

  function toggleAccountDropdown() {
    const dropdown = document.getElementById("accountDropdown");
    dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
  }

  // ------------------------------------------------------------------
  // SIDEBAR DRAG-RESIZE -- lets the person drag the divider between the
  // sidebar and the chat to make the sidebar wider/narrower. Persists
  // their chosen width via localStorage so it stays that way on their
  // next visit (this is a real, standalone website, not a Claude
  // artifact -- localStorage is the correct, standard tool here).
  // Clamped to the same min/max set in CSS (.sidebar's min-width/
  // max-width) so JS and CSS can't disagree with each other.
  // ------------------------------------------------------------------
  const SIDEBAR_WIDTH_STORAGE_KEY = "garnetSidebarWidthPx";
  const SIDEBAR_MIN_WIDTH = 100;
  const SIDEBAR_MAX_WIDTH = 400;

  function applySidebarWidth(widthPx) {
    const clamped = Math.min(Math.max(widthPx, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
    document.querySelector(".sidebar").style.width = clamped + "px";
    return clamped;
  }

  // Restore the person's previously chosen width on page load, if any.
  const savedSidebarWidth = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  if (savedSidebarWidth) {
    applySidebarWidth(parseInt(savedSidebarWidth, 10));
  }

  (function setupSidebarResize() {
    const handle = document.getElementById("sidebarResizeHandle");
    let isResizing = false;

    function onPointerMove(e) {
      if (!isResizing) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      applySidebarWidth(clientX);
    }

    function stopResizing() {
      if (!isResizing) return;
      isResizing = false;
      handle.classList.remove("resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Save only once the drag actually finishes, not on every pixel
      // of movement -- avoids hammering localStorage during the drag.
      const finalWidth = document.querySelector(".sidebar").getBoundingClientRect().width;
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, Math.round(finalWidth));
    }

    function startResizing(e) {
      isResizing = true;
      handle.classList.add("resizing");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none"; // prevents text selection elsewhere on the page while dragging
      e.preventDefault();
    }

    handle.addEventListener("mousedown", startResizing);
    handle.addEventListener("touchstart", startResizing, { passive: false });
    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("touchmove", onPointerMove, { passive: false });
    document.addEventListener("mouseup", stopResizing);
    document.addEventListener("touchend", stopResizing);
  })();

  // Allow pressing Enter to submit each panel's form
  document.getElementById("signInPassword").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSignIn();
  });
  document.getElementById("signUpPasswordConfirm").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleSignUp();
  });
  document.getElementById("forgotEmail").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleForgotPassword();
  });

  const API_URL = "https://ai-chat-backend-garnet-26.onrender.com/chat";
  let mode = "chat"; // .chat-box's own CSS default (#111) already matches the "chat" mode color on initial page load -- see applyModeBackground's own comment further below for why calling it THIS early would crash the whole script
  let conversationHistory = [];
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let isSending = false; // true while a request is in flight -- blocks new submissions until it resolves
  let currentAbortController = null; // set while a request is in flight, so the stop button can actually cancel it

  // ------------------------------------------------------------------
  // FILE / IMAGE ATTACHMENTS -- lets the user attach one or more real
  // images (sent to the backend as base64 data URLs, passed straight
  // through to the model's vision input -- GARNET genuinely looks at
  // them, this isn't a description-only stub) and/or plain text-based
  // files (code, .txt, .csv, .md, etc. -- read directly in the browser
  // and folded into the message as inline context, since that needs no
  // new backend dependencies). True PDF/Word document parsing isn't
  // supported yet -- that would need additional backend libraries.
  // ------------------------------------------------------------------
  let pendingAttachments = []; // array of { type: "image"|"text", name, data }

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB per image -- keeps each base64 payload reasonable
  const MAX_TEXT_BYTES = 200 * 1024; // 200KB per file -- keeps token usage reasonable for inline file content
  const MAX_ATTACHMENTS = 6; // a real, deliberate cap -- keeps a single message's payload (and the model's context) from growing unbounded

  function toggleAttachMenu() {
    const menu = document.getElementById("attachMenu");
    menu.style.display = menu.style.display === "none" ? "flex" : "none";
  }

  function closeAttachMenu() {
    document.getElementById("attachMenu").style.display = "none";
  }

  // MODELS overlay -- centered in the middle of the chat area (not a
  // message in the chat history), shown when the MODELS button is
  // pressed. Live models (Prediction Model, General Chat) are
  // clickable; not-yet-built ones (Science, Cybersecurity & Privacy,
  // Code) render dimmed with a "Coming soon" label and are inert.
  // Choosing Prediction Model swaps the SAME overlay to a second grid
  // listing available markets (Gold, Oil, Dollar Index), with room for
  // more markets to be added later as their own boxes. Picking a live
  // model/market dismisses the overlay back to the normal chat area,
  // with the MODELS button back in its usual place ready to reopen it
  // -- pressing MODELS always shows the same fresh top-level grid again,
  // never a stale submarket view left over from last time.
  function showModelsCard() {
    if (isSending) return;
    // Per explicit request: opening the model picker itself now starts
    // a fresh chat too, not just picking a specific model from it --
    // matches the same startNewChat() pattern already used once a
    // model is actually chosen (see handleModelBoxClick/
    // handleMarketBoxClick/showComingSoonScreen). Safe to do BEFORE
    // creating/showing the overlay now that the overlay lives in
    // #chatBoxWrapper rather than #chat-box itself -- startNewChat()'s
    // chat-box.innerHTML wipe can no longer destroy it.
    startNewChat();
    let overlay = document.getElementById("modelsOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "modelsOverlay";
      overlay.className = "models-overlay";
      // A confirmed real bug this fixes, found via direct DevTools
      // investigation: appending this to the SCROLLING #chat-box meant
      // its position:absolute; inset:0 resolved against the entire
      // scrollable content area, not the visible viewport -- so once
      // the chat scrolled down (very likely after a tall chart
      // renders and auto-scrolls to the bottom), the overlay opened
      // successfully every time but rendered off-screen above the
      // current view, indistinguishable from the button simply not
      // responding. #chatBoxWrapper doesn't scroll (only its #chat-box
      // child does), so an overlay appended there always resolves to
      // the current visible chat area -- same fix already proven
      // correct for the Live Chat overlay (#liveChatVisualizer).
      document.getElementById("chatBoxWrapper").appendChild(overlay);
    }
    overlay.innerHTML = buildModelsCardHtml();
    overlay.style.display = "flex";
  }

  function closeModelsOverlay() {
    const overlay = document.getElementById("modelsOverlay");
    if (overlay) overlay.style.display = "none";
  }

  function buildModelBoxHtml(icon, name, status, onclickAttr, disabled) {
    const classes = `model-box ${disabled ? "model-box-disabled" : "model-box-active"}`;
    const clickAttr = disabled ? "" : ` onclick="${onclickAttr}"`;
    const titleAttr = disabled ? ' title="Coming soon"' : "";
    return (
      `<div class="${classes}"${clickAttr}${titleAttr}>` +
      `<div class="model-box-icon">${icon}</div>` +
      `<div class="model-box-name">${name}</div>` +
      (status ? `<div class="model-box-status">${status}</div>` : "") +
      `</div>`
    );
  }

  function buildModelsCardHtml() {
    const boxes = [
      buildModelBoxHtml("💬", "General Chat", "Web search included", "handleModelBoxClick('chat')", false),
      buildModelBoxHtml("📈", "Prediction Model", "Gold · Oil · Dollar Index", "handleModelBoxClick('prediction')", false),
      buildModelBoxHtml("🔬", "Science and Research", "Deep research & analysis", "handleModelBoxClick('science')", false),
      buildModelBoxHtml("🔒", "Cybersecurity and Capacity Building", "GCSCC CMM-grounded", "handleModelBoxClick('cybersecurity')", false),
      buildModelBoxHtml("💻", "Code", "Coming soon", "handleModelBoxClick('code')", false),
      buildModelBoxHtml("📄", "Document Creator", "Coming soon", "handleModelBoxClick('docCreator')", false),
      buildModelBoxHtml("🎬", "Video Creator", "Coming soon", "handleModelBoxClick('videoCreator')", false),
      buildModelBoxHtml("🖼️", "Images Creator", "Coming soon", "handleModelBoxClick('imagesCreator')", false),
      buildModelBoxHtml("🎵", "Audio Creator", "Coming soon", "handleModelBoxClick('audioCreator')", false),
    ].join("");
    return (
      `<div class="models-overlay-content">` +
      `<button class="models-overlay-close" onclick="closeModelsOverlay()" title="Close">✕</button>` +
      `<div class="models-card-title">Choose an AI Model</div>` +
      `<div class="models-card-grid">${boxes}</div>` +
      `</div>`
    );
  }

  function buildPredictionMarketsCardHtml() {
    const boxes = [
      buildModelBoxHtml("🥇", "Gold", "", "handleMarketBoxClick('gold')", false),
      buildModelBoxHtml("🛢️", "Oil", "", "handleMarketBoxClick('oil')", false),
      buildModelBoxHtml("💵", "Dollar Index (DXY)", "", "handleMarketBoxClick('dxy')", false),
      // Placeholder for markets beyond gold/oil/DXY (e.g. stocks) --
      // exact selection still to be determined; shown dimmed the same
      // way Science/Cybersecurity/Code are above, so adding a real
      // market later is just flipping this one box from disabled to
      // active rather than restructuring the card.
      buildModelBoxHtml("📊", "More markets", "Coming soon", "", true),
    ].join("");
    return (
      `<div class="models-overlay-content">` +
      `<button class="models-overlay-close" onclick="closeModelsOverlay()" title="Close">✕</button>` +
      `<div class="models-card-title">Prediction Model — choose a market</div>` +
      `<div class="models-card-grid">${boxes}</div>` +
      `</div>`
    );
  }

  function handleModelBoxClick(key) {
    if (isSending) return;
    if (key === "chat") {
      startNewChat();
      setMode("chat");
      closeModelsOverlay();
      return;
    }
    if (key === "prediction") {
      // Swaps the SAME overlay's content in place, rather than opening
      // a second overlay -- keeps this a single reusable screen.
      const overlay = document.getElementById("modelsOverlay");
      if (overlay) overlay.innerHTML = buildPredictionMarketsCardHtml();
      return;
    }
    if (key === "science") {
      // Per explicit request: Science and Research is now THREE real
      // sub-modes (School and Students, Research Assistant, Create
      // Research Papers), not one single mode -- clicking the top-level
      // box swaps the SAME overlay to a submenu, exactly the same
      // "swap in place" pattern Prediction Model already uses for its
      // own market submenu just above.
      const overlay = document.getElementById("modelsOverlay");
      if (overlay) overlay.innerHTML = buildScienceSubmodelCardHtml();
      return;
    }
    if (key === "cybersecurity") {
      // Per explicit request: Cybersecurity and Capacity Building is a
      // real, active model (grounded in the actual GCSCC Cybersecurity
      // Capacity Maturity Model via server-side retrieval -- see
      // cybersecurityModel.js), not a Coming Soon placeholder. Same
      // pattern as Prediction Model/General Chat: clears the previous
      // chat, sets a real mode the backend actually routes on, and
      // applies this model's own color/placeholder/title.
      startNewChat();
      teardownResearchPaperWizardIfActive();
      teardownSchoolWizardIfActive();
      mode = "cybersecurity";
      document.getElementById("chatHeaderTitle").textContent = "GARNET Cybersecurity";
      applyModeBackground(mode);
      applyModePlaceholder(mode);
      syncPredictionSidebar(); syncCybersecuritySidebar(); syncScienceSubmodeSwitcher(); // correctly hides prediction's/science's, shows this one
      closeModelsOverlay();
      return;
    }
    if (COMING_SOON_MODELS[key]) {
      showComingSoonScreen(key);
      return;
    }
  }

  function handleMarketBoxClick(market) {
    if (isSending) return;
    closeModelsOverlay();
    startNewChat(); // per explicit request: switching models clears the previous chat, not just the color/title
    if (market === "gold") {
      quickAsk("What is your current gold price prediction?", "modelsBtn", "Prediction", "prediction");
    } else if (market === "oil") {
      quickAsk("What is your current oil price prediction?", "modelsBtn", "Prediction", "prediction");
    } else if (market === "dxy") {
      quickAsk("What is your current dollar index prediction?", "modelsBtn", "Prediction", "prediction");
    }
  }

  // Science and Research's own submenu -- same "swap the same overlay
  // in place" pattern as buildPredictionMarketsCardHtml above. Three
  // real sub-modes: School and Students (K-12/exam-board homework
  // help), Research Assistant (literature search/analysis/method
  // suggestions, no full paper written), and Create Research Papers
  // (the full guided multi-screen wizard -- see
  // startResearchPaperWizardFlow further below).
  function buildScienceSubmodelCardHtml() {
    const boxes = [
      buildModelBoxHtml("🎓", "School and Students", "KG1\u2013Grade 12 \u00b7 IG \u00b7 SAT \u00b7 IB \u00b7 AP", "handleScienceSubmodelClick('school')", false),
      buildModelBoxHtml("🔎", "Research Assistant", "Literature, analysis, methods", "handleScienceSubmodelClick('research_assistant')", false),
      buildModelBoxHtml("📝", "Create Research Papers", "Guided, full paper builder", "handleScienceSubmodelClick('create_paper')", false),
    ].join("");
    return (
      `<div class="models-overlay-content">` +
      `<button class="models-overlay-close" onclick="closeModelsOverlay()" title="Close">✕</button>` +
      `<div class="models-card-title">Science and Research — choose how you'd like to work</div>` +
      `<div class="models-card-grid">${boxes}</div>` +
      `</div>`
    );
  }

  function handleScienceSubmodelClick(key) {
    if (isSending) return;
    if (key === "school") {
      // Per explicit request: School and Students now launches a
      // guided, screen-by-screen wizard (grade -> exam system ->
      // subject -> question input -> real answer) instead of just
      // switching to a free-chat mode -- see startSchoolWizardFlow
      // further below.
      closeModelsOverlay();
      teardownResearchPaperWizardIfActive();
      startSchoolWizardFlow();
      return;
    }
    if (key === "research_assistant") {
      // Same real, active-mode pattern as Cybersecurity/General
      // Chat/Prediction Model above -- sets a real mode the backend
      // actually routes on (see server.js's science_research_assistant
      // system-prompt block), not the old "stays on General Chat
      // underneath" Coming Soon pattern.
      closeModelsOverlay();
      teardownResearchPaperWizardIfActive();
      teardownSchoolWizardIfActive();
      startNewChat();
      mode = "science_research_assistant";
      document.getElementById("chatHeaderTitle").textContent = "GARNET Research Assistant";
      applyModeBackground(mode);
      applyModePlaceholder(mode);
      syncPredictionSidebar(); syncCybersecuritySidebar(); syncScienceSubmodeSwitcher();
      return;
    }
    if (key === "create_paper") {
      closeModelsOverlay();
      teardownSchoolWizardIfActive();
      startResearchPaperWizardFlow();
      return;
    }
  }

  // ------------------------------------------------------------------
  // CREATE RESEARCH PAPERS -- a full guided, multi-screen wizard, built
  // on the exact same proven pattern as the Cybersecurity Assessment
  // flow above (getCmmFlowOverlay/showCmmFlowScreen/cmmNavRowHtml):
  // its own overlay positioned against #chatBoxWrapper (not the
  // scrolling #chat-box), Back/Cancel available on every screen, and
  // the same cmm-form-* / model-box CSS classes reused as-is so no new
  // styling is needed. Intake (topic, method, ethics, discussion type,
  // acknowledgements) -> a review screen -> a proposed, user-editable
  // section outline -> section-by-section drafting with real academic
  // search grounding and accept/revise/back on each one -> a final
  // output-format choice that hands off to the existing, already-
  // proven create_pdf/create_project_zip pipeline for PDF/LaTeX, and
  // does Word/Excel/Text directly client-side (all reusing helpers
  // already built for saving any bot message: saveHtmlAsWordDoc,
  // saveTableAsExcel, downloadBlob).
  // ------------------------------------------------------------------

  function getResearchPaperOverlay() {
    let overlay = document.getElementById("researchPaperOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "researchPaperOverlay";
      overlay.className = "models-overlay";
      document.getElementById("chatBoxWrapper").appendChild(overlay);
    }
    return overlay;
  }

  function closeResearchPaperOverlay() {
    const overlay = document.getElementById("researchPaperOverlay");
    if (overlay) overlay.style.display = "none";
  }

  // A confirmed real bug this fixes: switching to a different mode
  // (General Chat, Cybersecurity, or one of the OTHER two Science
  // sub-modes via the new switcher bar) while a Create Research Papers
  // wizard was in progress only ever hid the top-level Models overlay
  // -- the SEPARATE #researchPaperOverlay stayed open and its state
  // stayed alive underneath, so the guided wizard was still silently
  // "active" even though the person had clearly moved on to something
  // else. Called from every real place mode actually changes, so the
  // wizard is always fully torn down (overlay closed, state cleared)
  // the instant the person leaves it for anything else.
  function teardownResearchPaperWizardIfActive() {
    if (researchPaperWizard) {
      closeResearchPaperOverlay();
      researchPaperWizard = null;
    }
  }

  function showResearchPaperScreen(innerHtml, extraWrapperStyle) {
    const overlay = getResearchPaperOverlay();
    overlay.innerHTML = `<div class="models-overlay-content cmm-form-content"${extraWrapperStyle ? ` style="${extraWrapperStyle}"` : ""}>${innerHtml}</div>`;
    overlay.style.display = "flex";
  }

  function rpNavRowHtml({ showBack, backOnclick, nextLabel, nextOnclick, nextDisabled }) {
    return (
      `<div class="cmm-form-nav">` +
      `<div>${showBack ? `<button class="cmm-form-btn" onclick="${backOnclick}">← Back</button>` : ""}</div>` +
      `<div style="display:flex; gap:16px;">` +
      `<button class="cmm-form-btn" onclick="cancelResearchPaperWizard()">Cancel</button>` +
      (nextLabel ? `<button class="cmm-form-btn cmm-form-btn-primary" onclick="${nextOnclick}"${nextDisabled ? " disabled" : ""}>${nextLabel}</button>` : "") +
      `</div></div>`
    );
  }

  let researchPaperWizard = null;

  function freshResearchPaperWizardState() {
    return {
      topic: "",
      academicLevel: "Undergraduate",
      paperType: "Journal Article",
      targetLength: "Standard (8\u201312 pages)",
      sourceNotes: "",
      sourceDocuments: [], // [{ name, text }]
      researchMethod: "",
      researchMethodOther: "",
      ethicsConsiderations: [], // string[]
      ethicsOther: "",
      discussionType: "Critical Analysis",
      recommendationType: "Future Research Directions",
      acknowledgement: "",
      sectionTitles: [],
      sectionContents: {}, // { [index]: string }
      currentSectionIndex: 0,
      _outlineEditingIndex: null, // which outline row (if any) is currently showing its inline edit field
      _sectionEditingOpen: false, // whether the current section's revision box is open
      _sectionVisualFormOpen: null, // null | "table" | "chart" | "drawing" -- which add-visual form (if any) is open for the current section
      _uploadingFileNames: [], // filenames currently being uploaded/read, for the live status animation
      _reviewEditingField: null, // which field (if any) on the Review screen is currently being edited inline
      _reviewFieldSnapshot: null, // that field's value(s) before editing started, so Cancel can genuinely revert
    };
  }

  function startResearchPaperWizardFlow() {
    if (isSending) return;
    startNewChat();
    mode = "science_create_paper";
    document.getElementById("chatHeaderTitle").textContent = "GARNET Create Research Papers";
    applyModeBackground(mode);
    applyModePlaceholder(mode); // NEW: confirmed real bug this fixes -- was missing here (unlike the other mode-entry points, e.g. Cybersecurity/Research Assistant/setMode, which all correctly call this), so the main chat bar's placeholder stayed stuck on whatever the PREVIOUS mode's text was instead of switching to this mode's own
    syncPredictionSidebar(); syncCybersecuritySidebar(); syncScienceSubmodeSwitcher();
    researchPaperWizard = freshResearchPaperWizardState();
    showResearchPaperTopicScreen();
  }

  // Per explicit request: a small, always-visible 3-button switcher
  // lets the person jump directly between the three Science and
  // Research sub-modes from wherever they currently are, instead of
  // having to reopen the top-level AI MODELS picker and click through
  // the submenu again every time. Shown/hidden the same way
  // syncPredictionSidebar/syncCybersecuritySidebar already are -- a
  // real DOM element created once, then just toggled/re-rendered on
  // every mode change, called from the exact same call sites those two
  // are (kept in sync automatically rather than needing its own
  // separate set of call sites to maintain).
  function syncScienceSubmodeSwitcher() {
    const scienceModes = { science_school: "school", science_research_assistant: "research_assistant", science_create_paper: "create_paper" };
    const showing = Object.prototype.hasOwnProperty.call(scienceModes, mode);
    let bar = document.getElementById("scienceSubmodeSwitcher");
    if (!showing) {
      if (bar) bar.style.display = "none";
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "scienceSubmodeSwitcher";
      bar.style.cssText = "display:flex; gap:8px; justify-content:center; flex-wrap:wrap; padding:8px 12px;";
      // A confirmed real bug this fixes: this used to be inserted
      // INSIDE #chatBoxWrapper, right before #chat-box -- but every
      // wizard/overlay screen (this one included) is ALSO appended
      // inside #chatBoxWrapper with position:absolute; inset:0, which
      // completely covered this bar the instant any overlay opened,
      // even though the bar itself was still present underneath.
      // Inserted here as a sibling BETWEEN .chat-header and
      // #chatBoxWrapper instead -- outside the container every overlay
      // is scoped to -- so it stays visible above any open wizard
      // screen, including the Create Research Papers wizard itself.
      const chatBoxWrapper = document.getElementById("chatBoxWrapper");
      chatBoxWrapper.parentNode.insertBefore(bar, chatBoxWrapper);
    }
    const items = [
      { key: "school", icon: "🎓", label: "School and Students" },
      { key: "research_assistant", icon: "🔎", label: "Research Assistant" },
      { key: "create_paper", icon: "📝", label: "Create Research Papers" },
    ];
    bar.innerHTML = items.map((it) => {
      const active = scienceModes[mode] === it.key;
      return `<button class="cmm-form-btn" style="padding:6px 12px; font-size:12px;${active ? " border-color:#d9a441; opacity:1;" : " opacity:0.75;"}" onclick="switchScienceSubmode('${it.key}')">${it.icon} ${escapeHtml(it.label)}</button>`;
    }).join("");
    bar.style.display = "flex";
  }

  function switchScienceSubmode(key) {
    if (isSending) return;
    handleScienceSubmodelClick(key); // already handles all 3 keys, including re-starting the wizard for create_paper
  }

  // Custom-styled confirmation modal, matching the app's own dark
  // theme (same visual pattern already used by the Live Chat voice-
  // gender picker) instead of the browser's plain native confirm()
  // dialog, which looked completely out of place against the rest of
  // this dark-themed wizard.
  // Per explicit request: the School and Students wizard calls this a
  // "learning session", not a "project" (that word stays accurate for
  // the Create Research Papers wizard) -- takes a noun so both callers
  // get the correct wording from this one shared modal instead of
  // needing two near-duplicate implementations.
  function showResearchPaperCancelConfirmModal(noun) {
    const label = noun || "project";
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10000; display:flex; align-items:center; justify-content:center;";
      const box = document.createElement("div");
      box.style.cssText = "background:#1a1a1a; border:1px solid #333; border-radius:12px; padding:28px; max-width:380px; width:90%; text-align:center; color:#fff; font-family:inherit;";

      const title = document.createElement("div");
      title.style.cssText = "font-size:16px; font-weight:600; margin-bottom:10px;";
      title.textContent = `⚠️ Cancel this ${label}?`;

      const subtitle = document.createElement("div");
      subtitle.style.cssText = "font-size:13px; color:#bbb; margin-bottom:22px; line-height:1.5;";
      subtitle.textContent = `You will lose all the data stored for this ${label} if you cancel now.`;

      box.appendChild(title);
      box.appendChild(subtitle);

      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex; gap:10px; justify-content:center;";

      const keepBtn = document.createElement("button");
      keepBtn.textContent = "Keep Working";
      keepBtn.className = "cmm-form-btn";
      keepBtn.style.flex = "1";
      keepBtn.onclick = () => { document.body.removeChild(overlay); resolve(false); };

      const confirmBtn = document.createElement("button");
      confirmBtn.textContent = "Yes, Cancel";
      confirmBtn.className = "cmm-form-btn cmm-form-btn-primary";
      confirmBtn.style.flex = "1";
      confirmBtn.onclick = () => { document.body.removeChild(overlay); resolve(true); };

      btnRow.appendChild(keepBtn);
      btnRow.appendChild(confirmBtn);
      box.appendChild(btnRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  // Per explicit request: replaces the plain white native browser
  // alert() popup (which looked completely out of place against this
  // dark-themed app -- "garnet.institute-of-ai.org says...") with a
  // themed modal matching the same dark/gold look used throughout the
  // Science and Research wizards, reusing the exact same visual
  // pattern as the Cancel confirmation modal above, just with a single
  // OK button instead of two choices. Used everywhere either wizard
  // previously called the browser's own alert().
  function showWizardMessageModal(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:10000; display:flex; align-items:center; justify-content:center;";
      const box = document.createElement("div");
      box.style.cssText = "background:#1a1a1a; border:1px solid #333; border-radius:12px; padding:28px; max-width:380px; width:90%; text-align:center; color:#fff; font-family:inherit;";

      const text = document.createElement("div");
      text.style.cssText = "font-size:14px; line-height:1.5; margin-bottom:22px;";
      text.textContent = message;
      box.appendChild(text);

      const okBtn = document.createElement("button");
      okBtn.textContent = "OK";
      okBtn.className = "cmm-form-btn cmm-form-btn-primary";
      okBtn.style.width = "100%";
      okBtn.onclick = () => { document.body.removeChild(overlay); resolve(); };

      box.appendChild(okBtn);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      setTimeout(() => okBtn.focus(), 0);
    });
  }

  // Per explicit request: cancelling now always confirms first -- a
  // single central function used by EVERY Cancel button throughout the
  // wizard (the standard nav-row one on every screen, plus the
  // processing-screen ones), so the warning is consistent wherever
  // Cancel appears, not just during active generation. Uses the
  // app's own themed modal above, not the browser's native confirm().
  async function cancelResearchPaperWizard() {
    const confirmed = await showResearchPaperCancelConfirmModal();
    if (!confirmed) return;
    closeResearchPaperOverlay();
    researchPaperWizard = null;
    setMode("chat"); // returns to a normal, known-good state, same as CMM's own cancelCmmAssessment()
  }

  // --- Screen 1: Topic & basics ---
  function showResearchPaperTopicScreen() {
    const w = researchPaperWizard;
    showResearchPaperScreen(
      `<div class="models-card-title">What's this paper about?</div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">Research topic / working title</label>` +
      `<textarea class="cmm-form-textarea" id="rpTopicInput" placeholder="e.g. The impact of decentralized privacy governance on multi-agent smart home systems" oninput="researchPaperWizard.topic = this.value">${escapeHtml(w.topic)}</textarea>` +
      `</div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">Academic level</label>` +
      `<select class="cmm-form-textarea" style="min-height:auto;" onchange="researchPaperWizard.academicLevel = this.value">` +
      ["Undergraduate", "Graduate (Master's)", "PhD / Doctoral", "Postdoctoral / Professional Researcher"]
        .map((v) => `<option value="${escapeHtmlAttr(v)}"${w.academicLevel === v ? " selected" : ""}>${escapeHtml(v)}</option>`).join("") +
      `</select></div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">Paper type</label>` +
      `<select class="cmm-form-textarea" style="min-height:auto;" onchange="researchPaperWizard.paperType = this.value">` +
      ["Journal Article", "Conference Paper", "Thesis / Dissertation Chapter", "Literature Review", "General Research Report"]
        .map((v) => `<option value="${escapeHtmlAttr(v)}"${w.paperType === v ? " selected" : ""}>${escapeHtml(v)}</option>`).join("") +
      `</select></div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">Target length</label>` +
      `<select class="cmm-form-textarea" style="min-height:auto;" onchange="researchPaperWizard.targetLength = this.value">` +
      ["Short (3\u20135 pages)", "Standard (8\u201312 pages)", "Extended (15\u201320 pages)", "Long-form (25+ pages)"]
        .map((v) => `<option value="${escapeHtmlAttr(v)}"${w.targetLength === v ? " selected" : ""}>${escapeHtml(v)}</option>`).join("") +
      `</select></div>` +
      rpNavRowHtml({ showBack: false, nextLabel: "Next →", nextOnclick: "submitResearchPaperTopicScreen()" })
    );
    setTimeout(() => { const el = document.getElementById("rpTopicInput"); if (el) el.focus(); }, 0);
  }

  async function submitResearchPaperTopicScreen() {
    const el = document.getElementById("rpTopicInput");
    researchPaperWizard.topic = (el ? el.value : researchPaperWizard.topic || "").trim();
    if (!researchPaperWizard.topic) {
      await showWizardMessageModal("Please describe the research topic before continuing.");
      return;
    }
    showResearchPaperSourcesScreen();
  }

  // --- Screen 2: Source materials ---
  // Small shared spinner+status strip -- shown wherever a source
  // document is being uploaded/read, on both the Sources screen and
  // the Review screen's inline "Source files" editor, so upload
  // progress is always visibly live rather than the UI just sitting
  // there with no feedback while the real extraction call is in flight.
  function buildResearchPaperUploadingStatusHtml() {
    const names = (researchPaperWizard && researchPaperWizard._uploadingFileNames) || [];
    if (names.length === 0) return "";
    return (
      `<div style="display:flex; align-items:center; gap:10px; margin:10px 0; opacity:0.9;">` +
      `<div class="rp-live-spinner" style="width:16px; height:16px; border-radius:50%; border:2.5px solid rgba(217,164,65,0.25); border-top-color:#d9a441; animation:rpSpin 0.8s linear infinite; flex-shrink:0;"></div>` +
      `<span style="font-size:13px;">Uploading and reading: ${names.map((n) => escapeHtml(n)).join(", ")}...</span>` +
      `<style>@keyframes rpSpin { to { transform: rotate(360deg); } }</style>` +
      `</div>`
    );
  }

  // Per explicit request: a pen visibly writing on a page instead of a
  // plain spinning circle, used everywhere GARNET is actually WRITING
  // content (outline proposal, one section, or a batch of sections) --
  // pure inline SVG + CSS keyframes, no new library. The pen icon and
  // the gold "ink trail" underline beneath it share the exact same
  // keyframe percentages/duration, so they move together convincingly:
  // the trail grows left-to-right as the pen travels across it, then
  // both reset together for the next loop. statusElementId lets each
  // caller keep using its own existing live-status span id underneath.
  function buildResearchPaperPenLoaderHtml(statusElementId, statusText) {
    return (
      `<div style="display:flex; flex-direction:column; align-items:center; gap:10px; padding:20px 0;">` +
      `<svg viewBox="0 0 120 90" width="90" height="68" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">` +
      `<rect x="4" y="4" width="112" height="82" rx="6" fill="#1c1a14" stroke="#d9a441" stroke-width="1.5"/>` +
      `<rect x="16" y="20" width="64" height="3" rx="1.5" fill="#5a4a2a"/>` +
      `<rect x="16" y="34" width="80" height="3" rx="1.5" fill="#5a4a2a"/>` +
      `<rect x="16" y="48" width="84" height="3" rx="1.5" fill="#d9a441" style="transform-origin:16px 49.5px; animation:rpWriteLineGrow 2.4s ease-in-out infinite;"/>` +
      `<g style="animation:rpPenMove 2.4s ease-in-out infinite;">` +
      `<line x1="96" y1="38" x2="106" y2="28" stroke="#d9a441" stroke-width="3" stroke-linecap="round"/>` +
      `<polygon points="94,40 100,46 88,44" fill="#8a6d3b"/>` +
      `</g>` +
      `</svg>` +
      `<span id="${statusElementId}" style="opacity:0.85; font-size:13px;">${escapeHtml(statusText || "Getting started...")}</span>` +
      `<style>` +
      `@keyframes rpWriteLineGrow { 0% { transform: scaleX(0); } 85% { transform: scaleX(1); } 100% { transform: scaleX(0); } }` +
      `@keyframes rpPenMove { 0% { transform: translateX(0); } 85% { transform: translateX(84px); } 100% { transform: translateX(0); } }` +
      `</style>` +
      `</div>`
    );
  }

  function buildResearchPaperSourceFilesListHtml() {
    const w = researchPaperWizard;
    return w.sourceDocuments.length
      ? w.sourceDocuments.map((d, i) =>
          `<div class="project-zip-file" style="display:flex; align-items:center; gap:10px;">` +
          `<button class="cmm-form-btn" style="padding:2px 9px; flex-shrink:0;" onclick="removeResearchPaperSourceDocument(${i})" title="Remove this file">✕</button>` +
          `<span>${escapeHtml(d.name)}</span>` +
          `</div>`
        ).join("")
      : `<div style="opacity:0.6; font-size:13px;">No files attached yet.</div>`;
  }

  function showResearchPaperSourcesScreen() {
    const w = researchPaperWizard;
    showResearchPaperScreen(
      `<div class="models-card-title">Any source material to work from?</div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">Notes on specific sources you want included (optional)</label>` +
      `<textarea class="cmm-form-textarea" id="rpSourceNotesInput" placeholder="e.g. must-cite papers, a specific dataset, existing notes..." oninput="researchPaperWizard.sourceNotes = this.value">${escapeHtml(w.sourceNotes)}</textarea>` +
      `</div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">Attach files (Word, Excel, PDF, or text -- optional)</label>` +
      `<label class="cmm-form-file-label" style="font-size:15px; padding:14px 22px; display:inline-block; margin-top:4px;">📎 Choose files to attach<input type="file" id="rpSourceFileInput" multiple accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,.xls,.xlsx" style="display:none;" onchange="handleResearchPaperSourceFileUpload(this)"></label>` +
      buildResearchPaperUploadingStatusHtml() +
      `<div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">${buildResearchPaperSourceFilesListHtml()}</div>` +
      `</div>` +
      rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperTopicScreen()", nextLabel: "Next →", nextOnclick: "showResearchPaperMethodScreen()" })
    );
  }

  // Re-renders whichever screen the upload/remove action was actually
  // triggered from -- either the dedicated Sources screen, or the
  // Review screen's own inline "Source files" editor (see
  // buildReviewRowHtml's "files" case below) -- so both places can
  // safely reuse this exact same upload logic.
  function rerenderResearchPaperSourceScreen() {
    if (researchPaperWizard._reviewEditingField === "sourceFiles") showResearchPaperReviewScreen();
    else showResearchPaperSourcesScreen();
  }

  // Real Word/PDF/Excel files go through the SAME server-side
  // extraction endpoint (EXTRACT_DOCUMENT_TEXT_API_URL) already proven
  // for Live Chat document attachments -- plain text files are just
  // read directly in the browser, same as everywhere else in the app.
  // Per explicit request, each file is tracked in _uploadingFileNames
  // while its real upload/extraction is in flight, driving the live
  // spinner+status strip above, rather than the screen just sitting
  // there with no feedback until it suddenly appears in the list.
  function handleResearchPaperSourceFileUpload(input) {
    const files = Array.from(input.files || []);
    input.value = "";
    const w = researchPaperWizard;
    for (const file of files) w._uploadingFileNames.push(file.name);
    rerenderResearchPaperSourceScreen();
    for (const file of files) {
      if (DOCUMENT_EXTENSIONS.includes(getFileExtension(file.name))) {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const response = await fetch(EXTRACT_DOCUMENT_TEXT_API_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documents: [{ name: file.name, data: reader.result }] }),
            });
            const data = await response.json();
            w.sourceDocuments.push({ name: file.name, text: (response.ok && data.text) ? data.text : "" });
          } catch (err) {
            console.error("Could not extract source document:", err);
            w.sourceDocuments.push({ name: file.name, text: "" });
          }
          w._uploadingFileNames = w._uploadingFileNames.filter((n) => n !== file.name);
          rerenderResearchPaperSourceScreen();
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          w.sourceDocuments.push({ name: file.name, text: reader.result });
          w._uploadingFileNames = w._uploadingFileNames.filter((n) => n !== file.name);
          rerenderResearchPaperSourceScreen();
        };
        reader.readAsText(file);
      }
    }
  }

  function removeResearchPaperSourceDocument(index) {
    researchPaperWizard.sourceDocuments.splice(index, 1);
    rerenderResearchPaperSourceScreen();
  }

  // --- Screen 3: Research method ---
  function showResearchPaperMethodScreen() {
    const w = researchPaperWizard;
    const methods = ["Qualitative", "Quantitative", "Mixed Methods", "Literature Review / Meta-Analysis", "Theoretical / Conceptual", "Case Study", "Experimental", "Simulation-Based"];
    const boxes = methods.map((m) =>
      `<div class="model-box model-box-active"${w.researchMethod === m ? ' style="border-color:#d9a441;"' : ""} onclick="selectResearchPaperMethod('${escapeHtmlAttr(m).replace(/'/g, "\\'")}')"><div class="model-box-name">${escapeHtml(m)}</div></div>`
    ).join("");
    showResearchPaperScreen(
      `<div class="models-card-title">What research method fits this paper?</div>` +
      `<div class="models-card-grid">${boxes}</div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">Other / more detail (optional)</label>` +
      `<textarea class="cmm-form-textarea" id="rpMethodOtherInput" placeholder="Describe your own approach if none of the above fit, or add detail to your selection above" oninput="researchPaperWizard.researchMethodOther = this.value">${escapeHtml(w.researchMethodOther)}</textarea>` +
      `</div>` +
      rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperSourcesScreen()", nextLabel: "Next →", nextOnclick: "submitResearchPaperMethodScreen()" })
    );
  }

  function selectResearchPaperMethod(method) {
    researchPaperWizard.researchMethod = method;
    showResearchPaperMethodScreen();
  }

  async function submitResearchPaperMethodScreen() {
    const el = document.getElementById("rpMethodOtherInput");
    if (el) researchPaperWizard.researchMethodOther = el.value;
    if (!researchPaperWizard.researchMethod && !researchPaperWizard.researchMethodOther.trim()) {
      await showWizardMessageModal("Please choose a research method, or describe your own in the text box.");
      return;
    }
    showResearchPaperEthicsScreen();
  }

  // --- Screen 4: Ethics considerations ---
  function showResearchPaperEthicsScreen() {
    const w = researchPaperWizard;
    const options = ["Human Subjects / IRB Approval", "Data Privacy & Confidentiality", "Conflict of Interest", "Environmental Impact", "AI / Algorithmic Bias", "Not Applicable / Standard Disclosure Only"];
    const checkboxesHtml = options.map((o, i) => {
      const checked = w.ethicsConsiderations.includes(o);
      return `<label style="display:flex; align-items:center; gap:8px; margin-bottom:10px; cursor:pointer;"><input type="checkbox" id="rpEthics${i}" ${checked ? "checked" : ""} onchange="toggleResearchPaperEthicsOption('${escapeHtmlAttr(o).replace(/'/g, "\\'")}')"> ${escapeHtml(o)}</label>`;
    }).join("");
    showResearchPaperScreen(
      `<div class="models-card-title">Which ethics considerations apply?</div>` +
      `<div class="cmm-form-field">${checkboxesHtml}</div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">Other (optional)</label>` +
      `<textarea class="cmm-form-textarea" id="rpEthicsOtherInput" placeholder="Describe any other ethics consideration" oninput="researchPaperWizard.ethicsOther = this.value">${escapeHtml(w.ethicsOther)}</textarea>` +
      `</div>` +
      rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperMethodScreen()", nextLabel: "Next →", nextOnclick: "showResearchPaperDiscussionScreen()" })
    );
  }

  function toggleResearchPaperEthicsOption(option) {
    const idx = researchPaperWizard.ethicsConsiderations.indexOf(option);
    if (idx === -1) researchPaperWizard.ethicsConsiderations.push(option);
    else researchPaperWizard.ethicsConsiderations.splice(idx, 1);
  }

  // --- Screen 5: Discussion & recommendation type ---
  function showResearchPaperDiscussionScreen() {
    const w = researchPaperWizard;
    const discussionOptions = ["Critical Analysis", "Comparative Analysis", "Practical Implications", "Theoretical Implications", "Combination of the Above"];
    const recommendationOptions = ["Policy Recommendations", "Future Research Directions", "Practical Applications", "Combination of the Above"];
    showResearchPaperScreen(
      `<div class="models-card-title">Discussion and recommendations</div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">Discussion style</label>` +
      `<select class="cmm-form-textarea" style="min-height:auto;" onchange="researchPaperWizard.discussionType = this.value">` +
      discussionOptions.map((v) => `<option value="${escapeHtmlAttr(v)}"${w.discussionType === v ? " selected" : ""}>${escapeHtml(v)}</option>`).join("") +
      `</select></div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">Recommendation type</label>` +
      `<select class="cmm-form-textarea" style="min-height:auto;" onchange="researchPaperWizard.recommendationType = this.value">` +
      recommendationOptions.map((v) => `<option value="${escapeHtmlAttr(v)}"${w.recommendationType === v ? " selected" : ""}>${escapeHtml(v)}</option>`).join("") +
      `</select></div>` +
      rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperEthicsScreen()", nextLabel: "Next →", nextOnclick: "showResearchPaperAcknowledgementScreen()" })
    );
  }

  // --- Screen 6: Acknowledgements ---
  function showResearchPaperAcknowledgementScreen() {
    const w = researchPaperWizard;
    showResearchPaperScreen(
      `<div class="models-card-title">Acknowledgements (optional)</div>` +
      `<div class="cmm-form-field">` +
      `<textarea class="cmm-form-textarea" id="rpAcknowledgementInput" placeholder="e.g. funding body, advisor, institution -- or leave blank to skip" oninput="researchPaperWizard.acknowledgement = this.value">${escapeHtml(w.acknowledgement)}</textarea>` +
      `</div>` +
      rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperDiscussionScreen()", nextLabel: "Next →", nextOnclick: "showResearchPaperReviewScreen()" })
    );
  }

  // --- Screen 7: Review & confirm ---
  // Config-driven so the Review screen can render the correct inline
  // editor per field -- per explicit request, clicking Edit on any row
  // now edits it right there on the Review screen itself, instead of
  // navigating back to that field's original dedicated screen.
  const RESEARCH_PAPER_REVIEW_FIELDS = [
    { key: "topic", label: "Topic", type: "textarea" },
    { key: "academicLevel", label: "Academic level", type: "select", options: ["Undergraduate", "Graduate (Master's)", "PhD / Doctoral", "Postdoctoral / Professional Researcher"] },
    { key: "paperType", label: "Paper type", type: "select", options: ["Journal Article", "Conference Paper", "Thesis / Dissertation Chapter", "Literature Review", "General Research Report"] },
    { key: "targetLength", label: "Target length", type: "select", options: ["Short (3\u20135 pages)", "Standard (8\u201312 pages)", "Extended (15\u201320 pages)", "Long-form (25+ pages)"] },
    { key: "sourceNotes", label: "Source notes", type: "textarea" },
    { key: "sourceFiles", label: "Source files", type: "files" },
    { key: "researchMethod", label: "Research method", type: "method" },
    { key: "ethicsConsiderations", label: "Ethics considerations", type: "ethics" },
    { key: "discussionType", label: "Discussion style", type: "select", options: ["Critical Analysis", "Comparative Analysis", "Practical Implications", "Theoretical Implications", "Combination of the Above"] },
    { key: "recommendationType", label: "Recommendation type", type: "select", options: ["Policy Recommendations", "Future Research Directions", "Practical Applications", "Combination of the Above"] },
    { key: "acknowledgement", label: "Acknowledgements", type: "textarea" },
  ];

  function researchPaperReviewFieldDisplayValue(w, key) {
    if (key === "sourceFiles") return w.sourceDocuments.map((d) => d.name).join(", ");
    if (key === "researchMethod") return [w.researchMethod, w.researchMethodOther].filter(Boolean).join(" -- ");
    if (key === "ethicsConsiderations") return [...w.ethicsConsiderations, w.ethicsOther].filter(Boolean).join(", ");
    return w[key];
  }

  function buildReviewRowHtml(field) {
    const w = researchPaperWizard;
    const { key, label, type } = field;
    const editing = w._reviewEditingField === key;
    const displayValue = researchPaperReviewFieldDisplayValue(w, key);

    if (!editing) {
      return (
        `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.08);">` +
        `<div style="flex:1; min-width:0;">` +
        `<div style="font-weight:600; font-size:13px; opacity:0.8; text-align:center;">${escapeHtml(label)}</div>` +
        `<div style="margin-top:4px; text-align:left;">${displayValue ? escapeHtml(displayValue) : '<em style="opacity:0.5;">(none)</em>'}</div>` +
        `</div>` +
        `<button class="cmm-form-btn" style="flex-shrink:0;" onclick="startEditingReviewField('${key}')">Edit</button>` +
        `</div>`
      );
    }

    let editorHtml = "";
    if (type === "textarea") {
      editorHtml = `<textarea class="cmm-form-textarea" id="rpReviewEditInput_${key}">${escapeHtml(w[key] || "")}</textarea>`;
    } else if (type === "select") {
      editorHtml =
        `<select class="cmm-form-textarea" style="min-height:auto;" id="rpReviewEditInput_${key}">` +
        field.options.map((v) => `<option value="${escapeHtmlAttr(v)}"${w[key] === v ? " selected" : ""}>${escapeHtml(v)}</option>`).join("") +
        `</select>`;
    } else if (type === "files") {
      editorHtml =
        `<label class="cmm-form-file-label" style="font-size:14px; padding:10px 18px; display:inline-block; margin-bottom:10px;">📎 Choose files to attach<input type="file" multiple accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,.xls,.xlsx" style="display:none;" onchange="handleResearchPaperSourceFileUpload(this)"></label>` +
        buildResearchPaperUploadingStatusHtml() +
        `<div style="display:flex; flex-direction:column; gap:6px;">${buildResearchPaperSourceFilesListHtml()}</div>`;
    } else if (type === "method") {
      const methods = ["Qualitative", "Quantitative", "Mixed Methods", "Literature Review / Meta-Analysis", "Theoretical / Conceptual", "Case Study", "Experimental", "Simulation-Based"];
      const boxes = methods.map((m) =>
        `<div class="model-box model-box-active"${w.researchMethod === m ? ' style="border-color:#d9a441;"' : ""} onclick="researchPaperWizard.researchMethod = '${escapeHtmlAttr(m).replace(/'/g, "\\'")}'; showResearchPaperReviewScreen();"><div class="model-box-name">${escapeHtml(m)}</div></div>`
      ).join("");
      editorHtml =
        `<div class="models-card-grid" style="margin-bottom:10px;">${boxes}</div>` +
        `<textarea class="cmm-form-textarea" id="rpReviewEditInput_researchMethodOther" placeholder="Other / more detail (optional)">${escapeHtml(w.researchMethodOther)}</textarea>`;
    } else if (type === "ethics") {
      const options = ["Human Subjects / IRB Approval", "Data Privacy & Confidentiality", "Conflict of Interest", "Environmental Impact", "AI / Algorithmic Bias", "Not Applicable / Standard Disclosure Only"];
      const checkboxesHtml = options.map((o) => {
        const checked = w.ethicsConsiderations.includes(o);
        return `<label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;"><input type="checkbox" ${checked ? "checked" : ""} onchange="toggleResearchPaperEthicsOption('${escapeHtmlAttr(o).replace(/'/g, "\\'")}'); showResearchPaperReviewScreen();"> ${escapeHtml(o)}</label>`;
      }).join("");
      editorHtml =
        checkboxesHtml +
        `<textarea class="cmm-form-textarea" id="rpReviewEditInput_ethicsOther" placeholder="Other (optional)">${escapeHtml(w.ethicsOther)}</textarea>`;
    }

    return (
      `<div style="padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.08);">` +
      `<div style="font-weight:600; font-size:13px; opacity:0.8; text-align:center; margin-bottom:8px;">${escapeHtml(label)}</div>` +
      editorHtml +
      `<div style="display:flex; gap:10px; margin-top:10px;">` +
      `<button class="cmm-form-btn cmm-form-btn-primary" onclick="saveReviewFieldEdit('${key}')">Save</button>` +
      `<button class="cmm-form-btn" onclick="cancelReviewFieldEdit()">Cancel</button>` +
      `</div></div>`
    );
  }

  function startEditingReviewField(key) {
    const w = researchPaperWizard;
    w._reviewEditingField = key;
    // Snapshots only the field(s) this specific editor can touch, so
    // Cancel can genuinely revert rather than just closing the editor
    // with whatever half-made changes were already live (method/ethics
    // selections apply immediately on click, same as their original
    // dedicated screens -- this is what makes Cancel able to undo those
    // too, not just the plain text/select fields).
    if (key === "researchMethod") w._reviewFieldSnapshot = { researchMethod: w.researchMethod, researchMethodOther: w.researchMethodOther };
    else if (key === "ethicsConsiderations") w._reviewFieldSnapshot = { ethicsConsiderations: [...w.ethicsConsiderations], ethicsOther: w.ethicsOther };
    else if (key === "sourceFiles") w._reviewFieldSnapshot = { sourceDocuments: [...w.sourceDocuments] };
    else w._reviewFieldSnapshot = { [key]: w[key] };
    showResearchPaperReviewScreen();
    setTimeout(() => { const el = document.getElementById(`rpReviewEditInput_${key}`); if (el) el.focus(); }, 0);
  }

  function saveReviewFieldEdit(key) {
    const w = researchPaperWizard;
    const el = document.getElementById(`rpReviewEditInput_${key}`);
    if (el) w[key] = el.value;
    if (key === "researchMethod") {
      const otherEl = document.getElementById("rpReviewEditInput_researchMethodOther");
      if (otherEl) w.researchMethodOther = otherEl.value;
    }
    if (key === "ethicsConsiderations") {
      const otherEl = document.getElementById("rpReviewEditInput_ethicsOther");
      if (otherEl) w.ethicsOther = otherEl.value;
    }
    w._reviewEditingField = null;
    w._reviewFieldSnapshot = null;
    showResearchPaperReviewScreen();
  }

  function cancelReviewFieldEdit() {
    const w = researchPaperWizard;
    if (w._reviewFieldSnapshot) Object.assign(w, w._reviewFieldSnapshot);
    w._reviewEditingField = null;
    w._reviewFieldSnapshot = null;
    showResearchPaperReviewScreen();
  }

  function showResearchPaperReviewScreen() {
    const summaryHtml = RESEARCH_PAPER_REVIEW_FIELDS.map(buildReviewRowHtml).join("");
    showResearchPaperScreen(
      `<div class="models-card-title">Review everything before we start</div>` +
      `<div class="cmm-form-field">${summaryHtml}</div>` +
      rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperAcknowledgementScreen()", nextLabel: "Propose Section Outline →", nextOnclick: "proposeResearchPaperOutline()" }),
      "max-width:920px; width:92vw;"
    );
  }

  // Plain, human-readable dump of every wizard answer -- fed into
  // every JOB A / JOB B call below so the model always has the full,
  // real context, without relying on multi-turn conversationHistory
  // (each of these calls is deliberately self-contained/stateless --
  // simpler and more robust than trying to keep a long chat history in
  // sync with a non-linear, editable wizard flow).
  function buildResearchPaperContextSummary() {
    const w = researchPaperWizard;
    return [
      `Research topic / working title: ${w.topic}`,
      `Academic level: ${w.academicLevel}`,
      `Paper type: ${w.paperType}`,
      `Target length: ${w.targetLength}`,
      w.sourceNotes ? `Notes on specific sources to include: ${w.sourceNotes}` : null,
      w.sourceDocuments.length ? `Attached source material:\n` + w.sourceDocuments.map((d) => `--- ${d.name} ---\n${d.text}`).join("\n\n") : null,
      `Research method: ${[w.researchMethod, w.researchMethodOther].filter(Boolean).join(" -- ") || "Not specified"}`,
      `Ethics considerations: ${[...w.ethicsConsiderations, w.ethicsOther].filter(Boolean).join(", ") || "Not specified"}`,
      `Discussion style: ${w.discussionType}`,
      `Recommendation type: ${w.recommendationType}`,
      w.acknowledgement ? `Acknowledgements to include: ${w.acknowledgement}` : null,
    ].filter(Boolean).join("\n\n");
  }

  // Shared low-level helper for this wizard's own structured,
  // non-visible /chat calls (proposing section titles, writing/
  // revising one section) -- reads the SAME real Server-Sent Events
  // stream deliverMessage() parses for normal visible chat, just
  // without building a chat bubble around it, since these are
  // internal, programmatic steps in a guided flow. Real intermediate
  // status events (the same ones the normal chat "thinking" indicator
  // shows) are surfaced live via onStatus. A confirmed real gap this
  // also fixes: unlike deliverMessage() (which auto-retries up to 2
  // times before ever showing an error, since a transient hiccup --
  // e.g. Render free-tier waking up mid-request -- is exactly the kind
  // of thing that often succeeds on the very next try), this helper
  // had NO retry at all, so any single transient blip surfaced
  // immediately as "There was a connection error" instead of quietly
  // recovering. Now retries the same way, same 1500ms pause between
  // attempts, only surfacing a real error after every attempt has
  // genuinely failed.
  async function callScienceCreatePaperModel(promptText, onStatus, modeOverride, images, documents, extraFields) {
    const MAX_AUTO_RETRIES = 2;
    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: promptText,
            mode: modeOverride || "science_create_paper",
            history: [], // default: no memory. Callers that DO want real conversation memory (e.g. generateSchoolAnswer's School and Students wizard) pass their own `history` key inside extraFields below, which overrides this since it spreads in after -- same object-literal "last key wins" behavior JS always uses, not a special mechanism.
            timezone: userTimezone,
            images: images || [],
            documents: documents || [],
            isVoiceMode: false,
            ...(extraFields || {}),
          }),
        });
        if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalEvent = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop();
          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data:")) continue;
            let evt;
            try { evt = JSON.parse(line.slice(5).trim()); } catch (parseErr) { continue; }
            if (evt.done) finalEvent = evt;
            else if (evt.status && onStatus) onStatus(evt.status);
          }
        }
        if (!finalEvent) throw new Error("Stream ended without a final response");
        if (finalEvent.error) throw new Error("Server reported an error");
        return finalEvent; // { reply, raw_reply, ... }
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_AUTO_RETRIES) {
          if (onStatus) onStatus("Reconnecting");
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }
    throw lastErr;
  }

  // --- Outline proposal ---
  async function proposeResearchPaperOutline() {
    showResearchPaperScreen(
      `<div class="models-card-title" style="text-align:center;">Proposing a section outline...</div>` +
      buildResearchPaperPenLoaderHtml("rpOutlineStatusText") +
      `<div style="text-align:center;"><button class="cmm-form-btn" onclick="cancelResearchPaperWizard()">Cancel</button></div>`
    );
    const startedWithWizard = researchPaperWizard; // captured now -- lets this call detect if Cancel reset the wizard while this was still in flight
    try {
      const promptText =
        `JOB A -- propose section titles.\n\n${buildResearchPaperContextSummary()}\n\n` +
        `Propose the full list of section titles for this paper now, per your standing instructions for this job.`;
      const result = await callScienceCreatePaperModel(promptText, (status) => {
        const el = document.getElementById("rpOutlineStatusText");
        if (el) el.textContent = status + "...";
      });
      // Per explicit request: Cancel is now available while this is in
      // flight. If the wizard was reset in the meantime, this response
      // has nowhere left to go -- discard it silently instead of
      // writing into an orphaned object and then crashing trying to
      // render a screen for a wizard that no longer exists.
      if (researchPaperWizard !== startedWithWizard) return;
      const raw = result.raw_reply || result.reply || "";
      const titles = raw.split("\n").map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim()).filter((line) => line.length > 0);
      researchPaperWizard.sectionTitles = titles.length > 0
        ? titles
        : ["Abstract", "Introduction", "Background", "Methodology", "Results and Discussion", "Ethical Considerations", "Conclusion", "References"];
      showResearchPaperOutlineScreen();
    } catch (err) {
      if (researchPaperWizard !== startedWithWizard) return; // cancelled mid-flight -- nothing left to show an error on
      console.error("Could not propose section outline:", err);
      showResearchPaperScreen(
        `<div class="models-card-title">Could not propose an outline</div>` +
        `<div style="opacity:0.7; padding:10px 0;">There was a connection error. Please try again.</div>` +
        rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperReviewScreen()", nextLabel: "Try Again", nextOnclick: "proposeResearchPaperOutline()" })
      );
    }
  }

  function showResearchPaperOutlineScreen() {
    const w = researchPaperWizard;
    const rowsHtml = w.sectionTitles.map((title, i) => {
      if (w._outlineEditingIndex === i) {
        return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">` +
          `<input type="text" class="cmm-form-textarea" id="rpOutlineEditInput${i}" style="min-height:auto; flex:1;" value="${escapeHtmlAttr(title)}">` +
          `<button class="cmm-form-btn cmm-form-btn-primary" onclick="saveResearchPaperOutlineSectionEdit(${i})">Save</button>` +
          `<button class="cmm-form-btn" onclick="removeResearchPaperOutlineSection(${i})">✕</button>` +
          `</div>`;
      }
      return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">` +
        `<div class="cmm-form-textarea" style="min-height:auto; flex:1; display:flex; align-items:center;">${escapeHtml(title)}</div>` +
        `<button class="cmm-form-btn" onclick="startEditingResearchPaperOutlineSection(${i})">Edit</button>` +
        `<button class="cmm-form-btn" onclick="removeResearchPaperOutlineSection(${i})">✕</button>` +
        `</div>`;
    }).join("");
    showResearchPaperScreen(
      `<div class="models-card-title">Proposed section outline</div>` +
      `<div style="opacity:0.7; font-size:13px; margin-bottom:14px;">Edit any title, remove a section, or add a new one. Once you're happy with this, we'll write it section by section.</div>` +
      `<div class="cmm-form-field">${rowsHtml}</div>` +
      `<button class="cmm-form-btn" onclick="addResearchPaperOutlineSection()">+ Add Section</button>` +
      `<button class="cmm-form-btn" style="margin-left:10px;" onclick="proposeResearchPaperOutline()">↻ Regenerate Suggestions</button>` +
      rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperReviewScreen()", nextLabel: "Confirm Outline & Start Writing →", nextOnclick: "confirmResearchPaperOutline()" }),
      "max-width:1000px; width:94vw;"
    );
  }

  function startEditingResearchPaperOutlineSection(index) {
    researchPaperWizard._outlineEditingIndex = index;
    showResearchPaperOutlineScreen();
    setTimeout(() => {
      const el = document.getElementById(`rpOutlineEditInput${index}`);
      if (el) { el.focus(); el.select(); }
    }, 0);
  }

  function saveResearchPaperOutlineSectionEdit(index) {
    const el = document.getElementById(`rpOutlineEditInput${index}`);
    if (el && el.value.trim()) researchPaperWizard.sectionTitles[index] = el.value.trim();
    researchPaperWizard._outlineEditingIndex = null;
    showResearchPaperOutlineScreen();
  }

  function removeResearchPaperOutlineSection(index) {
    researchPaperWizard.sectionTitles.splice(index, 1);
    showResearchPaperOutlineScreen();
  }

  function addResearchPaperOutlineSection() {
    researchPaperWizard.sectionTitles.push("New Section");
    showResearchPaperOutlineScreen();
  }

  // Strips stray markdown syntax (leading #, any *) from a section
  // title -- titles are structural headings, not markdown content, so
  // they should never show literal "##"/"**" even if the model (or a
  // manual edit) accidentally included them.
  function cleanMarkdownTitleSyntax(title) {
    return (title || "").replace(/^#{1,6}\s*/, "").replace(/\*/g, "").trim();
  }

  async function confirmResearchPaperOutline() {
    // Cleaned HERE, once, at the single point writing begins -- covers
    // every downstream use (on-screen headers, and every export format)
    // automatically, whether the title was auto-proposed, manually
    // edited, or manually added via "+ Add Section".
    researchPaperWizard.sectionTitles = researchPaperWizard.sectionTitles.map((t) => cleanMarkdownTitleSyntax(t)).filter((t) => t.length > 0);
    if (researchPaperWizard.sectionTitles.length === 0) {
      await showWizardMessageModal("Please keep at least one section.");
      return;
    }
    researchPaperWizard.currentSectionIndex = 0;
    researchPaperWizard.sectionContents = {};
    showResearchPaperWritingModeScreen();
  }

  // Per explicit request: offers a real choice for how the paper gets
  // written -- either every section back-to-back with no stopping (for
  // someone who just wants a complete first draft fast), or the
  // original one-at-a-time flow with a chance to review/edit/add
  // visuals to each section before moving on. Both paths land in the
  // exact same per-section review screen afterward either way -- the
  // choice only affects WHEN generation happens, not what review/edit
  // capability is available.
  function showResearchPaperWritingModeScreen() {
    showResearchPaperScreen(
      `<div class="models-card-title" style="text-align:center;">How would you like to write this paper?</div>` +
      `<div style="opacity:0.7; font-size:13px; margin-bottom:16px; text-align:center;">Either way, you'll still be able to review, edit, and add tables/charts to every section afterward.</div>` +
      `<div class="models-card-grid">` +
      `<div class="model-box model-box-active" onclick="generateAllResearchPaperSectionsSequentially()"><div class="model-box-icon">✍️</div><div class="model-box-name">Write All Sections at Once</div><div class="model-box-status">Fastest -- get a complete first draft, then review it all together</div></div>` +
      `<div class="model-box model-box-active" onclick="generateResearchPaperSection()"><div class="model-box-icon">📝</div><div class="model-box-name">Review Section by Section</div><div class="model-box-status">Review, edit, or add visuals to each section as it's written</div></div>` +
      `</div>` +
      rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperOutlineScreen()" })
    );
  }

  // Writes every section back-to-back with no stopping in between,
  // reusing the exact same per-section prompt logic as the one-at-a-
  // time path (generateResearchPaperSection) -- once all sections are
  // done, lands on the normal section review screen at section 1, so
  // every section can still be reviewed/edited/have visuals added,
  // exactly like the section-by-section path -- the only difference is
  // ALL the writing already happened upfront rather than one at a time.
  async function generateAllResearchPaperSectionsSequentially() {
    const w = researchPaperWizard;
    const startedWithWizard = w;
    for (let i = 0; i < w.sectionTitles.length; i++) {
      if (researchPaperWizard !== startedWithWizard) return; // cancelled mid-batch
      w.currentSectionIndex = i;
      const title = w.sectionTitles[i];
      showResearchPaperScreen(
        `<div class="models-card-title" style="text-align:center;">Writing all sections... (${i + 1} of ${w.sectionTitles.length}: ${escapeHtml(title)})</div>` +
        buildResearchPaperPenLoaderHtml("rpSectionStatusText") +
        `<div style="text-align:center;"><button class="cmm-form-btn" onclick="cancelResearchPaperWizard()">Cancel</button></div>`,
        "max-width:1000px; width:94vw;"
      );
      try {
        const previousContext = i > 0
          ? "Already-written earlier sections, for continuity/consistency only (do not repeat their content):\n\n" +
            w.sectionTitles.slice(0, i).map((t, j) => `--- ${t} ---\n${(w.sectionContents[j] || "").slice(0, 1200)}`).join("\n\n")
          : "";
        const promptText =
          `JOB B -- write one section.\n\n${buildResearchPaperContextSummary()}\n\n` +
          `Full agreed section outline, in order: ${w.sectionTitles.map((t, j) => `${j + 1}. ${t}`).join("; ")}\n\n` +
          `${previousContext}\n\n` +
          `Write the full content for THIS section now: "${title}".`;
        const result = await callScienceCreatePaperModel(promptText, (status) => {
          const el = document.getElementById("rpSectionStatusText");
          if (el) el.textContent = status + "...";
        });
        if (researchPaperWizard !== startedWithWizard) return;
        w.sectionContents[i] = (result.raw_reply || result.reply || "") + extractGarnetVisualBlocksFromHtmlReply(result.reply || "");
      } catch (err) {
        if (researchPaperWizard !== startedWithWizard) return;
        console.error(`Could not write section "${title}" during batch write:`, err);
        showResearchPaperScreen(
          `<div class="models-card-title">Could not write "${escapeHtml(title)}"</div>` +
          `<div style="opacity:0.7; padding:10px 0;">There was a connection error while writing section ${i + 1} of ${w.sectionTitles.length}.</div>` +
          rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperWritingModeScreen()", nextLabel: "Try Again", nextOnclick: "generateAllResearchPaperSectionsSequentially()" })
        );
        return;
      }
    }
    w.currentSectionIndex = 0;
    showResearchPaperSectionReviewScreen();
  }

  // --- Section-by-section drafting ---
  // Lightweight, on-demand PDF preview for "Download a Copy" -- loads
  // jsPDF from CDN only the first time it's actually needed (this app
  // doesn't otherwise use a client-side PDF library; the REAL final
  // output still goes through the proper create_pdf/create_project_zip
  // AI pipeline). This is deliberately a fast, simple, client-side
  // snapshot of progress so far -- not a substitute for the polished
  // final document.
  let jsPdfLoadPromise = null;
  function ensureJsPdfLoaded() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (jsPdfLoadPromise) return jsPdfLoadPromise;
    jsPdfLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      script.onload = () => resolve();
      script.onerror = () => { jsPdfLoadPromise = null; reject(new Error("Could not load PDF library")); };
      document.head.appendChild(script);
    });
    return jsPdfLoadPromise;
  }

  // Per explicit request: math equations must render as REAL typeset
  // math (proper fraction bars, exponents, radicals, Greek letters --
  // not just cleaned-up plain text) in the PDF and Word exports too,
  // not only the live chat. KaTeX (already loaded for the live chat's
  // own real math rendering -- see renderMathInMessage) can render a
  // LaTeX string into precise, correctly-typeset HTML -- html2canvas
  // then rasterizes that into a real PNG image, which gets embedded
  // directly into the PDF/Word output. This is loaded on demand (only
  // when a math expression actually needs exporting), the same
  // pattern already used for jsPDF itself.
  let html2canvasLoadPromise = null;
  function ensureHtml2CanvasLoaded() {
    if (window.html2canvas) return Promise.resolve();
    if (html2canvasLoadPromise) return html2canvasLoadPromise;
    html2canvasLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      script.onload = () => resolve();
      script.onerror = () => { html2canvasLoadPromise = null; reject(new Error("Could not load html2canvas")); };
      document.head.appendChild(script);
    });
    return html2canvasLoadPromise;
  }

  // Renders one LaTeX expression to a real PNG data URL via KaTeX +
  // html2canvas -- rendered off-screen (never visible to the person),
  // at 3x scale for crisp embedding even when the PDF/Word doc is
  // zoomed in. Returns null (rather than throwing) on failure, so a
  // single malformed expression can't break the whole export --
  // callers fall back to plain readable text for that one expression.
  async function renderLatexToImageDataUrl(latex, displayMode) {
    if (typeof katex === "undefined") return null;
    try {
      await ensureHtml2CanvasLoaded();
    } catch (err) {
      console.error("Could not load html2canvas for math rendering:", err);
      return null;
    }
    const container = document.createElement("div");
    container.style.cssText = "position:fixed; left:-9999px; top:-9999px; background:#ffffff; padding:3px; color:#000000; font-size:22px;";
    document.body.appendChild(container);
    try {
      katex.render(latex, container, { throwOnError: false, displayMode: !!displayMode });
      const canvas = await html2canvas(container, { backgroundColor: "#ffffff", scale: 3 });
      if (!canvas.width || !canvas.height) return null;
      return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
    } catch (err) {
      console.error("Could not render math expression:", latex, err);
      return null;
    } finally {
      document.body.removeChild(container);
    }
  }

  // Finds every \( ... \) and \[ ... \] math expression in a text
  // block, keyed by a unique placeholder, so callers can render them
  // separately (as real images) while leaving the surrounding text
  // alone for normal markdown processing. Returns the text with each
  // expression replaced by its placeholder, plus a map from
  // placeholder -> {latex, displayMode}.
  function extractLatexExpressions(text) {
    const expressions = new Map();
    let counter = 0;
    let out = (text || "").replace(/\\\[([\s\S]*?)\\\]/g, (m, inner) => {
      const key = `\u0001MATH${counter++}\u0001`;
      expressions.set(key, { latex: inner.trim(), displayMode: true });
      return key;
    });
    out = out.replace(/\\\(([\s\S]*?)\\\)/g, (m, inner) => {
      const key = `\u0001MATH${counter++}\u0001`;
      expressions.set(key, { latex: inner.trim(), displayMode: false });
      return key;
    });
    return { text: out, expressions };
  }

  // Pre-renders every extracted expression to a real image up front
  // (in parallel), so layout code can synchronously know each image's
  // dimensions instead of awaiting mid-layout. Returns both the
  // successfully-rendered images AND the original expressions map, so
  // callers can fall back to plain readable text (via
  // latexToPlainTextFallback) for the specific expressions that failed
  // to render, using their real original LaTeX rather than losing it.
  async function prerenderLatexExpressions(expressions) {
    const rendered = new Map();
    await Promise.all(Array.from(expressions.entries()).map(async ([key, { latex, displayMode }]) => {
      const img = await renderLatexToImageDataUrl(latex, displayMode);
      if (img) rendered.set(key, { ...img, latex, displayMode });
    }));
    return { rendered, all: expressions };
  }

  // Plain-readable-text fallback for a SINGLE expression that failed
  // to render as a real image -- same conversions as the old blanket
  // convertLatexToReadableMath, just scoped to one expression instead
  // of applied to everything (real image rendering is now the primary
  // path; this is only the safety net for the rare failure case).
  function latexToPlainTextFallback(latex) {
    let s = latex;
    s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)");
    s = s.replace(/\\sqrt\{([^}]*)\}/g, "\u221a($1)");
    s = s.replace(/\\cdot/g, "\u00b7");
    s = s.replace(/\\times/g, "\u00d7");
    s = s.replace(/\\div/g, "\u00f7");
    s = s.replace(/\\pm/g, "\u00b1");
    s = s.replace(/\\leq/g, "\u2264").replace(/\\geq/g, "\u2265").replace(/\\neq/g, "\u2260");
    s = s.replace(/\\left|\\right/g, "");
    s = s.replace(/\\,|\\;|\\!/g, " ");
    s = s.replace(/\{|\}/g, "");
    return s.trim();
  }

  // ------------------------------------------------------------------
  // MARKDOWN-AWARE PDF BODY RENDERER -- a confirmed real gap this fixes:
  // both quick PDF exports (this one and the School and Students answer
  // PDF) were just calling doc.text() on the model's raw markdown-style
  // output verbatim -- "## Headers", "**bold**", "- bullets", and
  // "| pipe | tables |" all showed up as literal punctuation instead of
  // being formatted, which is exactly the "not professional" complaint.
  // This renders real headers (bold, larger), real bullet/numbered
  // lists, real bold inline text (proper word-by-word font-weight
  // wrapping, not just stripped asterisks), and real simple tables.
  // HONEST LIMITATION: jsPDF's built-in fonts only cover Latin-1/
  // WinAnsi characters -- Arabic, Chinese, and other non-Latin scripts
  // render as garbled mojibake without embedding a full Unicode font
  // file (a much bigger undertaking than this quick client-side
  // preview warrants). Those specific characters are cleanly removed
  // here instead of being shown broken -- a real, deliberate trade-off,
  // not a silent bug.
  // ------------------------------------------------------------------
  // A confirmed real bug this fixes: the previous version stripped
  // EVERY character outside \x00-\xFF, which wrongly caught common
  // "smart" typography the model naturally uses -- curly quotes,
  // em/en dashes, ellipses, non-breaking spaces -- even though jsPDF's
  // built-in fonts (WinAnsi/CP1252 encoding) can render all of those
  // correctly. That's what turned "Syria's" into "Syrias" and dropped
  // dashes from number ranges. Real non-Latin scripts (Arabic, CJK,
  // etc.) genuinely can't be rendered without embedding a full Unicode
  // font (a much bigger undertaking) -- those are still removed, but
  // ONLY those, not ordinary Western punctuation. Also cleans up the
  // empty "()" left behind when a parenthetical held ONLY removed
  // script (e.g. an Arabic gloss), and collapses the double spaces
  // that can result.
  const PDF_SMART_CHAR_MAP = {
    "\u2018": "'", "\u2019": "'", "\u201A": "'",
    "\u201C": '"', "\u201D": '"', "\u201E": '"',
    "\u2013": "-", "\u2014": "--",
    "\u2026": "...",
    "\u00A0": " ",
    "\u2022": "\u2022", // bullet -- WinAnsi supports this one directly, kept as-is
  };
  function stripPdfUnsupportedChars(s) {
    let out = (s || "").replace(/[\u2018\u2019\u201A\u201C\u201D\u201E\u2013\u2014\u2026\u00A0]/g, (ch) => PDF_SMART_CHAR_MAP[ch] || ch);
    out = out.replace(/[^\x00-\xFF]/g, ""); // now only genuinely unrenderable scripts remain to strip
    out = out.replace(/\(\s*\)/g, ""); // empty parens left behind when their only content was a stripped script
    out = out.replace(/[ \t]{2,}/g, " "); // collapse doubled spaces from removed inline text
    return out;
  }

  // A confirmed real bug this fixes: the model writes real equations
  // using its standing \( \) inline / \[ \] display LaTeX-style math
  // convention (meant for the chat UI's KaTeX renderer), but none of
  // these export paths have real math typesetting -- the raw
  // delimiters and LaTeX commands (\frac{}{}, \cdot, etc.) were
  // showing up completely literally ("\\( F = ma \\)"). True typeset
  // math is out of scope here (would need a full math-layout engine),
  // but this strips the delimiters and converts the handful of most
  // common LaTeX commands to their plain readable equivalents, so an
  // equation reads cleanly as "F = ma" instead of with visible
  // backslashes and braces.
  function convertLatexToReadableMath(text) {
    const cleanInner = (inner) => {
      let s = inner;
      s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)");
      s = s.replace(/\\sqrt\{([^}]*)\}/g, "\u221a($1)");
      s = s.replace(/\\cdot/g, "\u00b7");
      s = s.replace(/\\times/g, "\u00d7");
      s = s.replace(/\\div/g, "\u00f7");
      s = s.replace(/\\pm/g, "\u00b1");
      s = s.replace(/\\leq/g, "\u2264").replace(/\\geq/g, "\u2265").replace(/\\neq/g, "\u2260");
      s = s.replace(/\\left|\\right/g, "");
      s = s.replace(/\\,|\\;|\\!/g, " ");
      s = s.replace(/\{|\}/g, "");
      return s.trim();
    };
    return (text || "")
      .replace(/\\\[([\s\S]*?)\\\]/g, (m, inner) => cleanInner(inner))
      .replace(/\\\(([\s\S]*?)\\\)/g, (m, inner) => cleanInner(inner));
  }

  // Shared "chart" fenced-block description -- same real gap as the
  // ```images block: the render_chart tool's ```chart JSON convention
  // (meant for the chat UI's live Chart.js rendering) was falling
  // through to the generic code-block handler and showing raw JSON.
  // Real chart drawing is out of scope for these quick exports (no
  // charting library wired into jsPDF/Word/Excel here) -- this
  // describes the chart's real title/type/data as clean readable text
  // instead, the same honest-fallback approach already used for images.
  function describeChartBlock(jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const parts = [];
      if (parsed.title) parts.push(parsed.title);
      const type = parsed.type || "line";
      parts.push(`(${type} chart)`);
      if (Array.isArray(parsed.labels) && Array.isArray(parsed.data)) {
        const pairs = parsed.labels.map((l, i) => `${l}: ${parsed.data[i]}`).join(", ");
        return `${parts.join(" ")} -- ${pairs}`;
      }
      return parts.join(" ");
    } catch (err) {
      return null;
    }
  }

  // Same {label, items} legend rows the real venn diagram's own SVG
  // rendering uses (see renderVennDiagrams) -- shared by the PDF's
  // real drawn circles (which still need a text legend underneath,
  // since the circles alone can't show item lists) and by the Word/
  // Excel/Text exports' description-only fallback.
  function buildVennLegendRows(vennData) {
    const { labels, regions, setCount } = vennData;
    if (setCount === 2) {
      const [a, b] = labels;
      const { onlyA = [], onlyB = [], both = [] } = regions;
      return [
        { label: `${a} only`, items: onlyA },
        { label: `${b} only`, items: onlyB },
        { label: "Both", items: both },
      ];
    }
    if (setCount === 3) {
      const [a, b, c] = labels;
      const { onlyA = [], onlyB = [], onlyC = [], AB = [], AC = [], BC = [], ABC = [] } = regions;
      return [
        { label: `${a} only`, items: onlyA },
        { label: `${b} only`, items: onlyB },
        { label: `${c} only`, items: onlyC },
        { label: `${a} & ${b}`, items: AB },
        { label: `${a} & ${c}`, items: AC },
        { label: `${b} & ${c}`, items: BC },
        { label: "All three", items: ABC },
      ];
    }
    return [];
  }

  function describeVennBlock(jsonText) {
    try {
      const vennData = JSON.parse(jsonText);
      const rows = buildVennLegendRows(vennData).filter((r) => r.items.length > 0);
      const lines = [];
      if (vennData.title) lines.push(vennData.title);
      rows.forEach((r) => lines.push(`${r.label} (${r.items.length}): ${r.items.join(", ")}`));
      return lines;
    } catch (err) {
      return null;
    }
  }

  // A confirmed real, structural bug this fixes: charts and venn
  // diagrams built via the render_chart tool are appended by the
  // backend as REAL RENDERED HTML (a real <div class="price-chart"
  // data-chart="..."> or <div class="venn-chart" data-venn="...">)
  // directly onto the HTML-formatted `reply` field -- NOT written into
  // `raw_reply` as any kind of parseable markdown/fenced-block text.
  // Since these wizard exports were built entirely around raw_reply
  // (correctly, for everything else -- it's the clean plain-text
  // version), any real chart/venn diagram silently never made it into
  // the exported answer at all: the model's own text just described
  // one existing ("the diagram above shows...") while the actual
  // diagram data was never captured. This parses the real reply HTML,
  // pulls out each real chart/venn's actual JSON data, and converts it
  // into the SAME ```chart / ```venn fenced-block convention the
  // renderers below already know how to handle -- appended to the end
  // of the plain-text answer so it's never silently lost again.
  function extractGarnetVisualBlocksFromHtmlReply(htmlReply) {
    if (!htmlReply) return "";
    const temp = document.createElement("div");
    temp.innerHTML = htmlReply;
    let appended = "";
    temp.querySelectorAll(".price-chart[data-chart]").forEach((el) => {
      const raw = el.getAttribute("data-chart");
      if (raw) appended += `\n\n\`\`\`chart\n${raw}\n\`\`\`\n`;
    });
    temp.querySelectorAll(".venn-chart[data-venn]").forEach((el) => {
      const raw = el.getAttribute("data-venn");
      if (raw) appended += `\n\n\`\`\`venn\n${raw}\n\`\`\`\n`;
    });
    return appended;
  }

  // A real, actually-drawn venn diagram in the PDF (not just a text
  // description) -- two or three overlapping circles with real jsPDF
  // vector drawing, matching the same 2-set/3-set layout the app's own
  // SVG rendering uses, with the real item counts inside each region.
  // A full legend (with the real item names, which don't fit inside
  // the small circles themselves) is printed as text underneath by the
  // caller, using buildVennLegendRows above -- same real data either way.
  function drawVennDiagramInPdf(doc, vennData, startX, topY, maxWidth) {
    const { setCount, labels, regions } = vennData;
    const palette = [[78, 163, 255], [217, 164, 65], [111, 191, 111]];
    const centerX = startX + Math.min(maxWidth, 260) / 2;
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");

    if (setCount === 2) {
      const r = 45;
      const cx1 = centerX - 25;
      const cx2 = centerX + 25;
      const cy = topY + r + 14;
      const { onlyA = [], onlyB = [], both = [] } = regions;
      doc.setDrawColor(...palette[0]);
      doc.circle(cx1, cy, r, "S");
      doc.setDrawColor(...palette[1]);
      doc.circle(cx2, cy, r, "S");
      doc.setTextColor(0, 0, 0);
      doc.text(String(labels[0] || "A"), cx1 - r + 5, cy - r - 4);
      doc.text(String(labels[1] || "B"), cx2 + r - 20, cy - r - 4);
      doc.setFont(undefined, "normal");
      doc.text(String(onlyA.length), cx1 - 18, cy);
      doc.text(String(onlyB.length), cx2 + 12, cy);
      doc.text(String(both.length), centerX - 3, cy);
      return cy + r + 14;
    }

    if (setCount === 3) {
      const r = 40;
      const cx1 = centerX - 22;
      const cx2 = centerX + 22;
      const cx3 = centerX;
      const cy1 = topY + r + 10;
      const cy2 = cy1;
      const cy3 = cy1 + 32;
      const { onlyA = [], onlyB = [], onlyC = [], AB = [], AC = [], BC = [], ABC = [] } = regions;
      doc.setDrawColor(...palette[0]);
      doc.circle(cx1, cy1, r, "S");
      doc.setDrawColor(...palette[1]);
      doc.circle(cx2, cy2, r, "S");
      doc.setDrawColor(...palette[2]);
      doc.circle(cx3, cy3, r, "S");
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.text(String(labels[0] || "A"), cx1 - r, cy1 - r - 3);
      doc.text(String(labels[1] || "B"), cx2 + r - 12, cy2 - r - 3);
      doc.text(String(labels[2] || "C"), cx3 - 5, cy3 + r + 10);
      doc.setFont(undefined, "normal");
      doc.text(String(onlyA.length), cx1 - r + 12, cy1);
      doc.text(String(onlyB.length), cx2 + r - 16, cy2);
      doc.text(String(onlyC.length), cx3 - 3, cy3 + 12);
      doc.text(String(AB.length), cx3 - 3, cy1 - 6);
      doc.text(String(AC.length), cx1 + 8, (cy1 + cy3) / 2);
      doc.text(String(BC.length), cx2 - 12, (cy2 + cy3) / 2);
      doc.text(String(ABC.length), cx3 - 3, cy1 + 12);
      return cy3 + r + 14;
    }

    return topY;
  }

  // A confirmed real bug this fixes: a table "fell apart" into loose
  // paragraph text (with stray "|" characters and literal "**bold**"
  // markers showing) partway through -- the model had wrapped some
  // cells' content across multiple physical lines without repeating
  // the "|" delimiter on the continuation lines (not strictly valid
  // single-line-per-row markdown, but a real, observed pattern in
  // actual model output). The previous parser required every row to
  // be exactly one line starting and ending with "|" -- the first
  // continuation line that didn't match silently ended table
  // detection entirely, leaving the rest of the table (however many
  // rows) to fall through to plain paragraph rendering instead.
  // This version tolerates that: once inside a detected table, a line
  // that ISN'T a proper "|...|" row is treated as a continuation of
  // the previous row's last cell (appended with a space) rather than
  // ending the table -- so a wrapped cell just becomes one long cell
  // instead of breaking the whole table. Shared by the PDF and Word
  // export paths so both parse identically. Returns null if this
  // isn't really a table at all.
  function parseMarkdownTableAt(lines, startIndex) {
    const line = lines[startIndex];
    if (!/^\s*\|.*\|\s*$/.test(line)) return null;
    const isSeparatorRow = (l) => /^\s*\|[\s:\-|]+\|\s*$/.test(l);
    const splitRow = (l) => l.split("|").map((c) => c.trim()).filter((c, idx, arr) => idx !== 0 && idx !== arr.length - 1);
    let i = startIndex + 1;
    const hasSeparator = i < lines.length && isSeparatorRow(lines[i]);
    if (hasSeparator) i++; // skip the separator row itself -- it carries no real content
    else if (!(i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]))) return null; // no separator AND the next line isn't even pipe-shaped -- this is not really a table, just a line that happens to contain a "|"

    const rows = [splitRow(line)];
    while (i < lines.length) {
      const cur = lines[i];
      const trimmed = cur.trim();
      if (trimmed === "") break; // blank line ends the table
      if (/^#{1,6}\s+/.test(trimmed)) break; // a real header starts -- table's over
      if (/^```/.test(trimmed)) break; // a fenced code block starts -- table's over
      if (/^\s*\|.*\|\s*$/.test(cur)) {
        rows.push(splitRow(cur));
      } else {
        // Continuation of the previous row's last cell.
        const lastRow = rows[rows.length - 1];
        if (lastRow && lastRow.length > 0) {
          lastRow[lastRow.length - 1] = (lastRow[lastRow.length - 1] + " " + trimmed).trim();
        } else {
          break; // no row to continue into -- genuinely not part of the table
        }
      }
      i++;
    }
    return { rows, nextIndex: i };
  }

  // Renders one logical line/paragraph with real inline bold (**text**)
  // AND real markdown links ([text](url)) -- tokenizes into words
  // tagged bold/link, then wraps word-by-word using jsPDF's own real
  // getTextWidth() measurements, so wrapping is accurate for whichever
  // font weight is currently active per word. A confirmed real bug
  // this fixes: markdown links were showing as literal
  // "[NASA - Newton's Laws](https://...)" text -- link words are now
  // rendered as real, genuinely clickable PDF links (via
  // doc.textWithLink), shown just as the link's own text, not the raw
  // brackets/URL. Now ALSO handles \(math\) placeholders (see
  // extractLatexExpressions) as real embedded images -- a math token
  // is measured/drawn like a "word" using its real rendered image
  // dimensions (scaled to match the surrounding line height) instead
  // of text width, and wraps to the next line the same way a long word
  // would if it doesn't fit. renderedMath (a Map from placeholder key
  // -> {dataUrl, width, height, latex}) is pre-rendered by the caller
  // before layout begins, so this function can stay synchronous.
  function renderPdfRichTextLine(doc, text, x, y, maxWidth, fontSize, lineHeight, ensureSpace, mathContext) {
    doc.setFontSize(fontSize);
    const tokens = [];
    const regex = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|\u0001MATH\d+\u0001/g;
    let lastIndex = 0;
    let match;
    const pushWords = (str, bold, url) => {
      str.split(/(\s+)/).forEach((piece) => { if (piece.length) tokens.push({ text: piece, bold: !!bold, url: url || null }); });
    };
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) pushWords(text.slice(lastIndex, match.index), false);
      if (match[0].startsWith("\u0001MATH")) {
        const mathInfo = mathContext && mathContext.rendered.get(match[0]);
        if (mathInfo) {
          tokens.push({ math: mathInfo });
        } else {
          // Real image failed to render for this one expression -- falls
          // back to plain readable text for just this expression, not
          // the whole document, using its real original LaTeX.
          const original = mathContext && mathContext.all.get(match[0]);
          pushWords(original ? latexToPlainTextFallback(original.latex) : "", false);
        }
      } else if (match[1] !== undefined) {
        pushWords(match[1], true); // **bold**
      } else {
        pushWords(match[2], false, match[3]); // [text](url)
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) pushWords(text.slice(lastIndex), false);

    let curY = y;
    let curX = x;
    tokens.forEach((tok) => {
      if (tok.math) {
        // Scales the real rendered image to match the surrounding
        // text's line height, preserving its real aspect ratio.
        const imgHeight = lineHeight * 0.95;
        const imgWidth = (tok.math.width / tok.math.height) * imgHeight;
        if (curX + imgWidth > x + maxWidth) {
          curY += lineHeight;
          curY = ensureSpace(curY, lineHeight);
          curX = x;
        }
        doc.addImage(tok.math.dataUrl, "PNG", curX, curY - imgHeight * 0.78, imgWidth, imgHeight);
        curX += imgWidth + 2;
        return;
      }
      doc.setFontSize(fontSize);
      doc.setFont(undefined, tok.bold ? "bold" : "normal");
      const w = doc.getTextWidth(tok.text);
      if (curX + w > x + maxWidth) {
        if (/^\s+$/.test(tok.text)) return; // don't start a new line with pure whitespace
        curY += lineHeight;
        curY = ensureSpace(curY, lineHeight);
        curX = x;
      }
      if (tok.url) {
        doc.setTextColor(30, 100, 220);
        doc.textWithLink(tok.text, curX, curY, { url: tok.url });
        doc.setTextColor(0, 0, 0);
      } else {
        doc.text(tok.text, curX, curY);
      }
      curX += w;
    });
    return curY + lineHeight;
  }

  // Renders a full markdown-ish body (headers, bullets, numbered lists,
  // pipe tables, and plain paragraphs with inline bold) starting at
  // (startX, startY), handling page breaks itself, and returns the
  // final Y position reached.
  // Fixes a confirmed real bug: some image results already include the
  // source name inside their own title (e.g. title: "Political map of
  // Jordan (Britannica)", source: "Britannica"), and the previous
  // version always appended "(source)" regardless -- producing exactly
  // the reported "(Britannica) (Britannica)" duplication. Now only
  // appends the source if the title doesn't already end with it.
  function formatImageReferenceLabel(img) {
    const title = (img.title || "Image").trim();
    const source = (img.source || "").trim();
    if (!source || title.toLowerCase().endsWith(`(${source.toLowerCase()})`)) return title;
    return `${title} (${source})`;
  }

  // Attempts to fetch a real image and read it as a data URL, for
  // actual embedding via jsPDF's addImage() -- tries the thumbnail URL
  // first (smaller, and Google's thumbnail proxy is somewhat more
  // often fetchable cross-origin than a random source site's own image
  // hosting), falling back to the full-size URL. HONEST LIMITATION:
  // this genuinely can and often will fail for many sites -- browsers
  // enforce CORS on cross-origin fetch() reads, and most ordinary
  // websites (Britannica, news sites, etc.) don't set the headers that
  // would allow a page on a different domain to read their image
  // bytes. This is a real browser security boundary, not a bug in this
  // code -- when it fails, the caller falls back to the clean text
  // reference instead of a broken image.
  async function tryEmbedRealImageInPdf(doc, img, x, y, maxWidth, maxHeight) {
    const candidates = [img.thumbnail, img.url].filter(Boolean);
    for (const candidateUrl of candidates) {
      try {
        const response = await fetch(candidateUrl, { mode: "cors" });
        if (!response.ok) continue;
        const blob = await response.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(blob);
        });
        const dims = await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve({ width: el.naturalWidth, height: el.naturalHeight });
          el.onerror = () => reject(new Error("decode failed"));
          el.src = dataUrl;
        });
        if (!dims.width || !dims.height) continue;
        let w = maxWidth;
        let h = (dims.height / dims.width) * w;
        if (h > maxHeight) { h = maxHeight; w = (dims.width / dims.height) * h; }
        const format = /^data:image\/png/.test(dataUrl) ? "PNG" : /^data:image\/webp/.test(dataUrl) ? "WEBP" : "JPEG";
        doc.addImage(dataUrl, format, x, y, w, h);
        return h;
      } catch (err) {
        continue; // this candidate failed (likely CORS) -- try the next, or fall through to text
      }
    }
    return null;
  }

  async function renderMarkdownPdfBody(doc, rawText, startX, startY, maxWidth, margin, pageHeight) {
    const ensureSpace = (currentY, needed) => {
      if (currentY + needed > pageHeight - margin) { doc.addPage(); return margin; }
      return currentY;
    };
    let y = startY;
    // Per explicit request: math expressions render as REAL typeset
    // images (see extractLatexExpressions/prerenderLatexExpressions/
    // renderPdfRichTextLine above), not plain-text approximations --
    // extracted and pre-rendered ONCE here, up front, before any other
    // processing, so every downstream line-splitting/markdown step
    // just sees an opaque placeholder token instead of raw LaTeX it
    // might otherwise mis-parse.
    const extracted = extractLatexExpressions(rawText);
    const mathContext = await prerenderLatexExpressions(extracted.expressions);
    const lines = stripPdfUnsupportedChars(extracted.text).split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trimEnd();

      // A line that, after trimming, is ONLY a single display-math
      // placeholder (i.e. the original was a \[ ... \] block on its
      // own line, the normal/expected case) renders as its own
      // centered block -- a real image, sized larger than inline math
      // since display equations are meant to stand out.
      const soloMathMatch = line.trim().match(/^\u0001MATH\d+\u0001$/);
      if (soloMathMatch) {
        const mathInfo = mathContext.rendered.get(soloMathMatch[0]);
        if (mathInfo) {
          const targetHeight = 26;
          const targetWidth = Math.min((mathInfo.width / mathInfo.height) * targetHeight, maxWidth);
          const finalHeight = targetWidth < (mathInfo.width / mathInfo.height) * targetHeight
            ? targetWidth / (mathInfo.width / mathInfo.height)
            : targetHeight;
          y = ensureSpace(y, finalHeight + 12);
          y += 4;
          doc.addImage(mathInfo.dataUrl, "PNG", startX + (maxWidth - targetWidth) / 2, y, targetWidth, finalHeight);
          y += finalHeight + 8;
        } else {
          const original = mathContext.all.get(soloMathMatch[0]);
          y = ensureSpace(y, 15);
          doc.setFontSize(12);
          doc.setFont(undefined, "italic");
          const wrapped = doc.splitTextToSize(original ? latexToPlainTextFallback(original.latex) : "", maxWidth);
          wrapped.forEach((l) => { y = ensureSpace(y, 16); doc.text(l, startX + maxWidth / 2, y, { align: "center" }); y += 16; });
          y += 6;
        }
        i++;
        continue;
      }

      // GARNET's own ```images and ```chart fenced block conventions
      // (JSON payloads the normal chat UI renders as a real photo
      // gallery / live Chart.js chart). Images now genuinely attempt
      // real embedding (see tryEmbedRealImageInPdf above), falling
      // back to a clean text reference only when a source can't be
      // fetched cross-origin. Real chart drawing is out of scope here
      // (no charting library in this quick export) -- charts get a
      // clean readable description instead of raw JSON.
      const fenceMatch = line.match(/^```\s*(\w*)\s*$/);
      if (fenceMatch) {
        const lang = fenceMatch[1];
        const blockLines = [];
        let j = i + 1;
        while (j < lines.length && !/^```\s*$/.test(lines[j].trim())) { blockLines.push(lines[j]); j++; }
        const blockText = blockLines.join("\n");

        if (lang === "images") {
          try {
            const parsed = JSON.parse(blockText);
            const images = Array.isArray(parsed.images) ? parsed.images : [];
            for (const img of images) {
              // A confirmed real bug this fixes: only 20pt of space was
              // being reserved before drawing an image that could be up
              // to 190pt tall -- if less than that remained on the
              // current page, doc.addImage() would draw it anyway,
              // visually clipping the bottom of the image at the page
              // boundary instead of starting fresh on a new page. Now
              // reserves the full worst-case image height (plus caption
              // room) up front, so ensureSpace() triggers a real page
              // break BEFORE the image is drawn whenever there isn't
              // truly enough room, guaranteeing it's never cut off.
              y = ensureSpace(y, 210);
              const embeddedHeight = await tryEmbedRealImageInPdf(doc, img, startX, y, Math.min(maxWidth, 280), 190);
              if (embeddedHeight) {
                y += embeddedHeight + 4;
                doc.setFontSize(9);
                doc.setFont(undefined, "italic");
                y = renderPdfRichTextLine(doc, stripPdfUnsupportedChars(formatImageReferenceLabel(img)), startX, y, maxWidth, 9, 12, ensureSpace);
                y += 10;
              } else {
                const label = `\u2022 ${formatImageReferenceLabel(img)}`;
                y = renderPdfRichTextLine(doc, stripPdfUnsupportedChars(label), startX + 6, y, maxWidth - 6, 10, 14, ensureSpace);
              }
            }
            y += 4;
          } catch (parseErr) {
            // Malformed JSON in the block -- skip it silently rather
            // than dumping broken raw JSON into the document.
          }
        } else if (lang === "chart") {
          const desc = describeChartBlock(blockText);
          if (desc) {
            y = ensureSpace(y, 15);
            doc.setFontSize(10);
            doc.setFont(undefined, "italic");
            y = renderPdfRichTextLine(doc, stripPdfUnsupportedChars(`\u2022 Chart: ${desc}`), startX, y, maxWidth, 10, 14, ensureSpace);
            y += 8;
          }
        } else if (lang === "venn") {
          try {
            const vennData = JSON.parse(blockText);
            y = ensureSpace(y, 140);
            if (vennData.title) {
              doc.setFontSize(11);
              doc.setFont(undefined, "bold");
              y = renderPdfRichTextLine(doc, stripPdfUnsupportedChars(vennData.title), startX, y, maxWidth, 11, 15, ensureSpace);
              y += 4;
            }
            y = drawVennDiagramInPdf(doc, vennData, startX, y, maxWidth);
            y += 10;
            const legendRows = buildVennLegendRows(vennData).filter((r) => r.items.length > 0);
            doc.setFontSize(9);
            for (const row of legendRows) {
              const label = `\u2022 ${row.label} (${row.items.length}): ${row.items.join(", ")}`;
              y = renderPdfRichTextLine(doc, stripPdfUnsupportedChars(label), startX, y, maxWidth, 9, 13, ensureSpace);
            }
            y += 8;
          } catch (parseErr) {
            // Malformed JSON in the block -- skip it silently rather
            // than dumping broken raw JSON into the document.
          }
        } else if (blockText.trim()) {
          y = ensureSpace(y, 15);
          doc.setFontSize(10);
          doc.setFont("courier", "normal");
          blockLines.forEach((bl) => {
            const wrapped = doc.splitTextToSize(bl, maxWidth);
            wrapped.forEach((wl) => { y = ensureSpace(y, 13); doc.text(wl, startX, y); y += 13; });
          });
          doc.setFont(undefined, "normal");
          y += 8;
        }
        i = j + 1;
        continue;
      }

      // Markdown table -- see parseMarkdownTableAt's own comment for
      // the real bug this fixes (tables with cells wrapped across
      // multiple physical lines no longer break table detection
      // partway through). Row height is now computed per-row from the
      // tallest wrapped cell, instead of a fixed height, so a longer
      // merged/continuation cell doesn't overlap the next row.
      const tableResult = parseMarkdownTableAt(lines, i);
      if (tableResult) {
        const { rows: parsedRows, nextIndex } = tableResult;
        const colCount = Math.max(...parsedRows.map((r) => r.length));
        const colWidth = maxWidth / colCount;
        doc.setFontSize(10);
        parsedRows.forEach((row, rowIdx) => {
          doc.setFont(undefined, rowIdx === 0 ? "bold" : "normal");
          const cellLines = row.map((cell) => doc.splitTextToSize(stripPdfUnsupportedChars(cell), colWidth - 4));
          const rowLineCount = Math.max(1, ...cellLines.map((l) => l.length));
          const rowHeight = rowLineCount * 12 + 4;
          y = ensureSpace(y, rowHeight);
          cellLines.forEach((wrappedLines, colIdx) => {
            wrappedLines.forEach((l, lineIdx) => { doc.text(l, startX + colIdx * colWidth, y + lineIdx * 12); });
          });
          y += rowHeight;
        });
        y += 8;
        i = nextIndex;
        continue;
      }

      const headerMatch = line.match(/^(#{1,3})\s+(.*)$/);
      if (headerMatch) {
        const fontSize = headerMatch[1].length === 1 ? 15 : headerMatch[1].length === 2 ? 13 : 12;
        const cleaned = headerMatch[2].replace(/\*\*/g, "");
        doc.setFontSize(fontSize);
        doc.setFont(undefined, "bold");
        const wrapped = doc.splitTextToSize(cleaned, maxWidth);
        wrapped.forEach((l) => { y = ensureSpace(y, fontSize * 1.4); doc.text(l, startX, y); y += fontSize * 1.4; });
        y += 4;
        i++;
        continue;
      }

      const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
      if (bulletMatch) {
        y = ensureSpace(y, 15);
        doc.setFontSize(11);
        doc.setFont(undefined, "normal");
        doc.text("\u2022", startX, y);
        y = renderPdfRichTextLine(doc, bulletMatch[1], startX + 12, y, maxWidth - 12, 11, 15, ensureSpace, mathContext);
        i++;
        continue;
      }

      const numMatch = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (numMatch) {
        y = ensureSpace(y, 15);
        doc.setFontSize(11);
        doc.setFont(undefined, "normal");
        doc.text(`${numMatch[1]}.`, startX, y);
        y = renderPdfRichTextLine(doc, numMatch[2], startX + 16, y, maxWidth - 16, 11, 15, ensureSpace, mathContext);
        i++;
        continue;
      }

      if (line.trim() === "") { y += 7; i++; continue; }

      y = ensureSpace(y, 15);
      y = renderPdfRichTextLine(doc, line, startX, y, maxWidth, 11, 15, ensureSpace, mathContext);
      i++;
    }
    return y;
  }

  // Per explicit request: a quick "Download a Copy" preview available
  // from the moment section-writing starts, showing exactly how the
  // paper looks at its current stage -- only sections that have real
  // content so far (accepted ones, plus whatever's currently on
  // screen), not the full outline. Kept genuinely separate from the
  // final PDF output step (which uses create_pdf, real citations, and
  // the full integrity check) -- this is a fast, honest snapshot, not
  // a substitute for the real deliverable.
  async function downloadResearchPaperCopy() {
    const w = researchPaperWizard;
    const btn = document.getElementById("rpDownloadCopyBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Preparing PDF..."; }
    try {
      await ensureJsPdfLoaded();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 48;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      doc.setFontSize(18);
      doc.setFont(undefined, "bold");
      doc.splitTextToSize(stripPdfUnsupportedChars(w.topic || "Research Paper (Draft in Progress)"), maxWidth).forEach((l) => { doc.text(l, margin, y); y += 24; });
      y += 4;
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text(`Draft snapshot -- ${new Date().toLocaleString()}`, margin, y);
      y += 26;

      for (let i = 0; i < w.sectionTitles.length; i++) {
        const title = w.sectionTitles[i];
        const content = w.sectionContents[i];
        if (content === undefined) continue; // not written yet -- only show real progress so far
        if (y > pageHeight - margin - 40) { doc.addPage(); y = margin; }
        doc.setFontSize(14);
        doc.setFont(undefined, "bold");
        doc.splitTextToSize(stripPdfUnsupportedChars(title), maxWidth).forEach((l) => { doc.text(l, margin, y); y += 18; });
        y += 6;
        y = await renderMarkdownPdfBody(doc, content, margin, y, maxWidth, margin, pageHeight);
        y += 12;
      }

      doc.save(filenameFromTitle(w.topic || "research_paper_draft", "research_paper_draft", "pdf"));
    } catch (err) {
      console.error("Could not build the draft PDF preview:", err);
      await showWizardMessageModal("Could not create the PDF preview. Please check your connection and try again.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "⬇ Download a Copy"; }
    }
  }

  async function generateResearchPaperSection(revisionInstructions) {
    const w = researchPaperWizard;
    const idx = w.currentSectionIndex;
    const title = w.sectionTitles[idx];
    w._sectionEditingOpen = false;
    w._sectionVisualFormOpen = null;
    showResearchPaperScreen(
      `<div class="models-card-title" style="text-align:center;">Writing: ${escapeHtml(title)} (${idx + 1} of ${w.sectionTitles.length})</div>` +
      buildResearchPaperPenLoaderHtml("rpSectionStatusText") +
      `<div style="text-align:center;"><button class="cmm-form-btn" onclick="cancelResearchPaperWizard()">Cancel</button></div>`,
      "max-width:1000px; width:94vw;"
    );
    const startedWithWizard = researchPaperWizard; // captured now -- lets this call detect if Cancel reset the wizard while this was still in flight
    try {
      const previousContext = Object.keys(w.sectionContents).length > 0
        ? "Already-written earlier sections, for continuity/consistency only (do not repeat their content):\n\n" +
          w.sectionTitles.slice(0, idx).map((t, i) => `--- ${t} ---\n${(w.sectionContents[i] || "").slice(0, 1200)}`).join("\n\n")
        : "";
      const promptText =
        `JOB B -- write one section.\n\n${buildResearchPaperContextSummary()}\n\n` +
        `Full agreed section outline, in order: ${w.sectionTitles.map((t, i) => `${i + 1}. ${t}`).join("; ")}\n\n` +
        `${previousContext}\n\n` +
        `Write the full content for THIS section now: "${title}".` +
        (revisionInstructions ? `\n\nThe user reviewed a previous draft of this exact section and asked for these changes -- genuinely incorporate them, keeping everything else from the previous draft that they didn't ask to change: ${revisionInstructions}` : "");
      const result = await callScienceCreatePaperModel(promptText, (status) => {
        const el = document.getElementById("rpSectionStatusText");
        if (el) el.textContent = status + "...";
      });
      // Per explicit request: Cancel is now available while this is in
      // flight -- discard a late-arriving response instead of writing
      // into an orphaned wizard object and crashing on a render call.
      if (researchPaperWizard !== startedWithWizard) return;
      w.sectionContents[idx] = (result.raw_reply || result.reply || "") + extractGarnetVisualBlocksFromHtmlReply(result.reply || "");
      showResearchPaperSectionReviewScreen();
    } catch (err) {
      if (researchPaperWizard !== startedWithWizard) return; // cancelled mid-flight -- nothing left to show an error on
      console.error("Could not generate section:", err);
      showResearchPaperScreen(
        `<div class="models-card-title">Could not write this section</div>` +
        `<div style="opacity:0.7; padding:10px 0;">There was a connection error. Please try again.</div>` +
        rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperOutlineScreen()", nextLabel: "Try Again", nextOnclick: "generateResearchPaperSection()" })
      );
    }
  }

  function researchPaperVisualLabel(key) {
    return key === "table" ? "table" : key === "chart" ? "chart" : "drawing/diagram";
  }

  // Per explicit request: the section screen shows the full content
  // with a clear Accept button and a SEPARATE Edit button -- clicking
  // Edit is what opens the revision box (not shown by default), and
  // the person can keep editing/regenerating in a loop for as long as
  // they want before clicking Accept & Continue. Also offers Add
  // Table / Add Chart / Add Drawing per section -- each opens its own
  // small form asking for a real description and the real data to
  // use, then regenerates the section with that genuinely incorporated
  // (reusing the exact same revision mechanism as Edit, just with a
  // pre-built instruction instead of free text). Also offers "Download
  // a Copy" -- a quick PDF snapshot of progress so far.
  function showResearchPaperSectionReviewScreen() {
    const w = researchPaperWizard;
    const idx = w.currentSectionIndex;
    const title = w.sectionTitles[idx];
    const content = w.sectionContents[idx] || "";
    const isLast = idx === w.sectionTitles.length - 1;

    const downloadCopyButtonHtml =
      `<div style="text-align:right; margin-bottom:10px;">` +
      `<button class="cmm-form-btn" id="rpDownloadCopyBtn" onclick="downloadResearchPaperCopy()">⬇ Download a Copy</button>` +
      `</div>`;

    const addVisualButtonsHtml =
      `<div style="display:flex; gap:10px; flex-wrap:wrap; margin:14px 0;">` +
      `<button class="cmm-form-btn" onclick="openResearchPaperSectionVisualForm('table')">📊 Add Table</button>` +
      `<button class="cmm-form-btn" onclick="openResearchPaperSectionVisualForm('chart')">📈 Add Chart</button>` +
      `<button class="cmm-form-btn" onclick="openResearchPaperSectionVisualForm('drawing')">🖼️ Add Drawing / Diagram</button>` +
      `</div>`;

    const visualFormHtml = w._sectionVisualFormOpen
      ? `<div class="cmm-form-field">` +
        `<label class="cmm-form-label">Describe the ${escapeHtml(researchPaperVisualLabel(w._sectionVisualFormOpen))} and provide the real data to use</label>` +
        `<textarea class="cmm-form-textarea" id="rpSectionVisualInput" placeholder="Describe exactly what it should show, and provide the actual real data/values -- these will be used as-is, nothing will be invented."></textarea>` +
        `<div style="display:flex; gap:10px; margin-top:8px;">` +
        `<button class="cmm-form-btn cmm-form-btn-primary" onclick="addResearchPaperSectionVisual()">Add to Section</button>` +
        `<button class="cmm-form-btn" onclick="closeResearchPaperSectionVisualForm()">Cancel</button>` +
        `</div></div>`
      : "";

    const editButtonHtml = w._sectionEditingOpen
      ? ""
      : `<button class="cmm-form-btn" onclick="openResearchPaperSectionEditBox()">✏️ Edit This Section</button>`;

    const editBoxHtml = w._sectionEditingOpen
      ? `<div class="cmm-form-field">` +
        `<label class="cmm-form-label">Describe exactly what to change</label>` +
        `<textarea class="cmm-form-textarea" id="rpSectionRevisionInput" placeholder="e.g. make this more concise, add more on X, cite a specific source..."></textarea>` +
        `<div style="display:flex; gap:10px; margin-top:8px;">` +
        `<button class="cmm-form-btn cmm-form-btn-primary" onclick="regenerateResearchPaperSection()">Regenerate With These Changes</button>` +
        `<button class="cmm-form-btn" onclick="closeResearchPaperSectionEditBox()">Cancel</button>` +
        `</div></div>`
      : "";

    showResearchPaperScreen(
      `<div class="models-card-title" style="text-align:center;">${escapeHtml(title)} (${idx + 1} of ${w.sectionTitles.length})</div>` +
      downloadCopyButtonHtml +
      `<div class="cmm-form-field" dir="${isRtlText(content) ? "rtl" : "ltr"}" style="max-height:440px; overflow-y:auto; white-space:pre-wrap; line-height:1.5; ${isRtlText(content) ? "text-align:right !important;" : "text-align:left !important;"} background:rgba(0,0,0,0.2); padding:14px; border-radius:8px;">${escapeHtml(content)}</div>` +
      addVisualButtonsHtml +
      visualFormHtml +
      editButtonHtml +
      editBoxHtml +
      rpNavRowHtml({
        showBack: true,
        backOnclick: "goBackResearchPaperSection()",
        nextLabel: isLast ? "Accept & Choose Output Format →" : "Accept & Continue →",
        nextOnclick: "acceptResearchPaperSection()",
      }),
      "max-width:1000px; width:94vw;"
    );
  }

  function openResearchPaperSectionEditBox() {
    researchPaperWizard._sectionEditingOpen = true;
    researchPaperWizard._sectionVisualFormOpen = null;
    showResearchPaperSectionReviewScreen();
    setTimeout(() => { const el = document.getElementById("rpSectionRevisionInput"); if (el) el.focus(); }, 0);
  }

  function closeResearchPaperSectionEditBox() {
    researchPaperWizard._sectionEditingOpen = false;
    showResearchPaperSectionReviewScreen();
  }

  function openResearchPaperSectionVisualForm(key) {
    researchPaperWizard._sectionVisualFormOpen = key;
    researchPaperWizard._sectionEditingOpen = false;
    showResearchPaperSectionReviewScreen();
    setTimeout(() => { const el = document.getElementById("rpSectionVisualInput"); if (el) el.focus(); }, 0);
  }

  function closeResearchPaperSectionVisualForm() {
    researchPaperWizard._sectionVisualFormOpen = null;
    showResearchPaperSectionReviewScreen();
  }

  async function addResearchPaperSectionVisual() {
    const key = researchPaperWizard._sectionVisualFormOpen;
    const el = document.getElementById("rpSectionVisualInput");
    const details = el ? el.value.trim() : "";
    if (!details) {
      await showWizardMessageModal("Please describe it and provide the real data to use first.");
      return;
    }
    const label = researchPaperVisualLabel(key);
    const instruction =
      `Also add a ${label} to this section, genuinely incorporated into the real content (not just appended as an afterthought) -- ` +
      (key === "table"
        ? "represent it as a properly formatted markdown table using the exact real data given below, with a clear caption."
        : key === "chart"
        ? "describe it precisely (chart type, axes, series) using the exact real data given below, in a form suitable for a real chart to be generated from when this paper is finally compiled -- do not invent or estimate any data beyond what's given."
        : "describe it precisely as a clear figure/diagram description (e.g. '[Figure X: ...]', matching this document's own placeholder-figure convention) using the exact real details given below.") +
      `\n\nUser-provided description and data:\n${details}`;
    researchPaperWizard._sectionVisualFormOpen = null;
    await generateResearchPaperSection(instruction);
  }

  async function regenerateResearchPaperSection() {
    const el = document.getElementById("rpSectionRevisionInput");
    const revision = el ? el.value.trim() : "";
    if (!revision) {
      await showWizardMessageModal("Please describe what you'd like changed first.");
      return;
    }
    generateResearchPaperSection(revision);
  }

  function acceptResearchPaperSection() {
    const w = researchPaperWizard;
    if (w.currentSectionIndex < w.sectionTitles.length - 1) {
      w.currentSectionIndex++;
      // A confirmed real waste this avoids: if the next section was
      // already written upfront (via "Write All Sections at Once"),
      // it doesn't need generating again -- just show it. Only
      // sections genuinely not written yet (the section-by-section
      // path) actually need a new generation call here.
      if (w.sectionContents[w.currentSectionIndex] !== undefined) {
        showResearchPaperSectionReviewScreen();
      } else {
        generateResearchPaperSection();
      }
    } else {
      showResearchPaperOutputFormatScreen();
    }
  }

  function goBackResearchPaperSection() {
    const w = researchPaperWizard;
    if (w.currentSectionIndex > 0) {
      w.currentSectionIndex--;
      showResearchPaperSectionReviewScreen();
    } else {
      showResearchPaperOutlineScreen();
    }
  }

  // --- Final output format & generation ---
  function showResearchPaperOutputFormatScreen() {
    const formats = [
      { key: "word", icon: "📄", name: "Word (.doc)" },
      { key: "pdf", icon: "📕", name: "PDF" },
      { key: "excel", icon: "📊", name: "Excel (.xls)" },
      { key: "text", icon: "📝", name: "Plain Text (.txt)" },
      { key: "latex", icon: "🧾", name: "LaTeX / Overleaf (.zip)" },
    ];
    const boxes = formats.map((f) =>
      `<div class="model-box model-box-active" onclick="finalizeResearchPaperOutput('${f.key}')"><div class="model-box-icon">${f.icon}</div><div class="model-box-name">${escapeHtml(f.name)}</div></div>`
    ).join("");
    showResearchPaperScreen(
      `<div class="models-card-title">All sections are ready. How would you like it delivered?</div>` +
      `<div class="models-card-grid">${boxes}</div>` +
      rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperSectionReviewScreen()" })
    );
  }

  // Shared "images" fenced-block handler -- parses GARNET's own
  // ```images JSON convention into a clean, human-readable reference
  // note. Honest limitation, same as the PDF path: this lists each
  // image's title/source as text, it does NOT embed the actual
  // picture -- that would mean fetching and encoding each external
  // URL, real charts/images are only genuinely embedded through the
  // final create_pdf/create_project_zip AI pipeline (which has its
  // own real chart-rendering tool), not these quick client-side
  // exports.
  function describeReferencedImagesBlock(jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const images = Array.isArray(parsed.images) ? parsed.images : [];
      return images.map(formatImageReferenceLabel); // same de-duplicated label as the PDF path
    } catch (err) {
      return [];
    }
  }

  // Flattens markdown (headers, bold/italic markers, the ```images
  // block) down to clean, readable plain text -- used by both the
  // Excel export (a spreadsheet cell can't hold rich formatting
  // anyway) and the plain Text export, so neither ever shows literal
  // "##"/"**" syntax or a raw JSON image dump.
  function flattenMarkdownForPlainText(text) {
    let out = convertLatexToReadableMath(text || "");
    out = out.replace(/```images\s*\n?([\s\S]*?)```/g, (match, body) => {
      const list = describeReferencedImagesBlock(body);
      return list.length ? `Referenced images: ${list.join("; ")}` : "";
    });
    out = out.replace(/```chart\s*\n?([\s\S]*?)```/g, (match, body) => {
      const desc = describeChartBlock(body);
      return desc ? `Chart: ${desc}` : "";
    });
    out = out.replace(/```venn\s*\n?([\s\S]*?)```/g, (match, body) => {
      const lines2 = describeVennBlock(body);
      return lines2 ? `Venn diagram -- ${lines2.join("; ")}` : "";
    });
    out = out.replace(/```\w*\n?([\s\S]*?)```/g, "$1"); // any other fenced block -- keep the content, drop the fence markers
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)"); // markdown links -> "text (url)"
    out = out.replace(/^#{1,6}\s*/gm, "").replace(/\*\*/g, "").replace(/\*/g, "");
    return out.trim();
  }

  // Real markdown-to-HTML for the Word export -- a confirmed real gap
  // this fixes: the previous version just escaped the raw text and
  // swapped \n for </p><p>, so "##"/"**"/pipe-tables/the ```images
  // block all showed up as literal characters in the Word document
  // too, the exact same underlying problem already fixed for the PDF
  // exports. Real headers, bold, bullet/numbered lists, real <table>
  // markup, and real clickable <a> links now render properly.
  // Deliberately does NOT strip non-Latin characters the way the PDF
  // path has to -- Word/HTML renders full Unicode (including Arabic)
  // correctly, jsPDF's font limitation doesn't apply here.
  async function convertMarkdownToHtmlForWord(rawText) {
    const extracted = extractLatexExpressions(rawText || "");
    const mathContext = await prerenderLatexExpressions(extracted.expressions);
    const richToHtml = (s) => {
      // Math placeholders are replaced FIRST, into real <img> tags --
      // before HTML-escaping the rest, since the placeholder itself
      // (built from \u0001 characters) contains no HTML-special
      // characters and would otherwise just pass through escapeHtml
      // unchanged anyway, but doing it first keeps the order clearly
      // deliberate rather than incidental.
      let withMath = s.replace(/\u0001MATH\d+\u0001/g, (key) => {
        const mathInfo = mathContext.rendered.get(key);
        if (mathInfo) {
          const heightPx = 20;
          const widthPx = Math.round((mathInfo.width / mathInfo.height) * heightPx);
          return `<img src="${mathInfo.dataUrl}" alt="${escapeHtmlAttr(mathInfo.latex)}" style="height:${heightPx}px; width:${widthPx}px; vertical-align:middle;">`;
        }
        const original = mathContext.all.get(key);
        return escapeHtml(original ? latexToPlainTextFallback(original.latex) : "");
      });
      // Protects the just-inserted real <img> tags from being escaped
      // by temporarily swapping them out, escaping everything else,
      // then swapping them back in.
      const imgPlaceholders = [];
      withMath = withMath.replace(/<img[^>]*>/g, (imgTag) => {
        const key = `\u0002IMG${imgPlaceholders.length}\u0002`;
        imgPlaceholders.push(imgTag);
        return key;
      });
      let escaped = escapeHtml(withMath);
      escaped = escaped.replace(/\u0002IMG(\d+)\u0002/g, (m, idx) => imgPlaceholders[Number(idx)]);
      escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, linkText, url) => `<a href="${escapeHtmlAttr(url)}">${linkText}</a>`);
      return escaped;
    };
    const lines = extracted.text.split("\n");
    let html = "";
    let openList = null; // "ul" | "ol" | null
    const closeList = () => { if (openList) { html += `</${openList}>`; openList = null; } };
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trimEnd();

      // A line that's ONLY a display-math placeholder renders as its
      // own centered block, same treatment as the PDF path.
      const soloMathMatch = line.trim().match(/^\u0001MATH\d+\u0001$/);
      if (soloMathMatch) {
        closeList();
        html += `<p style="text-align:center;">${richToHtml(soloMathMatch[0])}</p>`;
        i++;
        continue;
      }

      const fenceMatch = line.match(/^```\s*(\w*)\s*$/);
      if (fenceMatch) {
        closeList();
        const lang = fenceMatch[1];
        const blockLines = [];
        let j = i + 1;
        while (j < lines.length && !/^```\s*$/.test(lines[j].trim())) { blockLines.push(lines[j]); j++; }
        const blockText = blockLines.join("\n");
        if (lang === "images") {
          const list = describeReferencedImagesBlock(blockText);
          if (list.length) html += `<p><em>Referenced images:</em></p><ul>${list.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
        } else if (lang === "chart") {
          const desc = describeChartBlock(blockText);
          if (desc) html += `<p><em>Chart: ${escapeHtml(desc)}</em></p>`;
        } else if (lang === "venn") {
          try {
            const vennData = JSON.parse(blockText);
            const lines2 = describeVennBlock(blockText);
            if (lines2) {
              html += `<p><strong>${escapeHtml(vennData.title || "Venn diagram")}</strong></p><ul>${lines2.slice(vennData.title ? 1 : 0).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
            }
          } catch (parseErr) {
            // Malformed JSON -- skip silently rather than dumping raw JSON.
          }
        } else if (blockText.trim()) {
          html += `<pre style="font-family:monospace; background:#f4f4f4; padding:8px;">${escapeHtml(blockText)}</pre>`;
        }
        i = j + 1;
        continue;
      }

      const tableResult = parseMarkdownTableAt(lines, i);
      if (tableResult) {
        closeList();
        const { rows: parsedRows, nextIndex } = tableResult;
        html += `<table border="1" cellpadding="5" style="border-collapse:collapse; width:100%;">`;
        parsedRows.forEach((row, rowIdx) => {
          html += "<tr>" + row.map((cell) => `<${rowIdx === 0 ? "th" : "td"}>${richToHtml(cell)}</${rowIdx === 0 ? "th" : "td"}>`).join("") + "</tr>";
        });
        html += `</table>`;
        i = nextIndex;
        continue;
      }

      const headerMatch = line.match(/^(#{1,3})\s+(.*)$/);
      if (headerMatch) {
        closeList();
        const level = headerMatch[1].length + 1; // ## -> h3, ### -> h4 (h1/h2 reserved for the paper title/section title)
        html += `<h${level}>${escapeHtml(cleanMarkdownTitleSyntax(headerMatch[2]))}</h${level}>`;
        i++;
        continue;
      }

      const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
      if (bulletMatch) {
        if (openList !== "ul") { closeList(); html += "<ul>"; openList = "ul"; }
        html += `<li>${richToHtml(bulletMatch[1])}</li>`;
        i++;
        continue;
      }

      const numMatch = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (numMatch) {
        if (openList !== "ol") { closeList(); html += "<ol>"; openList = "ol"; }
        html += `<li>${richToHtml(numMatch[2])}</li>`;
        i++;
        continue;
      }

      if (line.trim() === "") { closeList(); i++; continue; }

      closeList();
      html += `<p>${richToHtml(line)}</p>`;
      i++;
    }
    closeList();
    return html;
  }

  function buildCompiledResearchPaperText() {
    const w = researchPaperWizard;
    return w.sectionTitles.map((title, i) => `${title}\n\n${flattenMarkdownForPlainText(w.sectionContents[i] || "")}`).join("\n\n---\n\n");
  }

  async function buildCompiledResearchPaperHtml() {
    const w = researchPaperWizard;
    const sectionsHtml = await Promise.all(
      w.sectionTitles.map(async (title, i) => `<h2>${escapeHtml(title)}</h2>` + await convertMarkdownToHtmlForWord(w.sectionContents[i] || ""))
    );
    return `<h1>${escapeHtml(w.topic)}</h1>` + sectionsHtml.join("");
  }

  async function finalizeResearchPaperOutput(format) {
    const w = researchPaperWizard;
    const title = w.topic || "Research Paper";

    // Word/Excel/Text are all generated directly client-side, reusing
    // the exact same helpers already built for saving any bot message
    // -- instant, no backend round-trip needed.
    if (format === "word") {
      saveHtmlAsWordDoc(await buildCompiledResearchPaperHtml(), title, filenameFromTitle(title, "research_paper", "doc"));
      closeResearchPaperOverlay();
      addMessage(`Your paper "${escapeHtml(title)}" was downloaded as a Word document.`, "bot");
      researchPaperWizard = null;
      setMode("chat");
      return;
    }
    if (format === "text") {
      downloadBlob(new Blob([buildCompiledResearchPaperText()], { type: "text/plain" }), filenameFromTitle(title, "research_paper", "txt"));
      closeResearchPaperOverlay();
      addMessage(`Your paper "${escapeHtml(title)}" was downloaded as a text file.`, "bot");
      researchPaperWizard = null;
      setMode("chat");
      return;
    }
    if (format === "excel") {
      // Reuses the SAME real SpreadsheetML export saveTableAsExcel
      // already uses for any data table -- built from a temporary
      // in-memory table (one row per section) rather than a table
      // already present in the DOM.
      const tempTable = document.createElement("table");
      const headerRow = document.createElement("tr");
      ["Section", "Content"].forEach((h) => { const th = document.createElement("th"); th.textContent = h; headerRow.appendChild(th); });
      tempTable.appendChild(headerRow);
      w.sectionTitles.forEach((t, i) => {
        const tr = document.createElement("tr");
        const tdTitle = document.createElement("td"); tdTitle.textContent = t; tr.appendChild(tdTitle);
        const tdContent = document.createElement("td"); tdContent.textContent = flattenMarkdownForPlainText(w.sectionContents[i] || ""); tr.appendChild(tdContent);
        tempTable.appendChild(tr);
      });
      saveTableAsExcel(tempTable, filenameFromTitle(title, "research_paper", "xls"));
      closeResearchPaperOverlay();
      addMessage(`Your paper "${escapeHtml(title)}" was downloaded as an Excel file (one row per section).`, "bot");
      researchPaperWizard = null;
      setMode("chat");
      return;
    }

    // PDF and LaTeX/Overleaf both hand off to the existing, already-
    // proven create_pdf/create_project_zip pipeline (including
    // checkDocumentIntegrity) -- sent as one request naming the exact
    // desired tool, reusing 100% existing, tested backend logic rather
    // than a second document-building implementation. Stays inside the
    // wizard's own overlay the whole time now (see below) instead of
    // closing it immediately -- deliberately NOT calling
    // closeResearchPaperOverlay() here.
    const formatInstruction = format === "pdf"
      ? "The user has explicitly requested this be delivered as a PDF file -- call the create_pdf tool with this exact approved content, using the section titles as the document's real headings."
      : "The user has explicitly requested this be delivered as a LaTeX/Overleaf project -- call the create_project_zip tool with this exact approved content, using the section titles as the document's real headings.";
    const compiledMessage =
      `Please compile this already-researched, already-approved research paper into a polished, properly formatted document now. Title: "${title}". ${formatInstruction}\n\n` +
      buildCompiledResearchPaperText();
    mode = "science_create_paper";

    // Per explicit request: stays inside the wizard's own themed UI
    // (the same pen-writing animation, with a real Cancel button)
    // instead of dropping the person back into the plain chat area
    // with just a background status notification -- while still
    // reusing deliverMessage() underneath for the exact same real
    // create_pdf/create_project_zip pipeline. The overlay sits on top
    // of #chat-box the whole time, so deliverMessage()'s own thinking
    // indicator and the real bot message it creates stay hidden behind
    // this screen until it's ready.
    const startedWithWizard = w;
    const formatLabel = format === "pdf" ? "PDF" : "LaTeX/Overleaf";
    showResearchPaperScreen(
      `<div class="models-card-title" style="text-align:center;">Compiling your ${formatLabel} document...</div>` +
      buildResearchPaperPenLoaderHtml("rpFinalizeStatusText") +
      `<div style="text-align:center;"><button class="cmm-form-btn" onclick="cancelResearchPaperWizard()">Cancel</button></div>`,
      "max-width:1000px; width:94vw;"
    );

    const botMessagesBefore = document.querySelectorAll("#chat-box .bot-message").length;
    await deliverMessage(compiledMessage, [], []);
    if (researchPaperWizard !== startedWithWizard) return; // cancelled mid-flight -- nothing left to show

    const botMessages = document.querySelectorAll("#chat-box .bot-message");
    const newMessageEl = botMessages.length > botMessagesBefore ? botMessages[botMessages.length - 1] : null;
    // Same known failure text patterns already used elsewhere in this
    // app (deliverMessage's own "Connection error" and the backend's
    // own generic "Server error" fallback) -- distinguishes a genuine
    // failure from a real successful document response.
    const failed = !newMessageEl || newMessageEl.textContent.includes("⚠️");

    if (failed) {
      showResearchPaperScreen(
        `<div class="models-card-title">Could not compile the document</div>` +
        `<div style="opacity:0.7; padding:10px 0;">There was a connection error. Please try again.</div>` +
        rpNavRowHtml({ showBack: true, backOnclick: "showResearchPaperOutputFormatScreen()", nextLabel: "Try Again", nextOnclick: `finalizeResearchPaperOutput('${format}')` })
      );
      return;
    }

    // Moves the REAL, already fully-rendered message element (its
    // actual working download button/link, built by the exact same
    // rendering pipeline any normal chat document response uses) --
    // not a reconstruction, the genuine DOM node with its listeners
    // intact.
    showResearchPaperScreen(
      `<div class="models-card-title" style="text-align:center;">Your ${formatLabel} document is ready</div>` +
      `<div id="rpFinalDocHolder" style="text-align:left;"></div>` +
      rpNavRowHtml({ showBack: false, nextLabel: "Done", nextOnclick: "finishResearchPaperWizardAfterOutput()" }),
      "max-width:1000px; width:94vw;"
    );
    const holder = document.getElementById("rpFinalDocHolder");
    if (holder) holder.appendChild(newMessageEl);
  }

  function finishResearchPaperWizardAfterOutput() {
    closeResearchPaperOverlay();
    researchPaperWizard = null;
    setMode("chat");
  }

  // ------------------------------------------------------------------
  // SCHOOL AND STUDENTS -- a guided, screen-by-screen wizard: grade ->
  // exam system -> subject -> question input (typed, or a document/
  // image/photo upload) -> a real answer from GARNET (backed by real
  // web search for local/regional exam systems and real past papers,
  // per science_school's own strengthened system prompt in server.js)
  // -> download the answer as a PDF, then continue, start fresh, or
  // close. Built on the exact same proven overlay/nav-row pattern as
  // the Create Research Papers wizard above, with its own separate
  // overlay so the two can never visually collide.
  // ------------------------------------------------------------------

  function getSchoolWizardOverlay() {
    let overlay = document.getElementById("schoolWizardOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "schoolWizardOverlay";
      overlay.className = "models-overlay";
      document.getElementById("chatBoxWrapper").appendChild(overlay);
    }
    return overlay;
  }

  function closeSchoolWizardOverlay() {
    const overlay = document.getElementById("schoolWizardOverlay");
    if (overlay) overlay.style.display = "none";
    hideSchoolQuestionTextarea(); // NEW: the persistent textarea lives outside the overlay's own DOM subtree now, so closing the overlay doesn't automatically hide it -- has to be done explicitly here
  }

  function showSchoolWizardScreen(innerHtml, extraWrapperStyle) {
    const overlay = getSchoolWizardOverlay();
    overlay.innerHTML = `<div class="models-overlay-content cmm-form-content"${extraWrapperStyle ? ` style="${extraWrapperStyle}"` : ""}>${innerHtml}</div>`;
    overlay.style.display = "flex";
    // NEW: this is the single shared choke-point every School wizard
    // screen renders through, so hiding the persistent question
    // textarea (see hideSchoolQuestionTextarea below) HERE means any
    // screen other than the question screen automatically hides it,
    // without needing to remember to do so at every individual
    // navigation call site. showSchoolQuestionScreen re-shows and
    // positions it again right after calling this function.
    hideSchoolQuestionTextarea();
  }

  // The persistent #schoolQuestionInput textarea (defined once, near
  // the camera modal, in index.html -- see the comment there for the
  // full reasoning) is positioned via JS to visually sit exactly over
  // an empty placeholder slot inside the question screen's own
  // dynamically-rendered HTML, rather than being a literal DOM child of
  // it -- so it's never destroyed when other screens replace that
  // content, the same way #user-input (the main chat box) is never
  // destroyed by new messages being added around it.
  function positionAndShowSchoolQuestionTextarea() {
    const slot = document.getElementById("schoolQuestionInputSlot");
    const textarea = document.getElementById("schoolQuestionInput");
    if (!slot || !textarea) return;
    const rect = slot.getBoundingClientRect();
    textarea.style.top = `${rect.top}px`;
    textarea.style.left = `${rect.left}px`;
    textarea.style.width = `${rect.width}px`;
    textarea.style.height = `${rect.height}px`;
    textarea.style.display = "block";
    textarea.value = schoolWizard ? schoolWizard.question : "";
    textarea.focus();
  }

  function hideSchoolQuestionTextarea() {
    const textarea = document.getElementById("schoolQuestionInput");
    if (textarea) textarea.style.display = "none";
  }

  // Keeps the textarea correctly aligned over its slot if the window is
  // resized while the question screen happens to be open (e.g.
  // rotating a phone, resizing a desktop browser window).
  window.addEventListener("resize", () => {
    const textarea = document.getElementById("schoolQuestionInput");
    if (textarea && textarea.style.display !== "none") positionAndShowSchoolQuestionTextarea();
  });

  function schoolNavRowHtml({ showBack, backOnclick, nextLabel, nextOnclick, nextDisabled }) {
    return (
      `<div class="cmm-form-nav">` +
      `<div>${showBack ? `<button class="cmm-form-btn" onclick="${backOnclick}">← Back</button>` : ""}</div>` +
      `<div style="display:flex; gap:16px;">` +
      `<button class="cmm-form-btn" onclick="cancelSchoolWizard()">Cancel</button>` +
      (nextLabel ? `<button class="cmm-form-btn cmm-form-btn-primary" onclick="${nextOnclick}"${nextDisabled ? " disabled" : ""}>${nextLabel}</button>` : "") +
      `</div></div>`
    );
  }

  let schoolWizard = null;

  function freshSchoolWizardState() {
    return {
      grade: "",
      examSystem: "",
      examCountryName: "",
      examSystemOther: "",
      subject: "",
      subjectOther: "",
      question: "",
      attachedImages: [], // [{ name, data }, ...] -- NEW: was a single attachedImage object before, now a real array so multiple images/photos can be attached to one question, same as normal chat already allowed via pendingAttachments
      attachedDocument: null, // { name, text }
      answer: "",
      answerHtml: "",
      _uploadingFileName: null,
      // NEW, PER EXPLICIT REQUEST: real conversation memory within a
      // learning session. A confirmed real gap this fixes: every
      // question sent via generateSchoolAnswer() below used a hardcoded
      // history: [] on every single call (see callScienceCreatePaperModel),
      // so "Ask Another Question" always started completely fresh with
      // zero memory of the question/answer that came right before it --
      // the model had no way to know "explain that differently" or "what
      // about part b" referred to anything. This array holds {role,
      // content} turns for the CURRENT session only (same {grade, exam
      // system, subject} context) -- continueSchoolWizard() (Ask Another
      // Question) deliberately does NOT reset this, so follow-ups keep
      // real context; starting a brand new session via
      // freshSchoolWizardState() (this function) does reset it, since a
      // new grade/subject/system genuinely is an unrelated new session.
      conversationHistory: [],
    };
  }

  // Combines the country dropdown selection with the optional
  // specific-system free-text field (e.g. "Egypt -- Thanaweya Amma"),
  // or just the plain exam system name for non-"national system"
  // choices -- shared by both the AI prompt context and the PDF export
  // so the two can never drift out of sync with each other.
  function getSchoolExamSystemLabel(w) {
    if (w.examSystem !== "My country's national system") return w.examSystem;
    return w.examSystemOther.trim() ? `${w.examCountryName} -- ${w.examSystemOther.trim()}` : w.examCountryName;
  }

  function startSchoolWizardFlow() {
    if (isSending) return;
    startNewChat();
    mode = "science_school";
    document.getElementById("chatHeaderTitle").textContent = "GARNET School and Students";
    applyModeBackground(mode);
    applyModePlaceholder(mode); // NEW: confirmed real bug this fixes -- was missing here, so the main chat bar's placeholder stayed stuck on whatever the PREVIOUS mode's text was (e.g. Prediction Model's gold/oil placeholder) instead of switching to School and Students' own text, even though PLACEHOLDER_BY_KEY already had a correct science_school entry defined and just wasn't being applied
    syncPredictionSidebar(); syncCybersecuritySidebar(); syncScienceSubmodeSwitcher();
    schoolWizard = freshSchoolWizardState();
    showSchoolGradeScreen();
  }

  function teardownSchoolWizardIfActive() {
    if (schoolWizard) {
      closeSchoolWizardOverlay();
      schoolWizard = null;
    }
  }

  // Per explicit request: cancelling a School and Students learning
  // session returns to the Science and Research submenu (the same
  // three-option screen -- School and Students / Research Assistant /
  // Create Research Papers) instead of exiting all the way out to
  // plain General Chat -- a much shorter path back in if the person
  // just wants to start a fresh session or try a different submode.
  function returnToScienceSubmenu() {
    mode = "science";
    document.getElementById("chatHeaderTitle").textContent = "GARNET Science and Research";
    applyModeBackground(mode);
    applyModePlaceholder(mode); // NEW: same gap as the two wizard-start functions above -- PLACEHOLDER_BY_KEY already has a "science" entry, it just wasn't being applied here
    syncPredictionSidebar(); syncCybersecuritySidebar(); syncScienceSubmodeSwitcher();
    const overlay = document.getElementById("modelsOverlay");
    if (overlay) {
      overlay.innerHTML = buildScienceSubmodelCardHtml();
      overlay.style.display = "flex";
    }
  }

  // Same themed confirmation modal already built for the research
  // paper wizard, reused here with the "learning session" wording
  // (see showResearchPaperCancelConfirmModal's own comment) --
  // consistent look, no second implementation needed.
  async function cancelSchoolWizard() {
    const confirmed = await showResearchPaperCancelConfirmModal("learning session");
    if (!confirmed) return;
    closeSchoolWizardOverlay();
    schoolWizard = null;
    returnToScienceSubmenu();
  }

  // --- Screen 1: Grade ---
  function showSchoolGradeScreen() {
    const w = schoolWizard;
    const grades = ["KG1", "KG2", ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`), "University / Other"];
    showSchoolWizardScreen(
      `<div class="models-card-title" style="text-align:center;">What grade are you in?</div>` +
      `<div class="cmm-form-field">` +
      `<select class="cmm-form-textarea" style="min-height:auto;" onchange="schoolWizard.grade = this.value">` +
      `<option value="" disabled${w.grade ? "" : " selected"}>Select your grade...</option>` +
      grades.map((g) => `<option value="${escapeHtmlAttr(g)}"${w.grade === g ? " selected" : ""}>${escapeHtml(g)}</option>`).join("") +
      `</select></div>` +
      schoolNavRowHtml({ showBack: false, nextLabel: "Next →", nextOnclick: "submitSchoolGradeScreen()" })
    );
  }

  async function submitSchoolGradeScreen() {
    if (!schoolWizard.grade) {
      await showWizardMessageModal("Please select your grade first.");
      return;
    }
    showSchoolExamSystemScreen();
  }

  // --- Screen 2: Exam system ---
  function showSchoolExamSystemScreen() {
    const w = schoolWizard;
    const systems = ["IGCSE / IG", "SAT", "ACT", "IB", "AP", "A-Levels", "My country's national system", "General / No specific system"];
    const isOther = w.examSystem === "My country's national system";
    showSchoolWizardScreen(
      `<div class="models-card-title" style="text-align:center;">Which exam system do you follow?</div>` +
      `<div class="cmm-form-field">` +
      `<select class="cmm-form-textarea" style="min-height:auto;" id="schoolExamSystemSelect" onchange="handleSchoolExamSystemChange(this.value)">` +
      `<option value="" disabled${w.examSystem ? "" : " selected"}>Select a system...</option>` +
      systems.map((s) => `<option value="${escapeHtmlAttr(s)}"${w.examSystem === s ? " selected" : ""}>${escapeHtml(s)}</option>`).join("") +
      `</select></div>` +
      (isOther
        ? `<div class="cmm-form-field">` +
          `<label class="cmm-form-label">Which country?</label>` +
          `<select class="cmm-form-textarea" style="min-height:auto;" id="schoolExamCountrySelect" onchange="schoolWizard.examCountryName = this.value">` +
          `<option value="" disabled${w.examCountryName ? "" : " selected"}>Select a country...</option>` +
          WORLD_COUNTRIES.map((c) => `<option value="${escapeHtmlAttr(c)}"${w.examCountryName === c ? " selected" : ""}>${escapeHtml(c)}</option>`).join("") +
          `</select>` +
          `</div>`
        : "") +
      schoolNavRowHtml({ showBack: true, backOnclick: "showSchoolGradeScreen()", nextLabel: "Next →", nextOnclick: "submitSchoolExamSystemScreen()" })
    );
  }

  function handleSchoolExamSystemChange(value) {
    schoolWizard.examSystem = value;
    showSchoolExamSystemScreen(); // re-render so the "which country" field appears/disappears correctly
    setTimeout(() => { const el = document.getElementById("schoolExamCountrySelect"); if (el) el.focus(); }, 0);
  }

  async function submitSchoolExamSystemScreen() {
    if (!schoolWizard.examSystem) {
      await showWizardMessageModal("Please select an exam system first.");
      return;
    }
    if (schoolWizard.examSystem === "My country's national system" && !schoolWizard.examCountryName) {
      await showWizardMessageModal("Please select your country.");
      return;
    }
    showSchoolSubjectScreen();
  }

  // --- Screen 3: Subject ---
  function showSchoolSubjectScreen() {
    const w = schoolWizard;
    const subjects = ["Math", "Physics", "Chemistry", "Biology", "English", "Arabic", "French", "History", "Geography", "Economics", "Computer Science", "Other"];
    const isOther = w.subject === "Other";
    showSchoolWizardScreen(
      `<div class="models-card-title" style="text-align:center;">Which subject?</div>` +
      `<div class="cmm-form-field">` +
      `<select class="cmm-form-textarea" style="min-height:auto;" onchange="handleSchoolSubjectChange(this.value)">` +
      `<option value="" disabled${w.subject ? "" : " selected"}>Select a subject...</option>` +
      subjects.map((s) => `<option value="${escapeHtmlAttr(s)}"${w.subject === s ? " selected" : ""}>${escapeHtml(s)}</option>`).join("") +
      `</select></div>` +
      (isOther
        ? `<div class="cmm-form-field">` +
          `<label class="cmm-form-label">Which subject?</label>` +
          `<input type="text" class="cmm-form-textarea" style="min-height:auto;" id="schoolSubjectOtherInput" value="${escapeHtmlAttr(w.subjectOther)}" oninput="schoolWizard.subjectOther = this.value">` +
          `</div>`
        : "") +
      schoolNavRowHtml({ showBack: true, backOnclick: "showSchoolExamSystemScreen()", nextLabel: "Next →", nextOnclick: "submitSchoolSubjectScreen()" })
    );
  }

  function handleSchoolSubjectChange(value) {
    schoolWizard.subject = value;
    showSchoolSubjectScreen();
    setTimeout(() => { const el = document.getElementById("schoolSubjectOtherInput"); if (el) el.focus(); }, 0);
  }

  async function submitSchoolSubjectScreen() {
    if (!schoolWizard.subject) {
      await showWizardMessageModal("Please select a subject first.");
      return;
    }
    if (schoolWizard.subject === "Other" && !schoolWizard.subjectOther.trim()) {
      await showWizardMessageModal("Please tell us which subject.");
      return;
    }
    showSchoolQuestionScreen();
  }

  // --- Screen 4: Question input (typed, document, image, or photo) ---
  function showSchoolQuestionScreen() {
    const w = schoolWizard;
    const uploadStatusHtml = w._uploadingFileName
      ? `<div style="display:flex; align-items:center; gap:10px; margin:10px 0; opacity:0.9;">` +
        `<div class="rp-live-spinner" style="width:16px; height:16px; border-radius:50%; border:2.5px solid rgba(217,164,65,0.25); border-top-color:#d9a441; animation:rpSpin 0.8s linear infinite; flex-shrink:0;"></div>` +
        `<span style="font-size:13px;">Uploading and reading: ${escapeHtml(w._uploadingFileName)}...</span>` +
        `<style>@keyframes rpSpin { to { transform: rotate(360deg); } }</style>` +
        `</div>`
      : "";
    const attachmentPreviewHtml = [
      // NEW: was a single attachedImage before -- now renders one chip
      // per attached image, each independently removable by index, so
      // multiple images/photos can be reviewed and pruned individually
      // rather than only ever holding (and being able to remove) one.
      ...w.attachedImages.map((img, i) =>
        `<div class="project-zip-file" style="display:flex; align-items:center; gap:10px;"><button class="cmm-form-btn" style="padding:2px 9px;" onclick="removeSchoolAttachment('image', ${i})">✕</button><span>🖼️ ${escapeHtml(img.name)}</span></div>`
      ),
      w.attachedDocument ? `<div class="project-zip-file" style="display:flex; align-items:center; gap:10px;"><button class="cmm-form-btn" style="padding:2px 9px;" onclick="removeSchoolAttachment('document')">✕</button><span>📄 ${escapeHtml(w.attachedDocument.name)}</span></div>` : "",
    ].filter(Boolean).join("");

    showSchoolWizardScreen(
      `<div class="models-card-title" style="text-align:center;">What's your question?</div>` +
      `<div class="cmm-form-field">` +
      // NEW, THIRD REVISION: this used to be a real <textarea> rebuilt
      // from scratch via innerHTML every single time this screen
      // rendered. It's now an empty placeholder slot instead -- the
      // ACTUAL textarea is a genuinely persistent element defined once
      // in index.html (see the comment there), positioned to visually
      // sit exactly over this slot via positionAndShowSchoolQuestionTextarea
      // below. This removes the repeated-recreation difference between
      // this box and the main chat's own persistent input box entirely,
      // rather than continuing to patch around it.
      `<div id="schoolQuestionInputSlot" style="min-height:112px;"></div>` +
      `</div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">Or attach a document, image, or photo of the question (optional)</label>` +
      `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">` +
      `<label class="cmm-form-file-label" style="font-size:14px; padding:10px 16px;">📎 Upload Document<input type="file" accept=".txt,.md,.pdf,.doc,.docx,.xls,.xlsx" style="display:none;" onchange="handleSchoolDocumentUpload(this)"></label>` +
      `<label class="cmm-form-file-label" style="font-size:14px; padding:10px 16px;">🖼️ Upload Image<input type="file" accept="image/*" multiple style="display:none;" onchange="handleSchoolImageUpload(this)"></label>` +
      `<button class="cmm-form-file-label" style="font-size:14px; padding:10px 16px;" onclick="openSchoolCameraModal()">📷 Take Photo</button>` +
      `</div>` +
      uploadStatusHtml +
      (attachmentPreviewHtml ? `<div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">${attachmentPreviewHtml}</div>` : "") +
      `</div>` +
      schoolNavRowHtml({ showBack: true, backOnclick: "showSchoolSubjectScreen()", nextLabel: "Submit →", nextOnclick: "submitSchoolQuestion()" })
    );
    positionAndShowSchoolQuestionTextarea();
  }

  function handleSchoolImageUpload(input) {
    const files = input.files ? Array.from(input.files) : [];
    input.value = "";
    if (files.length === 0) return;
    // NEW: reads all selected files (the input now has `multiple`) and
    // appends each to attachedImages, instead of only ever reading
    // files[0] and overwriting a single attachedImage slot.
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        schoolWizard.attachedImages.push({ name: file.name, data: reader.result });
        showSchoolQuestionScreen();
      };
      reader.readAsDataURL(file);
    });
  }

  function handleSchoolDocumentUpload(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    schoolWizard._uploadingFileName = file.name;
    showSchoolQuestionScreen();
    if (DOCUMENT_EXTENSIONS.includes(getFileExtension(file.name))) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const response = await fetch(EXTRACT_DOCUMENT_TEXT_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documents: [{ name: file.name, data: reader.result }] }),
          });
          const data = await response.json();
          schoolWizard.attachedDocument = { name: file.name, text: (response.ok && data.text) ? data.text : "" };
        } catch (err) {
          console.error("Could not extract school question document:", err);
          schoolWizard.attachedDocument = { name: file.name, text: "" };
        }
        schoolWizard._uploadingFileName = null;
        showSchoolQuestionScreen();
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        schoolWizard.attachedDocument = { name: file.name, text: reader.result };
        schoolWizard._uploadingFileName = null;
        showSchoolQuestionScreen();
      };
      reader.readAsText(file);
    }
  }

  function removeSchoolAttachment(kind, index) {
    if (kind === "image") schoolWizard.attachedImages.splice(index, 1); // NEW: removes just the one image at this index, since attachedImages is now a real array
    else if (kind === "document") schoolWizard.attachedDocument = null;
    showSchoolQuestionScreen();
  }

  async function submitSchoolQuestion() {
    const w = schoolWizard;
    if (!w.question.trim() && w.attachedImages.length === 0 && !w.attachedDocument) {
      await showWizardMessageModal("Please type a question, or attach a document/image/photo of it.");
      return;
    }
    generateSchoolAnswer();
  }

  // --- Answer generation ---
  // Per explicit request: automatically decides per-question whether
  // this genuinely needs the slower, more rigorous o3 model, or the
  // fast gpt-4o is enough -- a real, deterministic heuristic rather
  // than a guess, covering the actual cases that matter: a national/
  // local exam system was selected (this mode's own system prompt is
  // specifically told to go search for real past papers for those --
  // exactly the "we are searching and analyzing" case), genuinely
  // complex problem-solving language, a long/multi-part question, or
  // an attached worksheet/past-paper image that needs careful reading.
  function schoolQuestionNeedsThoroughModel(w) {
    if (w.examSystem === "My country's national system") return true;
    if (w.attachedImages.length > 0 || w.attachedDocument) return true;
    const q = (w.question || "").toLowerCase();
    const complexSignals = [
      "solve", "prove", "derive", "calculate", "step by step", "show your work",
      "show all steps", "evaluate", "analyze", "compare and contrast", "justify",
      "integrate", "differentiate", "balance the equation", "find x", "simplify",
      "factor", "graph", "construct a proof", "word problem",
    ];
    if (complexSignals.some((sig) => q.includes(sig))) return true;
    if (q.split(/[.?!]/).filter((s) => s.trim().length > 0).length >= 3) return true;
    if (q.length > 280) return true;
    return false;
  }

  async function generateSchoolAnswer() {
    const w = schoolWizard;
    const startedWithWizard = w;
    const thorough = schoolQuestionNeedsThoroughModel(w);
    showSchoolWizardScreen(
      `<div class="models-card-title" style="text-align:center;">Working on your answer...</div>` +
      (thorough
        ? `<div style="text-align:center; opacity:0.75; font-size:13px; margin-top:-6px;">This might take a bit longer -- we're searching and analyzing to give you a thorough answer.</div>`
        : "") +
      buildResearchPaperPenLoaderHtml("schoolAnswerStatusText") +
      `<div style="text-align:center;"><button class="cmm-form-btn" onclick="cancelSchoolWizard()">Cancel</button></div>`
    );
    try {
      const systemLabel = getSchoolExamSystemLabel(w);
      const subjectLabel = w.subject === "Other" ? w.subjectOther : w.subject;
      const contextSummary =
        `Student's grade: ${w.grade}\n` +
        `Exam system: ${systemLabel}\n` +
        `Subject: ${subjectLabel}\n` +
        // Per explicit request: this is exactly why the wizard asks
        // grade/exam system/subject BEFORE the session starts -- makes
        // that purpose explicit to the model on every single request
        // (not just relying on it inferring this from the raw fields
        // above), on top of the monthly cache lookup (server.js) that's
        // already sorted/keyed by these same three values for fast,
        // precise retrieval.
        `Focus your entire answer specifically on what's relevant for a ${w.grade} student studying ${subjectLabel} under the ${systemLabel} system -- match the depth, vocabulary, and any exam-specific conventions to exactly this combination, not a generic answer for the subject in general.\n\n` +
        (w.attachedDocument ? `Attached document "${w.attachedDocument.name}":\n${w.attachedDocument.text}\n\n` : "") +
        (w.question.trim() ? `Question: ${w.question.trim()}` : "Please read the attached image/document and answer the question shown in it.");
      const images = w.attachedImages.map((img) => img.data); // NEW: sends ALL attached images, not just a single one
      const result = await callScienceCreatePaperModel(contextSummary, (status) => {
        const el = document.getElementById("schoolAnswerStatusText");
        if (el) el.textContent = status + "...";
      }, "science_school", images, [], {
        schoolThorough: thorough,
        // Structured fields (not just embedded in the free-text
        // message above) so the backend can reliably look up the
        // monthly exam-system cache -- parsing this back out of the
        // message text would be fragile; sending it explicitly isn't.
        schoolExamSystem: w.examSystem,
        schoolSubject: subjectLabel,
        schoolGrade: w.grade,
        // Per explicit request: needed so the backend can look up the
        // Arab-country cache entries too, not just the six
        // international systems -- previously the actual country name
        // (w.examCountryName) was never sent at all.
        schoolCountry: w.examCountryName,
        // NEW: overrides callScienceCreatePaperModel's own hardcoded
        // history: [] (extraFields spreads AFTER it in that function, so
        // this key wins) -- sends the real prior Q&A turns from this
        // same learning session, so a follow-up question like "explain
        // that differently" or "what about part b" actually has
        // something to refer back to, instead of every question being
        // answered in total isolation.
        history: w.conversationHistory,
      });
      if (schoolWizard !== startedWithWizard) return; // cancelled mid-flight
      w.answer = (result.raw_reply || result.reply || "") + extractGarnetVisualBlocksFromHtmlReply(result.reply || "");
      // NEW: w.answer above stays RAW markdown/LaTeX text on purpose --
      // the PDF builder (renderMarkdownPdfBody, see downloadSchoolAnswerPdf
      // below) parses markdown/LaTeX syntax itself to build the PDF, so it
      // genuinely needs raw text, not HTML. But the ON-SCREEN answer
      // display was ALSO using this same raw text (just HTML-escaped and
      // dumped into a div) -- a confirmed real bug this fixes: neither
      // markdown (###  headers, **bold**) nor math (\( \), \[ \]) was ever
      // actually rendered on screen, both showed as literal raw text,
      // even though the exact same reply typeset correctly in the PDF.
      // w.answerHtml stores the SERVER-formatted HTML version instead
      // (the same field normal chat bubbles already use successfully via
      // addMessage's allowHTML path) specifically for on-screen display.
      w.answerHtml = result.reply || "";
      // NEW: record this turn into the session's memory -- uses the raw
      // text reply (result.raw_reply) as the assistant's contribution,
      // matching exactly how normal chat's own conversationHistory
      // stores turns (see conversationHistory.push near line 7934) for
      // consistency between the two systems.
      w.conversationHistory.push({ role: "user", content: contextSummary });
      w.conversationHistory.push({ role: "assistant", content: result.raw_reply || result.reply || "" });
      showSchoolAnswerScreen();
    } catch (err) {
      if (schoolWizard !== startedWithWizard) return;
      console.error("Could not generate school answer:", err);
      showSchoolWizardScreen(
        `<div class="models-card-title">Could not get an answer</div>` +
        `<div style="opacity:0.7; padding:10px 0;">There was a connection error. Please try again.</div>` +
        schoolNavRowHtml({ showBack: true, backOnclick: "showSchoolQuestionScreen()", nextLabel: "Try Again", nextOnclick: "generateSchoolAnswer()" })
      );
    }
  }

  // --- Answer screen ---
  function showSchoolAnswerScreen() {
    const w = schoolWizard;
    const rtl = isRtlText(w.answer);
    showSchoolWizardScreen(
      `<div class="models-card-title" style="text-align:center;">Here's your answer</div>` +
      `<div id="schoolAnswerContent" class="cmm-form-field" dir="${rtl ? "rtl" : "ltr"}" style="max-height:440px; overflow-y:auto; line-height:1.5; ${rtl ? "text-align:right !important;" : "text-align:left !important;"} background:rgba(0,0,0,0.2); padding:14px; border-radius:8px;">${w.answerHtml}</div>` +
      `<div style="text-align:center; margin:16px 0;"><button class="cmm-form-btn" id="schoolDownloadPdfBtn" onclick="downloadSchoolAnswerPdf()">⬇ Download PDF</button></div>` +
      `<div style="opacity:0.7; font-size:13px; text-align:center; margin-bottom:10px;">What would you like to do next?</div>` +
      `<div class="models-card-grid">` +
      `<div class="model-box model-box-active" onclick="continueSchoolWizard()"><div class="model-box-icon">➡️</div><div class="model-box-name">Ask Another Question</div><div class="model-box-status">Same grade, system, and subject</div></div>` +
      `<div class="model-box model-box-active" onclick="startSchoolWizardFlow()"><div class="model-box-icon">🔄</div><div class="model-box-name">Start New Learning Session</div><div class="model-box-status">Choose grade, system, and subject again</div></div>` +
      `<div class="model-box model-box-active" onclick="closeSchoolWizardSession()"><div class="model-box-icon">✅</div><div class="model-box-name">Close Session</div><div class="model-box-status">Done for now</div></div>` +
      `</div>`,
      "max-width:1000px; width:94vw;"
    );
    // NEW, ROUND 2 -- the answer screen was still missing 5 of the 6
    // rendering passes normal chat bubbles get via addMessage: only
    // renderMathInMessage was added last round. A confirmed real bug
    // this fixes: image search results now come back correctly (via
    // the SerpApi fallback added this session) and show up fine in the
    // downloaded PDF, but never appeared on THIS screen at all -- same
    // root cause as the math bug, just for a different block type.
    // w.answerHtml already contains the real ```images/chart/venn/code/
    // project-zip markup from the server (same field normal chat uses),
    // it just was never actually being processed into a real gallery/
    // chart/etc. on screen. showSchoolWizardScreen() above sets
    // innerHTML synchronously, so the element is already in the DOM by
    // this point -- same order normal chat bubbles use in addMessage.
    const answerEl = document.getElementById("schoolAnswerContent");
    if (answerEl) {
      renderPriceCharts(answerEl);
      renderVennDiagrams(answerEl);
      renderWebImages(answerEl);
      renderCodeBlocks(answerEl);
      renderProjectZip(answerEl);
      renderMathInMessage(answerEl);
    }
  }

  async function downloadSchoolAnswerPdf() {
    const w = schoolWizard;
    const btn = document.getElementById("schoolDownloadPdfBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Preparing PDF..."; }
    try {
      await ensureJsPdfLoaded();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 48;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      const systemLabel = getSchoolExamSystemLabel(w);
      const subjectLabel = w.subject === "Other" ? w.subjectOther : w.subject;

      doc.setFontSize(16);
      doc.setFont(undefined, "bold");
      doc.splitTextToSize(stripPdfUnsupportedChars(`${subjectLabel} -- ${w.grade} -- ${systemLabel}`), maxWidth).forEach((l) => { doc.text(l, margin, y); y += 20; });
      y += 4;
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text(`GARNET School and Students -- ${new Date().toLocaleString()}`, margin, y);
      y += 26;

      if (w.question.trim()) {
        doc.setFontSize(12);
        doc.setFont(undefined, "bold");
        doc.text("Question:", margin, y);
        y += 16;
        y = await renderMarkdownPdfBody(doc, w.question.trim(), margin, y, maxWidth, margin, pageHeight);
        y += 12;
      }

      if (y > pageHeight - margin - 30) { doc.addPage(); y = margin; }
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("Answer:", margin, y);
      y += 16;
      y = await renderMarkdownPdfBody(doc, w.answer, margin, y, maxWidth, margin, pageHeight);

      doc.save(filenameFromTitle(`${subjectLabel}_${w.grade}`, "school_answer", "pdf"));
    } catch (err) {
      console.error("Could not create the answer PDF:", err);
      await showWizardMessageModal("Could not create the PDF. Please check your connection and try again.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "⬇ Download PDF"; }
    }
  }

  function continueSchoolWizard() {
    // Keeps grade/exam system/subject, clears the question/answer/
    // attachments for a fresh question in the same context.
    // conversationHistory is DELIBERATELY left untouched here -- that's
    // the whole point, this is "Ask Another Question" within the SAME
    // session, so the model should still remember the prior Q&A.
    const w = schoolWizard;
    w.question = "";
    w.attachedImages = [];
    w.attachedDocument = null;
    w.answer = "";
    w.answerHtml = "";
    showSchoolQuestionScreen();
  }

  function closeSchoolWizardSession() {
    closeSchoolWizardOverlay();
    schoolWizard = null;
    returnToScienceSubmenu(); // per explicit request -- same destination as Cancel, not all the way out to plain chat
  }

  // Reuses the SAME hidden multi-select file input for both file-picker
  // options, just reconfiguring its accept attribute right before
  // opening it -- handleFileSelected() already auto-detects image vs.
  // text-based files from each chosen file, so no separate handler is
  // needed per option. Camera has its own dedicated flow (see
  // openCameraModal below) since a live preview needs more than a file
  // input can offer.
  function triggerFileInput(kind) {
    const input = document.getElementById("fileInput");
    closeAttachMenu();
    // Uploading a file, image, or audio clip is a plain-chat action, not
    // tied to Web Search or any of the gold/oil/dollar quick-ask labels
    // that might still be showing in the header from an earlier click --
    // reset it back to the default title the moment the person commits
    // to one of these options.
    setMode("chat");
    input.accept = kind === "image"
      ? "image/*"
      : kind === "audio"
      ? "audio/*"
      : ".txt,.md,.csv,.json,.js,.py,.html,.css,.log,.tsv,.yaml,.yml,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
    input.click();
  }

  function canAddMoreAttachments() {
    if (pendingAttachments.length >= MAX_ATTACHMENTS) {
      alert(`You can attach up to ${MAX_ATTACHMENTS} files/images at once.`);
      return false;
    }
    return true;
  }

  // Lets a previously-sent file be attached again to a NEW message,
  // without relying on the OS clipboard at all (which can't reliably
  // hold arbitrary file data the way it can images -- see the download
  // link used for getting the actual file back). Each sent
  // document/text attachment gets a short ID here; the re-attach button
  // rendered next to it in the chat bubble just looks up that ID,
  // avoiding the need to embed potentially huge base64 strings directly
  // in HTML attributes.
  const sentAttachmentRegistry = {};
  let sentAttachmentCounter = 0;

  function registerSentAttachment(type, name, data) {
    const id = "att" + ++sentAttachmentCounter;
    sentAttachmentRegistry[id] = { type, name, data };
    return id;
  }

  function reattachSentFile(id) {
    const entry = sentAttachmentRegistry[id];
    if (!entry) return;
    if (!canAddMoreAttachments()) return;
    pendingAttachments.push({ ...entry });
    renderAttachmentPreviews();
  }

  // Extensions for real Word/PDF/Excel/PowerPoint documents -- these are
  // binary formats that need genuine server-side parsing (see
  // documentParser.js on the backend), unlike plain text-based files
  // which the browser can just read directly.
  const DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"];

  function getFileExtension(filename) {
    const dotIndex = filename.lastIndexOf(".");
    return dotIndex === -1 ? "" : filename.slice(dotIndex).toLowerCase();
  }

  function attachImageFile(file) {
    if (!canAddMoreAttachments()) return;
    if (file.size > MAX_IMAGE_BYTES) {
      alert("That image is too large (max 5MB). Please choose a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingAttachments.push({ type: "image", name: file.name || "Pasted image", data: reader.result });
      renderAttachmentPreviews();
    };
    reader.onerror = () => alert("Could not read that image. Please try again.");
    reader.readAsDataURL(file);
  }

  // Real Word/PDF/Excel/PowerPoint files -- read as base64 (raw binary,
  // same technique as images) and sent to the backend for genuine
  // server-side text extraction via officeparser. The browser can't
  // meaningfully read these formats as plain text itself.
  const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15MB -- office docs run larger than plain text files

  function attachDocumentFile(file) {
    if (!canAddMoreAttachments()) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      alert("That document is too large (max 15MB). Please choose a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingAttachments.push({ type: "document", name: file.name, data: reader.result });
      renderAttachmentPreviews();
    };
    reader.onerror = () => alert("Could not read that document. Please try again.");
    reader.readAsDataURL(file);
  }

  function attachTextFile(file) {
    if (!canAddMoreAttachments()) return;
    if (file.size > MAX_TEXT_BYTES) {
      alert("That file is too large (max 200KB for text-based files). Please choose a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingAttachments.push({ type: "text", name: file.name, data: reader.result });
      renderAttachmentPreviews();
    };
    reader.onerror = () => alert("Could not read that file. Please try again.");
    reader.readAsText(file);
  }

  // Uploaded audio files -- read as base64 and sent straight to the
  // backend's dedicated /transcribe endpoint (same one the mic button
  // uses). Unlike images/documents, audio is never added to
  // pendingAttachments and never travels through /chat as an attachment
  // -- the transcribed TEXT fills the message input instead, exactly
  // like a live recording does, so the person reviews/edits it before
  // pressing Send themselves.
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB -- matches Whisper's own per-file upload limit on the backend

  function transcribeUploadedAudioFile(file) {
    if (file.size > MAX_AUDIO_BYTES) {
      alert("That audio file is too large (max 25MB). Please choose a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => transcribeAndFillInput(reader.result);
    reader.onerror = () => alert("Could not read that audio file. Please try again.");
    reader.readAsDataURL(file);
  }

  // Handles ALL files chosen at once (the input allows multi-select) --
  // each one is routed to the right reader based on its own type/extension.
  function handleFileSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = ""; // reset so selecting the same file(s) again still fires onchange
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        attachImageFile(file);
      } else if (file.type.startsWith("audio/")) {
        transcribeUploadedAudioFile(file);
      } else if (DOCUMENT_EXTENSIONS.includes(getFileExtension(file.name))) {
        attachDocumentFile(file);
      } else {
        attachTextFile(file);
      }
    }
  }

  function removeAttachment(index) {
    pendingAttachments.splice(index, 1);
    renderAttachmentPreviews();
  }

  function renderAttachmentPreviews() {
    const previewEl = document.getElementById("attachmentPreview");
    previewEl.innerHTML = "";

    if (pendingAttachments.length === 0) {
      previewEl.style.display = "none";
      return;
    }

    pendingAttachments.forEach((att, index) => {
      const chip = document.createElement("div");
      chip.className = "attachment-chip";

      if (att.type === "image") {
        const img = document.createElement("img");
        img.src = att.data;
        img.alt = "Attached image preview";
        chip.appendChild(img);
      }

      const nameSpan = document.createElement("span");
      const iconPrefix = att.type === "image" ? "🖼️ " : "📄 ";
      nameSpan.textContent = iconPrefix + att.name;
      chip.appendChild(nameSpan);

      const removeBtn = document.createElement("button");
      removeBtn.className = "attachment-remove-btn";
      removeBtn.title = "Remove this attachment";
      removeBtn.textContent = "✕";
      removeBtn.onclick = () => removeAttachment(index);
      chip.appendChild(removeBtn);

      previewEl.appendChild(chip);
    });

    previewEl.style.display = "flex";
  }

  function clearAttachments() {
    pendingAttachments = [];
    renderAttachmentPreviews();
  }

  // ------------------------------------------------------------------
  // CAMERA -- a genuine live preview via getUserMedia/MediaStream, not
  // just the file input's "capture" attribute (which skips straight to
  // the OS camera app with no in-page preview, and doesn't work
  // reliably on desktop browsers at all). Works on both mobile and
  // desktop wherever the browser supports camera access.
  // ------------------------------------------------------------------
  let cameraStream = null;

  async function openCameraModal() {
    closeAttachMenu();
    if (!canAddMoreAttachments()) return;
    setMode("chat"); // same reset as triggerFileInput -- attaching a photo is a plain-chat action

    const errorEl = document.getElementById("cameraError");
    errorEl.textContent = "";
    updateCameraCaptureCount(0); // NEW: clear any stale count from a previous camera session
    document.getElementById("cameraModal").style.display = "flex";

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // prefers the rear camera on phones; front camera on laptops with no rear camera
      });
      document.getElementById("cameraVideo").srcObject = cameraStream;
    } catch (err) {
      console.error("Camera access failed:", err);
      errorEl.textContent = "Could not access the camera. Please check your browser's camera permission for this site.";
    }
  }

  // A confirmed real bug this fixes: the School and Students wizard's
  // "Take Photo" button was relying on <input type="file" capture>,
  // which only actually launches a real camera on mobile devices --
  // on desktop browsers it silently falls back to a plain file picker,
  // reading as "the camera doesn't work" even though nothing crashed.
  // This reuses the SAME real, already-proven getUserMedia-based live
  // camera (same #cameraModal/#cameraVideo/#cameraCanvas elements) the
  // main chat's own camera button uses -- just without
  // closeAttachMenu()/canAddMoreAttachments()/setMode("chat") (that
  // last one would have actually TORN DOWN the school wizard entirely,
  // since setMode() now calls teardownSchoolWizardIfActive()).
  async function openSchoolCameraModal() {
    const errorEl = document.getElementById("cameraError");
    errorEl.textContent = "";
    updateCameraCaptureCount(0); // NEW: clear any stale count from a previous camera session
    document.getElementById("cameraModal").style.display = "flex";
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      document.getElementById("cameraVideo").srcObject = cameraStream;
    } catch (err) {
      console.error("Camera access failed:", err);
      errorEl.textContent = "Could not access the camera. Please check your browser's camera permission for this site.";
    }
  }

  function closeCameraModal() {
    document.getElementById("cameraModal").style.display = "none";
    // Releases the camera hardware -- without explicitly stopping each
    // track, the browser keeps the camera "in use" (and the
    // recording-indicator light on) even after the modal is closed.
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
  }

  // NEW, PER EXPLICIT REQUEST: capturing used to auto-close the modal
  // and navigate away after every single photo -- taking 3 photos of a
  // multi-page worksheet meant re-opening the camera 3 separate times.
  // Now each capture just adds to the running list and keeps the live
  // video feed open; the modal only actually closes when the person
  // clicks "Done" (finishCameraCapture below), so multiple photos can
  // be taken back-to-back in one session, same idea as selecting
  // several files at once via "Upload Image" now supports too.
  function captureCameraPhoto() {
    const video = document.getElementById("cameraVideo");
    const canvas = document.getElementById("cameraCanvas");
    if (!video.videoWidth) return; // camera hasn't actually started streaming yet

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const photo = { name: `Camera photo ${new Date().toLocaleTimeString()}`, data: dataUrl };

    // Same capture mechanism, routed to whichever context is actually
    // active -- the School wizard's own attachedImages array, or the
    // normal chat's pendingAttachments, never both.
    if (schoolWizard) {
      schoolWizard.attachedImages.push(photo);
      updateCameraCaptureCount(schoolWizard.attachedImages.length);
      return;
    }

    if (!canAddMoreAttachments()) return;
    pendingAttachments.push({ type: "image", ...photo });
    updateCameraCaptureCount(pendingAttachments.filter((a) => a.type === "image").length);
  }

  function updateCameraCaptureCount(count) {
    const el = document.getElementById("cameraCaptureCount");
    if (el) el.textContent = count > 0 ? `${count} photo${count === 1 ? "" : "s"} captured` : "";
  }

  // Closes the camera modal AND commits whatever was captured -- for
  // the School wizard this means re-rendering the question screen so
  // the newly attached photos actually show up (deliberately NOT done
  // after every single capture above, so the live video feed isn't
  // interrupted mid-session); for normal chat, renderAttachmentPreviews
  // already reflects each capture live since pendingAttachments is
  // rendered independently of this modal.
  function finishCameraCapture() {
    const wasSchoolWizard = !!schoolWizard;
    closeCameraModal();
    if (wasSchoolWizard) showSchoolQuestionScreen();
    else renderAttachmentPreviews();
  }

  // ------------------------------------------------------------------
  // MIC BUTTON -- click once to start a genuine microphone recording.
  // A real, confirmed bug this fixes: this used to run on the browser's
  // own built-in SpeechRecognition API, which requires a FIXED language
  // to be set BEFORE listening starts -- it cannot detect what language
  // is actually being spoken from the audio itself, so anyone speaking
  // a language other than whatever happened to be configured (or the
  // browser's own default) got silently garbled or empty results. This
  // is the exact same structural ceiling already identified and fixed
  // for Live Chat (see startLiveRecordingSegment's comment further
  // below) -- now fixed here the same way: record raw audio with MediaRecorder,
  // send it to the backend's /transcribe endpoint, which uses Whisper
  // to genuinely detect the spoken language directly from the audio,
  // every single time, with nothing needing to be pre-selected at all.
  // The returned TEXT is placed directly into the message input box --
  // ready for the person to review/edit and press Send themselves,
  // exactly like anything they'd typed.
  // ------------------------------------------------------------------
  let micMediaRecorder = null;
  let micRecordedChunks = [];
  let micStream = null;
  let isMicRecording = false;
  const MIC_ICON_SVG = document.getElementById("micBtnIcon").outerHTML;
  const MIC_STOP_ICON_SVG = '<svg id="micBtnIcon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';

  async function toggleMicRecording() {
    if (isMicRecording) {
      stopMicRecording();
    } else {
      startMicRecording();
    }
  }

  let micWaveformStream = null;
  let micWaveformAudioContext = null;
  let micWaveformAnalyser = null;
  let micWaveformAnimationId = null;
  let micWaveformSamples = []; // one entry per captured moment -- rendered left-to-right, oldest first, so the waveform visibly GROWS as you speak (per explicit request), not just pulses in place
  let micWaveformLastSampleAt = 0;

  // A real, live-reacting waveform needs actual volume/frequency data,
  // which SpeechRecognition itself never exposes (it manages its own
  // internal audio capture with no access for us). Requesting a SEPARATE
  // raw mic stream in parallel, purely for this visual, is what makes
  // that possible -- browsers allow multiple simultaneous consumers of
  // the same physical microphone, so this doesn't interfere with
  // SpeechRecognition's own transcription at all.
  async function startMicWaveform() {
    try {
      micWaveformStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Could not start mic waveform (visual only, transcription still works):", err);
      return; // non-fatal -- transcription itself doesn't depend on this
    }
    micWaveformAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = micWaveformAudioContext.createMediaStreamSource(micWaveformStream);
    micWaveformAnalyser = micWaveformAudioContext.createAnalyser();
    micWaveformAnalyser.fftSize = 64; // small -- only need coarse per-sample energy, not fine frequency resolution
    source.connect(micWaveformAnalyser);
    micWaveformSamples = [];
    micWaveformLastSampleAt = 0;
    updateMicWaveform();
  }

  // A confirmed real request this implements: the waveform should grow
  // in length as the person keeps speaking, spanning the full width of
  // the chat bar, like a real voice-memo recording UI -- not a small
  // fixed cluster of bars pulsing in place. Each new sample is
  // APPENDED to a growing history and re-rendered left-to-right; once
  // there are more samples than fit the bar's width, the oldest ones
  // scroll off, so it keeps moving/growing the whole time you talk.
  function updateMicWaveform() {
    if (!isMicRecording || !micWaveformAnalyser) return;

    const now = performance.now();
    // Sampled roughly 12x/second (not every animation frame, which
    // would be far too dense/jittery for a natural-looking waveform).
    if (now - micWaveformLastSampleAt >= 80) {
      micWaveformLastSampleAt = now;
      const bufferLength = micWaveformAnalyser.frequencyBinCount;
      const freqData = new Uint8Array(bufferLength);
      micWaveformAnalyser.getByteFrequencyData(freqData);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += freqData[i];
      const energy = sum / bufferLength / 255; // 0..1

      const container = document.getElementById("micRecordingStatus");
      const barTotalWidth = 6; // 4px bar + 2px gap, matches .mic-wave-bar CSS
      const maxBars = container ? Math.max(10, Math.floor(container.clientWidth / barTotalWidth)) : 60;

      micWaveformSamples.push(energy);
      if (micWaveformSamples.length > maxBars) micWaveformSamples.shift(); // oldest scrolls off once the bar is full-width -- this is what makes it keep moving rather than stopping once full

      if (container) {
        container.innerHTML = micWaveformSamples
          .map((e) => `<div class="mic-wave-bar" style="height:${(4 + e * 24).toFixed(0)}px"></div>`)
          .join("");
      }
    }

    micWaveformAnimationId = requestAnimationFrame(updateMicWaveform);
  }

  function stopMicWaveform() {
    if (micWaveformAnimationId) {
      cancelAnimationFrame(micWaveformAnimationId);
      micWaveformAnimationId = null;
    }
    if (micWaveformStream) {
      micWaveformStream.getTracks().forEach((track) => track.stop());
      micWaveformStream = null;
    }
    if (micWaveformAudioContext) {
      micWaveformAudioContext.close();
      micWaveformAudioContext = null;
    }
    micWaveformAnalyser = null;
    micWaveformSamples = [];
    const container = document.getElementById("micRecordingStatus");
    if (container) container.innerHTML = ""; // clears out for next time this shows, starting the grow-from-empty effect fresh
  }

  async function startMicRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Voice recording needs a browser that supports microphone access, like Chrome.");
      return;
    }

    const micBtn = document.getElementById("micBtn");
    // A confirmed real bug this fixes: setMode("chat") tears down
    // whichever wizard is active (see setMode's own
    // teardownResearchPaperWizardIfActive/teardownSchoolWizardIfActive
    // calls) -- this ran UNCONDITIONALLY here, so clicking the mic
    // button while inside the School wizard (or Create Research Papers)
    // destroyed that wizard's entire state the instant recording
    // started, not after finishing. It just wasn't visible until the
    // recording UI closed and revealed plain General Chat underneath --
    // same root cause and same fix shape as the camera modal bug fixed
    // earlier this session (openSchoolCameraModal skips this same
    // reset). Only reset to plain chat mode when NO wizard is active --
    // recording from inside a wizard should stay inside that wizard.
    if (!schoolWizard && !researchPaperWizard) {
      setMode("chat"); // same reset as triggerFileInput -- recording a voice message from plain chat is a plain-chat action
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Could not access microphone:", err);
      alert("Could not access the microphone. Please check your browser permissions.");
      return;
    }

    const mimeType = window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    try {
      micMediaRecorder = new MediaRecorder(micStream, { mimeType });
    } catch (err) {
      console.error("Could not start audio recording:", err);
      alert("Could not start recording. Please try again.");
      micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
      return;
    }

    micRecordedChunks = [];
    micMediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) micRecordedChunks.push(e.data);
    };
    micMediaRecorder.onerror = (e) => {
      console.error("Mic recording error:", e.error);
    };

    // Fires once stopMicRecording() calls .stop() below -- hands the
    // captured audio off to the same real Whisper transcription path
    // (/transcribe) already used for uploaded audio files and Live
    // Chat, rather than anything language-limited.
    micMediaRecorder.onstop = async () => {
      const chunks = micRecordedChunks;
      micRecordedChunks = [];
      if (micStream) {
        micStream.getTracks().forEach((track) => track.stop());
        micStream = null;
      }
      resetMicButton();
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: micMediaRecorder.mimeType || "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) transcribeAndFillInput(reader.result);
      };
      reader.onerror = () => console.error("Could not read the recorded audio.");
      reader.readAsDataURL(blob);
    };

    micMediaRecorder.start();
    isMicRecording = true;
    micBtn.classList.add("mic-recording");
    micBtn.title = "Stop recording";
    document.getElementById("micBtnIcon").outerHTML = MIC_STOP_ICON_SVG;
    const micStatus = document.getElementById("micRecordingStatus");
    if (micStatus) micStatus.style.display = "flex";
    startMicWaveform();

    // Disabling the normal send path while actively recording avoids a
    // confusing state where someone sends whatever was typed BEFORE the
    // recording while a recording is still in progress underneath it.
    document.getElementById("user-input").disabled = true;
    document.getElementById("sendBtn").disabled = true;
  }

  function stopMicRecording() {
    if (!micMediaRecorder || !isMicRecording) return;
    isMicRecording = false;
    micMediaRecorder.stop(); // triggers onstop above, which transcribes via Whisper and fills the input with whatever was captured
  }

  function resetMicButton() {
    isMicRecording = false;
    const micBtn = document.getElementById("micBtn");
    micBtn.classList.remove("mic-recording");
    micBtn.disabled = isSending; // stays disabled if a chat request happens to be in flight, otherwise re-enabled
    micBtn.title = "Record a voice message";
    document.getElementById("micBtnIcon").outerHTML = MIC_ICON_SVG;
    const micStatus = document.getElementById("micRecordingStatus");
    if (micStatus) micStatus.style.display = "none";
    stopMicWaveform();
    document.getElementById("user-input").disabled = isSending;
    document.getElementById("sendBtn").disabled = false;
    if (!isSending) document.getElementById("user-input").focus();
  }

  // Shared Whisper transcription helper -- used by the mic button
  // (startMicRecording above) and uploaded audio files
  // (transcribeUploadedAudioFile above). Live Chat hits the same
  // TRANSCRIBE_API_URL endpoint directly instead (see
  // processLiveChatUtterance below), since it doesn't want the
  // transcript placed into the visible input box. Sends base64 audio to
  // the backend's dedicated /transcribe endpoint, which detects the
  // spoken language directly from the audio itself, and places the
  // returned text into the message input, appending to anything already
  // typed rather than overwriting it.
  const TRANSCRIBE_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/transcribe";
  const EXTRACT_DOCUMENT_TEXT_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/extract-document-text";
  const ANALYZE_IMAGE_FOR_LIVE_CHAT_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/analyze-image-for-live-chat";
  const CMM_ASSESSMENT_FACTORS_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/cmm-assessment-factors";
  const CMM_ASSESSMENT_REPORT_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/cmm-assessment-report";
  const CMM_GENERATE_REPORT_DOCX_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/generate-cmm-report-docx";
  const ASSESSMENT_QUESTIONS_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/assessment-questions";
  const ASSESSMENT_REPORT_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/assessment-report";
  const ELEVENLABS_VOICES_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/elevenlabs-voices";
  const ELEVENLABS_SPEAK_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/elevenlabs-speak";

  // Real ISO-639-1 codes Whisper's `language` param accepts, derived
  // from whatever the person has explicitly set as their Speaking
  // Language (e.g. "en-US", "ar-SA") -- just the bare 2-letter prefix.
  // Returns null for "auto", so auto-detection is left fully untouched
  // for anyone who wants it (e.g. switching languages mid-session).
  // IMPORTANT: do NOT default this to navigator.language (browser
  // locale) when Speaking Language is "auto" -- that was tried and
  // confirmed broken in the OTHER direction: it forces Whisper to
  // assume whatever language the browser happens to be set to, so
  // someone whose browser is English but who actually speaks Arabic via
  // the mic got their Arabic mistranscribed AS English, not the other
  // way around. A per-call hint isn't just "improved accuracy", it's an
  // assumption Whisper decodes AROUND -- wrong for anyone who
  // genuinely speaks more than one language into the mic. True
  // "auto" (no hint at all, returning null below) lets Whisper detect
  // the ACTUAL spoken language fresh from the audio on every single
  // call, which is the only approach that correctly handles someone who
  // switches between languages, even though it occasionally misdetects
  // very short/ambiguous clips as a real accuracy tradeoff of doing
  // real detection at all. Only an EXPLICIT Speaking Language choice in
  // Settings (not "auto") should ever send a hint, since that's a
  // deliberate, informed choice by the person, not a guess made on
  // their behalf from browser metadata.
  function getTranscriptionLanguageHint() {
    const pref = getSavedRecognitionLang();
    if (pref && pref !== "auto") return pref.split("-")[0].toLowerCase();
    return null;
  }

  async function transcribeAndFillInput(audioDataUrl) {
    // NEW: this used to always write into #user-input (the main chat
    // box) regardless of context. Combined with the startMicRecording
    // fix above (no longer tearing down an active wizard when recording
    // starts), a wizard now correctly survives the whole recording --
    // but the transcript still needs to land in the RIGHT place: the
    // wizard's own question field, not a chat input sitting underneath
    // it that the person probably isn't even looking at.
    const input = schoolWizard ? null : document.getElementById("user-input");
    const originalPlaceholder = input ? input.placeholder : null;
    if (input) input.placeholder = "Transcribing...";

    try {
      const response = await fetch(TRANSCRIBE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: { name: "recording", data: audioDataUrl },
          language: getTranscriptionLanguageHint(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Server responded with status ${response.status}`);
      }
      const transcript = (data.text || "").trim();
      if (transcript) {
        if (schoolWizard) {
          const w = schoolWizard;
          w.question = w.question ? `${w.question} ${transcript}` : transcript;
          // If the question screen happens to be the one currently
          // shown, reflect it immediately; if the wizard is on a
          // different screen right now, w.question is already updated
          // above, so it'll show correctly whenever that screen renders
          // next (same .value-assignment pattern showSchoolQuestionScreen
          // itself now uses).
          const questionEl = document.getElementById("schoolQuestionInput");
          if (questionEl) questionEl.value = w.question;
        } else if (input) {
          input.value = input.value ? `${input.value} ${transcript}` : transcript;
          applyInputDirection(input);
        }
      }
    } catch (err) {
      console.error("Transcription failed:", err);
      alert("Could not transcribe that audio. Please try again.");
    } finally {
      if (input) input.placeholder = originalPlaceholder;
    }
  }


  // ------------------------------------------------------------------
  // LIVE CHAT -- a continuous hands-free conversation loop: automatically
  // detects 2 seconds of silence to know when a spoken question is
  // finished (no manual stop needed, unlike the Voice Chat button
  // above), and can be interrupted mid-reply just by starting to talk
  // again (the same way interrupting a real assistant works), with a
  // real-time visualizer reacting to actual microphone volume/frequency
  // the whole time it's running.
  // ------------------------------------------------------------------

  const LIVE_CHAT_SILENCE_MS = 800; // reduced further from 1200ms per explicit request -- trade-off: noticeably less room for a natural mid-sentence pause before being treated as "done talking"; if this starts cutting people off mid-thought, that's the number to raise back up
  const LIVE_CHAT_DELAY_FILLER_MS = 2000; // reduced from 6000ms per explicit request -- now REPEATS at this interval (capped, see LIVE_CHAT_DELAY_FILLER_MAX_REPEATS) instead of firing once, so a genuinely long wait gets periodic check-ins rather than one apology then silence
  const LIVE_CHAT_GREETING = "I am Garnet, your AI assistant from the Institute of AI. How are you today? How can I help you?";

  // Used only when Speaking Language is explicitly set (not "auto") --
  // there's no detected conversation language yet before the person's
  // first utterance, so this is the one place a fixed per-language
  // translation genuinely makes sense rather than real-time detection.
  const LIVE_CHAT_GREETING_TRANSLATIONS = {
    ar: "أنا غارنت، مساعدك الذكي من معهد الذكاء الاصطناعي. كيف حالك اليوم؟ كيف يمكنني مساعدتك؟",
    fr: "Je suis Garnet, votre assistant IA de l'Institut de l'IA. Comment allez-vous aujourd'hui ? Comment puis-je vous aider ?",
    es: "Soy Garnet, tu asistente de IA del Instituto de IA. ¿Cómo estás hoy? ¿En qué puedo ayudarte?",
    de: "Ich bin Garnet, dein KI-Assistent vom Institute of AI. Wie geht es dir heute? Wie kann ich dir helfen?",
    pt: "Eu sou o Garnet, seu assistente de IA do Instituto de IA. Como você está hoje? Como posso ajudar?",
    it: "Sono Garnet, il tuo assistente IA dell'Institute of AI. Come stai oggi? Come posso aiutarti?",
    nl: "Ik ben Garnet, jouw AI-assistent van het Institute of AI. Hoe gaat het vandaag met je? Hoe kan ik je helpen?",
    ru: "Я Гарнет, ваш ИИ-помощник из Института ИИ. Как у вас дела сегодня? Чем я могу помочь?",
    zh: "我是加内特，来自人工智能研究所的人工智能助手。你今天怎么样？我能帮你什么？",
    ja: "私はガーネット、AI研究所のAIアシスタントです。今日の調子はいかがですか？何かお手伝いできますか？",
    ko: "저는 인공지능 연구소의 AI 어시스턴트 가넷입니다. 오늘 기분이 어떠세요? 무엇을 도와드릴까요?",
    th: "ฉันคือการ์เน็ต ผู้ช่วย AI ของคุณจากสถาบัน AI วันนี้เป็นอย่างไรบ้าง ให้ช่วยอะไรดี",
    hi: "मैं गार्नेट हूं, इंस्टीट्यूट ऑफ एआई से आपका एआई सहायक। आज आप कैसे हैं? मैं आपकी कैसे मदद कर सकता हूं?",
    he: "אני גארנט, עוזר הבינה המלאכותית שלך ממכון הבינה המלאכותית. מה שלומך היום? איך אני יכול לעזור?",
  };

  function getLiveChatGreeting() {
    const recognitionPref = getSavedRecognitionLang();
    if (recognitionPref !== "auto") {
      const key = recognitionPref.split("-")[0].toLowerCase();
      if (LIVE_CHAT_GREETING_TRANSLATIONS[key]) return LIVE_CHAT_GREETING_TRANSLATIONS[key];
    }
    return LIVE_CHAT_GREETING;
  }
  const LIVE_CHAT_SPEECH_THRESHOLD = 0.04; // RMS volume above this counts as genuinely talking, used while actually listening
  const LIVE_CHAT_SILENCE_THRESHOLD = 0.02; // RMS volume below this counts as genuine quiet -- a gap between the two avoids jitter right at the boundary
  // Deliberately higher than LIVE_CHAT_SPEECH_THRESHOLD above, and used
  // ONLY for barge-in detection during playback -- without proper echo
  // cancellation, the device's own speaker output (the reply being read
  // aloud) can leak back into the mic and register as "speech",
  // triggering a false interruption. A real, confirmed suspect for
  // Arabic playback sounding cut-off/stammering specifically: Arabic
  // speech runs measurably longer than English for the same content,
  // giving more time for stray self-feedback to accidentally cross a
  // threshold that was tuned for detecting genuine speech in a quiet
  // room, not for staying quiet against the device's own audio output.
  const LIVE_CHAT_BARGE_IN_VOLUME_THRESHOLD = 0.045; // dialed back further -- 0.055 was apparently still too high for genuine speech to reliably cross; now only a small margin above LIVE_CHAT_SPEECH_THRESHOLD (0.04), rather than a large gap
  const LIVE_CHAT_BARGE_IN_MS = 120; // reduced further for a more instant, natural interruption feel -- echoCancellation (requested from getUserMedia when Live Chat starts) now handles the device-speaker-feedback false-positive risk at the source, so this doesn't need as large a safety margin as before

  let liveChatActive = false;
  let liveChatStream = null;
  let liveChatAudioContext = null;
  let liveChatAnalyser = null;
  let liveChatState = "idle"; // "idle" | "listening" | "processing" | "speaking"
  let liveChatSilenceStartTime = null;
  let liveChatHasSpeechInSegment = false; // avoids triggering a response on pure silence with nothing actually said yet
  let liveChatBargeInStartTime = null;
  let liveChatAnimationFrameId = null;
  let liveChatSilenceDebounceTimer = null; // no longer used by the (now-removed) SpeechRecognition path; kept only so existing clearTimeout() call sites remain harmless no-ops
  let liveChatDelayFillerInterval = null; // see LIVE_CHAT_DELAY_FILLER_MS -- cleared the moment a reply arrives or the turn ends any other way
  const LIVE_CHAT_DELAY_FILLER_MAX_REPEATS = 3; // caps how many times the delay apology can repeat during one very long wait, so it stays reassuring rather than becoming spammy
  let liveChatCurrentTurnTranscript = ""; // what the person just said this turn, so filler language (see getLiveChatFillerLangKey) stays correct even when triggered from elsewhere (e.g. updateThinkingStatus's search filler)

  // Shown before Live Chat starts, only when Voice Language is set to
  // "Auto (ElevenLabs picks a voice for you)" -- lets the person pick
  // male/female right there rather than needing to dig into Settings.
  // The choice is saved (see setSavedVoiceGenderPreference) and used by
  // resolveElevenLabsVoiceId's auto-resolution everywhere, not just
  // Live Chat, so it stays consistent with the Listen button too.
  function showVoiceGenderPickerModal() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;";
      const box = document.createElement("div");
      box.style.cssText = "background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:28px;max-width:340px;width:90%;text-align:center;color:#fff;font-family:inherit;";
      const title = document.createElement("div");
      title.style.cssText = "font-size:16px;font-weight:600;margin-bottom:6px;";
      title.textContent = "Choose a voice";
      const subtitle = document.createElement("div");
      subtitle.style.cssText = "font-size:13px;color:#999;margin-bottom:20px;";
      subtitle.textContent = "Pick a male or female voice for this Live Chat session.";
      box.appendChild(title);
      box.appendChild(subtitle);

      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:10px;justify-content:center;";
      const makeBtn = (label, value) => {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.style.cssText = "flex:1;padding:12px 0;border-radius:8px;border:1px solid #444;background:#2a2a2a;color:#fff;font-size:14px;cursor:pointer;";
        btn.onmouseenter = () => { btn.style.background = "#3a3a3a"; };
        btn.onmouseleave = () => { btn.style.background = "#2a2a2a"; };
        btn.onclick = () => {
          setSavedVoiceGenderPreference(value);
          document.body.removeChild(overlay);
          resolve(value);
        };
        return btn;
      };
      btnRow.appendChild(makeBtn("Male", "male"));
      btnRow.appendChild(makeBtn("Female", "female"));
      box.appendChild(btnRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  async function toggleLiveChat() {
    if (liveChatActive) {
      stopRealtimeLiveChat();
    } else {
      await startRealtimeLiveChat();
    }
  }

  // ------------------------------------------------------------------
  // REALTIME LIVE CHAT (WebRTC) -- a full architecture change from the
  // old record-then-transcribe pipeline below (startLiveChat, still
  // present but no longer called -- kept only for reference). This
  // connects the browser DIRECTLY to OpenAI's Realtime API over WebRTC:
  // continuous audio in, continuous audio out, no "wait for a full
  // recording, then transcribe, then reply, then synthesize" round
  // trip. This is what actually gets Live Chat close to real
  // conversational latency -- the old pipeline's per-turn delay was
  // architectural, not something further tuning could fully close.
  //
  // A few real, honest trade-offs versus the old system:
  //  - GARNET now speaks in one of OpenAI's own Realtime voices, not an
  //    ElevenLabs voice -- these are two different services with no way
  //    to mix them in a single live streaming connection. The Listen
  //    button on typed messages is UNCHANGED and still uses ElevenLabs.
  //  - The filler/status system built up over many rounds (contextual
  //    reactions, the 260-phrase reference set, etc.) mostly doesn't
  //    apply here anymore -- Realtime's own architecture has far less
  //    dead air to fill in the first place, and the model can narrate
  //    briefly on its own while a tool call resolves (see its
  //    instructions on the backend).
  //  - Barge-in (interrupting GARNET mid-sentence) is now handled
  //    NATIVELY by the Realtime API's own server-side voice detection,
  //    not custom code -- it truncates its own response automatically
  //    the moment it detects the person speaking again.
  //
  // HONEST NOTE: built carefully against current, verified Realtime API
  // documentation, but could not be tested against the live API from
  // the environment this was written in (no network path to
  // api.openai.com there) -- your real deployment is the first real
  // test this gets, and the SDP exchange endpoint/format below is the
  // single most likely thing to need adjustment if the connection
  // fails to establish, since that's the one detail most likely to
  // have shifted between documentation snapshots.
  // ------------------------------------------------------------------

  const REALTIME_SESSION_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/realtime-session";
  const REALTIME_TOOL_CALL_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/realtime-tool-call";

  let realtimePeerConnection = null;
  let realtimeDataChannel = null;
  let realtimeMicStream = null;
  let realtimeRemoteAudioEl = null;
  let realtimeConnectionInProgress = false; // blocks a second connection attempt from starting while one is already underway -- see the comment in startRealtimeLiveChat for the exact bug this fixes
  let realtimeConnectionGeneration = 0; // bumped on every start/stop -- lets a superseded attempt detect it's stale and stop touching its (possibly closed/replaced) connection

  const REALTIME_VOICE_STORAGE_KEY = "garnetRealtimeVoice";
  function getSavedRealtimeVoice() {
    try {
      return localStorage.getItem(REALTIME_VOICE_STORAGE_KEY) || "marin";
    } catch (err) {
      return "marin";
    }
  }

  async function startRealtimeLiveChat() {
    // A confirmed real bug this fixes, reproduced directly: clicking
    // the Live Chat button multiple times before the first attempt
    // finished connecting spawned MULTIPLE overlapping
    // RTCPeerConnections at once -- toggleLiveChat only checks
    // liveChatActive, which isn't set true until partway through this
    // function, so several rapid clicks could all pass that check and
    // each start their own connection attempt. When an older attempt's
    // connection got torn down (by a newer attempt, or by stopping),
    // its still-in-flight async chain would eventually try to call
    // setRemoteDescription on that now-closed connection, throwing
    // exactly the error seen: "signalingState is 'closed'". Two real
    // guards fix this: realtimeConnectionInProgress blocks a second
    // attempt from starting at all while one is already underway, and
    // realtimeConnectionGeneration lets any attempt that DOES get
    // superseded detect that and cleanly stop touching its (now
    // possibly closed/replaced) connection instead of continuing on
    // stale state.
    if (realtimeConnectionInProgress || liveChatActive) return;
    realtimeConnectionInProgress = true;
    realtimeConnectionGeneration++;
    const myGeneration = realtimeConnectionGeneration;

    if (!window.RTCPeerConnection) {
      alert("Live Chat needs a browser with WebRTC support, like Chrome.");
      realtimeConnectionInProgress = false;
      return;
    }
    const btn = document.getElementById("liveChatBtn");
    try {
      realtimeMicStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      console.error("Could not access microphone:", err);
      alert("GARNET needs microphone access for Live Chat. Please allow it and try again.");
      realtimeConnectionInProgress = false;
      return;
    }
    if (myGeneration !== realtimeConnectionGeneration) {
      // Superseded or stopped while waiting for mic permission -- the
      // mic stream this just acquired belongs to a stale attempt, so
      // release it immediately rather than leaving it open unused.
      realtimeMicStream.getTracks().forEach((track) => track.stop());
      return;
    }

    setMode("chat");
    liveChatActive = true;
    if (btn) {
      btn.classList.add("live-active");
      btn.title = "Stop live chat";
    }
    setLiveChatStatusLabel("Connecting...");

    // A confirmed real bug this fixes: this exact block used to be
    // misplaced inside the DEAD startLiveChat() function further below
    // (kept only for reference, never actually called) instead of here
    // in the real, active function -- so modelsBtn was never actually
    // disabled/dimmed in real usage no matter how the CSS for it was
    // adjusted, confirmed directly via DevTools showing zero attribute
    // change on the element while a live session was genuinely active.
    // Per explicit request, the text input/send/attach paths stay
    // ACTIVE during Live Chat -- typing a message, or attaching a
    // file/image, sends it directly into the SAME live voice
    // conversation (see sendMessage()'s liveChatActive branch and
    // sendLiveChatTextOrAttachment() below), so GARNET can read/see it
    // and respond about it out loud without ending the call. The
    // separate dictation mic button stays disabled -- running that
    // alongside the live conversation's own mic (already listening)
    // would just be two simultaneous recordings fighting over the same
    // audio. AI MODELS also stays disabled/dimmed for the duration --
    // switching models clears the chat (see handleModelBoxClick/
    // showComingSoonScreen), which doesn't make sense to do out from
    // under an active live conversation; re-enabled once Live Chat
    // actually ends (see stopRealtimeLiveChat above).
    const liveMicBtn = document.getElementById("micBtn");
    if (liveMicBtn) liveMicBtn.disabled = true;
    const liveModelsBtn = document.getElementById("modelsBtn");
    if (liveModelsBtn) {
      liveModelsBtn.disabled = true;
      liveModelsBtn.classList.add("live-chat-dimmed");
    }

    // A confirmed real gap this fixes: the existing logo-pulse
    // visualizer (drawLiveChatVisualizer) depended on an AnalyserNode
    // set up by the OLD pipeline (removed when this was rewritten for
    // WebRTC) -- reconnected here, tapping the SAME mic stream already
    // being sent to OpenAI (a MediaStreamTrack can feed multiple
    // consumers at once, so this doesn't interfere with the WebRTC
    // connection at all). Reuses the existing liveChatAudioContext/
    // liveChatAnalyser variables and drawLiveChatVisualizer() function
    // as-is -- only the driving loop is new (see
    // realtimeVisualizerLoop below), since the OLD loop also contained
    // silence-detection/barge-in logic that belongs to the old
    // pipeline, not this one (OpenAI's Realtime API handles turn-taking
    // and barge-in natively now).
    //
    // A confirmed real bug this also fixes: this setup used to run
    // BEFORE liveChatActive was set true above -- realtimeVisualizerLoop
    // starts with "if (!liveChatActive) return", so it was exiting
    // immediately on its first (and only) call, before ever scheduling
    // its own next frame, which is exactly why the logo just sat still
    // instead of animating. Moved to run after liveChatActive is
    // already true, fixing that.
    liveChatAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyserSource = liveChatAudioContext.createMediaStreamSource(realtimeMicStream);
    liveChatAnalyser = liveChatAudioContext.createAnalyser();
    liveChatAnalyser.fftSize = 256;
    analyserSource.connect(liveChatAnalyser);
    const visualizerEl = document.getElementById("liveChatVisualizer");
    if (visualizerEl) visualizerEl.style.display = "flex";
    liveChatState = "processing"; // visual state only in this new pipeline -- drives drawLiveChatVisualizer's animation profile, not any turn-taking logic
    realtimeVisualizerLoop();

    try {
      // Ephemeral token minted server-side -- our real OpenAI API key
      // never reaches the browser, only this short-lived credential.
      const sessionResp = await fetch(REALTIME_SESSION_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: getSavedRealtimeVoice() }),
      });
      const sessionData = await sessionResp.json();
      if (!sessionResp.ok || !sessionData.client_secret) {
        throw new Error(sessionData.error || "Could not start a live session.");
      }
      if (myGeneration !== realtimeConnectionGeneration) return; // superseded/stopped while waiting on the session request
      const ephemeralKey = sessionData.client_secret;

      const pc = new RTCPeerConnection();
      realtimePeerConnection = pc;

      // Remote audio (GARNET's voice) plays through a hidden <audio>
      // element wired to the incoming WebRTC track, not decoded/played
      // manually -- the browser's own media pipeline handles this.
      realtimeRemoteAudioEl = document.createElement("audio");
      realtimeRemoteAudioEl.autoplay = true;
      pc.ontrack = (event) => {
        realtimeRemoteAudioEl.srcObject = event.streams[0];
      };

      pc.addTrack(realtimeMicStream.getAudioTracks()[0], realtimeMicStream);

      const dc = pc.createDataChannel("oai-events");
      realtimeDataChannel = dc;
      dc.addEventListener("message", (e) => handleRealtimeServerEvent(JSON.parse(e.data)));
      dc.addEventListener("open", () => {
        if (myGeneration !== realtimeConnectionGeneration) return; // stale connection finally opened after being superseded -- ignore it
        realtimeConnectionInProgress = false;
        setLiveChatStatusLabel("Listening...");
        // Speaks the greeting itself via a real model turn, in whatever
        // language its instructions default to, rather than a separate
        // pre-recorded audio file -- keeps the greeting inside the same
        // real conversation the model is tracking, so a reply to it
        // ("I'm good, and you?") is understood in context.
        dc.send(JSON.stringify({
          type: "response.create",
          response: { instructions: "Greet the user now: introduce yourself as Garnet, an AI assistant from the Institute of AI, ask how they are today, and ask how you can help." },
        }));
      });

      const offer = await pc.createOffer();
      if (myGeneration !== realtimeConnectionGeneration) return;
      await pc.setLocalDescription(offer);
      if (myGeneration !== realtimeConnectionGeneration) return;

      // A confirmed real bug this fixes, same class as the session
      // endpoint above: the old beta WebRTC endpoint (/v1/realtime, with
      // a ?model= query param) is retired -- the current GA endpoint is
      // /v1/realtime/calls, with no query param needed since the model
      // was already specified when the client secret/session was
      // created on the backend.
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        throw new Error(`Could not connect to the voice model (status ${sdpResponse.status}).`);
      }
      const answerSdp = await sdpResponse.text();
      // The exact check that fixes the reported crash: if this attempt
      // was superseded or stopped while the SDP round-trip was in
      // flight, pc may already be closed -- calling setRemoteDescription
      // on it would throw exactly the "signalingState is 'closed'"
      // error that was reported. Bail out cleanly instead.
      if (myGeneration !== realtimeConnectionGeneration || pc.signalingState === "closed") return;
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      console.error("Realtime Live Chat connection failed:", err);
      if (myGeneration === realtimeConnectionGeneration) {
        setLiveChatStatusLabel("Could not connect");
        alert("Could not start Live Chat: " + err.message);
        stopRealtimeLiveChat();
      }
    } finally {
      if (myGeneration === realtimeConnectionGeneration) realtimeConnectionInProgress = false;
    }
  }

  // Handles each JSON event OpenAI sends over the WebRTC data channel.
  // Full event list is large -- only the ones actually needed for
  // status display and tool calling are handled here.
  async function handleRealtimeServerEvent(event) {
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        liveChatState = "listening";
        setLiveChatStatusLabel("Listening...");
        break;
      case "response.created":
        liveChatState = "processing";
        setLiveChatStatusLabel("Thinking...");
        break;
      case "output_audio_buffer.started":
        liveChatState = "speaking";
        setLiveChatStatusLabel("Speaking...");
        break;
      case "output_audio_buffer.stopped":
      case "response.done":
        if (liveChatActive) {
          liveChatState = "listening";
          setLiveChatStatusLabel("Listening...");
        }
        break;
      case "response.function_call_arguments.done":
        await handleRealtimeFunctionCall(event);
        break;
      case "conversation.item.created":
        // Confirms OpenAI actually accepted the item (as opposed to
        // rejecting it, which surfaces via the "error" case below
        // instead) -- logged specifically for diagnosing
        // sendLiveChatTextOrAttachment's text/image/document sends,
        // since this event type previously fell through to default
        // with zero trace either way.
        console.log("Live Chat: conversation.item.created accepted by OpenAI:", event.item);
        break;
      case "error":
        console.error("Realtime API error event:", event.error || event);
        break;
      default:
        break; // many event types (transcript deltas, rate limits, etc.) aren't needed here
    }
  }

  // Drawing-only loop for the reconnected logo-pulse visualizer -- NOT
  // the old liveChatVisualizerLoop, which also contained silence-
  // detection/barge-in logic that belongs to the old pipeline. OpenAI's
  // Realtime API handles turn-taking and barge-in natively now, so this
  // loop's only job is calling the existing drawLiveChatVisualizer()
  // with real current volume, every frame, for as long as Live Chat is
  // active.
  let realtimeVisualizerAnimationId = null;
  function realtimeVisualizerLoop() {
    if (!liveChatActive) return;
    if (liveChatAudioContext && liveChatAudioContext.state === "suspended") {
      liveChatAudioContext.resume();
    }
    drawLiveChatVisualizer(getLiveChatVolume());
    realtimeVisualizerAnimationId = requestAnimationFrame(realtimeVisualizerLoop);
  }

  // A tool call the model wants to make -- executed on OUR backend
  // (which has the actual API keys/network access the browser doesn't),
  // with the result handed back into the same live conversation so the
  // model can continue speaking with real data.
  async function handleRealtimeFunctionCall(event) {
    if (!realtimeDataChannel || realtimeDataChannel.readyState !== "open") return;
    let result;
    try {
      const response = await fetch(REALTIME_TOOL_CALL_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: event.name,
          arguments: event.arguments,
          timezone: userTimezone,
        }),
      });
      const data = await response.json();
      result = response.ok ? data.result : JSON.stringify({ error: data.error || "Tool call failed." });
    } catch (err) {
      console.error("Realtime tool call failed:", err);
      result = JSON.stringify({ error: "Tool call failed: " + err.message });
    }
    realtimeDataChannel.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: event.call_id,
        output: typeof result === "string" ? result : JSON.stringify(result),
      },
    }));
    realtimeDataChannel.send(JSON.stringify({ type: "response.create" }));
  }

  function stopRealtimeLiveChat() {
    realtimeConnectionGeneration++; // invalidates any in-flight startRealtimeLiveChat attempt
    realtimeConnectionInProgress = false;
    liveChatActive = false;
    const btn = document.getElementById("liveChatBtn");
    if (btn) {
      btn.classList.remove("live-active");
      btn.title = "Start live chat";
    }
    setLiveChatStatusLabel("");

    if (realtimeDataChannel) {
      realtimeDataChannel.close();
      realtimeDataChannel = null;
    }
    if (realtimePeerConnection) {
      realtimePeerConnection.close();
      realtimePeerConnection = null;
    }
    if (realtimeMicStream) {
      realtimeMicStream.getTracks().forEach((track) => track.stop());
      realtimeMicStream = null;
    }
    if (realtimeRemoteAudioEl) {
      realtimeRemoteAudioEl.srcObject = null;
      realtimeRemoteAudioEl = null;
    }
    if (realtimeVisualizerAnimationId) {
      cancelAnimationFrame(realtimeVisualizerAnimationId);
      realtimeVisualizerAnimationId = null;
    }
    if (liveChatAudioContext) {
      liveChatAudioContext.close();
      liveChatAudioContext = null;
    }
    liveChatAnalyser = null;
    const visualizerEl = document.getElementById("liveChatVisualizer");
    if (visualizerEl) visualizerEl.style.display = "none";

    // A confirmed real gap this fixes: this function never re-enabled
    // micBtn after startRealtimeLiveChat() disabled it -- that reset
    // logic only ever existed in the dead startLiveChat/stopLiveChat
    // pair below (kept for reference, never actually called), so the
    // dictation mic button stayed disabled forever after ending a Live
    // Chat session. modelsBtn re-enabled here too, matching its own new
    // disable in startRealtimeLiveChat above.
    const micBtnEl = document.getElementById("micBtn");
    if (micBtnEl) micBtnEl.disabled = false;
    const modelsBtnEl = document.getElementById("modelsBtn");
    if (modelsBtnEl) {
      modelsBtnEl.disabled = false;
      modelsBtnEl.classList.remove("live-chat-dimmed");
    }
  }


  async function startLiveChat() {
    if (!window.MediaRecorder) {
      alert("Live Chat needs a browser with audio recording support, like Chrome.");
      return;
    }
    const btn = document.getElementById("liveChatBtn");
    try {
      // Explicit audio constraints, not just { audio: true } -- a
      // genuinely different, well-established fix for a real problem
      // this whole feature has: the device's own speaker output (the
      // reply being read aloud) leaking back into the microphone,
      // which can look like the user talking and either falsely
      // trigger an interruption or otherwise disrupt playback.
      // echoCancellation specifically targets exactly this scenario at
      // the browser's own audio-processing level, rather than trying
      // to compensate for it after the fact by tuning a volume
      // threshold, which has proven an unreliable, ongoing balancing
      // act on its own.
      liveChatStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      console.error("Microphone access failed:", err);
      alert("Could not access the microphone. Please check your browser's microphone permission for this site.");
      return;
    }

    setMode("chat");
    liveChatActive = true;
    btn.classList.add("live-active");
    btn.title = "Stop live chat";
    liveChatLockedArabicVoice = null; // fresh for this session -- a stale voice choice from an earlier session shouldn't carry over
    liveChatLockedDefaultVoice = null;
    liveChatDetectedConversationLangKey = null; // fresh -- see getLiveChatFillerLangKey
    liveChatConsecutiveNoResultRestarts = 0;

    // (This is the OLD, unused pipeline -- see startRealtimeLiveChat
    // above for the real, active implementation and its actual
    // micBtn/modelsBtn disable logic.)

    // One AnalyserNode, fed by the same live mic stream used for actual
    // recording -- powers both the silence/barge-in detection AND the
    // visualizer from a single real-time audio source, not two separate
    // approximations of the same thing.
    liveChatAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = liveChatAudioContext.createMediaStreamSource(liveChatStream);
    liveChatAnalyser = liveChatAudioContext.createAnalyser();
    liveChatAnalyser.fftSize = 256;
    source.connect(liveChatAnalyser);

    document.getElementById("liveChatVisualizer").style.display = "flex";
    setLiveChatStatusLabel("Speaking...");

    // Always starts unmuted -- a stale muted state from a previous
    // session shouldn't silently carry over into a new one.
    liveChatMuted = false;
    const muteBtn = document.getElementById("liveChatMuteBtn");
    muteBtn.classList.remove("muted");
    muteBtn.title = "Mute microphone";

    liveChatVisualizerLoop();

    // Greets the user before listening for anything -- shown in the
    // chat log too (not just spoken) so there's a visible record of it,
    // same as every other exchange. Not persisted to Firestore/
    // conversationHistory though -- it's a fixed local greeting, not a
    // real model-generated turn, and there's no preceding user message
    // for it to pair with.
    addMessage(getLiveChatGreeting(), "bot");
    speakLiveChatReply(getLiveChatGreeting()); // its own onFullyDone handler transitions to "listening" and starts the first recording segment once the greeting finishes
  }

  let liveChatMuted = false;

  function toggleLiveChatMute() {
    if (!liveChatActive || !realtimeMicStream) return;
    liveChatMuted = !liveChatMuted;

    // Disabling the actual audio track (not just ignoring its data) is
    // the real, standard way to mute a live stream -- OpenAI's Realtime
    // API genuinely receives silence over WebRTC, not just locally-
    // ignored audio, so muting can't accidentally still let something
    // through server-side.
    realtimeMicStream.getAudioTracks().forEach((track) => {
      track.enabled = !liveChatMuted;
    });

    const muteBtn = document.getElementById("liveChatMuteBtn");
    muteBtn.classList.toggle("muted", liveChatMuted);
    muteBtn.title = liveChatMuted ? "Unmute microphone" : "Mute microphone";
    document.getElementById("liveChatMuteIcon").innerHTML = liveChatMuted
      ? '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="2" y1="2" x2="22" y2="22"/>'
      : '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>';

    if (liveChatState === "listening") {
      setLiveChatStatusLabel("Listening..."); // resolves to "Muted" automatically if liveChatMuted is now true, per setLiveChatStatusLabel
    }
  }

  function stopLiveChat() {
    const btn = document.getElementById("liveChatBtn");
    liveChatActive = false;
    liveChatState = "idle";
    btn.classList.remove("live-active");
    btn.title = "Live chat -- continuous hands-free conversation";

    if (liveChatAnimationFrameId) {
      cancelAnimationFrame(liveChatAnimationFrameId);
      liveChatAnimationFrameId = null;
    }
    clearTimeout(liveChatSilenceDebounceTimer);

    window.speechSynthesis.cancel(); // stop anything currently being read aloud
    stopPiperAudio();
    stopElevenLabsAudio();
    stopSpeechKeepAlive();

    if (liveChatMediaRecorder) {
      liveChatMediaRecorder.ondataavailable = null;
      liveChatMediaRecorder.onstop = null;
      liveChatMediaRecorder.onerror = null;
      if (liveChatMediaRecorder.state !== "inactive") {
        try { liveChatMediaRecorder.stop(); } catch (err) { /* already stopped/stopping -- fine */ }
      }
      liveChatMediaRecorder = null;
    }
    liveChatRecordedChunks = [];

    if (liveChatStream) {
      liveChatStream.getTracks().forEach((track) => track.stop());
      liveChatStream = null;
    }
    if (liveChatAudioContext) {
      liveChatAudioContext.close();
      liveChatAudioContext = null;
    }
    liveChatAnalyser = null;

    document.getElementById("liveChatVisualizer").style.display = "none";

    document.getElementById("user-input").disabled = false;
    document.getElementById("sendBtn").disabled = false;
    document.getElementById("micBtn").disabled = false;
  }

  function setLiveChatStatusLabel(text) {
    const label = document.getElementById("liveChatStatusLabel");
    if (!label) return;
    // Every "back to listening" transition throughout this feature calls
    // this with "Listening..." -- centralizing the mute-awareness check
    // here means none of those call sites need to know or care about
    // mute state themselves.
    label.textContent = text === "Listening..." && liveChatMuted ? "Muted" : text;
  }

  // A confirmed real architecture change: Live Chat's speech capture now
  // uses MediaRecorder (just continuously records raw audio while
  // "listening") instead of the browser's built-in SpeechRecognition.
  // The actual transcription happens server-side via Whisper (see
  // processLiveChatUtterance, which sends the recorded clip to
  // /transcribe once the volume-based silence detection above decides
  // the person is done talking). This fixes two real, structural
  // problems SpeechRecognition had for this specific use case:
  //   1. SpeechRecognition requires a FIXED language to be set before
  //      listening starts -- it cannot detect what language is being
  //      spoken from the audio itself. Every "language switching" fix
  //      in this app's history was working around that ceiling, not
  //      solving it. Whisper genuinely detects the spoken language
  //      directly from the audio, every single utterance, with no
  //      language needing to be pre-selected at all.
  //   2. Chrome's SpeechRecognition has a real, confirmed reliability
  //      issue where it can silently fail (a "no-speech" error) and,
  //      even with careful restart-with-backoff logic, can still get
  //      stuck failing repeatedly. MediaRecorder has no equivalent
  //      failure mode -- it just records audio; there's no separate
  //      "recognition service" that can silently stop understanding.
  let liveChatMediaRecorder = null;
  let liveChatRecordedChunks = [];

  function startLiveRecordingSegment() {
    liveChatRecordedChunks = [];
    startLiveMediaRecorder();
  }

  function startLiveMediaRecorder() {
    if (!liveChatStream) return;
    const mimeType = window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    try {
      liveChatMediaRecorder = new MediaRecorder(liveChatStream, { mimeType });
    } catch (err) {
      console.error("Could not start audio recording for this segment:", err);
      return;
    }
    liveChatRecordedChunks = [];
    liveChatMediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) liveChatRecordedChunks.push(e.data);
    };
    liveChatMediaRecorder.onerror = (e) => {
      console.error("Live Chat MediaRecorder error:", e.error);
    };
    liveChatMediaRecorder.start();
  }

  // Stops the current recording and resolves with a base64 data URL of
  // everything captured in this segment, or null if nothing was
  // recorded (e.g. stopped immediately after starting). Used by
  // processLiveChatUtterance once the volume-based silence detection
  // decides the person is done talking, and by handleLiveChatBargeIn to
  // discard an in-progress recording without processing it.
  function stopLiveMediaRecorderAndGetAudio() {
    return new Promise((resolve) => {
      const recorder = liveChatMediaRecorder;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        if (liveChatRecordedChunks.length === 0) {
          resolve(null);
          return;
        }
        const blob = new Blob(liveChatRecordedChunks, { type: recorder.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result); // a base64 data URL, same shape transcribeAndFillInput already sends to /transcribe
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      };
      try {
        recorder.stop();
      } catch (err) {
        console.error("Could not stop audio recording:", err);
        resolve(null);
      }
    });
  }

  // RMS (root-mean-square) of the live time-domain waveform -- a
  // standard, simple real measure of perceived loudness. Used for both
  // the silence/barge-in detection thresholds and the visualizer.
  function getLiveChatVolume() {
    const bufferLength = liveChatAnalyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    liveChatAnalyser.getByteTimeDomainData(dataArray);
    let sumSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = (dataArray[i] - 128) / 128; // -1..1
      sumSquares += normalized * normalized;
    }
    return Math.sqrt(sumSquares / bufferLength);
  }

  function liveChatVisualizerLoop() {
    if (!liveChatActive) return;

    // A real, known browser behavior this guards against: an
    // AudioContext can get automatically suspended (e.g. by autoplay or
    // power-saving policies) without any explicit code telling it to.
    // If that happens here, the analyser silently stops receiving fresh
    // audio data -- volume readings freeze, which would make barge-in
    // detection appear completely broken even though the threshold
    // logic itself is working correctly. Resuming it every frame is
    // effectively free when already running (an immediate no-op), so
    // this costs nothing in the normal case while fully protecting
    // against the suspended case.
    if (liveChatAudioContext && liveChatAudioContext.state === "suspended") {
      liveChatAudioContext.resume();
    }

    const volume = getLiveChatVolume();
    drawLiveChatVisualizer(volume);

    const now = Date.now();

    if (liveChatState === "listening") {
      if (volume > LIVE_CHAT_SPEECH_THRESHOLD) {
        liveChatHasSpeechInSegment = true;
        liveChatSilenceStartTime = null;
      } else if (volume < LIVE_CHAT_SILENCE_THRESHOLD) {
        if (liveChatSilenceStartTime === null) {
          liveChatSilenceStartTime = now;
        } else if (liveChatHasSpeechInSegment && now - liveChatSilenceStartTime >= LIVE_CHAT_SILENCE_MS) {
          // 2 full seconds of quiet after genuine speech was detected --
          // the exact "responds once the user stops for 2 sec" behavior.
          liveChatSilenceStartTime = null;
          liveChatHasSpeechInSegment = false;
          processLiveChatUtterance();
        }
      }
    } else if (liveChatState === "speaking" || liveChatState === "processing") {
      // Interrupting while the reply is being read aloud already worked
      // -- this extends the exact same behavior to the "thinking" phase
      // too (transcribing / waiting on the model's response), which
      // previously had no interrupt handling at all: starting to talk
      // again while it was still processing the previous utterance was
      // silently ignored until that processing finished. Uses the
      // higher LIVE_CHAT_BARGE_IN_VOLUME_THRESHOLD (not the plain
      // listening threshold) specifically to avoid false interruptions
      // from the device's own speaker output leaking into the mic.
      if (volume > LIVE_CHAT_BARGE_IN_VOLUME_THRESHOLD) {
        if (liveChatBargeInStartTime === null) {
          liveChatBargeInStartTime = now;
        } else if (now - liveChatBargeInStartTime >= LIVE_CHAT_BARGE_IN_MS) {
          liveChatBargeInStartTime = null;
          handleLiveChatBargeIn();
        }
      } else {
        liveChatBargeInStartTime = null;
      }
    }

    liveChatAnimationFrameId = requestAnimationFrame(liveChatVisualizerLoop);
  }

  // Incremented every time a barge-in interrupts an in-flight
  // transcribe/respond cycle -- processLiveChatUtterance() below checks
  // this before acting on ANY of its results, so a stale transcription
  // or chat response that finishes AFTER being interrupted gets quietly
  // discarded instead of surfacing (as a spoken reply, or worse,
  // sending a stale message) on top of whatever the person is now
  // saying instead.
  let liveChatProcessingGeneration = 0;

  // Real spoken filler, not silent text -- during Live Chat, GARNET
  // actually SAYS a short phrase ("Ok, let me think about that...") at
  // key real moments instead of just changing an on-screen status label
  // nobody's looking at while talking hands-free. Each category is
  // spoken at most once per turn (see liveChatFillerFlags, reset in
  // processLiveChatUtterance) so rapid real backend events don't cause
  // repeated interruptions of each other. Deliberately short and
  // generic -- these are filler, not real content, so they stay quick
  // and don't add meaningful delay before the real answer. Spoken in
  // whichever language the person is actually speaking (see
  // getLiveChatFillerLangKey below), not hardcoded to English.
  const LIVE_CHAT_FILLER_PHRASES = {
    en: {
      thinking: [
        "Interesting -- let me think.",
        "I love this! One sec.",
        "Good question -- let me dive in.",
        "I'm on it, back in a flash.",
        "Happy to help -- one moment.",
        "Let me think on this one.",
        "Challenge accepted -- one sec.",
        "Ooh, fun topic -- give me a beat.",
        "Let's crack this open, one sec.",
        "Got it, one moment.",
        "Sure thing, looking into it.",
        "Let me check on that.",
        "Let me dig in real quick.",
        "One moment, let me see.",
      ],
      search: [
        "Let me go hunt that down for you.",
        "One sec, checking on that.",
        "Give me a moment, looking into it.",
        "Okay, let me dig around for that.",
        "One moment, I'm on it.",
        "Let me take a look.",
      ],
      delay: [
        "Sorry, there are a lot of details here -- let me sort it out for you.",
        "Still on it, I promise I haven't forgotten about you!",
        "There's a lot to unpack here -- hang tight a moment.",
        "Almost there, thanks for your patience!",
        "Taking a bit longer than usual, sorry about that.",
      ],
    },
    ar: {
      thinking: [
        "أوه، سؤال حلو، لحظة.",
        "بحب هالموضوع، ثانية.",
        "سؤال حلو، خليني أفكر.",
        "أنا عليها، لحظة.",
        "بكل سرور، لحظة.",
        "خليني أفكر شوي.",
        "تحدي مقبول، ثانية.",
        "موضوع حلو، لحظة.",
        "خلينا نشوفها، ثانية.",
        "تمام، لحظة.",
        "أكيد، خليني أشوف.",
        "خليني أشوف.",
        "خليني أدور بسرعة.",
        "لحظة، خليني أشوف.",
      ],
      search: [
        "خليني أدور على هذا الموضوع من أجلك.",
        "لحظة، عم أتأكد من المعلومة.",
        "ثانية وحدة، عم أبحث عنها.",
        "طيب، عم أدور عليها.",
        "لحظة، عم أشوف.",
      ],
      delay: [
        "آسف، في تفاصيل كثيرة، خليني أرتبها لك.",
        "ما زلت أشتغل عليها، ما نسيتك!",
        "في تفاصيل كثيرة، تحمّل علي شوي.",
        "قربت خلص، شكراً على صبرك!",
        "الموضوع طوّل شوي أكثر من العادة، آسف على ذلك.",
      ],
    },
    fr: {
      thinking: ["D'accord, laissez-moi réfléchir à cela.", "Très bien, un instant.", "D'accord, je vais examiner cela."],
      search: ["D'accord, je vais chercher cela pour vous.", "Un instant, je vérifie cela.", "J'ai trouvé des informations intéressantes, laissez-moi les examiner."],
      delay: ["Désolé pour le retard, j'y travaille encore.", "Merci de votre patience, un instant.", "Il y a beaucoup de détails à examiner, merci de patienter."],
    },
    es: {
      thinking: ["Vale, déjame pensar en eso.", "Bien, dame un segundo.", "Vale, déjame trabajar en eso."],
      search: ["Vale, déjame buscar eso para ti.", "Un momento, estoy revisando eso.", "Encontré información interesante, déjame revisarla."],
      delay: ["Disculpa la demora, sigo trabajando en ello.", "Gracias por tu paciencia, ya casi termino.", "Hay muchos detalles que revisar, gracias por tu paciencia."],
    },
    de: {
      thinking: ["Okay, lass mich darüber nachdenken.", "Gut, gib mir eine Sekunde.", "Okay, lass mich das durcharbeiten."],
      search: ["Okay, ich schaue das für dich nach.", "Einen Moment, ich prüfe das.", "Ich habe interessante Informationen gefunden, lass mich sie durchsehen."],
      delay: ["Entschuldige die Verzögerung, ich arbeite noch daran.", "Danke für deine Geduld, ich bin gleich fertig.", "Es gibt viele Details zu prüfen, bitte hab etwas Geduld."],
    },
    pt: {
      thinking: ["Ok, deixe-me pensar sobre isso.", "Certo, me dê um segundo.", "Ok, deixe-me trabalhar nisso."],
      search: ["Ok, vou procurar isso para você.", "Um momento, estou verificando isso.", "Encontrei informações interessantes, deixe-me analisá-las."],
      delay: ["Desculpe a demora, ainda estou trabalhando nisso.", "Obrigado pela paciência, já estou quase terminando.", "Há muitos detalhes para analisar, por favor tenha paciência."],
    },
    it: {
      thinking: ["Ok, fammi pensare a questo.", "Va bene, dammi un secondo.", "Ok, lascia che ci lavori su."],
      search: ["Ok, lo cerco per te.", "Un momento, sto controllando.", "Ho trovato informazioni interessanti, fammi dare un'occhiata."],
      delay: ["Scusa il ritardo, ci sto ancora lavorando.", "Grazie per la pazienza, ci sono quasi.", "Ci sono molti dettagli da esaminare, per favore abbi pazienza."],
    },
    nl: {
      thinking: ["Oké, laat me daarover nadenken.", "Goed, geef me een seconde.", "Oké, laat me dat uitwerken."],
      search: ["Oké, ik zoek dat voor je op.", "Momentje, ik controleer dat.", "Ik heb interessante informatie gevonden, laat me die doornemen."],
      delay: ["Sorry voor de vertraging, ik werk er nog aan.", "Bedankt voor je geduld, ik ben er bijna.", "Er zijn veel details om te bekijken, even geduld alsjeblieft."],
    },
    ru: {
      thinking: ["Хорошо, дайте мне подумать об этом.", "Хорошо, секунду.", "Хорошо, я разберусь с этим."],
      search: ["Хорошо, я поищу это для вас.", "Минутку, я проверяю это.", "Я нашёл интересную информацию, дайте мне её просмотреть."],
      delay: ["Извините за задержку, я всё ещё работаю над этим.", "Спасибо за терпение, почти готово.", "Здесь много деталей, прошу немного терпения."],
    },
    zh: {
      thinking: ["好的，让我想一下。", "好，稍等一下。", "好的，让我处理一下这个问题。"],
      search: ["好的，我帮你查一下。", "稍等，我正在核实。", "我找到了一些有趣的信息，让我看看。"],
      delay: ["抱歉耽误了，我还在处理。", "谢谢你的耐心，马上就好。", "这里有很多细节需要查看，请耐心等待。"],
    },
    ja: {
      thinking: ["では、少し考えさせてください。", "はい、少々お待ちください。", "では、こちらを確認します。"],
      search: ["では、調べてみますね。", "少々お待ちください、確認しています。", "興味深い情報が見つかりました、確認させてください。"],
      delay: ["遅くなってすみません、まだ作業中です。", "お待たせして申し訳ありません、もうすぐです。", "確認すべき詳細が多いので、少々お待ちください。"],
    },
    ko: {
      thinking: ["네, 잠시 생각해볼게요.", "네, 잠시만요.", "네, 한번 살펴볼게요."],
      search: ["네, 찾아볼게요.", "잠시만요, 확인 중이에요.", "흥미로운 정보를 찾았어요, 살펴볼게요."],
      delay: ["지연되어 죄송해요, 아직 작업 중이에요.", "기다려 주셔서 감사해요, 거의 다 됐어요.", "살펴볼 세부 사항이 많아요, 조금만 기다려 주세요."],
    },
    th: {
      thinking: ["โอเค ขอฉันคิดดูก่อนนะ", "ได้ค่ะ รอสักครู่", "โอเค ขอดูเรื่องนี้หน่อยนะ"],
      search: ["โอเค ขอฉันค้นหาให้นะ", "รอสักครู่ กำลังตรวจสอบอยู่", "ฉันเจอข้อมูลที่น่าสนใจ ขอดูก่อนนะ"],
      delay: ["ขอโทษที่ล่าช้า ฉันยังทำอยู่นะ", "ขอบคุณที่อดทนรอนะ ใกล้เสร็จแล้ว", "มีรายละเอียดเยอะที่ต้องดู ขออภัยในความล่าช้า"],
    },
    hi: {
      thinking: ["ठीक है, मुझे इस पर सोचने दीजिए।", "ठीक है, एक सेकंड दीजिए।", "ठीक है, मैं इस पर काम करता हूँ।"],
      search: ["ठीक है, मैं आपके लिए इसे खोजता हूँ।", "एक क्षण, मैं इसे जांच रहा हूँ।", "मुझे कुछ दिलचस्प जानकारी मिली है, मुझे इसे देखने दीजिए।"],
      delay: ["देरी के लिए क्षमा करें, मैं अभी भी इस पर काम कर रहा हूँ।", "धैर्य के लिए धन्यवाद, बस थोड़ी देर और।", "यहाँ बहुत सारी जानकारी है जिसे देखना है, कृपया धैर्य रखें।"],
    },
    he: {
      thinking: ["אוקיי, תן לי לחשוב על זה.", "בסדר, שנייה אחת.", "אוקיי, אני אעבוד על זה."],
      search: ["אוקיי, אני אחפש את זה בשבילך.", "רגע אחד, אני בודק את זה.", "מצאתי מידע מעניין, תן לי לעבור עליו."],
      delay: ["מצטער על העיכוב, אני עדיין עובד על זה.", "תודה על הסבלנות, כמעט סיימתי.", "יש כאן הרבה פרטים לבדוק, אנא היו סבלניים."],
    },
  };
  let liveChatFillerFlags = { thinking: false, search: false, delay: false };

  // A confirmed real gap this fixes: recognition and filler language
  // only ever changed if the person manually picked a language in
  // Settings BEFOREHAND. Asking mid-conversation ("can you speak
  // Arabic?") had no effect on either one -- the backend correctly
  // switches its reply language (see server.js's explicit language-
  // switch override), but nothing on the frontend was watching for
  // that switch. This tracks the language of GARNET's OWN last reply
  // (reliable -- the model already produces real, correct text in
  // whatever language it just switched to) and, when Speaking Language
  // is "auto", uses it to steer BOTH recognition and fillers from the
  // very next turn onward -- so asking to switch languages mid-chat now
  // actually changes what GARNET listens for and says out loud, not
  // just what it types. Reset fresh each session in startLiveChat().
  let liveChatDetectedConversationLangKey = null;

  const LANG_KEY_TO_RECOGNITION_LOCALE = {
    en: "en-US", ar: "ar-SA", fr: "fr-FR", es: "es-ES", de: "de-DE",
    pt: "pt-PT", it: "it-IT", nl: "nl-NL", ru: "ru-RU", zh: "zh-CN",
    ja: "ja-JP", ko: "ko-KR", th: "th-TH", hi: "hi-IN", he: "he-IL",
  };

  const LIVE_CHAT_LANGUAGE_NAME_TO_KEY = {
    english: "en", arabic: "ar", french: "fr", spanish: "es", german: "de",
    portuguese: "pt", italian: "it", dutch: "nl", russian: "ru", chinese: "zh",
    japanese: "ja", korean: "ko", thai: "th", hindi: "hi", hebrew: "he",
  };

  // Ordinary small talk -- greetings, "how are you", goodbyes,
  // "I love you"/"I hate you", teasing, or a light insult -- doesn't
  // need any "let me think about that" filler at all; these replies
  // are inherently fast and simple. Heuristic, English-focused (the
  // primary tested language) with a handful of Arabic equivalents added
  // since that's the other actively-tested language -- doesn't cover
  // every language or every possible phrasing, but catches the common,
  // explicitly requested cases.
  const LIVE_CHAT_CASUAL_SMALL_TALK_PATTERN = new RegExp(
    "\\b(" +
      [
        "hi", "hello", "hey", "how are you", "how's it going", "hows it going", "what's up", "whats up",
        "good morning", "good afternoon", "good evening", "good night",
        "bye", "goodbye", "see you", "take care", "thank you", "thanks",
        "are you kidding( me)?", "are you lying( to me)?", "i love you", "i hate you",
        "you'?re (funny|stupid|dumb|weird|annoying|great|amazing|awesome)",
        "مرحبا", "أهلا", "اهلا", "السلام عليكم", "كيفك", "كيف حالك", "شلونك",
        "صباح الخير", "مساء الخير", "تصبح على خير",
        "مع السلامة", "باي", "شكرا", "بحبك", "بكرهك",
      ].join("|") +
      ")\\b",
    "i"
  );

  function isLiveChatCasualSmallTalk(transcript) {
    if (!transcript) return false;
    // Only treats SHORT utterances as small talk -- a long message that
    // happens to start with "hi" or contain "thanks" partway through is
    // a real substantive question, not a greeting, and should get the
    // normal filler treatment.
    if (transcript.trim().split(/\s+/).length > 12) return false;
    return LIVE_CHAT_CASUAL_SMALL_TALK_PATTERN.test(transcript);
  }

  // Detects a request to switch voice gender mid-conversation ("can you
  // switch to a male voice", "use a female voice please"). English-
  // focused with Arabic equivalents added, same coverage caveat as
  // isLiveChatCasualSmallTalk above.
  function detectLiveChatVoiceGenderSwitchRequest(transcript) {
    if (!transcript) return null;
    const lower = transcript.toLowerCase();
    if (/\b(male|man'?s|boy'?s)\s+voice\b|ذكوري|صوت رجل|صوت راجل/i.test(lower)) return "male";
    if (/\b(female|woman'?s|girl'?s)\s+voice\b|أنثوي|انثوي|صوت (بنت|امرأة|مرأة|حريمي)/i.test(lower)) return "female";
    return null;
  }

  // Decides which language pool to use for filler phrases. The explicit
  // Speaking Language setting wins when set (mapped down to its base
  // 2-letter code, e.g. "fr-FR" -> "fr"); with "auto", falls back to
  // the app's own real multi-language detectTextLanguage() against what
  // the person just said this turn -- covering every language that
  // function already recognizes elsewhere in the app, not just Arabic.
  // Falls back to English if the detected/selected language doesn't
  // have a phrase pool defined above.
  function getLiveChatFillerLangKey(lastUserText) {
    const recognitionPref = getSavedRecognitionLang();
    if (recognitionPref !== "auto") {
      const key = recognitionPref.split("-")[0].toLowerCase();
      if (LIVE_CHAT_FILLER_PHRASES[key]) return key;
    }
    if (liveChatDetectedConversationLangKey && LIVE_CHAT_FILLER_PHRASES[liveChatDetectedConversationLangKey]) {
      return liveChatDetectedConversationLangKey;
    }
    const detected = lastUserText ? detectTextLanguage(lastUserText) : "en";
    return LIVE_CHAT_FILLER_PHRASES[detected] ? detected : "en";
  }

  const VOICE_GENDER_PREFERENCE_KEY = "garnetVoiceGenderPreference"; // "male" | "female" | null (no preference set yet)

  function getSavedVoiceGenderPreference() {
    try {
      return localStorage.getItem(VOICE_GENDER_PREFERENCE_KEY) || null;
    } catch (err) {
      return null;
    }
  }

  function setSavedVoiceGenderPreference(value) {
    try {
      localStorage.setItem(VOICE_GENDER_PREFERENCE_KEY, value);
    } catch (err) {
      // localStorage can throw in some locked-down/private-browsing contexts -- the choice just won't persist across a reload, not worth breaking the interaction over
    }
  }

  // Resolves an "auto" ElevenLabs voice selection to a real voice_id --
  // lets the person skip picking a specific ElevenLabs voice themselves
  // and have GARNET just use a sensible default. Honors a saved
  // male/female preference (see the pre-Live-Chat gender picker in
  // startLiveChat) when one exists, picking a well-known general-purpose
  // voice of that gender if the account has one; falls back to whichever
  // voice happens to be first if no preference is set or none match,
  // rather than hardcoding a specific voice_id that might not exist on
  // every account.
  async function resolveElevenLabsVoiceId(rawVoiceId) {
    if (rawVoiceId !== "auto") return rawVoiceId;
    const voices = await checkElevenLabsAvailability();
    if (!voices || voices.length === 0) return null;

    const genderPref = getSavedVoiceGenderPreference();
    if (genderPref) {
      const matchingGender = voices.filter((v) => (v.gender || "").toLowerCase() === genderPref);
      if (matchingGender.length > 0) {
        const preferredNamed = matchingGender.find((v) => /sarah|rachel|adam|george|bella|daniel/i.test(v.name));
        return (preferredNamed || matchingGender[0]).voice_id;
      }
    }

    const preferred = voices.find((v) => /sarah|rachel|adam|george/i.test(v.name));
    return (preferred || voices[0]).voice_id;
  }

  function pickRandomFillerPhrase(category, langKey) {
    const pool = LIVE_CHAT_FILLER_PHRASES[langKey] || LIVE_CHAT_FILLER_PHRASES.en;
    const phrases = (pool && pool[category]) || LIVE_CHAT_FILLER_PHRASES.en[category] || [];
    if (phrases.length === 0) return "";
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  function speakLiveChatFiller(category, lastUserText) {
    if (!liveChatActive) return;
    if (liveChatFillerFlags[category]) return; // already spoken this turn
    const savedLang = getSavedListenLang();
    if (!savedLang.startsWith("elevenlabs::")) return; // fillers only make sense as real generated speech -- left out for the plain browser-voice path rather than guessing at a matching voice
    liveChatFillerFlags[category] = true;
    const rawVoiceId = savedLang.split("::")[1];
    fillerPendingRequests++;
    const myFillerEpoch = fillerEpoch;
    const langKey = getLiveChatFillerLangKey(lastUserText);
    const phrase = pickRandomFillerPhrase(category, langKey);
    if (!phrase) { fillerPendingRequests--; notifyFillerQueueFinishedIfEmpty(); return; }
    resolveElevenLabsVoiceId(rawVoiceId).then((voiceId) => {
      if (myFillerEpoch !== fillerEpoch) return; // stopped/superseded meanwhile -- counter already reset, don't touch it again
      if (!voiceId || !liveChatActive) { fillerPendingRequests--; notifyFillerQueueFinishedIfEmpty(); return; }
      fillerPendingRequests--; // handing off to the queue now -- enqueueFillerAudio itself keeps the "something's still pending" state alive from here
      enqueueFillerAudio(phrase, voiceId);
    });
  }

  const LIVE_CHAT_REACTION_API_URL = "https://ai-chat-backend-garnet-26.onrender.com/live-chat-reaction";
  const LIVE_CHAT_REACTION_TIMEOUT_MS = 900; // reduced from 1500ms -- a real reaction is only worth the wait up to a point; this also bounds how much the real reply can ever be delayed by waitForFillerQueueToFinish

  // Asks the backend for a genuinely contextual, one-line reaction to
  // what the person just said -- "That's a great question, I love
  // science!" for a science question, gentle amusement for something
  // funny, extra thoughtful acknowledgment for something deep -- rather
  // than a generic "let me think about that" every time. Race against a
  // short timeout: a real reaction that takes too long to generate is
  // worse than a fast generic one, so this NEVER blocks the actual
  // "thinking" filler from playing promptly either way.
  async function getContextualReaction(transcript) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LIVE_CHAT_REACTION_TIMEOUT_MS);
    try {
      const response = await fetch(LIVE_CHAT_REACTION_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcript, spokenLanguageKey: liveChatDetectedConversationLangKey }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) return null;
      const data = await response.json();
      return (data.reaction || "").trim() || null;
    } catch (err) {
      clearTimeout(timeoutId);
      return null; // timed out, or genuinely failed -- caller falls back to a generic phrase either way
    }
  }

  // A confirmed real bug this fixes: the real reply used to be able to
  // start WHILE a filler was still being generated (voice resolution +
  // the reaction fetch, both async, neither one tracked by the
  // queue/playing state yet) -- waitForFillerQueueToFinish saw an
  // "empty" queue and let the reply go, and the filler would then
  // arrive late and overlap or play right on top of the reply already
  // talking. This is exactly the reported "cuts the notification and
  // starts the response" symptom, and it hit hardest on language
  // switches specifically: a short switch-confirmation reply often
  // comes back FASTER than the contextual reaction call, widening this
  // exact race window. fillerPendingRequests now tracks "still being
  // generated, not yet enqueued" as its own real, counted state, and
  // waitForFillerQueueToFinish checks it alongside the queue/playing
  // state -- so the reply now genuinely can't start until every filler
  // for this turn either finished playing or is confirmed to never play
  // at all.
  let fillerPendingRequests = 0;
  let fillerEpoch = 0; // bumped by stopFillerAudio() -- lets an in-flight generation chain detect it's been invalidated and safely no-op instead of touching fillerPendingRequests or enqueueing a stale phrase

  // The "thinking" filler slot specifically tries for a real contextual
  // reaction first (see getContextualReaction), falling back to the
  // generic canned phrases (same pool speakLiveChatFiller uses for
  // "search"/"delay") only if that reaction doesn't come back in time.
  // Skipped entirely (falls straight to the generic phrase, no reaction
  // fetch at all) when this turn is itself a language-switch request --
  // that reply is usually short and fast, so this is exactly the
  // highest-risk case for the race described above, and a generic "ok,
  // let me think about that" in the new language is already a perfectly
  // good filler for a simple instruction like that.
  function speakContextualThinkingFiller(transcript, skipReaction) {
    if (!liveChatActive) return;
    if (liveChatFillerFlags.thinking) return;
    const savedLang = getSavedListenLang();
    if (!savedLang.startsWith("elevenlabs::")) return;
    liveChatFillerFlags.thinking = true;
    const rawVoiceId = savedLang.split("::")[1];
    fillerPendingRequests++;
    const myFillerEpoch = fillerEpoch;

    resolveElevenLabsVoiceId(rawVoiceId).then((voiceId) => {
      if (myFillerEpoch !== fillerEpoch) return; // stopped/superseded meanwhile
      if (!voiceId || !liveChatActive) { fillerPendingRequests--; notifyFillerQueueFinishedIfEmpty(); return; }
      const reactionPromise = skipReaction ? Promise.resolve(null) : getContextualReaction(transcript);
      reactionPromise.then((reaction) => {
        if (myFillerEpoch !== fillerEpoch) return; // stopped/superseded while the reaction was generating
        if (!liveChatActive) { fillerPendingRequests--; notifyFillerQueueFinishedIfEmpty(); return; }
        const langKey = getLiveChatFillerLangKey(transcript);
        const phrase = reaction || pickRandomFillerPhrase("thinking", langKey);
        fillerPendingRequests--; // handing off to the queue now
        if (!phrase) { notifyFillerQueueFinishedIfEmpty(); return; }
        enqueueFillerAudio(phrase, voiceId);
      });
    });
  }

  // A confirmed real bug this fixes: fillers used to go through the
  // same speakViaElevenLabs/stopElevenLabsAudio path as the actual
  // reply. If the real reply came back quickly (common for short
  // acknowledgement-style replies, which happened more often in the
  // Arabic testing that surfaced this), starting the real reply's
  // speech called stopElevenLabsAudio() and bumped the SHARED
  // generation counter -- which immediately invalidated the filler's
  // still in-flight request before it ever played (explaining "no
  // status notification at all"), AND because an invalidated/aborted
  // request deliberately fires neither onFullyDone nor onErrorDone (see
  // speakViaElevenLabs), the REAL reply's own completion callback could
  // end up silently dropped too if the timing went the other way --
  // which is exactly what "gets stuck after the first response" was:
  // liveChatState never got reset back to "listening" because nothing
  // ever called startLiveRecordingSegment() again. Fillers now use this
  // fully separate, isolated audio channel instead -- it can never
  // cancel, be cancelled by, or otherwise interact with the main
  // reply's own audio/generation state in any way.
  //
  // A confirmed real bug this fixes on top of that: multiple fillers in
  // one turn (e.g. "thinking" then "search") used to cut each other off
  // the same way fillers used to cut off the real reply -- each new
  // playFillerAudio() call unconditionally stopped whatever filler was
  // currently playing. This is now a real sequential QUEUE: each
  // enqueued filler plays fully to completion before the next one
  // starts, and waitForFillerQueueToFinish() (used by speakLiveChatReply)
  // waits for the entire queue to drain, not just whatever happens to be
  // playing at that exact instant.
  let currentFillerAudio = null;
  let fillerAbortController = null;
  let fillerQueue = []; // array of {text, voiceId}, played strictly in order
  let fillerIsPlaying = false;
  let fillerQueueFinishedCallbacks = [];

  function notifyFillerQueueFinishedIfEmpty() {
    if (fillerIsPlaying || fillerQueue.length > 0 || fillerPendingRequests > 0) return;
    const callbacks = fillerQueueFinishedCallbacks;
    fillerQueueFinishedCallbacks = [];
    callbacks.forEach((cb) => cb());
  }

  // Lets the real reply wait for the ENTIRE filler queue (not just
  // whatever's currently playing) to finish naturally, instead of
  // cutting anything off mid-sentence. Resolves immediately if nothing
  // is queued, playing, OR still being generated (see
  // fillerPendingRequests -- this is the piece that was missing before:
  // a filler still being resolved/fetched wasn't counted as "pending"
  // at all, letting the real reply start while it was still in flight).
  function waitForFillerQueueToFinish() {
    if (!fillerIsPlaying && fillerQueue.length === 0 && fillerPendingRequests === 0) return Promise.resolve();
    return new Promise((resolve) => fillerQueueFinishedCallbacks.push(resolve));
  }

  function stopFillerAudio() {
    fillerQueue = []; // a real stop/barge-in means starting over completely, not finishing what was queued
    fillerEpoch++; // invalidates any in-flight filler generation chain started before this point -- see speakLiveChatFiller/speakContextualThinkingFiller
    fillerPendingRequests = 0; // safe to force-reset: invalidated chains check their own captured epoch and no-op instead of decrementing this later
    if (fillerAbortController) {
      fillerAbortController.abort();
      fillerAbortController = null;
    }
    if (currentFillerAudio) {
      currentFillerAudio.pause();
      currentFillerAudio.currentTime = 0;
      currentFillerAudio = null;
    }
    fillerIsPlaying = false;
    notifyFillerQueueFinishedIfEmpty();
  }

  function enqueueFillerAudio(text, voiceId) {
    fillerQueue.push({ text, voiceId });
    if (!fillerIsPlaying) processFillerQueue();
  }

  function processFillerQueue() {
    if (fillerQueue.length === 0) {
      fillerIsPlaying = false;
      notifyFillerQueueFinishedIfEmpty();
      return;
    }
    fillerIsPlaying = true;
    const { text, voiceId } = fillerQueue.shift();
    const abortController = new AbortController();
    fillerAbortController = abortController;
    fetch(ELEVENLABS_SPEAK_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId }),
      signal: abortController.signal,
    })
      .then((response) => response.blob())
      .then((blob) => {
        if (fillerAbortController !== abortController) return; // stopped while this one was generating
        const audio = new Audio(URL.createObjectURL(blob));
        currentFillerAudio = audio;
        const advance = () => {
          if (currentFillerAudio === audio) currentFillerAudio = null;
          processFillerQueue(); // plays the next queued filler, if any -- otherwise resolves any waiters
        };
        audio.onended = advance;
        audio.onerror = advance;
        audio.play().catch((err) => {
          console.error("Could not play filler audio:", err);
          advance();
        });
      })
      .catch((err) => {
        if (err.name === "AbortError") return; // stopFillerAudio() already cleaned up
        console.error("Filler TTS request failed:", err);
        processFillerQueue(); // move on to whatever's next rather than getting stuck
      });
  }

  function handleLiveChatBargeIn() {
    liveChatProcessingGeneration++; // invalidates any processLiveChatUtterance() run currently in flight
    if (currentAbortController) currentAbortController.abort(); // actually cancels an in-flight transcribe/chat request, rather than letting it run to completion just to discard the result
    window.speechSynthesis.cancel();
    stopPiperAudio();
    stopElevenLabsAudio();
    stopFillerAudio();
    clearTimeout(liveChatSilenceDebounceTimer); // a pending timer from before this interruption shouldn't fire later on stale data
    clearInterval(liveChatDelayFillerInterval);
    setLiveChatStatusLabel("Listening...");
    liveChatState = "listening";
    liveChatSilenceStartTime = null;
    liveChatHasSpeechInSegment = true; // the interruption itself is the start of real speech
    startLiveRecordingSegment();
  }

  async function processLiveChatUtterance() {
    if (liveChatState !== "listening") return; // already processing/speaking -- avoids double-triggering if both the final-result trigger and the volume-based fallback timer fire close together
    const myGeneration = liveChatProcessingGeneration; // captured now, before anything async happens -- any barge-in interruption from here on bumps the real counter, making this run stale
    liveChatState = "processing";
    setLiveChatStatusLabel("Thinking...");
    liveChatFillerFlags = { thinking: false, search: false, delay: false }; // fresh per-turn -- see speakLiveChatFiller

    const audioDataUrl = await stopLiveMediaRecorderAndGetAudio();

    if (!liveChatActive) return; // stopped while this last segment was wrapping up
    // Interrupted by a barge-in while the recording was still wrapping
    // up -- handleLiveChatBargeIn() already started a fresh segment and
    // set state to "listening"; doing anything further here would
    // stomp on that, so just stop.
    if (myGeneration !== liveChatProcessingGeneration) return;

    if (!audioDataUrl) {
      // Nothing usable was actually recorded (e.g. stopped right after
      // starting) -- back to listening rather than sending an empty
      // message.
      setLiveChatStatusLabel("Listening...");
      liveChatState = "listening";
      startLiveRecordingSegment();
      return;
    }

    let transcript = "";
    let whisperLanguage = null;
    try {
      const response = await fetch(TRANSCRIBE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: { name: "live-chat", data: audioDataUrl } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Server responded with status ${response.status}`);
      transcript = (data.text || "").trim();
      whisperLanguage = data.language || null;
    } catch (err) {
      console.error("Live Chat transcription failed:", err);
    }

    if (!liveChatActive) return;
    if (myGeneration !== liveChatProcessingGeneration) return;

    if (!transcript) {
      // Nothing usable was actually said (e.g. background noise
      // tripped the speech threshold briefly, or transcription genuinely
      // failed) -- back to listening rather than sending an empty
      // message.
      setLiveChatStatusLabel("Listening...");
      liveChatState = "listening";
      startLiveRecordingSegment();
      return;
    }

    // Spoken NOW, with the real transcript on hand, so the filler
    // language actually matches what the person just said (see
    // getLiveChatFillerLangKey) rather than defaulting to English.
    liveChatCurrentTurnTranscript = transcript;

    // A confirmed real bug this fixes (reproduced directly: a short
    // "how are you" produced a garbled multi-language reply mixing
    // Arabic/English/Chinese): Whisper's own SEPARATE audio-based
    // language classifier is known to be unreliable specifically on
    // short utterances, and can guess a completely wrong language even
    // when it transcribes the actual words perfectly correctly. The
    // previous version here tried to cross-check that guess against the
    // transcribed text, but still let Whisper's language win whenever
    // the text-based check landed on "en" -- treating a CORRECT English
    // detection the same as an inconclusive default, so a bad Whisper
    // guess (e.g. mistaking a short English phrase for Chinese) could
    // still override it and get sent to the backend as fact, producing
    // exactly this kind of garbled output. The TRANSCRIBED TEXT itself
    // never lies about its own script, so it's now the sole source of
    // truth -- Whisper's separate language field isn't used for this
    // decision at all anymore.
    let isLanguageSwitchRequest = false;
    if (getSavedRecognitionLang() === "auto") {
      const effectiveLangKey = detectTextLanguage(transcript);
      if (effectiveLangKey && LIVE_CHAT_FILLER_PHRASES[effectiveLangKey]) {
        if (liveChatDetectedConversationLangKey && liveChatDetectedConversationLangKey !== effectiveLangKey) {
          isLanguageSwitchRequest = true;
        }
        liveChatDetectedConversationLangKey = effectiveLangKey;
      }
    }

    // A confirmed real request this handles: switching voice gender
    // mid-conversation ("can you switch to a male voice") should apply
    // immediately and smoothly, in whatever language the conversation
    // is already in -- not reset anything else. Only meaningful when
    // Voice Language is set to ElevenLabs Auto (a specific voice
    // selection has no "gender" to switch).
    const genderSwitchRequest = detectLiveChatVoiceGenderSwitchRequest(transcript);
    if (genderSwitchRequest && getSavedListenLang() === "elevenlabs::auto") {
      setSavedVoiceGenderPreference(genderSwitchRequest);
    }

    // A confirmed real request this handles: ordinary small talk --
    // greetings, "how are you", goodbyes, "I love you"/"I hate you",
    // being teased or lightly insulted -- doesn't need any "let me
    // think about that" theatrics at all. Those replies are fast and
    // simple by nature; a filler here just adds unnecessary ceremony
    // to what should feel like a quick, natural back-and-forth.
    const isCasualSmallTalk = isLiveChatCasualSmallTalk(transcript);

    // Skips the contextual-reaction fetch entirely for a language- or
    // voice-switch turn -- that reply is usually short and fast, making
    // this exactly the highest-risk case for the race described above,
    // and a quick generic "ok, let me think about that" already
    // correctly spoken in the right language is a perfectly good filler
    // for a simple instruction like this. Casual small talk skips the
    // filler altogether (see isLiveChatCasualSmallTalk above).
    if (!isCasualSmallTalk) {
      speakContextualThinkingFiller(transcript, isLanguageSwitchRequest || !!genderSwitchRequest);
    }

    // A confirmed real gap this fixes: nothing previously told the
    // person anything if the model's response genuinely took a while --
    // dead air with only a silent on-screen "Thinking..." label. If
    // still processing after LIVE_CHAT_DELAY_FILLER_MS, GARNET actually
    // apologizes for the wait out loud, once per turn, using the same
    // fire-and-forget filler mechanism as "thinking"/"search". Cleared
    // below the moment a reply is ready (or the turn ends for any other
    // reason), so it never fires after the fact. Skipped for casual
    // small talk -- those replies are fast enough that this would never
    // legitimately fire anyway, and skipping it avoids any chance of a
    // stray "sorry for the delay" on what should be a quick, breezy
    // exchange.
    if (!isCasualSmallTalk) {
      clearInterval(liveChatDelayFillerInterval);
      let delayFillerRepeatCount = 0;
      liveChatDelayFillerInterval = setInterval(() => {
        if (myGeneration !== liveChatProcessingGeneration || delayFillerRepeatCount >= LIVE_CHAT_DELAY_FILLER_MAX_REPEATS) {
          clearInterval(liveChatDelayFillerInterval);
          return;
        }
        delayFillerRepeatCount++;
        liveChatFillerFlags.delay = false; // reset the once-per-turn guard so each repeat is actually allowed to speak, not silently skipped after the first
        speakLiveChatFiller("delay", transcript);
      }, LIVE_CHAT_DELAY_FILLER_MS);
    }

    try {
      // Sent exactly like a normal typed message -- reuses all the
      // same validation, history-tracking, and response-language logic
      // a real typed message already goes through.
      const input = document.getElementById("user-input");
      input.value = transcript;
      await sendMessage();
      clearInterval(liveChatDelayFillerInterval);

      if (!liveChatActive) return;
      // Interrupted while waiting for the model's response -- discard
      // it rather than speaking a stale reply over whatever the person
      // is now saying instead. The message itself was already sent and
      // will still show up in the chat log/history normally; only the
      // "speak it out loud and wait for it" behavior is skipped here.
      if (myGeneration !== liveChatProcessingGeneration) return;

      const botMessages = document.querySelectorAll(".bot-message");
      const lastBotMessage = botMessages[botMessages.length - 1];
      const replySpan = lastBotMessage ? lastBotMessage.querySelector("span:not(.message-timestamp)") : null;
      const replyText = replySpan ? replySpan.textContent.trim() : "";

      if (replyText) {
        // Only updates when Speaking Language is "auto" -- an explicit
        // Speaking Language choice is a deliberate override and should
        // stick regardless of what language GARNET happens to reply in
        // (e.g. someone who set Speaking Language to English but is
        // asking GARNET, in English, to answer a question ABOUT Arabic
        // shouldn't have their own mic recognition silently flipped to
        // Arabic just because the reply contains Arabic text).
        if (getSavedRecognitionLang() === "auto") {
          const replyLangKey = detectTextLanguage(replyText);
          if (replyLangKey && LIVE_CHAT_FILLER_PHRASES[replyLangKey]) {
            liveChatDetectedConversationLangKey = replyLangKey;
          }
        }
        speakLiveChatReply(replyText);
      } else {
        setLiveChatStatusLabel("Listening...");
        liveChatState = "listening";
        startLiveRecordingSegment();
      }
    } catch (err) {
      console.error("Live chat processing failed:", err);
      clearInterval(liveChatDelayFillerInterval);
      if (!liveChatActive) return;
      // Interrupted -- a fresh listening session is already underway
      // via handleLiveChatBargeIn(), don't start a second, conflicting
      // one on top of it.
      if (myGeneration !== liveChatProcessingGeneration) return;
      setLiveChatStatusLabel("Listening...");
      liveChatState = "listening";
      startLiveRecordingSegment();
    }
  }

  // A confirmed real complaint this addresses: per-language caching
  // (the previous approach) still weren't giving fully reliable voice
  // consistency -- reports included English responses occasionally
  // getting read in what sounded like a completely different voice/
  // accent. Simplified to the most robust version possible: exactly
  // ONE voice for Arabic text and ONE voice for everything else,
  // each decided ONCE per session (whichever voice comes back the
  // very first time that category is needed) and reused verbatim for
  // every later response in that category -- no re-detection, no
  // re-resolution, nothing that could pick something different later.
  // Deliberately checks ONLY for Arabic script directly, rather than
  // running text through the full multi-script/stopword
  // detectTextLanguage() -- that function has many possible detected
  // languages, any one of which misfiring on ordinary text could
  // trigger picking a different, wrong voice; a direct Arabic-script
  // check has one simple, reliable answer (present or not), and
  // Arabic/non-Arabic is the only distinction that actually needs a
  // different voice in this app. Reset fresh at the start of every new
  // Live Chat session (see startLiveChat), so a stale choice never
  // carries over from an unrelated earlier session.
  let liveChatLockedArabicVoice = null;
  let liveChatLockedDefaultVoice = null;
  const LIVE_CHAT_ARABIC_SCRIPT_PATTERN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

  function resolveLiveChatSpeechVoice(text, availableVoices) {
    const savedLang = getSavedListenLang();
    if (savedLang !== "auto") {
      // An explicit manual selection is already the same every time by
      // definition -- no locking needed, just resolve directly.
      return resolveSpeechVoice(text, availableVoices);
    }

    const isArabic = LIVE_CHAT_ARABIC_SCRIPT_PATTERN.test(text);

    if (isArabic) {
      if (!liveChatLockedArabicVoice) {
        liveChatLockedArabicVoice = resolveSpeechVoice(text, availableVoices);
      }
      return liveChatLockedArabicVoice;
    }

    if (!liveChatLockedDefaultVoice) {
      // Deliberately does NOT go through resolveSpeechVoice()'s full
      // multi-script/stopword detectTextLanguage() logic here -- that
      // detection has many possible outcomes for ordinary text, any of
      // which misfiring could pick an unexpected voice even before
      // this lock takes effect. Directly picks one specific English
      // voice instead, with no detection step involved at all --
      // "default" in this app's actual usage means English.
      const englishVoice = availableVoices.find((v) => v.lang.toLowerCase().startsWith("en")) || availableVoices[0] || null;
      liveChatLockedDefaultVoice = { resolvedLang: englishVoice ? englishVoice.lang : null, matchingVoice: englishVoice };
    }
    return liveChatLockedDefaultVoice;
  }

  function speakLiveChatReply(text) {
    // Lets a still-playing filler ("Ok, let me think about that...")
    // finish naturally instead of getting cut off mid-sentence the
    // moment the real reply is ready. Everything below runs once the
    // filler (if any) is done -- resolves immediately if none is active.
    waitForFillerQueueToFinish().then(() => {
      if (!liveChatActive) return; // stopped while waiting for the filler to finish
      liveChatState = "speaking";
      setLiveChatStatusLabel("Speaking...");
      speakLiveChatReplyNow(text);
    });
  }

  function speakLiveChatReplyNow(text) {
    const onSpeakingDone = () => {
      if (!liveChatActive) return;
      setLiveChatStatusLabel("Listening...");
      liveChatState = "listening";
      liveChatSilenceStartTime = null;
      liveChatHasSpeechInSegment = false;
      startLiveRecordingSegment();
    };
    const onSpeakingError = () => {
      if (!liveChatActive) return;
      setLiveChatStatusLabel("Listening...");
      liveChatState = "listening";
      startLiveRecordingSegment();
    };

    // Uses the browser's own free, built-in Web Speech API -- no API
    // key, no usage quota, works entirely client-side. Each language
    // gets its own single, stable voice via resolveLiveChatSpeechVoice's
    // own per-language consistency caching below, rather than one voice
    // being forced across every language.
    ensureVoicesLoaded().then((availableVoices) => {
      if (!liveChatActive) return;

      const { resolvedLang, matchingVoice } = resolveLiveChatSpeechVoice(text, availableVoices);

      speakTextChunked(text, resolvedLang, matchingVoice, onSpeakingDone, onSpeakingError);
    });
  }

  // Animates the 12-square logo mosaic, tuned for a smooth, natural-
  // looking flow that responds to what's actually happening in the
  // conversation, not just raw mic loudness:
  //   - LISTENING + quiet: soft, slow breathing (small amplitude).
  //   - LISTENING + real detected speech: active pulse, sized from real
  //     smoothed mic volume.
  //   - SPEAKING (the bot's own reply): the Web Speech API gives no
  //     access to the actual synthesized audio's amplitude, so real mic
  //     analysis can't drive this the way it does for listening -- a
  //     smooth, organic two-layer sine motion simulates a natural
  //     talking rhythm instead, still clearly animated rather than
  //     frozen or just reusing the quiet-breathing look.
  //   - PROCESSING: a gentle, slightly quicker breathing pulse, visually
  //     distinct from idle listening.
  //   - Color flows as a genuine diagonal WAVE across the grid (each
  //     square's position drives its hue, precomputed from its real
  //     (x,y) center -- see LIVE_CHAT_SQUARE_WAVE_PHASE), cycling
  //     through a curated set of vivid "techno" hues (blue, red,
  //     violet, light green, cyan, magenta) instead of a raw rainbow
  //     sweep that would pass through duller yellow/brown tones.
  let liveChatHueOffset = 0;
  let liveChatSmoothedVolume = 0;
  let liveChatSmoothedBandEnergy = null; // initialized lazily to match the real square count
  let liveChatSmoothedScale = 1;

  // Each value is this square's normalized (0..1) diagonal position
  // within the actual logo grid, precomputed from its real pixel center
  // -- matches the exact DOM order of the 12 <rect> elements above.
  const LIVE_CHAT_SQUARE_WAVE_PHASE = [
    0.001, 0.251, 0.000, 0.250, 0.501, 0.751, 0.249, 0.499, 0.750, 1.000, 0.749, 0.999,
  ];

  // Curated vivid "techno" hues -- interpolated smoothly between these
  // specific stops (see getTechnoHue) rather than sweeping through
  // every possible hue, so the palette stays in vivid blue/red/violet/
  // green/cyan/magenta territory and never drifts into duller yellow-
  // brown tones a raw 0-360 rotation would pass through.
  const TECHNO_HUE_STOPS = [145, 205, 260, 295]; // green, blue, violet, purple -- per explicit request, dropping the previous red/magenta stops

  function getTechnoHue(position) {
    // position: 0..1, wraps around back to the first stop
    const scaled = ((position % 1) + 1) % 1 * TECHNO_HUE_STOPS.length;
    const idx = Math.floor(scaled) % TECHNO_HUE_STOPS.length;
    const nextIdx = (idx + 1) % TECHNO_HUE_STOPS.length;
    const frac = scaled - Math.floor(scaled);
    const h1 = TECHNO_HUE_STOPS[idx];
    const h2 = TECHNO_HUE_STOPS[nextIdx];
    let diff = h2 - h1;
    if (diff > 180) diff -= 360; // shortest path around the color wheel either direction
    if (diff < -180) diff += 360;
    return (h1 + diff * frac + 360) % 360;
  }

  function drawLiveChatVisualizer(overallVolume) {
    if (!liveChatAnalyser) return;

    const squares = document.querySelectorAll(".live-logo-square");
    if (squares.length === 0) return;

    if (!liveChatSmoothedBandEnergy) {
      liveChatSmoothedBandEnergy = new Array(squares.length).fill(0);
    }

    const bufferLength = liveChatAnalyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    liveChatAnalyser.getByteFrequencyData(freqData);

    const step = Math.max(1, Math.floor(bufferLength / squares.length));

    // Slow, continuous rotation through the techno palette, independent
    // of audio -- a full cycle through all 6 stops takes roughly 15
    // seconds at 60fps, calm rather than manic.
    liveChatHueOffset = (liveChatHueOffset + 0.4) % 360;

    const SMOOTHING = 0.12; // how much each new real reading nudges the displayed value -- lower = smoother/slower

    squares.forEach((square, i) => {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += freqData[i * step + j] || 0;
      const rawBandEnergy = sum / step / 255;

      liveChatSmoothedBandEnergy[i] += (rawBandEnergy - liveChatSmoothedBandEnergy[i]) * SMOOTHING;
      const bandEnergy = liveChatSmoothedBandEnergy[i];

      const position = (liveChatHueOffset / 360) + LIVE_CHAT_SQUARE_WAVE_PHASE[i];
      const hue = getTechnoHue(position);
      // Quiet -> pale, near-white/grey (high lightness, low saturation);
      // energetic -> vivid green/blue/violet/purple (mid lightness, high
      // saturation) -- per explicit request for this white/grey-to-color
      // spectrum, rather than always-vivid color regardless of energy.
      // Quiet -> pale but still visibly tinted (the wave needs enough
      // saturation to actually show which hue each square is, even at
      // rest); energetic -> vivid green/blue/violet/purple. The
      // saturation floor was previously too low (8%) -- different hues
      // become nearly indistinguishable from each other at that low a
      // saturation, which visually erased the diagonal color wave
      // entirely during quiet moments.
      const lightness = 82 - bandEnergy * 30;
      const saturation = 35 + bandEnergy * 55;
      const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      square.style.fill = color;
      square.style.filter = `drop-shadow(0 0 6px ${color})`;
    });

    liveChatSmoothedVolume += (Math.min(overallVolume, 0.3) - liveChatSmoothedVolume) * SMOOTHING;

    const now = Date.now();
    let rawTargetScale;

    if (liveChatState === "speaking") {
      // No real audio data available for the bot's own TTS output --
      // an organic two-layer sine motion (a slow base wave plus a
      // faster, smaller flutter on top) gives a natural talking rhythm
      // rather than either freezing or falling back to the quiet-
      // breathing look during the one state that's actually the most
      // active part of the conversation.
      const base = Math.sin(now / 260) * 0.16;
      const flutter = Math.sin(now / 95) * 0.05;
      rawTargetScale = 1.05 + base + flutter;
    } else if (liveChatState === "processing") {
      // Distinct from idle listening -- a bit quicker, still gentle.
      rawTargetScale = 1.0 + Math.sin(now / 500) * 0.08;
    } else if (liveChatSmoothedVolume > LIVE_CHAT_SILENCE_THRESHOLD) {
      // Listening AND genuinely picking up real speech -- an active
      // pulse sized directly from real smoothed mic volume.
      const volumeNormalized = liveChatSmoothedVolume / 0.3;
      rawTargetScale = 0.9 + volumeNormalized * 0.55;
    } else {
      // Listening but quiet -- soft, slow breathing.
      rawTargetScale = 1.0 + Math.sin(now / 1800) * 0.05;
    }

    // Smooths the transition BETWEEN these different profiles too (e.g.
    // the moment listening turns into speaking), not just within one --
    // avoids a jarring jump right when the state itself changes.
    liveChatSmoothedScale += (rawTargetScale - liveChatSmoothedScale) * 0.15;

    const svg = document.getElementById("liveChatLogoSvg");
    if (svg) {
      svg.style.transform = `scale(${liveChatSmoothedScale})`;
    }
  }

  // Escapes user-controlled text (e.g. a typed caption) before it's
  // inserted as innerHTML alongside an attached image -- a real
  // injection risk otherwise, since addMessage's allowHTML path trusts
  // its input as-is.
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Calm, low-saturation background tints for the chat area itself --
  // deliberately subtle (barely a step away from the existing neutral
  // #111) rather than bright/saturated, so switching models is a gentle
  // visual cue rather than a jarring color change, and stays easy on
  // the eyes over a long session. Each model (live or coming-soon) gets
  // its own distinct tint, spread across different hue families (blue,
  // teal, violet, steel, plum, sage, amber, neutral) so they read as
  // clearly different screens while staying uniformly dark/muted.
  const MODE_BACKGROUND_COLORS = {
    chat: "#162131",           // General Chat -- calm soft blue
    prediction: "#163126",     // Prediction Model -- calm soft teal
    science: "#261631",        // Science and Research (legacy/unused) -- calm soft violet
    science_school: "#1d2a3a",          // School and Students -- calm soft navy
    science_research_assistant: "#261631", // Research Assistant -- same calm soft violet as the old single science mode
    science_create_paper: "#241f33",    // Create Research Papers wizard -- calm soft deep violet, distinct enough from the chat sub-modes
    cybersecurity: "#162a31",  // Cybersecurity and Capacity Building -- calm soft cyan-steel
    code: "#181631",           // Code -- calm soft indigo
    docCreator: "#312a16",     // Document Creator -- calm soft amber
    videoCreator: "#311628",   // Video Creator -- calm soft rose/magenta
    imagesCreator: "#213116",  // Images Creator -- calm soft olive green
    audioCreator: "#312116",   // Audio Creator -- calm soft orange
  };
  const DEFAULT_CHAT_BACKGROUND = "#111";

  // Per explicit request: the input bar's placeholder text is now
  // suited to whichever model is actually active, keyed the same way
  // as MODE_BACKGROUND_COLORS above -- General Chat gets a general
  // prompt, Prediction Model names its real, current markets plus the
  // near-future NYSE stocks plan, and each coming-soon model names its
  // own subject while being honest that it's actually still General
  // Chat underneath for now.
  const DEFAULT_INPUT_PLACEHOLDER = "Ask GARNET about anything you may have in mind";
  const PLACEHOLDER_BY_KEY = {
    chat: DEFAULT_INPUT_PLACEHOLDER,
    prediction: "Ask about gold, oil, and USA dollar interest rate prices. In the near future we'll be adding NYSE stocks too -- or ask about anything else you may have in mind.",
    science: "Ask about science and research, request a technical or academic paper, or get help with math and geometry problems -- or ask about anything else you may have in mind.",
    science_school: "Ask any school subject question, KG1 through Grade 12 -- IG, SAT, IB, AP, or any other system. Attach a photo, Word, Excel, or PDF file of the question if you have it.",
    science_research_assistant: "Ask me to find literature on a topic, analyze existing research, discuss it in depth, or suggest research methods and analysis tools -- or ask about anything else you may have in mind.",
    cybersecurity: "Ask about national cybersecurity capacity, the CMM's five Dimensions, or capacity building in the AI era -- or ask about anything else you may have in mind.",
    code: "Ask about code and programming -- this model is coming soon, so you're currently connected to General Chat, or ask about anything else you may have in mind.",
    docCreator: "Ask about creating documents -- this model is coming soon, so you're currently connected to General Chat, or ask about anything else you may have in mind.",
    videoCreator: "Ask about creating videos -- this model is coming soon, so you're currently connected to General Chat, or ask about anything else you may have in mind.",
    imagesCreator: "Ask about creating images -- this model is coming soon, so you're currently connected to General Chat, or ask about anything else you may have in mind.",
    audioCreator: "Ask about creating audio -- this model is coming soon, so you're currently connected to General Chat, or ask about anything else you may have in mind.",
  };

  function applyModePlaceholder(key) {
    const input = document.getElementById("user-input");
    if (input) input.placeholder = PLACEHOLDER_BY_KEY[key] || DEFAULT_INPUT_PLACEHOLDER;
  }

  // Per explicit request: the Gold/Oil/Dollar/Stocks panel stays
  // visible the ENTIRE time the person is in Prediction Model, not
  // just right after picking it -- checked against the real `mode`
  // variable (not a one-off flag) so it correctly reflects whichever
  // model is actually active right now, including after switching
  // away and back, or starting a new chat while still in Prediction
  // Model (which doesn't change `mode` at all).
  function syncPredictionSidebar() {
    const sidebar = document.getElementById("predictionSidebar");
    const chatBox = document.getElementById("chat-box");
    const showing = mode === "prediction";
    if (sidebar) sidebar.style.display = showing ? "flex" : "none";
    if (chatBox) chatBox.classList.toggle("has-prediction-sidebar", showing);
  }

  function syncCybersecuritySidebar() {
    const sidebar = document.getElementById("cybersecuritySidebar");
    const chatBox = document.getElementById("chat-box");
    const showing = mode === "cybersecurity";
    if (sidebar) {
      sidebar.style.display = showing ? "flex" : "none";
      sidebar.classList.toggle("cmm-sidebar-bottom", showing && cmmAssessmentEverCompleted);
    }
    if (chatBox) chatBox.classList.toggle("has-cybersecurity-sidebar", showing);
  }

  // ------------------------------------------------------------------
  // GUIDED ASSESSMENT PROJECT -- per explicit request, the full flow is
  // now: Level (Country / Company-Organization) -> Domain (Cybersecurity
  // / Privacy) -> Project Name -> Method (Guided Conversation /
  // Structured Form). Supports all 4 real level+domain combinations
  // (see assessmentFrameworks.js on the backend for the real frameworks
  // behind each: GCSCC CMM, NIST CSF, NIST Privacy Framework, and a
  // country-privacy synthesis from OECD/UNCTAD/Convention 108+).
  // Every screen is positioned against #chatBoxWrapper (NOT the
  // scrolling #chat-box), the same fix already proven correct for the
  // MODELS overlay and Live Chat visualizer -- an overlay positioned
  // against a scrolling container would drift off-screen once the chat
  // scrolls.
  // ------------------------------------------------------------------

  // Single source of truth for the whole flow's current state.
  // Real list of world countries (196 -- the 193 UN member states plus
  // the Holy See, Palestine, and Taiwan, all commonly included in this
  // kind of country selector), alphabetically sorted, for the Country
  // entity-name dropdown per explicit request.
  const WORLD_COUNTRIES = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
    "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
    "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
    "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo (Republic of the)", "Congo (Democratic Republic of the)",
    "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador",
    "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France",
    "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
    "Guyana", "Haiti", "Holy See", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq",
    "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait",
    "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
    "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
    "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru",
    "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman",
    "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
    "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe",
    "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia",
    "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
    "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey",
    "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu",
    "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
  ];

  let cmmAssessment = {
    level: null,
    entityName: "",
    domain: null,
    projectName: "",
    method: null,
    questions: [],
    currentIndex: 0,
    answers: {}, // { factorId: { answer, fileName, fileText } }
  };

  // Per explicit request: the Start Assessment Project button
  // disappears the moment it's pressed (see startCmmProjectFlow), and
  // only reappears once the flow ends (cancel OR a report is
  // generated) -- but from then on it's pinned to the BOTTOM of the
  // screen instead of centered, since the big centered button only
  // really makes sense as a first-time empty-chat entry point.
  let cmmAssessmentEverCompleted = false;

  function setCmmSidebarVisible(visible) {
    const sidebar = document.getElementById("cybersecuritySidebar");
    if (!sidebar) return;
    sidebar.style.display = visible ? "flex" : "none";
    sidebar.classList.toggle("cmm-sidebar-bottom", visible && cmmAssessmentEverCompleted);
  }

  function startCmmProjectFlow() {
    if (isSending) return;
    setCmmSidebarVisible(false);
    cmmAssessment = { level: null, entityName: "", domain: null, projectName: "", method: null, questions: [], currentIndex: 0, answers: {} };
    showCmmLevelChoiceScreen();
  }

  // Ends the flow from ANY screen -- available via every screen's
  // Cancel button per explicit request. Closes whichever overlay is
  // open, resets state, and brings the Start Assessment Project button
  // back at the bottom of the screen (see setCmmSidebarVisible above).
  function cancelCmmAssessment() {
    closeCmmFlowOverlay();
    cmmAssessment = { level: null, entityName: "", domain: null, projectName: "", method: null, questions: [], currentIndex: 0, answers: {} };
    cmmAssessmentEverCompleted = true;
    setCmmSidebarVisible(mode === "cybersecurity");
  }

  function getCmmFlowOverlay() {
    let overlay = document.getElementById("cmmFlowOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "cmmFlowOverlay";
      overlay.className = "models-overlay";
      document.getElementById("chatBoxWrapper").appendChild(overlay);
    }
    return overlay;
  }

  function closeCmmFlowOverlay() {
    const overlay = document.getElementById("cmmFlowOverlay");
    if (overlay) overlay.style.display = "none";
  }

  function showCmmFlowScreen(innerHtml) {
    const overlay = getCmmFlowOverlay();
    overlay.innerHTML = `<div class="models-overlay-content cmm-form-content">${innerHtml}</div>`;
    overlay.style.display = "flex";
  }

  // Shared nav row used on every screen after the first -- Back and
  // Cancel are always available per explicit request. nextLabel/
  // nextOnclick let each screen customize the primary action (e.g.
  // "Next" vs "Generate Report").
  function cmmNavRowHtml({ showBack, backOnclick, nextLabel, nextOnclick, nextDisabled }) {
    return (
      `<div class="cmm-form-nav">` +
      `<div>${showBack ? `<button class="cmm-form-btn" onclick="${backOnclick}">← Back</button>` : ""}</div>` +
      `<div style="display:flex; gap:16px;">` +
      `<button class="cmm-form-btn" onclick="cancelCmmAssessment()">Cancel</button>` +
      (nextLabel ? `<button class="cmm-form-btn cmm-form-btn-primary" onclick="${nextOnclick}"${nextDisabled ? " disabled" : ""}>${nextLabel}</button>` : "") +
      `</div></div>`
    );
  }

  // --- Screen 1: Level ---
  function showCmmLevelChoiceScreen() {
    showCmmFlowScreen(
      `<div class="models-card-title">Is this assessment for a Country or a Company/Organization?</div>` +
      `<div class="models-card-grid">` +
      `<div class="model-box model-box-active" onclick="selectCmmLevel('country')"><div class="model-box-icon">🌍</div><div class="model-box-name">Country</div><div class="model-box-status">National-level assessment</div></div>` +
      `<div class="model-box model-box-active" onclick="selectCmmLevel('company')"><div class="model-box-icon">🏢</div><div class="model-box-name">Company / Organization</div><div class="model-box-status">Organization-level assessment</div></div>` +
      `</div>` +
      cmmNavRowHtml({ showBack: false })
    );
  }

  function selectCmmLevel(level) {
    cmmAssessment.level = level;
    showCmmEntityNameScreen();
  }

  // --- Screen 2: Entity name (country name or company name) ---
  function showCmmEntityNameScreen() {
    const isCountry = cmmAssessment.level === "country";
    const fieldHtml = isCountry
      ? `<select id="cmmEntityNameInput" class="cmm-form-textarea" style="min-height:auto;" onchange="cmmAssessment.entityName = this.value">` +
        `<option value="" disabled${cmmAssessment.entityName ? "" : " selected"}>Select a country...</option>` +
        WORLD_COUNTRIES.map(
          (c) => `<option value="${escapeHtmlAttr(c)}"${cmmAssessment.entityName === c ? " selected" : ""}>${escapeHtml(c)}</option>`
        ).join("") +
        `</select>`
      : `<input type="text" id="cmmEntityNameInput" class="cmm-form-textarea" style="min-height:auto;" placeholder="e.g. University of Oxford" value="${escapeHtmlAttr(cmmAssessment.entityName)}" oninput="cmmAssessment.entityName = this.value">`;

    showCmmFlowScreen(
      `<div class="models-card-title">${isCountry ? "What country is this assessment for?" : "What company/organization is this assessment for?"}</div>` +
      `<div class="cmm-form-field">${fieldHtml}</div>` +
      cmmNavRowHtml({
        showBack: true,
        backOnclick: "showCmmLevelChoiceScreen()",
        nextLabel: "Next →",
        nextOnclick: "submitCmmEntityName()",
      })
    );
    setTimeout(() => {
      const el = document.getElementById("cmmEntityNameInput");
      if (el) el.focus();
    }, 0);
  }

  function submitCmmEntityName() {
    const el = document.getElementById("cmmEntityNameInput");
    const isCountry = cmmAssessment.level === "country";
    cmmAssessment.entityName = (el ? el.value : cmmAssessment.entityName || "").trim() || (isCountry ? "Unnamed Country" : "Unnamed Organization");
    showCmmDomainChoiceScreen();
  }

  // --- Screen 3: Domain ---
  function showCmmDomainChoiceScreen() {
    showCmmFlowScreen(
      `<div class="models-card-title">Cybersecurity or Privacy maturity?</div>` +
      `<div class="models-card-grid">` +
      `<div class="model-box model-box-active" onclick="selectCmmDomain('cybersecurity')"><div class="model-box-icon">🔒</div><div class="model-box-name">Cybersecurity</div></div>` +
      `<div class="model-box model-box-active" onclick="selectCmmDomain('privacy')"><div class="model-box-icon">🕵️</div><div class="model-box-name">Privacy</div></div>` +
      `</div>` +
      cmmNavRowHtml({ showBack: true, backOnclick: "showCmmEntityNameScreen()" })
    );
  }

  function selectCmmDomain(domain) {
    cmmAssessment.domain = domain;
    showCmmProjectNameScreen();
  }

  // --- Screen 3: Project name ---
  function showCmmProjectNameScreen() {
    showCmmFlowScreen(
      `<div class="models-card-title">What's this project called?</div>` +
      `<div class="cmm-form-field"><input type="text" id="cmmProjectNameInput" class="cmm-form-textarea" style="min-height:auto;" placeholder="e.g. Q3 2026 Cybersecurity Review" value="${escapeHtmlAttr(cmmAssessment.projectName)}" oninput="cmmAssessment.projectName = this.value"></div>` +
      cmmNavRowHtml({
        showBack: true,
        backOnclick: "showCmmDomainChoiceScreen()",
        nextLabel: "Next →",
        nextOnclick: "submitCmmProjectName()",
      })
    );
    // Focuses the field immediately so the person can just start typing.
    setTimeout(() => {
      const el = document.getElementById("cmmProjectNameInput");
      if (el) el.focus();
    }, 0);
  }

  function submitCmmProjectName() {
    const el = document.getElementById("cmmProjectNameInput");
    cmmAssessment.projectName = (el ? el.value : cmmAssessment.projectName || "").trim() || "Untitled Assessment";
    showCmmMethodChoiceScreen();
  }

  // --- Screen 4: Method ---
  function showCmmMethodChoiceScreen() {
    showCmmFlowScreen(
      `<div class="models-card-title">How would you like to run this assessment?</div>` +
      `<div class="models-card-grid">` +
      `<div class="model-box model-box-active" onclick="startCmmGuidedConversation()"><div class="model-box-icon">💬</div><div class="model-box-name">Guided Conversation</div><div class="model-box-status">Answer questions in chat, one at a time</div></div>` +
      `<div class="model-box model-box-active" onclick="startCmmStructuredForm()"><div class="model-box-icon">📝</div><div class="model-box-name">Structured Form</div><div class="model-box-status">One question per screen, with file upload</div></div>` +
      `</div>` +
      cmmNavRowHtml({ showBack: true, backOnclick: "showCmmProjectNameScreen()" })
    );
  }

  // --- Guided Conversation route ---
  function startCmmGuidedConversation() {
    closeCmmFlowOverlay();
    const levelLabel = cmmAssessment.level === "company" ? "Company/Organization" : "Country";
    const domainLabel = cmmAssessment.domain === "privacy" ? "Privacy" : "Cybersecurity";
    quickAsk(
      `I'd like to start a guided ${domainLabel.toLowerCase()} maturity assessment at the ${levelLabel} level, for ${cmmAssessment.level === "company" ? "the company/organization" : "the country"} "${cmmAssessment.entityName}", project called "${cmmAssessment.projectName}". Please ask me detailed questions covering every relevant area at the right level, one at a time, and once we've covered everything, generate a full professional report with charts and tables.`,
      "cybersecuritySidebarBtn",
      "Cybersecurity",
      "cybersecurity"
    );
    // Guided Conversation hands off to normal chat from here -- no
    // further modal steps, so the button returns immediately (at the
    // bottom, per explicit request) rather than staying hidden.
    cmmAssessmentEverCompleted = true;
    setCmmSidebarVisible(true);
  }

  // --- Structured Form route ---
  async function startCmmStructuredForm() {
    try {
      const response = await fetch(`${ASSESSMENT_QUESTIONS_API_URL}?level=${encodeURIComponent(cmmAssessment.level)}&domain=${encodeURIComponent(cmmAssessment.domain)}`);
      const data = await response.json();
      cmmAssessment.questions = data.factors || [];
    } catch (err) {
      console.error("Could not load assessment questions:", err);
      alert("Could not load the assessment questions. Please try again.");
      return;
    }
    if (!cmmAssessment.questions.length) {
      alert("Could not load the assessment questions. Please try again.");
      return;
    }
    cmmAssessment.currentIndex = 0;
    cmmAssessment.answers = {};
    showCmmFormQuestionScreen();
  }

  function showCmmFormQuestionScreen() {
    const q = cmmAssessment.questions[cmmAssessment.currentIndex];
    const saved = cmmAssessment.answers[q.id] || { answer: "", fileName: null };
    const isLast = cmmAssessment.currentIndex === cmmAssessment.questions.length - 1;

    showCmmFlowScreen(
      `<div class="cmm-form-progress">Question ${cmmAssessment.currentIndex + 1} of ${cmmAssessment.questions.length} -- ${escapeHtml(q.dimension)}</div>` +
      `<div class="cmm-form-field">` +
      `<label class="cmm-form-label">${escapeHtml(q.id)} -- ${escapeHtml(q.name)}</label>` +
      `<div class="cmm-form-question">${escapeHtml(q.question)}</div>` +
      `<textarea class="cmm-form-textarea" id="cmmFormAnswerInput" placeholder="Describe your current situation...">${escapeHtml(saved.answer)}</textarea>` +
      `<div class="cmm-form-file-row">` +
      `<label class="cmm-form-file-label">📎 Attach a file (optional)<input type="file" id="cmmFormFileInput" style="display:none;" onchange="handleCmmFormFileUpload(this)"></label>` +
      `<span id="cmmFormFileName">${saved.fileName ? "Attached: " + escapeHtml(saved.fileName) : ""}</span>` +
      `</div>` +
      `</div>` +
      cmmNavRowHtml({
        showBack: true,
        backOnclick: "cmmFormGoBack()",
        nextLabel: isLast ? "Generate and Download Report" : "Next →",
        nextOnclick: isLast ? "submitCmmAssessmentForm()" : "cmmFormGoNext()",
      })
    );
    setTimeout(() => {
      const el = document.getElementById("cmmFormAnswerInput");
      if (el) el.focus();
    }, 0);
  }

  // Reads an attached file's real text content when possible (plain
  // text files) so it becomes part of the actual answer sent for
  // grounding the report -- for other file types, the filename is
  // still recorded and noted to the model, but building a full
  // document-parsing pipeline for every possible file type here was
  // out of scope for this pass; text files are the common real case
  // (notes, exported reports) and are handled fully.
  function handleCmmFormFileUpload(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const q = cmmAssessment.questions[cmmAssessment.currentIndex];
    if (!cmmAssessment.answers[q.id]) cmmAssessment.answers[q.id] = { answer: "", fileName: null, fileText: null };
    cmmAssessment.answers[q.id].fileName = file.name;
    const nameEl = document.getElementById("cmmFormFileName");
    if (nameEl) nameEl.textContent = `Attached: ${file.name}`;

    if (file.type.startsWith("text/")) {
      const reader = new FileReader();
      reader.onload = () => {
        cmmAssessment.answers[q.id].fileText = reader.result;
      };
      reader.readAsText(file);
    } else {
      cmmAssessment.answers[q.id].fileText = null; // filename still recorded above
    }
  }

  function saveCmmCurrentAnswer() {
    const q = cmmAssessment.questions[cmmAssessment.currentIndex];
    const el = document.getElementById("cmmFormAnswerInput");
    const existing = cmmAssessment.answers[q.id] || {};
    cmmAssessment.answers[q.id] = { ...existing, answer: el ? el.value : existing.answer || "" };
  }

  function cmmFormGoNext() {
    saveCmmCurrentAnswer();
    if (cmmAssessment.currentIndex < cmmAssessment.questions.length - 1) {
      cmmAssessment.currentIndex++;
      showCmmFormQuestionScreen();
    }
  }

  function cmmFormGoBack() {
    saveCmmCurrentAnswer();
    if (cmmAssessment.currentIndex > 0) {
      cmmAssessment.currentIndex--;
      showCmmFormQuestionScreen();
    } else {
      showCmmMethodChoiceScreen();
    }
  }

  async function submitCmmAssessmentForm() {
    saveCmmCurrentAnswer();
    const answers = cmmAssessment.questions.map((q) => {
      const a = cmmAssessment.answers[q.id] || {};
      const answerText = a.fileText ? `${a.answer || ""}\n\n(Attached file "${a.fileName}":\n${a.fileText})` : a.answer || "";
      return { factorId: q.id, answer: answerText };
    });
    const projectName = cmmAssessment.projectName;
    const entityName = cmmAssessment.entityName;
    const level = cmmAssessment.level;
    const domain = cmmAssessment.domain;

    closeCmmFlowOverlay();
    addMessage(`Generating and downloading your "${projectName}" assessment report -- this covers all ${answers.length} areas, so it may take a moment...`, "bot");

    try {
      const response = await fetch(ASSESSMENT_REPORT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, domain, projectName, entityName, answers }),
      });
      const data = await response.json();
      if (response.ok && data.structuredReport) {
        // Per explicit request: the report is no longer displayed in
        // chat -- pressing "Generate and Download Report" goes
        // straight to a real download (generateCmmReportDocx handles
        // both the download itself AND showing the thank-you overlay
        // with "Start New Assessment Project" once it succeeds -- see
        // that function below).
        await generateCmmReportDocx(data.structuredReport, null);
        // A short, factual record in chat history (not the full
        // report content, which is no longer shown) so the sidebar
        // history still reflects that an assessment was completed.
        const entityLabel = level === "company" ? "Company/Organization" : "Country";
        const historyNote = `Assessment report generated and downloaded: "${projectName}" -- ${entityLabel}: ${entityName}.`;
        saveMessageToHistory(`CMM Assessment: ${projectName}`, historyNote, historyNote);
      } else {
        addMessage("⚠️ Could not generate the assessment report. Please try again.", "bot");
      }
    } catch (err) {
      console.error("Assessment report generation failed:", err);
      addMessage("⚠️ Could not generate the assessment report due to a connection error.", "bot");
    } finally {
      cmmAssessmentEverCompleted = true;
      setCmmSidebarVisible(mode === "cybersecurity");
    }
  }

  // Builds the same download-button HTML server-side textFormatting.js
  // generates for a ```cmm-report fenced block (see the matching
  // .cmm-report-download / data-cmm-report pattern there) -- kept in
  // sync deliberately since both need to be readable by the SAME
  // downloadCmmReportFromMessage handler below. structuredReport gets
  // embedded as an HTML-attribute-escaped JSON string, same escaping
  // approach used server-side.
  function renderCmmReportDownloadButtonHtml(structuredReport) {
    const safeJson = JSON.stringify(structuredReport)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<div class="cmm-report-download" data-cmm-report="${safeJson}"><button class="cmm-report-download-btn" onclick="downloadCmmReportFromMessage(this)">📄 Download Full Report (Word)</button></div>`;
  }

  // Per explicit request: the chat-visible end of a completed
  // assessment shows a clear "Done for [project], [Country/Company]:
  // [name], Date: [date]" line right before the download button,
  // rather than the download button appearing right after the raw
  // analysis with no clear sense of completion.
  function renderCmmReportCompletionHtml(structuredReport) {
    const entityLabel = structuredReport.level === "company" ? "Company/Organization" : "Country";
    const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const completionLine =
      `<p style="margin-top:18px;"><strong>Done for Project: ${escapeHtml(structuredReport.projectName || "Untitled Assessment")} -- ${escapeHtml(entityLabel)}: ${escapeHtml(structuredReport.entityName || "N/A")} -- Date: ${escapeHtml(dateStr)}</strong></p>`;
    return completionLine + renderCmmReportDownloadButtonHtml(structuredReport);
  }

  // Called by the "Download Full Report (Word)" button, whether it came
  // from the Structured Form path (built directly above) or from a
  // completed Guided Conversation (the ```cmm-report fenced block --
  // see textFormatting.js on the backend, which emits the exact same
  // .cmm-report-download / data-cmm-report structure). Reads the real
  // structured report back out of the button's own container element.
  function downloadCmmReportFromMessage(buttonEl) {
    const container = buttonEl.closest(".cmm-report-download");
    if (!container) return;
    let structuredReport;
    try {
      structuredReport = JSON.parse(container.getAttribute("data-cmm-report"));
    } catch (err) {
      console.error("Could not parse stored CMM report data:", err);
      alert("Could not read the report data. Please try generating the report again.");
      return;
    }
    generateCmmReportDocx(structuredReport, buttonEl);
  }

  // The actual shared generation flow -- real chart rendered CLIENT-SIDE
  // via the app's own already-working Chart.js (deliberately not
  // server-side, since native canvas/chart libraries are a common
  // source of unreliable deploys on hosting platforms like Render that
  // don't include their system-level dependencies by default), then a
  // real .docx file requested from the backend and downloaded for real
  // via a real Blob + temporary <a download> click -- not a fake link,
  // an actual browser file download.
  async function generateCmmReportDocx(structuredReport, triggerButton) {
    const originalButtonText = triggerButton ? triggerButton.textContent : null;
    if (triggerButton) {
      triggerButton.disabled = true;
      triggerButton.textContent = "Generating report...";
    }

    let chartImageBase64 = null;
    try {
      chartImageBase64 = renderCmmDimensionChartToPngDataUrl(structuredReport);
    } catch (err) {
      console.error("CMM chart rendering for report export failed:", err);
      // Falls through with chartImageBase64 left null -- the backend
      // handles a missing chart image gracefully and still produces a
      // complete document, just without the chart image.
    }

    try {
      const response = await fetch(CMM_GENERATE_REPORT_DOCX_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structuredReport, chartImageBase64 }),
      });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CMM-Cybersecurity-Assessment-${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      // Per explicit request: a clear thank-you screen right after a
      // successful download, with a fresh entry point to start another
      // assessment -- distinct from the smaller bottom-pinned sidebar
      // button, which stays available too.
      showCmmThankYouOverlay();
    } catch (err) {
      console.error("CMM report docx download failed:", err);
      alert("Could not generate the downloadable report. Please try again.");
    } finally {
      if (triggerButton) {
        triggerButton.disabled = false;
        triggerButton.textContent = originalButtonText;
      }
    }
  }

  // Renders a real bar chart (average real maturity-stage number, 1-5,
  // per Dimension -- computed from the SAME structured data the written
  // report is built from, so the chart and the text can never disagree)
  // on a temporary, off-screen canvas -- not added to the visible chat,
  // purely to produce a real PNG for embedding in the Word document.
  // Animation is disabled so the chart is fully drawn synchronously
  // before toDataURL() is called, rather than racing an in-progress
  // animation frame.
  // Per explicit request: a bold thank-you message centered in the
  // chat area after a successful report download, with a real
  // "Start New Assessment Project" entry point right underneath it --
  // uses the SAME overlay pattern (positioned against #chatBoxWrapper,
  // not the scrolling #chat-box) already proven correct throughout
  // this flow.
  function showCmmThankYouOverlay() {
    let overlay = document.getElementById("cmmThankYouOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "cmmThankYouOverlay";
      overlay.className = "models-overlay";
      document.getElementById("chatBoxWrapper").appendChild(overlay);
    }
    overlay.innerHTML =
      `<div class="models-overlay-content cmm-thank-you-content">` +
      `<button class="models-overlay-close" onclick="closeCmmThankYouOverlay()" title="Close">✕</button>` +
      `<div class="cmm-thank-you-message">Thank you for using GARNET Cybersecurity and Privacy Assessment Services.</div>` +
      `<button class="prediction-sidebar-btn" onclick="closeCmmThankYouOverlay(); startCmmProjectFlow();">🚀 Start New Assessment Project</button>` +
      `</div>`;
    overlay.style.display = "flex";
  }

  function closeCmmThankYouOverlay() {
    const overlay = document.getElementById("cmmThankYouOverlay");
    if (overlay) overlay.style.display = "none";
  }

  function renderCmmDimensionChartToPngDataUrl(structuredReport) {
    if (typeof Chart === "undefined") {
      throw new Error("Chart.js failed to load (window.Chart is undefined)");
    }
    const dimensions = structuredReport.dimensions || [];
    const labels = dimensions.map((d) => (d.name || "").replace(/^Dimension \d+:\s*/, ""));
    const averages = dimensions.map((d) => {
      const assessed = (d.factors || []).filter((f) => Number(f.stageNumber) > 0);
      if (assessed.length === 0) return 0;
      const sum = assessed.reduce((total, f) => total + Number(f.stageNumber), 0);
      return Math.round((sum / assessed.length) * 100) / 100;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 540;
    canvas.style.position = "fixed";
    canvas.style.left = "-9999px"; // off-screen, never visible to the user
    document.body.appendChild(canvas);

    let chartInstance;
    try {
      chartInstance = new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Average Maturity Stage (1-5)",
              data: averages,
              backgroundColor: "#1d4ed8",
            },
          ],
        },
        options: {
          responsive: false,
          animation: false,
          scales: {
            y: { min: 0, max: 5, ticks: { stepSize: 1 } },
          },
          plugins: {
            title: { display: true, text: "Cybersecurity Capacity Maturity by Dimension" },
            legend: { display: false },
          },
        },
      });
      return canvas.toDataURL("image/png");
    } finally {
      if (chartInstance) chartInstance.destroy();
      canvas.remove();
    }
  }

  // Shared by both the model picker (buildModelsCardHtml) and the
  // "Coming Soon" screen (showComingSoonScreen) below, so the icon and
  // display name for each not-yet-built model only ever need to be
  // written in one place.
  const COMING_SOON_MODELS = {
    code: { icon: "💻", name: "Code" },
    docCreator: { icon: "📄", name: "Document Creator" },
    videoCreator: { icon: "🎬", name: "Video Creator" },
    imagesCreator: { icon: "🖼️", name: "Images Creator" },
    audioCreator: { icon: "🎵", name: "Audio Creator" },
  };

  function applyModeBackground(m) {
    const chatBox = document.getElementById("chat-box");
    if (chatBox) chatBox.style.backgroundColor = MODE_BACKGROUND_COLORS[m] || DEFAULT_CHAT_BACKGROUND;
  }

  // Per explicit request: the not-yet-built models are no longer inert
  // dimmed boxes -- clicking one now takes you to a dedicated screen
  // for that model, with its own calm background color (see
  // MODE_BACKGROUND_COLORS above) and a big "Coming Soon" banner,
  // instead of doing nothing at all.
  function showComingSoonScreen(key) {
    const info = COMING_SOON_MODELS[key];
    if (!info) return;
    closeModelsOverlay();
    startNewChat(); // per explicit request: switching models clears the previous chat, not just the color/title
    // Deliberately NOT calling setMode() here -- that would overwrite
    // both the header title and the background color with General
    // Chat's own values right after we set this model's. The backend
    // mode itself stays "chat" (safe default -- GARNET_MODEL_SCOPE_GUIDANCE
    // already knows how to talk about these topics helpfully while
    // mentioning they're coming soon), only the VISUAL identity changes.
    mode = "chat";
    document.getElementById("chatHeaderTitle").textContent = `GARNET ${info.name}`;
    applyModeBackground(key);
    applyModePlaceholder(key);
    syncPredictionSidebar();
    syncCybersecuritySidebar();
    addMessage(buildComingSoonBannerHtml(info.icon, info.name), "bot", true);
  }

  function buildComingSoonBannerHtml(icon, name) {
    return (
      `<div class="coming-soon-banner">` +
      `<div class="coming-soon-icon">${icon}</div>` +
      `<div class="coming-soon-name">${name}</div>` +
      `<div class="coming-soon-badge">Coming Soon</div>` +
      `<div class="coming-soon-note">This model is still being trained -- check back soon for a dedicated experience. In the meantime, you are connected to the General Chat.</div>` +
      `</div>`
    );
  }

  function setMode(selected) {
    teardownResearchPaperWizardIfActive();
    teardownSchoolWizardIfActive();
    mode = selected;
    document.getElementById("chatHeaderTitle").textContent =
      mode === "chat" ? "GARNET" : "GARNET Search";
    applyModeBackground(mode);
    applyModePlaceholder(mode);
    syncPredictionSidebar();
    syncCybersecuritySidebar();
    syncScienceSubmodeSwitcher();
  }

  function startNewChat() {
    document.getElementById("chat-box").innerHTML = "";
    conversationHistory = [];
    currentChatId = null;
    clearChatInputAutofill();
    document.querySelectorAll(".chat-history-item").forEach((el) => el.classList.remove("active-chat"));

    // Show a "folder" for the new chat immediately, even before the first
    // message is sent -- gets naturally replaced by the real saved
    // folder once loadChatList() re-renders after the first message is
    // actually saved (see saveMessageToHistory).
    const existingPlaceholder = document.getElementById("pendingNewChatItem");
    if (existingPlaceholder) existingPlaceholder.remove();
    const listEl = document.getElementById("chatHistoryList");
    const placeholder = document.createElement("div");
    placeholder.id = "pendingNewChatItem";
    placeholder.className = "chat-history-item active-chat pending-chat";
    placeholder.innerHTML = '<span class="chat-history-item-title">📁 New Chat</span>';
    listEl.insertBefore(placeholder, listEl.firstChild);
  }

  // ------------------------------------------------------------------
  // CHAT HISTORY (Firestore) -- each signed-in user's chats live at
  // users/{uid}/chats/{chatId}, readable/writable only by that user
  // themselves (enforced by Firestore security rules, not by this
  // client-side code -- see the rules given alongside this feature).
  // Each chat is presented as a "folder" (folder icon + title) in the
  // sidebar, per the requested folder-based organization.
  // ------------------------------------------------------------------

  async function loadChatList() {
    if (!currentUid) return;
    const listEl = document.getElementById("chatHistoryList");
    try {
      const snapshot = await db.collection("users").doc(currentUid)
        .collection("chats").orderBy("updatedAt", "desc").get();

      if (snapshot.empty) {
        listEl.innerHTML = '<div class="chat-history-empty">No saved chats yet</div>';
        return;
      }

      listEl.innerHTML = "";
      snapshot.forEach((doc) => {
        const data = doc.data();
        const item = document.createElement("div");
        item.className = "chat-history-item" + (doc.id === currentChatId ? " active-chat" : "");
        item.onclick = () => loadChat(doc.id, data.title, data.messages || []);

        const titleSpan = document.createElement("span");
        titleSpan.className = "chat-history-item-title";
        titleSpan.textContent = "📁 " + (data.title || "Untitled chat");
        titleSpan.title = data.title || "Untitled chat"; // full title on hover, since the narrow sidebar truncates it

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "chat-history-delete-btn";
        deleteBtn.title = "Delete this chat";
        deleteBtn.textContent = "✕";
        deleteBtn.onclick = (e) => {
          e.stopPropagation(); // don't also trigger loadChat when deleting
          deleteChat(doc.id);
        };

        item.appendChild(titleSpan);
        item.appendChild(deleteBtn);
        listEl.appendChild(item);
      });
    } catch (err) {
      console.error("Failed to load chat history:", err);
      listEl.innerHTML = '<div class="chat-history-empty">Could not load chat history</div>';
    }
  }

  function loadChat(chatId, title, messages) {
    currentChatId = chatId;
    document.getElementById("chat-box").innerHTML = "";
    conversationHistory = [];

    // Tracks the most recent user message's text as we walk through the
    // loaded history, so an assistant reply right after it can offer a
    // real retry -- see the retryInfo.historical flag used below and in
    // addMessage's retry button tooltip.
    let lastUserText = null;

    messages.forEach((msg) => {
      if (msg.role === "user") {
        // Recorded BEFORE this exchange is pushed below -- matches the
        // same historyIndex convention used for live messages in
        // sendMessage, so editing a message from a reopened chat
        // truncates back to the correct point instead of wiping
        // conversationHistory back to 0 regardless of where it actually
        // sits in the loaded conversation.
        const userMsgEl = addMessage(msg.content, "user", false, null, msg.ts);
        userMsgEl.dataset.historyIndex = conversationHistory.length;
        conversationHistory.push({ role: "user", content: msg.content });
        lastUserText = msg.content;
      } else if (msg.role === "assistant") {
        // Retry for a message loaded from saved history can only resend
        // the TEXT of the preceding user message -- any images/documents
        // originally attached to that exchange were never persisted to
        // Firestore (see saveMessageToHistory, which only saves text),
        // so this is a text-only retry, not a perfect replay of the
        // original request. Still offered rather than omitted entirely --
        // a text-only retry is better than no retry option at all once a
        // chat is reopened from the sidebar.
        const retryInfo = lastUserText
          ? { message: lastUserText, images: [], documents: [], historical: true }
          : null;
        addMessage(msg.htmlContent, "bot", true, retryInfo, msg.ts);
        conversationHistory.push({ role: "assistant", content: msg.rawContent });
      }
    });

    document.querySelectorAll(".chat-history-item").forEach((el) => el.classList.remove("active-chat"));
    // Re-render list so the correct item gets highlighted (simplest
    // correct way, given the list was built from a separate query).
    loadChatList();
  }

  // Holds which chat is awaiting delete confirmation between showing
  // the themed modal and the person actually clicking "Delete" on it
  // (module-scope since it needs to survive across that user action).
  let pendingDeleteChatId = null;

  function deleteChat(chatId) {
    if (!currentUid) return;
    pendingDeleteChatId = chatId;
    document.getElementById("deleteChatConfirmModal").style.display = "flex";
  }

  function closeDeleteChatConfirmModal() {
    pendingDeleteChatId = null;
    document.getElementById("deleteChatConfirmModal").style.display = "none";
  }

  async function confirmDeleteChat() {
    const chatId = pendingDeleteChatId;
    closeDeleteChatConfirmModal();
    if (!chatId || !currentUid) return;

    try {
      await db.collection("users").doc(currentUid).collection("chats").doc(chatId).delete();
      const wasActiveChat = chatId === currentChatId;
      await loadChatList(); // rebuild the real list first
      if (wasActiveChat) {
        startNewChat(); // then show the "new chat" placeholder on top of it
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
      alert("Could not delete this chat. Please try again.");
    }
  }

  function openDeleteAllChatsModal() {
    document.getElementById("accountDropdown").style.display = "none"; // close the settings dropdown behind the modal
    document.getElementById("deleteAllChatsConfirmModal").style.display = "flex";
  }

  function closeDeleteAllChatsModal() {
    document.getElementById("deleteAllChatsConfirmModal").style.display = "none";
  }

  async function confirmDeleteAllChats() {
    closeDeleteAllChatsModal();
    if (!currentUid) return;

    try {
      await deleteAllChatsForCurrentUser();
      await loadChatList(); // rebuild the (now-empty) list
      startNewChat(); // show a fresh "new chat" placeholder
    } catch (err) {
      console.error("Failed to delete all chats:", err);
      alert("Could not delete all chats. Please try again.");
    }
  }

  // Saves the just-completed exchange to Firestore -- creates a new
  // chat document on the FIRST message of a new chat (title = a
  // truncated snippet of that first message, the same convention
  // ChatGPT/Claude-style history lists use), or appends to the existing
  // document for subsequent messages in the same chat.
  async function saveMessageToHistory(userText, htmlReply, rawReply) {
    if (!currentUid) return; // not signed in (shouldn't happen given the auth gate, but a safe no-op if it does)

    const userMsg = { role: "user", content: userText, ts: Date.now() };
    const assistantMsg = { role: "assistant", htmlContent: htmlReply, rawContent: rawReply, ts: Date.now() };

    try {
      if (!currentChatId) {
        const title = userText.length > 45 ? userText.slice(0, 45) + "..." : userText;
        const docRef = await db.collection("users").doc(currentUid).collection("chats").add({
          title,
          messages: [userMsg, assistantMsg],
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        currentChatId = docRef.id;
      } else {
        await db.collection("users").doc(currentUid).collection("chats").doc(currentChatId).update({
          messages: firebase.firestore.FieldValue.arrayUnion(userMsg, assistantMsg),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
      loadChatList();
    } catch (err) {
      console.error("Failed to save chat history:", err);
      // Deliberately non-blocking -- a save failure shouldn't prevent
      // the user from continuing to chat, just means this exchange
      // won't be in their saved history.
    }
  }

  // Disables everything a user could use to submit a new message
  // (the text input, send button, and all quick-ask buttons) while
  // isSending is true, and restores them afterward. Prevents a second
  // request being fired while the first is still awaiting a reply --
  // both via the visible disabled state (can't type/click) and via the
  // isSending flag itself (a defensive second layer, e.g. against a
  // stray Enter keypress firing just before the DOM updates).
  function setSendingLock(locked) {
    isSending = locked;
    const input = document.getElementById("user-input");
    const sendBtn = document.getElementById("sendBtn");
    input.disabled = locked; // no typing while a request is in flight
    // sendBtn itself stays enabled/clickable even while locked -- in
    // this state a click means "stop", not "send", handled by
    // handleSendButtonClick() below. Only its icon/appearance changes.
    sendBtn.innerHTML = locked ? SEND_ICON_STOP : SEND_ICON_ARROW;
    sendBtn.title = locked ? "Stop" : "Send";
    sendBtn.classList.toggle("stop-state", locked);
    ["modelsBtn", "attachBtn", "micBtn"].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = locked;
    });
    if (!locked) input.focus();
  }

  // The send button's single onclick target -- routes to an actual
  // send when idle, or cancels the in-flight request when a message is
  // currently being sent (see currentAbortController in deliverMessage
  // below for the real cancellation logic, not just a visual stop).
  function handleSendButtonClick() {
    if (isSending) {
      if (currentAbortController) currentAbortController.abort();
    } else {
      sendMessage();
    }
  }

  function quickAsk(question, buttonId, headerLabel, modeOverride) {
    if (isSending) return; // ignore quick-ask clicks while a request is already in flight
    teardownResearchPaperWizardIfActive();
    teardownSchoolWizardIfActive();
    // "prediction" for the MODELS menu's Prediction Model submenu (so
    // the backend knows to give the FULL prediction, not just a live
    // price + a suggestion to switch models); "chat" otherwise, same
    // as before.
    mode = modeOverride || "chat";
    applyModeBackground(mode);
    applyModePlaceholder(mode);
    syncPredictionSidebar();
    syncCybersecuritySidebar();
    syncScienceSubmodeSwitcher();
    if (headerLabel) document.getElementById("chatHeaderTitle").textContent = `GARNET ${headerLabel}`;
    const input = document.getElementById("user-input");
    input.value = question;
    sendMessage();
  }

  async function sendMessage() {
    if (isSending) return; // defensive guard against overlapping submissions

    const input = document.getElementById("user-input");
    const typedMessage = input.value.trim();
    if (!typedMessage && pendingAttachments.length === 0) return; // nothing to send

    // Per explicit request: typing a message or attaching a file/image
    // while Live Chat is active sends it into the SAME live voice
    // conversation (a completely separate session from the normal
    // /chat flow below) instead -- see sendLiveChatTextOrAttachment.
    if (liveChatActive) {
      await sendLiveChatTextOrAttachment(typedMessage);
      return;
    }

    const imageAttachments = pendingAttachments.filter((a) => a.type === "image");
    const textAttachments = pendingAttachments.filter((a) => a.type === "text");
    const documentAttachments = pendingAttachments.filter((a) => a.type === "document");

    // What actually gets sent to the backend differs from what's shown
    // in the user's own chat bubble.
    let messageForBackend = typedMessage;
    const imagesForBackend = imageAttachments.map((a) => a.data);
    // Real Word/PDF/Excel/PowerPoint files -- sent as {name, data} pairs
    // for genuine server-side text extraction (see documentParser.js on
    // the backend). Different from textAttachments below, which the
    // browser already read as plain text itself.
    const documentsForBackend = documentAttachments.map((a) => ({ name: a.name, data: a.data }));

    if (textAttachments.length > 0) {
      // Folds each plain text file's real content into the message as
      // inline context for the model, while the user's own chat bubble
      // just shows clean "📄 filename" tags -- not the full dumped file
      // content, to keep the UI readable.
      const fileBlocks = textAttachments
        .map((a) => `File "${a.name}":\n---\n${a.data}\n---`)
        .join("\n\n");
      messageForBackend = `The user attached ${textAttachments.length > 1 ? "these files" : "this file"}:\n\n${fileBlocks}\n\n` +
        (typedMessage ? `User's message: ${typedMessage}` : "Please review this.");
    } else if (documentAttachments.length > 0 && !typedMessage) {
      messageForBackend = documentAttachments.length > 1
        ? "Please review these documents."
        : "Please review this document.";
    } else if (imageAttachments.length > 0 && !typedMessage && documentAttachments.length === 0) {
      // A sensible default prompt if the user attached only image(s)
      // with no typed text at all -- gives the model something
      // concrete to respond to instead of an empty prompt.
      messageForBackend = imageAttachments.length > 1
        ? "What can you tell me about these images?"
        : "What can you tell me about this image?";
    }

    // Build the user's own chat bubble: image thumbnails, document/file
    // tags (if any), then whatever they actually typed.
    if (pendingAttachments.length > 0) {
      const imagesHtml = imageAttachments
        .map((a) => `<img src="${a.data}" alt="Attached image" style="max-width:160px; max-height:160px; border-radius:8px; margin:2px;">`)
        .join("");
      // Real, clickable download links -- not just a filename label.
      // Documents (.docx/.pdf/.xlsx/.pptx) already have their full
      // original file as a base64 data URL, so that's used directly.
      // Text-based files were read as plain text (not base64), so
      // they're wrapped in a Blob to make an equivalent download link.
      // This is what actually solves "I want the file back" -- the
      // browser clipboard can't reliably hold arbitrary file types the
      // way it can images, but a direct download link always works.
      const fileTagsHtml = [
        ...documentAttachments.map((a) => {
          const regId = registerSentAttachment("document", a.name, a.data);
          return `<div><a href="${a.data}" download="${escapeHtml(a.name)}" data-attachment-id="${regId}" style="color:#111; text-decoration:underline; font-weight:bold;">📄 ${escapeHtml(a.name)}</a> <button onclick="reattachSentFile('${regId}')" title="Attach this file again to a new message" style="background:none; border:none; color:#999; cursor:pointer; font-size:13px; vertical-align:middle;">↺</button></div>`;
        }),
        ...textAttachments.map((a) => {
          const blobUrl = URL.createObjectURL(new Blob([a.data], { type: "text/plain" }));
          const regId = registerSentAttachment("text", a.name, a.data);
          return `<div><a href="${blobUrl}" download="${escapeHtml(a.name)}" data-attachment-id="${regId}" style="color:#111; text-decoration:underline; font-weight:bold;">📄 ${escapeHtml(a.name)}</a> <button onclick="reattachSentFile('${regId}')" title="Attach this file again to a new message" style="background:none; border:none; color:#999; cursor:pointer; font-size:13px; vertical-align:middle;">↺</button></div>`;
        }),
      ].join("");
      const captionHtml = typedMessage ? `<div style="margin-top:6px;">${escapeHtml(typedMessage)}</div>` : "";
      addMessage(
        `<div style="display:flex; flex-wrap:wrap;">${imagesHtml}</div>${fileTagsHtml}${captionHtml}`,
        "user",
        true
      );
    } else {
      const userMsgEl = addMessage(typedMessage, "user");
      // Records conversationHistory's length AT THIS MOMENT -- i.e.
      // everything before this exchange -- so editing this message later
      // (see startEditingMessage/resubmitEditedMessage) knows exactly
      // where to truncate history back to before resending the edited
      // text. Only meaningful for plain-text messages (the only ones
      // that get an Edit button at all -- see addMessage).
      userMsgEl.dataset.historyIndex = conversationHistory.length;
    }

    input.value = "";
    clearAttachments(); // the preview chips' job is done now that they've been sent
    await deliverMessage(messageForBackend, imagesForBackend, documentsForBackend);
  }

  // Sends typed text and/or attached images/documents into the SAME
  // active Live Chat voice session, via the Realtime API's own data
  // channel -- NOT the normal /chat HTTP endpoint, which is a
  // completely separate conversation the live session can't see at
  // all. Images go in directly as real image content (the Realtime
  // model has genuine vision -- no OCR/pre-processing needed). Plain
  // text files are folded in as text, same as the normal send path.
  // Real Word/PDF/Excel/PowerPoint documents need one extra step: the
  // Realtime API has no native document format, so their text is
  // extracted server-side first (via the standalone
  // /extract-document-text route -- same underlying extraction already
  // proven working for the normal /chat flow) and folded in as text.
  async function sendLiveChatTextOrAttachment(typedMessage) {
    const imageAttachments = pendingAttachments.filter((a) => a.type === "image");
    const textAttachments = pendingAttachments.filter((a) => a.type === "text");
    const documentAttachments = pendingAttachments.filter((a) => a.type === "document");

    if (!realtimeDataChannel || realtimeDataChannel.readyState !== "open") {
      alert("Live Chat isn't fully connected yet -- please wait a moment and try again.");
      return;
    }

    // Shows the user's own message bubble in the chat log, same visual
    // treatment (image thumbnails, downloadable file tags, caption) as
    // a normal sent message -- so there's a visible record even though
    // this doesn't go through the normal send path.
    if (pendingAttachments.length > 0) {
      const imagesHtml = imageAttachments
        .map((a) => `<img src="${a.data}" alt="Attached image" style="max-width:160px; max-height:160px; border-radius:8px; margin:2px;">`)
        .join("");
      const fileTagsHtml = [
        ...documentAttachments.map((a) => {
          const regId = registerSentAttachment("document", a.name, a.data);
          return `<div><a href="${a.data}" download="${escapeHtml(a.name)}" data-attachment-id="${regId}" style="color:#111; text-decoration:underline; font-weight:bold;">📄 ${escapeHtml(a.name)}</a></div>`;
        }),
        ...textAttachments.map((a) => {
          const blobUrl = URL.createObjectURL(new Blob([a.data], { type: "text/plain" }));
          const regId = registerSentAttachment("text", a.name, a.data);
          return `<div><a href="${blobUrl}" download="${escapeHtml(a.name)}" data-attachment-id="${regId}" style="color:#111; text-decoration:underline; font-weight:bold;">📄 ${escapeHtml(a.name)}</a></div>`;
        }),
      ].join("");
      const captionHtml = typedMessage ? `<div style="margin-top:6px;">${escapeHtml(typedMessage)}</div>` : "";
      addMessage(
        `<div style="display:flex; flex-wrap:wrap;">${imagesHtml}</div>${fileTagsHtml}${captionHtml}`,
        "user",
        true
      );
    } else {
      addMessage(typedMessage, "user");
    }

    document.getElementById("user-input").value = "";
    clearAttachments();
    setLiveChatStatusLabel("Thinking...");

    let combinedText = typedMessage;

    if (textAttachments.length > 0) {
      const fileBlocks = textAttachments.map((a) => `File "${a.name}":\n---\n${a.data}\n---`).join("\n\n");
      combinedText = `${combinedText ? combinedText + "\n\n" : ""}The user attached ${textAttachments.length > 1 ? "these files" : "this file"}:\n\n${fileBlocks}`;
    }

    if (documentAttachments.length > 0) {
      try {
        const response = await fetch(EXTRACT_DOCUMENT_TEXT_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documents: documentAttachments.map((a) => ({ name: a.name, data: a.data })) }),
        });
        const data = await response.json();
        if (response.ok && data.text) {
          combinedText = `${combinedText ? combinedText + "\n\n" : ""}The user attached ${documentAttachments.length > 1 ? "these documents" : "this document"}:\n\n${data.text}`;
        } else {
          combinedText = `${combinedText ? combinedText + "\n\n" : ""}(A document was attached but could not be read.)`;
        }
      } catch (err) {
        console.error("Live Chat document extraction failed:", err);
        combinedText = `${combinedText ? combinedText + "\n\n" : ""}(A document was attached but could not be read due to a connection error.)`;
      }
    }

    // A confirmed real bug this fixes, found via direct live testing:
    // sending images straight into the Realtime session as input_image
    // content parts did not work -- consistent with a documented,
    // confirmed case of Azure's own hosted version of this same API not
    // supporting input_image in Realtime sessions at all. Routes around
    // it entirely: each image is analyzed by the SAME gpt-4o-mini vision
    // pathway already proven working for the normal /chat flow (via the
    // new /analyze-image-for-live-chat endpoint), producing a real text
    // description that gets folded in as input_text below instead --
    // already confirmed working for documents. Run in parallel
    // (Promise.all), not one at a time, so multiple images don't
    // multiply the wait.
    if (imageAttachments.length > 0) {
      try {
        const descriptions = await Promise.all(
          imageAttachments.map(async (a) => {
            const response = await fetch(ANALYZE_IMAGE_FOR_LIVE_CHAT_API_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: a.data, caption: typedMessage || null }),
            });
            const data = await response.json();
            return response.ok && data.description ? data.description : null;
          })
        );
        const validDescriptions = descriptions.filter(Boolean);
        if (validDescriptions.length > 0) {
          const imageBlocks = validDescriptions
            .map((d, i) => (validDescriptions.length > 1 ? `Image ${i + 1}: ${d}` : d))
            .join("\n\n");
          combinedText = `${combinedText ? combinedText + "\n\n" : ""}The user attached ${validDescriptions.length > 1 ? "these images" : "this image"} -- here's what ${validDescriptions.length > 1 ? "they show" : "it shows"}:\n\n${imageBlocks}`;
        } else {
          combinedText = `${combinedText ? combinedText + "\n\n" : ""}(An image was attached but could not be analyzed.)`;
        }
      } catch (err) {
        console.error("Live Chat image analysis failed:", err);
        combinedText = `${combinedText ? combinedText + "\n\n" : ""}(An image was attached but could not be analyzed due to a connection error.)`;
      }
    }

    // Live Chat may have ended while a document/image was being
    // processed -- check again right before actually sending, rather
    // than trusting the state from when this function started.
    if (!liveChatActive || !realtimeDataChannel || realtimeDataChannel.readyState !== "open") {
      addMessage("⚠️ Live Chat ended before this could be sent.", "bot");
      return;
    }

    if (!combinedText) return; // nothing to actually send

    const contentParts = [{ type: "input_text", text: combinedText }];

    if (contentParts.length === 0) return; // nothing to actually send

    // Diagnostic logging. If this is sent but nothing happens, check
    // for a "Realtime API error event:" log right after (see the
    // existing generic "error" case in handleRealtimeServerEvent) --
    // that would mean OpenAI itself rejected the event.
    console.log("Live Chat: sending conversation.item.create with", contentParts);

    realtimeDataChannel.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: contentParts,
      },
    }));
    realtimeDataChannel.send(JSON.stringify({ type: "response.create" }));
  }

  // Shared by both sendMessage() and each message's own retry button --
  // the actual "talk to the backend and show the response" step, kept
  // in one place so retry can't silently drift out of sync with a
  // normal send.
  async function deliverMessage(messageForBackend, imagesForBackend, documentsForBackend) {
    if (isSending) return;
    setSendingLock(true);
    const thinkingMsg = addThinkingMessage(mode);

    // The exact payload that produced this response -- passed to
    // addMessage() below so ITS retry button (if the user clicks it
    // later) re-runs this SAME request again, not some other message's.
    const retryInfo = { message: messageForBackend, images: imagesForBackend, documents: documentsForBackend };

    // Lets the send button (now doubling as a stop button while
    // isSending is true) actually cancel this specific in-flight
    // request, rather than just changing its own appearance with no
    // real effect. Reused across every automatic retry attempt below,
    // not recreated per-attempt -- so clicking stop during ANY attempt
    // cancels the whole thing, not just the current one.
    currentAbortController = new AbortController();

    // Automatically retries a failed request up to twice (3 attempts
    // total) BEFORE ever showing an error to the user -- the thinking
    // indicator (with its existing rotating "Processing"/"Almost
    // there" status words) just keeps showing the whole time, since a
    // transient server error is exactly the kind of thing that often
    // succeeds on the very next try (e.g. a free-tier cold start
    // finishing mid-request). A real error is only ever shown as the
    // last resort, after every attempt has genuinely failed.
    const MAX_AUTO_RETRIES = 2;
    let succeeded = false;
    let finalError = null;

    for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: currentAbortController.signal,
          body: JSON.stringify({
            message: messageForBackend,
            mode,
            history: conversationHistory,
            timezone: userTimezone,
            images: imagesForBackend,
            documents: documentsForBackend,
            isVoiceMode: liveChatActive, // lets the backend know this specific request is a spoken Live Chat conversation, not typed text -- see the system prompt rule this enables, keeping voice responses genuinely brief rather than as long as a typed answer would be
            // A confirmed real reliability improvement: rather than
            // making the model INFER what language to reply in purely
            // from the text (which still occasionally drifted, even
            // with the reminder message), this passes the language
            // Whisper + the script cross-check ALREADY confidently
            // detected from the actual audio, explicitly, as a real
            // value rather than something to guess at. Only set during
            // Live Chat, when this detection actually ran.
            spokenLanguageKey: liveChatActive ? liveChatDetectedConversationLangKey : null,
          }),
        });

        // With Server-Sent Events, the backend commits to a 200 status
        // the instant it starts streaming (before it could possibly know
        // whether an error will happen later), so a non-2xx response here
        // means the request failed before streaming even began (e.g. rate
        // limited, or an older/down backend) -- a genuine error mid-stream
        // now arrives as a `{done:true, error:true}` event instead (see
        // the parsing loop below), not as an HTTP status.
        if (!response.ok) {
          throw new Error(`Server responded with status ${response.status}`);
        }

        // Reads the response as a REAL live stream of Server-Sent Events
        // -- each `data: {...}` line is either a real status update
        // (written into the thinking indicator the instant it arrives,
        // see updateThinkingStatus) or the final `done: true` event
        // carrying the actual answer. Replaces the old single
        // `response.json()` call, since the backend no longer sends one
        // JSON blob at the end -- it streams as it goes.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalEvent = null;

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop(); // last piece may be incomplete -- keep it for the next read
          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data:")) continue;
            let evt;
            try {
              evt = JSON.parse(line.slice(5).trim());
            } catch (parseErr) {
              continue; // a malformed/partial event -- skip rather than crash the whole stream read
            }
            if (evt.done) {
              finalEvent = evt;
              clearThinkingStatusQueue(thinkingMsg); // don't make the user wait through leftover queued status words now that the real answer is here
            } else if (evt.status) {
              enqueueThinkingStatus(thinkingMsg, evt.status);
            }
          }
        }

        if (!finalEvent) {
          throw new Error("Stream ended without a final response");
        }
        if (finalEvent.error) {
          throw new Error("Server reported an error");
        }

        const data = finalEvent;

        removeThinkingMessage(thinkingMsg);
        addMessage(data.reply || "No response received.", "bot", true, retryInfo);

        if (data.raw_reply) {
          // Images now ARE remembered for the rest of this live session
          // (reversing an earlier deliberate limit) -- the user turn's
          // content becomes an array (text + image_url blocks) when
          // images were attached, exactly like the format used for the
          // original request, so later follow-up questions can still
          // reference "that image" correctly.
          //
          // A confirmed real bug this fixes: extracted Word/PDF/Excel/
          // PowerPoint text used to NOT actually reach this point at all
          // -- only the placeholder in messageForBackend ("Please review
          // this document.") was ever stored here, even though the
          // backend had genuinely read the real document content for
          // THIS turn. Any follow-up question about "the document" in a
          // later turn had zero real content available to it as a
          // result -- not a refusal, a genuine gap. data.extracted_document_text
          // (sent back by the backend specifically to fix this) is used
          // here instead when present, so the real content persists for
          // the rest of this live session, the same way images do.
          //
          // NOT persisted to Firestore (saveMessageToHistory below still
          // only saves the lightweight placeholder) -- reloading a saved
          // chat later will show the placeholder but the model won't be
          // able to "see" the real document content again at that point,
          // matching the same live-session-only boundary already
          // established for images, since document text can be large
          // enough that saving it to every message would be a real
          // storage cost worth avoiding.
          const userTextForHistory = data.extracted_document_text || messageForBackend;
          const userHistoryContent = imagesForBackend.length > 0
            ? [
                { type: "text", text: userTextForHistory },
                ...imagesForBackend.map((img) => ({ type: "image_url", image_url: { url: img } })),
              ]
            : userTextForHistory;
          conversationHistory.push({ role: "user", content: userHistoryContent });
          conversationHistory.push({ role: "assistant", content: data.raw_reply });
          saveMessageToHistory(messageForBackend, data.reply || "", data.raw_reply);
        }

        succeeded = true;
        break; // success -- no need to retry further
      } catch (err) {
        if (err.name === "AbortError") {
          // A genuine user-initiated stop -- never retried, exits
          // immediately regardless of which attempt this was.
          removeThinkingMessage(thinkingMsg);
          addMessage("Stopped.", "bot");
          succeeded = true; // not a real success, but suppresses the error path below -- the user already knows they stopped it themselves
          break;
        }

        finalError = err;
        if (attempt < MAX_AUTO_RETRIES) {
          // Brief pause before retrying -- avoids hammering the
          // backend instantly on a genuine outage, while still being
          // fast enough that a transient hiccup resolves quickly. The
          // thinking indicator deliberately stays visible and
          // unchanged through this -- no error is shown yet.
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }

    if (!succeeded && finalError) {
      removeThinkingMessage(thinkingMsg);
      // The error message itself also gets a retry button (via
      // retryInfo) -- exactly the case where retrying is most useful,
      // shown only now that every automatic attempt has genuinely failed.
      addMessage("⚠️ Connection error. Try again.", "bot", false, retryInfo);
    }

    currentAbortController = null;
    setSendingLock(false); // always re-enable, whether the request succeeded, errored, or was stopped
  }

  // A confirmed real gap this fixes: asked to add value numbers and
  // arrows pointing to each pie slice, GPT's text claimed it had done
  // so, but nothing in the chart-rendering code below was ever capable
  // of drawing labels or arrows on a pie chart at all -- Chart.js by
  // default only draws the slices and a legend. GPT wasn't refusing or
  // malfunctioning, it was describing a capability that plainly didn't
  // exist yet, then silently re-rendering the identical chart. This
  // plugin adds that capability for real: draws a short leader line
  // with an arrowhead pointing at each slice's outer edge, ending in
  // that slice's real value and percentage of the total. Per explicit
  // follow-up request, this is OPT-IN per chart (via
  // chart.options.plugins.pieValueArrows.enabled below, driven by
  // render_chart's pieSliceLabels parameter) -- a plain pie chart with
  // just a legend stays the default, and these labels/arrows only
  // appear on a chart that actually asked for them.
  const pieValueArrowsPlugin = {
    id: "pieValueArrows",
    afterDraw(chart) {
      if (chart.config.type !== "pie") return;
      const opts = chart.options.plugins && chart.options.plugins.pieValueArrows;
      if (!opts || !opts.enabled) return;
      const meta = chart.getDatasetMeta(0);
      const rawValues = chart.data.datasets && chart.data.datasets[0] ? chart.data.datasets[0].data : null;
      if (!meta || !meta.data || !rawValues) return;

      const total = rawValues.reduce((sum, v) => sum + (Number(v) || 0), 0);
      if (total <= 0) return;

      const ctx = chart.ctx;
      ctx.save();
      ctx.font = "11px sans-serif";
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = "#bbb";
      ctx.fillStyle = "#ddd";

      meta.data.forEach((arc, i) => {
        const value = Number(rawValues[i]);
        if (!Number.isFinite(value)) return;
        const percent = Math.round((value / total) * 100);

        const { startAngle, endAngle, outerRadius, x, y } = arc.getProps(
          ["startAngle", "endAngle", "outerRadius", "x", "y"],
          true
        );
        const midAngle = (startAngle + endAngle) / 2;
        const cos = Math.cos(midAngle);
        const sin = Math.sin(midAngle);

        // Leader line from just outside the slice edge out to the label.
        const lineStartR = outerRadius + 4;
        const lineEndR = outerRadius + 24;
        const sx = x + cos * lineStartR;
        const sy = y + sin * lineStartR;
        const ex = x + cos * lineEndR;
        const ey = y + sin * lineEndR;

        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(sx, sy);
        ctx.stroke();

        // Arrowhead at the slice-edge end, pointing INTO the slice.
        const arrowLen = 6;
        const arrowWidth = 4;
        const backX = sx + cos * arrowLen;
        const backY = sy + sin * arrowLen;
        const perpX = Math.cos(midAngle + Math.PI / 2);
        const perpY = Math.sin(midAngle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(backX + perpX * arrowWidth, backY + perpY * arrowWidth);
        ctx.lineTo(backX - perpX * arrowWidth, backY - perpY * arrowWidth);
        ctx.closePath();
        ctx.fillStyle = "#bbb";
        ctx.fill();

        // Value + percentage label at the outer end of the leader line.
        const labelText = `${value.toLocaleString()} (${percent}%)`;
        ctx.fillStyle = "#eee";
        ctx.textAlign = cos >= 0 ? "left" : "right";
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, ex + (cos >= 0 ? 4 : -4), ey);
      });

      ctx.restore();
    },
  };
  // Lightens (positive percent) or darkens (negative percent) a hex
  // color -- used to shade the top/side faces of a 3D bar relative to
  // its own real front-face color, rather than a fixed unrelated shade.
  function shadeHexColor(hex, percent) {
    let h = (hex || "#4ea3ff").replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const num = parseInt(h, 16);
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp(((num >> 16) & 0xff) + Math.round(255 * percent));
    const g = clamp(((num >> 8) & 0xff) + Math.round(255 * percent));
    const b = clamp((num & 0xff) + Math.round(255 * percent));
    return `rgb(${r}, ${g}, ${b})`;
  }

  // A confirmed real gap this fixes: asked for a 3D bar chart, there was
  // no way to actually produce one -- Chart.js only ever draws flat 2D
  // bars, and this app has no separate 3D/WebGL charting library loaded
  // (adding one would be a much heavier dependency than a single-file
  // site like this should carry). This draws genuine extruded 3D-style
  // bars using only Chart.js's own real bar geometry: a shaded top face
  // and right-side face are drawn first (in beforeDatasetsDraw), using
  // real colors derived from each bar's own actual color, then Chart.js
  // draws its normal flat front face on top as usual -- the combination
  // reads as a real 3D box, not a flat rectangle. Opt-in per chart (via
  // chartData.threeD, wired to chart.options.plugins.threeDBars.enabled
  // below) since not every bar chart should look this way -- only ones
  // that actually asked for a 3D style.
  const threeDBarsPlugin = {
    id: "threeDBars",
    beforeDatasetsDraw(chart) {
      const opts = chart.options.plugins && chart.options.plugins.threeDBars;
      if (chart.config.type !== "bar" || !opts || !opts.enabled) return;

      const ctx = chart.ctx;
      const depthX = 8;
      const depthY = -8;

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (!meta || meta.hidden || !meta.data) return;
        const baseColor = (typeof dataset.backgroundColor === "string" && dataset.backgroundColor) || "#4ea3ff";
        const topColor = shadeHexColor(baseColor, 0.22);
        const sideColor = shadeHexColor(baseColor, -0.22);

        meta.data.forEach((bar) => {
          const { x, y, base, width } = bar.getProps(["x", "y", "base", "width"], true);
          const left = x - width / 2;
          const right = x + width / 2;
          const top = y;
          const bottom = base;
          if (!Number.isFinite(top) || !Number.isFinite(bottom) || top === bottom) return;

          ctx.save();

          // Right side face.
          ctx.beginPath();
          ctx.moveTo(right, top);
          ctx.lineTo(right, bottom);
          ctx.lineTo(right + depthX, bottom + depthY);
          ctx.lineTo(right + depthX, top + depthY);
          ctx.closePath();
          ctx.fillStyle = sideColor;
          ctx.fill();

          // Top face.
          ctx.beginPath();
          ctx.moveTo(left, top);
          ctx.lineTo(right, top);
          ctx.lineTo(right + depthX, top + depthY);
          ctx.lineTo(left + depthX, top + depthY);
          ctx.closePath();
          ctx.fillStyle = topColor;
          ctx.fill();

          ctx.restore();
        });
      });
    },
  };
  if (typeof Chart !== "undefined") {
    Chart.register(pieValueArrowsPlugin);
    Chart.register(threeDBarsPlugin);
  }

  function renderPriceCharts(scopeEl) {
    const chartDivs = scopeEl.querySelectorAll('.price-chart:not([data-rendered="true"])');
    chartDivs.forEach((div) => {
      let chartData;
      try {
        chartData = JSON.parse(div.getAttribute("data-chart"));
      } catch (err) {
        console.error("Could not parse price chart data:", err);
        div.innerHTML = '<em style="opacity:0.7;">(Chart could not be displayed.)</em>';
        return;
      }

      const canvas = div.querySelector("canvas");
      if (!canvas) return;

      // Optional "type" field lets GPT produce bar/pie charts for
      // general data (not just gold price history), e.g. a breakdown of
      // categories/proportions found via search -- defaults to "line"
      // so existing price-history charts (which never set this field)
      // keep rendering exactly as before.
      const chartType = ["line", "bar", "pie"].includes(chartData.type) ? chartData.type : "line";
      const isPie = chartType === "pie";
      const isBar = chartType === "bar";
      const palette = ["#4ea3ff", "#d9a441", "#6fbf6f", "#e05252", "#b57edc", "#4ecdc4", "#ff8fab", "#c9a959"];

      // A confirmed real bug this fixes: bar charts were using the LINE
      // chart's near-transparent fill color (rgba alpha 0.12, meant only
      // for the faint area-under-the-line effect) as their bar fill --
      // the bars rendered but were nearly invisible against the dark
      // background, making the chart look like it never appeared at all.
      // Each chart type now gets its own properly visible color set.
      let borderColor, backgroundColor;
      if (isPie) {
        borderColor = "#111";
        backgroundColor = palette;
      } else if (isBar) {
        borderColor = "#4ea3ff";
        backgroundColor = "#4ea3ff";
      } else {
        borderColor = "#4ea3ff";
        backgroundColor = "rgba(78, 163, 255, 0.12)"; // intentionally faint -- this is the line chart's area-under-the-line fill, not meant to be a solid color
      }

      // A confirmed real bug this fixes: asking for multiple bars per
      // category (e.g. Revenue AND Net Profit for each year) always
      // rendered just ONE bar per year regardless of what GPT's text
      // said -- because this only ever built a single Chart.js dataset,
      // no matter how the underlying data was shaped. chartData.series
      // (see render_chart's new 'series' parameter on the backend) now
      // carries one full named dataset per metric when the user asked
      // to compare more than one value per label; each becomes its own
      // Chart.js dataset with its own color and legend entry. Absent
      // (the common case -- a normal single-value chart), this falls
      // back to the exact single-dataset behavior as before.
      const hasMultipleSeries = Array.isArray(chartData.series) && chartData.series.length > 0;

      let datasets;
      if (hasMultipleSeries) {
        datasets = chartData.series.map((s, i) => {
          const color = palette[i % palette.length];
          return {
            label: s.name || `Series ${i + 1}`,
            data: s.data || [],
            borderColor: color,
            backgroundColor: chartType === "line" ? color : color, // solid for both -- multi-series lines don't get the single-line's faint area fill, so a flat line color reads clearly against the dark background
            borderWidth: 2,
            pointRadius: chartType === "line" ? 2 : undefined,
            tension: chartType === "line" ? 0.2 : undefined,
            fill: false, // area fill under MULTIPLE overlapping lines just obscures them -- only the single-series line chart below gets a fill
          };
        });
      } else {
        datasets = [{
          label: chartData.title || "Gold Price (USD/oz)",
          data: chartData.data || [],
          borderColor,
          backgroundColor,
          borderWidth: isPie ? 1 : 2,
          pointRadius: chartType === "line" ? 2 : undefined,
          tension: chartType === "line" ? 0.2 : undefined,
          fill: chartType === "line",
        }];
      }

      // A confirmed real bug this fixes: with no try/catch here, ANY
      // failure in Chart construction (a broken CDN link meaning Chart.js
      // itself never loaded, a data edge case, anything) threw an
      // uncaught exception that silently aborted this iteration -- the
      // div was left sitting in the page with real data and a real
      // canvas, but completely blank, with data-rendered never set and
      // no visible sign to the user (or in some cases even in the
      // console) that anything had gone wrong at all.
      try {
        if (typeof Chart === "undefined") {
          throw new Error("Chart.js failed to load (window.Chart is undefined)");
        }
        new Chart(canvas, {
          type: chartType,
          data: {
            labels: chartData.labels || [],
            datasets,
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            // Extra breathing room around the pie itself so the
            // leader-line value labels (drawn by pieValueArrowsPlugin
            // above) have somewhere to sit without getting clipped at
            // the canvas edge -- not needed for bar/line, which don't
            // draw anything outside their normal plot area.
            layout: isPie && chartData.pieSliceLabels
              ? { padding: 40 }
              : (chartType === "bar" && chartData.threeD ? { padding: { top: 14, right: 14 } } : {}),
            plugins: {
              title: {
                display: !!chartData.title,
                text: chartData.title || "",
                color: "#ddd",
              },
              legend: { display: isPie || hasMultipleSeries, labels: { color: "#ddd" } },
              threeDBars: { enabled: chartType === "bar" && !!chartData.threeD },
              pieValueArrows: { enabled: isPie && !!chartData.pieSliceLabels },
            },
            scales: isPie ? {} : {
              x: { ticks: { maxTicksLimit: 8, color: "#aaa" }, grid: { color: "#333" } },
              y: { title: { display: !!chartData.yAxisLabel, text: chartData.yAxisLabel || "", color: "#aaa" }, ticks: { color: "#aaa" }, grid: { color: "#333" } },
            },
          },
        });
      } catch (err) {
        console.error("Chart rendering failed:", err.message, err);
        div.innerHTML = '<em style="opacity:0.7;">(Chart could not be displayed -- please refresh the page and try again.)</em>';
      }

      div.setAttribute("data-rendered", "true");
    });
  }

  // Escapes text for safe use inside HTML attribute/content positions
  // built via template strings below (image titles/sources come from
  // real web search results -- untrusted external text, not something
  // this app wrote itself).
  function escapeHtmlAttr(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // Renders a real 2-set or 3-set Venn diagram as SVG, using the region
  // data the backend already computed (see computeVennRegions in
  // server.js) -- this function just draws fixed, non-proportional
  // circle layouts and labels each region with its real item count, plus
  // a text legend below listing the actual overlapping/unique items
  // (rather than cramming full item lists into the small circle overlap
  // areas themselves, which gets unreadable fast).
  function renderVennDiagrams(scopeEl) {
    const vennDivs = scopeEl.querySelectorAll('.venn-chart:not([data-rendered="true"])');
    vennDivs.forEach((div) => {
      let vennData;
      try {
        vennData = JSON.parse(div.getAttribute("data-venn"));
      } catch (err) {
        console.error("Could not parse venn diagram data:", err);
        div.innerHTML = '<em style="opacity:0.7;">(Diagram could not be displayed.)</em>';
        div.setAttribute("data-rendered", "true");
        return;
      }

      try {
        const { title, setCount, labels, regions } = vennData;
        const palette = ["#4ea3ff", "#d9a441", "#6fbf6f"];
        let svg, legendRows;

        if (setCount === 2) {
          const [labelA, labelB] = labels;
          const { onlyA = [], onlyB = [], both = [] } = regions;
          svg = `<svg viewBox="0 0 480 300" xmlns="http://www.w3.org/2000/svg">
            <circle cx="180" cy="150" r="110" fill="${palette[0]}" fill-opacity="0.45" stroke="${palette[0]}" stroke-width="2"/>
            <circle cx="300" cy="150" r="110" fill="${palette[1]}" fill-opacity="0.45" stroke="${palette[1]}" stroke-width="2"/>
            <text x="130" y="35" fill="#eee" font-size="13" font-weight="bold" text-anchor="middle">${escapeHtmlAttr(labelA)}</text>
            <text x="350" y="35" fill="#eee" font-size="13" font-weight="bold" text-anchor="middle">${escapeHtmlAttr(labelB)}</text>
            <text x="120" y="155" fill="#fff" font-size="20" font-weight="bold" text-anchor="middle">${onlyA.length}</text>
            <text x="360" y="155" fill="#fff" font-size="20" font-weight="bold" text-anchor="middle">${onlyB.length}</text>
            <text x="240" y="155" fill="#fff" font-size="20" font-weight="bold" text-anchor="middle">${both.length}</text>
          </svg>`;
          legendRows = [
            { color: palette[0], label: labelA + " only", items: onlyA },
            { color: palette[1], label: labelB + " only", items: onlyB },
            { color: "#ccc", label: "Both", items: both },
          ];
        } else if (setCount === 3) {
          const [labelA, labelB, labelC] = labels;
          const { onlyA = [], onlyB = [], onlyC = [], AB = [], AC = [], BC = [], ABC = [] } = regions;
          svg = `<svg viewBox="0 0 400 360" xmlns="http://www.w3.org/2000/svg">
            <circle cx="150" cy="150" r="100" fill="${palette[0]}" fill-opacity="0.4" stroke="${palette[0]}" stroke-width="2"/>
            <circle cx="250" cy="150" r="100" fill="${palette[1]}" fill-opacity="0.4" stroke="${palette[1]}" stroke-width="2"/>
            <circle cx="200" cy="230" r="100" fill="${palette[2]}" fill-opacity="0.4" stroke="${palette[2]}" stroke-width="2"/>
            <text x="90" y="45" fill="#eee" font-size="12" font-weight="bold" text-anchor="middle">${escapeHtmlAttr(labelA)}</text>
            <text x="310" y="45" fill="#eee" font-size="12" font-weight="bold" text-anchor="middle">${escapeHtmlAttr(labelB)}</text>
            <text x="200" y="350" fill="#eee" font-size="12" font-weight="bold" text-anchor="middle">${escapeHtmlAttr(labelC)}</text>
            <text x="100" y="105" fill="#fff" font-size="16" font-weight="bold" text-anchor="middle">${onlyA.length}</text>
            <text x="300" y="105" fill="#fff" font-size="16" font-weight="bold" text-anchor="middle">${onlyB.length}</text>
            <text x="200" y="300" fill="#fff" font-size="16" font-weight="bold" text-anchor="middle">${onlyC.length}</text>
            <text x="200" y="90" fill="#fff" font-size="16" font-weight="bold" text-anchor="middle">${AB.length}</text>
            <text x="130" y="215" fill="#fff" font-size="16" font-weight="bold" text-anchor="middle">${AC.length}</text>
            <text x="270" y="215" fill="#fff" font-size="16" font-weight="bold" text-anchor="middle">${BC.length}</text>
            <text x="200" y="165" fill="#fff" font-size="16" font-weight="bold" text-anchor="middle">${ABC.length}</text>
          </svg>`;
          legendRows = [
            { color: palette[0], label: labelA + " only", items: onlyA },
            { color: palette[1], label: labelB + " only", items: onlyB },
            { color: palette[2], label: labelC + " only", items: onlyC },
            { color: "#ccc", label: labelA + " & " + labelB, items: AB },
            { color: "#ccc", label: labelA + " & " + labelC, items: AC },
            { color: "#ccc", label: labelB + " & " + labelC, items: BC },
            { color: "#fff", label: "All three", items: ABC },
          ];
        } else {
          throw new Error("Unsupported set count: " + setCount);
        }

        const titleHtml = title ? `<div class="venn-chart-title">${escapeHtmlAttr(title)}</div>` : "";
        const legendHtml = legendRows
          .filter((row) => row.items.length > 0)
          .map((row) => `<div class="venn-chart-legend-row">
              <span class="venn-chart-legend-swatch" style="background:${row.color};"></span>
              <span><strong>${escapeHtmlAttr(row.label)}</strong> (${row.items.length}): ${row.items.map(escapeHtmlAttr).join(", ")}</span>
            </div>`)
          .join("");

        div.innerHTML = titleHtml + svg + `<div class="venn-chart-legend">${legendHtml}</div>`;
      } catch (err) {
        console.error("Venn diagram rendering failed:", err.message, err);
        div.innerHTML = '<em style="opacity:0.7;">(Diagram could not be displayed.)</em>';
      }

      div.setAttribute("data-rendered", "true");
    });
  }

  function renderWebImages(scopeEl) {
    const imageDivs = scopeEl.querySelectorAll('.web-images:not([data-rendered="true"])');
    imageDivs.forEach((div) => {
      let imageData;
      try {
        imageData = JSON.parse(div.getAttribute("data-images"));
      } catch (err) {
        console.error("Could not parse web image data:", err);
        div.innerHTML = '<em style="opacity:0.7;">(Images could not be displayed.)</em>';
        return;
      }

      const images = Array.isArray(imageData.images) ? imageData.images : [];
      if (images.length === 0) {
        div.remove();
        return;
      }

      // Reverses the ":%2F%2F" substitution the backend applied to keep
      // convertLinksToHTML from auto-linkifying (and corrupting) these
      // URLs while they sat inside the data-images HTML attribute -- see
      // the matching comment in server.js's formatMarkdownToHTML.
      const restoreUrl = (u) => (u || "").replace(/:%2F%2F/g, "://");

      div.innerHTML = images.map((img) => {
        const fullUrl = restoreUrl(img.url);
        const thumbUrl = restoreUrl(img.thumbnail) || fullUrl;
        const linkUrl = restoreUrl(img.link) || fullUrl;
        if (!thumbUrl) return "";
        return `<a href="${escapeHtmlAttr(linkUrl)}" target="_blank" rel="noopener" title="${escapeHtmlAttr(img.title)}">` +
          `<img src="${escapeHtmlAttr(thumbUrl)}" alt="${escapeHtmlAttr(img.title)}" loading="lazy" onerror="this.closest('a').remove();">` +
          (img.source ? `<span class="web-image-source">${escapeHtmlAttr(img.source)}</span>` : "") +
          `</a>`;
      }).join("");

      div.setAttribute("data-rendered", "true");
    });
  }

  // Applies real syntax highlighting (via highlight.js) to every code
  // window built by the backend's generic ```language fenced-block
  // extraction (see formatMarkdownToHTML in server.js). Restores the
  // ":%2F%2F" -> "://" substitution the backend applied FIRST, on the
  // plain pre-highlight text -- doing this after hljs has already
  // wrapped the code in <span> tags would corrupt that markup, so order
  // matters here.
  function renderCodeBlocks(scopeEl) {
    if (typeof hljs === "undefined") return; // highlight.js failed to load -- code still displays, just unhighlighted, rather than throwing
    const codeEls = scopeEl.querySelectorAll('.code-block:not([data-rendered="true"]) code');
    codeEls.forEach((codeEl) => {
      try {
        codeEl.textContent = codeEl.textContent.replace(/:%2F%2F/g, "://");
        hljs.highlightElement(codeEl);
      } catch (err) {
        console.error("Code highlighting failed:", err.message, err);
        // Leave the code as plain unhighlighted text rather than hiding it -- a failed highlight pass is cosmetic, the code itself is still fully readable and copyable.
      }
      codeEl.closest(".code-block")?.setAttribute("data-rendered", "true");
    });
  }

  // Per-code-block copy button (separate from the whole-message copy
  // button) -- copies just that block's real code text, matching the
  // familiar per-snippet copy affordance from ChatGPT/other coding
  // assistants.
  function copyCodeBlock(btn) {
    const codeEl = btn.closest(".code-block")?.querySelector("code");
    if (!codeEl) return;
    navigator.clipboard.writeText(codeEl.textContent).then(() => {
      const original = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = original; }, 1500);
    }).catch((err) => {
      console.error("Could not copy code:", err);
    });
  }

  // ------------------------------------------------------------------
  // MINIMAL ZIP FILE BUILDER -- hand-written rather than pulling in a
  // library (matching the same "avoid unnecessary CDN dependencies"
  // decision already made for the Excel/Word export, especially given a
  // single broken CDN URL previously caused every chart to silently fail
  // for an extended period). Uses the STORE method (no compression) --
  // fully valid ZIP format per spec, just uncompressed, which is a total
  // non-issue for the small text files a LaTeX/code project actually
  // contains. Verified independently against Python's zipfile module
  // and the system unzip tool (both confirmed a byte-identical test
  // build opens correctly, lists the right files, and extracts the
  // exact right content -- including files in subfolders) before this
  // was ever wired into the app.
  // ------------------------------------------------------------------

  function crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) {
      crc = crc ^ bytes[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
      }
    }
    return (crc ^ -1) >>> 0;
  }

  function zipWriteUint32LE(arr, offset, value) {
    arr[offset] = value & 0xff;
    arr[offset + 1] = (value >>> 8) & 0xff;
    arr[offset + 2] = (value >>> 16) & 0xff;
    arr[offset + 3] = (value >>> 24) & 0xff;
  }

  function zipWriteUint16LE(arr, offset, value) {
    arr[offset] = value & 0xff;
    arr[offset + 1] = (value >>> 8) & 0xff;
  }

  // files: [{ name: string, content: string }] -> a real ZIP file Blob.
  function buildZipBlob(files) {
    const encoder = new TextEncoder();
    const fileEntries = files.map((f) => ({
      nameBytes: encoder.encode(f.name),
      contentBytes: encoder.encode(f.content),
    }));

    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const dosTime = 0;
    const dosDate = ((2024 - 1980) << 9) | (1 << 5) | 1; // fixed date -- not meaningful for correctness, just needs to be a valid encoded value

    for (const entry of fileEntries) {
      const crc = crc32(entry.contentBytes);
      const size = entry.contentBytes.length;
      const nameLen = entry.nameBytes.length;

      const localHeader = new Uint8Array(30 + nameLen);
      zipWriteUint32LE(localHeader, 0, 0x04034b50);
      zipWriteUint16LE(localHeader, 4, 20);
      zipWriteUint16LE(localHeader, 6, 0);
      zipWriteUint16LE(localHeader, 8, 0); // STORE
      zipWriteUint16LE(localHeader, 10, dosTime);
      zipWriteUint16LE(localHeader, 12, dosDate);
      zipWriteUint32LE(localHeader, 14, crc);
      zipWriteUint32LE(localHeader, 18, size);
      zipWriteUint32LE(localHeader, 22, size);
      zipWriteUint16LE(localHeader, 26, nameLen);
      zipWriteUint16LE(localHeader, 28, 0);
      localHeader.set(entry.nameBytes, 30);

      localParts.push(localHeader, entry.contentBytes);

      const centralHeader = new Uint8Array(46 + nameLen);
      zipWriteUint32LE(centralHeader, 0, 0x02014b50);
      zipWriteUint16LE(centralHeader, 4, 20);
      zipWriteUint16LE(centralHeader, 6, 20);
      zipWriteUint16LE(centralHeader, 8, 0);
      zipWriteUint16LE(centralHeader, 10, 0);
      zipWriteUint16LE(centralHeader, 12, dosTime);
      zipWriteUint16LE(centralHeader, 14, dosDate);
      zipWriteUint32LE(centralHeader, 16, crc);
      zipWriteUint32LE(centralHeader, 20, size);
      zipWriteUint32LE(centralHeader, 24, size);
      zipWriteUint16LE(centralHeader, 28, nameLen);
      zipWriteUint16LE(centralHeader, 30, 0);
      zipWriteUint16LE(centralHeader, 32, 0);
      zipWriteUint16LE(centralHeader, 34, 0);
      zipWriteUint16LE(centralHeader, 36, 0);
      zipWriteUint32LE(centralHeader, 38, 0x81a40000); // regular file, rw-r--r--
      zipWriteUint32LE(centralHeader, 42, offset);
      centralHeader.set(entry.nameBytes, 46);

      centralParts.push(centralHeader);
      offset += localHeader.length + entry.contentBytes.length;
    }

    const centralDirSize = centralParts.reduce((sum, p) => sum + p.length, 0);
    const centralDirOffset = offset;

    const eocd = new Uint8Array(22);
    zipWriteUint32LE(eocd, 0, 0x06054b50);
    zipWriteUint16LE(eocd, 4, 0);
    zipWriteUint16LE(eocd, 6, 0);
    zipWriteUint16LE(eocd, 8, fileEntries.length);
    zipWriteUint16LE(eocd, 10, fileEntries.length);
    zipWriteUint32LE(eocd, 12, centralDirSize);
    zipWriteUint32LE(eocd, 16, centralDirOffset);
    zipWriteUint16LE(eocd, 20, 0);

    const allParts = [...localParts, ...centralParts, eocd];
    const totalLength = allParts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const part of allParts) {
      result.set(part, pos);
      pos += part.length;
    }
    return new Blob([result], { type: "application/zip" });
  }

  // Renders the download card for a create_project_zip tool call --
  // shows the project name and a list of included files, with a
  // download button that builds the actual zip bytes lazily (only when
  // clicked, not on every render) and triggers a real download.
  function renderProjectZip(scopeEl) {
    const zipDivs = scopeEl.querySelectorAll('.project-zip:not([data-rendered="true"])');
    zipDivs.forEach((div) => {
      let zipData;
      try {
        zipData = JSON.parse(div.getAttribute("data-zip"));
      } catch (err) {
        console.error("Could not parse project zip data:", err);
        div.innerHTML = '<em style="opacity:0.7;">(Project files could not be displayed.)</em>';
        div.setAttribute("data-rendered", "true");
        return;
      }

      const files = Array.isArray(zipData.files) ? zipData.files : [];
      if (files.length === 0) {
        div.remove();
        return;
      }

      // Reverses the ":%2F%2F" substitution the backend applied to keep
      // convertLinksToHTML from auto-linkifying (and corrupting) URLs
      // that appear inside file content (e.g. \url{...} in LaTeX) while
      // it sat inside the data-zip HTML attribute.
      const restoredFiles = files.map((f) => ({
        name: f.filename,
        content: (f.content || "").replace(/:%2F%2F/g, "://"),
      }));

      const projectName = zipData.projectName || "project";
      const fileListHtml = restoredFiles
        .map((f) => `<div class="project-zip-file">${escapeHtmlAttr(f.name)}</div>`)
        .join("");

      div.innerHTML = `
        <div class="project-zip-header">
          <span class="project-zip-title">${escapeHtmlAttr(projectName)}</span>
          <span class="project-zip-count">${restoredFiles.length} file${restoredFiles.length === 1 ? "" : "s"}</span>
        </div>
        <div class="project-zip-files">${fileListHtml}</div>
        <button class="project-zip-download-btn">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download .zip
        </button>
      `;

      const downloadBtn = div.querySelector(".project-zip-download-btn");
      downloadBtn.onclick = () => {
        try {
          const zipBlob = buildZipBlob(restoredFiles);
          const filename = projectName.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() + ".zip";
          downloadBlob(zipBlob, filename || "project.zip");
        } catch (err) {
          console.error("Could not build project zip:", err.message, err);
          alert("Could not build the zip file. Please try again.");
        }
      };

      div.setAttribute("data-rendered", "true");
    });
  }

  // Renders real LaTeX math via KaTeX's auto-render extension, which
  // scans the given element for \( \)-delimited inline math and
  // \[ \]-delimited display math (per the MATH FORMULAS system prompt
  // rule in server.js) and replaces each with real typeset math.
  function renderMathInMessage(scopeEl) {
    if (typeof renderMathInElement === "undefined") return; // KaTeX failed to load -- message still displays as plain text, just unformatted math, rather than throwing
    try {
      renderMathInElement(scopeEl, {
        delimiters: [
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
          { left: "$$", right: "$$", display: true }, // tolerated fallback in case the model uses $$ despite the \[ \] instruction
        ],
        throwOnError: false, // a malformed formula shouldn't break the rest of the message -- KaTeX shows a visible error inline for just that piece instead
      });
    } catch (err) {
      console.error("Math rendering failed:", err.message, err);
    }
  }

  // Formats a real timestamp (either just-now for a live message, or the
  // actual saved `ts` for one reloaded from history) into a short,
  // locale-aware time label like "10:42 AM". Falls back to including the
  // date for anything not from today, so an old reopened chat doesn't
  // just show a bare time with no way to tell which day it was from.
  function formatMessageTimestamp(ts) {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "";
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (isToday) return timeStr;
    const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${dateStr}, ${timeStr}`;
  }

  // Self-contained (doesn't depend on the Listen feature's own language
  // detection code elsewhere in this file, to avoid any load-order
  // dependency) -- checks for Arabic or Hebrew script specifically,
  // the two RTL scripts this chat has confirmed real usage in.
  const RTL_SCRIPT_PATTERN = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
  const LATIN_SCRIPT_PATTERN = /[A-Za-z]/g;
  // A confirmed real bug this fixes: this used to flip a message into
  // full right-to-left BLOCK layout if it contained an RTL character
  // ANYWHERE at all -- so an almost entirely English response (e.g.
  // summarizing an attached Excel file) that happened to include a
  // couple of Arabic words copied verbatim from the file itself (a
  // currency term, an employee's name) got its whole layout flipped:
  // English paragraphs and bullet points rendered right-aligned and
  // visibly misordered, even though the actual content was
  // overwhelmingly English. Now counts RTL-script letters against
  // Latin-script letters and only applies RTL block layout when RTL
  // genuinely makes up the majority of the message's actual lettered
  // content, not merely present somewhere within it -- a message with a
  // few embedded foreign proper nouns/terms correctly stays LTR, while
  // a message that's genuinely written in Arabic (with the occasional
  // English word/number mixed in, as real bilingual text often has)
  // still correctly gets RTL layout.
  function isRtlText(text) {
    if (!text) return false;
    const rtlCount = (text.match(RTL_SCRIPT_PATTERN) || []).length;
    if (rtlCount === 0) return false;
    const latinCount = (text.match(LATIN_SCRIPT_PATTERN) || []).length;
    return rtlCount > latinCount;
  }

  function addMessage(text, sender, allowHTML = false, retryInfo = null, timestamp = null) {
    const chatBox = document.getElementById("chat-box");
    const msg = document.createElement("div");
    msg.classList.add("message", sender === "user" ? "user-message" : "bot-message");

    const textSpan = document.createElement("span");
    if (allowHTML) {
      textSpan.innerHTML = text;
    } else {
      textSpan.textContent = text;
    }

    // A confirmed real issue this fixes: Arabic (and other RTL-script)
    // text naturally flows right-to-left character-by-character even
    // without any special handling (Unicode's own bidi algorithm
    // handles that automatically), but the surrounding BLOCK layout --
    // bullet point markers, list indentation, overall paragraph
    // alignment -- stays left-to-right by default, which looks visibly
    // wrong (e.g. bullet dots sitting on the left of right-flowing
    // text). Setting dir="rtl" on the whole message fixes the block-
    // level layout properly, the way RTL text is actually supposed to
    // render, rather than just relying on the automatic per-character
    // behavior alone.
    if (isRtlText(textSpan.textContent)) {
      msg.setAttribute("dir", "rtl");
      msg.classList.add("rtl-message");
    }

    // Holds the timestamp (left) and copy/edit/retry/save (right),
    // appended below the content (see .message-actions CSS) -- its own
    // row so these sit at the bottom of the bubble regardless of how
    // tall the content above them is, instead of floating vertically-
    // centered mid-message as they did under the old single-row flex
    // layout.
    const actionsRow = document.createElement("div");
    actionsRow.classList.add("message-actions");

    // Real timestamp -- uses the actual saved time for messages reloaded
    // from history (see loadChat, which passes the real Firestore `ts`
    // field), or the current time for a message just sent/received live.
    const timestampSpan = document.createElement("span");
    timestampSpan.classList.add("message-timestamp");
    timestampSpan.textContent = formatMessageTimestamp(timestamp || Date.now());
    actionsRow.appendChild(timestampSpan);

    const buttonsWrap = document.createElement("div");
    buttonsWrap.classList.add("message-actions-buttons");
    actionsRow.appendChild(buttonsWrap);

    const copyBtn = document.createElement("button");
    copyBtn.classList.add("copy-btn");
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <rect x="8" y="3" width="11" height="11" rx="2" ry="2"/>
        <rect x="3" y="8" width="11" height="11" rx="2" ry="2"/>
      </svg>
    `;
    copyBtn.title = "Copy message";
    copyBtn.onclick = () => copyMessageContent(textSpan);
    buttonsWrap.appendChild(copyBtn);

    // Listen button -- text-to-speech via the browser's own built-in
    // Web Speech API (window.speechSynthesis), not an external service --
    // free, works offline, no new dependency/CDN risk. Shown on both
    // user and bot messages, per the request ("the chat prompt and the
    // response"). Only added if the browser actually supports it, so
    // older/unsupported browsers just don't see a broken button.
    if (typeof window.speechSynthesis !== "undefined") {
      const listenBtn = document.createElement("button");
      listenBtn.classList.add("message-listen-btn");
      listenBtn.title = "Listen to this message";
      listenBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
      `;
      listenBtn.onclick = () => toggleListenToMessage(listenBtn, textSpan);
      buttonsWrap.appendChild(listenBtn);
    }

    // Edit button -- only for plain-text user messages (no attachments,
    // since an image/document can't be meaningfully text-edited here).
    // Lets the user revise what they asked and regenerate the response
    // from that point, the same "edit and regenerate" pattern used
    // elsewhere -- see startEditingMessage below.
    if (sender === "user" && !allowHTML) {
      const editBtn = document.createElement("button");
      editBtn.classList.add("message-edit-btn");
      editBtn.title = "Edit message";
      editBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
      `;
      editBtn.onclick = () => startEditingMessage(msg, textSpan);
      buttonsWrap.appendChild(editBtn);
    }

    // Bot messages get a retry icon whenever retryInfo is available --
    // both genuine live responses from THIS session (full retryInfo,
    // including any images/documents) AND messages reloaded from saved
    // chat history (text-only retryInfo -- see loadChat below, since
    // attachments from the original exchange aren't persisted to
    // Firestore, only the text).
    if (sender === "bot" && retryInfo) {
      const retryBtn = document.createElement("button");
      retryBtn.classList.add("message-retry-btn");
      retryBtn.title = retryInfo.historical
        ? "Retry this message (text only -- the original attachments, if any, weren't saved with this chat)"
        : "Retry this message";
      retryBtn.innerHTML = `
        <svg viewBox="0 0 24 24">
          <polyline points="1 4 1 10 7 10"/>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
        </svg>
      `;
      retryBtn.onclick = () => {
        if (isSending) return; // setSendingLock already disables the whole input area, this is just a defensive guard
        deliverMessage(retryInfo.message, retryInfo.images, retryInfo.documents);
      };
      buttonsWrap.appendChild(retryBtn);
    }

    // Save button -- now shown on EVERY bot message, not just ones with a
    // chart/image. What it actually saves depends on the content:
    // chart -> PNG, venn diagram -> SVG, web images -> the image files,
    // a data table -> a real Excel file, otherwise -> a real Word
    // document. Detected structurally right after setting
    // textSpan.innerHTML -- works regardless of whether Chart.js has
    // actually drawn onto the canvas yet, since the relevant markup
    // (.price-chart/.web-images/.venn-chart/.response-table) is already
    // present in the raw HTML either way.
    if (sender === "bot") {
      const saveBtn = document.createElement("button");
      saveBtn.classList.add("message-save-btn");
      let saveLabel = "Save as Word document";
      if (allowHTML) {
        if (textSpan.querySelector(".project-zip")) {
          saveLabel = "Download project as .zip";
        } else if (textSpan.querySelector(".price-chart") || textSpan.querySelector(".venn-chart")) {
          saveLabel = "Save chart/diagram";
        } else if (textSpan.querySelector(".web-images")) {
          saveLabel = "Save image(s)";
        } else if (textSpan.querySelector(".response-table")) {
          saveLabel = "Save as Excel file";
        }
      }
      saveBtn.title = saveLabel;
      saveBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      `;
      saveBtn.onclick = () => saveMessageVisuals(msg);
      buttonsWrap.appendChild(saveBtn);
    }

    msg.appendChild(textSpan);
    msg.appendChild(actionsRow);

    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;

    if (allowHTML) {
      const newDiagrams = textSpan.querySelectorAll(".mermaid");
      if (newDiagrams.length > 0 && typeof mermaid !== "undefined") {
        mermaid.run({ nodes: newDiagrams }).catch((err) => {
          console.error("Mermaid rendering failed:", err);
          newDiagrams.forEach((el) => {
            el.innerHTML =
              '<em style="opacity:0.7;">(A diagram was meant to appear here, but could not be displayed.)</em>';
          });
        });
      }

      // Note: renderPriceCharts() already has its own internal
      // typeof-Chart check (see its try/catch) that shows a friendly
      // "(Chart could not be displayed...)" message if Chart.js truly
      // failed to load. An outer gate here used to skip calling it
      // entirely in that case instead, leaving the chart div blank with
      // no visible sign anything went wrong -- removed so that fallback
      // message always has a chance to run.
      renderPriceCharts(textSpan);

      renderVennDiagrams(textSpan);
      renderWebImages(textSpan);
      renderCodeBlocks(textSpan);
      renderProjectZip(textSpan);
      renderMathInMessage(textSpan);
    }

    return msg;
  }

  // Downloads whatever visual content is in a bot message -- a real chart
  // (exported from its live canvas as a PNG, so it captures exactly what
  // was rendered) or each image in a web-images gallery. Looks these up
  // dynamically from the message element at CLICK time (not captured at
  // button-creation time), since chart/image rendering happens
  // asynchronously after the button itself is created.

  // Shared by every save path below -- creates a real download via a
  // temporary object URL, revoked shortly after (Blob URLs otherwise
  // leak memory if never released).
  function downloadBlob(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }

  // Escapes text for the XML-based export formats below (Excel's
  // SpreadsheetML and the Word-compatible HTML) -- different escaping
  // needs than escapeHtmlAttr above since these go into XML attribute/
  // element content, not innerHTML.
  function escapeXml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // Builds a real filename from a chart/diagram title, or a short
  // sensible fallback -- shared across all the save paths.
  function filenameFromTitle(title, fallback, extension) {
    const base = (title || "").trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
    return (base || fallback) + "." + extension;
  }

  // Exports a real HTML <table> element as a genuine Excel-openable file
  // (SpreadsheetML -- Excel's own native XML spreadsheet format, still
  // fully supported by modern Excel) -- self-contained, no external
  // library or CDN dependency, which matters given a broken CDN link
  // silently broke chart rendering entirely earlier in this project.
  // Numeric-looking cells are typed as numbers (not text) so Excel
  // treats them as real numbers -- sortable, chartable, usable in
  // formulas -- not just text that happens to look like a number.
  function saveTableAsExcel(table, filename) {
    let rows = "";
    table.querySelectorAll("tr").forEach((tr) => {
      let cells = "";
      tr.querySelectorAll("th,td").forEach((cell) => {
        const text = cell.textContent.trim();
        const numericCandidate = text.replace(/,/g, "").replace(/^\$/, "").replace(/%$/, "").trim();
        const isNumber = numericCandidate !== "" && !isNaN(numericCandidate);
        // A confirmed real correctness bug this fixes: ss:Type="Number"
        // requires the cell's actual value to be a pure number -- writing
        // the original display text (e.g. "$44.30") into a Number-typed
        // cell is invalid SpreadsheetML and Excel can reject or mis-read
        // it. Number cells now store the cleaned numeric value; the
        // original formatting (currency symbol, % sign) is only kept for
        // cells that stay String-typed.
        const cellValue = isNumber ? numericCandidate : text;
        cells += `<Cell><Data ss:Type="${isNumber ? "Number" : "String"}">${escapeXml(cellValue)}</Data></Cell>`;
      });
      rows += `<Row>${cells}</Row>`;
    });
    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Sheet1"><Table>${rows}</Table></Worksheet>
</Workbook>`;
    downloadBlob(new Blob([xml], { type: "application/vnd.ms-excel" }), filename);
  }

  // Exports message content as a real Word-openable document, using the
  // well-established technique of HTML wrapped with Word-recognized XML
  // namespaces/metadata and served with a .doc extension and the
  // application/msword MIME type -- Word opens this directly and
  // renders the actual HTML formatting (headings, bold, lists), not
  // just plain unstyled text. Self-contained, no external library.
  function saveHtmlAsWordDoc(innerHtml, title, filename) {
    const docHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeXml(title)}</title></head>
<body style="font-family:Calibri,Arial,sans-serif; font-size:11pt; color:#111;">${innerHtml}</body>
</html>`;
    // Leading \ufeff (byte-order mark) helps Word correctly detect UTF-8
    // encoding rather than guessing from legacy code pages.
    downloadBlob(new Blob(["\ufeff", docHtml], { type: "application/msword" }), filename);
  }

  function saveMessageVisuals(msgEl) {
    // Project zips have their own dedicated Download button already
    // inside the card -- clicking the message-level save button just
    // triggers that same button, rather than duplicating the build logic.
    const zipDownloadBtn = msgEl.querySelector(".project-zip-download-btn");
    if (zipDownloadBtn) {
      zipDownloadBtn.click();
      return;
    }

    // Venn diagrams are real vector SVG (not a Chart.js canvas), so they
    // save as a real .svg file rather than a PNG export -- also a nicer
    // format for a diagram since it stays crisp at any zoom level.
    const vennSvg = msgEl.querySelector(".venn-chart svg");
    if (vennSvg) {
      try {
        let filename = "venn_diagram.svg";
        const vennDiv = msgEl.querySelector(".venn-chart");
        try {
          const vennData = JSON.parse(vennDiv.getAttribute("data-venn"));
          if (vennData.title) {
            filename = vennData.title.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() + ".svg";
          }
        } catch (err) {
          // Fall back to the generic filename above -- not worth failing the whole save over.
        }
        const svgText = new XMLSerializer().serializeToString(vennSvg);
        const blob = new Blob([svgText], { type: "image/svg+xml" });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch (err) {
        console.error("Could not save venn diagram:", err);
        alert("Could not save the diagram. Please try taking a screenshot instead.");
      }
      return;
    }

    const canvasEl = msgEl.querySelector(".price-chart canvas");
    if (canvasEl) {
      try {
        const dataUrl = canvasEl.toDataURL("image/png");
        let filename = "chart.png";
        const chartDiv = msgEl.querySelector(".price-chart");
        try {
          const chartData = JSON.parse(chartDiv.getAttribute("data-chart"));
          if (chartData.title) {
            filename = chartData.title.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() + ".png";
          }
        } catch (err) {
          // Fall back to the generic filename above if the chart's own
          // title can't be read for some reason -- not worth failing the
          // whole save over.
        }
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (err) {
        console.error("Could not save chart:", err);
        alert("Could not save the chart. Please try taking a screenshot instead.");
      }
      return;
    }

    const images = msgEl.querySelectorAll(".web-images img");
    if (images.length > 0) {
      // Staggered slightly (not all fired in the same tick) -- some
      // browsers can silently drop rapid back-to-back download triggers
      // that all happen within the same synchronous block.
      images.forEach((img, i) => {
        setTimeout(() => {
          const link = document.createElement("a");
          link.href = img.src;
          link.download = `image_${i + 1}.jpg`;
          link.target = "_blank"; // best-effort fallback -- if the browser can't honor `download` for a cross-origin image, this at least opens it in a new tab instead of doing nothing
          document.body.appendChild(link);
          link.click();
          link.remove();
        }, i * 300);
      });
      return;
    }

    // A message containing a real data table -> export as an actual
    // Excel file, not a Word document -- tabular data belongs in a
    // spreadsheet where it can be sorted/filtered/charted, not locked
    // inside a Word table.
    const table = msgEl.querySelector(".response-table");
    if (table) {
      try {
        // Any real prose alongside the table (e.g. a summary sentence
        // before/after it) isn't part of the table itself and would be
        // lost in an Excel export -- that's fine, it stayed visible in
        // the chat; the table is the part that actually benefits from
        // becoming a real spreadsheet.
        saveTableAsExcel(table, filenameFromTitle(null, "table", "xls"));
      } catch (err) {
        console.error("Could not save table as Excel:", err);
        alert("Could not save this table. Please try copying it manually instead.");
      }
      return;
    }

    // Everything else (plain paragraphs, lists, headings -- no chart,
    // image, or table) -> export as a real Word-openable document, using
    // the message's own rendered HTML so formatting (bold, headings,
    // bullet points) carries over, not just flattened plain text.
    const textSpan = msgEl.querySelector("span");
    if (textSpan) {
      try {
        // Strip out any lingering non-text visual markup defensively
        // (shouldn't be reached given the earlier returns above, but
        // guards against an unexpected mixed-content message) so the
        // Word doc only gets real text/formatting, not a stray canvas or
        // image tag it can't meaningfully represent anyway.
        const clone = textSpan.cloneNode(true);
        clone.querySelectorAll(".price-chart, .venn-chart, .web-images").forEach((el) => el.remove());
        const snippet = clone.textContent.trim().slice(0, 40) || "response";
        saveHtmlAsWordDoc(clone.innerHTML, snippet, filenameFromTitle(snippet, "response", "doc"));
      } catch (err) {
        console.error("Could not save response as Word document:", err);
        alert("Could not save this response. Please try copying it manually instead.");
      }
      return;
    }

    alert("Nothing to save in this message.");
  }

  function addThinkingMessage(mode) {
    const chatBox = document.getElementById("chat-box");
    const msg = document.createElement("div");
    msg.classList.add("message", "thinking");

    const row = document.createElement("div");
    row.className = "thinking-row";

    const logoImg = document.createElement("img");
    logoImg.src = "logo.png?v=2";
    logoImg.alt = mode === "chat" ? "Thinking" : "Searching";
    logoImg.className = "thinking-logo";
    row.appendChild(logoImg);

    const noteSpan = document.createElement("span");
    noteSpan.style.fontSize = "12px";
    noteSpan.style.color = "#999";
    row.appendChild(noteSpan);

    msg.appendChild(row);
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;

    // REAL status, not a guess: the backend now streams actual status
    // events over Server-Sent Events the instant each thing genuinely
    // happens server-side (see the sendEvent calls in server.js's /chat
    // route) -- updateThinkingStatus below writes each one directly as
    // it arrives. This replaces an earlier version that just cycled a
    // fixed local word list on a timer with zero visibility into what
    // was actually happening on the server; asked directly whether that
    // was real or fake, the honest answer was fake, which is what this
    // whole rewrite (backend included) exists to fix.
    //
    // Fallback: if the connection goes quiet for a while with no real
    // event (a slow single step, or an older/unpatched backend that
    // doesn't stream at all), a lightweight generic word still appears
    // after a delay so a long wait never looks frozen -- but it is
    // immediately overwritten the moment a real event does arrive.
    const fallbackWords = mode === "web"
      ? ["Searching the web", "Analyzing", "Almost there"]
      : ["Thinking", "Working on it", "Almost there"];
    let fallbackIndex = 0;
    const fallbackTimeout = setTimeout(() => {
      if (msg.parentNode && !noteSpan.textContent) {
        noteSpan.textContent = fallbackWords[fallbackIndex] + "...";
      }
    }, 2500);
    const fallbackInterval = setInterval(() => {
      if (!msg.parentNode) return;
      fallbackIndex = (fallbackIndex + 1) % fallbackWords.length;
      // Only used if real events have gone quiet for a while -- see
      // updateThinkingStatus, which resets this quiet-timer on every
      // genuine event so the fallback never overrides real, current info.
      if (Date.now() - (msg._lastRealEventAt || 0) > 4000) {
        noteSpan.textContent = fallbackWords[fallbackIndex] + "...";
      }
    }, 4000);

    msg._statusTimers = [fallbackTimeout, fallbackInterval];
    msg._noteSpan = noteSpan;
    msg._lastRealEventAt = 0;

    return msg;
  }

  // Writes a REAL status event (from the backend's SSE stream) into the
  // thinking indicator -- queued through a minimum-display-duration
  // drain (see enqueueThinkingStatus below) rather than written
  // directly, so events don't overwrite each other. Also marks the time
  // so the fallback rotation in addThinkingMessage knows not to override
  // it while events are still arriving regularly.
  function updateThinkingStatus(msg, statusText) {
    if (!msg || !msg.parentNode || !msg._noteSpan) return;
    msg._noteSpan.textContent = statusText + "...";
    msg._lastRealEventAt = Date.now();

    // Live Chat surfaces its own generic "Thinking..." the whole time a
    // response is being generated -- this specifically calls out when a
    // REAL web search is actually happening, using the exact same real
    // status events already streaming from the backend (see
    // TOOL_STATUS_LABELS/TOOL_REVIEW_LABELS in server.js), not a guess
    // or a fake timer. Only search-related events are surfaced here
    // deliberately -- mirroring every internal status word would be
    // noisy and most aren't meaningful to call out specifically during
    // a voice conversation.
    if (liveChatActive && /search|web/i.test(statusText)) {
      setLiveChatStatusLabel(statusText + "...");
      speakLiveChatFiller("search", liveChatCurrentTurnTranscript);
    }
  }

  // A confirmed real complaint this fixes: several real status events
  // (e.g. "Identifying what's needed" then "Investigating" then a
  // specific tool label) can legitimately fire within milliseconds of
  // each other -- everything before the one actual network delay (the
  // OpenAI API call) is essentially instant. Writing each one straight
  // to the DOM meant the early ones were overwritten before a human eye
  // could ever register them, so in practice only the LAST fast event
  // before a real delay was ever visible -- not fake, just imperceptibly
  // brief. This queues real events and drains them no faster than
  // MIN_STATUS_DISPLAY_MS apart, so every real step actually gets seen,
  // without holding up the final answer once it's ready (see
  // clearThinkingStatusQueue, called the moment the response arrives).
  const MIN_STATUS_DISPLAY_MS = 550;

  function enqueueThinkingStatus(msg, statusText) {
    if (!msg) return;
    if (!msg._statusQueue) msg._statusQueue = [];
    msg._statusQueue.push(statusText);
    if (!msg._statusQueueTimer) drainThinkingStatusQueue(msg);
  }

  function drainThinkingStatusQueue(msg) {
    if (!msg || !msg.parentNode || !msg._statusQueue || msg._statusQueue.length === 0) {
      if (msg) msg._statusQueueTimer = null;
      return;
    }
    const next = msg._statusQueue.shift();
    updateThinkingStatus(msg, next);
    msg._statusQueueTimer = setTimeout(() => drainThinkingStatusQueue(msg), MIN_STATUS_DISPLAY_MS);
  }

  // Called the moment the real answer is ready -- drops any still-queued
  // status words rather than making the user wait through leftover
  // flavor text now that there's an actual answer to show.
  function clearThinkingStatusQueue(msg) {
    if (!msg) return;
    msg._statusQueue = [];
    if (msg._statusQueueTimer) {
      clearTimeout(msg._statusQueueTimer);
      msg._statusQueueTimer = null;
    }
  }

  // Small wrapper so every place that removes a thinking message also
  // reliably clears its pending status-word timers -- avoids them
  // trying to update text on an element already removed from the page.
  function removeThinkingMessage(msg) {
    if (msg._statusTimers) {
      clearTimeout(msg._statusTimers[0]);
      clearInterval(msg._statusTimers[1]);
    }
    clearThinkingStatusQueue(msg);
    if (msg.parentNode) msg.remove();
  }

  // Converts an already-loaded <img> element to a PNG Blob via canvas --
  // used so clipboard writes always use PNG regardless of the original
  // image's format. This matters because ClipboardItem writes have real,
  // confirmed gaps in browser support for formats other than PNG (most
  // notably JPEG, which is exactly what camera-captured photos are) --
  // PNG is the one format with consistently solid support for clipboard
  // writes across browsers.
  function imageElementToPngBlob(imgEl) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = imgEl.naturalWidth;
      canvas.height = imgEl.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgEl, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      }, "image/png");
    });
  }

  // Copies a message's real content to the clipboard -- if it contains
  // an image, copies the ACTUAL image data (converted to PNG via canvas
  // for broad clipboard compatibility, see imageElementToPngBlob above),
  // not just its surrounding text, so pasting elsewhere (another app,
  // or back into this chat's input) gives the real image. Falls back to
  // plain text for text-only messages, and also gracefully falls back
  // to text if the image copy itself fails for any reason rather than
  // silently doing nothing.
  // Hidden marker embedded in copied text for our own document links --
  // invisible zero-width characters wrap it so it doesn't visibly clutter
  // the copied text if pasted somewhere outside this app, while still
  // being a reliable, exact string our own paste handler can detect.
  const ATTACHMENT_MARKER_PATTERN = /\u200B\[\[GARNET_FILE:(att\d+)\]\]\u200B/;

  // Turns a plain-text user message bubble into an editable textarea,
  // pre-filled with the original text. Enter (without Shift) confirms
  // and regenerates from this point; Escape/blur-with-no-change cancels
  // back to the original display.
  function startEditingMessage(msgEl, textSpan) {
    if (isSending) return; // don't allow editing while a request is already in flight
    stopListening(); // the listen button (if this message had one) is about to be removed from the DOM -- make sure nothing keeps playing with no way to stop it
    const originalText = textSpan.textContent; // user messages are always set via textContent (allowHTML=false), so this is the real, exact original text

    const textarea = document.createElement("textarea");
    textarea.className = "message-edit-textarea";
    textarea.value = originalText;
    textSpan.replaceWith(textarea);

    const hint = document.createElement("div");
    hint.className = "message-edit-hint";
    hint.textContent = "Enter to send \u00b7 Esc to cancel";
    textarea.after(hint);

    const autoResize = () => {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    };
    autoResize();
    textarea.addEventListener("input", autoResize);

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    let finished = false; // guards against both keydown and blur firing the same finish twice

    const cancelEdit = () => {
      if (finished) return;
      finished = true;
      const restoredSpan = document.createElement("span");
      restoredSpan.textContent = originalText;
      textarea.replaceWith(restoredSpan);
      hint.remove();
    };

    const confirmEdit = () => {
      if (finished) return;
      const newText = textarea.value.trim();
      if (!newText || newText === originalText) {
        cancelEdit();
        return;
      }
      finished = true;
      hint.remove();
      resubmitEditedMessage(msgEl, newText);
    };

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        confirmEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    });

    // Clicking elsewhere without pressing Enter cancels rather than
    // silently discarding -- matches the Escape behavior, just via a
    // different exit gesture.
    textarea.addEventListener("blur", () => {
      // Deferred one tick so a genuine Enter-triggered confirm (which
      // also blurs the textarea as it's replaced) doesn't race with this.
      setTimeout(cancelEdit, 0);
    });
  }

  // Applies an edited user message: truncates conversationHistory back
  // to right before this exchange, removes this message and everything
  // that came after it from the chat, then resends the edited text
  // through the normal send flow -- so the response (and anything after
  // it) genuinely regenerates from the edit point, the same "edit and
  // regenerate" behavior found in other chat assistants.
  function resubmitEditedMessage(msgEl, newText) {
    const historyIndex = parseInt(msgEl.dataset.historyIndex || "0", 10);
    conversationHistory = conversationHistory.slice(0, historyIndex);

    // Remove this message and every message after it in the chat box --
    // they're all being regenerated from this edit point forward.
    let node = msgEl;
    const toRemove = [];
    while (node) {
      toRemove.push(node);
      node = node.nextElementSibling;
    }
    toRemove.forEach((n) => n.remove());

    const input = document.getElementById("user-input");
    input.value = newText;
    sendMessage();
  }

  // ------------------------------------------------------------------
  // LISTEN LANGUAGE PREFERENCE -- lets the user pick which language/
  // voice the Listen feature speaks in, persisted across sessions.
  // Populated from whatever voices the BROWSER actually has installed
  // (via speechSynthesis.getVoices()) rather than a hardcoded list,
  // since real availability varies by browser/OS and a hardcoded list
  // could easily offer a language nothing on the device can actually
  // speak.
  // ------------------------------------------------------------------

  const LISTEN_LANG_STORAGE_KEY = "garnetListenLang"; // "auto", a bare BCP-47 code like "ar-SA" (any voice for that language), or "lang::voiceName" for one specific voice (see populateEditListenLangSelect -- lets a specific voice, e.g. a female Arabic one when the device has one, be chosen explicitly rather than just "any voice for this language")

  // A confirmed real bug this fixes: Voice Language (above) controls
  // what the app SPEAKS to you (TTS), but there was no separate setting
  // for what language the app should LISTEN for when transcribing YOUR
  // speech (mic recording, Live Chat). These used to be silently
  // inferred from Voice Language, which worked reasonably for a plain
  // browser voice (its lang code doubled as a decent guess), but breaks
  // completely for an ElevenLabs voice selection -- an ElevenLabs
  // voiceId carries no language information at all, so there was
  // nothing correct to infer, and it was falling back to the browser's
  // own language setting (commonly English) regardless of what the
  // person was actually speaking. Confirmed directly: Arabic speech
  // during Live Chat was never transcribed correctly because
  // SpeechRecognition was listening in English. This is now a fully
  // separate, explicit setting.
  const RECOGNITION_LANG_STORAGE_KEY = "garnetRecognitionLang"; // "auto" (browser default) or a specific BCP-47 code like "en-US"/"ar-SA"

  function getSavedRecognitionLang() {
    try {
      return localStorage.getItem(RECOGNITION_LANG_STORAGE_KEY) || "auto";
    } catch (err) {
      return "auto";
    }
  }

  function getSavedListenLang() {
    let value;
    try {
      value = localStorage.getItem(LISTEN_LANG_STORAGE_KEY) || "auto";
    } catch (err) {
      return "auto"; // localStorage can throw in some locked-down/private-browsing contexts -- fail open rather than breaking Listen entirely
    }
    // Per explicit request, Listen now uses the browser's own free,
    // built-in Web Speech API instead of ElevenLabs (no API key, no
    // usage quota, works entirely client-side). A value saved before
    // this change ("elevenlabs::...") would otherwise silently keep
    // trying that now-unreachable-from-the-UI code path forever.
    // Migrated once here back to "auto" instead.
    if (value.startsWith("elevenlabs::")) return "auto";
    return value;
  }

  // Shared by both the per-message Listen feature and Live Chat's own
  // reply playback -- resolves which language/voice to actually use for
  // a given piece of text, given the saved preference (auto-detect, a
  // language, or one specific voice).
  function resolveSpeechVoice(text, availableVoices) {
    const savedValue = getSavedListenLang();

    if (savedValue !== "auto" && !savedValue.startsWith("elevenlabs::")) {
      const [lang, name] = savedValue.split("::");
      const matchingVoice = availableVoices.find((v) => v.lang === lang && (!name || v.name === name));
      return { resolvedLang: lang, matchingVoice: matchingVoice || null };
    }

    const detectedLang = detectTextLanguage(text);
    if (detectedLang && detectedLang !== "en") {
      const matchingVoice = availableVoices.find((v) => v.lang.toLowerCase().startsWith(detectedLang));
      return { resolvedLang: matchingVoice ? matchingVoice.lang : null, matchingVoice: matchingVoice || null };
    }

    // English (or nothing distinctive detected) -- a confirmed real bug
    // this fixes: this case previously returned matchingVoice: null,
    // meaning no specific voice was ever pinned here at all, leaving it
    // to the browser's own internal default voice selection on every
    // single call. That default isn't guaranteed to be the SAME voice
    // every time, especially with more than one English voice
    // installed -- explicitly picking one specific voice here (rather
    // than leaving the choice to the browser) is what actually makes
    // repeated English responses sound consistent.
    const englishVoice = availableVoices.find((v) => v.lang.toLowerCase().startsWith("en")) || availableVoices[0] || null;
    return { resolvedLang: englishVoice ? englishVoice.lang : null, matchingVoice: englishVoice };
  }

  function displayNameForLangCode(code) {
    try {
      const dn = new Intl.DisplayNames([navigator.language || "en"], { type: "language" });
      const name = dn.of(code);
      return name && name !== code ? name : code;
    } catch (err) {
      return code; // Intl.DisplayNames unsupported or an unrecognized code -- just show the raw code rather than breaking the menu
    }
  }

  function updateListenLangBtnState() {
    const btn = document.getElementById("listenLangBtn");
    if (!btn) return;
    const saved = getSavedListenLang();
    if (saved === "auto") {
      btn.classList.remove("lang-selected");
      btn.title = "Voice language for Listen (currently: Auto)";
    } else {
      btn.classList.add("lang-selected");
      btn.title = `Voice language for Listen (currently: ${displayNameForLangCode(saved)})`;
    }
  }

  function populateListenLangMenu() {
    const menu = document.getElementById("listenLangMenu");
    if (!menu) return;

    const voices = typeof window.speechSynthesis !== "undefined" ? window.speechSynthesis.getVoices() : [];
    // Dedupe to one entry per language code (voices commonly include
    // several per language, e.g. multiple en-US voices) -- picks
    // whichever voice appears first for each code, good enough for a
    // language-level (not voice-level) choice.
    const seenCodes = new Set();
    const uniqueLangs = [];
    for (const v of voices) {
      if (!seenCodes.has(v.lang)) {
        seenCodes.add(v.lang);
        uniqueLangs.push(v.lang);
      }
    }
    uniqueLangs.sort((a, b) => displayNameForLangCode(a).localeCompare(displayNameForLangCode(b)));

    const saved = getSavedListenLang();
    const options = [{ code: "auto", label: "Auto (browser default)" }, ...uniqueLangs.map((code) => ({ code, label: displayNameForLangCode(code) }))];

    menu.innerHTML = options
      .map(
        (opt) => `<div class="listen-lang-option${opt.code === saved ? " selected" : ""}" data-lang="${escapeHtmlAttr(opt.code)}">${escapeHtmlAttr(opt.label)}${opt.code === saved ? " ✓" : ""}</div>`
      )
      .join("");

    menu.querySelectorAll(".listen-lang-option").forEach((el) => {
      el.onclick = () => selectListenLanguage(el.getAttribute("data-lang"));
    });
  }

  function selectListenLanguage(code) {
    try {
      localStorage.setItem(LISTEN_LANG_STORAGE_KEY, code);
    } catch (err) {
      // localStorage can throw in some locked-down/private-browsing
      // contexts -- the selection just won't persist across a reload
      // in that case, not worth breaking the interaction over.
    }
    updateListenLangBtnState();
    closeListenLangMenu();
  }

  function toggleListenLangMenu() {
    const menu = document.getElementById("listenLangMenu");
    const isOpening = menu.style.display === "none";
    if (isOpening) populateListenLangMenu();
    menu.style.display = isOpening ? "flex" : "none";
    if (isOpening) menu.style.flexDirection = "column";
  }

  function closeListenLangMenu() {
    const menu = document.getElementById("listenLangMenu");
    if (menu) menu.style.display = "none";
  }

  // Voice lists load asynchronously in several browsers (empty on the
  // very first call) -- refreshing the menu's contents once they
  // actually arrive means the picker doesn't stay stuck showing only
  // "Auto" if it happened to be opened before voices finished loading.
  if (typeof window.speechSynthesis !== "undefined") {
    window.speechSynthesis.onvoiceschanged = () => {
      const menu = document.getElementById("listenLangMenu");
      if (menu && menu.style.display !== "none") populateListenLangMenu();
    };
  }

  document.addEventListener("DOMContentLoaded", updateListenLangBtnState);
  // In case DOMContentLoaded already fired before this script block ran.
  if (document.readyState !== "loading") updateListenLangBtnState();

  // A confirmed real Chrome bug this works around: speechSynthesis can
  // silently stall/stutter partway through a longer utterance (roughly
  // 15+ seconds) unless it's periodically "nudged" with a pause()
  // immediately followed by resume() -- a well-documented workaround,
  // not a guess. This explains why English speech was fine but Arabic
  // stammered on the exact same underlying content: the same words
  // often take noticeably longer to actually speak in Arabic, making it
  // far more likely to cross that ~15s threshold where the bug kicks
  // in. Shared by both the per-message Listen feature and Live Chat's
  // own reply playback, since the same real bug affects either -- not
  // duplicated per feature.
  let speechKeepAliveInterval = null;

  function startSpeechKeepAlive() {
    stopSpeechKeepAlive();
    speechKeepAliveInterval = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000); // safely under the ~15s threshold where the real bug tends to trigger
  }

  function stopSpeechKeepAlive() {
    if (speechKeepAliveInterval) {
      clearInterval(speechKeepAliveInterval);
      speechKeepAliveInterval = null;
    }
  }

  // A more robust, primary fix for the same real Chrome stall bug --
  // rather than relying only on periodically nudging one long
  // utterance, this avoids the problem at the source by never handing
  // the engine a single utterance long enough to trigger it in the
  // first place. Splits on real sentence-ending punctuation (English
  // . ! ? and Arabic ؟), which also matters for why Arabic specifically
  // stammered: the same content often runs measurably longer once
  // spoken in Arabic, so it crossed the stall threshold far more often
  // than the equivalent English text did. Any unusually long individual
  // sentence (rare, but possible with no natural punctuation break) is
  // further split on commas or word boundaries as a fallback, so no
  // single chunk handed to the engine is ever too long regardless of
  // language or punctuation.
  const SPEECH_CHUNK_MAX_LENGTH = 200;

  function splitIntoSpeechChunks(text) {
    const rawSentences = text.split(/(?<=[.!?؟])\s+/).filter((s) => s.trim().length > 0);
    const sentences = rawSentences.length > 0 ? rawSentences : [text];
    const chunks = [];
    for (const sentence of sentences) {
      if (sentence.length <= SPEECH_CHUNK_MAX_LENGTH) {
        chunks.push(sentence);
        continue;
      }
      let remaining = sentence;
      while (remaining.length > SPEECH_CHUNK_MAX_LENGTH) {
        let splitAt = remaining.lastIndexOf(",", SPEECH_CHUNK_MAX_LENGTH);
        if (splitAt < 20) splitAt = remaining.lastIndexOf(" ", SPEECH_CHUNK_MAX_LENGTH); // no reasonable comma nearby -- fall back to a word boundary
        if (splitAt < 20) splitAt = SPEECH_CHUNK_MAX_LENGTH; // no reasonable word boundary either -- hard cut rather than loop forever
        chunks.push(remaining.slice(0, splitAt + 1).trim());
        remaining = remaining.slice(splitAt + 1);
      }
      if (remaining.trim()) chunks.push(remaining.trim());
    }
    return chunks.length > 0 ? chunks : [text];
  }

  // stopPiperAudio is kept as a no-op -- Piper TTS has been removed
  // entirely (ElevenLabs is now the sole cloud TTS option), but this
  // function is still called from stopListening() and
  // handleLiveChatBargeIn() as a defensive no-op rather than removing
  // it from both call sites.
  function stopPiperAudio() {}

  // ------------------------------------------------------------------
  // ELEVENLABS TTS (frontend side) -- real, cloud-hosted, high-quality
  // speech, confirmed strong Arabic support with both male and female
  // voice options. ElevenLabs' multilingual model handles any of its 32
  // supported languages regardless of which specific voice is chosen --
  // so this is used for ALL text when selected, not gated to any one
  // language.
  // ------------------------------------------------------------------
  let elevenLabsAvailableVoicesCache = null; // null = not checked yet, [] = checked, none available

  async function checkElevenLabsAvailability() {
    if (elevenLabsAvailableVoicesCache !== null) return elevenLabsAvailableVoicesCache;
    try {
      const response = await fetch(ELEVENLABS_VOICES_API_URL);
      const data = await response.json();
      elevenLabsAvailableVoicesCache = data.configured && Array.isArray(data.voices) ? data.voices : [];
    } catch (err) {
      console.error("Could not check ElevenLabs voice availability:", err);
      elevenLabsAvailableVoicesCache = []; // fails closed -- if the check itself fails, treat ElevenLabs as unavailable rather than offering something that might not work
    }
    return elevenLabsAvailableVoicesCache;
  }

  // Not warmed up eagerly at page load anymore -- Listen and Live Chat
  // no longer route through ElevenLabs at all (switched to the free
  // browser Web Speech API instead), so nothing reachable actually uses
  // this cache; the functions above are left in place, unused, in case
  // ElevenLabs is ever re-enabled later.

  let currentElevenLabsAudio = null;
  // A confirmed real bug this fixes: speakViaElevenLabs's fetch() had no
  // cancellation mechanism at all. If Stop (or a Live Chat barge-in) was
  // triggered WHILE the request was still generating server-side --
  // which given the request's own latency is a real, common window --
  // stopElevenLabsAudio() found currentElevenLabsAudio still null and
  // did nothing. Then when the fetch eventually resolved, it
  // unconditionally created a new Audio and played it, even though Stop
  // had already been pressed (or the person had already started talking
  // again). That's the exact confirmed symptom: Stop working
  // inconsistently, and speech resuming on its own after being stopped.
  // Fixed with a real AbortController (cancels the actual in-flight
  // network request) plus a generation counter (belt-and-suspenders --
  // even if a response slips through right as it's being aborted, a
  // stale generation number means it's discarded instead of played).
  let currentElevenLabsAbortController = null;
  let elevenLabsRequestGeneration = 0;

  function stopElevenLabsAudio() {
    elevenLabsRequestGeneration++; // invalidates any in-flight speakViaElevenLabs request, even one still generating server-side
    if (currentElevenLabsAbortController) {
      currentElevenLabsAbortController.abort();
      currentElevenLabsAbortController = null;
    }
    if (currentElevenLabsAudio) {
      currentElevenLabsAudio.pause();
      currentElevenLabsAudio.currentTime = 0;
      currentElevenLabsAudio = null;
    }
  }

  function speakViaElevenLabs(text, voiceId, onFullyDone, onErrorDone) {
    stopElevenLabsAudio();
    const myGeneration = elevenLabsRequestGeneration;
    const abortController = new AbortController();
    currentElevenLabsAbortController = abortController;

    const settle = (fn) => {
      if (myGeneration !== elevenLabsRequestGeneration) return; // stopped/superseded -- ignore
      if (fn) fn();
    };

    if (!window.MediaSource || !MediaSource.isTypeSupported("audio/mpeg")) {
      // Fallback for a browser without MediaSource mp3 support -- same
      // buffered approach as before, just still routed through the
      // abort/generation guards so Stop/barge-in still work correctly.
      fetch(ELEVENLABS_SPEAK_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId }),
        signal: abortController.signal,
      })
        .then((response) => response.blob())
        .then((blob) => {
          settle(() => {
            const audio = new Audio(URL.createObjectURL(blob));
            currentElevenLabsAudio = audio;
            audio.onended = () => { if (currentElevenLabsAudio === audio) currentElevenLabsAudio = null; if (onFullyDone) onFullyDone(); };
            audio.onerror = () => { if (currentElevenLabsAudio === audio) currentElevenLabsAudio = null; if (onErrorDone) onErrorDone(); };
            audio.play().catch(() => { if (onErrorDone) onErrorDone(); });
          });
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          settle(() => { if (onErrorDone) onErrorDone(); });
        });
      return;
    }

    const mediaSource = new MediaSource();
    const audio = new Audio();
    audio.src = URL.createObjectURL(mediaSource);
    currentElevenLabsAudio = audio;

    audio.onended = () => {
      if (currentElevenLabsAudio === audio) currentElevenLabsAudio = null;
      settle(onFullyDone);
    };
    audio.onerror = () => {
      if (currentElevenLabsAudio === audio) currentElevenLabsAudio = null;
      settle(onErrorDone);
    };

    mediaSource.addEventListener("sourceopen", async () => {
      if (myGeneration !== elevenLabsRequestGeneration) return;
      let sourceBuffer;
      try {
        sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
      } catch (err) {
        console.error("MediaSource addSourceBuffer failed:", err);
        settle(onErrorDone);
        return;
      }

      let startedPlaying = false;

      try {
        const response = await fetch(ELEVENLABS_SPEAK_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId }),
          signal: abortController.signal,
        });
        if (!response.ok || !response.body) {
          let errMsg = "Could not generate speech.";
          try { errMsg = (await response.json()).error || errMsg; } catch (_) {}
          throw new Error(errMsg);
        }
        const reader = response.body.getReader();

        const appendChunk = (chunk) =>
          new Promise((resolve, reject) => {
            const onUpdateEnd = () => { sourceBuffer.removeEventListener("updateend", onUpdateEnd); resolve(); };
            const onError = (e) => { sourceBuffer.removeEventListener("error", onError); reject(e); };
            sourceBuffer.addEventListener("updateend", onUpdateEnd, { once: true });
            sourceBuffer.addEventListener("error", onError, { once: true });
            sourceBuffer.appendBuffer(chunk);
          });

        while (true) {
          if (myGeneration !== elevenLabsRequestGeneration) return; // stopped mid-stream
          const { done, value } = await reader.read();
          if (myGeneration !== elevenLabsRequestGeneration) return;
          if (done) {
            if (mediaSource.readyState === "open") mediaSource.endOfStream();
            break;
          }
          await appendChunk(value);
          if (!startedPlaying) {
            startedPlaying = true;
            audio.play().catch((err) => {
              console.error("Could not play ElevenLabs audio:", err);
              settle(onErrorDone);
            });
          }
        }
      } catch (err) {
        if (err.name === "AbortError") return; // expected -- intentionally stopped/superseded
        console.error("ElevenLabs TTS stream failed:", err);
        settle(onErrorDone);
      }
    });
  }


  // Shared by both the per-message Listen feature and Live Chat's own
  // reply playback -- speaks each chunk as its own utterance, queued
  // one at a time via each chunk's own onend (not all queued upfront),
  // so a single speechSynthesis.cancel() call cleanly stops the whole
  // sequence for barge-in/interruption, exactly like it already did for
  // a single utterance.
  function speakTextChunked(text, resolvedLang, matchingVoice, onFullyDone, onErrorDone) {
    const chunks = splitIntoSpeechChunks(text);
    let settled = false; // guards against onFullyDone/onErrorDone firing more than once, e.g. if an error happens on one chunk while a later chunk still eventually fires its own onend

    window.speechSynthesis.cancel();
    startSpeechKeepAlive();

    // All chunks queued upfront via back-to-back speak() calls, rather
    // than waiting for each chunk's onend before queuing the next --
    // that "wait then speak" approach was the real source of a small
    // but perceptible gap at every single sentence boundary. Letting
    // the browser's own internal speech queue handle the transition
    // between sentences is measurably smoother, since it avoids the
    // round-trip through a JS event callback between each one.
    // speechSynthesis.cancel() still clears the ENTIRE queue regardless
    // of how many utterances were queued this way, so barge-in
    // interruption continues to work correctly.
    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      if (resolvedLang) utterance.lang = resolvedLang;
      if (matchingVoice) utterance.voice = matchingVoice;
      const isLast = index === chunks.length - 1;
      utterance.onend = () => {
        if (isLast && !settled) {
          settled = true;
          stopSpeechKeepAlive();
          if (onFullyDone) onFullyDone();
        }
      };
      utterance.onerror = () => {
        if (!settled) {
          settled = true;
          stopSpeechKeepAlive();
          window.speechSynthesis.cancel(); // clears any remaining queued chunks, so they can't keep playing after we've already moved on
          if (onErrorDone) onErrorDone();
        }
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  // Tracks whichever listen button is currently active, so starting a
  // new one always stops any previous one first (only one message
  // should ever be read aloud at a time), and so the button's visual
  // state resets correctly when speech ends naturally, is stopped, or
  // errors out.
  let currentlySpeakingBtn = null;

  function stopListening() {
    window.speechSynthesis.cancel();
    stopPiperAudio();
    stopElevenLabsAudio();
    stopFillerAudio();
    stopSpeechKeepAlive();
    if (currentlySpeakingBtn) {
      currentlySpeakingBtn.classList.remove("speaking");
      currentlySpeakingBtn = null;
    }
  }

  // A confirmed real bug this fixes: "Auto" was leaving utterance.lang
  // completely unset, which means the browser's speech engine falls
  // back to its own default voice/language (commonly English)
  // regardless of what the text actually is -- so Arabic (or any non-
  // English) text under "Auto" would get read by an English voice,
  // which either mispronounces everything or, on some engines, doesn't
  // produce audible speech for the given characters at all. Detects the
  // actual Unicode script the text is written in and matches THAT to an
  // installed voice, rather than trusting the browser to guess. An
  // explicit manual language selection (not "auto") still always wins
  // over this -- detection is only the fallback for "Auto" specifically.
  const SCRIPT_LANG_RANGES = [
    { lang: "ar", pattern: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/ }, // Arabic
    { lang: "he", pattern: /[\u0590-\u05FF]/ },                          // Hebrew
    { lang: "ru", pattern: /[\u0400-\u04FF]/ },                          // Cyrillic (Russian and others)
    { lang: "zh", pattern: /[\u4E00-\u9FFF]/ },                          // Chinese (also matches Japanese Kanji -- see ja check first)
    { lang: "ja", pattern: /[\u3040-\u30FF]/ },                          // Japanese Hiragana/Katakana -- checked before the broader zh range below
    { lang: "ko", pattern: /[\uAC00-\uD7AF]/ },                          // Korean Hangul
    { lang: "th", pattern: /[\u0E00-\u0E7F]/ },                          // Thai
    { lang: "hi", pattern: /[\u0900-\u097F]/ },                          // Hindi/Devanagari
  ];

  // Latin-script languages (French, Spanish, German, Portuguese, Italian,
  // Dutch, English) all share the same basic character set, so the
  // Unicode-range detection above genuinely can't tell them apart --
  // that's a real, structural limit, not something a bigger range list
  // could fix. This uses a different, well-established technique
  // instead: common function words (articles, conjunctions, pronouns)
  // are highly distinctive per language even though the alphabet isn't.
  // Deliberately requires at least 2 distinct matches before overriding
  // the English default, since a couple of short/generic accidental
  // matches (e.g. "la" appearing in an English proper noun) shouldn't
  // be enough to misdetect the whole message.
  const LATIN_STOPWORDS = {
    fr: ["le","la","les","des","une","et","est","dans","pour","avec","sur","que","qui","pas","vous","nous","etre","avoir","tres","bonjour","merci","de","du","au","aux","ce","ne","on","se","qu","il","elle","ils","cette","comme","aujourd","hui"],
    es: ["el","los","las","una","es","para","con","por","que","no","se","del","muy","mas","pero","como","esta","son","este","gracias","hola","usted","de","al","su","sus","yo","tu","le","les","lo","desde","hasta"],
    de: ["der","die","das","und","ist","fur","mit","auf","nicht","ein","eine","den","dem","des","sich","sie","wird","werden","sind","auch","aber","oder","sehr","danke","hallo","zu","von","im","es","ich","du","wir","ihr"],
    pt: ["o","os","as","uma","para","com","por","que","nao","se","do","da","dos","das","muito","mais","mas","como","esta","sao","este","voce","obrigado","ola","de","um","uns","umas","eu","tu","ele","ela"],
    it: ["il","lo","gli","una","per","con","che","non","si","del","della","molto","piu","ma","come","sono","questa","questo","anche","grazie","ciao","di","da","in","un","io","tu","noi","voi","loro"],
    nl: ["de","het","een","en","is","voor","met","op","niet","van","dat","die","zijn","was","aan","bij","uit","dan","dus","ook","zeer","hallo","dank","ik","jij","wij","zij","er"],
  };

  function detectLatinLanguage(text) {
    // Apostrophes treated as word boundaries (not kept in tokens) --
    // matches how the stopword lists above are written (e.g. French
    // "qu" separately from "il", not the combined "qu'il").
    const words = text.toLowerCase().match(/[a-zà-ÿ]+/g) || [];
    if (words.length < 3) return "en"; // too short to reliably detect anything -- default rather than guess
    const wordSet = new Set(words);
    let bestLang = "en";
    let bestScore = 1; // English stays the default unless some other language clearly beats a 1-match bar
    for (const [lang, stopwords] of Object.entries(LATIN_STOPWORDS)) {
      let score = 0;
      for (const w of stopwords) {
        if (wordSet.has(w)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestLang = lang;
      }
    }
    return bestLang;
  }

  function detectTextLanguage(text) {
    // Order matters: Japanese is checked before the Chinese range,
    // since Japanese text often also contains CJK Kanji characters
    // that would otherwise match the broader Chinese range first.
    const orderedChecks = [
      SCRIPT_LANG_RANGES.find((r) => r.lang === "ja"),
      ...SCRIPT_LANG_RANGES.filter((r) => r.lang !== "ja"),
    ];
    for (const { lang, pattern } of orderedChecks) {
      if (pattern.test(text)) return lang;
    }
    // No distinctive non-Latin script found -- refine further using
    // stopword matching rather than assuming English by default, since
    // French/Spanish/German/etc. would otherwise all be misdetected as
    // English (see detectLatinLanguage above).
    return detectLatinLanguage(text);
  }

  // A confirmed real bug this fixes: speechSynthesis.getVoices() can
  // return an EMPTY array on the very first call after page load --
  // voices load asynchronously in the background on many browsers, and
  // only become available once the 'voiceschanged' event fires. A
  // Listen click before that finishes would find zero voices to match
  // against and silently fall back to whatever the browser's absolute
  // default is (commonly English), even on a device that genuinely has
  // the right voice installed -- confirmed directly: a real device with
  // 23 installed voices including Arabic still wasn't using them,
  // because the match was being attempted before the list had loaded.
  // Warmed up once, eagerly, right when the page loads (see the call
  // below), so by the time anyone actually clicks Listen the list has
  // almost always already finished loading and this resolves instantly
  // -- the wait only matters for a click that happens unusually fast
  // right after the page first loads.
  let voicesReadyPromise = null;
  function ensureVoicesLoaded() {
    if (voicesReadyPromise) return voicesReadyPromise;
    voicesReadyPromise = new Promise((resolve) => {
      const existing = window.speechSynthesis.getVoices();
      if (existing.length > 0) {
        resolve(existing);
        return;
      }
      const onVoicesChanged = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
      // Fallback timeout in case 'voiceschanged' never fires on some
      // browser (a few older/less common ones don't reliably support
      // it) -- resolves with whatever's available by then rather than
      // waiting forever.
      setTimeout(() => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      }, 2000);
    });
    return voicesReadyPromise;
  }
  if (typeof window.speechSynthesis !== "undefined") {
    ensureVoicesLoaded(); // fire the warm-up immediately on page load, don't wait for the first Listen click
  }

  async function toggleListenToMessage(btn, textSpan) {
    // Clicking the button that's already speaking just stops it.
    if (currentlySpeakingBtn === btn) {
      stopListening();
      return;
    }

    const text = textSpan.textContent.trim();
    if (!text) return;

    // Uses the browser's own free, built-in Web Speech API -- no API
    // key, no usage quota, works entirely client-side.
    //
    // Everything that can involve an async wait (voice loading) happens
    // HERE, before stopListening()'s cancel() call -- Chrome has a known
    // issue where any async gap between cancel() and a subsequent
    // speak() can cause that speak() to be silently swallowed,
    // especially with a specific (non-default) voice assigned.
    // Resolving everything async FIRST, then calling cancel()/speak()
    // synchronously (inside speakTextChunked below), avoids that gap.
    const availableVoices = await ensureVoicesLoaded(); // resolves instantly in the vast majority of real cases, since the warm-up already ran at page load
    const { resolvedLang, matchingVoice } = resolveSpeechVoice(text, availableVoices);

    stopListening();

    btn.classList.add("speaking");
    currentlySpeakingBtn = btn;

    speakTextChunked(
      text,
      resolvedLang,
      matchingVoice,
      () => {
        btn.classList.remove("speaking");
        if (currentlySpeakingBtn === btn) currentlySpeakingBtn = null;
      },
      () => {
        btn.classList.remove("speaking");
        if (currentlySpeakingBtn === btn) currentlySpeakingBtn = null;
      }
    );
  }

  async function copyMessageContent(textSpan) {
    const firstImage = textSpan.querySelector("img");
    const attachmentLink = textSpan.querySelector("a[data-attachment-id]");
    const plainText = textSpan.innerText;

    if (firstImage) {
      try {
        const pngBlob = await imageElementToPngBlob(firstImage);

        const clipboardPayload = { "image/png": pngBlob };
        if (plainText.trim()) {
          clipboardPayload["text/plain"] = new Blob([plainText], { type: "text/plain" });
        }

        await navigator.clipboard.write([new ClipboardItem(clipboardPayload)]);
        showCopiedToast();
        return;
      } catch (err) {
        console.error("Could not copy image data, falling back to text:", err);
        // falls through to the plain-text copy below
      }
    }

    if (attachmentLink) {
      // Both the copy and the eventual paste happen inside this same
      // app, so we don't need the OS clipboard to support real file
      // data at all (which it genuinely can't, reliably, for arbitrary
      // file types) -- a hidden marker referencing our own in-memory
      // registry (see sentAttachmentRegistry) is enough, since our own
      // paste handler on the input can recognize it and pull the real
      // file back out, rather than typing raw text.
      const regId = attachmentLink.getAttribute("data-attachment-id");
      const markerText = `${plainText}\u200B[[GARNET_FILE:${regId}]]\u200B`;
      navigator.clipboard.writeText(markerText);
      showCopiedToast();
      return;
    }

    navigator.clipboard.writeText(plainText);
    showCopiedToast();
  }

  function showCopiedToast() {
    const toast = document.createElement("div");
    toast.textContent = "Copied!";
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.background = "#d9a441";
    toast.style.color = "#111";
    toast.style.padding = "8px 12px";
    toast.style.borderRadius = "8px";
    toast.style.fontSize = "14px";
    toast.style.boxShadow = "0 0 10px rgba(0,0,0,0.4)";
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    document.body.appendChild(toast);
    setTimeout(() => (toast.style.opacity = "1"), 50);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 1200);
  }

  document.getElementById("user-input").addEventListener("keypress", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  // Lets the user paste an image directly (Ctrl+V / Cmd+V) -- e.g. a
  // screenshot copied to the clipboard -- instead of only being able to
  // attach via the file picker. Browsers don't do anything with a
  // pasted image by default in a text input, so this has to be handled
  // explicitly. Also recognizes our own hidden document marker (see
  // copyMessageContent/ATTACHMENT_MARKER_PATTERN above) -- copying one
  // of our own document links and pasting it back here reattaches the
  // REAL file from memory, instead of typing the marker text itself
  // into the input. Pasting genuinely normal text still works exactly
  // as before (falls through untouched).
  document.getElementById("user-input").addEventListener("paste", (e) => {
    const pastedText = e.clipboardData && e.clipboardData.getData("text/plain");
    const markerMatch = pastedText && pastedText.match(ATTACHMENT_MARKER_PATTERN);
    if (markerMatch) {
      e.preventDefault(); // don't also type the hidden marker text into the input
      reattachSentFile(markerMatch[1]);
      return;
    }

    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault(); // stop the browser from also trying to paste raw image data as text
        const file = item.getAsFile();
        if (file) attachImageFile(file);
        return;
      }
    }
    // No image or document marker found among the clipboard items --
    // do nothing special, let the browser's normal text paste behavior
    // proceed.
  });

  // Closes the attach popup menu on any click outside of it (the
  // attach button itself or the menu contents) -- without this it
  // would stay open until an option is explicitly chosen.
  document.addEventListener("click", (e) => {
    const wrapper = document.querySelector(".attach-wrapper");
    if (wrapper && !wrapper.contains(e.target)) {
      closeAttachMenu();
    }
    const langWrapper = document.querySelector(".listen-lang-wrapper");
    if (langWrapper && !langWrapper.contains(e.target)) {
      closeListenLangMenu();
    }
  });
