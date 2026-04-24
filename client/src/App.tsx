import { useEffect } from "react";
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
import Dashboard from "@/pages/dashboard";
import Companies from "@/pages/companies";
import Employees from "@/pages/employees";
import AddEmployee from "@/pages/add-employee";
import Users from "@/pages/users";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import AttendancePage from "@/pages/attendance";
import LeavePage from "@/pages/leave";
import LoanAdvancesPage from "@/pages/loan-advances";
import PayrollPage from "@/pages/payroll";
import SettingsPage from "@/pages/settings";
import ReportsPage from "@/pages/reports";
import BiometricPage from "@/pages/biometric";
import BiometricDeviceUsersPage from "@/pages/biometric-device-users";
import JobPostingsPage from "@/pages/job-postings";
import JobApplicationsPage from "@/pages/job-applications";
import MyProfilePage from "@/pages/my-profile";
import ProfileRequestsPage from "@/pages/profile-requests";
import CompliancesPage from "@/pages/compliances";
import NotFound from "@/pages/not-found";
import MobilePreview from "@/pages/mobile-preview";
import WebsiteLayout from "@/pages/website/website-layout";
import HomePage from "@/pages/website/home-page";
import ServicesPage from "@/pages/website/services-page";
import CompliancePage from "@/pages/website/compliance-page";
import DirectorsPage from "@/pages/website/directors-page";
import ContactPage from "@/pages/website/contact-page";
import { Loader2 } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";

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
    <Switch>
      <Route path="/dashboard" component={EmployeeHomePage} />
      <Route path="/companies" component={Companies} />
      <Route path="/employees" component={Employees} />
      <Route path="/employees/new" component={AddEmployee} />
      <Route path="/employees/:id/edit" component={AddEmployee} />
      <Route path="/users" component={Users} />
      <Route path="/attendance" component={AttendancePage} />
      <Route path="/leave" component={LeavePage} />
      <Route path="/loan-advances" component={LoanAdvancesPage} />
      <Route path="/payroll" component={PayrollPage} />
      <Route path="/fnf-settlement" component={RedirectToPayroll} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/holidays" component={RedirectToSettings} />
      <Route path="/biometric" component={BiometricPage} />
      <Route path="/biometric/devices/:deviceId/users" component={BiometricDeviceUsersPage} />
      <Route path="/job-postings" component={JobPostingsPage} />
      <Route path="/job-applications" component={JobApplicationsPage} />
      <Route path="/my-profile" component={MyProfilePage} />
      <Route path="/profile-requests" component={ProfileRequestsPage} />
      <Route path="/compliances" component={CompliancesPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/login" component={RedirectToDashboard} />
      <Route path="/signup" component={RedirectToDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicRouter() {
  return (
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
    return <MobilePreview />;
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
          <header className="flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle />
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
          <AuthProvider>
            <AppContent />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
