---
name: cross-company employee linking
description: How the same person is associated across two companies (On-Roll vs Contractual) and where the rule must be enforced
---

# Cross-company employee linking

The same person (matched by **PAN or Aadhaar**) may exist in **at most two** companies
with different employment details. They can be **On-Roll** (`employmentType="permanent"`)
in only **one** company; any second company must keep them **Contractual**
(`employmentType="contract"`) WITH a `contractorMasterId`. The second record links to the
On-Roll "master" via `employees.masterEmployeeId` (self-ref FK, `onDelete: set null`).

**Why:** business requirement — one master record, one on-roll employer, contractual elsewhere; no UI change was allowed.

**How to apply:** the single source of truth is `server/services/employee-link.ts`
(`resolveCrossCompanyLink`, `findPersonInOtherCompanies`, `backfillMasterLink`). It must be
called before EVERY employee write that can create/change PAN/Aadhaar/employmentType/
contractorMasterId. Currently wired into all four such paths:
- `POST /api/employees` and `PATCH /api/employees/:id` (`employee-routes.ts`)
- bulk upload **and** bulk update loops (`employee-bulk-routes.ts`)
- `POST /api/mobile/employees` (`mobile-routes.ts`)
If you add another employee create/update path, wire it here too.

**Gotchas:**
- Within-company duplicate checks (`validateEmployeeDuplicates`) are SEPARATE and only
  look at the same company; cross-company matching lives in `employee-link.ts`.
- On update, pass `excludeId` (the record's own id) and feed MERGED existing+patch fields,
  or you get false self-matches.
- When a record becomes the on-roll master, backfill re-parents ALL matched records to it.
- **Known limitation:** enforcement is app-level only. There is NO DB partial-unique index
  on permanent PAN/Aadhaar, so concurrent writes could theoretically create two on-roll
  records for one person. A `UNIQUE(pan) WHERE employment_type='permanent'` partial index
  would harden this but risks failing against pre-existing duplicate data — not added.
