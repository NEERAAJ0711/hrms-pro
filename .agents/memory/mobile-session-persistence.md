---
name: Mobile keep-login / session persistence
description: Why the Flutter app logged users out on every app close, and the rules that keep a session alive across restarts.
---

# Mobile keep-login (Flutter)

Symptom: app logs the user out every time it is closed and reopened, even though
JWT access token is 7d and refresh is 30d (server TTLs in `server/jwt-auth.ts`).
So expiry is NOT the cause — the bug is always client-side persistence.

## Rules (apply to `flutter_app/lib/core/auth_provider.dart` + `api_client.dart`)
1. **Never wipe tokens on a generic error.** The startup auth check must only log
   out on a *genuine* auth failure. Detect it by re-reading the access token after
   the failed `/me` call: the 401 interceptor clears tokens when the refresh token
   is also dead, so `getAccessToken()==null` ⇒ real logout; otherwise (offline /
   timeout / server down) keep the session.
   **Why:** the original `_checkAuth` did `catch { clearTokens() }`, so any transient
   network/storage blip at launch destroyed a perfectly valid session.
2. **Cache the user profile locally** (`user_data` key) and restore it optimistically
   on launch so the app opens straight to home and survives offline starts. Refresh
   it from `/me` in the background. Clear it in `clearTokens()`.
3. **Configure secure storage for reliable persistence:**
   `AndroidOptions(encryptedSharedPreferences: true)` + `IOSOptions(accessibility:
   first_unlock)`. Default options are less reliable across app kills on Android.
   **Caveat:** flipping `encryptedSharedPreferences` changes the Android backend, so
   tokens stored under the old backend are unreadable → users must log in once more
   after the update (one-time).
4. **Guard storage reads** (`getAccessToken`/`getUserData` wrap `read` in try/catch
   returning null) — keystore decrypt can throw on some devices after an app kill.
5. **Refresh-queue completers must always complete.** When `_isRefreshing`, queued
   requests await a `Completer`; on refresh failure complete them with an error
   (`_failPendingWaiters`) instead of clearing the list, or waiters hang forever.

**How to apply:** any future "stays logged out" / "keep me signed in" mobile report —
check these five points before touching server auth. Server side is fine as long as
`JWT_SECRET` is set on the VPS (see jwt-secret-handling.md).
