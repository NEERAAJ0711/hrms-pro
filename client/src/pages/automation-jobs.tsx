import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bot, RefreshCw, AlertTriangle, CheckCircle2, Clock, Pause,
  RotateCcw, Loader2, Activity, FileText, Search,
} from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) => CURRENT_YEAR - i);

// ─── Types ────────────────────────────────────────────────────────────────────
interface AutomationJob {
  id: string;
  jobType: string;
  status: string;
  companyId: string;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string | null;
  screenshotPath?: string | null;
  payload?: Record<string, unknown> | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AutomationLog {
  id: string;
  jobId: string;
  companyId: string;
  level: string;
  message: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string; icon?: JSX.Element }> = {
    pending:   { label: "Pending",   className: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: <Clock className="h-3 w-3" /> },
    running:   { label: "Running",   className: "bg-blue-100 text-blue-800 border-blue-200",       icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    paused:    { label: "Paused",    className: "bg-orange-100 text-orange-800 border-orange-200", icon: <Pause className="h-3 w-3" /> },
    completed: { label: "Completed", className: "bg-green-100 text-green-800 border-green-200",    icon: <CheckCircle2 className="h-3 w-3" /> },
    failed:    { label: "Failed",    className: "bg-red-100 text-red-800 border-red-200",          icon: <AlertTriangle className="h-3 w-3" /> },
    cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-600 border-gray-200",       icon: <AlertTriangle className="h-3 w-3" /> },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-100 text-gray-700 border-gray-200" };
  return (
    <Badge variant="outline" className={`flex items-center gap-1 text-xs font-medium ${s.className}`}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

function levelBadge(level: string) {
  const map: Record<string, string> = {
    info:  "bg-blue-50 text-blue-700",
    warn:  "bg-yellow-50 text-yellow-700",
    error: "bg-red-50 text-red-700",
    debug: "bg-gray-50 text-gray-600",
  };
  return <span className={`px-1.5 py-0.5 rounded text-xs font-mono font-medium ${map[level] ?? "bg-gray-50 text-gray-600"}`}>{level.toUpperCase()}</span>;
}

function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function jobTypeLabel(jt: string) {
  return jt.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── All Jobs Tab ─────────────────────────────────────────────────────────────
function AllJobsTab() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");

  const cid = user?.companyId || undefined;
  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (jobTypeFilter !== "all") params.set("jobType", jobTypeFilter);
  if (cid) params.set("companyId", cid);

  const { data, isLoading, refetch } = useQuery<{ data: AutomationJob[]; page: number; limit: number }>({
    queryKey: ["/api/automation/jobs", statusFilter, jobTypeFilter, page, cid],
    queryFn: async () => {
      const res = await fetch(`/api/automation/jobs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const jobs = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={jobTypeFilter} onValueChange={v => { setJobTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-48" data-testid="select-type-filter">
            <SelectValue placeholder="Job Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="epfo_uan_generate">EPFO UAN Generate</SelectItem>
            <SelectItem value="epfo_ecr_file">EPFO ECR File</SelectItem>
            <SelectItem value="epfo_challan_download">EPFO Challan Download</SelectItem>
            <SelectItem value="epfo_kyc_aadhaar">EPFO KYC Aadhaar</SelectItem>
            <SelectItem value="esic_ip_generate">ESIC IP Generate</SelectItem>
            <SelectItem value="esic_monthly_file">ESIC Monthly File</SelectItem>
            <SelectItem value="esic_challan_download">ESIC Challan Download</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-jobs">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">Auto-refreshes every 5s</span>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Retries</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : jobs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No jobs found</TableCell></TableRow>
            ) : jobs.map(job => (
              <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                <TableCell className="font-mono text-xs text-muted-foreground">{job.id.slice(0, 8)}…</TableCell>
                <TableCell className="text-sm">{jobTypeLabel(job.jobType)}</TableCell>
                <TableCell>{statusBadge(job.status)}</TableCell>
                <TableCell className="text-sm">{job.retryCount}/{job.maxRetries}</TableCell>
                <TableCell className="text-xs">{formatDate(job.startedAt)}</TableCell>
                <TableCell className="text-xs">{formatDate(job.updatedAt)}</TableCell>
                <TableCell className="text-xs text-red-600 max-w-[200px] truncate">{job.errorMessage ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {page}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={jobs.length < 20} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Paused Jobs Tab (CAPTCHA / OTP) ─────────────────────────────────────────
function PausedJobsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const cid = user?.companyId || undefined;
  const params = new URLSearchParams({ status: "paused", limit: "50" });
  if (cid) params.set("companyId", cid);

  const { data, isLoading } = useQuery<{ data: AutomationJob[] }>({
    queryKey: ["/api/automation/jobs", "paused", cid],
    queryFn: async () => {
      const res = await fetch(`/api/automation/jobs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch paused jobs");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const resumeMutation = useMutation({
    mutationFn: async ({ jobId, answer }: { jobId: string; answer: string }) => {
      const res = await apiRequest("POST", `/api/automation/jobs/${jobId}/resume`, { answer });
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: "Job resumed", description: `Answer submitted for job ${vars.jobId.slice(0, 8)}` });
      setAnswers(prev => { const next = { ...prev }; delete next[vars.jobId]; return next; });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/jobs"] });
    },
    onError: (err: any) => toast({ title: "Resume failed", description: err.message, variant: "destructive" }),
  });

  const jobs = data?.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These jobs are paused waiting for a CAPTCHA answer or OTP. Review the screenshot and submit the answer to resume.
      </p>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Pause className="h-8 w-8 mx-auto mb-2" />
            No paused jobs — all automation is running smoothly.
          </CardContent>
        </Card>
      ) : jobs.map(job => (
        <Card key={job.id} className="border-orange-200 bg-orange-50/30" data-testid={`card-paused-job-${job.id}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Pause className="h-4 w-4 text-orange-600" />
                {jobTypeLabel(job.jobType)}
                <span className="font-mono text-xs text-muted-foreground">#{job.id.slice(0, 8)}</span>
              </CardTitle>
              {statusBadge(job.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.screenshotPath && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Portal screenshot at pause point:</p>
                <img
                  src={`/uploads/automation-screenshots/${job.screenshotPath.split("/").pop()}`}
                  alt="Portal screenshot"
                  className="max-w-full rounded border border-orange-200 shadow-sm max-h-64 object-contain"
                  data-testid={`img-screenshot-${job.id}`}
                />
              </div>
            )}
            <div className="flex gap-3 items-center">
              <Input
                placeholder="Enter CAPTCHA text or OTP..."
                value={answers[job.id] ?? ""}
                onChange={e => setAnswers(prev => ({ ...prev, [job.id]: e.target.value }))}
                className="flex-1"
                data-testid={`input-captcha-${job.id}`}
                onKeyDown={e => {
                  if (e.key === "Enter" && answers[job.id]?.trim()) {
                    resumeMutation.mutate({ jobId: job.id, answer: answers[job.id] });
                  }
                }}
              />
              <Button
                onClick={() => resumeMutation.mutate({ jobId: job.id, answer: answers[job.id] ?? "" })}
                disabled={!answers[job.id]?.trim() || resumeMutation.isPending}
                data-testid={`button-resume-${job.id}`}
              >
                {resumeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit & Resume"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paused at: {formatDate(job.updatedAt)} · Retries: {job.retryCount}/{job.maxRetries}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Failed Jobs Tab ──────────────────────────────────────────────────────────
function FailedJobsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const cid = user?.companyId || undefined;
  const params = new URLSearchParams({ status: "failed", limit: "50" });
  if (cid) params.set("companyId", cid);

  const { data, isLoading } = useQuery<{ data: AutomationJob[] }>({
    queryKey: ["/api/automation/jobs", "failed", cid],
    queryFn: async () => {
      const res = await fetch(`/api/automation/jobs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch failed jobs");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/automation/jobs/${jobId}/retry`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job re-queued", description: "The job has been added back to the queue." });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/jobs"] });
    },
    onError: (err: any) => toast({ title: "Retry failed", description: err.message, variant: "destructive" }),
  });

