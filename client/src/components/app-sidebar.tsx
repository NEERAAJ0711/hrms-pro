import { 
  Building2, 
  Users, 
  UserCircle, 
  LayoutDashboard,
  Calendar,
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
  CreditCard,
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
  attendance: ["super_admin", "company_admin", "hr_admin", "manager", "employee"],
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
};

const REQUIRES_COMPANY: string[] = [
  "dashboard", "attendance", "leave", "loan_advances", "payroll",
  "reports", "biometric", "employees", "job_postings", "settings", "users", "companies"
];

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
    title: "Leave Management",
    url: "/leave",
    icon: Calendar,
    module: "leave",
  },
  {
    title: "Loan & Advance",
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
    title: "Job Applications",
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
    staleTime: 30_000,
  });

  const permOverrides: Record<string, boolean> = {};
  for (const p of userPermissions) {
    permOverrides[p.module] = p.canAccess;
  }

  const hasCompanyEarly = !!user?.companyId;

  const checkAccess = (module: string): boolean => {
    if (isPrivileged) return hasModuleAccess(module, user?.role, hasCompanyEarly);
    const permKey = SIDEBAR_TO_PERM_KEY[module] ?? module;
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
                {filteredMainMenu.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      isActive={location === item.url}
                      onClick={() => handleNavigation(item.url)}
                      data-testid={`nav-${item.title.toLowerCase()}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
                {filteredHrModules.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      isActive={location === item.url}
                      onClick={() => handleNavigation(item.url)}
                      data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
