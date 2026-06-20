---
name: JWT secret handling (dev vs prod)
description: How JWT_SECRET is provisioned across Replit dev and the production VPS, and why dev has an ephemeral fallback.
---

# JWT secret handling

There is **no** managed `JWT_SECRET` secret in the Replit workspace, and there should
not be one. All real secrets are provisioned on the **production VPS** by the user.
A `viewEnvVars({type:"secret", keys:["JWT_SECRET"]})` that returns `true` may be
matching a plaintext `[userenv.*]` env var in `.replit`, not a true managed Secret —
verify against the full `viewEnvVars()` secrets list before trusting it.

`server/jwt-auth.ts`:
- `NODE_ENV==="production"` → throws if `JWT_SECRET` unset (no insecure fallback).
- dev (any non-production) → if unset, generates an ephemeral `randomBytes(48)`
  secret per process and logs a warning. Dev mobile tokens die on every restart.

**Why:** the original `JWT_SECRET` was committed in plaintext in `.replit`
`[userenv.development]` (a real exposure). It was removed via `deleteEnvVars`
(development scope) — `.replit` env vars cannot be edited directly; the secrets
tooling owns them. The dev fallback exists so removing the committed value does not
brick the dev server (jwt-auth runs its check at import time, before the entrypoint).

**How to apply:** never re-add a JWT_SECRET (or any real secret) to `.replit`. If dev
needs a stable token across restarts, set a throwaway `JWT_SECRET` env var in the
development scope only — never the production value. Production correctness depends on
`NODE_ENV=production` being set on the VPS; if it is not, the dev fallback would
silently apply, so that env must be guaranteed in the prod start command.

Note: `SESSION_ENCRYPTION_KEY` is still committed in plaintext in `.replit`
`[userenv.shared]` — same class of exposure, not yet addressed.
