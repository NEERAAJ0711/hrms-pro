import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Fingerprint, Upload, RefreshCw, AlertTriangle, CheckCircle,
  Clock, XCircle, Settings, Plus, Trash2, Signal, SignalLow, Download, Users,
  ShieldAlert, ShieldCheck, Pencil, KeyRound, Activity, UserCheck, FileUp,
  RotateCcw, ChevronDown, ChevronUp, User, CalendarDays, Timer, Wifi, WifiOff,
  Building2, BadgeCheck, Link2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { BiometricPunchLog, Company, Employee, BiometricDevice } from "@shared/schema";

/* ─── Avatar helper ──────────────────────────────────────────────── */
function Avatar({
  name, photo, size = "md",
}: { name?: string | null; photo?: string | null; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-14 w-14 text-lg" : "h-9 w-9 text-sm";
  const colors = [
    "bg-blue-100 text-blue-700", "bg-green-100 text-green-700",
    "bg-purple-100 text-purple-700", "bg-orange-100 text-orange-700",
    "bg-teal-100 text-teal-700", "bg-rose-100 text-rose-700",
    "bg-indigo-100 text-indigo-700", "bg-amber-100 text-amber-700",
  ];
  const initials = name ? name.split(" ").filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join("") : "?";
  const color = name ? colors[name.charCodeAt(0) % colors.length] : "bg-muted text-muted-foreground";
  if (photo) {
    return (
      <img
        src={photo.startsWith("data:") ? photo : `data:image/jpeg;base64,${photo}`}
        alt={name || "photo"}
        className={`${sz} rounded-full object-cover ring-2 ring-white dark:ring-gray-800 shrink-0`}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-semibold shrink-0 ${color}`}>
      {initials}
    </div>
  );
}

/* ─── Stat chip ──────────────────────────────────────────────────── */
function StatChip({ icon: Icon, value, label, color }: { icon: any; value: number; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border ${color}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <div>
        <p className="text-lg font-bold leading-none">{value}</p>
        <p className="text-[11px] opacity-75 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function BiometricPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const canViewAdmsLog = isSuperAdmin || user?.role === "company_admin";

  const [admsMode, setAdmsMode] = useState<"domain" | "ip">("ip");
  const [setupExpanded, setSetupExpanded] = useState(false);

  const { data: networkInfo, isLoading: networkLoading } = useQuery<{
    host: string; replitDevDomain: string | null; ip: string | null;
    port: string; proto: string; admsUrl: string; admsUrlIp: string | null;
  }>({ queryKey: ["/api/server/network-info"], staleTime: 5 * 60 * 1000, retry: false });

  const fallbackHost = window.location.hostname;
  const admsHost = networkInfo?.replitDevDomain ?? networkInfo?.host ?? fallbackHost;
  const admsIp = networkInfo?.ip ?? null;
  const admsPort = "8181";
  const admsAddr = admsMode === "ip" ? (admsIp ?? admsHost) : admsHost;
  const admsUrl = `http://${admsAddr}:8181/iclock/cdata`;

  const [selectedCompany, setSelectedCompany] = useState<string>(isSuperAdmin ? "__all__" : (user?.companyId || ""));
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [pushData, setPushData] = useState("");
  const [syncCompanyId, setSyncCompanyId] = useState("");

  // Device form
  const [deviceName, setDeviceName] = useState("");
  const [deviceCode, setDeviceCode] = useState("");
  const [deviceSerial, setDeviceSerial] = useState("");
  const [deviceIp, setDeviceIp] = useState("");
  const [deviceServerIp, setDeviceServerIp] = useState("");
  const [devicePort, setDevicePort] = useState("8181");
  const [deviceCompanyId, setDeviceCompanyId] = useState("");
  const [devicePushToken, setDevicePushToken] = useState("");
  const [deviceAllowedCidr, setDeviceAllowedCidr] = useState("");

  const [usersDialogDevice, setUsersDialogDevice] = useState<any | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<any | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDeviceId, setImportDeviceId] = useState("");
  const [importType, setImportType] = useState<"attlog" | "userinfo">("attlog");
  const [mapPinRow, setMapPinRow] = useState<{ devicePin: string; deviceName: string } | null>(null);
  const [mapSelectedEmployee, setMapSelectedEmployee] = useState("");
  const [detectingIp, setDetectingIp] = useState(false);

  // Edit device
  const [editDevice, setEditDevice] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editSerial, setEditSerial] = useState("");
  const [editIp, setEditIp] = useState("");
  const [editServerIp, setEditServerIp] = useState("");
  const [editPort, setEditPort] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editPushToken, setEditPushToken] = useState("");
  const [editAllowedCidr, setEditAllowedCidr] = useState("");

  const openEditDialog = (d: any) => {
    setEditDevice(d);
    setEditName(d.name || "");
    setEditCode(d.code || "");
    setEditSerial(d.deviceSerial || "");
    setEditIp(d.ipAddress || "");
    setEditServerIp(d.admsServerIp || "");
    setEditPort(d.port != null ? String(d.port) : "");
    setEditCompanyId(d.companyId || "");
    setEditPushToken(d.pushToken || "");
    setEditAllowedCidr(d.allowedIpCidr || "");
  };

  const autoDetectSourceIp = async (setter: (v: string) => void) => {
    setDetectingIp(true);
    try {
      const res = await fetch("/api/server/my-ip", { credentials: "include" });
      const { ip } = await res.json();
      if (ip) setter(`${ip}/32`);
    } catch { } finally { setDetectingIp(false); }
  };

  const generateToken = (setter: (v: string) => void) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    setter(Array.from(bytes).map(b => alphabet[b % alphabet.length]).join(""));
  };

  /* ── Queries ──────────────────────────────────────────────────── */
  const { data: companies = [] } = useQuery<Company[]>({ queryKey: ["/api/companies"] });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: devices = [] } = useQuery<BiometricDevice[]>({ queryKey: ["/api/biometric/devices"] });

  const { data: deviceUsers, isLoading: usersLoading } = useQuery<any>({
    queryKey: ["/api/biometric/devices", usersDialogDevice?.id, "users"],
    enabled: !!usersDialogDevice?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/biometric/devices/${usersDialogDevice.id}/users`);
      return res.json();
    },
  });

  const effectiveCompanyId = isSuperAdmin ? (selectedCompany === "__all__" ? "" : selectedCompany) : (user?.companyId || "");

  const { data: logs = [], isLoading } = useQuery<BiometricPunchLog[]>({
    queryKey: ["/api/biometric/logs", effectiveCompanyId, selectedDate, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveCompanyId) params.set("companyId", effectiveCompanyId);
      if (selectedDate) params.set("date", selectedDate);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await apiRequest("GET", `/api/biometric/logs?${params.toString()}`);
      return res.json();
    },
  });

  const { data: admsLog = [], refetch: refetchAdmsLog } = useQuery<Array<{
    ts: string; direction: "IN" | "OUT"; sn: string; line: string;
  }>>({
    queryKey: ["/api/biometric/adms-log"],
    enabled: canViewAdmsLog,
    refetchInterval: canViewAdmsLog ? 5000 : false,
  });

  const { data: admsServerStatus } = useQuery<{
    running: boolean; port: number; boundAt: string | null; error: string | null;
  }>({
    queryKey: ["/api/biometric/adms-server-status"],
    enabled: canViewAdmsLog,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  /* ── Stats ────────────────────────────────────────────────────── */
  const totalLogs = logs.length;
  const processedLogs = logs.filter(l => l.isProcessed).length;
  const missingPunchLogs = logs.filter(l => l.missingPunch).length;
  const unmappedLogs = logs.filter(l => !l.employeeId).length;

  /* ── Helpers ──────────────────────────────────────────────────── */
  const getCompanyName = (id: string) => companies.find(c => c.id === id)?.companyName || id;
  const getEmployee = (id: string | null) => id ? employees.find(e => e.id === id) : null;

  const shiftDate = (delta: number) => {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  /* ── Mutations ────────────────────────────────────────────────── */
  const pushMutation = useMutation({
    mutationFn: async (data: { punches: any[]; companyId: string }) => {
      const res = await apiRequest("POST", "/api/biometric/push", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/logs"] });
      toast({ title: "Punch Data Uploaded", description: `Inserted: ${data.results.inserted}, Duplicates: ${data.results.duplicates}` });
      setPushDialogOpen(false); setPushData("");
    },
    onError: () => toast({ title: "Upload Failed", variant: "destructive" }),
  });

  const deviceMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/biometric/devices", data); return res.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      toast({ title: "Device added successfully" });
      setDeviceDialogOpen(false);
      setDeviceName(""); setDeviceCode(""); setDeviceSerial(""); setDeviceIp("");
      setDeviceServerIp(""); setDevicePort("8181"); setDeviceCompanyId("");
      setDevicePushToken(""); setDeviceAllowedCidr("");
    },
    onError: (err: any) => toast({ title: "Failed to add device", description: err?.message, variant: "destructive" }),
  });

  const editDeviceMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const res = await apiRequest("PATCH", `/api/biometric/devices/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      toast({ title: "Device updated" }); setEditDevice(null);
    },
    onError: (err: any) => toast({ title: "Update failed", description: err?.message, variant: "destructive" }),
  });

  const handleSaveEdit = () => {
    if (!editDevice) return;
    if (!editName.trim() || !editSerial.trim()) {
      toast({ title: "Name and serial are required", variant: "destructive" }); return;
    }
    const tokenTrim = editPushToken.trim();
    const cidrTrim = editAllowedCidr.trim();
    if (!tokenTrim && !cidrTrim) {
      toast({ title: "Set a push token or IP/CIDR", variant: "destructive" }); return;
    }
    if (tokenTrim && tokenTrim.length < 12) {
      toast({ title: "Push token too short (min 12 chars)", variant: "destructive" }); return;
    }
    editDeviceMutation.mutate({
      id: editDevice.id,
      patch: {
        name: editName.trim(), code: editCode.trim() || null, deviceSerial: editSerial.trim(),
        ipAddress: editIp.trim() || null, admsServerIp: editServerIp.trim() || null,
        port: editPort === "" ? null : Number(editPort), companyId: editCompanyId || null,
        pushToken: tokenTrim || null, allowedIpCidr: cidrTrim || null,
      },
    });
  };

  const importFileMutation = useMutation({
    mutationFn: async ({ file, deviceId, type }: { file: File; deviceId: string; type: "attlog" | "userinfo" }) => {
      const form = new FormData();
      form.append("file", file);
      if (deviceId) form.append("deviceId", deviceId);
      const endpoint = type === "userinfo" ? "/api/biometric/import-userinfo" : "/api/biometric/import-attlog";
      const res = await fetch(endpoint, { method: "POST", body: form, credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Import failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      setImportDialogOpen(false); setImportFile(null);
      toast({ title: "Import Complete", description: data?.message });
    },
    onError: (error: any) => toast({ title: "Import Failed", description: error?.message, variant: "destructive" }),
  });

  const mapPinMutation = useMutation({
    mutationFn: async ({ employeeId, devicePin, deviceId }: { employeeId: string; devicePin: string; deviceId?: string }) => {
      const res = await apiRequest("POST", "/api/biometric/map-pin", { employeeId, devicePin, deviceId });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/logs"] });
      if (usersDialogDevice?.id) queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices", usersDialogDevice.id, "users"] });
      toast({ title: "Mapped Successfully", description: data?.message });
      setMapPinRow(null); setMapSelectedEmployee("");
    },
    onError: (error: any) => toast({ title: "Mapping Failed", description: error?.message, variant: "destructive" }),
  });

  const syncUsersMutation = useMutation({
    mutationFn: async (id: string) => { const res = await apiRequest("POST", `/api/biometric/devices/${id}/sync-users`, {}); return res.json(); },
    onSuccess: (data) => {
      toast({ title: "Sync requested", description: data?.message || "Device will push its user list shortly." });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] }), 60_000);
    },
    onError: (err: any) => toast({ title: "Sync failed", description: err?.message, variant: "destructive" }),
  });

  const resetStampMutation = useMutation({
    mutationFn: async (id: string) => { const res = await apiRequest("POST", `/api/biometric/devices/${id}/reset-stamp`, {}); return res.json(); },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      toast({ title: "Stamp reset", description: data?.message });
    },
    onError: (err: any) => toast({ title: "Reset failed", description: err?.message, variant: "destructive" }),
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/biometric/devices/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      toast({ title: "Device removed" });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err?.message, variant: "destructive" }),
  });

  const handleAddDevice = () => {
    if (!deviceName || !deviceSerial) { toast({ title: "Name and serial are required", variant: "destructive" }); return; }
    const resolvedCompanyId = isSuperAdmin ? (deviceCompanyId || null) : (user?.companyId || null);
    if (!resolvedCompanyId) { toast({ title: "Please select a company", variant: "destructive" }); return; }
    const tokenTrim = devicePushToken.trim();
    const cidrTrim = deviceAllowedCidr.trim();
    if (!tokenTrim && !cidrTrim) { toast({ title: "Set a push token or IP/CIDR for security", variant: "destructive" }); return; }
    if (tokenTrim && tokenTrim.length < 12) { toast({ title: "Push token too short (min 12 chars)", variant: "destructive" }); return; }
    deviceMutation.mutate({
      companyId: resolvedCompanyId, name: deviceName, code: deviceCode.trim() || null,
      deviceSerial, ipAddress: deviceIp, admsServerIp: deviceServerIp.trim() || null,
      port: parseInt(devicePort), pushToken: tokenTrim || null, allowedIpCidr: cidrTrim || null,
    });
  };

  const handlePushData = () => {
    try {
      const parsed = JSON.parse(pushData);
      const punches = Array.isArray(parsed) ? parsed : [parsed];
      const companyId = isSuperAdmin ? syncCompanyId : (user?.companyId || "");
      if (!companyId) { toast({ title: "Please select a company", variant: "destructive" }); return; }
      pushMutation.mutate({ punches, companyId });
    } catch {
      toast({ title: "Invalid JSON format", variant: "destructive" });
    }
  };

  /* ═══════════════ RENDER ═══════════════════════════════════════ */
  return (
    <div className="p-6 space-y-5 max-w-[1400px]">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900">
            <Fingerprint className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Biometric Integration</h1>
            <p className="text-sm text-muted-foreground">Devices connect via ADMS — attendance is synced automatically</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setImportFile(null); setImportDialogOpen(true); }} data-testid="button-import-attlog">
            <FileUp className="h-4 w-4 mr-1.5" /> Import File
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPushDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" /> Push Data
          </Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="logs" className="w-full">
        <TabsList className={`grid ${canViewAdmsLog ? "grid-cols-3 max-w-[480px]" : "grid-cols-2 max-w-[320px]"}`}>
          <TabsTrigger value="logs" className="gap-1.5 text-sm">
            <Clock className="h-3.5 w-3.5" /> Punch Logs
          </TabsTrigger>
          <TabsTrigger value="devices" className="gap-1.5 text-sm">
            <Settings className="h-3.5 w-3.5" /> Devices
          </TabsTrigger>
          {canViewAdmsLog && (
            <TabsTrigger value="adms-debug" className="gap-1.5 text-sm" data-testid="tab-adms-debug">
              <Activity className="h-3.5 w-3.5" /> Comm Log
            </TabsTrigger>
          )}
        </TabsList>

        {/* ══════════ TAB 1: PUNCH LOGS ══════════ */}
        <TabsContent value="logs" className="space-y-4 mt-4">

          {/* Stats row */}
          <div className="flex flex-wrap gap-2">
            <StatChip icon={Clock} value={totalLogs} label="Total Punches" color="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300" />
            <StatChip icon={CheckCircle} value={processedLogs} label="Synced" color="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300" />
            <StatChip icon={AlertTriangle} value={missingPunchLogs} label="Missing Punch" color="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" />
            <StatChip icon={XCircle} value={unmappedLogs} label="Unmapped IDs" color="border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300" />
          </div>

          {/* Filters toolbar */}
          <div className="flex flex-wrap items-end gap-3 p-3 bg-muted/40 rounded-lg border">
            {isSuperAdmin && (
              <div className="min-w-[160px]">
                <Label className="text-xs mb-1 block text-muted-foreground">Company</Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Companies</SelectItem>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">Date</Label>
              <div className="flex items-center gap-1">
                <button onClick={() => shiftDate(-1)} className="h-8 px-2 rounded border bg-background text-muted-foreground hover:bg-accent text-xs">◀</button>
                <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-8 w-36 text-sm" />
                <button onClick={() => shiftDate(1)} className="h-8 px-2 rounded border bg-background text-muted-foreground hover:bg-accent text-xs">▶</button>
                <button
                  onClick={() => setSelectedDate(selectedDate ? "" : new Date().toISOString().split("T")[0])}
                  className={`h-8 px-2.5 rounded border text-xs transition-colors ${selectedDate ? "bg-background text-muted-foreground hover:bg-accent" : "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"}`}
                  data-testid="button-toggle-all-dates"
                >{selectedDate ? "All" : "Today"}</button>
              </div>
            </div>
            <div className="min-w-[140px]">
              <Label className="text-xs mb-1 block text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unprocessed">Pending</SelectItem>
                  <SelectItem value="processed">Synced</SelectItem>
                  <SelectItem value="missing">Missing Punch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          <Card className="shadow-sm">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading punch logs…
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                  <Clock className="h-10 w-10 opacity-20" />
                  <p className="font-medium">No punch records found</p>
                  {selectedDate && (
                    <p className="text-sm">
                      Try{" "}
                      <button onClick={() => setSelectedDate("")} className="text-blue-600 underline">viewing all dates</button>
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-8 pl-4">#</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Device PIN</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        {isSuperAdmin && <TableHead>Company</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log, idx) => {
                        const emp = getEmployee(log.employeeId);
                        const empName = emp ? `${emp.firstName} ${emp.lastName}` : null;
                        return (
                          <TableRow key={log.id} className={log.missingPunch ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                            <TableCell className="pl-4 text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <Avatar name={empName} size="sm" />
                                <div>
                                  {empName ? (
                                    <>
                                      <p className="text-sm font-medium leading-none">{empName}</p>
                                      {emp?.employeeCode && <p className="text-xs text-muted-foreground mt-0.5">{emp.employeeCode}</p>}
                                    </>
                                  ) : (
                                    <Badge variant="destructive" className="text-xs">Unmapped</Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{log.deviceEmployeeId}</TableCell>
                            <TableCell className="text-sm">{log.punchDate}</TableCell>
                            <TableCell className="font-mono text-sm font-medium">{log.punchTime}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs capitalize">{log.punchType}</Badge>
                            </TableCell>
                            <TableCell>
                              {log.isProcessed ? (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs border-0">Synced</Badge>
                              ) : log.missingPunch ? (
                                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300 text-xs border-0">Missing Punch</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Pending</Badge>
                              )}
                            </TableCell>
                            {isSuperAdmin && <TableCell className="text-xs text-muted-foreground">{getCompanyName(log.companyId)}</TableCell>}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════ TAB 2: DEVICES ══════════ */}
        <TabsContent value="devices" className="space-y-4 mt-4">

          {/* ADMS server health banner */}
          {canViewAdmsLog && admsServerStatus && (
            <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${admsServerStatus.running
              ? "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
              : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            }`} data-testid="adms-server-status-banner">
              {admsServerStatus.running
                ? <CheckCircle className="h-4 w-4 shrink-0" />
                : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <div>
                <span className="font-medium">
                  {admsServerStatus.running
                    ? `ADMS server running on port ${admsServerStatus.port}`
                    : `ADMS server NOT running on port ${admsServerStatus.port}`}
                </span>
                {admsServerStatus.running && admsServerStatus.boundAt && (
                  <span className="ml-2 text-xs opacity-70">
                    · Active since {new Date(admsServerStatus.boundAt).toLocaleTimeString()}
                  </span>
                )}
                {!admsServerStatus.running && admsServerStatus.error && (
                  <span className="ml-2 text-xs font-mono opacity-90"> · {admsServerStatus.error}</span>
                )}
              </div>
            </div>
          )}

          {/* ADMS Setup Guide — collapsible */}
          <Card className="border-blue-200 dark:border-blue-800 shadow-sm">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-blue-900 dark:text-blue-200 hover:bg-blue-50/50 dark:hover:bg-blue-950/50 rounded-t-lg transition-colors"
              onClick={() => setSetupExpanded(v => !v)}
            >
              <span className="flex items-center gap-2">
                <Signal className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                ZKTeco x2008 Device Configuration
              </span>
              {setupExpanded ? <ChevronUp className="h-4 w-4 opacity-60" /> : <ChevronDown className="h-4 w-4 opacity-60" />}
            </button>
            {setupExpanded && (
              <CardContent className="text-sm border-t border-blue-100 dark:border-blue-900 pt-4 space-y-3">
                <div className="flex items-center gap-2 text-xs mb-2">
                  <button onClick={() => setAdmsMode("ip")} className={`px-2.5 py-1 rounded border text-xs transition-colors ${admsMode === "ip" ? "bg-blue-700 text-white border-blue-700" : "bg-white dark:bg-blue-900 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300"}`}>Use IP</button>
                  <button onClick={() => setAdmsMode("domain")} className={`px-2.5 py-1 rounded border text-xs transition-colors ${admsMode === "domain" ? "bg-blue-700 text-white border-blue-700" : "bg-white dark:bg-blue-900 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300"}`}>Use Domain</button>
                </div>
                <div className="rounded-lg border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950 p-3 text-red-800 dark:text-red-200 text-xs">
                  <strong>Enable Proxy Server → must be OFF</strong> on the device (Cloud Server Settings)
                </div>
                <div className="rounded-lg border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950 p-3 space-y-2">
                  <p className="text-xs font-semibold text-green-800 dark:text-green-200">Menu → Communication → Cloud Server Settings</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs font-mono bg-white dark:bg-green-900 rounded-lg p-3 border border-green-200 dark:border-green-700">
                    <span className="font-sans font-medium text-gray-600 dark:text-gray-400">Server Mode</span>
                    <span className="font-bold text-green-700 dark:text-green-300">ADMS</span>
                    <span className="font-sans font-medium text-gray-600 dark:text-gray-400">Enable Domain Name</span>
                    {admsMode === "domain"
                      ? <span className="font-bold text-green-700 dark:text-green-300">ON ✓</span>
                      : <span className="font-bold text-orange-600 dark:text-orange-300">OFF</span>}
                    <span className="font-sans font-medium text-gray-600 dark:text-gray-400">Server Address</span>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-blue-700 dark:text-blue-200 break-all select-all">
                        {networkLoading ? <span className="opacity-50 italic">loading…</span> : admsMode === "ip" ? (admsIp ?? <span className="text-amber-600 italic">resolving…</span>) : admsHost}
                      </span>
                      <button className="text-[10px] text-blue-600 underline shrink-0" onClick={() => { navigator.clipboard.writeText(admsAddr); toast({ title: "Copied!" }); }}>copy</button>
                    </div>
                    <span className="font-sans font-medium text-gray-600 dark:text-gray-400">Server Port</span>
                    <span className="font-bold text-blue-700 dark:text-blue-200">{admsPort}</span>
                    <span className="font-sans font-medium text-gray-600 dark:text-gray-400">Enable Proxy Server</span>
                    <span className="font-bold text-red-600 dark:text-red-400">OFF 🚫</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">Full URL:</span>
                  <code className="bg-white dark:bg-muted border rounded px-2 py-0.5 flex-1 break-all select-all text-[10px]">{admsUrl}</code>
                  <button className="shrink-0 text-blue-600 underline" onClick={() => { navigator.clipboard.writeText(admsUrl); toast({ title: "Copied!" }); }}>Copy</button>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Devices list */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between py-4 px-5">
              <div>
                <CardTitle className="text-base">Connected Machines</CardTitle>
                <CardDescription className="text-xs mt-0.5">Biometric devices linked to this system</CardDescription>
              </div>
              <Button size="sm" onClick={() => setDeviceDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Machine
              </Button>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {(() => {
                const unauth = devices.filter((d: any) => !d.pushToken && !d.allowedIpCidr);
                if (!unauth.length) return null;
                return (
                  <div className="mx-5 mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3 text-sm text-amber-900 dark:text-amber-200" data-testid="banner-devices-missing-auth">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <p>{unauth.length} device{unauth.length > 1 ? "s" : ""} without security ({unauth.map((d: any) => d.name).join(", ")}) — add a push token to prevent spoofing</p>
                  </div>
                );
              })()}

              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="pl-5">Device</TableHead>
                      <TableHead>Connection</TableHead>
                      <TableHead>Security</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Connected</TableHead>
                      <TableHead className="text-right pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          <Fingerprint className="h-8 w-8 mx-auto mb-2 opacity-20" />
                          <p>No devices linked yet</p>
                        </TableCell>
                      </TableRow>
                    ) : devices.map((device: any) => {
                      const ts = device.lastPushAt || device.lastSync;
                      const minsAgo = ts ? Math.round((Date.now() - new Date(ts).getTime()) / 60000) : null;
                      const agoLabel = minsAgo === null ? null : minsAgo < 1 ? "just now" : minsAgo < 60 ? `${minsAgo}m ago` : `${Math.round(minsAgo / 60)}h ago`;
                      return (
                        <TableRow key={device.id}>
                          <TableCell className="pl-5">
                            <div className="space-y-0.5">
                              <p className="font-medium text-sm">{device.name}</p>
                              <div className="flex items-center gap-2">
                                {device.code && <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">{device.code}</Badge>}
                                <span className="text-xs text-muted-foreground font-mono">{device.deviceSerial}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs space-y-0.5">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <span className="opacity-60">Server:</span>
                                <span className="font-mono">{device.admsServerIp || networkInfo?.ip || "—"}:{device.port || admsPort}</span>
                              </div>
                              {device.ipAddress && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <span className="opacity-60">Machine:</span>
                                  <span className="font-mono">{device.ipAddress}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {device.allowedIpCidr ? (
                              <Badge variant="outline" className="text-xs gap-1 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400" data-testid={`auth-status-${device.id}`}>
                                <ShieldCheck className="h-3 w-3" /> IP-pinned
                              </Badge>
                            ) : device.pushToken ? (
                              <Badge variant="outline" className="text-xs gap-1 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400" data-testid={`auth-status-${device.id}`}>
                                <ShieldCheck className="h-3 w-3" /> Token set
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs gap-1 border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400" data-testid={`auth-status-${device.id}`}>
                                <ShieldAlert className="h-3 w-3" /> Open
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {device.status === "online" ? (
                              <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
                                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse inline-block" />
                                <span className="text-xs font-medium">Online</span>
                              </div>
                            ) : (
                              <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 text-muted-foreground cursor-help">
                                      <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600 inline-block" />
                                      <span className="text-xs">Offline</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs">
                                    {ts ? `No push received in ${minsAgo}m` : `Never connected. Set Server Mode = ADMS, Address = ${device.admsServerIp || "VPS IP"}, Port = 8181`}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs space-y-0.5">
                              {ts ? (
                                <>
                                  <p className="text-muted-foreground" title={new Date(ts).toLocaleString()}>{agoLabel}</p>
                                  <div className="flex items-center gap-1">
                                    <span className="text-muted-foreground opacity-60">stamp:</span>
                                    <span className={`font-mono ${(device.lastAttlogStamp ?? 0) === 0 ? "text-amber-600" : "text-green-600 dark:text-green-400"}`}>
                                      {device.lastAttlogStamp ?? 0}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 font-medium">Never</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="pr-4">
                            <TooltipProvider delayDuration={200}>
                              <div className="flex justify-end gap-1">
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setUsersDialogDevice(device)} data-testid={`button-view-users-${device.id}`}>
                                    <Users className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>View enrolled users</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => syncUsersMutation.mutate(device.id)} disabled={syncUsersMutation.isPending} data-testid={`button-sync-users-${device.id}`}>
                                    <RefreshCw className={`h-3.5 w-3.5 ${syncUsersMutation.isPending ? "animate-spin" : ""}`} />
                                  </Button>
                                </TooltipTrigger><TooltipContent>Sync users from device</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700" onClick={() => resetStampMutation.mutate(device.id)} disabled={resetStampMutation.isPending} data-testid={`button-reset-stamp-${device.id}`}>
                                    <RotateCcw className={`h-3.5 w-3.5 ${resetStampMutation.isPending ? "animate-spin" : ""}`} />
                                  </Button>
                                </TooltipTrigger><TooltipContent>Force full re-upload</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(device)} data-testid={`button-edit-device-${device.id}`}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>Edit device</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setDeviceToDelete(device)} data-testid={`button-delete-device-${device.id}`}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger><TooltipContent>Delete device</TooltipContent></Tooltip>
                              </div>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════ TAB 3: COMM LOG ══════════ */}
        {canViewAdmsLog && (
          <TabsContent value="adms-debug" className="mt-4">
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between py-4 px-5">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Device Communication Log
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Live event log — auto-refreshes every 5s · Last 200 entries
                    <span className="ml-2 text-purple-600 dark:text-purple-400">↑OUT=server→device</span>
                    {" · "}<span className="text-green-600 dark:text-green-400">green=ATTLOG</span>
                    {" · "}<span className="text-blue-600 dark:text-blue-400">blue=USER</span>
                    {" · "}<span className="text-red-600 dark:text-red-400">red=error</span>
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchAdmsLog()} data-testid="button-refresh-adms-log">
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {admsLog.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    No device activity yet. Device will appear here within 10 seconds of connecting.
                  </div>
                ) : (
                  <div className="font-mono text-xs bg-muted rounded-lg p-3 overflow-auto max-h-[500px] space-y-0.5" data-testid="adms-log-container">
                    {[...admsLog].reverse().map((entry, i) => {
                      const isOut = entry.direction === "OUT";
                      const isAttlog = entry.line.includes("ATTLOG");
                      const isUserinfo = entry.line.includes("USERINFO") || entry.line.includes("USER");
                      const isError = entry.line.includes("reject") || entry.line.includes("ERROR") || entry.line.includes("auth");
                      const color = isError ? "text-red-600 dark:text-red-400" : isOut ? "text-purple-600 dark:text-purple-400" : isAttlog ? "text-green-600 dark:text-green-400" : isUserinfo ? "text-blue-600 dark:text-blue-400" : "text-foreground/70";
                      return (
                        <div key={i} className={`flex gap-2 ${color}`}>
                          <span className="shrink-0 text-muted-foreground">{new Date(entry.ts).toLocaleTimeString("en-IN", { hour12: false })}</span>
                          <span className="shrink-0 font-semibold">[{entry.sn}]</span>
                          <span className="shrink-0 text-muted-foreground">{isOut ? "↑OUT" : "↓IN "}</span>
                          <span className="break-all">{entry.line}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ═══════════════ DIALOGS ═══════════════ */}

      {/* Users on machine dialog — card grid with photo */}
      <Dialog open={!!usersDialogDevice} onOpenChange={(open) => { if (!open) setUsersDialogDevice(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Users on {usersDialogDevice?.name}
              {usersDialogDevice?.code && <Badge variant="outline" className="font-mono">{usersDialogDevice.code}</Badge>}
            </DialogTitle>
            <DialogDescription>
              Enrolled users and punch-only IDs from this machine. Use the Map button to link a Device PIN to an HR employee.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {usersLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading users…
              </div>
            ) : !deviceUsers || deviceUsers.users?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <Users className="h-10 w-10 opacity-20" />
                <p className="font-medium">No users found on this machine</p>
                <p className="text-sm text-center">Users appear once the device pushes its enrollment list or someone punches in</p>
              </div>
            ) : (
              <>
                {/* Banner for card-only (punch-only unmapped) users */}
                {(() => {
                  const cardOnly = deviceUsers.users.filter((u: any) => !u.enrolled && !u.matched);
                  if (!cardOnly.length) return null;
                  return (
                    <div className="mx-1 mb-3 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">{cardOnly.length} card/access punch user{cardOnly.length > 1 ? "s" : ""} need to be linked</p>
                        <p className="mt-0.5 opacity-80">These PINs have punch records but are not face-enrolled on this device (they use an access card). Click <strong>Map to Employee</strong> on each to link them — their HR name and photo will then appear automatically.</p>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-1">
                  {deviceUsers.users.map((u: any) => {
                    const hrName = u.matched ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : null;
                    const isCardOnly = !u.enrolled && !u.deviceName;
                    const cardClass = u.matched
                      ? "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/20"
                      : isCardOnly
                        ? "border-amber-200 dark:border-amber-800 bg-amber-50/20 dark:bg-amber-950/10"
                        : "bg-card";
                    return (
                      <div key={u.deviceEmployeeId} className={`rounded-xl border p-4 flex flex-col gap-3 transition-shadow hover:shadow-md ${cardClass}`}>
                        {/* Photo + Name row */}
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={hrName || u.deviceName}
                            photo={u.faceImage}
                            size="lg"
                          />
                          <div className="flex-1 min-w-0">
                            {u.deviceName ? (
                              <p className="font-semibold text-sm leading-tight truncate">{u.deviceName}</p>
                            ) : hrName ? (
                              <p className="font-semibold text-sm leading-tight truncate">{hrName}</p>
                            ) : (
                              <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">Card / Access PIN</p>
                            )}
                            {u.privilege && u.privilege !== "0" && (
                              <Badge variant="outline" className="text-[10px] mt-0.5">Admin</Badge>
                            )}
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">PIN: {u.deviceEmployeeId}</span>
                              {u.enrolled ? (
                                <Badge className="text-[10px] h-4 px-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-0">Face Enrolled</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-400 text-amber-700 dark:text-amber-400">Card Punch</Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* HR Employee link */}
                        <div className={`rounded-lg px-3 py-2 text-xs ${u.matched ? "bg-green-100 dark:bg-green-900/40 border border-green-200 dark:border-green-800" : "bg-muted/60 border"}`}>
                          {u.matched ? (
                            <div className="flex items-center gap-1.5 text-green-800 dark:text-green-300">
                              <BadgeCheck className="h-3.5 w-3.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium truncate">{hrName}</p>
                                {u.hrEmployeeCode && <p className="opacity-70">{u.hrEmployeeCode} {u.designation ? `· ${u.designation}` : ""}</p>}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Link2 className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              <span>{isCardOnly ? "Map to show HR name & photo" : "Not linked to HR employee"}</span>
                            </div>
                          )}
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{u.punchCount} punch{u.punchCount !== 1 ? "es" : ""}</span>
                          </div>
                          {u.lastSeenAt && (
                            <span className="truncate ml-2" title={u.lastSeenAt}>
                              Last: {u.lastSeenAt.substring(0, 10)}
                            </span>
                          )}
                        </div>

                        {/* Map button */}
                        <Button
                          data-testid={`button-map-pin-${u.deviceEmployeeId}`}
                          size="sm"
                          variant={u.matched ? "outline" : isCardOnly ? "default" : "default"}
                          className={`w-full h-8 text-xs ${isCardOnly && !u.matched ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
                          onClick={() => {
                            setMapPinRow({ devicePin: u.deviceEmployeeId, deviceName: u.deviceName || u.deviceEmployeeId });
                            setMapSelectedEmployee(u.employeeId || "");
                          }}
                        >
                          {u.matched ? (
                            <><Pencil className="h-3 w-3 mr-1.5" /> Remap Employee</>
                          ) : (
                            <><Link2 className="h-3 w-3 mr-1.5" /> Map to Employee</>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mr-auto">
              {deviceUsers?.total != null && <span>{deviceUsers.total} user{deviceUsers.total !== 1 ? "s" : ""} total</span>}
              <span>·</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500 inline-block" />Mapped to HR</span>
            </div>
            <Button variant="outline" onClick={() => setUsersDialogDevice(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Map PIN → Employee dialog */}
      <Dialog open={!!mapPinRow} onOpenChange={(open) => { if (!open) { setMapPinRow(null); setMapSelectedEmployee(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Map Device PIN to Employee</DialogTitle>
            <DialogDescription>
              Link device PIN <strong className="font-mono">{mapPinRow?.devicePin}</strong>
              {mapPinRow?.deviceName ? ` (${mapPinRow.deviceName})` : ""} to an HR employee. All existing punch records for this PIN will be retroactively linked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={mapSelectedEmployee} onValueChange={setMapSelectedEmployee}>
              <SelectTrigger data-testid="select-map-employee">
                <SelectValue placeholder="Select employee…" />
              </SelectTrigger>
              <SelectContent>
                {employees
                  .filter((e: any) => !e.biometricDeviceId || e.biometricDeviceId === mapPinRow?.devicePin)
                  .map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName} ({e.employeeCode})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMapPinRow(null); setMapSelectedEmployee(""); }}>Cancel</Button>
            <Button
              data-testid="button-confirm-map"
              disabled={!mapSelectedEmployee || mapPinMutation.isPending}
              onClick={() => {
                if (mapPinRow && mapSelectedEmployee) {
                  mapPinMutation.mutate({ employeeId: mapSelectedEmployee, devicePin: mapPinRow.devicePin, deviceId: usersDialogDevice?.id });
                }
              }}
            >
              {mapPinMutation.isPending ? "Saving…" : "Confirm Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import File dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Attendance File</DialogTitle>
            <DialogDescription>Upload an ATTLOG or USERINFO text file exported from the device.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>File Type</Label>
              <Select value={importType} onValueChange={(v: any) => setImportType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="attlog">Attendance Log (ATTLOG)</SelectItem>
                  <SelectItem value="userinfo">User List (USERINFO)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Device (optional)</Label>
              <Select value={importDeviceId} onValueChange={setImportDeviceId}>
                <SelectTrigger><SelectValue placeholder="Select device…" /></SelectTrigger>
                <SelectContent>
                  {devices.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>File</Label>
              <Input type="file" accept=".txt,.dat,.log" onChange={e => setImportFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!importFile || importFileMutation.isPending}
              onClick={() => { if (importFile) importFileMutation.mutate({ file: importFile, deviceId: importDeviceId, type: importType }); }}
            >
              {importFileMutation.isPending ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push Punch Data dialog */}
      <Dialog open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Push Biometric Punch Data</DialogTitle>
            <DialogDescription>Paste JSON data from your biometric device.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isSuperAdmin && (
              <div>
                <Label>Company</Label>
                <Select value={syncCompanyId} onValueChange={setSyncCompanyId}>
                  <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Punch Data (JSON)</Label>
              <Textarea value={pushData} onChange={e => setPushData(e.target.value)}
                placeholder={`[\n  { "deviceEmployeeId": "1001", "punchTime": "09:05", "punchDate": "2026-04-24", "punchType": "in" }\n]`}
                rows={6} className="font-mono text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePushData} disabled={pushMutation.isPending}>{pushMutation.isPending ? "Uploading…" : "Upload"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Device dialog */}
      <Dialog open={deviceDialogOpen} onOpenChange={setDeviceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Biometric Machine</DialogTitle>
            <DialogDescription>Link a new ZKTeco device to the HRMS system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {isSuperAdmin && (
              <div>
                <Label>Company <span className="text-red-500">*</span></Label>
                <Select value={deviceCompanyId} onValueChange={setDeviceCompanyId}>
                  <SelectTrigger data-testid="select-device-company"><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Machine Name <span className="text-red-500">*</span></Label>
                <Input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="Front Gate" data-testid="input-device-name" />
              </div>
              <div>
                <Label>Code <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input value={deviceCode} onChange={e => setDeviceCode(e.target.value)} placeholder="GATE-A" data-testid="input-device-code" />
              </div>
            </div>
            <div>
              <Label>Serial Number <span className="text-red-500">*</span></Label>
              <Input value={deviceSerial} onChange={e => setDeviceSerial(e.target.value)} placeholder="NCD8250201712" data-testid="input-device-serial" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Machine IP</Label>
                <Input value={deviceIp} onChange={e => setDeviceIp(e.target.value)} placeholder="192.168.1.200" />
              </div>
              <div>
                <Label>Port</Label>
                <Input value={devicePort} onChange={e => setDevicePort(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>ADMS Server IP <span className="text-xs text-muted-foreground">(VPS public IP)</span></Label>
              <Input value={deviceServerIp} onChange={e => setDeviceServerIp(e.target.value)} placeholder="31.97.207.109" data-testid="input-device-server-ip" />
            </div>
            <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground">Security — fill at least one</p>
              <div>
                <Label>Office Internet IP (CIDR)</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={deviceAllowedCidr} onChange={e => setDeviceAllowedCidr(e.target.value)} placeholder="Auto-detect or enter manually" className="font-mono text-xs" data-testid="input-add-device-cidr" />
                  <Button type="button" variant="outline" size="sm" disabled={detectingIp} onClick={() => autoDetectSourceIp(setDeviceAllowedCidr)} data-testid="button-add-detect-ip">
                    {detectingIp ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Signal className="h-3.5 w-3.5" />}
                    <span className="ml-1">Detect</span>
                  </Button>
                </div>
              </div>
              <div>
                <Label>Push Token</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={devicePushToken} onChange={e => setDevicePushToken(e.target.value)} placeholder="Min 12 characters" className="font-mono text-xs" data-testid="input-add-device-token" />
                  <Button type="button" variant="outline" size="sm" onClick={() => generateToken(setDevicePushToken)} data-testid="button-add-generate-token">
                    <KeyRound className="h-3.5 w-3.5 mr-1" /> Gen
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDevice} disabled={deviceMutation.isPending}>{deviceMutation.isPending ? "Adding…" : "Add Machine"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Device dialog */}
      <Dialog open={!!editDevice} onOpenChange={(open) => { if (!open) setEditDevice(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Device</DialogTitle>
            <DialogDescription>Update device settings. To rotate a leaked token, click Gen and save to the device.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {isSuperAdmin && (
              <div>
                <Label>Company</Label>
                <Select value={editCompanyId} onValueChange={setEditCompanyId}>
                  <SelectTrigger data-testid="select-edit-device-company"><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Machine Name</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} data-testid="input-edit-device-name" />
              </div>
              <div>
                <Label>Code</Label>
                <Input value={editCode} onChange={e => setEditCode(e.target.value)} placeholder="M1, GATE-A…" data-testid="input-edit-device-code" />
              </div>
            </div>
            <div>
              <Label>Serial Number</Label>
              <Input value={editSerial} onChange={e => setEditSerial(e.target.value)} data-testid="input-edit-device-serial" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Machine IP</Label>
                <Input value={editIp} onChange={e => setEditIp(e.target.value)} placeholder="192.168.1.200" data-testid="input-edit-device-ip" />
              </div>
              <div>
                <Label>Port</Label>
                <Input value={editPort} onChange={e => setEditPort(e.target.value)} data-testid="input-edit-device-port" />
              </div>
            </div>
            <div>
              <Label>ADMS Server IP</Label>
              <Input value={editServerIp} onChange={e => setEditServerIp(e.target.value)} placeholder="31.97.207.109" data-testid="input-edit-device-server-ip" />
            </div>
            <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground">Security</p>
              <div>
                <Label>Office Internet IP (CIDR)</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={editAllowedCidr} onChange={e => setEditAllowedCidr(e.target.value)} className="font-mono text-xs" data-testid="input-edit-device-cidr" />
                  <Button type="button" variant="outline" size="sm" disabled={detectingIp} onClick={() => autoDetectSourceIp(setEditAllowedCidr)}>
                    {detectingIp ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Signal className="h-3.5 w-3.5" />}
                    <span className="ml-1">Detect</span>
                  </Button>
                </div>
              </div>
              <div>
                <Label>Push Token</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={editPushToken} onChange={e => setEditPushToken(e.target.value)} className="font-mono text-xs" data-testid="input-edit-device-token" />
                  <Button type="button" variant="outline" size="sm" onClick={() => generateToken(setEditPushToken)} data-testid="button-edit-generate-token">
                    <KeyRound className="h-3.5 w-3.5 mr-1" /> Gen
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDevice(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={editDeviceMutation.isPending} data-testid="button-save-edit-device">
              {editDeviceMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deviceToDelete} onOpenChange={(open) => { if (!open) setDeviceToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deviceToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the device and its configuration. Punch logs already imported will be kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deviceToDelete) {
                  deleteDeviceMutation.mutate(deviceToDelete.id);
                  setDeviceToDelete(null);
                }
              }}
            >
              Delete Device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
