import { 
  Building2, 
  Users, 
  UserCircle, 
  LayoutDashboard,
  Calendar,
  CalendarDays,
  Clock,
  FileText,
  Settings,
  ChevronUp,
  LogOut,
  BarChart3,
  Fingerprint,
  Briefcase,
  ClipboardList,
  ClipboardCheck,
  UserCog,
  Wallet,
  ShieldCheck,
  ShieldQuestion,
  CreditCard,
  Target,
  Bot,
  Brain,
  Activity,
  CalendarCheck,
} from "lucide-react";
import { useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
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
  kra_kpi: ["super_admin", "company_admin", "hr_admin", "manager", "employee"],
  compliance_automation: ["super_admin", "company_admin", "hr_admin"],
  epfo_automation: ["super_admin", "company_admin", "hr_admin"],
  esic_automation: ["super_admin", "company_admin", "hr_admin"],
  compliance_calendar: ["super_admin", "company_admin", "hr_admin"],
  automation_jobs: ["super_admin", "company_admin", "hr_admin"],
  ai_assistant: ["employee", "manager"],
  ai_hr_dashboard: ["super_admin", "company_admin", "hr_admin"],
  workforce_intelligence: ["super_admin", "company_admin", "hr_admin", "manager"],
};

const REQUIRES_COMPANY: string[] = [
  "dashboard", "attendance", "leave", "loan_advances", "payroll",
  "reports", "biometric", "employees", "job_postings", "settings", "users", "companies"
];

// Modules that are intrinsic to the Employee role's self-service experience.
// These are always visible/usable for employees regardless of any explicit
// deny rows in `user_permissions` — admins cannot revoke an employee's
// ability to see their own attendance, profile, leave, etc.
const EMPLOYEE_SELF_SERVICE: Set<string> = new Set([
  "dashboard",
  "my_attendance",
  "my_profile",
  "my_access_requests",
  "leave",
  "loan_advances",
  "job_applications",
  "ai_assistant",
]);

const hasModuleAccess = (module: string, userRole: UserRole | undefined, hasCompany: boolean): boolean => {
  if (!userRole) return false;
  if (userRole === "employee" && !hasCompany && REQUIRES_COMPANY.includes(module)) return false;
  const allowedRoles = MODULE_ACCESS[module];
  return allowedRoles ? allowedRoles.includes(userRole) : false;
};

const mainMenuItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    module: "dashboard",
  },
  {
    title: "Companies",
    url: "/companies",
    icon: Building2,
    module: "companies",
  },
  {
    title: "Credits & Billing",
    url: "/billing",
    icon: CreditCard,
    module: "billing",
  },
  {
    title: "Employees",
    url: "/employees",
    icon: Users,
    module: "employees",
  },
  {
    title: "Users",
    url: "/users",
    icon: UserCircle,
    module: "users",
  },
];

const hrModulesItems = [
  {
    title: "Attendance",
    url: "/attendance",
    icon: Clock,
    module: "attendance",
  },
  {
    title: "My Attendance",
    url: "/my-attendance",
    icon: CalendarDays,
    module: "my_attendance",
  },
  {
    title: "My Leave",
    adminTitle: "Leave",
    url: "/leave",
    icon: Calendar,
    module: "leave",
  },
  {
    title: "My Finance",
    adminTitle: "Loan & Advances",
    url: "/loan-advances",
    icon: Wallet,
    module: "loan_advances",
  },
  {
    title: "Payroll",
    url: "/payroll",
    icon: FileText,
    module: "payroll",
  },
  {
    title: "Reports",
    url: "/reports",
    icon: BarChart3,
    module: "reports",
  },
  {
    title: "Compliances",
    url: "/compliances",
    icon: ShieldCheck,
    module: "compliances",
  },
  {
    title: "Biometric",
    url: "/biometric",
    icon: Fingerprint,
    module: "biometric",
  },
  {
    title: "Job Postings",
    url: "/job-postings",
    icon: Briefcase,
    module: "job_postings",
  },
  {
    title: "My Jobs",
    adminTitle: "Job Applications",
    url: "/job-applications",
    icon: ClipboardList,
    module: "job_applications",
  },
  {
    title: "My Profile",
    url: "/my-profile",
    icon: UserCog,
    module: "my_profile",
  },
  {
    title: "Profile Requests",
    url: "/profile-requests",
    icon: ClipboardCheck,
    module: "profile_requests",
  },
  {
    title: "My Access Requests",
    url: "/my-access-requests",
    icon: ShieldQuestion,
    module: "my_access_requests",
  },
  {
    title: "Access Requests",
    url: "/access-requests",
    icon: ShieldCheck,
    module: "access_requests",
  },
  {
    title: "KRA & KPIs",
    url: "/kra-kpi",
    icon: Target,
    module: "kra_kpi",
  },
  {
    title: "Compliance & Automation",
    url: "/compliance-automation",
    icon: ShieldCheck,
    module: "compliance_automation",
  },
  {
    title: "AI Assistant",
    url: "/ai-assistant",
    icon: Bot,
    module: "ai_assistant",
  },
  {
    title: "AI HR Dashboard",
    url: "/ai-hr-dashboard",
    icon: Bot,
    module: "ai_hr_dashboard",
  },
  {
    title: "Workforce Intelligence",
    url: "/workforce-intelligence",
    icon: Brain,
    module: "workforce_intelligence",
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    module: "settings",
  },
];

