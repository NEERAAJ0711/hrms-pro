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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
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
interface EpfoRegistration {
  id: string; companyId: string; employeeId: string;
  uan?: string | null; status: string; errorMessage?: string | null;
  employeeName?: string; employeeCode?: string; createdAt: string;
}
interface EcrReturn {
  id: string; companyId: string; month: string; year: number;
  status: string; totalEmployees: number; totalAmount: number;
  dueDate: string; trrn?: string | null; challanNo?: string | null;
  filedAt?: string | null; errorMessage?: string | null; jobId?: string | null;
}
interface Challan {
  id: string; companyId: string; portal: string; month: string; year: number;
  amount: number; status: string; trrn?: string | null; challanNo?: string | null;
  downloadUrl?: string | null; createdAt: string;
}
interface EmployeeRow {
  id: string; employeeCode: string; firstName: string; lastName: string;
  uan?: string | null; pfApplicable: boolean; status: string;
}
interface AutomationSummary {
  epfoRegistrations: number; pendingJobs: number; failedJobs: number;
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
  const triggerJob = useTriggerJob(["/api/epfo/registrations", "/api/epfo/ecr-returns", "/api/epfo/challans"]);

  const { data: summary } = useQuery<AutomationSummary>({
    queryKey: ["/api/automation/summary", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/automation/summary?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: recentReturns } = useQuery<{ data: EcrReturn[] }>({
    queryKey: ["/api/epfo/ecr-returns", companyId, 1],
    queryFn: async () => {
      const res = await fetch(`/api/epfo/ecr-returns?companyId=${companyId}&limit=5`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: recentJobs } = useQuery<{ data: Array<{ id: string; jobType: string; status: string; createdAt: string; errorMessage?: string | null }> }>({
    queryKey: ["/api/automation/jobs", companyId, "epfo", "recent"],
    queryFn: async () => {
      const params = new URLSearchParams({ companyId, limit: "8", jobType: "epfo" });
      const res = await fetch(`/api/automation/jobs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const now = new Date();
  const d15 = new Date(now.getFullYear(), now.getMonth() + 1, 15);
  const diffDays = Math.ceil((d15.getTime() - now.getTime()) / 86400000);
  const nextDue = `ECR due ${diffDays > 0 ? `in ${diffDays} day${diffDays !== 1 ? "s" : ""}` : "today"} (15th ${MONTHS[d15.getMonth()]})`;

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
          { label: "Registered Employees", value: summary?.epfoRegistrations ?? 0, icon: Users, color: "text-blue-600 bg-blue-50" },
          { label: "Pending Jobs", value: summary?.pendingJobs ?? 0, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
          { label: "Failed Jobs", value: summary?.failedJobs ?? 0, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
          { label: "Next Due Date", value: nextDue, icon: Activity, color: "text-green-600 bg-green-50", small: true },
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
      <Card className="bg-blue-50/40 border-blue-100">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-blue-800">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button size="sm" onClick={() => onTabChange("registration")} variant="outline" data-testid="qaction-go-register">
            <Users className="h-4 w-4 mr-1.5" /> Register Employees
          </Button>
          <Button size="sm" onClick={() => triggerJob.mutate({ jobType: "epfo_ecr_file", companyId, payload: { month: prevMonth, year: prevYear } })} disabled={triggerJob.isPending} variant="outline" data-testid="qaction-file-ecr">
            {triggerJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FileText className="h-4 w-4 mr-1.5" />}
            File ECR ({prevMonth} {prevYear})
          </Button>
          <Button size="sm" onClick={() => triggerJob.mutate({ jobType: "epfo_challan_download", companyId })} disabled={triggerJob.isPending} variant="outline" data-testid="qaction-sync-challans">
            <Download className="h-4 w-4 mr-1.5" /> Sync Challans
          </Button>
          <Button size="sm" onClick={() => onTabChange("portal")} variant="outline" data-testid="qaction-portal-settings">
            <Settings className="h-4 w-4 mr-1.5" /> Portal Settings
          </Button>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent ECR returns */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent ECR Returns</CardTitle>
          </CardHeader>
          <CardContent>
            {!recentReturns?.data?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No ECR returns filed yet</p>
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
  const [page, setPage] = useState(1);

  const triggerJob = useTriggerJob(["/api/epfo/registrations"]);

  const { data: employees, isLoading: loadingEmps } = useQuery<{ data: EmployeeRow[] }>({
    queryKey: ["/api/employees", companyId, "epfo"],
    queryFn: async () => {
      const res = await fetch(`/api/employees?companyId=${companyId}&limit=200`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const list: EmployeeRow[] = await res.json();
      return { data: list.filter(e => e.pfApplicable && e.status === "active") };
    },
  });

  const { data: regs, isLoading: loadingRegs } = useQuery<{ data: EpfoRegistration[]; total: number }>({
    queryKey: ["/api/epfo/registrations", companyId, page],
    queryFn: async () => {
      const res = await fetch(`/api/epfo/registrations?companyId=${companyId}&page=${page}&limit=20`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await apiRequest("POST", "/api/epfo/register-employee", { employeeId, companyId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Registration job queued" });
      queryClient.invalidateQueries({ queryKey: ["/api/epfo/registrations"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const regMap = new Map((regs?.data ?? []).map(r => [r.employeeId, r]));
  const emps = employees?.data ?? [];

  const toggleSelect = (id: string) =>
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const bulkRegister = () => {
    if (selected.size === 0) return;
    triggerJob.mutate({ jobType: "epfo_bulk_register", companyId, payload: { employees: emps.filter(e => selected.has(e.id)) } });
    setSelected(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{emps.length} PF-eligible active employees</p>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button size="sm" onClick={bulkRegister} disabled={triggerJob.isPending} data-testid="button-bulk-register">
              {triggerJob.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Bulk Register ({selected.size})
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><Checkbox checked={selected.size === emps.length && emps.length > 0} onCheckedChange={v => setSelected(v ? new Set(emps.map(e => e.id)) : new Set())} data-testid="checkbox-select-all" /></TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>UAN</TableHead>
              <TableHead>Registration Status</TableHead>
              <TableHead className="w-32">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(loadingEmps || loadingRegs) ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : emps.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No PF-eligible employees found</TableCell></TableRow>
            ) : emps.map(emp => {
              const reg = regMap.get(emp.id);
              return (
                <TableRow key={emp.id} data-testid={`row-emp-epfo-${emp.id}`}>
                  <TableCell><Checkbox checked={selected.has(emp.id)} onCheckedChange={() => toggleSelect(emp.id)} data-testid={`checkbox-emp-${emp.id}`} /></TableCell>
                  <TableCell className="font-mono text-sm">{emp.employeeCode}</TableCell>
                  <TableCell>{emp.firstName} {emp.lastName}</TableCell>
                  <TableCell className="font-mono text-sm">{reg?.uan ?? emp.uan ?? "—"}</TableCell>
                  <TableCell>{reg ? statusBadge(reg.status) : <Badge variant="outline" className="bg-gray-50 text-gray-500 text-xs">Not Registered</Badge>}</TableCell>
                  <TableCell>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => registerMutation.mutate(emp.id)}
                      disabled={registerMutation.isPending}
                      data-testid={`button-register-emp-${emp.id}`}
                    >
                      {reg?.status === "registered" ? "Re-register" : "Register"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex gap-2 justify-end text-sm text-muted-foreground">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={(regs?.data?.length ?? 0) < 20} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
    </div>
  );
}

// ─── Return Filing Tab ────────────────────────────────────────────────────────
function ReturnFilingTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(MONTHS[new Date().getMonth() === 0 ? 11 : new Date().getMonth() - 1]);
  const [year, setYear] = useState(new Date().getMonth() === 0 ? CURRENT_YEAR - 1 : CURRENT_YEAR);

  const { data, isLoading } = useQuery<{ data: EcrReturn[] }>({
    queryKey: ["/api/epfo/ecr-returns", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/epfo/ecr-returns?companyId=${companyId}&limit=12`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const fileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/epfo/file-ecr", { month, year, companyId });
      return res.json();
    },
    onSuccess: data => {
      toast({ title: "ECR filing job queued", description: `Job ID: ${data.jobId?.slice(0, 8)}` });
      queryClient.invalidateQueries({ queryKey: ["/api/epfo/ecr-returns"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reportUrl = `/api/epfo/reports/contribution?month=${month}&year=${year}&companyId=${companyId}&format=excel`;

  return (
    <div className="space-y-5">
      <Card className="bg-muted/30">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-36" data-testid="select-ecr-month"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Year</Label>
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger className="w-28" data-testid="select-ecr-year"><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={() => fileMutation.mutate()} disabled={fileMutation.isPending} data-testid="button-file-ecr">
              {fileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              File ECR for {month} {year}
            </Button>
            <a href={reportUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" data-testid="button-download-ecr-report">
                <Download className="h-4 w-4 mr-2" /> PF Report (Excel)
              </Button>
            </a>
            <a href={`${reportUrl.replace("format=excel","format=pdf")}`} target="_blank" rel="noreferrer">
              <Button variant="outline" data-testid="button-download-ecr-pdf">
                <FileText className="h-4 w-4 mr-2" /> PF Report (PDF)
              </Button>
            </a>
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
              <TableHead>TRRN</TableHead>
              <TableHead>Filed At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : !data?.data?.length ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No ECR returns found. Use the button above to file for a month.</TableCell></TableRow>
            ) : data.data.map(r => (
              <TableRow key={r.id} data-testid={`row-ecr-${r.id}`}>
                <TableCell className="font-medium">{r.month} {r.year}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
                <TableCell>{r.totalEmployees}</TableCell>
                <TableCell>{fmt(r.totalAmount)}</TableCell>
                <TableCell>{fmtDate(r.dueDate)}</TableCell>
                <TableCell className="font-mono text-sm">{r.trrn ?? "—"}</TableCell>
                <TableCell>{fmtDate(r.filedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Challan Management Tab ───────────────────────────────────────────────────
function ChallanTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const triggerJob = useTriggerJob(["/api/epfo/challans"]);

  const { data, isLoading } = useQuery<{ data: Challan[] }>({
    queryKey: ["/api/epfo/challans", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/epfo/challans?companyId=${companyId}&limit=30`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => triggerJob.mutate({ jobType: "epfo_challan_download", companyId })}
          disabled={triggerJob.isPending}
          data-testid="button-sync-challans"
        >
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
              <TableHead>TRRN</TableHead>
              <TableHead>Challan No</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Download</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : !data?.data?.length ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No challans downloaded yet. Click "Sync Challans" to fetch from the portal.</TableCell></TableRow>
            ) : data.data.map(c => (
              <TableRow key={c.id} data-testid={`row-challan-epfo-${c.id}`}>
                <TableCell className="font-medium">{c.month} {c.year}</TableCell>
                <TableCell>{statusBadge(c.status)}</TableCell>
                <TableCell>{fmt(c.amount)}</TableCell>
                <TableCell className="font-mono text-sm">{c.trrn ?? "—"}</TableCell>
                <TableCell className="font-mono text-sm">{c.challanNo ?? "—"}</TableCell>
                <TableCell>{fmtDate(c.createdAt)}</TableCell>
                <TableCell>
                  {c.downloadUrl ? (
                    <a href={c.downloadUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" data-testid={`button-download-challan-${c.id}`}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Download
                      </Button>
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
  const triggerJob = useTriggerJob(["/api/epfo/registrations"]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ code: string; name: string; uan: string; valid: boolean }[]>([]);
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
      const uanIdx = hdrs.findIndex(h => h.includes("uan"));
      const items = rows.slice(1).filter(r => r[codeIdx]).map(r => ({
        code: String(r[codeIdx] ?? "").trim(),
        name: String(r[nameIdx] ?? "").trim(),
        uan: String(r[uanIdx] ?? "").trim(),
        valid: !!String(r[codeIdx] ?? "").trim(),
      }));
      setPreview(items);
      setParsed(true);
    } catch (err: any) {
      toast({ title: "Parse error", description: err.message, variant: "destructive" });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([["Employee Code","Employee Name","UAN (if existing)"],["EMP001","John Doe",""],["EMP002","Jane Smith","100234567890"]]);
    ws["!cols"] = [{ wch: 18 },{ wch: 28 },{ wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "EPFO Bulk Register");
    XLSX.writeFile(wb, "epfo_bulk_register_template.xlsx");
    toast({ title: "Template downloaded" });
  };

  const submit = () => {
    const validRows = preview.filter(r => r.valid);
    if (!validRows.length) return;
    triggerJob.mutate({ jobType: "epfo_bulk_register", companyId, payload: { employees: validRows } });
    setPreview([]); setParsed(false);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <Card className="bg-muted/30">
        <CardContent className="pt-5 pb-4 space-y-3">
          <p className="text-sm text-muted-foreground">Upload an Excel file with employee codes to bulk-register for EPFO (UAN generation). Download the template first to see the required format.</p>
          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" onClick={downloadTemplate} data-testid="button-download-epfo-template">
              <Download className="h-4 w-4 mr-2" /> Download Template
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="button-upload-epfo-bulk">
              <Upload className="h-4 w-4 mr-2" /> Select Excel File
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={parseFile} />
          </div>
        </CardContent>
      </Card>

      {parsed && preview.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preview — {preview.length} rows</CardTitle>
            <CardDescription>{preview.filter(r => r.valid).length} valid rows will be queued</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Valid</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>UAN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r, i) => (
                    <TableRow key={i} className={!r.valid ? "bg-red-50" : ""}>
                      <TableCell>{r.valid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}</TableCell>
                      <TableCell className="font-mono text-sm">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="font-mono text-sm">{r.uan || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex gap-3">
              <Button onClick={submit} disabled={triggerJob.isPending} data-testid="button-submit-epfo-bulk">
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

// ─── KYC Tab ──────────────────────────────────────────────────────────────────
function KycTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const triggerJob = useTriggerJob();
  const [uan, setUan] = useState("");
  const [kycType, setKycType] = useState<"aadhaar" | "pan" | "bank">("aadhaar");
  const [aadhaarNo, setAadhaarNo] = useState("");
  const [panNo, setPanNo] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const { data: regs } = useQuery<{ data: EpfoRegistration[]; total: number }>({
    queryKey: ["/api/epfo/registrations", companyId, "kyc"],
    queryFn: async () => {
      const res = await fetch(`/api/epfo/registrations?companyId=${companyId}&page=1&limit=200`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: activeJob } = useQuery<{ id: string; status: string; result?: Record<string, unknown>; errorMessage?: string }>({
    queryKey: ["/api/automation/jobs", activeJobId],
    queryFn: async () => { const res = await apiRequest("GET", `/api/automation/jobs/${activeJobId}`); return res.json(); },
    enabled: !!activeJobId && polling,
    refetchInterval: polling ? 3000 : false,
  });

  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === "completed") { setPolling(false); setActiveJobId(null); toast({ title: "KYC Updated", description: "KYC updated on EPFO portal" }); }
    else if (activeJob.status === "failed") { setPolling(false); setActiveJobId(null); toast({ title: "KYC Update Failed", description: activeJob.errorMessage ?? "Error", variant: "destructive" }); }
  }, [activeJob?.status]);

  const registeredEmps = (regs?.data ?? []).filter(r => r.uan && r.status === "registered");
  const isBusy = triggerJob.isPending || polling;
  const canSubmit = !!uan && !isBusy && (
    (kycType === "aadhaar" && aadhaarNo.length === 12) ||
    (kycType === "pan" && panNo.length === 10) ||
    (kycType === "bank" && !!accountNo && !!ifsc)
  );

  const handleSubmit = () => {
    const jobTypeMap = { aadhaar: "epfo_kyc_aadhaar", pan: "epfo_kyc_pan", bank: "epfo_kyc_bank" } as const;
    const payloadMap: Record<string, Record<string, string>> = {
      aadhaar: { uan, aadhaarNo },
      pan: { uan, panNo },
      bank: { uan, accountNo, ifsc, bankName },
    };
    triggerJob.mutate(
      { jobType: jobTypeMap[kycType], companyId, payload: payloadMap[kycType] },
      { onSuccess: j => { setActiveJobId(j.id); setPolling(true); } }
    );
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            KYC Management
          </CardTitle>
          <CardDescription>Update Aadhaar, PAN, or Bank KYC for any EPFO member directly on the portal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 max-w-md">
            <div className="space-y-1">
              <Label>UAN</Label>
              <Input value={uan} onChange={e => setUan(e.target.value)} placeholder="Enter UAN" data-testid="input-kyc-uan" />
              {registeredEmps.length > 0 && (
                <Select onValueChange={setUan}>
                  <SelectTrigger className="text-xs h-8 mt-1"><SelectValue placeholder="Or pick from registered employees…" /></SelectTrigger>
                  <SelectContent>
                    {registeredEmps.map(r => (
                      <SelectItem key={r.id} value={r.uan!}>{r.employeeName ?? r.employeeCode} — {r.uan}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label>KYC Type</Label>
              <Select value={kycType} onValueChange={v => setKycType(v as "aadhaar" | "pan" | "bank")}>
                <SelectTrigger data-testid="select-kyc-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aadhaar">Aadhaar</SelectItem>
                  <SelectItem value="pan">PAN</SelectItem>
                  <SelectItem value="bank">Bank Account</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kycType === "aadhaar" && (
              <div className="space-y-1">
                <Label>Aadhaar Number</Label>
                <Input value={aadhaarNo} onChange={e => setAadhaarNo(e.target.value.replace(/\D/g,""))} placeholder="12-digit Aadhaar" maxLength={12} data-testid="input-kyc-aadhaar" />
              </div>
            )}
            {kycType === "pan" && (
              <div className="space-y-1">
                <Label>PAN Number</Label>
                <Input value={panNo} onChange={e => setPanNo(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} data-testid="input-kyc-pan" />
              </div>
            )}
            {kycType === "bank" && (<>
              <div className="space-y-1">
                <Label>Account Number</Label>
                <Input value={accountNo} onChange={e => setAccountNo(e.target.value)} placeholder="Bank account number" data-testid="input-kyc-account" />
              </div>
              <div className="space-y-1">
                <Label>IFSC Code</Label>
                <Input value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} placeholder="SBIN0001234" maxLength={11} data-testid="input-kyc-ifsc" />
              </div>
              <div className="space-y-1">
                <Label>Bank Name</Label>
                <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. State Bank of India" data-testid="input-kyc-bankname" />
              </div>
            </>)}
            <Button onClick={handleSubmit} disabled={!canSubmit} data-testid="btn-kyc-submit">
              {isBusy ? "Updating on portal…" : "Update KYC on Portal"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Member Tools Tab (TRRN / Passbook / Exit) ────────────────────────────────
function MemberToolsTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const triggerJob = useTriggerJob();

  // TRRN Track
  const [trrn, setTrrn] = useState("");
  const [trrnJobId, setTrrnJobId] = useState<string | null>(null);
  const [trrnPolling, setTrrnPolling] = useState(false);
  const [trrnResult, setTrrnResult] = useState<Record<string,unknown>|null>(null);

  // Passbook
  const [passUan, setPassUan] = useState("");
  const [passJobId, setPassJobId] = useState<string | null>(null);
  const [passPolling, setPassPolling] = useState(false);
  const [passResult, setPassResult] = useState<Record<string,unknown>|null>(null);

  // Exit Management
  const [exitUan, setExitUan] = useState("");
  const [exitDate, setExitDate] = useState("");
  const [exitReason, setExitReason] = useState("Resignation");
  const [exitJobId, setExitJobId] = useState<string | null>(null);
  const [exitPolling, setExitPolling] = useState(false);

  const { data: trrnJob } = useQuery<{ id: string; status: string; result?: Record<string,unknown>; errorMessage?: string }>({
    queryKey: ["/api/automation/jobs", trrnJobId, "trrn"],
    queryFn: async () => { const res = await apiRequest("GET", `/api/automation/jobs/${trrnJobId}`); return res.json(); },
    enabled: !!trrnJobId && trrnPolling, refetchInterval: trrnPolling ? 3000 : false,
  });
  const { data: passJob } = useQuery<{ id: string; status: string; result?: Record<string,unknown>; errorMessage?: string }>({
    queryKey: ["/api/automation/jobs", passJobId, "pass"],
    queryFn: async () => { const res = await apiRequest("GET", `/api/automation/jobs/${passJobId}`); return res.json(); },
    enabled: !!passJobId && passPolling, refetchInterval: passPolling ? 3000 : false,
  });
  const { data: exitJob } = useQuery<{ id: string; status: string; result?: Record<string,unknown>; errorMessage?: string }>({
    queryKey: ["/api/automation/jobs", exitJobId, "exit"],
    queryFn: async () => { const res = await apiRequest("GET", `/api/automation/jobs/${exitJobId}`); return res.json(); },
    enabled: !!exitJobId && exitPolling, refetchInterval: exitPolling ? 3000 : false,
  });

  useEffect(() => {
    if (!trrnJob) return;
    if (trrnJob.status === "completed") { setTrrnPolling(false); setTrrnJobId(null); setTrrnResult(trrnJob.result ?? null); }
    else if (trrnJob.status === "failed") { setTrrnPolling(false); setTrrnJobId(null); toast({ title: "TRRN tracking failed", description: trrnJob.errorMessage ?? "Error", variant: "destructive" }); }
  }, [trrnJob?.status]);

  useEffect(() => {
    if (!passJob) return;
    if (passJob.status === "completed") { setPassPolling(false); setPassJobId(null); setPassResult(passJob.result ?? null); }
    else if (passJob.status === "failed") { setPassPolling(false); setPassJobId(null); toast({ title: "Passbook check failed", description: passJob.errorMessage ?? "Error", variant: "destructive" }); }
  }, [passJob?.status]);

  useEffect(() => {
    if (!exitJob) return;
    if (exitJob.status === "completed") { setExitPolling(false); setExitJobId(null); toast({ title: "Exit recorded", description: `Exit for UAN ${exitUan} submitted on portal` }); }
    else if (exitJob.status === "failed") { setExitPolling(false); setExitJobId(null); toast({ title: "Exit management failed", description: exitJob.errorMessage ?? "Error", variant: "destructive" }); }
  }, [exitJob?.status]);

  return (
    <div className="space-y-5">
      {/* TRRN Tracker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" />
            TRRN Status Tracker
          </CardTitle>
          <CardDescription>Check payment status of a TRRN (Temporary Return Receipt Number) on the EPFO portal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 max-w-md">
            <Input value={trrn} onChange={e => setTrrn(e.target.value)} placeholder="Enter TRRN" data-testid="input-trrn" />
            <Button
              onClick={() => triggerJob.mutate(
                { jobType: "epfo_trrn_track", companyId, payload: { trrn } },
                { onSuccess: j => { setTrrnJobId(j.id); setTrrnPolling(true); setTrrnResult(null); } }
              )}
              disabled={!trrn || trrnPolling || triggerJob.isPending}
              data-testid="btn-trrn-track"
            >
              {trrnPolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-1">Track</span>
            </Button>
          </div>
          {trrnResult && (
            <div className="rounded border bg-muted/40 p-4 text-sm space-y-1 max-w-md">
              <p><span className="font-medium">TRRN:</span> {String(trrnResult.trrn ?? "—")}</p>
              <p><span className="font-medium">Status:</span> {String(trrnResult.status ?? "—")}</p>
              <p><span className="font-medium">Amount:</span> {String(trrnResult.amount ?? "—")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Passbook Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            Passbook Status
          </CardTitle>
          <CardDescription>Check PF passbook and contribution history for a member by UAN</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 max-w-md">
            <Input value={passUan} onChange={e => setPassUan(e.target.value)} placeholder="Enter UAN" data-testid="input-passbook-uan" />
            <Button
              onClick={() => triggerJob.mutate(
                { jobType: "epfo_passbook_status", companyId, payload: { uan: passUan } },
                { onSuccess: j => { setPassJobId(j.id); setPassPolling(true); setPassResult(null); } }
              )}
              disabled={!passUan || passPolling || triggerJob.isPending}
              data-testid="btn-passbook-check"
            >
              {passPolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-1">Check</span>
            </Button>
          </div>
          {passResult && (
            <div className="rounded border bg-muted/40 p-4 text-sm space-y-2 max-w-2xl">
              <p><span className="font-medium">UAN:</span> {String(passResult.uan ?? "—")}</p>
              <p><span className="font-medium">Status:</span> {String(passResult.status ?? "—")}</p>
              {Array.isArray(passResult.tableRows) && (passResult.tableRows as string[][]).length > 0 && (
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-xs border-collapse">
                    <tbody>
                      {(passResult.tableRows as string[][]).map((row, i) => (
                        <tr key={i} className="border-b">
                          {row.map((cell, j) => <td key={j} className="px-2 py-1.5">{cell}</td>)}
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

      {/* Exit Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600" />
            Exit Management
          </CardTitle>
          <CardDescription>Record an employee's date of exit on the EPFO portal</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 max-w-md">
            <div className="space-y-1">
              <Label>UAN</Label>
              <Input value={exitUan} onChange={e => setExitUan(e.target.value)} placeholder="Member UAN" data-testid="input-exit-uan" />
            </div>
            <div className="space-y-1">
              <Label>Date of Exit</Label>
              <Input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} data-testid="input-exit-date" />
            </div>
            <div className="space-y-1">
              <Label>Exit Reason</Label>
              <Select value={exitReason} onValueChange={setExitReason}>
                <SelectTrigger data-testid="select-exit-reason"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Resignation","Superannuation","Retrenchment","Retirement Under EPS","Permanent Total Disablement","Death"].map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => triggerJob.mutate(
                { jobType: "epfo_exit_management", companyId, payload: { uan: exitUan, exitDate, exitReason } },
                { onSuccess: j => { setExitJobId(j.id); setExitPolling(true); } }
              )}
              disabled={!exitUan || !exitDate || exitPolling || triggerJob.isPending}
              data-testid="btn-exit-submit"
            >
              {exitPolling ? "Processing on portal…" : "Submit Exit"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Employee List Tab ────────────────────────────────────────────────────────
function EmployeeListTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const triggerJob = useTriggerJob(["/api/automation/portal-employee-list/epfo"]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const queryClient = useQueryClient();

  // Latest saved result
  const { data: saved, isLoading: loadingSaved } = useQuery<{
    data: { employees: Record<string, string>[]; count: number; fetchedAt: string } | null;
    job: { id: string; completedAt: string } | null;
  }>({
    queryKey: ["/api/automation/portal-employee-list/epfo", companyId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/automation/portal-employee-list/epfo?companyId=${companyId}`);
      return res.json();
    },
    refetchInterval: false,
  });

  // Check portal credentials
  const { data: portalSession } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/automation/portal-session/epfo", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/automation/portal-session/epfo?companyId=${companyId}`, { credentials: "include" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/automation/portal-employee-list/epfo", companyId] });
      toast({ title: "Member list fetched", description: `${activeJob.result?.count ?? 0} members loaded from EPFO portal` });
    } else if (activeJob.status === "failed") {
      setPolling(false);
      setActiveJobId(null);
      toast({ title: "Fetch failed", description: activeJob.errorMessage || "Could not fetch member list from EPFO portal.", variant: "destructive" });
    }
  }, [activeJob?.status]);

  const handleFetch = () => {
    triggerJob.mutate(
      { jobType: "epfo_employee_list", companyId, payload: {} },
      {
        onSuccess: (job) => {
          setActiveJobId(job.id);
          setPolling(true);
        },
      }
    );
  };

  const employees = saved?.data?.employees ?? [];
  const columns = employees.length > 0 ? Object.keys(employees[0]) : [];
  const [search, setSearch] = useState("");
  const filtered = search
    ? employees.filter((e) => Object.values(e).some((v) => v.toLowerCase().includes(search.toLowerCase())))
    : employees;

  const handleExport = () => {
    if (!employees.length) return;
    const ws = XLSX.utils.json_to_sheet(employees);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "EPFO Members");
    XLSX.writeFile(wb, `epfo-members-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const isBusy = triggerJob.isPending || polling;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            EPFO Member List
          </CardTitle>
          <CardDescription>
            Fetch the latest registered member list from the EPFO Unified Portal.
            {saved?.data && (
              <span className="ml-2 text-blue-600 font-medium">
                Last fetched: {new Date(saved.data.fetchedAt).toLocaleString()} — {saved.data.count} members
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {portalSession && !portalSession.configured && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>EPFO portal not configured — go to the <strong>Portal Settings</strong> tab to add credentials first.</span>
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleFetch} disabled={isBusy} data-testid="btn-epfo-fetch-employee-list">
              {isBusy ? "Fetching from portal…" : "Fetch from Portal"}
            </Button>
            {employees.length > 0 && (
              <Button variant="outline" onClick={handleExport} data-testid="btn-epfo-export-employee-list">
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
              {filtered.length} of {employees.length} members
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search by name, UAN, status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-epfo-member-search"
              className="max-w-sm"
            />
            <div className="overflow-x-auto rounded border text-sm">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    {columns.map((col) => (
                      <th key={col} className="text-left px-3 py-2 whitespace-nowrap font-medium text-muted-foreground">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((emp, i) => (
                    <tr key={i} className="border-t hover:bg-muted/40" data-testid={`row-epfo-member-${i}`}>
                      {columns.map((col) => (
                        <td key={col} className="px-3 py-2 whitespace-nowrap">
                          {emp[col] ?? "—"}
                        </td>
                      ))}
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
            No data yet. Click "Fetch from Portal" to load the member list from EPFO.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Portal Settings Dialog ───────────────────────────────────────────────────
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
  const [testJobId, setTestJobId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [testPhase, setTestPhase] = useState<"idle" | "running" | "captcha" | "otp" | "done">("idle");
  const [selectedCid, setSelectedCid] = useState(companyId);
  const lastJobIdRef = useRef<string | null>(null);

  useEffect(() => { setSelectedCid(companyId); }, [companyId]);

  const effectiveCid = isSuperAdmin ? selectedCid : companyId;

  const resetTest = () => { setTestPhase("idle"); setTestResult(null); setTestJobId(null); setCaptchaAnswer(""); lastJobIdRef.current = null; };

  const { data: session } = useQuery<{ configured: boolean; username?: string; lastLoginAt?: string }>({
    queryKey: ["/api/automation/portal-session/epfo", effectiveCid],
    queryFn: async () => {
      const res = await fetch(`/api/automation/portal-session/epfo?companyId=${effectiveCid}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!effectiveCid,
  });

  // Pre-populate username whenever saved session data loads / changes
  useEffect(() => {
    if (session?.username) setUsername(session.username);
  }, [session?.username]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/automation/portal-session/epfo"] });
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/automation/portal-session", { portal: "epfo", username, password, companyId: effectiveCid });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "EPFO credentials saved", description: "Credentials encrypted and stored securely." });
      setPassword("");               // clear password only — keep username visible
      queryClient.invalidateQueries({ queryKey: ["/api/automation/portal-session/epfo"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/automation/portal-session/test", { portal: "epfo", companyId: effectiveCid });
      return res.json();
    },
    onSuccess: (data) => {
      setTestResult(null);
      setCaptchaAnswer("");
      setTestPhase("running");
      setTestJobId(data.jobId);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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

  // Client-side 90s safety net: if the job is still "running" after 90 seconds
  // (portal unreachable, Chromium can't start, etc.) stop the spinner and tell the user.
  useEffect(() => {
    if (testPhase !== "running") return;
    const timer = setTimeout(() => {
      setTestPhase("done");
      setTestResult({ ok: false, message: "Portal automation timed out after 90 seconds. The EPFO portal may be slow or unreachable from the server. Try again or click 'Open Portal' to log in manually." });
      setTestJobId(null);
    }, 90_000);
    return () => clearTimeout(timer);
  }, [testPhase]);

  const cancelTest = resetTest;

  const isTestActive = testMutation.isPending || !!testJobId;

  const { data: runningJobs = [] } = useQuery<Array<{ id: string; status: string; jobType: string }>>({
    queryKey: ["/api/automation/jobs/running-epfo", effectiveCid],
    queryFn: async () => {
      const res = await fetch(`/api/automation/jobs?companyId=${effectiveCid}&limit=10`, { credentials: "include" });
      if (!res.ok) return [];
      const raw = await res.json();
      const list: Array<{ id: string; status: string; jobType: string }> = Array.isArray(raw) ? raw : (raw.data ?? []);
      return list.filter(j => j.status === "running" || j.status === "paused");
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
    ? (testPhase === "captcha" ? "CAPTCHA Required" : testPhase === "otp" ? "OTP Required" : "EPFO Portal — Live View")
    : latestRunningJob
      ? latestRunningJob.jobType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "EPFO Portal — Live View";

  if (activeScreenJobId) lastJobIdRef.current = activeScreenJobId;
  const displayJobId = activeScreenJobId ?? lastJobIdRef.current;
  const displayActive = !!activeScreenJobId && activeScreenActive;

  return (
    <div className="space-y-5">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> EPFO Portal Credentials</CardTitle>
          <CardDescription>Credentials are AES-256-GCM encrypted before storage. Never stored in plain text.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium whitespace-nowrap shrink-0">Company</Label>
              <Select value={selectedCid} onValueChange={(v) => { setSelectedCid(v); resetTest(); }} data-testid="select-portal-epfo-company">
                <SelectTrigger className="flex-1">
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
          {isSuperAdmin && !effectiveCid ? (
            <p className="text-sm text-muted-foreground text-center py-4">Select a company above to manage its EPFO credentials.</p>
          ) : (
          <>
          {session?.configured && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              Portal configured — username: {session.username}
              {session.lastLoginAt && <span className="text-green-600 ml-1">(last login: {fmtDate(session.lastLoginAt)})</span>}
            </div>
          )}

          <div>
            <Label className="mb-1.5 block">UAN Portal Username / Establishment ID</Label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter EPFO username" data-testid="input-epfo-username" />
          </div>
          <div>
            <Label className="mb-1.5 block">Password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder={session?.configured ? "Saved — type to change" : "Enter EPFO password"}
                className="pr-10"
                data-testid="input-epfo-password"
              />
              <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPw(p => !p)}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => saveMutation.mutate()} disabled={!username || saveMutation.isPending} data-testid="button-save-epfo-credentials">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Settings className="h-4 w-4 mr-2" />}
              Save Credentials
            </Button>
            {session?.configured && (
              <Button variant="outline" onClick={() => { setTestResult(null); setTestPhase("idle"); testMutation.mutate(); }} disabled={isTestActive} data-testid="button-test-epfo-login">
                {isTestActive && testPhase === "running" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
                {isTestActive ? "Testing…" : "Test Login"}
              </Button>
            )}
            <a href="https://unifiedportal-emp.epfindia.gov.in/epfo/" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" type="button" data-testid="button-open-epfo-portal">
                <Download className="h-4 w-4 mr-2 rotate-180" />
                Open Portal
              </Button>
            </a>
          </div>

          {/* Step 1: running — filling credentials on portal */}
          {testPhase === "running" && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>Opening EPFO portal and filling username &amp; password automatically…</span>
              </div>
              <button onClick={cancelTest} className="text-xs text-blue-600 underline hover:no-underline shrink-0" data-testid="button-cancel-epfo-test">Cancel</button>
            </div>
          )}

          {/* Step 2: CAPTCHA or OTP required */}
          {(testPhase === "captcha" || testPhase === "otp") && (
            <div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-orange-800 font-semibold text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {testPhase === "captcha"
                  ? "CAPTCHA required — see the Live View below for the verification image"
                  : "OTP required — check the mobile number registered with EPFO"}
              </div>
              <div className="space-y-2">
                <Label className="text-orange-900 text-sm font-medium">
                  {testPhase === "captcha" ? "Enter the CAPTCHA shown in the Live View below:" : "Enter the OTP sent to your registered mobile:"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={captchaAnswer}
                    onChange={e => setCaptchaAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && captchaAnswer.trim()) resumeMutation.mutate(); }}
                    placeholder={testPhase === "captcha" ? "e.g. AB12CD" : "e.g. 123456"}
                    className="font-mono tracking-widest text-lg"
                    autoFocus
                    data-testid="input-epfo-captcha"
                  />
                  <Button
                    onClick={() => resumeMutation.mutate()}
                    disabled={!captchaAnswer.trim() || resumeMutation.isPending}
                    data-testid="button-epfo-submit-captcha"
                  >
                    {resumeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
                  </Button>
                </div>
                <p className="text-xs text-orange-700">Press Enter or click Submit — automation will continue automatically.</p>
              </div>
            </div>
          )}

          {/* Step 3: final result */}
          {testPhase === "done" && testResult && (
            <div className={`p-3 rounded-lg border text-sm ${testResult.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
              <div className="flex items-start gap-2">
                {testResult.ok
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {testResult.ok ? "Login successful — credentials verified and working." : "Login failed"}
                  </p>
                  {!testResult.ok && (
                    <>
                      <p className="mt-1 break-words whitespace-pre-wrap text-xs opacity-90" data-testid="epfo-test-error-message">
                        {testResult.message}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 px-3 text-xs border-red-300 text-red-700 hover:bg-red-100"
                        onClick={() => { resetTest(); testMutation.mutate(); }}
                        disabled={isTestActive}
                        data-testid="button-epfo-retry-login"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Try again
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
              <span className="text-xs text-slate-300 font-medium">EPFO Portal — Live View</span>
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
export default function EpfoPage() {
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
          <div className="p-2 bg-blue-600 rounded-lg">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">EPFO Automation</h1>
            <p className="text-sm text-muted-foreground">Manage UAN generation, ECR filing, and PF compliance via automated portal workflows</p>
          </div>
        </div>
        {isSuperAdmin && (
          <div className="flex items-center gap-2 min-w-[220px]">
            <Label className="text-sm font-medium whitespace-nowrap">Company</Label>
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId} data-testid="select-epfo-company">
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
            <p className="font-medium">Select a company above to view EPFO data</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap gap-0.5">
            <TabsTrigger value="dashboard" data-testid="tab-epfo-dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="registration" data-testid="tab-epfo-registration">Registration</TabsTrigger>
            <TabsTrigger value="kyc" data-testid="tab-epfo-kyc">KYC</TabsTrigger>
            <TabsTrigger value="returns" data-testid="tab-epfo-returns">Return Filing</TabsTrigger>
            <TabsTrigger value="challans" data-testid="tab-epfo-challans">Challans</TabsTrigger>
            <TabsTrigger value="bulk" data-testid="tab-epfo-bulk">Bulk Upload</TabsTrigger>
            <TabsTrigger value="tools" data-testid="tab-epfo-tools">Member Tools</TabsTrigger>
            <TabsTrigger value="employees" data-testid="tab-epfo-employees">Employee List</TabsTrigger>
            <TabsTrigger value="portal" data-testid="tab-epfo-portal">Portal Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4"><DashboardTab companyId={companyId} onTabChange={setActiveTab} /></TabsContent>
          <TabsContent value="registration" className="mt-4"><RegistrationTab companyId={companyId} /></TabsContent>
          <TabsContent value="returns" className="mt-4"><ReturnFilingTab companyId={companyId} /></TabsContent>
          <TabsContent value="challans" className="mt-4"><ChallanTab companyId={companyId} /></TabsContent>
          <TabsContent value="kyc" className="mt-4"><KycTab companyId={companyId} /></TabsContent>
          <TabsContent value="bulk" className="mt-4"><BulkUploadTab companyId={companyId} /></TabsContent>
          <TabsContent value="tools" className="mt-4"><MemberToolsTab companyId={companyId} /></TabsContent>
          <TabsContent value="employees" className="mt-4"><EmployeeListTab companyId={companyId} /></TabsContent>
          <TabsContent value="portal" className="mt-4"><PortalSettingsTab companyId={companyId} isSuperAdmin={isSuperAdmin} companies={companies} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
