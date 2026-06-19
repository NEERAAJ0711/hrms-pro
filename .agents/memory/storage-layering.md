---
name: Storage layering (interfaces / repositories / facade)
description: How the IStorage god-interface and DatabaseStorage god-class were split into domain interfaces + per-domain repositories with a delegating facade, and the gotchas.
---

# Storage layering pattern (Task #5)

The backend storage was one god-interface (`IStorage`) + one god-class
(`DatabaseStorage`). It was decomposed in layers, all behavior-neutral:

- **Interfaces**: `server/storage-interfaces.ts` holds 13 per-domain interfaces
  (IUser/ICompany/IEmployee/IDashboard/IAttendance/ILeave/IPayroll/ISettings/
  ICompliance/IRecruitment/IBiometric/IKra/IAuditStorage); `IStorage extends` all.
  `server/storage.ts` re-exports them so existing `import { IStorage } from "./storage"`
  keeps working. There is NO INotificationStorage — notifications live outside IStorage.
- **Repositories**: `server/repositories/<domain>-repository.ts` hold the actual
  Drizzle queries moved verbatim from DatabaseStorage. `DatabaseStorage` is now a
  thin delegating facade (`this.<domain>Repo.method(...)`). The `storage` singleton
  surface is unchanged → routes untouched → zero behavior change.
- **Services**: `server/services/` is the business-logic seam wrapping repositories.
  Only the Notification slice is fully wired end-to-end so far (route → service →
  repo → db); other domains' route handlers still call `storage.*` directly.

**Why facade, not big-bang**: ~30 files import `db` directly and routes are ~7.6k
lines. Rewiring every handler at once is unsafe. The facade keeps the public surface
identical while physically relocating queries, so the risky handler-level migration
can happen incrementally.

## Gotchas when mechanically splitting a class by brace-counting
- `getAllCompOff` exists on DatabaseStorage but is NOT declared in any interface —
  an extra public method. A name→domain map built from interfaces will miss it; it
  needs a manual override (mapped to Leave). Do not add it to ILeaveStorage or you
  change the IStorage surface.
- Several methods have **inline object types in the return signature**, e.g.
  `Promise<(CompanyContractor & { contractorName: string })[]>`. A naive "first `{`
  after the params" finder grabs the brace inside the return type and corrupts the
  split. The body-open brace must be found with depth-aware scanning over `< ( [ {`
  (the body `{` is the first one seen at depth 0).
- Safe preconditions verified before splitting: DatabaseStorage had ZERO `this.`
  cross-method calls and all method signatures were single-line.
- `noUnusedLocals` is OFF in this project, so copying the full import header into
  every repo file is safe (unused imports don't error).

**How to apply**: when migrating more handlers to services, keep `storage.*`/repo
queries verbatim, preserve exact response shapes, and verify tsc error count stays
at the 295 baseline plus a clean boot + endpoint smoke test.
