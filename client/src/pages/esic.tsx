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
  ShieldCheck, Users, FileText, Download, RefreshCw, Loader2,
  CheckCircle2, AlertTriangle, Clock, Upload, Settings, Activity,
  Eye, EyeOff, Lock, Search,
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
function DashboardTab({ companyId }: { companyId: string }) {
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

  const nextDue = (() => {
    const now = new Date();
    const d21 = new Date(now.getFullYear(), now.getMonth() + 1, 21);
    const diff = Math.ceil((d21.getTime() - now.getTime()) / 86400000);
    return `ESIC due ${diff > 0 ? `in ${diff} day${diff !== 1 ? "s" : ""}` : "today"} (21st ${MONTHS[d21.getMonth()]})`;
  })();

  return (
    <div className="space-y-5">
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
                  <TableHead>Employees</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Filed At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentReturns.data.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.month} {r.year}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>{r.totalEmployees}</TableCell>
                    <TableCell>{fmt(r.totalAmount)}</TableCell>
                    <TableCell>{fmtDate(r.dueDate)}</TableCell>
                    <TableCell>{fmtDate(r.filedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
          <Button size="sm" onClick={() => { triggerJob.mutate({ jobType: "esic_bulk_register", companyId, payload: { employeeIds: Array.from(selected) } }); setSelected(new Set()); }} disabled={triggerJob.isPending} data-testid="button-esic-bulk-register">
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
              <Button onClick={() => { triggerJob.mutate({ jobType: "esic_bulk_register", companyId, payload: { employeeCodes: preview.filter(r => r.valid).map(r => r.code) } }); setPreview([]); setParsed(false); }} disabled={triggerJob.isPending} data-testid="button-submit-esic-bulk">
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

// ─── Portal Settings Tab ──────────────────────────────────────────────────────
function PortalSettingsTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const { data: session } = useQuery<{ configured: boolean; username?: string; lastLoginAt?: string }>({
    queryKey: ["/api/automation/portal-session/esic", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/automation/portal-session/esic?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/automation/portal-session", { portal: "esic", username, password, companyId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "ESIC credentials saved" });
      setPassword(""); setUsername("");
      queryClient.invalidateQueries({ queryKey: ["/api/automation/portal-session/esic"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/automation/portal-session/test", { portal: "esic", companyId });
      return res.json();
    },
    onSuccess: data => toast({ title: "Test login queued", description: `Job #${data.jobId?.slice(0, 8)}` }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5 max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> ESIC Portal Credentials</CardTitle>
          <CardDescription>Credentials are AES-256-GCM encrypted before storage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {session?.configured && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              Portal configured — username: {session.username}
            </div>
          )}
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
          <div className="flex gap-3">
            <Button onClick={() => saveMutation.mutate()} disabled={!username || !password || saveMutation.isPending} data-testid="button-save-esic-credentials">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Settings className="h-4 w-4 mr-2" />}
              Save Credentials
            </Button>
            {session?.configured && (
              <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} data-testid="button-test-esic-login">
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
export default function EsicPage() {
  const { user } = useAuth();

  const ALLOWED = ["super_admin", "company_admin", "hr_admin"];
  if (!user || !ALLOWED.includes(user.role)) {
    return <div className="p-6 text-center text-muted-foreground">You do not have permission to view this page.</div>;
  }

  const companyId = user.companyId ?? "";

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-emerald-600 rounded-lg">
          <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">ESIC Automation</h1>
          <p className="text-sm text-muted-foreground">Manage IP number generation, monthly filings, and ESIC compliance via automated portal workflows</p>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex flex-wrap gap-0.5">
          <TabsTrigger value="dashboard" data-testid="tab-esic-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="registration" data-testid="tab-esic-registration">Registration</TabsTrigger>
          <TabsTrigger value="contributions" data-testid="tab-esic-contributions">Contributions</TabsTrigger>
          <TabsTrigger value="returns" data-testid="tab-esic-returns">Monthly Filing</TabsTrigger>
          <TabsTrigger value="challans" data-testid="tab-esic-challans">Challans</TabsTrigger>
          <TabsTrigger value="bulk" data-testid="tab-esic-bulk">Bulk Upload</TabsTrigger>
          <TabsTrigger value="portal" data-testid="tab-esic-portal">Portal Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4"><DashboardTab companyId={companyId} /></TabsContent>
        <TabsContent value="registration" className="mt-4"><RegistrationTab companyId={companyId} /></TabsContent>
        <TabsContent value="contributions" className="mt-4"><ContributionsTab companyId={companyId} /></TabsContent>
        <TabsContent value="returns" className="mt-4"><MonthlyFilingTab companyId={companyId} /></TabsContent>
        <TabsContent value="challans" className="mt-4"><ChallanTab companyId={companyId} /></TabsContent>
        <TabsContent value="bulk" className="mt-4"><BulkUploadTab companyId={companyId} /></TabsContent>
        <TabsContent value="portal" className="mt-4"><PortalSettingsTab companyId={companyId} /></TabsContent>
      </Tabs>
    </div>
  );
}