const SIDEBAR_TO_PERM_KEY: Record<string, string> = {
  job_postings:      "recruitment",
  job_applications:  "recruitment",
  my_profile:        "profile",
};

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const isPrivileged = user?.role === "super_admin" || user?.role === "company_admin";

  const { data: userPermissions = [] } = useQuery<{ module: string; canAccess: boolean }[]>({
    queryKey: ["/api/users", user?.id, "permissions"],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/users/${user.id}/permissions`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.id && !isPrivileged,
    // Keep the sidebar in lock-step with the latest revoke/grant — staleness
    // here directly causes "I revoked it but the module still shows" bugs.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const permOverrides: Record<string, boolean> = {};
  for (const p of userPermissions) {
    permOverrides[p.module] = p.canAccess;
  }

  const hasCompanyEarly = !!user?.companyId;

  const checkAccess = (module: string): boolean => {
    if (isPrivileged) return hasModuleAccess(module, user?.role, hasCompanyEarly);
    // Employees always see their own self-service modules. These can't be
    // revoked by an admin — stale `user_permissions` deny rows for these
    // keys (e.g. left over from earlier admin testing) must not hide them.
    if (user?.role === "employee" && EMPLOYEE_SELF_SERVICE.has(module)) {
      return hasModuleAccess(module, user?.role, hasCompanyEarly);
    }
    const permKey = SIDEBAR_TO_PERM_KEY[module] ?? module;
    // Any granted action under this module surfaces the entry in the sidebar,
    // even if a stale module-level deny row exists (e.g. from a previous
    // "Full module" revoke that was later followed by per-action approvals).
    // The revoke flow already flips matching `module:*` rows to deny, so a
    // surviving action allow can only come from a fresh post-revoke approval.
    const prefix = `${permKey}:`;
    for (const p of userPermissions) {
      if (p.module.startsWith(prefix) && p.canAccess) return true;
    }
    // Otherwise honour an explicit module-level override.
    if (permKey in permOverrides) return permOverrides[permKey];
    return hasModuleAccess(module, user?.role, hasCompanyEarly);
  };

  const handleNavigation = (url: string) => {
    setLocation(url);
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "Signed out",
        description: "You have been successfully logged out.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const userInitials = user 
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || user.username.substring(0, 2).toUpperCase()
    : 'U';
  
  const displayName = user 
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username
    : 'User';

  const hasCompany = !!user?.companyId;
  const isEmployeeView = user?.role === "employee";
  const resolveTitle = (item: { title: string; adminTitle?: string }) =>
    !isEmployeeView && item.adminTitle ? item.adminTitle : item.title;
  const filteredMainMenu = mainMenuItems.filter(item => checkAccess(item.module));
  const filteredHrModules = hrModulesItems.filter(item => checkAccess(item.module));

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sidebar-primary flex-shrink-0">
            <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-base font-semibold text-sidebar-foreground truncate">
              {user?.companyName || (user?.role === "super_admin" ? "HRMS Pro" : "HRMS Pro")}
            </span>
            <span className="text-xs text-sidebar-foreground/60 truncate">
              {user?.companyName ? "HRMS Pro" : "Multi-Company Platform"}
            </span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        {filteredMainMenu.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
              Main Menu
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredMainMenu.map((item) => {
                  const label = resolveTitle(item);
                  return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      isActive={location === item.url}
                      onClick={() => handleNavigation(item.url)}
                      data-testid={`nav-${label.toLowerCase()}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );})}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredHrModules.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
              HR Modules
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredHrModules.map((item) => {
                  const label = resolveTitle(item);
                  return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      isActive={location === item.url}
                      onClick={() => handleNavigation(item.url)}
                      data-testid={`nav-${label.toLowerCase().replace(' ', '-')}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );})}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="flex items-center gap-2 w-full p-2 rounded-md hover-elevate text-sidebar-foreground"
                data-testid="button-user-menu"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col flex-1 text-left min-w-0">
                  <span className="text-sm font-medium truncate">{displayName}</span>
                  <span className="text-xs text-sidebar-foreground/60 truncate">
                    {user?.companyName || user?.email}
                  </span>
                </div>
                <ChevronUp className="h-4 w-4 flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              className="w-64"
            >
              <div className="px-3 py-2 border-b">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                {user?.companyName && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    <span className="font-medium text-foreground">{user.companyName}</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground capitalize mt-0.5">
                  Role: <span className="font-medium text-foreground">{user?.role?.replace(/_/g, ' ')}</span>
                </p>
              </div>
              <DropdownMenuItem 
                onClick={handleLogout}
                data-testid="menu-item-logout"
                className="mt-1"
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
