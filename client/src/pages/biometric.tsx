import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Fingerprint, Upload, RefreshCw, AlertTriangle, CheckCircle, 
  Clock, XCircle, Settings, Plus, Trash2, Signal, SignalLow, Download, Users,
  ShieldAlert, ShieldCheck, Pencil, KeyRound, Activity, UserCheck, FileUp, RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { BiometricPunchLog, Company, Employee, BiometricDevice } from "@shared/schema";


export default function BiometricPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  // "domain" = use hostname + port 443 (recommended)
  // "ip"     = use resolved IPv4 (for devices that can't use domain)
  const [admsMode, setAdmsMode] = useState<"domain" | "ip">("ip");

  const { data: networkInfo, isLoading: networkLoading } = useQuery<{
    host: string; replitDevDomain: string | null; ip: string | null;
    port: string; proto: string; admsUrl: string; admsUrlIp: string | null;
  }>({
    queryKey: ["/api/server/network-info"],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Prefer Replit dev domain (guaranteed accessible) over browser hostname
  const fallbackHost = window.location.hostname;
  const fallbackPort = window.location.protocol === "https:" ? "443" : (window.location.port || "5000");
  // The best hostname: replitDevDomain > req.hostname > browser hostname
  const admsHost  = networkInfo?.replitDevDomain ?? networkInfo?.host ?? fallbackHost;
  const admsIp    = networkInfo?.ip ?? null;
  const admsPort  = "8181";
  const admsProto = "http";

  const admsAddr  = admsMode === "ip" ? (admsIp ?? admsHost) : admsHost;
  const admsUrl   = `http://${admsAddr}:8181/iclock/cdata`;

  const [selectedCompany, setSelectedCompany] = useState<string>(isSuperAdmin ? "__all__" : (user?.companyId || ""));
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [pushData, setPushData] = useState("");
  const [syncCompanyId, setSyncCompanyId] = useState("");
  
  // Device Form State
  const [deviceName, setDeviceName] = useState("");
  const [deviceCode, setDeviceCode] = useState("");
  const [deviceSerial, setDeviceSerial] = useState("");
  const [deviceIp, setDeviceIp] = useState("");
  const [devicePort, setDevicePort] = useState("8181");
  const [deviceCompanyId, setDeviceCompanyId] = useState("");
  const [devicePushToken, setDevicePushToken] = useState("");
  const [deviceAllowedCidr, setDeviceAllowedCidr] = useState("");

  // "View Users on Machine" dialog state
  const [usersDialogDevice, setUsersDialogDevice] = useState<any | null>(null);

  // "Delete Device" confirmation state
  const [deviceToDelete, setDeviceToDelete] = useState<any | null>(null);

  // Import attendance file state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDeviceId, setImportDeviceId] = useState("");
  const [importType, setImportType] = useState<"attlog" | "userinfo">("attlog");

  // Map PIN → HR Employee dialog state
  const [mapPinRow, setMapPinRow] = useState<{ devicePin: string; deviceName: string } | null>(null);
  const [mapSelectedEmployee, setMapSelectedEmployee] = useState("");

  // "Edit Device" dialog state — same shape as the Add form, plus the device id.
  const [detectingIp, setDetectingIp] = useState(false);

  const autoDetectSourceIp = async (setter: (v: string) => void) => {
    setDetectingIp(true);
    try {
      const res = await fetch("/api/server/my-ip", { credentials: "include" });
      const { ip } = await res.json();
      if (ip) setter(`${ip}/32`);
    } catch { /* ignore */ } finally {
      setDetectingIp(false);
    }
  };

  const [editDevice, setEditDevice] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editSerial, setEditSerial] = useState("");
  const [editIp, setEditIp] = useState("");
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
    setEditPort(d.port != null ? String(d.port) : "");
    setEditCompanyId(d.companyId || "");
    setEditPushToken(d.pushToken || "");
    setEditAllowedCidr(d.allowedIpCidr || "");
  };

  // Generate a strong random push token. 32 chars from a URL-safe alphabet
  // gives ~190 bits of entropy — plenty for an HMAC-style shared secret and
  // well above the server's 12-char minimum.
  const generateToken = (setter: (v: string) => void) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const cryptoApi: Crypto | undefined = globalThis.crypto;
    if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
      toast({
        title: "Cannot generate token",
        description: "Secure random generator is unavailable in this browser.",
        variant: "destructive",
      });
      return;
    }
    const bytes = new Uint8Array(32);
    cryptoApi.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
    setter(out);
  };
  const { data: deviceUsers, isLoading: usersLoading } = useQuery<any>({
    queryKey: ["/api/biometric/devices", usersDialogDevice?.id, "users"],
    enabled: !!usersDialogDevice?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/biometric/devices/${usersDialogDevice.id}/users`);
      return res.json();
    },
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: devices = [] } = useQuery<BiometricDevice[]>({
    queryKey: ["/api/biometric/devices"],
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

  // ADMS raw device communication log — visible to super_admin and company_admin,
  // auto-refreshes every 5s so incoming ATTLOG data appears immediately.
  const canViewAdmsLog = isSuperAdmin || user?.role === "company_admin";
  const { data: admsLog = [], refetch: refetchAdmsLog } = useQuery<Array<{
    ts: string; direction: "IN" | "OUT"; sn: string; line: string;
  }>>({
    queryKey: ["/api/biometric/adms-log"],
    enabled: canViewAdmsLog,
    refetchInterval: canViewAdmsLog ? 5000 : false,
  });

  // ADMS server health — checks whether port 8181 is bound on the VPS.
  const { data: admsServerStatus } = useQuery<{
    running: boolean; port: number; boundAt: string | null; error: string | null;
  }>({
    queryKey: ["/api/biometric/adms-server-status"],
    enabled: canViewAdmsLog,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const pushMutation = useMutation({
    mutationFn: async (data: { punches: any[]; companyId: string }) => {
      const res = await apiRequest("POST", "/api/biometric/push", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/logs"] });
      toast({
        title: "Punch Data Uploaded",
        description: `Inserted: ${data.results.inserted}, Duplicates: ${data.results.duplicates}, Unmapped: ${data.results.unmapped}, Errors: ${data.results.errors}`,
      });
      setPushDialogOpen(false);
      setPushData("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to upload punch data", variant: "destructive" });
    },
  });

  const deviceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/biometric/devices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      toast({ title: "Success", description: "Biometric device added successfully" });
      setDeviceDialogOpen(false);
      setDeviceName("");
      setDeviceCode("");
      setDeviceSerial("");
      setDeviceIp("");
      setDevicePort("8181");
      setDeviceCompanyId("");
      setDevicePushToken("");
      setDeviceAllowedCidr("");
    },
    onError: (err: any) => {
      toast({
        title: "Failed to add device",
        description: err?.message || "Could not add device",
        variant: "destructive",
      });
    },
  });

  const editDeviceMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const res = await apiRequest("PATCH", `/api/biometric/devices/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      toast({ title: "Device updated", description: "Changes saved." });
      setEditDevice(null);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to update device",
        description: err?.message || "Could not save changes",
        variant: "destructive",
      });
    },
  });

  const handleSaveEdit = () => {
    if (!editDevice) return;
    if (!editName.trim() || !editSerial.trim()) {
      toast({ title: "Error", description: "Name and serial number are required", variant: "destructive" });
      return;
    }
    const tokenTrim = editPushToken.trim();
    const cidrTrim = editAllowedCidr.trim();
    if (!tokenTrim && !cidrTrim) {
      toast({
        title: "Authentication required",
        description: "Set a push token (shared secret) or pinned source IP/CIDR so spoofed pushes are rejected.",
        variant: "destructive",
      });
      return;
    }
    if (tokenTrim && tokenTrim.length < 12) {
      toast({
        title: "Push token too short",
        description: "Use at least 12 characters. Click Generate for a strong random one.",
        variant: "destructive",
      });
      return;
    }
    editDeviceMutation.mutate({
      id: editDevice.id,
      patch: {
        name: editName.trim(),
        code: editCode.trim() || null,
        deviceSerial: editSerial.trim(),
        ipAddress: editIp.trim() || null,
        port: editPort === "" ? null : Number(editPort),
        companyId: editCompanyId || null,
        pushToken: tokenTrim || null,
        allowedIpCidr: cidrTrim || null,
      },
    });
  };


  const importFileMutation = useMutation({
    mutationFn: async ({ file, deviceId, type }: { file: File; deviceId: string; type: "attlog" | "userinfo" }) => {
      const form = new FormData();
      form.append("file", file);
      if (deviceId) form.append("deviceId", deviceId);
      const endpoint = type === "userinfo" ? "/api/biometric/import-userinfo" : "/api/biometric/import-attlog";
      const res = await fetch(endpoint, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Import failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      setImportDialogOpen(false);
      setImportFile(null);
      toast({
        title: "Import Complete",
        description: data?.message || "Import completed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error?.message || "Could not import the file.",
        variant: "destructive",
      });
    },
  });

  const mapPinMutation = useMutation({
    mutationFn: async ({ employeeId, devicePin, deviceId }: { employeeId: string; devicePin: string; deviceId?: string }) => {
      const res = await apiRequest("POST", "/api/biometric/map-pin", { employeeId, devicePin, deviceId });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/logs"] });
      if (usersDialogDevice?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices", usersDialogDevice.id, "users"] });
      }
      toast({
        title: "Mapped Successfully",
        description: typeof data?.message === "string" ? data.message : "PIN mapped to employee.",
      });
      setMapPinRow(null);
      setMapSelectedEmployee("");
    },
    onError: (error: any) => {
      toast({
        title: "Mapping Failed",
        description: typeof error?.message === "string" ? error.message : "Could not map PIN.",
        variant: "destructive",
      });
    },
  });

  const syncUsersMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/biometric/devices/${id}/sync-users`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sync requested",
        description: typeof data?.message === "string"
          ? data.message
          : "Device will push its user list shortly.",
      });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      }, 60_000);
    },
    onError: (err: any) => {
      toast({
        title: "Sync failed",
        description: err?.message || "Could not request user sync",
        variant: "destructive",
      });
    },
  });

  const resetStampMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/biometric/devices/${id}/reset-stamp`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      toast({ title: "Stamp reset", description: typeof data?.message === "string" ? data.message : "Device will re-upload all records on next connection." });
    },
    onError: (err: any) => {
      toast({ title: "Reset failed", description: err?.message || "Could not reset stamp", variant: "destructive" });
    },
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/biometric/devices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      toast({ title: "Success", description: "Device removed" });
    },
    onError: (err: any) => {
      toast({
        title: "Delete failed",
        description: err?.message || "Could not remove device",
        variant: "destructive",
      });
    },
  });

  const handlePushData = () => {
    try {
      const parsed = JSON.parse(pushData);
      const punches = Array.isArray(parsed) ? parsed : [parsed];
      const companyId = isSuperAdmin ? syncCompanyId : (user?.companyId || "");
      if (!companyId) {
        toast({ title: "Error", description: "Please select a company", variant: "destructive" });
        return;
      }
      pushMutation.mutate({ punches, companyId });
    } catch {
      toast({ title: "Error", description: "Invalid JSON format. Please check your data.", variant: "destructive" });
    }
  };

  const handleAddDevice = () => {
    if (!deviceName || !deviceSerial) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    const resolvedCompanyId = isSuperAdmin ? (deviceCompanyId || null) : (user?.companyId || null);
    if (!resolvedCompanyId) {
      toast({ title: "Error", description: "Please select a company for this device", variant: "destructive" });
      return;
    }
    const tokenTrim = devicePushToken.trim();
    const cidrTrim = deviceAllowedCidr.trim();
    if (!tokenTrim && !cidrTrim) {
      toast({
        title: "Authentication required",
        description: "Set a push token (shared secret) or pinned source IP/CIDR so spoofed pushes are rejected.",
        variant: "destructive",
      });
      return;
    }
    if (tokenTrim && tokenTrim.length < 12) {
      toast({
        title: "Push token too short",
        description: "Use at least 12 characters. A long random token is best.",
        variant: "destructive",
      });
      return;
    }
    deviceMutation.mutate({
      companyId: resolvedCompanyId,
      name: deviceName,
      code: deviceCode.trim() || null,
      deviceSerial,
      ipAddress: deviceIp,
      port: parseInt(devicePort),
      pushToken: devicePushToken.trim() || null,
      allowedIpCidr: deviceAllowedCidr.trim() || null,
    });
  };

  const getCompanyName = (companyId: string) => {
    return companies.find(c => c.id === companyId)?.companyName || companyId;
  };

  const getEmployeeName = (employeeId: string | null) => {
    if (!employeeId) return "Unmapped";
    const emp = employees.find(e => e.id === employeeId);
    return emp ? `${emp.firstName} ${emp.lastName} (${emp.employeeCode})` : employeeId;
  };

  const totalLogs = logs.length;
  const processedLogs = logs.filter(l => l.isProcessed).length;
  const missingPunchLogs = logs.filter(l => l.missingPunch).length;
  const unmappedLogs = logs.filter(l => !l.employeeId).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Fingerprint className="h-7 w-7 text-blue-600" />
            Biometric Integration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage biometric devices — punch data is auto-pulled every 5 minutes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setImportFile(null); setImportDialogOpen(true); }} data-testid="button-import-attlog">
            <FileUp className="h-4 w-4 mr-2" />
            Import Attendance File
          </Button>
          <Button variant="outline" onClick={() => setPushDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Push Punch Data
          </Button>
        </div>
      </div>

      <Tabs defaultValue="logs" className="w-full">
        <TabsList className={`grid w-full ${isSuperAdmin ? "grid-cols-3 max-w-[600px]" : "grid-cols-2 max-w-[400px]"}`}>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Punch Logs
          </TabsTrigger>
          <TabsTrigger value="devices" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Device Management
          </TabsTrigger>
          {canViewAdmsLog && (
            <TabsTrigger value="adms-debug" className="flex items-center gap-2" data-testid="tab-adms-debug">
              <Activity className="h-4 w-4" />
              Device Log
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="logs" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">{totalLogs}</p>
                    <p className="text-xs text-muted-foreground">Total Punches</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">{processedLogs}</p>
                    <p className="text-xs text-muted-foreground">Processed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <div>
                    <p className="text-2xl font-bold">{missingPunchLogs}</p>
                    <p className="text-xs text-muted-foreground">Missing Punches</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold">{unmappedLogs}</p>
                    <p className="text-xs text-muted-foreground">Unmapped IDs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Punch Logs</CardTitle>
              <CardDescription>View and manage biometric punch data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 mb-4">
                {isSuperAdmin && (
                  <div className="w-48">
                    <Label className="text-xs">Company</Label>
                    <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Companies</SelectItem>
                        {companies.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-xs">Date</Label>
                  <div className="flex items-center gap-1">
                    {/* ◀ previous day */}
                    <button
                      type="button"
                      title="Previous day"
                      disabled={!selectedDate}
                      onClick={() => {
                        if (!selectedDate) return;
                        const d = new Date(selectedDate);
                        d.setDate(d.getDate() - 1);
                        setSelectedDate(d.toISOString().split("T")[0]);
                      }}
                      className="px-1.5 py-1 rounded border border-input bg-background text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
                    >◀</button>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      placeholder="All dates"
                      className="w-36"
                    />
                    {/* ▶ next day */}
                    <button
                      type="button"
                      title="Next day"
                      disabled={!selectedDate}
                      onClick={() => {
                        if (!selectedDate) return;
                        const d = new Date(selectedDate);
                        d.setDate(d.getDate() + 1);
                        setSelectedDate(d.toISOString().split("T")[0]);
                      }}
                      className="px-1.5 py-1 rounded border border-input bg-background text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
                    >▶</button>
                    {/* All-dates toggle */}
                    <button
                      type="button"
                      title={selectedDate ? "Clear date — show all dates" : "Set to today"}
                      onClick={() => setSelectedDate(selectedDate ? "" : new Date().toISOString().split("T")[0])}
                      className={`px-2 py-1 rounded border text-xs transition-colors ${selectedDate ? "border-input bg-background text-muted-foreground hover:bg-accent" : "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"}`}
                      data-testid="button-toggle-all-dates"
                    >{selectedDate ? "All" : "Today"}</button>
                  </div>
                </div>
                <div className="w-40">
                  <Label className="text-xs">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="unprocessed">Unprocessed</SelectItem>
                      <SelectItem value="processed">Processed</SelectItem>
                      <SelectItem value="missing">Missing Punch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isLoading ? (
                <p className="text-center py-8 text-muted-foreground">Loading...</p>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-muted-foreground">No punch logs found for the selected filters.</p>
                  {selectedDate && (
                    <p className="text-sm text-muted-foreground">
                      Historical records from the device may be on different dates.{" "}
                      <button
                        type="button"
                        onClick={() => setSelectedDate("")}
                        className="text-blue-600 dark:text-blue-400 underline hover:no-underline"
                      >Click here to show all dates</button>
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device ID</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Punch Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        {isSuperAdmin && <TableHead>Company</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map(log => (
                        <TableRow key={log.id} className={log.missingPunch ? "bg-yellow-50 dark:bg-yellow-950" : ""}>
                          <TableCell className="font-mono text-sm">{log.deviceEmployeeId}</TableCell>
                          <TableCell>
                            {log.employeeId ? (
                              <span>{getEmployeeName(log.employeeId)}</span>
                            ) : (
                              <Badge variant="destructive" className="text-xs">Unmapped</Badge>
                            )}
                          </TableCell>
                          <TableCell>{log.punchDate}</TableCell>
                          <TableCell className="font-mono">{log.punchTime}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">{log.punchType}</Badge>
                          </TableCell>
                          <TableCell>
                            {log.isProcessed ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs">Synced</Badge>
                            ) : log.missingPunch ? (
                              <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 text-xs">Missing Punch</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Pending</Badge>
                            )}
                          </TableCell>
                          {isSuperAdmin && <TableCell className="text-xs">{getCompanyName(log.companyId)}</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices" className="mt-4 space-y-4">
          {/* ADMS Server Port Status Banner */}
          {canViewAdmsLog && admsServerStatus && (
            <div className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
              admsServerStatus.running
                ? "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            }`} data-testid="adms-server-status-banner">
              {admsServerStatus.running
                ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
              <div className="space-y-0.5">
                <p className="font-medium">
                  {admsServerStatus.running
                    ? `ADMS server is running on port ${admsServerStatus.port}`
                    : `ADMS server is NOT running on port ${admsServerStatus.port}`}
                </p>
                {admsServerStatus.running && admsServerStatus.boundAt && (
                  <p className="text-xs opacity-75">
                    Bound at {new Date(admsServerStatus.boundAt).toLocaleString()}. Devices should connect to <code className="font-mono">http://VPS-IP:{admsServerStatus.port}</code>
                  </p>
                )}
                {!admsServerStatus.running && admsServerStatus.error && (
                  <p className="text-xs font-mono opacity-90">{admsServerStatus.error}</p>
                )}
                {!admsServerStatus.running && (
                  <p className="text-xs">Run <code className="font-mono">pm2 logs hrms-pro</code> on the VPS to see the error. Device pushes will fail until port {admsServerStatus.port} is available.</p>
                )}
              </div>
            </div>
          )}

          {/* ADMS Server Setup Instructions */}
          <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-blue-900 dark:text-blue-200 flex items-center justify-between">
                <span className="flex items-center gap-2"><Signal className="h-4 w-4" />ZKTeco ADMS Device Configuration</span>
                <div className="flex items-center gap-1 text-[11px] font-normal">
                  <button
                    type="button"
                    onClick={() => setAdmsMode("ip")}
                    className={`px-2 py-0.5 rounded border text-[11px] transition-colors ${admsMode === "ip" ? "bg-blue-700 text-white border-blue-700" : "bg-white dark:bg-blue-900 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300"}`}
                  >Use IP</button>
                  <button
                    type="button"
                    onClick={() => setAdmsMode("domain")}
                    className={`px-2 py-0.5 rounded border text-[11px] transition-colors ${admsMode === "domain" ? "bg-blue-700 text-white border-blue-700" : "bg-white dark:bg-blue-900 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300"}`}
                  >Use Domain</button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-blue-800 dark:text-blue-300 space-y-2">

              {/* RED PROXY WARNING */}
              <div className="rounded bg-red-50 dark:bg-red-950 border-2 border-red-400 dark:border-red-600 p-2 text-red-800 dark:text-red-200 text-[11px]">
                <p className="font-bold text-sm mb-1">🚫 Enable Proxy Server → must be OFF</p>
                <p>On the device go to <strong>Cloud Server Settings</strong> and scroll down — make sure <strong>Enable Proxy Server is toggled OFF</strong>. When it is ON the device routes traffic through the wrong address and will never connect.</p>
              </div>

              {/* PRIMARY: correct server address box */}
              <div className="rounded border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950 p-3 space-y-2">
                <p className="font-bold text-green-800 dark:text-green-200 text-sm">Enter these exact values on the device:</p>
                <p className="text-[11px] text-green-700 dark:text-green-300">Menu → Communication → Cloud Server Settings</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] font-mono bg-white dark:bg-green-900 rounded p-2 border border-green-200 dark:border-green-700">
                  <span className="font-sans font-semibold not-italic text-gray-700 dark:text-gray-300">Server Mode</span>
                  <span className="font-bold text-green-700 dark:text-green-300">ADMS</span>

                  <span className="font-sans font-semibold not-italic text-gray-700 dark:text-gray-300">Enable Domain Name</span>
                  {admsMode === "domain"
                    ? <span className="font-bold text-green-700 dark:text-green-300">ON ✓</span>
                    : <span className="font-bold text-orange-600 dark:text-orange-300">OFF</span>
                  }

                  <span className="font-sans font-semibold not-italic text-gray-700 dark:text-gray-300">Server Address</span>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-blue-700 dark:text-blue-200 break-all select-all">
                      {networkLoading
                        ? <span className="text-gray-400 italic">loading…</span>
                        : admsMode === "ip"
                          ? (admsIp ?? <span className="text-amber-600 italic">resolving…</span>)
                          : admsHost
                      }
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-blue-600 dark:text-blue-300 text-[10px] underline"
                      onClick={() => { navigator.clipboard.writeText(admsAddr); toast({ title: "Address copied!" }); }}
                    >copy</button>
                  </div>

                  <span className="font-sans font-semibold not-italic text-gray-700 dark:text-gray-300">Server Port</span>
                  <span className="font-bold text-blue-700 dark:text-blue-200">{admsPort}</span>

                  <span className="font-sans font-semibold not-italic text-gray-700 dark:text-gray-300">Enable Proxy Server</span>
                  <span className="font-bold text-red-600 dark:text-red-400">OFF 🚫</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground shrink-0">Full URL:</span>
                <code className="bg-white dark:bg-blue-900 border border-blue-200 dark:border-blue-700 px-2 py-0.5 rounded break-all select-all flex-1 text-[10px]">{admsUrl}</code>
                <button
                  type="button"
                  className="shrink-0 text-blue-600 dark:text-blue-300 underline hover:no-underline"
                  onClick={() => { navigator.clipboard.writeText(admsUrl); toast({ title: "Copied to clipboard" }); }}
                >Copy</button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Biometric Devices</CardTitle>
                <CardDescription>Manage and check status of linked biometric machines</CardDescription>
              </div>
              <Button size="sm" onClick={() => setDeviceDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Machine
              </Button>
            </CardHeader>
            <CardContent>
              {(() => {
                const unauth = devices.filter(
                  (d: any) => !d.pushToken && !d.allowedIpCidr,
                );
                if (unauth.length === 0) return null;
                return (
                  <div
                    className="mb-4 flex items-start gap-3 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
                    data-testid="banner-devices-missing-auth"
                  >
                    <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-medium">
                        {unauth.length === 1
                          ? "1 device has no anti-spoofing setup"
                          : `${unauth.length} devices have no anti-spoofing setup`}
                        : {unauth.map((d: any) => d.name).join(", ")}
                      </p>
                      <p className="text-xs">
                        These devices have no push token and no pinned source
                        IP/CIDR, so their pushes will start failing with 401
                        once the new check rolls out. Click the pencil icon
                        next to each device to set a push token (shared
                        secret) or a pinned source IP/CIDR.
                      </p>
                    </div>
                  </div>
                );
              })()}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Serial Number</TableHead>
                    <TableHead>ADMS Server</TableHead>
                    <TableHead>Authentication</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Push</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No biometric machines linked.
                      </TableCell>
                    </TableRow>
                  ) : (
                    devices.map((device: any) => (
                      <TableRow key={device.id}>
                        <TableCell className="font-medium">{device.name}</TableCell>
                        <TableCell>
                          {device.code ? (
                            <Badge variant="outline" className="font-mono">{device.code}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{device.deviceSerial}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {networkInfo?.ip ?? "—"}:{admsPort}
                        </TableCell>
                        <TableCell>
                          {device.allowedIpCidr ? (
                            <Badge
                              variant="outline"
                              className="text-xs gap-1 border-green-300 text-green-800 dark:border-green-800 dark:text-green-300"
                              data-testid={`auth-status-${device.id}`}
                            >
                              <ShieldCheck className="h-3 w-3" />
                              IP-pinned ({device.allowedIpCidr})
                            </Badge>
                          ) : device.pushToken ? (
                            <Badge
                              variant="outline"
                              className="text-xs gap-1 border-green-300 text-green-800 dark:border-green-800 dark:text-green-300"
                              data-testid={`auth-status-${device.id}`}
                            >
                              <ShieldCheck className="h-3 w-3" />
                              Token set
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs gap-1 border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400"
                              data-testid={`auth-status-${device.id}`}
                              title="No pushToken or IP CIDR set — device is in open (unauthenticated) mode. Add a Push Token to secure it."
                            >
                              <ShieldAlert className="h-3 w-3" />
                              Open mode
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {device.status === "online" ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              <Signal className="h-3 w-3 mr-1" />
                              online
                            </Badge>
                          ) : (
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="secondary" className="cursor-help">
                                    <SignalLow className="h-3 w-3 mr-1" />
                                    offline
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                  {device.lastPushAt
                                    ? `No push received in ${Math.round((Date.now() - new Date(device.lastPushAt).getTime()) / 60000)}m. Possible causes: device or network is down; ADMS server restarted and port 8181 wasn't free (check VPS logs). Device will reconnect automatically once it can reach ${device.admsServerUrl || "the server"}.`
                                    : `This device has never pushed data. On the device set: Server Mode = ADMS, Server Address = ${(device.admsServerUrl || "").split(":")[0] || "VPS IP"}, Port = 8181. Make sure the serial number matches ${device.deviceSerial}.`
                                  }
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(() => {
                            const ts = device.lastPushAt || device.lastSync;
                            if (!ts) return <span className="text-amber-600 dark:text-amber-400 font-medium">Never connected</span>;
                            const date = new Date(ts);
                            const minsAgo = Math.round((Date.now() - date.getTime()) / 60000);
                            const agoLabel = minsAgo < 1 ? "just now" : minsAgo < 60 ? `${minsAgo}m ago` : `${Math.round(minsAgo / 60)}h ago`;
                            return (
                              <div className="space-y-0.5">
                                <span title={date.toLocaleString()}>
                                  {date.toLocaleString()}
                                  <span className="ml-1 opacity-60">({agoLabel})</span>
                                </span>
                                <div className="flex items-center gap-1 font-mono">
                                  <span className="opacity-60">stamp:</span>
                                  <span className={device.lastAttlogStamp === 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}>
                                    {device.lastAttlogStamp ?? 0}
                                  </span>
                                  {(device.lastAttlogStamp ?? 0) === 0 && (
                                    <span className="opacity-60">(full re-upload pending)</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right">
                          <TooltipProvider delayDuration={200}>
                            <div className="flex justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setUsersDialogDevice(device)}
                                    data-testid={`button-view-users-${device.id}`}
                                  >
                                    <UserCheck className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View enrolled users</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => syncUsersMutation.mutate(device.id)}
                                    disabled={syncUsersMutation.isPending}
                                    data-testid={`button-sync-users-${device.id}`}
                                  >
                                    <RefreshCw className={`h-4 w-4 ${syncUsersMutation.isPending ? "animate-spin" : ""}`} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Sync users from device</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="text-amber-600 hover:text-amber-700"
                                    onClick={() => resetStampMutation.mutate(device.id)}
                                    disabled={resetStampMutation.isPending}
                                    data-testid={`button-reset-stamp-${device.id}`}
                                  >
                                    <RotateCcw className={`h-4 w-4 ${resetStampMutation.isPending ? "animate-spin" : ""}`} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Force full re-upload (reset stamp to 0)</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditDialog(device)}
                                    data-testid={`button-edit-device-${device.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit device</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => setDeviceToDelete(device)}
                                    data-testid={`button-delete-device-${device.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete device</TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ADMS Device Communication Log — super_admin only */}
        {isSuperAdmin && (
          <TabsContent value="adms-debug" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Device Communication Log
                  </CardTitle>
                  <CardDescription>
                    Key events persisted to DB — survives server restarts. Auto-refreshes every 5 s. Last 200 entries.
                    <span className="ml-2 text-purple-600 dark:text-purple-400">↑OUT=server→device</span>
                    {" · "}
                    <span className="text-green-600 dark:text-green-400">green=ATTLOG</span>
                    {" · "}
                    <span className="text-blue-600 dark:text-blue-400">blue=USER</span>
                    {" · "}
                    <span className="text-red-600 dark:text-red-400">red=error</span>
                    {" · "} Each line ends with the client IP — real device vs browser.
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
                  <div className="font-mono text-xs bg-muted rounded-md p-3 overflow-auto max-h-[500px] space-y-0.5" data-testid="adms-log-container">
                    {[...admsLog].reverse().map((entry, i) => {
                      const isOut = entry.direction === "OUT";
                      const isAttlog = entry.line.includes("ATTLOG");
                      const isUserinfo = entry.line.includes("USERINFO") || entry.line.includes("USER");
                      const isError = entry.line.includes("reject") || entry.line.includes("ERROR") || entry.line.includes("auth");
                      const color = isError
                        ? "text-red-600 dark:text-red-400"
                        : isOut
                          ? "text-purple-600 dark:text-purple-400"
                          : isAttlog
                            ? "text-green-600 dark:text-green-400"
                            : isUserinfo
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-foreground/70";
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

      {/* Existing Dialogs */}
      <Dialog open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Push Biometric Punch Data</DialogTitle>
            <DialogDescription>
              Paste JSON data from your biometric device. Each punch needs: deviceEmployeeId, punchTime (HH:MM), punchDate (YYYY-MM-DD).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isSuperAdmin && (
              <div>
                <Label>Company</Label>
                <Select value={syncCompanyId} onValueChange={setSyncCompanyId}>
                  <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Punch Data (JSON)</Label>
              <Textarea
                value={pushData}
                onChange={e => setPushData(e.target.value)}
                placeholder={`[\n  { "deviceEmployeeId": "1001", "punchTime": "09:05", "punchDate": "2026-02-14", "punchType": "in" },\n  { "deviceEmployeeId": "1001", "punchTime": "18:10", "punchDate": "2026-02-14", "punchType": "out" }\n]`}
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePushData} disabled={pushMutation.isPending}>
              {pushMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Device Dialog */}
      <Dialog open={deviceDialogOpen} onOpenChange={setDeviceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Biometric Machine</DialogTitle>
            <DialogDescription>
              Link a new biometric device to this company for status monitoring.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isSuperAdmin && (
              <div>
                <Label>Company <span className="text-red-500">*</span></Label>
                <Select value={deviceCompanyId} onValueChange={setDeviceCompanyId}>
                  <SelectTrigger data-testid="select-device-company">
                    <SelectValue placeholder="Select company for this device" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  All punch data from this device will be stored under this company.
                </p>
              </div>
            )}
            <div>
              <Label>Machine Name</Label>
              <Input
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                placeholder="Front Gate Machine"
                data-testid="input-device-name"
              />
            </div>
            <div>
              <Label>Machine Code (optional)</Label>
              <Input
                value={deviceCode}
                onChange={e => setDeviceCode(e.target.value)}
                placeholder="M1, GATE-A, etc."
                data-testid="input-device-code"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Short ID used when assigning employees to this machine.
              </p>
            </div>
            <div>
              <Label>Device Serial / ID</Label>
              <Input
                value={deviceSerial}
                onChange={e => setDeviceSerial(e.target.value)}
                placeholder="SN12345678"
                data-testid="input-device-serial"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>IP Address</Label>
                <Input 
                  value={deviceIp} 
                  onChange={e => setDeviceIp(e.target.value)} 
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <Label>Port</Label>
                <Input 
                  value={devicePort} 
                  onChange={e => setDevicePort(e.target.value)} 
                />
              </div>
            </div>
            <div className="border-t pt-3 space-y-3">
              <div className="rounded bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 p-2 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                <p className="font-semibold">Security — fill at least one of the two fields below</p>
                <p>This prevents fake attendance punches from unknown sources. The easiest option is to click <strong>Auto-detect</strong> to fill your internet IP automatically, or click <strong>Generate</strong> to create a token.</p>
              </div>

              {/* Option 1: Source IP */}
              <div>
                <Label className="flex items-center gap-1">
                  Your Internet IP
                  <span className="text-xs text-muted-foreground font-normal ml-1">(the public IP of your office internet connection)</span>
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={deviceAllowedCidr}
                    onChange={e => setDeviceAllowedCidr(e.target.value)}
                    placeholder="Will be filled automatically — click Auto-detect"
                    data-testid="input-add-device-cidr"
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={detectingIp}
                    onClick={() => autoDetectSourceIp(setDeviceAllowedCidr)}
                    data-testid="button-add-detect-ip"
                    title="Detect your current public IP automatically"
                  >
                    {detectingIp ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Signal className="h-4 w-4" />}
                    <span className="ml-1">Auto-detect</span>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  This is your router's public internet IP — <strong>not</strong> the device's local IP (192.168.x.x). Click Auto-detect to fill it automatically.
                </p>
              </div>

              {/* Option 2: Push Token */}
              <div>
                <Label>
                  Push Token
                  <span className="text-xs text-muted-foreground font-normal ml-1">(a secret password the device sends with every punch)</span>
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={devicePushToken}
                    onChange={e => setDevicePushToken(e.target.value)}
                    placeholder="At least 12 characters"
                    data-testid="input-add-device-token"
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => generateToken(setDevicePushToken)}
                    data-testid="button-add-generate-token"
                    title="Generate a strong random token"
                  >
                    <KeyRound className="h-4 w-4 mr-1" />
                    Generate
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDevice} disabled={deviceMutation.isPending}>
              {deviceMutation.isPending ? "Adding..." : "Add Machine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Device */}
      <Dialog
        open={!!editDevice}
        onOpenChange={(open) => { if (!open) setEditDevice(null); }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Device</DialogTitle>
            <DialogDescription>
              Update the device details. To rotate a leaked push token,
              click Generate and save the new token to the device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {isSuperAdmin && (
              <div>
                <Label>Company <span className="text-red-500">*</span></Label>
                <Select value={editCompanyId} onValueChange={setEditCompanyId}>
                  <SelectTrigger data-testid="select-edit-device-company">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Machine Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                data-testid="input-edit-device-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Machine Code (optional)</Label>
                <Input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  placeholder="M1, GATE-A…"
                  data-testid="input-edit-device-code"
                />
              </div>
              <div>
                <Label>Serial Number</Label>
                <Input
                  value={editSerial}
                  onChange={(e) => setEditSerial(e.target.value)}
                  data-testid="input-edit-device-serial"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>IP Address</Label>
                <Input
                  value={editIp}
                  onChange={(e) => setEditIp(e.target.value)}
                  data-testid="input-edit-device-ip"
                />
              </div>
              <div>
                <Label>Port</Label>
                <Input
                  value={editPort}
                  onChange={(e) => setEditPort(e.target.value)}
                  data-testid="input-edit-device-port"
                />
              </div>
            </div>
            <div className="rounded-md border p-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Security — set at least one to prevent fake punches</p>
              <div>
                <Label>
                  Your Internet IP
                  <span className="text-xs text-muted-foreground font-normal ml-1">(public IP of your office connection)</span>
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={editAllowedCidr}
                    onChange={(e) => setEditAllowedCidr(e.target.value)}
                    placeholder="Click Auto-detect to fill automatically"
                    className="font-mono text-xs"
                    data-testid="input-edit-device-cidr"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={detectingIp}
                    onClick={() => autoDetectSourceIp(setEditAllowedCidr)}
                    title="Detect your current public IP automatically"
                  >
                    {detectingIp ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Signal className="h-4 w-4" />}
                    <span className="ml-1">Auto-detect</span>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  This is your router's internet-facing IP — not the device's local 192.168.x.x address.
                </p>
              </div>
              <div>
                <Label>
                  Push Token
                  <span className="text-xs text-muted-foreground font-normal ml-1">(secret password the device sends with every punch)</span>
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={editPushToken}
                    onChange={(e) => setEditPushToken(e.target.value)}
                    placeholder="At least 12 characters"
                    className="font-mono text-xs"
                    data-testid="input-edit-device-token"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => generateToken(setEditPushToken)}
                    data-testid="button-edit-generate-token"
                    title="Generate a strong random token"
                  >
                    <KeyRound className="h-4 w-4 mr-1" />
                    Generate
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDevice(null)}>Cancel</Button>
            <Button
              onClick={handleSaveEdit}
              disabled={editDeviceMutation.isPending}
              data-testid="button-save-edit-device"
            >
              {editDeviceMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Users on this machine */}
      <Dialog
        open={!!usersDialogDevice}
        onOpenChange={(open) => { if (!open) setUsersDialogDevice(null); }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Users on {usersDialogDevice?.name}
              {usersDialogDevice?.code ? (
                <Badge variant="outline" className="ml-2 font-mono">{usersDialogDevice.code}</Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              Employees who have punched on this machine, derived from stored
              punch logs. The Device ID is the PIN the machine uses for that
              employee — assign it on the Employees page to map punches.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {usersLoading ? (
              <div className="p-6 text-center text-muted-foreground">Loading users...</div>
            ) : !deviceUsers || deviceUsers.users?.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                No users enrolled on this machine yet. Users appear here once
                the device pushes its enrollment list or someone punches.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device ID</TableHead>
                    <TableHead>Name on Device</TableHead>
                    <TableHead>HR Employee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Punches</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deviceUsers.users.map((u: any) => (
                    <TableRow key={u.deviceEmployeeId}>
                      <TableCell className="font-mono text-xs">{u.deviceEmployeeId}</TableCell>
                      <TableCell className="text-sm">
                        {u.deviceName || <span className="text-muted-foreground">—</span>}
                        {u.privilege && u.privilege !== "0" ? (
                          <Badge variant="outline" className="ml-2 text-[10px]">Admin</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {u.matched ? (
                          <span>
                            {u.firstName} {u.lastName}
                            {u.hrEmployeeCode ? (
                              <span className="ml-1 text-xs text-muted-foreground">({u.hrEmployeeCode})</span>
                            ) : null}
                          </span>
                        ) : (
                          <Badge variant="secondary">Unmapped</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {u.enrolled ? (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-600">Enrolled</Badge>
                        ) : (
                          <Badge variant="outline">Punch only</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{u.punchCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.lastSeenAt || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          data-testid={`button-map-pin-${u.deviceEmployeeId}`}
                          size="sm"
                          variant={u.matched ? "outline" : "default"}
                          className="text-xs h-7 px-2"
                          onClick={() => {
                            setMapPinRow({ devicePin: u.deviceEmployeeId, deviceName: u.deviceName || u.deviceEmployeeId });
                            setMapSelectedEmployee(u.employeeId || "");
                          }}
                        >
                          {u.matched ? "Remap" : "Map"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsersDialogDevice(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Map Device PIN → HR Employee dialog */}
      <Dialog open={!!mapPinRow} onOpenChange={(open) => { if (!open) { setMapPinRow(null); setMapSelectedEmployee(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Map Device PIN to Employee</DialogTitle>
            <DialogDescription>
              Select the HR employee for device PIN <strong className="font-mono">{mapPinRow?.devicePin}</strong>
              {mapPinRow?.deviceName ? ` (${mapPinRow.deviceName})` : ""}. Existing punch records for this PIN will be retroactively linked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Select
              value={mapSelectedEmployee}
              onValueChange={setMapSelectedEmployee}
            >
              <SelectTrigger data-testid="select-map-employee" className="w-full">
                <SelectValue placeholder="Select an HR employee..." />
              </SelectTrigger>
              <SelectContent>
                {(employees as any[])
                  .filter((e: any) => !e.biometricDeviceId || e.biometricDeviceId === mapPinRow?.devicePin)
                  .map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName} — {e.employeeCode}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMapPinRow(null); setMapSelectedEmployee(""); }}>Cancel</Button>
            <Button
              data-testid="button-confirm-map-pin"
              disabled={!mapSelectedEmployee || mapPinMutation.isPending}
              onClick={() => {
                if (mapPinRow && mapSelectedEmployee) {
                  mapPinMutation.mutate({
                    employeeId: mapSelectedEmployee,
                    devicePin: mapPinRow.devicePin,
                    deviceId: usersDialogDevice?.id,
                  });
                }
              }}
            >
              {mapPinMutation.isPending ? "Mapping..." : "Confirm Map"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deviceToDelete} onOpenChange={(open) => { if (!open) setDeviceToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete biometric device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deviceToDelete?.name || "this device"}</strong>
              {deviceToDelete?.code ? ` (${deviceToDelete.code})` : ""}. Punches from this machine
              will stop being accepted until it's re-added.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-device">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-confirm-delete-device"
              onClick={() => {
                if (deviceToDelete) {
                  deleteDeviceMutation.mutate(deviceToDelete.id);
                  setDeviceToDelete(null);
                }
              }}
            >
              Delete device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Import from Device File Dialog ── */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) setImportFile(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5 text-blue-600" />
              Import from Device File (USB Export)
            </DialogTitle>
            <DialogDescription>
              Upload a file exported from the ZKTeco device via USB to recover historical data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type selector */}
            <div>
              <Label className="mb-1 block">What to import</Label>
              <Select value={importType} onValueChange={(v) => { setImportType(v as any); setImportFile(null); }}>
                <SelectTrigger data-testid="select-import-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attlog">Attendance Records (attlog.dat)</SelectItem>
                  <SelectItem value="userinfo">Enrolled Users (user.dat / userinfo.dat)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Instructions */}
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">
                How to export from ZKTeco x2008 via USB:
              </p>
              {importType === "attlog" ? (
                <ol className="ml-4 list-decimal space-y-0.5">
                  <li>Plug a USB drive into the device</li>
                  <li>Press <strong>Menu → USB Manager → Download → Attendance Log</strong></li>
                  <li>Wait for "Download Successful", remove USB</li>
                  <li>Find <code>attlog.dat</code> on the USB and upload it here</li>
                </ol>
              ) : (
                <ol className="ml-4 list-decimal space-y-0.5">
                  <li>Plug a USB drive into the device</li>
                  <li>Press <strong>Menu → USB Manager → Download → User Data</strong></li>
                  <li>Wait for "Download Successful", remove USB</li>
                  <li>Find <code>user.dat</code> or <code>userinfo.dat</code> on the USB and upload it here</li>
                </ol>
              )}
            </div>

            {/* File picker */}
            <div>
              <Label htmlFor="import-file-input" className="mb-1 block">
                {importType === "attlog" ? "Attendance File (.dat / .txt)" : "User Data File (.dat / .txt)"}
              </Label>
              <Input
                id="import-file-input"
                type="file"
                accept=".dat,.txt,.csv,.log"
                data-testid="input-import-file"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
            </div>

            {/* Device selector (only if multiple devices) */}
            {devices && devices.length > 1 && (
              <div>
                <Label className="mb-1 block">Device (optional)</Label>
                <Select value={importDeviceId} onValueChange={setImportDeviceId}>
                  <SelectTrigger data-testid="select-import-device">
                    <SelectValue placeholder="Auto-detect (first device)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Auto-detect</SelectItem>
                    {devices.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>{d.name} ({d.serialNumber})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {importFile && (
              <p className="text-xs text-muted-foreground">
                Selected: <strong>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)} disabled={importFileMutation.isPending}>
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-import-file"
              disabled={!importFile || importFileMutation.isPending}
              onClick={() => {
                if (importFile) {
                  importFileMutation.mutate({ file: importFile, deviceId: importDeviceId, type: importType });
                }
              }}
            >
              <FileUp className="h-4 w-4 mr-2" />
              {importFileMutation.isPending ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
