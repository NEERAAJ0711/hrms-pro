---
name: Mobile login "wrong id & pwd" while web works
description: Why Flutter mobile login can fail with valid creds that work on web
---

# Mobile login fails but web works (same creds)

**Symptom:** User logs in fine on the web app but gets "wrong id & pwd" in the Flutter APK with the same username/password.

**Root cause:** Server username lookup is **case-sensitive** (`eq(users.username, username)` in user-repository) and both `/api/auth/login` (web) and `/api/mobile/auth/login` (mobile) compare plaintext password. The mobile login TextField had no keyboard hardening, so the Android soft keyboard **auto-capitalizes the first letter and autocorrects** the typed username → a different string reaches the server → 401. Desktop browsers don't autocorrect, so web works.

Compounding: Flutter `auth_provider.login` catch block defaults `_error = 'Invalid username or password'` for ANY failure (network/404/parse/null-token), so non-credential failures also surface as "wrong id & pwd" — don't trust that message alone; verify the endpoint with curl first.

**Fix:** On username (and any case-sensitive) TextFormField set `autocorrect:false`, `enableSuggestions:false`, `textCapitalization:TextCapitalization.none`, `keyboardType:TextInputType.visiblePassword`. Username is already `.trim()`-ed before send (handles trailing space from autocomplete).

**How to apply / diagnose:** First curl prod `https://tbjvisionconnect.com/api/mobile/auth/login` vs `/api/auth/login` — if both return JSON 401 the route is fine and the bug is input-side, not deploy-side. Code fix needs a fresh APK build; immediate workaround = type username exact-case (usually lowercase). Signup screen username field has the same pattern — harden it too if reported.
