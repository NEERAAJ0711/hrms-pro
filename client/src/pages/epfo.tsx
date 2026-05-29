import { useState, useRef } from "react";
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
  Eye, EyeOff, Lock,
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
    triggerJob.mutate({ jobType: "epfo_bulk_register", companyId, payload: { employeeIds: Array.from(selected) } });
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
    const validCodes = preview.filter(r => r.valid).map(r => r.code);
    if (!validCodes.length) return;
    triggerJob.mutate({ jobType: "epfo_bulk_register", companyId, payload: { employeeCodes: validCodes } });
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

// ─── Portal Settings Dialog ───────────────────────────────────────────────────
function PortalSettingsTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const { data: session } = useQuery<{ configured: boolean; username?: string; lastLoginAt?: string }>({
    queryKey: ["/api/automation/portal-session/epfo", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/automation/portal-session/epfo?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/automation/portal-session", { portal: "epfo", username, password, companyId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "EPFO credentials saved", description: "Credentials encrypted and stored securely." });
      setPassword(""); setUsername("");
      queryClient.invalidateQueries({ queryKey: ["/api/automation/portal-session/epfo"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/automation/portal-session/test", { portal: "epfo", companyId });
      return res.json();
    },
    onSuccess: data => toast({ title: "Test login queued", description: `Job #${data.jobId?.slice(0, 8)}` }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5 max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> EPFO Portal Credentials</CardTitle>
          <CardDescription>Credentials are AES-256-GCM encrypted before storage. Never stored in plain text.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                placeholder="Enter EPFO password"
                className="pr-10"
                data-testid="input-epfo-password"
              />
              <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPw(p => !p)}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => saveMutation.mutate()} disabled={!username || !password || saveMutation.isPending} data-testid="button-save-epfo-credentials">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Settings className="h-4 w-4 mr-2" />}
              Save Credentials
            </Button>
            {session?.configured && (
              <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} data-testid="button-test-epfo-login">
                {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
                Test Login
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EpfoPage() {
  const { user } = useAuth();

  const ALLOWED = ["super_admin", "company_admin", "hr_admin"];
  if (!user || !ALLOWED.includes(user.role)) {
    return <div className="p-6 text-center text-muted-foreground">You do not have permission to view this page.</div>;
  }

  const companyId = user.companyId ?? "";
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-600 rounded-lg">
          <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">EPFO Automation</h1>
          <p className="text-sm text-muted-foreground">Manage UAN generation, ECR filing, and PF compliance via automated portal workflows</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-0.5">
          <TabsTrigger value="dashboard" data-testid="tab-epfo-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="registration" data-testid="tab-epfo-registration">Registration</TabsTrigger>
          <TabsTrigger value="returns" data-testid="tab-epfo-returns">Return Filing</TabsTrigger>
          <TabsTrigger value="challans" data-testid="tab-epfo-challans">Challans</TabsTrigger>
          <TabsTrigger value="bulk" data-testid="tab-epfo-bulk">Bulk Upload</TabsTrigger>
          <TabsTrigger value="portal" data-testid="tab-epfo-portal">Portal Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4"><DashboardTab companyId={companyId} onTabChange={setActiveTab} /></TabsContent>
        <TabsContent value="registration" className="mt-4"><RegistrationTab companyId={companyId} /></TabsContent>
        <TabsContent value="returns" className="mt-4"><ReturnFilingTab companyId={companyId} /></TabsContent>
        <TabsContent value="challans" className="mt-4"><ChallanTab companyId={companyId} /></TabsContent>
        <TabsContent value="bulk" className="mt-4"><BulkUploadTab companyId={companyId} /></TabsContent>
        <TabsContent value="portal" className="mt-4"><PortalSettingsTab companyId={companyId} /></TabsContent>
      </Tabs>
    </div>
  );
}
