---
name: CLRA compliance wage source of truth
description: How CLRA package reports must compute employee wages so they match the screen the user trusts
---

# CLRA report wages must mirror the Compliance Adjustment tab

The **Compliance Adjustment tab** endpoint (`/api/compliance/employees`-style, the screen the
user verifies against) is the single source of truth for an employee's compliance wage rate.
Every CLRA-package report that shows wages (wages-register / Form XIII, ot-register, and any
future one) MUST compute the rate with the **identical** logic, or numbers diverge and the user
sees e.g. ₹355,000 (actual salary) instead of ₹22,426 (compliance wage).

The exact rate logic (replicate verbatim):
- `setupBasic = grade_min_wage ?? compliance setup basic` — wage-grade `minimum_wage` wins.
  Join: `wage_grades wg ON wg.id = COALESCE(cs.wage_grade_id, e.wage_grade_id)`.
- `ssGross = ss.gross_salary (salary_structures, status='active') || setup_gross`.
- `hasCustomAllowances = setup_allowances != null && !same_as_actual`.
- `setupHra = hasCustomAllowances ? setup_allowances : max(0, ssGross - setupBasic)`.
- `setupRateTotal = setupBasic + setupHra`.

Critical SQL details that caused real divergence bugs:
- `salary_structures` join MUST filter `ss.status = 'active'` (a stale inactive structure carried
  the actual high gross).
- Use plain `COALESCE(cs.basic_salary, ss.basic_salary)` — **NOT** `COALESCE(NULLIF(cs.x,0), ...)`.
  With NULLIF, an intentional compliance `0` falls back to the actual salary structure; the
  adjustment tab does not, so they diverged.
- HRA fallback base is **ssGross (actual gross)**, not the compliance `setup_gross` — matching the
  adjustment tab. The compliance figure is enforced via grade_min_wage / custom allowances, not by
  swapping the gross base.

**Why:** reports independently re-implemented the rate and drifted from the trusted screen.
**How to apply:** when touching any compliance wage report, diff its rate block against the
adjustment endpoint; consider extracting a shared helper to stop future drift. Note Form VIII
totals still sum raw payroll (total_earnings/net_salary), not compliance wages — revisit if the
user wants those on compliance basis too.
