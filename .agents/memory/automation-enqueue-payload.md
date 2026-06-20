---
name: Automation register job payloads
description: EPFO/ESIC register jobs must carry the full employee payload at enqueue time; bulk uses {employees:[...]}
---

# EPFO/ESIC registration job payloads

The automation queue worker does **no** employee hydration when it dispatches a
job — whatever `job.payload` is at enqueue time is exactly what reaches the
form-fillers (`uanGenerate` / `ipNumberGenerate`). So all employee data the
portal forms need must be assembled at enqueue time in the route layer.

**Rule:** single register endpoints enqueue a full mapped employee payload
(use `buildRegistrationPayload(emp)` in `server/epfo-esic-routes.ts`), not just
`{ employeeId }`. Bulk register endpoints must enqueue
`{ employees: [...] }` (an array of those same mapped payloads), NOT
`{ employeeIds }` — the dispatch fan-out (`getBulkRegisterJobs` and the
`esic_bulk_register` case in `queue-worker.ts`) reads `payload.employees`.

**Why:** a long-standing bug had single register passing only `{ employeeId }`
(so name/dob/etc. never reached the form) and bulk passing `{ employeeIds }`
against a worker that expected `{ employees }` (so bulk never ran). Fixed when
threading the new statutory fields through filings.

**How to apply:** when adding any new employee field to EPFO/ESIC filings, add
it to `buildRegistrationPayload` and to the corresponding service field map /
selector block — do not try to fetch it inside the worker. Keep blank values as
`undefined` and wrap each portal fill in `.catch` so missing portal fields are
skipped gracefully.
