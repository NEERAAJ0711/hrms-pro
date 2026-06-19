import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Settings, Building2, Calendar, CalendarDays, Clock, Bell, Shield, Save, Users, Briefcase, MapPin, DollarSign, Percent, Plus, Pencil, Trash2, FileText, LocateFixed, Loader2, Smartphone, Upload, CheckCircle2, AlertTriangle, KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/hooks/use-can";
import type { Company, Setting, MasterDepartment, MasterDesignation, MasterLocation, EarningHead, DeductionHead, StatutorySettings, TimeOfficePolicy, Holiday, WageGrade, ContractorMaster, LeavePolicy } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";

const DAYS_OF_WEEK = [
  { value: "auto", label: "Auto" },
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
];

export function TimeOfficePolicyTab({ companyId, selectedCompany }: { companyId: string | undefined; selectedCompany: string }) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<TimeOfficePolicy | null>(null);

  const defaultForm = {
    policyName: "",
    companyId: companyId || "",
    weeklyOff1: "sunday",
    weeklyOff2: "saturday",
    dutyStartTime: "09:00",
    dutyEndTime: "18:00",
    allowAutoAttend: false,
    otAllowed: false,
    presentMarkingDuration: 480,
    permissibleLateArrival: 15,
    permissibleEarlyGoing: 15,
    halfDayMinHours: 4,
    fullDayMinHours: 8,
    isDefault: false,
    status: "active",
  };

  const [formData, setFormData] = useState(defaultForm);

  useEffect(() => {
    setFormData(prev => ({ ...prev, companyId: companyId || "" }));
  }, [companyId]);

  const { data: policies = [], isLoading } = useQuery<TimeOfficePolicy[]>({
    queryKey: [`/api/time-office-policies?companyId=${companyId}`],
    queryFn: async () => {
      const params = companyId ? `?companyId=${companyId}` : "";
      const res = await fetch(`/api/time-office-policies${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: selectedCompany !== "__global__",
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/time-office-policies", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/time-office-policies?companyId=${companyId}`] });
      setIsDialogOpen(false);
      toast({ title: "Policy Created", description: "Time office policy has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: typeof formData & { id: string }) => {
      return apiRequest("PATCH", `/api/time-office-policies/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/time-office-policies?companyId=${companyId}`] });
      setIsDialogOpen(false);
      setEditingPolicy(null);
      toast({ title: "Policy Updated", description: "Time office policy has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/time-office-policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/time-office-policies?companyId=${companyId}`] });
      toast({ title: "Policy Deleted", description: "Time office policy has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openDialog = (policy?: TimeOfficePolicy) => {
    if (policy) {
      setEditingPolicy(policy);
      setFormData({
        policyName: policy.policyName,
        companyId: policy.companyId,
        weeklyOff1: policy.weeklyOff1,
        weeklyOff2: policy.weeklyOff2 || "",
        dutyStartTime: policy.dutyStartTime,
        dutyEndTime: policy.dutyEndTime,
        allowAutoAttend: policy.allowAutoAttend ?? false,
        otAllowed: policy.otAllowed ?? false,
        presentMarkingDuration: policy.presentMarkingDuration ?? 480,
        permissibleLateArrival: policy.permissibleLateArrival ?? 15,
        permissibleEarlyGoing: policy.permissibleEarlyGoing ?? 15,
        halfDayMinHours: policy.halfDayMinHours ?? 4,
        fullDayMinHours: policy.fullDayMinHours ?? 8,
        isDefault: policy.isDefault ?? false,
        status: policy.status,
      });
    } else {
      setEditingPolicy(null);
      setFormData({ ...defaultForm, companyId: companyId || "" });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.policyName.trim()) {
      toast({ title: "Error", description: "Policy name is required.", variant: "destructive" });
      return;
    }
    if (!formData.companyId) {
      toast({ title: "Error", description: "Please select a company first.", variant: "destructive" });
      return;
    }
    if (editingPolicy) {
      updateMutation.mutate({ ...formData, id: editingPolicy.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (!companyId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Select a Company</h3>
          <p className="text-muted-foreground">Please select a company to configure time office policies.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Time Office Policies
              </CardTitle>
              <CardDescription>Configure weekly offs, duty timings, and attendance rules</CardDescription>
            </div>
            <Button onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Policy
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : policies.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Policies Yet</h3>
              <p className="text-muted-foreground mb-4">Create a time office policy to define working hours and attendance rules.</p>
              <Button onClick={() => openDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Policy
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy Name</TableHead>
                  <TableHead>Weekly Off</TableHead>
                  <TableHead>Duty Timing</TableHead>
                  <TableHead>Auto Attend</TableHead>
                  <TableHead>OT Allowed</TableHead>
                  <TableHead>Late/Early Grace</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell className="font-medium">{policy.policyName}</TableCell>
                    <TableCell>
                      <span className="capitalize">{policy.weeklyOff1}</span>
                      {policy.weeklyOff2 && <span className="capitalize">, {policy.weeklyOff2}</span>}
                    </TableCell>
                    <TableCell>{policy.dutyStartTime} - {policy.dutyEndTime}</TableCell>
                    <TableCell>
                      <Badge className={policy.allowAutoAttend ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                        {policy.allowAutoAttend ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={policy.otAllowed ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                        {policy.otAllowed ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>{policy.permissibleLateArrival}m / {policy.permissibleEarlyGoing}m</TableCell>
                    <TableCell>
                      {policy.isDefault && <Badge className="bg-blue-100 text-blue-800">Default</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge className={policy.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                        {policy.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => openDialog(policy)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => {
                            if (confirm("Delete this time office policy?")) {
                              deleteMutation.mutate(policy.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingPolicy(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPolicy ? "Edit Time Office Policy" : "Create Time Office Policy"}</DialogTitle>
            <DialogDescription>Configure working hours, weekly offs, and attendance rules</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Policy Name</Label>
              <Input
                value={formData.policyName}
                onChange={(e) => setFormData({ ...formData, policyName: e.target.value })}
                placeholder="e.g. General Shift, Night Shift"
              />
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-3">Weekly Off Days</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Weekly Off</Label>
                  <Select value={formData.weeklyOff1} onValueChange={(v) => setFormData({ ...formData, weeklyOff1: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Second Weekly Off (optional)</Label>
                  <Select value={formData.weeklyOff2 || "__none__"} onValueChange={(v) => setFormData({ ...formData, weeklyOff2: v === "__none__" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-3">Duty Timing</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={formData.dutyStartTime}
                    onChange={(e) => setFormData({ ...formData, dutyStartTime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={formData.dutyEndTime}
                    onChange={(e) => setFormData({ ...formData, dutyEndTime: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-3">Attendance Rules</h4>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Allow Auto Attendance</Label>
                    <p className="text-xs text-muted-foreground">Automatically mark attendance based on system login</p>
                  </div>
                  <Switch
                    checked={formData.allowAutoAttend}
                    onCheckedChange={(v) => setFormData({ ...formData, allowAutoAttend: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>OT Allowed</Label>
                    <p className="text-xs text-muted-foreground">Allow overtime hours tracking for employees under this policy</p>
                  </div>
                  <Switch
                    checked={formData.otAllowed}
                    onCheckedChange={(v) => setFormData({ ...formData, otAllowed: v })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Present Marking Duration (minutes)</Label>
                    <Input
                      type="number"
                      value={formData.presentMarkingDuration}
                      onChange={(e) => setFormData({ ...formData, presentMarkingDuration: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground">Minimum minutes to mark as present (e.g. 480 = 8 hrs)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Permissible Late Arrival (minutes)</Label>
                    <Input
                      type="number"
                      value={formData.permissibleLateArrival}
                      onChange={(e) => setFormData({ ...formData, permissibleLateArrival: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground">Grace period for late clock-in</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Permissible Early Going (minutes)</Label>
                    <Input
                      type="number"
                      value={formData.permissibleEarlyGoing}
                      onChange={(e) => setFormData({ ...formData, permissibleEarlyGoing: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground">Grace period for early clock-out</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Half Day Minimum Hours</Label>
                    <Input
                      type="number"
                      value={formData.halfDayMinHours}
                      onChange={(e) => setFormData({ ...formData, halfDayMinHours: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Day Minimum Hours</Label>
                    <Input
                      type="number"
                      value={formData.fullDayMinHours}
                      onChange={(e) => setFormData({ ...formData, fullDayMinHours: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={formData.isDefault}
                  onCheckedChange={(v) => setFormData({ ...formData, isDefault: v })}
                />
                <Label>Set as Default Policy</Label>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : (editingPolicy ? "Update Policy" : "Create Policy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

