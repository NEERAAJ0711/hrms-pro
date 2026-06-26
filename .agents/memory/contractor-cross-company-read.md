---
name: Contractor cross-company employee read
description: When and how a principal employer may view (not edit) a contractor company's tagged employees.
---

A principal employer's company admin may READ an employee that belongs to a different
(contractor) company, but ONLY when that employee is tagged to one of the principal's
**approved** contractor relationships (`contractorEmployees` JOIN `companyContractors`
where `companyContractors.companyId = viewer.companyId AND status = 'approved'`).

**Why:** The contractor-labour feature tags a contractor company's employees to the
principal for compliance visibility. Without a scoped cross-tenant read, the edit form
loaded blank (GET returned 403) and showed the viewer's own company name. The read must
stay scoped to the viewer's own contractor linkage — never arbitrary cross-company access.

**How to apply:**
- GET /api/employees/:id returns the record plus `companyName` + `isContractorEmployee:true`
  for such cross-company reads so the UI can show the correct owning company.
- WRITE stays blocked: PATCH/DELETE still 403 cross-tenant. The edit form is view-only for
  contractor employees (banner shown, submit hidden, onSubmit hard-stops). Editing another
  company's employee records is not allowed.
