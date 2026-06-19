---
name: Storage layering (interfaces / repositories / services / facade)
description: Durable pattern + pitfalls for the layered storage decomposition (domain interfaces, per-domain repositories, per-domain services, delegating facade) used by the HRMS backend.
---

# Storage layering pattern

The backend storage was one god-interface (`IStorage`) + one god-class
(`DatabaseStorage`). It is decomposed into behavior-neutral layers:

- **Interfaces** — per-domain storage interfaces; `IStorage extends` all of them,
  re-exported from `storage.ts` so existing imports keep working.
  `INotificationStorage` is **standalone** (NOT part of composite `IStorage`),
  because notification queries were never on DatabaseStorage.
- **Repositories** — own ALL Drizzle/`db` access. `DatabaseStorage` is now a thin
  delegating facade, kept for non-route callers (seed, notification utility).
- **Services** — the only layer routes may call. Each wraps its repository and
  delegates. Routes do `validate → service → return`; routes never touch `db`.

**Why facade + service seam, not a big-bang logic move**: many files import `db`
directly and routes are thousands of lines. The facade keeps the public surface
identical while relocating queries; the service seam lets handler logic migrate
incrementally without changing response shapes.

**Scope boundary**: infra DDL (startup migrations) legitimately uses `db`
directly — it is not domain data access. A domain that is out of a layering
task's scope (e.g. billing) may keep direct `db` until its own task; document it
as drift rather than half-migrating it.

## Pitfalls when mechanically splitting / rewiring
- **Generated service wrappers must re-import the same `@shared/schema` type
  block the repos use** — copied method signatures reference those types and
  won't compile otherwise.
- **When regex-rewiring `storage.NAME(` → `service.NAME(`, keep the method name**
  (`inst + "." + name`). Dropping it (replacing the whole `storage.NAME(` with
  `inst(`) silently produces a flood of "expression is not callable" errors.
- **Adding a cross-domain service call to a route requires importing that
  service** — the bulk rewire only imports services a file already referenced, so
  a hand-added call (e.g. an auth route now calling employeeService) needs the
  import added manually or you get "Cannot find name".
- **Extra public methods not declared in any interface** (e.g. a compoff getter)
  are missed by a name→domain map built from interfaces; map them manually and do
  NOT add them to the interface (that changes the IStorage surface).
- **Inline object types in return signatures** (e.g.
  `Promise<(X & { y: string })[]>`) break a naive "first `{` after params" body
  finder. Find the body brace with depth-aware scanning over `< ( [ {`.
- **Preconditions that make a class safe to split**: zero `this.`
  cross-method calls and single-line method signatures.
- `noUnusedLocals` is OFF here, so leftover/broad imports don't error.

**How to apply**: keep moved queries verbatim, preserve exact response shapes and
error handling, and verify the tsc error count stays at/below the established
baseline plus a clean boot and endpoint smoke test.
