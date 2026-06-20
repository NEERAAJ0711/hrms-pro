# Security Review — Task #10

Date: 2026-06-20

This document records the error-handling, logging, and security work and the
verification of each security checklist item.

## Error handling & logging

- **Frontend error boundary** — `client/src/components/error-boundary.tsx` wraps the
  app in `client/src/App.tsx`. A render-time crash now shows a friendly fallback
  (Try again / Reload) instead of a blank white screen.
- **Per-request correlation IDs** — every request gets an `X-Request-Id`
  (reused from an inbound header when present, otherwise generated). It is echoed
  on the response and included in every `/api` access log, every CSRF-block log,
  and every error log/response (`requestId` field). This lets a single user report
  be traced across the access log and the error log.
- **Centralized error handler** (`server/index.ts`) — logs structured context
  (request id, method, path, status, message; stack on 5xx). In production it
  returns a generic `"Internal Server Error"` for 5xx so internal details/stack
  never leak to clients; 4xx still return their explicit, actionable message.

## Security checklist

### JWT (mobile / API auth) — OK
- `server/jwt-auth.ts` requires `JWT_SECRET` and refuses to start with a hardcoded
  fallback. Access token 7d, refresh token 30d. `requireJwtAuth` verifies the token
  and re-loads the user from storage on every request.
- **Action taken:** the JWT secret was previously committed in the git-tracked
  `.replit` file (`[userenv.development]`). It has been **removed from `.replit`**.
  In production the real `JWT_SECRET` is supplied via the environment (set on the
  VPS); the server still refuses to start without it when `NODE_ENV=production`.
  In development, if `JWT_SECRET` is unset the server boots with an **ephemeral**
  per-process secret (logged as a warning) so dev is not blocked — these dev tokens
  are intentionally invalidated on every restart. Removing the committed value
  invalidates the old mobile tokens — mobile users must log in again (expected).

### Session (web auth) — OK
- `express-session` + `connect-pg-simple` (Postgres store). `SESSION_SECRET` is
  required (no fallback) and is stored as a managed Secret (not in `.replit`).
- Cookie: `httpOnly: true`, `secure: true` in production, `sameSite: "none"` in
  production / `"lax"` in dev, `maxAge` 24h.

### CSRF — hardened
- Previously there was no CSRF protection, and the production session cookie uses
  `sameSite: "none"` (cookies sent on cross-site requests), so cookie-authenticated
  state-changing routes were forgeable.
- Added an OWASP-recommended Origin/Referer check (`server/index.ts`) for
  state-changing methods (POST/PUT/PATCH/DELETE):
  - **Exempt:** safe methods (GET/HEAD/OPTIONS); `Bearer`-token requests (mobile/API
    use JWT, not cookies, so they are not cross-site forgeable); ADMS device paths
    (`/iclock`, `/cdata`, `/getrequest`, `/devicecmd`); requests with no
    Origin/Referer (non-browser clients).
  - **Allowed:** Origin host matching the request host, `X-Forwarded-Host`,
    `REPLIT_DEV_DOMAIN`, or any `REPLIT_DOMAINS` entry.
  - **Blocked:** otherwise → `403 { error, requestId }`, logged under `security`.

### Upload allow-list — OK
- `server/upload-security.ts` enforces a dangerous-extension blocklist plus a
  per-purpose allow-list (documents/images/data/apk). Disk filenames are generated
  server-side (timestamp + random UUID), never derived from user input.

### Download / path traversal — hardened
- `GET /api/esic/contribution-history/file` (`server/epfo-esic-routes.ts`) already
  rejected `..` and `/`. Added `\\` rejection plus a resolved-path containment check
  so the served file must stay inside `uploads/esic-reports`.
- Employee-doc downloads resolve DB-stored UUID filenames (not user input).
  Company-asset deletion is already constrained to the assets dir (`safeUnlinkCompanyAsset`).

### Security headers — added
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-DNS-Prefetch-Control: off`. Frame-blocking headers are intentionally **not** set
  because the app runs inside the Replit preview iframe and embeds the mobile preview.

### RBAC / multi-tenancy — OK (verified, unchanged)
- `server/routes/shared.ts`: `requireAuth`, `requireRole`, `requireModuleAccess`,
  `requireAction`, and `getAllowedEmployeeIdsForUser` enforce role and company
  isolation. Non-super-admins are locked to their own `companyId`.

## Known follow-ups (out of this task's scope)

- **`SESSION_ENCRYPTION_KEY` is also committed in `.replit`** (`[userenv.shared]`).
  It is used by `server/portal-session-service.ts` to encrypt stored EPFO/ESIC portal
  sessions. Rotating it invalidates those stored portal logins, so it was left in
  place and flagged for a dedicated rotation task.
- **Git history** still contains the old secrets. Rotating the values (done for JWT)
  neutralizes them; scrubbing history is a separate, destructive operation.
