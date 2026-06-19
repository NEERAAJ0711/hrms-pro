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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck, Users, FileText, Download, RefreshCw, Loader2,
  CheckCircle2, AlertTriangle, Clock, Settings, Activity,
  Eye, EyeOff, Lock, Monitor, UserCheck, CreditCard,
} from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

function jobStatusBadge(status: string) {
  if (status === "completed") return <span className="flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3 w-3" /> Done</span>;
  if (status === "failed")    return <span className="flex items-center gap-1 text-red-600"><AlertTriangle className="h-3 w-3" /> Failed</span>;
  if (status === "running")   return <span className="flex items-center gap-1 text-blue-600"><Loader2 className="h-3 w-3 animate-spin" /> Running</span>;
  if (status === "paused")    return <span className="flex items-center gap-1 text-orange-600"><AlertTriangle className="h-3 w-3" /> Paused</span>;
  return <span className="flex items-center gap-1 text-yellow-600"><Clock className="h-3 w-3" /> Queued</span>;
}

export default function EpfoPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const lastJobIdRef = useRef<string | null>(null);

  // Portal login state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [changingCreds, setChangingCreds] = useState(false);
  const [testPhase, setTestPhase] = useState<"idle"|"running"|"captcha"|"otp"|"done">("idle");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testJobId, setTestJobId] = useState<string | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  // Period selector
  const now = new Date();
  const defaultMonth = now.getMonth() === 0 ? MONTHS[11] : MONTHS[now.getMonth() - 1];
  const defaultYear  = now.getMonth() === 0 ? CURRENT_YEAR - 1 : CURRENT_YEAR;
  const [selMonth, setSelMonth] = useState(defaultMonth);
  const [selYear, setSelYear]   = useState(String(defaultYear));

  // Company (super admin only)
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const isSuperAdmin = user?.role === "super_admin";
  const ALLOWED = ["super_admin", "company_admin", "hr_admin"];
  const companyId = isSuperAdmin ? selectedCompanyId : (user?.companyId ?? "");

  const { data: companies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/companies"],
    queryFn: async () => { const r = await fetch("/api/companies", { credentials:"include" }); return r.ok ? r.json() : []; },
    enabled: isSuperAdmin,
  });

  // Saved portal session
  const { data: session } = useQuery<{ configured: boolean; username?: string; lastLoginAt?: string }>({
    queryKey: ["/api/automation/portal-session/epfo", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/automation/portal-session?portal=epfo&companyId=${companyId}`, { credentials:"include" });
      return r.ok ? r.json() : { configured: false };
    },
    enabled: !!companyId,
  });

  // Poll login test job
  const { data: polledJob } = useQuery<{ status: string; errorMessage?: string | null; screenshotPath?: string | null }>({
    queryKey: ["/api/automation/jobs/poll", testJobId],
    queryFn: async () => {
      const r = await fetch(`/api/automation/jobs/${testJobId}`, { credentials:"include" });
      return r.ok ? r.json() : null;
    },
    enabled: !!testJobId,
    refetchInterval: 1500,
  });

  // Page-level: find any running EPFO job for live screen
  const { data: runningJobs = [] } = useQuery<Array<{ id: string; status: string; jobType: string; screenshotPath?: string | null }>>({
    queryKey: ["/api/automation/jobs/page-live-epfo", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/automation/jobs?companyId=${companyId}&limit=10`, { credentials:"include" });
      if (!r.ok) return [];
      const raw = await r.json();
      const list = Array.isArray(raw) ? raw : (raw.data ?? []);
      return list.filter((j: any) => j.jobType?.startsWith("epfo_") && (j.status === "running" || j.status === "paused"));
    },
    enabled: !!companyId,
    refetchInterval: testJobId ? false : 3000,
  });

  // Recent jobs list
  const { data: recentJobs } = useQuery<{ data: Array<{ id: string; jobType: string; status: string; createdAt: string; errorMessage?: string | null }> }>({
    queryKey: ["/api/automation/jobs/recent-epfo", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/automation/jobs?companyId=${companyId}&limit=6&jobType=epfo`, { credentials:"include" });
      return r.ok ? r.json() : { data: [] };
    },
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  // Active employee list fetched from the EPFO portal via automation
  const { data: empList } = useQuery<{ employees: Record<string, string>[]; count: number; fetchedAt: string | null }>({
    queryKey: ["/api/automation/epfo-employees", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/automation/epfo-employees?companyId=${companyId}`, { credentials:"include" });
      return r.ok ? r.json() : { employees: [], count: 0, fetchedAt: null };
    },
    enabled: !!companyId,
    refetchInterval: 8000,
  });

  // A paused action job (needs CAPTCHA/OTP) takes priority so the live view AND the
  // resume target always point at the SAME job.
  const pausedActionJob = !testJobId ? (runningJobs.find(j => j.status === "paused") ?? null) : null;

  // Live screen: prefer test job, else the paused job, else any running job
  const latestRunning = testJobId ? null : (pausedActionJob ?? runningJobs[0] ?? null);
  const activeJobId: string | null = testJobId ?? latestRunning?.id ?? null;
  if (activeJobId) lastJobIdRef.current = activeJobId;
  const displayJobId = activeJobId ?? lastJobIdRef.current;
  const displayActive = !!activeJobId || !!displayJobId;

  // Paused job needing CAPTCHA/OTP — works for BOTH the login test AND real action jobs
  const loginPaused = !!testJobId && (testPhase === "captcha" || testPhase === "otp");
  const pausedJobId: string | null = loginPaused ? testJobId : (pausedActionJob?.id ?? null);
  const pauseKind: "captcha" | "otp" = loginPaused
    ? (testPhase === "otp" ? "otp" : "captcha")
    : (pausedActionJob?.screenshotPath?.toLowerCase().includes("otp") ? "otp" : "captcha");

  // Active label
  const displayLabel = testJobId
    ? (testPhase === "captcha" ? "CAPTCHA Required" : testPhase === "otp" ? "OTP Required" : "EPFO Portal — Live View")
    : latestRunning
      ? latestRunning.jobType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "EPFO Portal — Live View";

  // Poll login job state transitions
  useEffect(() => {
    if (!polledJob) return;
    if (polledJob.status === "completed") {
      setTestPhase("done");
      setTestResult({ ok: true, message: "Login successful — portal is ready." });
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

  // Reset company-level state on company change
  useEffect(() => {
    lastJobIdRef.current = null;
    setTestJobId(null);
    setTestPhase("idle");
    setTestResult(null);
    setChangingCreds(false);
  }, [companyId]);

  const resetTest = () => { setTestJobId(null); setTestPhase("idle"); setTestResult(null); setCaptchaAnswer(""); };

  const loginMutation = useMutation({
    mutationFn: async () => {
      if (!session?.configured || changingCreds) {
        if (!username || !password) throw new Error("Enter both username and password.");
        await (await apiRequest("POST", "/api/automation/portal-session", { portal: "epfo", username, password, companyId })).json();
        await queryClient.invalidateQueries({ queryKey: ["/api/automation/portal-session/epfo"] });
        setPassword(""); setChangingCreds(false);
      }
      const r = await apiRequest("POST", "/api/automation/portal-session/test", { portal: "epfo", companyId });
      return r.json();
    },
    onSuccess: (data) => { setTestResult(null); setCaptchaAnswer(""); setTestPhase("running"); setTestJobId(data.jobId); },
    onError: (e: any) => toast({ title: "Login failed", description: e.message, variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/automation/jobs/${pausedJobId}/resume`, { answer: captchaAnswer })).json(),
    onSuccess: () => {
      setCaptchaAnswer("");
      if (testJobId) setTestPhase("running");
      queryClient.invalidateQueries({ queryKey: ["/api/automation/jobs/page-live-epfo", companyId] });
    },
    onError: (e: any) => toast({ title: "Submit failed", description: e.message, variant: "destructive" }),
  });

  const triggerJob = useTriggerJob(["/api/automation/jobs"]);

  if (!user || !ALLOWED.includes(user.role)) {
    return <div className="p-6 text-center text-muted-foreground">You do not have permission to view this page.</div>;
  }

  const isLoginActive = loginMutation.isPending || (!!testJobId && testPhase !== "done");

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-600 rounded-lg"><ShieldCheck className="h-5 w-5 text-white" /></div>
          <div>
            <h1 className="text-lg font-bold leading-tight">EPFO Automation</h1>
            <p className="text-xs text-muted-foreground">UAN generation, ECR filing &amp; PF compliance</p>
          </div>
        </div>
        {isSuperAdmin && (
          <Select value={selectedCompanyId} onValueChange={(v) => setSelectedCompanyId(v)} data-testid="select-epfo-company">
            <SelectTrigger className="w-52"><SelectValue placeholder="Select company…" /></SelectTrigger>
            <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {isSuperAdmin && !companyId ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Select a company above to start</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-4 items-start">
          {/* ── LEFT CONTROL PANEL ── */}
          <div className="w-72 flex-shrink-0 space-y-3">

            {/* Portal Login */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Portal Login</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {/* Saved credentials banner */}
                {session?.configured && !changingCreds && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-green-50 border border-green-200 text-xs">
                    <span className="flex items-center gap-1.5 text-green-800">
                      <CheckCircle2 className="h-3.5 w-3.5" /> <strong>{session.username}</strong>
                    </span>
                    <button className="text-muted-foreground underline hover:no-underline" onClick={() => { setChangingCreds(true); resetTest(); }} data-testid="button-epfo-change-creds">
                      Change
                    </button>
                  </div>
                )}

                {/* Credential inputs */}
                {(!session?.configured || changingCreds) && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs mb-1 block">Username / Establishment ID</Label>
                      <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="EPFO username" className="h-8 text-sm" data-testid="input-epfo-username" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Password</Label>
                      <div className="relative">
                        <Input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="EPFO password" className="h-8 text-sm pr-8" data-testid="input-epfo-password" />
                        <button className="absolute right-2.5 top-2 text-muted-foreground" onClick={() => setShowPw(p => !p)}>
                          {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                    {changingCreds && (
                      <button className="text-xs text-muted-foreground underline" onClick={() => { setChangingCreds(false); setPassword(""); }}>Cancel</button>
                    )}
                  </div>
                )}

                {/* Login button */}
                {(testPhase === "idle" || testPhase === "done") && !pausedActionJob && (
                  <Button className="w-full h-8 text-sm" onClick={() => { resetTest(); loginMutation.mutate(); }}
                    disabled={isLoginActive || ((!session?.configured || changingCreds) && (!username || !password))}
                    data-testid="button-epfo-login">
                    {loginMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Activity className="h-3.5 w-3.5 mr-1.5" />}
                    {loginMutation.isPending ? "Connecting…" : "Login to Portal"}
                  </Button>
                )}

                {/* Running state */}
                {testPhase === "running" && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
                    <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Logging in…</span>
                    <button onClick={resetTest} className="underline text-blue-600">Cancel</button>
                  </div>
                )}

                {/* CAPTCHA / OTP — shown for the login test AND any paused action job */}
                {pausedJobId && (
                  <div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-3 space-y-2">
                    <p className="text-xs text-orange-800 font-semibold flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {pauseKind === "captcha" ? "CAPTCHA required — type the code from the live view →" : "OTP sent to registered mobile"}
                    </p>
                    <div className="flex gap-2">
                      <Input value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && captchaAnswer.trim()) resumeMutation.mutate(); }}
                        placeholder={pauseKind === "captcha" ? "Enter CAPTCHA" : "Enter OTP"}
                        className="h-8 text-sm font-mono tracking-widest" autoFocus data-testid="input-epfo-captcha" />
                      <Button size="sm" className="h-8 px-3" onClick={() => resumeMutation.mutate()} disabled={!captchaAnswer.trim() || resumeMutation.isPending} data-testid="button-epfo-submit-captcha">
                        {resumeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Result */}
                {testPhase === "done" && testResult && (
                  <div className={`p-2 rounded-lg border text-xs ${testResult.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                    <div className="flex items-start gap-1.5">
                      {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                      <div>
                        <p className="font-medium">{testResult.ok ? "Login successful!" : "Login failed"}</p>
                        {!testResult.ok && <p className="mt-1 opacity-80">{testResult.message}</p>}
                        {!testResult.ok && (
                          <Button variant="outline" size="sm" className="mt-2 h-6 text-xs" onClick={() => { resetTest(); loginMutation.mutate(); }} data-testid="button-epfo-retry-login">
                            <RefreshCw className="h-3 w-3 mr-1" /> Retry
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Period Selector */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Filing Period</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex gap-2">
                  <Select value={selMonth} onValueChange={setSelMonth}>
                    <SelectTrigger className="h-8 text-sm flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={selYear} onValueChange={setSelYear}>
                    <SelectTrigger className="h-8 text-sm w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Settings className="h-3.5 w-3.5" /> Actions</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "epfo_bulk_register", companyId })} data-testid="action-epfo-register">
                  <Users className="h-4 w-4 mr-2 text-blue-600" /> Register Employees
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "epfo_uan_generate", companyId })} data-testid="action-epfo-uan">
                  <UserCheck className="h-4 w-4 mr-2 text-indigo-600" /> Generate UANs
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "epfo_ecr_file", companyId, payload: { month: selMonth, year: Number(selYear) } })} data-testid="action-epfo-ecr">
                  <FileText className="h-4 w-4 mr-2 text-green-600" /> File ECR — {selMonth.slice(0,3)} {selYear}
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "epfo_kyc_aadhaar", companyId })} data-testid="action-epfo-kyc">
                  <UserCheck className="h-4 w-4 mr-2 text-purple-600" /> KYC — Aadhaar
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "epfo_kyc_pan", companyId })} data-testid="action-epfo-kyc-pan">
                  <UserCheck className="h-4 w-4 mr-2 text-purple-500" /> KYC — PAN
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "epfo_kyc_bank", companyId })} data-testid="action-epfo-kyc-bank">
                  <CreditCard className="h-4 w-4 mr-2 text-purple-400" /> KYC — Bank
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "epfo_challan_download", companyId })} data-testid="action-epfo-challan">
                  <Download className="h-4 w-4 mr-2 text-orange-600" /> Sync Challans
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "epfo_passbook_status", companyId })} data-testid="action-epfo-passbook">
                  <Activity className="h-4 w-4 mr-2 text-teal-600" /> Passbook Status
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "epfo_exit_management", companyId })} data-testid="action-epfo-exit">
                  <RefreshCw className="h-4 w-4 mr-2 text-red-500" /> Exit Management
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "epfo_employee_list", companyId })} data-testid="action-epfo-emplist">
                  <Users className="h-4 w-4 mr-2 text-slate-600" /> Sync Employee List
                </Button>
              </CardContent>
            </Card>

            {/* Recent Jobs */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Recent Jobs</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {!recentJobs?.data?.length ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No jobs yet</p>
                ) : (
                  <div className="space-y-2">
                    {recentJobs.data.map(j => (
                      <div key={j.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate text-foreground">{j.jobType.replace(/epfo_/,"").replace(/_/g," ").replace(/\b\w/g, c => c.toUpperCase())}</p>
                          <p className="text-muted-foreground">{new Date(j.createdAt).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</p>
                        </div>
                        <div className="shrink-0">{jobStatusBadge(j.status)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── RIGHT: LIVE SCREEN ── */}
          <div className="flex-1 min-w-0">
            {/* CAPTCHA/OTP alert when triggered from an action job (not login) */}
            {runningJobs[0]?.status === "paused" && testPhase === "idle" && (
              <div className="mb-3 flex items-center gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Portal paused — <strong>CAPTCHA or OTP required.</strong> Use the login panel on the left to continue.</span>
              </div>
            )}

            {displayJobId ? (
              <LiveScreen jobId={displayJobId} active={displayActive} label={displayLabel} />
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
                <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-600">
                  <Monitor className="h-12 w-12" />
                  <p className="text-sm font-medium">Ready to automate</p>
                  <p className="text-xs text-center max-w-xs text-slate-500">
                    Login to the portal or trigger any action from the panel on the left — the live browser view will appear here.
                  </p>
                </div>
              </div>
            )}

            {/* Active employee list fetched from EPFO via automation */}
            {empList && empList.count > 0 && (
              <Card className="mt-3">
                <CardHeader className="pb-2 pt-3 px-4 flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Active Employees — EPFO ({empList.count})</CardTitle>
                  {empList.fetchedAt && (
                    <span className="text-[11px] text-muted-foreground">
                      Synced {new Date(empList.fetchedAt).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                    </span>
                  )}
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  <div className="max-h-[420px] overflow-auto border-t">
                    <table className="w-full text-xs" data-testid="table-epfo-employees">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          {Object.keys(empList.employees[0]).map(h => (
                            <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {empList.employees.map((emp, i) => (
                          <tr key={i} className="border-b last:border-0 hover-elevate" data-testid={`row-epfo-employee-${i}`}>
                            {Object.keys(empList.employees[0]).map(h => (
                              <td key={h} className="px-3 py-1.5 whitespace-nowrap">{emp[h] ?? ""}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
