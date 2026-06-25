---
name: Tenant isolation on company-scoped routes
description: requireRole alone does not enforce tenant ownership on /api/companies/:id/* mutation endpoints
---

Rule: on every `/api/companies/:id/...` mutation endpoint, a non-super_admin
caller must be checked against the path param:
`if (user.role !== "super_admin" && user.companyId !== req.params.id) return 403`.

**Why:** `requireRole("company_admin", ...)` only checks the role, NOT which
company the admin belongs to. Without the ownership check, any company admin can
create/delete/modify data for an arbitrary company by changing the `:id` in the
URL (broken access control). This was found by code review on the contractor
create/delete and employee tag/untag endpoints.

**How to apply:** add the guard at the top of each handler's try block for any
company-scoped create/update/delete route. For approval-style routes the
"owner" may be a different party (e.g. contractor company approves the request),
so identify which side is authorized before copying the guard blindly.
