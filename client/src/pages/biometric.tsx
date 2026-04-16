import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Fingerprint, Upload, RefreshCw, AlertTriangle, CheckCircle, 
  Clock, XCircle, Settings, Plus, Trash2, Signal, SignalLow, Download 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { BiometricPunchLog, Company, Employee, BiometricDevice } from "@shared/schema";

export default function BiometricPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [selectedCompany, setSelectedCompany] = useState<string>(isSuperAdmin ? "__all__" : (user?.companyId || ""));
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [pushData, setPushData] = useState("");
  const [syncDate, setSyncDate] = useState(new Date().toISOString().split("T")[0]);
  const [syncCompanyId, setSyncCompanyId] = useState("");
  
  // Device Form State
  const [deviceName, setDeviceName] = useState("");
  const [deviceSerial, setDeviceSerial] = useState("");
  const [deviceIp, setDeviceIp] = useState("");
  const [devicePort, setDevicePort] = useState("4370");

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

  const syncMutation = useMutation({
    mutationFn: async (data: { companyId: string; date: string }) => {
      const res = await apiRequest("POST", "/api/biometric/sync", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      toast({
        title: "Sync Complete",
        description: `Synced: ${data.results.synced}, Missing Punches: ${data.results.missingPunches}, Skipped: ${data.results.skipped}`,
      });
      setSyncDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to sync biometric data", variant: "destructive" });
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
      setDeviceSerial("");
      setDeviceIp("");
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/biometric/devices/${id}/test`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      if (data.success) {
        toast({
          title: "Connection Successful",
          description: "The biometric device is online and reachable.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Connection Failed",
          description: (
            <div className="space-y-2">
              <p>{data.message}</p>
              {data.technical && (
                <p className="text-xs opacity-70 font-mono">Error: {data.technical}</p>
              )}
            </div>
          ),
        });
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to test connection",
      });
    },
  });

  const fetchLogsMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/biometric/devices/${id}/fetch`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/biometric/logs"] });
      
      if (data.results.inserted === 0 && data.results.duplicates === 0) {
        toast({ 
          title: "No Data Found", 
          description: data.message || "No new punch logs were found on the machine. Ensure employees have 'Biometric Device ID' set in their profiles.",
          variant: "default"
        });
      } else {
        toast({ 
          title: "Success", 
          description: `Imported ${data.results.inserted} new logs from machine. ${data.results.duplicates} duplicates skipped.` 
        });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to fetch logs", variant: "destructive" });
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

  const handleSync = () => {
    const companyId = isSuperAdmin ? syncCompanyId : (user?.companyId || "");
    if (!companyId || !syncDate) {
      toast({ title: "Error", description: "Please select company and date", variant: "destructive" });
      return;
    }
    syncMutation.mutate({ companyId, date: syncDate });
  };

  const handleAddDevice = () => {
    const companyId = isSuperAdmin ? syncCompanyId : (user?.companyId || "");
    if (!companyId || !deviceName || !deviceSerial) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    deviceMutation.mutate({
      companyId,
      name: deviceName,
      deviceSerial,
      ipAddress: deviceIp,
      port: parseInt(devicePort)
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
            Manage biometric device data, sync punch logs to attendance
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPushDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Push Punch Data
          </Button>
          <Button onClick={() => { setSyncDate(selectedDate); setSyncCompanyId(effectiveCompanyId); setSyncDialogOpen(true); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync to Attendance
          </Button>
        </div>
      </div>

      <Tabs defaultValue="logs" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Punch Logs
          </TabsTrigger>
          <TabsTrigger value="devices" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Device Management
          </TabsTrigger>
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
                <div className="w-44">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
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
                <p className="text-center py-8 text-muted-foreground">No punch logs found for selected filters.</p>
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

        <TabsContent value="devices" className="mt-4">
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine Name</TableHead>
                    <TableHead>Serial Number</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Sync</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No biometric machines linked.
                      </TableCell>
                    </TableRow>
                  ) : (
                    devices.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell className="font-medium">{device.name}</TableCell>
                        <TableCell>{device.deviceSerial}</TableCell>
                        <TableCell>{device.ipAddress || "-"}:{device.port}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={device.status === "online" ? "default" : "secondary"}
                            className={device.status === "online" ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}
                          >
                            {device.status === "online" ? (
                              <Signal className="h-3 w-3 mr-1" />
                            ) : (
                              <SignalLow className="h-3 w-3 mr-1" />
                            )}
                            {device.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {device.lastSync ? new Date(device.lastSync).toLocaleString() : "Never"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => fetchLogsMutation.mutate(device.id)}
                              disabled={fetchLogsMutation.isPending || device.status !== "online"}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Fetch Logs
                            </Button>
                            <Button 
                              variant="secondary" 
                              size="sm"
                              onClick={() => testConnectionMutation.mutate(device.id)}
                              disabled={testConnectionMutation.isPending}
                            >
                              Test Connection
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="text-red-600"
                              onClick={() => deleteDeviceMutation.mutate(device.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
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

      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync to Attendance</DialogTitle>
            <DialogDescription>
              Process biometric punch logs and update attendance records. Uses First In, Last Out logic. Single punches will be flagged as missing.
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
              <Label>Date</Label>
              <Input type="date" value={syncDate} onChange={e => setSyncDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSync} disabled={syncMutation.isPending}>
              {syncMutation.isPending ? "Syncing..." : "Sync Now"}
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
              <Label>Machine Name</Label>
              <Input 
                value={deviceName} 
                onChange={e => setDeviceName(e.target.value)} 
                placeholder="Front Gate Machine"
              />
            </div>
            <div>
              <Label>Device Serial / ID</Label>
              <Input 
                value={deviceSerial} 
                onChange={e => setDeviceSerial(e.target.value)} 
                placeholder="SN12345678"
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDevice} disabled={deviceMutation.isPending}>
              {deviceMutation.isPending ? "Adding..." : "Add Machine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
