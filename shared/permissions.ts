// Per-action permission catalog for the module-access system.
//
// Storage model:
//   - A row in `user_permissions` with `module = "<module>"`             → full-module grant ("Select All")
//   - A row with `module = "<module>:<action>"`                          → action-level grant
//
// Permission check semantics (see userHasAction on the server, useCan on
// the client):
//   1. super_admin always passes.
//   2. An explicit full-module allow grants every action.
//   3. An explicit action-level allow grants just that action.
//   4. An explicit full-module deny blocks everything (incl. actions).
//   5. An explicit action-level deny blocks just that action.
//   6. With no overrides, fall back to the role-based MODULE_ACCESS table.

export type ModuleActionDef = { value: string; label: string };

export const MODULE_ACTIONS: Record<string, ModuleActionDef[]> = {
  employees: [
    { value: "view",        label: "View Employees" },
    { value: "create",      label: "Add Employee" },
    { value: "edit",        label: "Edit Employee" },
    { value: "delete",      label: "Delete Employee" },
    { value: "bulk_upload", label: "Bulk Upload" },
  ],
  attendance: [
    { value: "view",        label: "View Attendance" },
    { value: "mark",        label: "Mark Attendance" },
    { value: "edit",        label: "Edit Attendance" },
    { value: "regularize",  label: "Regularize" },
    { value: "bulk_upload", label: "Bulk Upload" },
  ],
  leave: [
    { value: "view",        label: "View Leave" },
    { value: "apply",       label: "Apply for Leave" },
    { value: "approve",     label: "Approve / Reject Leave" },
    { value: "configure",   label: "Configure Policies" },
  ],
  payroll: [
    { value: "view",        label: "View Payroll" },
    { value: "process",     label: "Process Payroll" },
    { value: "mark_paid",   label: "Mark Paid" },
    { value: "bulk_upload", label: "Bulk Upload Salary Structures" },
    { value: "fnf",         label: "Full & Final Settlement" },
  ],
  reports: [
    { value: "view",        label: "View Reports" },
    { value: "export",      label: "Export Reports" },
  ],
  recruitment: [
    { value: "view",                 label: "View Postings" },
    { value: "create_job",           label: "Create Job Posting" },
    { value: "edit_job",             label: "Edit Job Posting" },
    { value: "delete_job",           label: "Delete Job Posting" },
    { value: "review_applications",  label: "Review Applications" },
    { value: "make_offer",           label: "Make Offer" },
  ],
  masters: [
    { value: "view",        label: "View Master Data" },
    { value: "edit",        label: "Edit Master Data" },
  ],
  settings: [
    { value: "view",        label: "View Settings" },
    { value: "edit",        label: "Edit Settings" },
  ],
  users: [
    { value: "view",        label: "View Users" },
    { value: "create",      label: "Create User" },
    { value: "edit",        label: "Edit User" },
    { value: "delete",      label: "Delete User" },
  ],
  kra_kpi: [
    { value: "view",          label: "View KRA & KPIs" },
    { value: "manage_templates", label: "Manage KRA Templates" },
    { value: "assign",        label: "Assign KRA to Employee" },
    { value: "score",         label: "Score / Review KPIs" },
    { value: "self_review",   label: "Self Review (Employee)" },
  ],
};

export function getModuleActions(module: string): ModuleActionDef[] {
  return MODULE_ACTIONS[module] || [];
}

export function actionLabel(module: string, action: string): string {
  const def = (MODULE_ACTIONS[module] || []).find(a => a.value === action);
  return def?.label || action;
}

/**
 * Compose a permission key for storage. `action` is optional; when omitted,
 * the key represents full-module access.
 */
export function permKey(module: string, action?: string | null): string {
  return action ? `${module}:${action}` : module;
}

/**
 * Decompose a stored permission key into its module + optional action.
 */
export function parsePermKey(key: string): { module: string; action?: string } {
  const idx = key.indexOf(":");
  if (idx < 0) return { module: key };
  return { module: key.slice(0, idx), action: key.slice(idx + 1) };
}
