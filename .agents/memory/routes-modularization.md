---
name: server/routes modularization
description: How the API routes are split under server/routes/ and two load-bearing gotchas
---

# server/routes/ modular structure

The former monolithic `server/routes.ts` is split into `server/routes/`:
`index.ts` (orchestrator, exports `registerRoutes`), `shared.ts` (middleware/helpers/
multer/validators + `daysInMonth`), `startup-migrations.ts`, and ~20 per-domain files.

## Gotcha 1: registration order in index.ts is load-bearing
`registerRoutes()` in `index.ts` calls the domain register functions in the SAME order
as the original monolith. Express matches routes in registration order, so reordering
can change which handler wins for overlapping/parametric paths (and middleware order).
**Why:** the split was done as a pure refactor with a hard zero-behavior-change
constraint; order preserves Express matching precedence.
**How to apply:** when adding a new domain module, insert its `registerXRoutes(app)`
call at the position matching where those routes lived originally, not just at the end.

## Gotcha 2: `queueService` is intentionally NOT imported in automation routes
`server/routes/automation-routes.ts` references `queueService` but never imports it
(it IS exported from `server/queue-service.ts`). This is a PRE-EXISTING latent bug —
the original `routes.ts` also lacked the import, so those two automation handlers throw
ReferenceError at runtime today.
**Why:** preserved as-is during the modularization to honor zero-behavior-change.
**How to apply:** if you intend to actually fix it, add
`import { queueService } from "../queue-service";` — but treat that as a deliberate
behavior change (broken route starts working), not part of a refactor.
