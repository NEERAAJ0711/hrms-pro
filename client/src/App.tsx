import { useEffect, lazy, Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ErrorBoundary } from "@/components/error-boundary";
import { ModuleGate } from "@/components/module-gate";
import WebsiteLayout from "@/pages/website/website-layout";
import NotFound from "@/pages/not-found";

// Route pages are lazy-loaded so the initial bundle only contains the shell.
// Each page becomes its own chunk fetched on demand when the route is visited.
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Companies = lazy(() => import("@/pages/companies"));
const CompanyContractorsPage = lazy(() => import("@/pages/company-contractors"));
const Employees = lazy(() => import("@/pages/employees"));
const AddEmployee = lazy(() => import("@/pages/add-employee"));
const Users = lazy(() => import("@/pages/users"));
const LoginPage = lazy(() => import("@/pages/login"));
const SignupPage = lazy(() => import("@/pages/signup"));
const AttendancePage = lazy(() => import("@/pages/attendance"));
const LeavePage = lazy(() => import("@/pages/leave"));
const LoanAdvancesPage = lazy(() => import("@/pages/loan-advances"));
const PayrollPage = lazy(() => import("@/pages/payroll"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const BiometricPage = lazy(() => import("@/pages/biometric"));
const BiometricDeviceUsersPage = lazy(() => import("@/pages/biometric-device-users"));
const JobPostingsPage = lazy(() => import("@/pages/job-postings"));
const JobApplicationsPage = lazy(() => import("@/pages/job-applications"));
const MyProfilePage = lazy(() => import("@/pages/my-profile"));
const MyAttendancePage = lazy(() => import("@/pages/my-attendance"));
const ProfileRequestsPage = lazy(() => import("@/pages/profile-requests"));
const MyAccessRequestsPage = lazy(() => import("@/pages/my-access-requests"));
const AccessRequestsPage = lazy(() => import("@/pages/access-requests"));
const CompliancesPage = lazy(() => import("@/pages/compliances"));
const BillingPage = lazy(() => import("@/pages/billing"));
const KraKpiPage = lazy(() => import("@/pages/kra-kpi"));
const EpfoPage = lazy(() => import("@/pages/epfo"));
const EsicPage = lazy(() => import("@/pages/esic"));
const LiveViewPage = lazy(() => import("@/pages/live-view"));
const ComplianceCalendarPage = lazy(() => import("@/pages/compliance-calendar"));
const AutomationJobsPage = lazy(() => import("@/pages/automation-jobs"));
const ComplianceAutomationPage = lazy(() => import("@/pages/compliance-automation"));
const MobilePreview = lazy(() => import("@/pages/mobile-preview"));
const AiAssistantPage = lazy(() => import("@/pages/ai-assistant"));
const AiHrDashboard = lazy(() => import("@/pages/ai-hr-dashboard"));
const WorkforceIntelligencePage = lazy(() => import("@/pages/workforce-intelligence"));
const HomePage = lazy(() => import("@/pages/website/home-page"));
const ServicesPage = lazy(() => import("@/pages/website/services-page"));
const CompliancePage = lazy(() => import("@/pages/website/compliance-page"));
const DirectorsPage = lazy(() => import("@/pages/website/directors-page"));
const ContactPage = lazy(() => import("@/pages/website/contact-page"));
import { Loader2 } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { TrialExpiredWall } from "@/components/trial-expired-wall";
import { TrialBanner } from "@/components/trial-banner";

function PageLoader() {
  return (
    <div className="h-full w-full flex items-center justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function RedirectToDashboard() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/dashboard");
  }, [setLocation]);
  return null;
}

function RedirectToPayroll() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/payroll");
  }, [setLocation]);
  return null;
}

function RedirectToSettings() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/settings");
  }, [setLocation]);
  return null;
}

function DashboardRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/dashboard");
  }, [setLocation]);
  return (
    <div className="h-screen w-full flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function EmployeeHomePage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const shouldRedirect = user?.role === "employee" && !user?.companyId;
  useEffect(() => {
    if (shouldRedirect) {
      setLocation("/job-applications");
    }
  }, [shouldRedirect, setLocation]);
  if (shouldRedirect) {
    return null;
  }
  return <Dashboard />;
}

function ProtectedRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Switch>
      <Route path="/dashboard" component={EmployeeHomePage} />
      <Route path="/companies" component={Companies} />
      <Route path="/companies/:id/contractors" component={CompanyContractorsPage} />
      <Route path="/employees" component={Employees} />
      <Route path="/employees/new" component={AddEmployee} />
      <Route path="/employees/:id/edit" component={AddEmployee} />
      <Route path="/users" component={Users} />
      <Route path="/attendance" component={AttendancePage} />
      <Route path="/my-attendance" component={MyAttendancePage} />
      <Route path="/leave" component={LeavePage} />
      <Route path="/loan-advances" component={LoanAdvancesPage} />
      <Route path="/payroll">
        <ModuleGate module="payroll"><PayrollPage /></ModuleGate>
      </Route>
      <Route path="/fnf-settlement" component={RedirectToPayroll} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/holidays" component={RedirectToSettings} />
      <Route path="/biometric" component={BiometricPage} />
      <Route path="/biometric/devices/:deviceId/users" component={BiometricDeviceUsersPage} />
      <Route path="/job-postings" component={JobPostingsPage} />
      <Route path="/job-applications" component={JobApplicationsPage} />
      <Route path="/my-profile" component={MyProfilePage} />
      <Route path="/profile-requests" component={ProfileRequestsPage} />
      <Route path="/my-access-requests" component={MyAccessRequestsPage} />
      <Route path="/access-requests" component={AccessRequestsPage} />
      <Route path="/compliances" component={CompliancesPage} />
      <Route path="/compliance-automation" component={ComplianceAutomationPage} />
      <Route path="/epfo" component={EpfoPage} />
      <Route path="/esic" component={EsicPage} />
      <Route path="/live-view" component={LiveViewPage} />
      <Route path="/compliance-calendar" component={ComplianceCalendarPage} />
      <Route path="/automation-jobs" component={AutomationJobsPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/kra-kpi" component={KraKpiPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/ai-assistant" component={AiAssistantPage} />
      <Route path="/ai-hr-dashboard" component={AiHrDashboard} />
      <Route path="/workforce-intelligence" component={WorkforceIntelligencePage} />
      <Route path="/login" component={RedirectToDashboard} />
      <Route path="/signup" component={RedirectToDashboard} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function PublicRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/services">
        <WebsiteLayout><ServicesPage /></WebsiteLayout>
      </Route>
      <Route path="/compliance">
        <WebsiteLayout><CompliancePage /></WebsiteLayout>
      </Route>
      <Route path="/directors">
        <WebsiteLayout><DirectorsPage /></WebsiteLayout>
      </Route>
      <Route path="/contact">
        <WebsiteLayout><ContactPage /></WebsiteLayout>
      </Route>
      <Route path="/">
        <WebsiteLayout><HomePage /></WebsiteLayout>
      </Route>
      <Route>
        <WebsiteLayout><HomePage /></WebsiteLayout>
      </Route>
    </Switch>
    </Suspense>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location] = useLocation();
  
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  // Mobile preview is always public — has its own JWT auth
  if (location === "/mobile" || location.startsWith("/mobile/")) {
    return (
      <Suspense fallback={<PageLoader />}>
        <MobilePreview />
      </Suspense>
    );
  }

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PublicRouter />;
  }

  // Show trial expired wall for company admins whose trial has ended
  if (user?.trialExpired && user.role === "company_admin") {
    return <TrialExpiredWall />;
  }

  const publicPages = ["/services", "/compliance", "/directors", "/contact"];
  const isPublicPage = publicPages.includes(location);

  if (location === "/") {
    return <DashboardRedirect />;
  }

  if (isPublicPage) {
    return <PublicRouter />;
  }

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <TrialBanner />
            <div className="flex items-center justify-between px-4 py-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-1">
                <NotificationBell />
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <ProtectedRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="hrms-ui-theme">
        <TooltipProvider>
          <ErrorBoundary>
            <AuthProvider>
              <AppContent />
            </AuthProvider>
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
