import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { format, isAfter, parseISO, startOfMonth, endOfMonth } from "date-fns";
import {
  Building2,
  Users,
  UserCheck,
  Clock,
  CalendarDays,
  TrendingUp,
  Briefcase,
  HardHat,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Banknote,
  Gift,
  Calendar,
  ArrowUpRight,
  Star,
  Activity,
  Timer,
} from "lucide-react";
import type { DashboardStats } from "@shared/schema";

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  color = "primary",
  href,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description?: string;
  trend?: string;
  color?: "primary" | "emerald" | "amber" | "violet" | "rose" | "cyan";
  href?: string;
}) {
  const [, navigate] = useLocation();
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    violet: "bg-violet-500/10 text-violet-600",
    rose: "bg-rose-500/10 text-rose-600",
    cyan: "bg-cyan-500/10 text-cyan-600",
  };
  return (
    <Card
      className={`overflow-hidden transition-all ${href ? "cursor-pointer hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5" : ""}`}
      onClick={href ? () => navigate(href) : undefined}
      data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
            {trend && (
              <div className="flex items-center gap-1 text-emerald-600">
                <TrendingUp className="h-3 w-3" />
                <span className="text-xs font-medium">{trend}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
              <Icon className="h-5 w-5" />
            </div>
            {href && <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────

function AdminDashboard({ stats }: { stats: DashboardStats }) {
  const colors = ["bg-primary", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-cyan-500", "bg-rose-500"];
  const total = stats.departmentDistribution.reduce((s, d) => s + d.count, 0);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isSuperAdmin = user?.role === "super_admin";

  // Contractors page link: company admin goes to their own page; super admin goes to companies list
  const contractorsHref = isSuperAdmin ? "/companies" : user?.companyId ? `/companies/${user.companyId}/contractors` : "/companies";

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 sm:grid-cols-2 ${isSuperAdmin ? "lg:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-5"}`}>
        {isSuperAdmin && (
          <StatCard title="Total Companies" value={stats.totalCompanies} icon={Building2} description="Registered organizations" color="primary" href="/companies" />
        )}
        <StatCard title="Total Employees" value={stats.totalEmployees} icon={Users} description="Across all companies" color="cyan" href="/employees" />
        <StatCard title="Active Employees" value={stats.activeEmployees} icon={UserCheck} description="Currently employed" trend="+12% this month" color="emerald" href="/employees" />
        <StatCard title="System Users" value={stats.totalUsers} icon={Star} description="With system access" color="violet" href="/users" />
        <StatCard title="Contractors" value={stats.totalContractors} icon={HardHat} description="Linked contractor companies" color="amber" href={contractorsHref} />
        <StatCard title="Principal Employers" value={stats.totalPrincipalEmployers} icon={Briefcase} description="Companies acting as principal" color="rose" href={contractorsHref} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Department Distribution */}
        <Card
          className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all hover:-translate-y-0.5"
          onClick={() => navigate("/employees")}
          data-testid="card-department-distribution"
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Department Distribution
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 ml-auto" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.departmentDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No department data available</p>
            ) : (
              <div className="space-y-4">
                {stats.departmentDistribution.map((dept, i) => {
                  const pct = total > 0 ? Math.round((dept.count / total) * 100) : 0;
                  return (
                    <div key={dept.department} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium truncate max-w-[160px]">{dept.department}</span>
                        <span className="text-muted-foreground text-xs">{dept.count} emp · {pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${colors[i % colors.length]} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Employees */}
        <Card data-testid="card-recent-employees">
          <CardHeader className="pb-3">
            <CardTitle
              className="text-base font-semibold flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
              onClick={() => navigate("/employees")}
            >
              <Users className="h-4 w-4 text-primary" />
              Recent Employees
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 ml-auto" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No employees added yet</p>
            ) : (
              <div className="space-y-3">
                {stats.recentEmployees.map((emp) => (
                  <div
                    key={emp.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/employees/${emp.id}/edit`)}
                    data-testid={`row-recent-employee-${emp.id}`}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {emp.firstName[0]}{emp.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{emp.firstName} {emp.lastName}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />{emp.designation || "Not specified"}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">{emp.department || "Unassigned"}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Overview */}
        <Card data-testid="card-quick-overview">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              Quick Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Active Employees", sub: "Currently working", value: stats.activeEmployees, icon: UserCheck, color: "text-emerald-600 bg-emerald-500/10", show: true, href: "/employees" },
              { label: "System Users", sub: "Total accounts", value: stats.totalUsers, icon: Users, color: "text-violet-600 bg-violet-500/10", show: true, href: "/users" },
            ].filter(item => item.show).map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between p-3 rounded-xl bg-muted/40 cursor-pointer hover:bg-muted/70 transition-colors"
                onClick={() => navigate(item.href)}
                data-testid={`overview-row-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${item.color}`}>
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.sub}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold">{item.value}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── EMPLOYEE DASHBOARD ───────────────────────────────────────────────────────

function EmployeeDashboard() {
  const { user } = useAuth();

  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const { data: employeeData } = useQuery<any>({ queryKey: ["/api/employees/me"] });
  const { data: attendance = [] } = useQuery<any[]>({
    queryKey: ["/api/attendance", { startDate: monthStart, endDate: monthEnd }],
    queryFn: async () => {
      const res = await fetch(`/api/attendance?startDate=${monthStart}&endDate=${monthEnd}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });
  const { data: leaveRequests = [] } = useQuery<any[]>({ queryKey: ["/api/leave-requests"] });
  const { data: leaveTypes = [] } = useQuery<any[]>({ queryKey: ["/api/leave-types"] });
  const { data: payrolls = [] } = useQuery<any[]>({ queryKey: ["/api/payroll"] });
  const { data: holidays = [] } = useQuery<any[]>({ queryKey: ["/api/holidays"] });
  const { data: loans = [] } = useQuery<any[]>({ queryKey: ["/api/loan-advances"] });

  const displayName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.username || "Employee";
  const initials = (user?.firstName?.[0] || "") + (user?.lastName?.[0] || "");

  // Today's attendance
  const todayRecord = attendance.find((a: any) => a.date === today);
  const isCheckedIn = todayRecord?.clockIn && todayRecord.clockIn !== "00:00";
  const isCheckedOut = todayRecord?.clockOut && todayRecord.clockOut !== "00:00";

  // This month attendance stats
  const presentDays = attendance.filter((a: any) => a.status === "present").length;
  const absentDays = attendance.filter((a: any) => a.status === "absent").length;
  const leaveDays = attendance.filter((a: any) => a.status === "on_leave").length;
  const weekendDays = attendance.filter((a: any) => a.status === "weekend").length;

  // Leave balance: approved/taken leaves per type this year
  const takenByType: Record<string, number> = {};
  leaveRequests.filter((r: any) => r.status === "approved" && r.startDate?.startsWith(new Date().getFullYear().toString()))
    .forEach((r: any) => { takenByType[r.leaveTypeId] = (takenByType[r.leaveTypeId] || 0) + r.days; });

  // Upcoming holidays (next 90 days)
  const upcomingHolidays = holidays
    .filter((h: any) => isAfter(parseISO(h.date), new Date()))
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
    .slice(0, 5);

  // Latest payslip
  const latestPayroll = [...payrolls].sort((a: any, b: any) => {
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const aIdx = months.indexOf(a.month) + (a.year * 12);
    const bIdx = months.indexOf(b.month) + (b.year * 12);
    return bIdx - aIdx;
  })[0];

  // Active loans
  const activeLoans = loans.filter((l: any) => l.status === "active");
  const totalLoanBalance = activeLoans.reduce((s: number, l: any) => s + (Number(l.remainingBalance) || 0), 0);

  // Pending leave requests
  const pendingLeaves = leaveRequests.filter((r: any) => r.status === "pending");

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Good Morning" : greetingHour < 17 ? "Good Afternoon" : "Good Evening";

  return (
    <div className="space-y-6">
      {/* Hero Greeting Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-violet-600 text-white p-6 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="relative flex items-center gap-4">
          <Avatar className="h-16 w-16 ring-4 ring-white/30 shadow-lg">
            <AvatarFallback className="bg-white/20 text-white text-xl font-bold">
              {initials || displayName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/70 font-medium">{greeting},</p>
            <h2 className="text-2xl font-bold truncate">{displayName}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {employeeData?.employeeCode && (
                <Badge className="bg-white/20 text-white border-white/30 text-xs font-medium hover:bg-white/30">
                  #{employeeData.employeeCode}
                </Badge>
              )}
              {employeeData?.designation && (
                <span className="text-xs text-white/70 flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />{employeeData.designation}
                </span>
              )}
              {employeeData?.department && (
                <span className="text-xs text-white/70 flex items-center gap-1">
                  <Building2 className="h-3 w-3" />{employeeData.department}
                </span>
              )}
            </div>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-sm text-white/70">Today</p>
            <p className="text-base font-semibold">{format(new Date(), "EEE, d MMM yyyy")}</p>
          </div>
        </div>
      </div>

      {/* Today's Attendance + Quick Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Today's Attendance */}
        <Card className="sm:col-span-2 border-l-4 border-l-primary">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today's Attendance</p>
                <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(), "EEEE, d MMMM")}</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                todayRecord?.status === "present" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                todayRecord?.status === "on_leave" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                todayRecord?.status === "weekend" ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" :
                todayRecord?.status === "absent" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" :
                "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
              }`}>
                {todayRecord?.status === "present" ? "Present" :
                 todayRecord?.status === "on_leave" ? "On Leave" :
                 todayRecord?.status === "weekend" ? "Weekend" :
                 todayRecord?.status === "absent" ? "Absent" : "Not Marked"}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs text-muted-foreground font-medium">Clock In</span>
                </div>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  {isCheckedIn ? todayRecord.clockIn : "—"}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="h-4 w-4 text-rose-500" />
                  <span className="text-xs text-muted-foreground font-medium">Clock Out</span>
                </div>
                <p className="text-lg font-bold text-rose-600 dark:text-rose-400">
                  {isCheckedOut ? todayRecord.clockOut : "—"}
                </p>
              </div>
            </div>
            {todayRecord?.workHours && todayRecord.workHours !== "0" && todayRecord.workHours !== "00:00" && (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Timer className="h-4 w-4" />
                <span>Work Hours: <strong className="text-foreground">{todayRecord.workHours}</strong></span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* This Month Stats */}
        <StatCard title="Present This Month" value={presentDays} icon={CheckCircle2} description={`Out of ${presentDays + absentDays + leaveDays} working days`} color="emerald" />
        <StatCard title="Leaves Taken" value={leaveDays} icon={CalendarDays} description={`${absentDays} absent · ${weekendDays} weekends`} color="amber" />
      </div>

      {/* Leave Balance + Payslip + Loans Row */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Leave Balance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Leave Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaveTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No leave types configured</p>
            ) : (
              <div className="space-y-3">
                {leaveTypes.slice(0, 5).map((lt: any) => {
                  const taken = takenByType[lt.id] || 0;
                  const balance = Math.max(0, (lt.daysPerYear || 0) - taken);
                  const pct = lt.daysPerYear > 0 ? Math.round((balance / lt.daysPerYear) * 100) : 0;
                  return (
                    <div key={lt.id} className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs px-1.5 py-0">{lt.code}</Badge>
                          <span className="text-sm font-medium">{lt.name}</span>
                        </div>
                        <span className="text-sm font-bold">{balance}<span className="text-xs text-muted-foreground font-normal">/{lt.daysPerYear}</span></span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {pendingLeaves.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {pendingLeaves.length} leave request{pendingLeaves.length > 1 ? "s" : ""} pending approval
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Latest Payslip */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" />
              Latest Payslip
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!latestPayroll ? (
              <p className="text-sm text-muted-foreground text-center py-6">No payslip generated yet</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{latestPayroll.month} {latestPayroll.year}</p>
                    <Badge variant={latestPayroll.status === "paid" ? "default" : "secondary"} className="text-xs mt-1">
                      {latestPayroll.status === "paid" ? "Paid" : latestPayroll.status === "processed" ? "Processed" : "Draft"}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Net Pay</p>
                    <p className="text-2xl font-bold text-emerald-600">₹{Number(latestPayroll.netSalary).toLocaleString("en-IN")}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div className="p-2.5 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Gross Earnings</p>
                    <p className="text-sm font-semibold mt-0.5">₹{Number(latestPayroll.totalEarnings).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Deductions</p>
                    <p className="text-sm font-semibold mt-0.5">₹{Number(latestPayroll.totalDeductions).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Pay Days</p>
                    <p className="text-sm font-semibold mt-0.5">{latestPayroll.payDays} days</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Present Days</p>
                    <p className="text-sm font-semibold mt-0.5">{latestPayroll.presentDays} days</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Holidays + Loan Status */}
        <div className="space-y-4">
          {/* Loan / Advance */}
          {activeLoans.length > 0 && (
            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-amber-600" />
                  Active Loan / Advance
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 space-y-2">
                {activeLoans.slice(0, 2).map((loan: any) => (
                  <div key={loan.id} className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                    <div>
                      <p className="text-xs font-semibold capitalize">{loan.type}</p>
                      <p className="text-xs text-muted-foreground">₹{Number(loan.installmentAmount).toLocaleString("en-IN")}/mo EMI</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Balance</p>
                      <p className="text-sm font-bold text-amber-700 dark:text-amber-400">₹{Number(loan.remainingBalance).toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                ))}
                {activeLoans.length > 1 && (
                  <p className="text-xs text-muted-foreground text-center">Total balance: ₹{totalLoanBalance.toLocaleString("en-IN")}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Upcoming Holidays */}
          <Card className={activeLoans.length > 0 ? "" : "h-full"}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Gift className="h-4 w-4 text-primary" />
                Upcoming Holidays
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingHolidays.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No upcoming holidays</p>
              ) : (
                <div className="space-y-2">
                  {upcomingHolidays.map((h: any) => (
                    <div key={h.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-primary uppercase">{format(parseISO(h.date), "MMM")}</span>
                        <span className="text-sm font-bold text-primary leading-none">{format(parseISO(h.date), "d")}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{h.name}</p>
                        <p className="text-xs text-muted-foreground">{format(parseISO(h.date), "EEEE")}</p>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize shrink-0">{h.type}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Leave Requests */}
      {leaveRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Recent Leave Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {leaveRequests.slice(0, 5).map((req: any) => {
                const lt = leaveTypes.find((t: any) => t.id === req.leaveTypeId);
                return (
                  <div key={req.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        req.status === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                        req.status === "rejected" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" :
                        "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                      }`}>
                        {lt?.code || "L"}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{lt?.name || "Leave"}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(req.startDate), "d MMM")}
                          {req.startDate !== req.endDate ? ` – ${format(parseISO(req.endDate), "d MMM yyyy")}` : `, ${format(parseISO(req.startDate), "yyyy")}`}
                          {" · "}{req.days} day{req.days !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <Badge variant={req.status === "approved" ? "default" : req.status === "rejected" ? "destructive" : "secondary"} className="text-xs capitalize">
                      {req.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── SKELETON ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
      </div>
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();

  const isEmployee = user?.role === "employee";

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    enabled: !isEmployee,
  });

  const isLoading = isEmployee ? false : statsLoading;

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? "Good Morning" : greetingHour < 17 ? "Good Afternoon" : "Good Evening";
  const displayName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.username || "";

  return (
    <div className="p-6" data-testid="dashboard-page">
      {!isEmployee && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{greeting}, {displayName} — Here's your HR overview</p>
        </div>
      )}

      {isLoading ? (
        <DashboardSkeleton />
      ) : isEmployee ? (
        <EmployeeDashboard />
      ) : (
        <AdminDashboard stats={stats || { totalCompanies: 0, totalEmployees: 0, totalUsers: 0, activeEmployees: 0, totalContractors: 0, totalPrincipalEmployers: 0, departmentDistribution: [], recentEmployees: [] }} />
      )}
    </div>
  );
}