  const jobs = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Retries</TableHead>
              <TableHead>Failed At</TableHead>
              <TableHead>Error</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : jobs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No failed jobs</TableCell></TableRow>
            ) : jobs.map(job => (
              <TableRow key={job.id} data-testid={`row-failed-job-${job.id}`}>
                <TableCell className="font-mono text-xs text-muted-foreground">{job.id.slice(0, 8)}…</TableCell>
                <TableCell className="text-sm">{jobTypeLabel(job.jobType)}</TableCell>
                <TableCell className="text-sm">{job.retryCount}/{job.maxRetries}</TableCell>
                <TableCell className="text-xs">{formatDate(job.updatedAt)}</TableCell>
                <TableCell className="text-xs text-red-600 max-w-[280px]">
                  <span className="line-clamp-2">{job.errorMessage ?? "Unknown error"}</span>
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retryMutation.mutate(job.id)}
                    disabled={retryMutation.isPending}
                    data-testid={`button-retry-job-${job.id}`}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Retry
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Logs Tab ─────────────────────────────────────────────────────────────────
function LogsTab() {
  const { user } = useAuth();
  const [levelFilter, setLevelFilter] = useState("all");
  const [jobIdSearch, setJobIdSearch] = useState("");
  const [page, setPage] = useState(1);

  const cid = user?.companyId || undefined;
  const params = new URLSearchParams({ page: String(page), limit: "50" });
  if (levelFilter !== "all") params.set("level", levelFilter);
  if (jobIdSearch.trim()) params.set("jobId", jobIdSearch.trim());
  if (cid) params.set("companyId", cid);

  const { data, isLoading } = useQuery<{ data: AutomationLog[]; page: number; total: number }>({
    queryKey: ["/api/automation/logs", levelFilter, jobIdSearch, page, cid],
    queryFn: async () => {
      const res = await fetch(`/api/automation/logs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const logs = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by Job ID..."
            value={jobIdSearch}
            onChange={e => { setJobIdSearch(e.target.value); setPage(1); }}
            className="pl-8 w-52"
            data-testid="input-log-job-search"
          />
        </div>
        <Select value={levelFilter} onValueChange={v => { setLevelFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32" data-testid="select-log-level">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Timestamp</TableHead>
              <TableHead className="w-20">Level</TableHead>
              <TableHead className="w-28">Job ID</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No logs found</TableCell></TableRow>
            ) : logs.map(log => (
              <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</TableCell>
                <TableCell>{levelBadge(log.level)}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{log.jobId.slice(0, 8)}…</TableCell>
                <TableCell className="text-xs">{log.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {page} · {data?.total ?? 0} total entries</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={logs.length < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AutomationJobsPage() {
  const { user } = useAuth();

  const ALLOWED = ["super_admin", "company_admin", "hr_admin"];
  if (!user || !ALLOWED.includes(user.role)) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        You do not have permission to view this page.
      </div>
    );
  }

  const cid = user?.companyId || undefined;
  const params = new URLSearchParams({ limit: "1" });
  if (cid) params.set("companyId", cid);

  const { data: summary } = useQuery<{
    pendingJobs: number; failedJobs: number; epfoRegistrations: number; esicRegistrations: number;
  }>({
    queryKey: ["/api/automation/summary", cid],
    queryFn: async () => {
      const url = cid ? `/api/automation/summary?companyId=${cid}` : `/api/automation/summary`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 10000,
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-600 rounded-lg">
          <Bot className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Automation Monitor</h1>
          <p className="text-sm text-muted-foreground">Track and manage EPFO/ESIC automation jobs in real-time</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Pending Jobs", value: summary?.pendingJobs ?? 0, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
          { label: "Failed Jobs", value: summary?.failedJobs ?? 0, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
          { label: "EPFO Registered", value: summary?.epfoRegistrations ?? 0, icon: Activity, color: "text-blue-600 bg-blue-50" },
          { label: "ESIC Registered", value: summary?.esicRegistrations ?? 0, icon: Activity, color: "text-green-600 bg-green-50" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="all">
        <TabsList className="grid grid-cols-4 w-full max-w-md">
          <TabsTrigger value="all" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" /> All Jobs
          </TabsTrigger>
          <TabsTrigger value="paused" className="flex items-center gap-1.5">
            <Pause className="h-3.5 w-3.5" /> Paused
          </TabsTrigger>
          <TabsTrigger value="failed" className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Failed
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4"><AllJobsTab /></TabsContent>
        <TabsContent value="paused" className="mt-4"><PausedJobsTab /></TabsContent>
        <TabsContent value="failed" className="mt-4"><FailedJobsTab /></TabsContent>
        <TabsContent value="logs" className="mt-4"><LogsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
