import { useState, useRef, useEffect } from "react";
import { LiveScreen } from "@/components/automation/live-screen";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTriggerJob } from "@/hooks/use-trigger-job";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck, Users, FileText, Download, RefreshCw, Loader2,
  CheckCircle2, AlertTriangle, Clock, Upload, Settings, Activity,
  Eye, EyeOff, Lock, Search, Monitor,
} from "lucide-react";
import * as XLSX from "xlsx";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

// ─── Types ────────────────────────────────────────────────────────────────────
interface EsicRegistration {
  id: string; companyId: string; employeeId: string;
  ipNumber?: string | null; status: string; errorMessage?: string | null;
  employeeName?: string; employeeCode?: string; createdAt: string;
}
interface EsicReturn {
  id: string; companyId: string; month: string; year: number;
  status: string; totalEmployees: number; totalAmount: number;
  dueDate: string; challanNo?: string | null; filedAt?: string | null;
  errorMessage?: string | null; jobId?: string | null;
}
interface Challan {
  id: string; companyId: string; portal: string; month: string; year: number;
  amount: number; status: string; trrn?: string | null; challanNo?: string | null;
  downloadUrl?: string | null; createdAt: string;
}
interface Contribution {
  employeeId: string; employeeCode: string; firstName: string; lastName: string;
  esiNumber?: string | null; month: string; year: number;
  esicWages: number; employeeEsic: number; payrollStatus: string;
}
interface EmployeeRow {
  id: string; employeeCode: string; firstName: string; lastName: string;
  esiNumber?: string | null; esiApplicable: boolean; status: string;
}
interface AutomationSummary {
  esicRegistrations: number; pendingJobs: number; failedJobs: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:   "bg-yellow-100 text-yellow-800 border-yellow-200",
    registered:"bg-green-100 text-green-800 border-green-200",
    failed:    "bg-red-100 text-red-800 border-red-200",
    filed:     "bg-green-100 text-green-800 border-green-200",
    not_registered: "bg-gray-100 text-gray-600 border-gray-200",
    challan_generated: "bg-blue-100 text-blue-800 border-blue-200",
    paid:      "bg-emerald-100 text-emerald-800 border-emerald-200",
  };
  return <Badge variant="outline" className={`text-xs ${map[status] ?? "bg-gray-100 text-gray-600"}`}>{status.replace(/_/g," ")}</Badge>;
}
function fmt(n: number) { return `₹${n.toLocaleString("en-IN")}`; }
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab({ companyId, onTabChange }: { companyId: string; onTabChange: (tab: string) => void }) {
  const triggerJob = useTriggerJob(["/api/esic/registrations", "/api/esic/monthly-returns", "/api/esic/challans"]);

  const { data: summary } = useQuery<AutomationSummary>({
    queryKey: ["/api/automation/summary", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/automation/summary?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: recentReturns } = useQuery<{ data: EsicReturn[] }>({
    queryKey: ["/api/esic/monthly-returns", companyId, 1],
    queryFn: async () => {
      const res = await fetch(`/api/esic/monthly-returns?companyId=${companyId}&limit=5`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: recentJobs } = useQuery<{ data: Array<{ id: string; jobType: string; status: string; createdAt: string; errorMessage?: string | null }> }>({
    queryKey: ["/api/automation/jobs", companyId, "esic", "recent"],
    queryFn: async () => {
      const params = new URLSearchParams({ companyId, limit: "8", jobType: "esic" });
      const res = await fetch(`/api/automation/jobs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const now = new Date();
  const d21 = new Date(now.getFullYear(), now.getMonth() + 1, 21);
  const diffDays = Math.ceil((d21.getTime() - now.getTime()) / 86400000);
  const nextDue = `ESIC due ${diffDays > 0 ? `in ${diffDays} day${diffDays !== 1 ? "s" : ""}` : "today"} (21st ${MONTHS[d21.getMonth()]})`;

  const prevMonth = now.getMonth() === 0 ? MONTHS[11] : MONTHS[now.getMonth() - 1];
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const jobStatusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    if (status === "failed") return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    if (status === "running") return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
    return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Registered Employees", value: summary?.esicRegistrations ?? 0, icon: Users, color: "text-emerald-600 bg-emerald-50" },
          { label: "Pending Jobs", value: summary?.pendingJobs ?? 0, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
          { label: "Failed Jobs", value: summary?.failedJobs ?? 0, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
          { label: "Next Due Date", value: nextDue, icon: Activity, color: "text-teal-600 bg-teal-50", small: true },
        ].map(({ label, value, icon: Icon, color, small }) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg flex-shrink-0 ${color}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className={`font-bold ${small ? "text-sm leading-tight" : "text-2xl"}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <Card className="bg-emerald-50/40 border-emerald-100">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-emerald-800">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button size="sm" onClick={() => onTabChange("registration")} variant="outline" data-testid="qaction-esic-go-register">
            <Users className="h-4 w-4 mr-1.5" /> Register Employees
          </Button>
          <Button size="sm" onClick={() => triggerJob.mutate({ jobType: "esic_monthly_file", companyId, payload: { month: prevMonth, year: prevYear } })} disabled={triggerJob.isPending} variant="outline" data-testid="qaction-esic-file-monthly">
            {triggerJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FileText className="h-4 w-4 mr-1.5" />}
            File Monthly ({prevMonth} {prevYear})
          </Button>
          <Button size="sm" onClick={() => triggerJob.mutate({ jobType: "esic_challan_download", companyId })} disabled={triggerJob.isPending} variant="outline" data-testid="qaction-esic-sync-challans">
            <Download className="h-4 w-4 mr-1.5" /> Sync Challans
          </Button>
          <Button size="sm" onClick={() => onTabChange("portal")} variant="outline" data-testid="qaction-esic-portal-settings">
            <Settings className="h-4 w-4 mr-1.5" /> Portal Settings
          </Button>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent returns */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Monthly Returns</CardTitle>
          </CardHeader>
          <CardContent>
            {!recentReturns?.data?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No ESIC returns filed yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Filed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentReturns.data.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-sm">{r.month} {r.year}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-sm">{fmt(r.totalAmount)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.filedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent automation jobs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Recent Automation Activity
              <span className="text-xs font-normal text-muted-foreground">auto-refreshes</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!recentJobs?.data?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No automation jobs yet</p>
            ) : (
              <div className="space-y-2">
                {recentJobs.data.map(job => (
                  <div key={job.id} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                    {jobStatusIcon(job.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{job.jobType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</p>
                      {job.errorMessage && <p className="text-xs text-red-500 truncate">{job.errorMessage}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Registration Tab ─────────────────────────────────────────────────────────
function RegistrationTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const triggerJob = useTriggerJob(["/api/esic/registrations"]);

  const { data: employees, isLoading: loadingEmps } = useQuery<{ data: EmployeeRow[] }>({
    queryKey: ["/api/employees", companyId, "esic"],
    queryFn: async () => {
      const res = await fetch(`/api/employees?companyId=${companyId}&limit=200`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const list: EmployeeRow[] = await res.json();
      return { data: list.filter(e => e.esiApplicable && e.status === "active") };
    },
  });

  const { data: regs, isLoading: loadingRegs } = useQuery<{ data: EsicRegistration[] }>({
    queryKey: ["/api/esic/registrations", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/esic/registrations?companyId=${companyId}&limit=200`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await apiRequest("POST", "/api/esic/register-employee", { employeeId, companyId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "ESIC registration job queued" });
      queryClient.invalidateQueries({ queryKey: ["/api/esic/registrations"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const regMap = new Map((regs?.data ?? []).map(r => [r.employeeId, r]));
  const emps = employees?.data ?? [];
  const toggleSelect = (id: string) =>
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{emps.length} ESIC-eligible active employees</p>
        {selected.size > 0 && (
          <Button size="sm" onClick={() => { triggerJob.mutate({ jobType: "esic_bulk_register", companyId, payload: { employees: emps.filter(e => selected.has(e.id)) } }); setSelected(new Set()); }} disabled={triggerJob.isPending} data-testid="button-esic-bulk-register">
            {triggerJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Bulk Register ({selected.size})
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox checked={selected.size === emps.length && emps.length > 0} onCheckedChange={v => setSelected(v ? new Set(emps.map(e => e.id)) : new Set())} data-testid="checkbox-esic-select-all" /></TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>IP Number</TableHead>
              <TableHead>Registration Status</TableHead>
              <TableHead className="w-32">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(loadingEmps || loadingRegs) ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : emps.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No ESIC-eligible employees found</TableCell></TableRow>
            ) : emps.map(emp => {
              const reg = regMap.get(emp.id);
              return (
                <TableRow key={emp.id} data-testid={`row-emp-esic-${emp.id}`}>
                  <TableCell><Checkbox checked={selected.has(emp.id)} onCheckedChange={() => toggleSelect(emp.id)} data-testid={`checkbox-esic-emp-${emp.id}`} /></TableCell>
                  <TableCell className="font-mono text-sm">{emp.employeeCode}</TableCell>
                  <TableCell>{emp.firstName} {emp.lastName}</TableCell>
                  <TableCell className="font-mono text-sm">{reg?.ipNumber ?? emp.esiNumber ?? "—"}</TableCell>
                  <TableCell>{reg ? statusBadge(reg.status) : <Badge variant="outline" className="bg-gray-50 text-gray-500 text-xs">Not Registered</Badge>}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => registerMutation.mutate(emp.id)} disabled={registerMutation.isPending} data-testid={`button-esic-register-emp-${emp.id}`}>
                      {reg?.status === "registered" ? "Re-register" : "Register"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Contributions Tab ────────────────────────────────────────────────────────
function ContributionsTab({ companyId }: { companyId: string }) {
  const [month, setMonth] = useState(MONTHS[new Date().getMonth() === 0 ? 11 : new Date().getMonth() - 1]);
  const [year, setYear] = useState(new Date().getMonth() === 0 ? CURRENT_YEAR - 1 : CURRENT_YEAR);

  const { data, isLoading } = useQuery<{ data: Contribution[]; total: number }>({
    queryKey: ["/api/esic/contributions", companyId, month, year],
    queryFn: async () => {
      const res = await fetch(`/api/esic/contributions?companyId=${companyId}&month=${month}&year=${year}&limit=100`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const contribs = data?.data ?? [];
  const totalWages = contribs.reduce((s, r) => s + (r.esicWages || 0), 0);
  const totalEmpEsic = contribs.reduce((s, r) => s + (r.employeeEsic || 0), 0);
  const totalErEsic = contribs.reduce((s, r) => s + Math.round((r.esicWages || 0) * 0.0325), 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <Label className="text-sm mb-1.5 block">Month</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-36" data-testid="select-esic-contrib-month"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-sm mb-1.5 block">Year</Label>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28" data-testid="select-esic-contrib-year"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <a href={`/api/esic/reports/contribution?companyId=${companyId}&month=${month}&year=${year}&format=excel`} target="_blank" rel="noreferrer">
          <Button variant="outline" data-testid="button-esic-report-excel"><Download className="h-4 w-4 mr-2" />Excel Report</Button>
        </a>
        <a href={`/api/esic/reports/contribution?companyId=${companyId}&month=${month}&year=${year}&format=pdf`} target="_blank" rel="noreferrer">
          <Button variant="outline" data-testid="button-esic-report-pdf"><FileText className="h-4 w-4 mr-2" />PDF Report</Button>
        </a>
      </div>

      {contribs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total ESIC Wages", value: fmt(totalWages) },
            { label: "Employee Contribution (0.75%)", value: fmt(totalEmpEsic) },
            { label: "Employer Contribution (3.25%)", value: fmt(totalErEsic) },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <p className="text-lg font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>IP Number</TableHead>
              <TableHead>ESIC Wages</TableHead>
              <TableHead>Employee (0.75%)</TableHead>
              <TableHead>Employer (3.25%)</TableHead>
              <TableHead>Payroll Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : contribs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payroll data found for {month} {year}</TableCell></TableRow>
            ) : contribs.map((c, i) => (
              <TableRow key={i} data-testid={`row-esic-contrib-${c.employeeId}`}>
                <TableCell className="font-mono text-sm">{c.employeeCode}</TableCell>
                <TableCell>{c.firstName} {c.lastName}</TableCell>
                <TableCell className="font-mono text-sm">{c.esiNumber ?? "—"}</TableCell>
                <TableCell>{fmt(c.esicWages || 0)}</TableCell>
                <TableCell>{fmt(c.employeeEsic || 0)}</TableCell>
                <TableCell>{fmt(Math.round((c.esicWages || 0) * 0.0325))}</TableCell>
                <TableCell>{statusBadge(c.payrollStatus)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Monthly Filing Tab ───────────────────────────────────────────────────────
function MonthlyFilingTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(MONTHS[new Date().getMonth() === 0 ? 11 : new Date().getMonth() - 1]);
  const [year, setYear] = useState(new Date().getMonth() === 0 ? CURRENT_YEAR - 1 : CURRENT_YEAR);

  const { data, isLoading } = useQuery<{ data: EsicReturn[] }>({
    queryKey: ["/api/esic/monthly-returns", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/esic/monthly-returns?companyId=${companyId}&limit=12`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const fileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/esic/file-monthly", { month, year, companyId });
      return res.json();
    },
    onSuccess: data => {
      toast({ title: "ESIC filing job queued", description: `Job ID: ${data.jobId?.slice(0, 8)}` });
      queryClient.invalidateQueries({ queryKey: ["/api/esic/monthly-returns"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <Card className="bg-muted/30">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-36" data-testid="select-esic-month"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Year</Label>
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger className="w-28" data-testid="select-esic-year"><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={() => fileMutation.mutate()} disabled={fileMutation.isPending} data-testid="button-file-esic-monthly">
              {fileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              File Monthly Return for {month} {year}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Employees</TableHead>
              <TableHead>Total Amount</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Challan No</TableHead>
              <TableHead>Filed At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : !data?.data?.length ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No monthly returns filed yet</TableCell></TableRow>
            ) : data.data.map(r => (
              <TableRow key={r.id} data-testid={`row-esic-return-${r.id}`}>
                <TableCell className="font-medium">{r.month} {r.year}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
                <TableCell>{r.totalEmployees}</TableCell>
                <TableCell>{fmt(r.totalAmount)}</TableCell>
                <TableCell>{fmtDate(r.dueDate)}</TableCell>
                <TableCell className="font-mono text-sm">{r.challanNo ?? "—"}</TableCell>
                <TableCell>{fmtDate(r.filedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Challan Tab ──────────────────────────────────────────────────────────────
function ChallanTab({ companyId }: { companyId: string }) {
  const triggerJob = useTriggerJob(["/api/esic/challans"]);

  const { data, isLoading } = useQuery<{ data: Challan[] }>({
    queryKey: ["/api/esic/challans", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/esic/challans?companyId=${companyId}&limit=30`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => triggerJob.mutate({ jobType: "esic_challan_download", companyId })} disabled={triggerJob.isPending} data-testid="button-esic-sync-challans">
          {triggerJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sync Challans from Portal
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Challan No</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Download</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : !data?.data?.length ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No challans yet. Click "Sync Challans" to fetch from the portal.</TableCell></TableRow>
            ) : data.data.map(c => (
              <TableRow key={c.id} data-testid={`row-challan-esic-${c.id}`}>
                <TableCell className="font-medium">{c.month} {c.year}</TableCell>
                <TableCell>{statusBadge(c.status)}</TableCell>
                <TableCell>{fmt(c.amount)}</TableCell>
                <TableCell className="font-mono text-sm">{c.challanNo ?? "—"}</TableCell>
                <TableCell>{fmtDate(c.createdAt)}</TableCell>
                <TableCell>
                  {c.downloadUrl ? (
                    <a href={c.downloadUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" data-testid={`button-download-esic-challan-${c.id}`}><Download className="h-3.5 w-3.5 mr-1" />Download</Button>
                    </a>
                  ) : <span className="text-sm text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Bulk Upload Tab ──────────────────────────────────────────────────────────
function BulkUploadTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const triggerJob = useTriggerJob(["/api/esic/registrations"]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ code: string; name: string; valid: boolean }[]>([]);
  const [parsed, setParsed] = useState(false);

  const parseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (rows.length < 2) { toast({ title: "Empty file", variant: "destructive" }); return; }
      const hdrs = (rows[0] as string[]).map(h => String(h).toLowerCase().trim());
      const codeIdx = hdrs.findIndex(h => h.includes("code"));
      const nameIdx = hdrs.findIndex(h => h.includes("name"));
      setPreview(rows.slice(1).filter(r => r[codeIdx]).map(r => ({
        code: String(r[codeIdx] ?? "").trim(),
        name: String(r[nameIdx] ?? "").trim(),
        valid: !!String(r[codeIdx] ?? "").trim(),
      })));
      setParsed(true);
    } catch (err: any) { toast({ title: "Parse error", description: err.message, variant: "destructive" }); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([["Employee Code","Employee Name"],["EMP001","John Doe"]]);
    ws["!cols"] = [{ wch: 18 },{ wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ESIC Bulk Register");
    XLSX.writeFile(wb, "esic_bulk_register_template.xlsx");
    toast({ title: "Template downloaded" });
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <Card className="bg-muted/30">
        <CardContent className="pt-5 pb-4 space-y-3">
          <p className="text-sm text-muted-foreground">Upload an Excel file with employee codes to bulk-register for ESIC (IP number generation).</p>
          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" onClick={downloadTemplate} data-testid="button-download-esic-template"><Download className="h-4 w-4 mr-2" />Download Template</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="button-upload-esic-bulk"><Upload className="h-4 w-4 mr-2" />Select Excel File</Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={parseFile} />
          </div>
        </CardContent>
      </Card>

      {parsed && preview.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preview — {preview.length} rows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Valid</TableHead><TableHead>Code</TableHead><TableHead>Name</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r, i) => (
                    <TableRow key={i} className={!r.valid ? "bg-red-50" : ""}>
                      <TableCell>{r.valid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}</TableCell>
                      <TableCell className="font-mono text-sm">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex gap-3">
              <Button onClick={() => { triggerJob.mutate({ jobType: "esic_bulk_register", companyId, payload: { employees: preview.filter(r => r.valid) } }); setPreview([]); setParsed(false); }} disabled={triggerJob.isPending} data-testid="button-submit-esic-bulk">
                {triggerJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Queue {preview.filter(r => r.valid).length} Registrations
              </Button>
              <Button variant="outline" onClick={() => { setPreview([]); setParsed(false); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Member Tools Tab ─────────────────────────────────────────────────────────
function MemberToolsTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const triggerJob = useTriggerJob();

  // Family Declaration
  const [familyIp, setFamilyIp] = useState("");
  const [familyMembers, setFamilyMembers] = useState([{ name: "", relation: "Wife/Husband", dob: "" }]);
  const [familyJobId, setFamilyJobId] = useState<string | null>(null);
  const [familyPolling, setFamilyPolling] = useState(false);

  // Card Downloads
  const [cardIp, setCardIp] = useState("");
  const [cardJobId, setCardJobId] = useState<string | null>(null);
  const [cardPolling, setCardPolling] = useState(false);
  const [activeCard, setActiveCard] = useState<"temp" | "pehchan">("temp");

  // Employee Search
  const [searchInput, setSearchInput] = useState("");
  const [searchJobId, setSearchJobId] = useState<string | null>(null);
  const [searchPolling, setSearchPolling] = useState(false);
  const [searchResult, setSearchResult] = useState<Record<string,unknown>|null>(null);

  // Contribution Tracking
  const [ctIp, setCtIp] = useState("");
  const [ctFrom, setCtFrom] = useState("");
  const [ctTo, setCtTo] = useState("");
  const [ctJobId, setCtJobId] = useState<string | null>(null);
  const [ctPolling, setCtPolling] = useState(false);
  const [ctResult, setCtResult] = useState<Record<string,unknown>|null>(null);

  const { data: familyJob } = useQuery<{ id: string; status: string; result?: Record<string,unknown>; errorMessage?: string }>({
    queryKey: ["/api/automation/jobs", familyJobId, "fam"],
    queryFn: async () => { const res = await apiRequest("GET", `/api/automation/jobs/${familyJobId}`); return res.json(); },
    enabled: !!familyJobId && familyPolling, refetchInterval: familyPolling ? 3000 : false,
  });
  const { data: cardJob } = useQuery<{ id: string; status: string; result?: Record<string,unknown>; errorMessage?: string }>({
    queryKey: ["/api/automation/jobs", cardJobId, "card"],
    queryFn: async () => { const res = await apiRequest("GET", `/api/automation/jobs/${cardJobId}`); return res.json(); },
    enabled: !!cardJobId && cardPolling, refetchInterval: cardPolling ? 3000 : false,
  });
  const { data: searchJob } = useQuery<{ id: string; status: string; result?: Record<string,unknown>; errorMessage?: string }>({
    queryKey: ["/api/automation/jobs", searchJobId, "srch"],
    queryFn: async () => { const res = await apiRequest("GET", `/api/automation/jobs/${searchJobId}`); return res.json(); },
    enabled: !!searchJobId && searchPolling, refetchInterval: searchPolling ? 3000 : false,
  });
  const { data: ctJob } = useQuery<{ id: string; status: string; result?: Record<string,unknown>; errorMessage?: string }>({
    queryKey: ["/api/automation/jobs", ctJobId, "ct"],
    queryFn: async () => { const res = await apiRequest("GET", `/api/automation/jobs/${ctJobId}`); return res.json(); },
    enabled: !!ctJobId && ctPolling, refetchInterval: ctPolling ? 3000 : false,
  });

  useEffect(() => {
    if (!familyJob) return;
    if (familyJob.status === "completed") { setFamilyPolling(false); setFamilyJobId(null); toast({ title: "Family declaration submitted", description: "Members added on ESIC portal" }); }
    else if (familyJob.status === "failed") { setFamilyPolling(false); setFamilyJobId(null); toast({ title: "Family declaration failed", description: familyJob.errorMessage ?? "Error", variant: "destructive" }); }
  }, [familyJob?.status]);
  useEffect(() => {
    if (!cardJob) return;
    if (cardJob.status === "completed") { setCardPolling(false); setCardJobId(null); toast({ title: "Card downloaded", description: "Card retrieved from ESIC portal" }); }
    else if (cardJob.status === "failed") { setCardPolling(false); setCardJobId(null); toast({ title: "Card download failed", description: cardJob.errorMessage ?? "Error", variant: "destructive" }); }
  }, [cardJob?.status]);
  useEffect(() => {
    if (!searchJob) return;
    if (searchJob.status === "completed") { setSearchPolling(false); setSearchJobId(null); setSearchResult(searchJob.result ?? null); }
    else if (searchJob.status === "failed") { setSearchPolling(false); setSearchJobId(null); toast({ title: "Search failed", description: searchJob.errorMessage ?? "Error", variant: "destructive" }); }
  }, [searchJob?.status]);
  useEffect(() => {
    if (!ctJob) return;
    if (ctJob.status === "completed") { setCtPolling(false); setCtJobId(null); setCtResult(ctJob.result ?? null); }
    else if (ctJob.status === "failed") { setCtPolling(false); setCtJobId(null); toast({ title: "Contribution tracking failed", description: ctJob.errorMessage ?? "Error", variant: "destructive" }); }
  }, [ctJob?.status]);

  const updateMember = (i: number, field: string, value: string) =>
    setFamilyMembers(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));

  return (
    <div className="space-y-5">
      {/* Family Declaration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-600" />
            Family Declaration
          </CardTitle>
          <CardDescription>Add family members for an insured person (IP) on the ESIC portal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <Label>IP Number</Label>
            <Input value={familyIp} onChange={e => setFamilyIp(e.target.value)} placeholder="Insured Person IP number" data-testid="input-family-ip" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Family Members</Label>
            {familyMembers.map((m, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 items-end">
                <div>
                  {i === 0 && <Label className="text-xs">Name</Label>}
                  <Input value={m.name} onChange={e => updateMember(i, "name", e.target.value)} placeholder="Full name" data-testid={`input-family-name-${i}`} />
                </div>
                <div>
                  {i === 0 && <Label className="text-xs">Relation</Label>}
                  <Select value={m.relation} onValueChange={v => updateMember(i, "relation", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Wife/Husband","Father","Mother","Son","Daughter","Others"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {i === 0 && <Label className="text-xs">Date of Birth</Label>}
                  <div className="flex gap-1">
                    <Input type="date" value={m.dob} onChange={e => updateMember(i, "dob", e.target.value)} data-testid={`input-family-dob-${i}`} />
                    {familyMembers.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={() => setFamilyMembers(p => p.filter((_,idx) => idx !== i))}>✕</Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setFamilyMembers(p => [...p, { name:"", relation:"Son", dob:"" }])} data-testid="btn-add-family-member">
              + Add Member
            </Button>
          </div>
          <Button
            onClick={() => triggerJob.mutate(
              { jobType: "esic_family_declaration", companyId, payload: { ipNumber: familyIp, familyMembers } },
              { onSuccess: j => { setFamilyJobId(j.id); setFamilyPolling(true); } }
            )}
            disabled={!familyIp || familyPolling || triggerJob.isPending || familyMembers.every(m => !m.name)}
            data-testid="btn-family-submit"
          >
            {familyPolling ? "Submitting on portal…" : "Submit Family Declaration"}
          </Button>
        </CardContent>
      </Card>

      {/* Card Downloads */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-emerald-600" />
            Card Downloads
          </CardTitle>
          <CardDescription>Download Temporary Card or Pehchan Card for an insured person</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 max-w-lg items-end">
            <div className="flex-1">
              <Label>IP Number</Label>
              <Input value={cardIp} onChange={e => setCardIp(e.target.value)} placeholder="Insured Person IP number" data-testid="input-card-ip" />
            </div>
            <Button
              variant="outline"
              onClick={() => { setActiveCard("temp"); triggerJob.mutate(
                { jobType: "esic_temp_card_download", companyId, payload: { ipNumber: cardIp } },
                { onSuccess: j => { setCardJobId(j.id); setCardPolling(true); } }
              ); }}
              disabled={!cardIp || cardPolling || triggerJob.isPending}
              data-testid="btn-temp-card"
            >
              {cardPolling && activeCard === "temp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-1">Temp Card</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => { setActiveCard("pehchan"); triggerJob.mutate(
                { jobType: "esic_pehchan_card_download", companyId, payload: { ipNumber: cardIp } },
                { onSuccess: j => { setCardJobId(j.id); setCardPolling(true); } }
              ); }}
              disabled={!cardIp || cardPolling || triggerJob.isPending}
              data-testid="btn-pehchan-card"
            >
              {cardPolling && activeCard === "pehchan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-1">Pehchan Card</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Employee Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-emerald-600" />
            Employee Search
          </CardTitle>
          <CardDescription>Search for an insured person by IP number or employee code on the ESIC portal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 max-w-md">
            <Input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="IP number or employee code" data-testid="input-esic-search" />
            <Button
              onClick={() => triggerJob.mutate(
                { jobType: "esic_employee_search", companyId, payload: { ipNumber: searchInput } },
                { onSuccess: j => { setSearchJobId(j.id); setSearchPolling(true); setSearchResult(null); } }
              )}
              disabled={!searchInput || searchPolling || triggerJob.isPending}
              data-testid="btn-esic-search"
            >
              {searchPolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-1">Search</span>
            </Button>
          </div>
          {searchResult && (
            <div className="rounded border bg-muted/40 p-4 text-sm space-y-2 max-w-2xl">
              {searchResult.details && <p className="whitespace-pre-wrap text-xs">{String(searchResult.details)}</p>}
              {Array.isArray(searchResult.tableRows) && (searchResult.tableRows as string[][]).length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <tbody>
                      {(searchResult.tableRows as string[][]).map((row, i) => (
                        <tr key={i} className="border-b">
                          {(row as string[]).map((cell, j) => <td key={j} className="px-2 py-1">{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contribution Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-600" />
            Contribution Tracking
          </CardTitle>
          <CardDescription>Track contribution history for an insured person by IP number on the ESIC portal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3 max-w-xl">
            <div>
              <Label>IP Number</Label>
              <Input value={ctIp} onChange={e => setCtIp(e.target.value)} placeholder="IP number" data-testid="input-ct-ip" />
            </div>
            <div>
              <Label>From Date</Label>
              <Input type="date" value={ctFrom} onChange={e => setCtFrom(e.target.value)} data-testid="input-ct-from" />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={ctTo} onChange={e => setCtTo(e.target.value)} data-testid="input-ct-to" />
            </div>
          </div>
          <Button
            onClick={() => triggerJob.mutate(
              { jobType: "esic_contribution_tracking", companyId, payload: { ipNumber: ctIp, fromDate: ctFrom, toDate: ctTo } },
              { onSuccess: j => { setCtJobId(j.id); setCtPolling(true); setCtResult(null); } }
            )}
            disabled={!ctIp || ctPolling || triggerJob.isPending}
            data-testid="btn-ct-track"
          >
            {ctPolling ? "Tracking on portal…" : "Track Contributions"}
          </Button>
          {ctResult && (
            <div className="overflow-x-auto rounded border text-sm">
              <table className="w-full">
                <tbody>
                  {Array.isArray(ctResult.rows) && (ctResult.rows as string[][]).map((row, i) => (
                    <tr key={i} className="border-b hover:bg-muted/40">
                      {(row as string[]).map((cell, j) => <td key={j} className="px-3 py-2 text-xs">{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {ctResult.total && <p className="px-3 py-2 text-xs text-muted-foreground">Total: {String(ctResult.total)}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Employee List Tab ────────────────────────────────────────────────────────
function EmployeeListTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const triggerJob = useTriggerJob(["/api/automation/portal-employee-list/esic"]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const queryClient = useQueryClient();

  // Latest saved result — from dedicated DB table
  const { data: saved, isLoading: loadingSaved } = useQuery<{
    employees: { id: string; ipNo: string; name: string; dateOfRegistration: string | null; fetchedAt: string }[];
    count: number;
    fetchedAt: string | null;
  }>({
    queryKey: ["/api/automation/esic-employees", companyId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/automation/esic-employees?companyId=${companyId}`);
      return res.json();
    },
    refetchInterval: false,
  });

  // Check portal credentials
  const { data: portalSession } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/automation/portal-session/esic", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/automation/portal-session/esic?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return { configured: false };
      return res.json();
    },
    enabled: !!companyId,
  });

  // Poll active job
  const { data: activeJob } = useQuery<{ id: string; status: string; errorMessage?: string | null; result?: { employees: Record<string, string>[]; count: number; fetchedAt: string } }>({
    queryKey: ["/api/automation/jobs", activeJobId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/automation/jobs/${activeJobId}`);
      return res.json();
    },
    enabled: !!activeJobId && polling,
    refetchInterval: polling ? 3000 : false,
  });

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === "completed") {
      setPolling(false);
      setActiveJobId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/automation/esic-employees", companyId] });
      toast({ title: "Employee list fetched", description: `${activeJob.result?.count ?? 0} employees saved from ESIC portal` });
    } else if (activeJob.status === "failed") {
      setPolling(false);
      setActiveJobId(null);
      toast({ title: "Fetch failed", description: activeJob.errorMessage || "Could not fetch employee list from ESIC portal.", variant: "destructive" });
    }
  }, [activeJob?.status]);

  const handleFetch = () => {
    triggerJob.mutate(
      { jobType: "esic_employee_list", companyId, payload: {} },
      {
        onSuccess: (job) => {
          setActiveJobId(job.id);
          setPolling(true);
        },
      }
    );
  };

  const employees = saved?.employees ?? [];
  const [search, setSearch] = useState("");
  const filtered = search
    ? employees.filter((e) =>
        e.ipNo.toLowerCase().includes(search.toLowerCase()) ||
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.dateOfRegistration ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : employees;

  const handleExport = () => {
    if (!employees.length) return;
    const ws = XLSX.utils.json_to_sheet(
      employees.map((e) => ({ "IP No": e.ipNo, "Name": e.name, "Date of Registration": e.dateOfRegistration ?? "" }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ESIC Employees");
    XLSX.writeFile(wb, `esic-employees-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const isBusy = triggerJob.isPending || polling;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-600" />
            ESIC Employee List
          </CardTitle>
          <CardDescription>
            Fetch the latest registered employee list from the ESIC portal. Columns: IP No., Name, Date of Registration.
            {saved?.fetchedAt && (
              <span className="ml-2 text-emerald-600 font-medium">
                Last fetched: {new Date(saved.fetchedAt).toLocaleString()} — {saved.count} employees
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {portalSession && !portalSession.configured && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>ESIC portal not configured — go to the <strong>Portal Settings</strong> tab to add credentials first.</span>
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleFetch} disabled={isBusy} data-testid="btn-esic-fetch-employee-list">
              {isBusy ? "Fetching from portal…" : "Fetch from Portal"}
            </Button>
            {employees.length > 0 && (
              <Button variant="outline" onClick={handleExport} data-testid="btn-esic-export-employee-list">
                Export to Excel
              </Button>
            )}
          </div>

        </CardContent>
      </Card>

      {employees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {filtered.length} of {employees.length} employees
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search by name, IP number, code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-esic-employee-search"
              className="max-w-sm"
            />
            <div className="overflow-x-auto rounded border text-sm">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2 whitespace-nowrap font-medium text-muted-foreground">IP No.</th>
                    <th className="text-left px-3 py-2 whitespace-nowrap font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-3 py-2 whitespace-nowrap font-medium text-muted-foreground">Date of Registration</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((emp, i) => (
                    <tr key={emp.id ?? i} className="border-t hover:bg-muted/40" data-testid={`row-esic-employee-${i}`}>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{emp.ipNo || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{emp.name || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{emp.dateOfRegistration || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 500 && (
                <p className="text-xs text-muted-foreground px-3 py-2">
                  Showing first 500 of {filtered.length}. Export to Excel for full list.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!loadingSaved && !employees.length && !isBusy && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No data yet. Click "Fetch from Portal" to load the employee list from ESIC.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Portal Settings Tab ──────────────────────────────────────────────────────
function PortalSettingsTab({ companyId, isSuperAdmin, companies = [] }: {
  companyId: string;
  isSuperAdmin?: boolean;
  companies?: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedCid, setSelectedCid] = useState(companyId);

  useEffect(() => { setSelectedCid(companyId); }, [companyId]);

  const effectiveCid = isSuperAdmin ? selectedCid : companyId;
  const lastJobIdRef = useRef<string | null>(null);

  const [changingCreds, setChangingCreds] = useState(false);

  const resetTest = () => { setTestPhase("idle"); setTestResult(null); setTestJobId(null); setCaptchaAnswer(""); lastJobIdRef.current = null; };

  const { data: session } = useQuery<{ configured: boolean; username?: string; lastLoginAt?: string }>({
    queryKey: ["/api/automation/portal-session/esic", effectiveCid],
    queryFn: async () => {
      const res = await fetch(`/api/automation/portal-session/esic?companyId=${effectiveCid}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!effectiveCid,
  });

  // Pre-populate username whenever saved session data loads / changes
  useEffect(() => {
    if (session?.username) setUsername(session.username);
  }, [session?.username]);

  const [testJobId, setTestJobId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [testPhase, setTestPhase] = useState<"idle" | "running" | "captcha" | "otp" | "done">("idle");

  const { data: polledJob } = useQuery<{ id: string; status: string; errorMessage?: string | null; screenshotPath?: string | null }>({
    queryKey: ["/api/automation/jobs", testJobId],
    queryFn: async () => {
      const res = await fetch(`/api/automation/jobs/${testJobId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!testJobId,
    refetchInterval: (query) => {
      const s = (query.state.data as any)?.status;
      if (s === "completed" || s === "failed" || s === "cancelled") return false;
      return 2000;
    },
  });

  useEffect(() => {
    if (!polledJob) return;
    if (polledJob.status === "completed") {
      setTestPhase("done");
      setTestResult({ ok: true, message: "Login successful — credentials verified and working." });
      setTestJobId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/automation/portal-session/esic"] });
    } else if (polledJob.status === "failed" || polledJob.status === "cancelled") {
      setTestPhase("done");
      setTestResult({ ok: false, message: polledJob.errorMessage || "Login failed. Check your credentials." });
      setTestJobId(null);
    } else if (polledJob.status === "paused") {
      setCaptchaAnswer("");
      setTestPhase(polledJob.screenshotPath?.toLowerCase().includes("otp") ? "otp" : "captcha");
    } else if (polledJob.status === "running") {
      setTestPhase("running");
    }
  }, [polledJob?.status, polledJob?.screenshotPath]);

  const loginMutation = useMutation({
    mutationFn: async () => {
      if (!session?.configured || changingCreds) {
        if (!username || !password) throw new Error("Enter both username and password.");
        const saveRes = await apiRequest("POST", "/api/automation/portal-session", { portal: "esic", username, password, companyId: effectiveCid });
        await saveRes.json();
        await queryClient.invalidateQueries({ queryKey: ["/api/automation/portal-session/esic"] });
        setPassword("");
        setChangingCreds(false);
      }
      const res = await apiRequest("POST", "/api/automation/portal-session/test", { portal: "esic", companyId: effectiveCid });
      return res.json();
    },
    onSuccess: (data) => {
      setTestResult(null);
      setCaptchaAnswer("");
      setTestPhase("running");
      setTestJobId(data.jobId);
    },
    onError: (e: any) => toast({ title: "Login failed", description: e.message, variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/automation/jobs/${testJobId}/resume`, { answer: captchaAnswer });
      return res.json();
    },
    onSuccess: () => {
      setCaptchaAnswer("");
      setTestPhase("running");
    },
    onError: (e: any) => toast({ title: "Submit failed", description: e.message, variant: "destructive" }),
  });

  const screenshotUrl = polledJob?.screenshotPath
    ? (polledJob.screenshotPath.includes("/uploads/")
        ? "/uploads/" + polledJob.screenshotPath.split("/uploads/")[1]
        : `/uploads/automation-screenshots/${polledJob.screenshotPath.split("/").pop()}`)
    : null;

  const cancelTest = resetTest;

  const isTestActive = loginMutation.isPending || !!testJobId;

  const { data: runningJobs = [] } = useQuery<Array<{ id: string; status: string; jobType: string }>>({
    queryKey: ["/api/automation/jobs/running-esic", effectiveCid],
    queryFn: async () => {
      const res = await fetch(`/api/automation/jobs?companyId=${effectiveCid}&limit=10`, { credentials: "include" });
      if (!res.ok) return [];
      const raw = await res.json();
      const list: Array<{ id: string; status: string; jobType: string }> = Array.isArray(raw) ? raw : (raw.data ?? []);
      return list.filter(j => (j.status === "running" || j.status === "paused") && j.jobType.startsWith("esic_"));
    },
    enabled: !!effectiveCid,
    refetchInterval: testJobId ? false : 3000,
  });
  const latestRunningJob = testJobId ? null : (runningJobs[0] ?? null);
  const activeScreenJobId: string | null = testJobId ?? latestRunningJob?.id ?? null;
  const activeScreenActive = !!activeScreenJobId && (
    testJobId
      ? (testPhase === "running" || testPhase === "captcha" || testPhase === "otp")
      : !!latestRunningJob
  );
  const activeScreenLabel = testJobId
    ? (testPhase === "captcha" ? "CAPTCHA Required" : testPhase === "otp" ? "OTP Required" : "ESIC Portal — Live View")
    : latestRunningJob
      ? latestRunningJob.jobType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "ESIC Portal — Live View";

  if (activeScreenJobId) lastJobIdRef.current = activeScreenJobId;
  const displayJobId = activeScreenJobId ?? lastJobIdRef.current;
  // Keep polling active as long as we have a job to show — after job completes
  // the backend keeps the browser page open for 5 min (idle session) so the
  // live screen stays live instead of freezing on the last frame.
  const displayActive = activeScreenActive || !!displayJobId;

  return (
    <div className="space-y-5">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> ESIC Portal Login</CardTitle>
          <CardDescription>Credentials are AES-256-GCM encrypted. Login to start automating portal operations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium whitespace-nowrap shrink-0">Company</Label>
              <Select value={selectedCid} onValueChange={(v) => { setSelectedCid(v); resetTest(); setChangingCreds(false); }} data-testid="select-portal-esic-company">
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select a company…" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {isSuperAdmin && !effectiveCid ? (
            <p className="text-sm text-muted-foreground text-center py-4">Select a company above to manage its ESIC credentials.</p>
          ) : (
          <>
            {/* Saved-credentials banner */}
            {session?.configured && !changingCreds && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200 text-sm">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Saved as <strong>{session.username}</strong></span>
                  {session.lastLoginAt && <span className="text-green-600">(last login: {fmtDate(session.lastLoginAt)})</span>}
                </div>
                <button className="text-xs text-muted-foreground underline hover:no-underline shrink-0" onClick={() => { setChangingCreds(true); resetTest(); }} data-testid="button-esic-change-creds">
                  Change
                </button>
              </div>
            )}

            {/* Credential fields — only when not saved OR user is changing */}
            {(!session?.configured || changingCreds) && (
              <div className="space-y-3">
                <div>
                  <Label className="mb-1.5 block">ESIC Portal Username / Employer Code</Label>
                  <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter ESIC username" data-testid="input-esic-username" />
                </div>
                <div>
                  <Label className="mb-1.5 block">Password</Label>
                  <div className="relative">
                    <Input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter ESIC password" className="pr-10" data-testid="input-esic-password" />
                    <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPw(p => !p)}>
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {changingCreds && (
                  <button className="text-xs text-muted-foreground underline hover:no-underline" onClick={() => { setChangingCreds(false); setPassword(""); }}>
                    Cancel
                  </button>
                )}
              </div>
            )}

            {/* Single Login button */}
            {(testPhase === "idle" || testPhase === "done") && (
              <Button
                className="w-full"
                onClick={() => { resetTest(); loginMutation.mutate(); }}
                disabled={isTestActive || loginMutation.isPending || ((!session?.configured || changingCreds) && (!username || !password))}
                data-testid="button-esic-login"
              >
                {loginMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
                {loginMutation.isPending ? "Connecting…" : "Login to ESIC Portal"}
              </Button>
            )}

            {/* Running */}
            {testPhase === "running" && (
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Logging in to ESIC portal…</span>
                </div>
                <button onClick={cancelTest} className="text-xs text-blue-600 underline hover:no-underline shrink-0" data-testid="button-cancel-esic-test">Cancel</button>
              </div>
            )}

            {/* CAPTCHA or OTP */}
            {(testPhase === "captcha" || testPhase === "otp") && (
              <div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-orange-800 font-semibold text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {testPhase === "captcha" ? "CAPTCHA required — see Live View below" : "OTP required — check your registered mobile"}
                </div>
                <div className="space-y-2">
                  <Label className="text-orange-900 text-sm font-medium">
                    {testPhase === "captcha" ? "Enter the CAPTCHA:" : "Enter the OTP:"}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={captchaAnswer}
                      onChange={e => setCaptchaAnswer(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && captchaAnswer.trim()) resumeMutation.mutate(); }}
                      placeholder={testPhase === "captcha" ? "e.g. AB12CD" : "e.g. 123456"}
                      className="font-mono tracking-widest text-lg"
                      autoFocus
                      data-testid="input-esic-captcha"
                    />
                    <Button onClick={() => resumeMutation.mutate()} disabled={!captchaAnswer.trim() || resumeMutation.isPending} data-testid="button-esic-submit-captcha">
                      {resumeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
                    </Button>
                  </div>
                  <p className="text-xs text-orange-700">Press Enter or click Submit to continue.</p>
                </div>
              </div>
            )}

            {/* Result */}
            {testPhase === "done" && testResult && (
              <div className={`p-3 rounded-lg border text-sm ${testResult.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                <div className="flex items-start gap-2">
                  {testResult.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{testResult.ok ? "Login successful — portal is ready." : "Login failed"}</p>
                    {!testResult.ok && (
                      <>
                        <p className="mt-1 break-words whitespace-pre-wrap text-xs opacity-90" data-testid="esic-test-error-message">{testResult.message}</p>
                        <Button variant="outline" size="sm" className="mt-2 h-7 px-3 text-xs border-red-300 text-red-700 hover:bg-red-100"
                          onClick={() => { resetTest(); loginMutation.mutate(); }} disabled={isTestActive} data-testid="button-esic-retry-login">
                          <RefreshCw className="h-3 w-3 mr-1" /> Try again
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
          )}
        </CardContent>
      </Card>

      {/* ── Portal Live Monitor — ONE screen, always visible ── */}
      {displayJobId ? (
        <LiveScreen jobId={displayJobId} active={displayActive} label={activeScreenLabel} />
      ) : (
        <div className="rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-950 shadow-xl">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Monitor className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs text-slate-300 font-medium">ESIC Portal — Live View</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-slate-600" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">IDLE</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-600">
            <Monitor className="h-10 w-10" />
            <p className="text-sm">No automation running</p>
            <p className="text-xs text-center max-w-xs">Start any portal operation to see the live browser view here</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EsicPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const isSuperAdmin = user?.role === "super_admin";

  const { data: companies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isSuperAdmin,
  });

  const ALLOWED = ["super_admin", "company_admin", "hr_admin"];
  if (!user || !ALLOWED.includes(user.role)) {
    return <div className="p-6 text-center text-muted-foreground">You do not have permission to view this page.</div>;
  }

  const companyId = isSuperAdmin ? selectedCompanyId : (user.companyId ?? "");

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-600 rounded-lg">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ESIC Automation</h1>
            <p className="text-sm text-muted-foreground">Manage IP number generation, monthly filings, and ESIC compliance via automated portal workflows</p>
          </div>
        </div>
        {isSuperAdmin && (
          <div className="flex items-center gap-2 min-w-[220px]">
            <Label className="text-sm font-medium whitespace-nowrap">Company</Label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId} data-testid="select-esic-company">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a company…" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isSuperAdmin && !companyId ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Select a company above to view ESIC data</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap gap-0.5">
            <TabsTrigger value="dashboard" data-testid="tab-esic-dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="registration" data-testid="tab-esic-registration">Registration</TabsTrigger>
            <TabsTrigger value="contributions" data-testid="tab-esic-contributions">Contributions</TabsTrigger>
            <TabsTrigger value="returns" data-testid="tab-esic-returns">Monthly Filing</TabsTrigger>
            <TabsTrigger value="challans" data-testid="tab-esic-challans">Challans</TabsTrigger>
            <TabsTrigger value="bulk" data-testid="tab-esic-bulk">Bulk Upload</TabsTrigger>
            <TabsTrigger value="tools" data-testid="tab-esic-tools">Member Tools</TabsTrigger>
            <TabsTrigger value="employees" data-testid="tab-esic-employees">Employee List</TabsTrigger>
            <TabsTrigger value="portal" data-testid="tab-esic-portal">Portal Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4"><DashboardTab companyId={companyId} onTabChange={setActiveTab} /></TabsContent>
          <TabsContent value="registration" className="mt-4"><RegistrationTab companyId={companyId} /></TabsContent>
          <TabsContent value="contributions" className="mt-4"><ContributionsTab companyId={companyId} /></TabsContent>
          <TabsContent value="returns" className="mt-4"><MonthlyFilingTab companyId={companyId} /></TabsContent>
          <TabsContent value="challans" className="mt-4"><ChallanTab companyId={companyId} /></TabsContent>
          <TabsContent value="bulk" className="mt-4"><BulkUploadTab companyId={companyId} /></TabsContent>
          <TabsContent value="tools" className="mt-4"><MemberToolsTab companyId={companyId} /></TabsContent>
          <TabsContent value="employees" className="mt-4"><EmployeeListTab companyId={companyId} /></TabsContent>
          {/* Portal tab stays mounted always so live browser state survives tab switches */}
          <div className={`mt-4 ${activeTab !== "portal" ? "hidden" : ""}`}>
            <PortalSettingsTab companyId={companyId} isSuperAdmin={isSuperAdmin} companies={companies} />
          </div>
        </Tabs>
      )}
    </div>
  );
}
