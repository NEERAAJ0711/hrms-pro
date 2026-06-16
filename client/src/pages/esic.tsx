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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck, Users, FileText, Download, RefreshCw, Loader2,
  CheckCircle2, AlertTriangle, Clock, Settings, Activity,
  Eye, EyeOff, Lock, Monitor, UserCheck, CreditCard, FileBadge,
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

export default function EsicPage() {
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
    queryKey: ["/api/automation/portal-session/esic", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/automation/portal-session?portal=esic&companyId=${companyId}`, { credentials:"include" });
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

  // Page-level: find any running ESIC job for live screen
  const { data: runningJobs = [] } = useQuery<Array<{ id: string; status: string; jobType: string }>>({
    queryKey: ["/api/automation/jobs/page-live-esic", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/automation/jobs?companyId=${companyId}&limit=10`, { credentials:"include" });
      if (!r.ok) return [];
      const raw = await r.json();
      const list = Array.isArray(raw) ? raw : (raw.data ?? []);
      return list.filter((j: any) => j.jobType?.startsWith("esic_") && (j.status === "running" || j.status === "paused"));
    },
    enabled: !!companyId,
    refetchInterval: testJobId ? false : 3000,
  });

  // Recent jobs list
  const { data: recentJobs } = useQuery<{ data: Array<{ id: string; jobType: string; status: string; createdAt: string; errorMessage?: string | null }> }>({
    queryKey: ["/api/automation/jobs/recent-esic", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/automation/jobs?companyId=${companyId}&limit=6&jobType=esic`, { credentials:"include" });
      return r.ok ? r.json() : { data: [] };
    },
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  // Live screen: prefer test job, else page-level running job
  const latestRunning = testJobId ? null : (runningJobs[0] ?? null);
  const activeJobId: string | null = testJobId ?? latestRunning?.id ?? null;
  if (activeJobId) lastJobIdRef.current = activeJobId;
  const displayJobId = activeJobId ?? lastJobIdRef.current;
  const displayActive = !!activeJobId || !!displayJobId;

  const displayLabel = testJobId
    ? (testPhase === "captcha" ? "CAPTCHA Required" : testPhase === "otp" ? "OTP Required" : "ESIC Portal — Live View")
    : latestRunning
      ? latestRunning.jobType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "ESIC Portal — Live View";

  // Poll login job state transitions
  useEffect(() => {
    if (!polledJob) return;
    if (polledJob.status === "completed") {
      setTestPhase("done");
      setTestResult({ ok: true, message: "Login successful — portal is ready." });
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

  // Reset on company change
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
        await (await apiRequest("POST", "/api/automation/portal-session", { portal: "esic", username, password, companyId })).json();
        await queryClient.invalidateQueries({ queryKey: ["/api/automation/portal-session/esic"] });
        setPassword(""); setChangingCreds(false);
      }
      const r = await apiRequest("POST", "/api/automation/portal-session/test", { portal: "esic", companyId });
      return r.json();
    },
    onSuccess: (data) => { setTestResult(null); setCaptchaAnswer(""); setTestPhase("running"); setTestJobId(data.jobId); },
    onError: (e: any) => toast({ title: "Login failed", description: e.message, variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/automation/jobs/${testJobId}/resume`, { answer: captchaAnswer })).json(),
    onSuccess: () => { setCaptchaAnswer(""); setTestPhase("running"); },
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
          <div className="p-1.5 bg-emerald-600 rounded-lg"><ShieldCheck className="h-5 w-5 text-white" /></div>
          <div>
            <h1 className="text-lg font-bold leading-tight">ESIC Automation</h1>
            <p className="text-xs text-muted-foreground">IP number generation, monthly filing &amp; ESIC compliance</p>
          </div>
        </div>
        {isSuperAdmin && (
          <Select value={selectedCompanyId} onValueChange={(v) => setSelectedCompanyId(v)} data-testid="select-esic-company">
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
                    <button className="text-muted-foreground underline hover:no-underline" onClick={() => { setChangingCreds(true); resetTest(); }} data-testid="button-esic-change-creds">
                      Change
                    </button>
                  </div>
                )}

                {/* Credential inputs */}
                {(!session?.configured || changingCreds) && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs mb-1 block">Username / Employer Code</Label>
                      <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="ESIC username" className="h-8 text-sm" data-testid="input-esic-username" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Password</Label>
                      <div className="relative">
                        <Input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="ESIC password" className="h-8 text-sm pr-8" data-testid="input-esic-password" />
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
                {(testPhase === "idle" || testPhase === "done") && (
                  <Button className="w-full h-8 text-sm bg-emerald-600 hover:bg-emerald-700" onClick={() => { resetTest(); loginMutation.mutate(); }}
                    disabled={isLoginActive || ((!session?.configured || changingCreds) && (!username || !password))}
                    data-testid="button-esic-login">
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

                {/* CAPTCHA / OTP */}
                {(testPhase === "captcha" || testPhase === "otp") && (
                  <div className="rounded-lg border-2 border-orange-300 bg-orange-50 p-3 space-y-2">
                    <p className="text-xs text-orange-800 font-semibold flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {testPhase === "captcha" ? "CAPTCHA required — see live view" : "OTP sent to registered mobile"}
                    </p>
                    <div className="flex gap-2">
                      <Input value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && captchaAnswer.trim()) resumeMutation.mutate(); }}
                        placeholder={testPhase === "captcha" ? "Enter CAPTCHA" : "Enter OTP"}
                        className="h-8 text-sm font-mono tracking-widest" autoFocus data-testid="input-esic-captcha" />
                      <Button size="sm" className="h-8 px-3" onClick={() => resumeMutation.mutate()} disabled={!captchaAnswer.trim() || resumeMutation.isPending} data-testid="button-esic-submit-captcha">
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
                          <Button variant="outline" size="sm" className="mt-2 h-6 text-xs" onClick={() => { resetTest(); loginMutation.mutate(); }} data-testid="button-esic-retry-login">
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
                  onClick={() => triggerJob.mutate({ jobType: "esic_bulk_register", companyId })} data-testid="action-esic-register">
                  <Users className="h-4 w-4 mr-2 text-emerald-600" /> Register Employees
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "esic_ip_generate", companyId })} data-testid="action-esic-ip">
                  <UserCheck className="h-4 w-4 mr-2 text-teal-600" /> Generate IP Numbers
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "esic_monthly_file", companyId, payload: { month: selMonth, year: Number(selYear) } })} data-testid="action-esic-monthly">
                  <FileText className="h-4 w-4 mr-2 text-green-600" /> File Monthly Return — {selMonth.slice(0,3)} {selYear}
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "esic_challan_download", companyId })} data-testid="action-esic-challan">
                  <Download className="h-4 w-4 mr-2 text-orange-600" /> Sync Challans
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "esic_contribution_tracking", companyId })} data-testid="action-esic-contrib">
                  <Activity className="h-4 w-4 mr-2 text-blue-600" /> Track Contributions
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "esic_contribution_pdf", companyId, payload: { month: selMonth, year: Number(selYear) } })} data-testid="action-esic-contrib-pdf">
                  <FileBadge className="h-4 w-4 mr-2 text-indigo-600" /> Contribution PDF — {selMonth.slice(0,3)} {selYear}
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "esic_employee_list", companyId })} data-testid="action-esic-emplist">
                  <Users className="h-4 w-4 mr-2 text-slate-600" /> Sync Employee List
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "esic_pehchan_card_download", companyId })} data-testid="action-esic-pehchan">
                  <CreditCard className="h-4 w-4 mr-2 text-purple-600" /> Download Pehchan Cards
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "esic_temp_card_download", companyId })} data-testid="action-esic-tempcard">
                  <CreditCard className="h-4 w-4 mr-2 text-purple-400" /> Download Temp Cards
                </Button>

                <Button variant="outline" size="sm" className="w-full justify-start h-9 text-sm" disabled={triggerJob.isPending}
                  onClick={() => triggerJob.mutate({ jobType: "esic_family_declaration", companyId })} data-testid="action-esic-family">
                  <FileBadge className="h-4 w-4 mr-2 text-rose-500" /> Family Declaration
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
                          <p className="font-medium truncate text-foreground">{j.jobType.replace(/esic_/,"").replace(/_/g," ").replace(/\b\w/g, c => c.toUpperCase())}</p>
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
            {/* Paused alert when an action job needs CAPTCHA/OTP */}
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
                    <span className="text-xs text-slate-300 font-medium">ESIC Portal — Live View</span>
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
          </div>
        </div>
      )}
    </div>
  );
}
