import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AccessDenied } from "@/components/access-denied";
import type { User } from "@shared/schema";

type UserRole = User["role"];

const MODULE_ACCESS: Record<string, UserRole[]> = {
  dashboard: ["super_admin", "company_admin", "hr_admin", "recruiter", "manager", "employee"],
  companies: ["super_admin", "company_admin"],
  users: ["super_admin", "company_admin"],
  employees: ["super_admin", "company_admin", "hr_admin", "manager"],
  attendance: ["super_admin", "company_admin", "hr_admin", "manager"],
  my_attendance: ["employee"],
  leave: ["super_admin", "company_admin", "hr_admin", "manager", "employee"],
  loan_advances: ["super_admin", "company_admin", "hr_admin", "manager", "employee"],
  payroll: ["super_admin", "company_admin", "hr_admin"],
  reports: ["super_admin", "company_admin", "hr_admin"],
  biometric: ["super_admin", "company_admin"],
  job_postings: ["super_admin", "company_admin", "hr_admin", "recruiter"],
  job_applications: ["super_admin", "company_admin", "hr_admin", "recruiter", "employee"],
  my_profile: ["employee"],
  profile_requests: ["super_admin", "company_admin", "hr_admin"],
  compliances: ["super_admin", "company_admin", "hr_admin"],
  billing: ["super_admin", "company_admin"],
  settings: ["super_admin", "company_admin"],
  my_access_requests: ["super_admin", "company_admin", "hr_admin", "recruiter", "manager", "employee"],
  access_requests: ["super_admin", "company_admin"],
};

const SIDEBAR_TO_PERM_KEY: Record<string, string> = {
  job_postings:      "recruitment",
  job_applications:  "recruitment",
  my_profile:        "profile",
};

export function ModuleGate({ module, children }: { module: string; children: React.ReactNode }) {
  const { user } = useAuth();
  const isPrivileged = user?.role === "super_admin" || user?.role === "company_admin";

  const { data: userPermissions = [], isLoading } = useQuery<{ module: string; canAccess: boolean }[]>({
    queryKey: ["/api/users", user?.id, "permissions"],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/users/${user.id}/permissions`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id && !isPrivileged,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  if (!user) return null;

  if (isPrivileged) {
    const allowed = MODULE_ACCESS[module]?.includes(user.role) ?? false;
    return allowed ? <>{children}</> : <AccessDenied module={module} />;
  }

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const permKey = SIDEBAR_TO_PERM_KEY[module] ?? module;
  const override = userPermissions.find(p => p.module === permKey);
  const hasOverride = override !== undefined;
  const allowed = hasOverride
    ? override!.canAccess
    : (MODULE_ACCESS[module]?.includes(user.role) ?? false);

  if (!allowed) return <AccessDenied module={module} />;
  return <>{children}</>;
}
