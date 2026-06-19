---
name: Env load ordering vs import-time secret checks
description: Why .env loading must be a first-imported side-effect module, not inline module-body code, when any imported module validates secrets at import time.
---

# Env load ordering vs import-time secret checks

The entrypoint `server/index.ts` loads `.env` into `process.env`. Any module that
reads a secret at top level (module load time) and throws if missing — e.g.
`server/jwt-auth.ts` doing `if (!process.env.JWT_SECRET) throw` — will execute
**before** `index.ts`'s own module-body code, because ES module imports are
hoisted and evaluated (depth-first, in import order) before the importing
module's body runs.

Import chain that bit us: `index.ts -> ./routes -> ./mobile-routes -> ./jwt-auth`.
With the `.env` loader inline in `index.ts`'s body, `jwt-auth` threw at import
time on hosts that supply `JWT_SECRET` only via `.env` (not shell/PM2 env), even
though the `.env` had it.

**Rule:** put the `.env` loader in its own module (`server/load-env.ts`) and make
`import "./load-env";` the FIRST import in the entrypoint. Module evaluation
order follows import order, so the loader runs before routes/jwt-auth are
evaluated.

**Why:** module-body code in the entrypoint runs AFTER all its imports finish
evaluating, so inline env loading is too late for import-time secret checks.

**How to apply:** any time a module validates/reads env at top level AND is
reachable through the import graph, ensure env is populated by a first-imported
side-effect module — never rely on inline loading in the entrypoint body.
Note: `SESSION_SECRET` checked directly in `index.ts` body is safe because it
runs after the loader; only transitively-imported checks (like JWT) are at risk.
