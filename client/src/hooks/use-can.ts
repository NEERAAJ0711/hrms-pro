import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { permKey } from "@shared/permissions";

// Mirror of server-side role/module table; kept in sync with
// server/routes.ts → MODULE_ACCESS and client app-sidebar.tsx.
const ROLE_MODULE_ACCESS: Record<string, string[]> = {
  companies:   ["super_admin"],
  users:       ["super_admin", "company_admin"],
  employees:   ["super_admin", "company_admin", "hr_admin", "manager"],
  attendance:  ["super_admin", "company_admin", "hr_admin", "manager", "employee"],
  leave:       ["super_admin", "company_admin", "hr_admin", "manager", "employee"],
  payroll:     ["super_admin", "company_admin", "hr_admin"],
  reports:     ["super_admin", "company_admin", "hr_admin"],
  recruitment: ["super_admin", "company_admin", "hr_admin", "recruiter"],
  settings:    ["super_admin", "company_admin"],
  masters:     ["super_admin", "company_admin", "hr_admin"],
};

/**
 * Returns a `can(module, action?)` predicate honoring the same logic as the
 * server's requireAction middleware. Drive UI gating (hiding buttons, etc.)
 * with this hook; the server enforces the same rules independently.
 */
export function useCan() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const { data: perms = [], isLoading } = useQuery<{ module: string; canAccess: boolean }[]>({
    queryKey: ["/api/users", user?.id, "permissions"],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/users/${user.id}/permissions`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id && !isSuperAdmin,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const can = (module: string, action?: string): boolean => {
    if (!user) return false;
    if (user.role === "super_admin") return true;

    const moduleOverride = perms.find(p => p.module === module);
    const actionOverride = action
      ? perms.find(p => p.module === permKey(module, action))
      : undefined;

    // An explicit action-level allow always wins. This handles the case
    // where an earlier full-module revoke wrote `module = deny` and the
    // admin later approved a per-action request — the fresh action grant
    // must authorize. The revoke flow already flips matching `module:*`
    // rows to deny, so a surviving action allow is necessarily post-revoke.
    if (actionOverride?.canAccess === true) return true;

    // For module-level checks, any granted action under this module
    // implies module visibility / read access.
    if (!action) {
      const prefix = `${module}:`;
      if (perms.some(p => p.module.startsWith(prefix) && p.canAccess)) return true;
    }

    // Deny-first for everything else.
    if (moduleOverride?.canAccess === false) return false;
    if (actionOverride?.canAccess === false) return false;
    if (moduleOverride?.canAccess === true) return true;

    return (ROLE_MODULE_ACCESS[module] || []).includes(user.role);
  };

  return { can, isLoading };
}
