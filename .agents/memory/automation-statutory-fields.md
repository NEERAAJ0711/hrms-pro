---
name: Government-portal best-effort field fills must be observable
description: Why EPFO/ESIC statutory field fills log per-field outcomes instead of silently swallowing misses
---

# Best-effort portal field fills must report per-field outcome

EPFO `uanGenerate` and ESIC `ipNumberGenerate` fill statutory fields (nominee,
marital status, mother's name, blood group, emergency contact) with best-effort
selectors against live government portals that cannot be inspected from dev.

**Rule:** never fill these with a bare `page.fill(sel, val).catch(() => {})`. Use
the per-service `fillStatutoryField` helper, which logs `filled` / `not-found` /
`fill-failed` / `skipped-no-data` per field and writes a one-line summary object
to `automation_logs`. It auto-detects `<select>` vs text `<input>`.

**Why:** a wrong selector and a successful fill look identical when the miss is
swallowed — the field just never reaches the portal, with no error. The only way
to confirm/correct these selectors is to run against the real portal and read
which fields the job log reports as `not-found`, then fix that selector. Without
the logging there is no signal at all.

**How to apply:** ALL portal fields — core (name, DOB, gender, father's name,
Aadhaar, mobile, DOJ, bank/IFSC, salary, employee code) AND newer statutory
ones — go through `fillStatutoryField`, collected into one `fieldOutcomes`
object and logged as a single summary line per registration run. Do not fill any
portal field with a bare `page.fill(...).catch(() => {})`. Verification of
whether a selector is correct can
ONLY be done by a real-portal run (needs employer creds + CAPTCHA/OTP) — it is
not testable from the dev environment. Selectors are intentionally broad
(id + name + ASP.NET `#ddl*/#txt*` + `[id*=]` variants) to maximize match odds.
