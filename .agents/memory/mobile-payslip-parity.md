---
name: Mobile payslip parity
description: Keeping the Flutter payslip PDF identical to the web Pay Slip report and avoiding payroll field-name drift
---

The Flutter payslip PDF must visually/logically match the web Pay Slip report
(`client/src/lib/reports/use-reports.tsx` → `buildPaySlipPDF`): centered underlined
company header + address, "PaySlip For Month-Year" title, bordered 6-column employee
grid, 4-column Earnings/Deductions table with Gross/Deductions/Net footer,
amount-in-words box, signature box, top-right logo, "system generated" footer.

**Why:** users compare the two side by side; the mobile PDF was a different colorful
"card" design and also read fields that do not exist in the schema, so it showed wrong
/ zero values ("not proper").

**How to apply:**
- The mobile payslip endpoints (`/api/mobile/payslips/:id` and `/:month/:year`) must
  enrich the raw payroll row with employee (uan/pan/bankName/bankAccount/location) and
  company (registeredAddress/city/state/logo/signature) data, and resolve
  customEarnings/customDeductions head IDs to name→amount maps. The queue/worker does
  NO hydration — enrich at the route layer.
- Use the SAME payroll field names as `shared/schema.ts` payroll table:
  `esi` (not esicEmployee), `lwfEmployee` (not lwf), `bonus` (not monthlyBonus),
  `otherAllowances`, `totalEarnings` (gross), `netSalary` (net), `otAmount`/`otHours`,
  `pfEmployee`, `vpfAmount`, `loanDeduction`. The stored payroll row IS the source of
  truth (mirrors the web `hasComponents` path) — do not re-prorate on mobile.
- Money formatting = Indian grouping with 2 decimals (`NumberFormat('#,##,##0.00','en_IN')`);
  amount-in-words uses the Indian lakh/crore system; both ported from the web helpers.
