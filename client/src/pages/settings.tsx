import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Settings, Building2, Calendar, CalendarDays, Clock, Bell, Shield, Globe, Save, Users, Briefcase, MapPin, DollarSign, Percent, Plus, Pencil, Trash2, FileText, LocateFixed, Loader2 } from "lucide-react";
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
import type { Company, Setting, MasterDepartment, MasterDesignation, MasterLocation, EarningHead, DeductionHead, StatutorySettings, TimeOfficePolicy, Holiday } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";

interface SettingFormData {
  workingHoursStart: string;
  workingHoursEnd: string;
  weekStartDay: string;
  dateFormat: string;
  timeFormat: string;
  timezone: string;
  currency: string;
  fiscalYearStart: string;
  enableEmailNotifications: boolean;
  enableLeaveApprovalNotifications: boolean;
  enablePayrollNotifications: boolean;
  enableAttendanceReminders: boolean;
  passwordMinLength: string;
  sessionTimeout: string;
  twoFactorEnabled: boolean;
  ipRestriction: boolean;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedCompany, setSelectedCompany] = useState<string>(
    user?.role === "super_admin" ? "__global__" : (user?.companyId || "__global__")
  );
  const [activeTab, setActiveTab] = useState("general");
  
  const [formData, setFormData] = useState<SettingFormData>({
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    weekStartDay: "monday",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "24h",
    timezone: "Asia/Kolkata",
    currency: "INR",
    fiscalYearStart: "04",
    enableEmailNotifications: true,
    enableLeaveApprovalNotifications: true,
    enablePayrollNotifications: true,
    enableAttendanceReminders: false,
    passwordMinLength: "8",
    sessionTimeout: "30",
    twoFactorEnabled: false,
    ipRestriction: false,
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: settings = [] } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
  });

  const companyIdForQueries = user?.role === "super_admin" 
    ? (selectedCompany === "__global__" ? undefined : selectedCompany)
    : (user?.companyId ?? undefined);

  const saveMutation = useMutation({
    mutationFn: async (data: SettingFormData) => {
      // Use companyIdForQueries to ensure proper company context
      // For non-super_admin users, this will be their companyId
      // For super_admin, this will be the selected company or undefined for global
      const settingsToSave = Object.entries(data).map(([key, value]) => ({
        companyId: companyIdForQueries || null,
        key,
        value: String(value),
        category: getCategoryForKey(key),
      }));
      
      for (const setting of settingsToSave) {
        await apiRequest("POST", "/api/settings", setting);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings Saved",
        description: "Your settings have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getCategoryForKey = (key: string): string => {
    if (key.startsWith("working") || key.includes("Week") || key.includes("fiscal")) return "general";
    if (key.includes("Format") || key.includes("timezone") || key.includes("currency")) return "localization";
    if (key.includes("Notification") || key.includes("Reminder")) return "notifications";
    if (key.includes("password") || key.includes("session") || key.includes("Factor") || key.includes("Restriction")) return "security";
    return "general";
  };

  const handleInputChange = (key: keyof SettingFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="p-6" data-testid="settings-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure system preferences and company settings</p>
        </div>
        <div className="flex items-center gap-4">
          {user?.role === "super_admin" && (
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger className="w-48" data-testid="select-settings-company">
                <SelectValue placeholder="Global Settings" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">Global Settings</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>{company.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(activeTab === "general" || activeTab === "localization" || activeTab === "notifications" || activeTab === "security") && (
            <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending} data-testid="button-save-settings">
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="general" data-testid="tab-general">
            <Building2 className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="localization" data-testid="tab-localization">
            <Globe className="h-4 w-4 mr-2" />
            Localization
          </TabsTrigger>
          <TabsTrigger value="masters" data-testid="tab-masters">
            <Briefcase className="h-4 w-4 mr-2" />
            Masters
          </TabsTrigger>
          <TabsTrigger value="statutory" data-testid="tab-statutory">
            <Percent className="h-4 w-4 mr-2" />
            Statutory
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <Shield className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="holidays" data-testid="tab-holidays">
            <CalendarDays className="h-4 w-4 mr-2" />
            Holidays
          </TabsTrigger>
          <TabsTrigger value="timeoffice" data-testid="tab-timeoffice">
            <Calendar className="h-4 w-4 mr-2" />
            Time Office
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSettings formData={formData} handleInputChange={handleInputChange} />
        </TabsContent>

        <TabsContent value="localization">
          <LocalizationSettings formData={formData} handleInputChange={handleInputChange} />
        </TabsContent>

        <TabsContent value="masters">
          <MastersSettings companyId={companyIdForQueries} selectedCompany={selectedCompany} userRole={user?.role} />
        </TabsContent>

        <TabsContent value="statutory">
          <StatutorySettingsTab companyId={companyIdForQueries} selectedCompany={selectedCompany} />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettings formData={formData} handleInputChange={handleInputChange} />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings formData={formData} handleInputChange={handleInputChange} />
        </TabsContent>

        <TabsContent value="holidays">
          <HolidayCalendarTab companyId={companyIdForQueries} selectedCompany={selectedCompany} userRole={user?.role || ""} />
        </TabsContent>

        <TabsContent value="timeoffice">
          <TimeOfficePolicyTab companyId={companyIdForQueries} selectedCompany={selectedCompany} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralSettings({ formData, handleInputChange }: { formData: SettingFormData; handleInputChange: (key: keyof SettingFormData, value: string | boolean) => void }) {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Working Hours
          </CardTitle>
          <CardDescription>Configure standard working hours for the organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workingHoursStart">Start Time</Label>
              <Input
                id="workingHoursStart"
                type="time"
                value={formData.workingHoursStart}
                onChange={(e) => handleInputChange("workingHoursStart", e.target.value)}
                data-testid="input-working-start"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workingHoursEnd">End Time</Label>
              <Input
                id="workingHoursEnd"
                type="time"
                value={formData.workingHoursEnd}
                onChange={(e) => handleInputChange("workingHoursEnd", e.target.value)}
                data-testid="input-working-end"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="weekStartDay">Week Starts On</Label>
            <Select value={formData.weekStartDay} onValueChange={(v) => handleInputChange("weekStartDay", v)}>
              <SelectTrigger data-testid="select-week-start">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sunday">Sunday</SelectItem>
                <SelectItem value="monday">Monday</SelectItem>
                <SelectItem value="saturday">Saturday</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Fiscal Year
          </CardTitle>
          <CardDescription>Set the fiscal year start month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="fiscalYearStart">Fiscal Year Starts</Label>
            <Select value={formData.fiscalYearStart} onValueChange={(v) => handleInputChange("fiscalYearStart", v)}>
              <SelectTrigger data-testid="select-fiscal-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="01">January</SelectItem>
                <SelectItem value="04">April (India)</SelectItem>
                <SelectItem value="07">July</SelectItem>
                <SelectItem value="10">October</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LocalizationSettings({ formData, handleInputChange }: { formData: SettingFormData; handleInputChange: (key: keyof SettingFormData, value: string | boolean) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Localization Settings</CardTitle>
        <CardDescription>Configure date, time, and currency formats</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dateFormat">Date Format</Label>
            <Select value={formData.dateFormat} onValueChange={(v) => handleInputChange("dateFormat", v)}>
              <SelectTrigger data-testid="select-date-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timeFormat">Time Format</Label>
            <Select value={formData.timeFormat} onValueChange={(v) => handleInputChange("timeFormat", v)}>
              <SelectTrigger data-testid="select-time-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12h">12-hour</SelectItem>
                <SelectItem value="24h">24-hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={formData.timezone} onValueChange={(v) => handleInputChange("timezone", v)}>
              <SelectTrigger data-testid="select-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Kolkata">India (IST)</SelectItem>
                <SelectItem value="America/New_York">US Eastern</SelectItem>
                <SelectItem value="America/Los_Angeles">US Pacific</SelectItem>
                <SelectItem value="Europe/London">UK (GMT)</SelectItem>
                <SelectItem value="Asia/Singapore">Singapore</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select value={formData.currency} onValueChange={(v) => handleInputChange("currency", v)}>
              <SelectTrigger data-testid="select-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">Indian Rupee (INR)</SelectItem>
                <SelectItem value="USD">US Dollar (USD)</SelectItem>
                <SelectItem value="EUR">Euro (EUR)</SelectItem>
                <SelectItem value="GBP">British Pound (GBP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationSettings({ formData, handleInputChange }: { formData: SettingFormData; handleInputChange: (key: keyof SettingFormData, value: string | boolean) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>Configure email and system notifications</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Email Notifications</Label>
            <p className="text-sm text-muted-foreground">Receive important updates via email</p>
          </div>
          <Switch
            checked={formData.enableEmailNotifications}
            onCheckedChange={(v) => handleInputChange("enableEmailNotifications", v)}
            data-testid="switch-email-notifications"
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Leave Approval Notifications</Label>
            <p className="text-sm text-muted-foreground">Get notified when leave requests need approval</p>
          </div>
          <Switch
            checked={formData.enableLeaveApprovalNotifications}
            onCheckedChange={(v) => handleInputChange("enableLeaveApprovalNotifications", v)}
            data-testid="switch-leave-notifications"
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Payroll Notifications</Label>
            <p className="text-sm text-muted-foreground">Get notified about payroll processing updates</p>
          </div>
          <Switch
            checked={formData.enablePayrollNotifications}
            onCheckedChange={(v) => handleInputChange("enablePayrollNotifications", v)}
            data-testid="switch-payroll-notifications"
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Attendance Reminders</Label>
            <p className="text-sm text-muted-foreground">Send daily reminders for marking attendance</p>
          </div>
          <Switch
            checked={formData.enableAttendanceReminders}
            onCheckedChange={(v) => handleInputChange("enableAttendanceReminders", v)}
            data-testid="switch-attendance-reminders"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SecuritySettings({ formData, handleInputChange }: { formData: SettingFormData; handleInputChange: (key: keyof SettingFormData, value: string | boolean) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security Settings</CardTitle>
        <CardDescription>Configure security and access controls</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="passwordMinLength">Minimum Password Length</Label>
            <Select value={formData.passwordMinLength} onValueChange={(v) => handleInputChange("passwordMinLength", v)}>
              <SelectTrigger data-testid="select-password-length">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 characters</SelectItem>
                <SelectItem value="8">8 characters</SelectItem>
                <SelectItem value="10">10 characters</SelectItem>
                <SelectItem value="12">12 characters</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
            <Select value={formData.sessionTimeout} onValueChange={(v) => handleInputChange("sessionTimeout", v)}>
              <SelectTrigger data-testid="select-session-timeout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Two-Factor Authentication</Label>
            <p className="text-sm text-muted-foreground">Require 2FA for all users</p>
          </div>
          <Switch
            checked={formData.twoFactorEnabled}
            onCheckedChange={(v) => handleInputChange("twoFactorEnabled", v)}
            data-testid="switch-2fa"
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>IP Restriction</Label>
            <p className="text-sm text-muted-foreground">Restrict access to specific IP addresses</p>
          </div>
          <Switch
            checked={formData.ipRestriction}
            onCheckedChange={(v) => handleInputChange("ipRestriction", v)}
            data-testid="switch-ip-restriction"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MastersSettings({ companyId, selectedCompany, userRole }: { companyId: string | undefined; selectedCompany: string; userRole: string | undefined }) {
  const { toast } = useToast();
  const [masterTab, setMasterTab] = useState("departments");

  if (!companyId && userRole !== "super_admin") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Please select a company to manage master data.
        </CardContent>
      </Card>
    );
  }

  if (selectedCompany === "__global__" && userRole === "super_admin") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Please select a specific company to manage master data. Master data is company-specific.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={masterTab} onValueChange={setMasterTab}>
        <TabsList>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="designations">Designations</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="earnings">Earning Heads</TabsTrigger>
          <TabsTrigger value="deductions">Deduction Heads</TabsTrigger>
        </TabsList>

        <TabsContent value="departments">
          <DepartmentsManager companyId={companyId!} />
        </TabsContent>
        <TabsContent value="designations">
          <DesignationsManager companyId={companyId!} />
        </TabsContent>
        <TabsContent value="locations">
          <LocationsManager companyId={companyId!} />
        </TabsContent>
        <TabsContent value="earnings">
          <EarningHeadsManager companyId={companyId!} />
        </TabsContent>
        <TabsContent value="deductions">
          <DeductionHeadsManager companyId={companyId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DepartmentsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterDepartment | null>(null);
  const [formData, setFormData] = useState({ name: "", code: "", description: "" });

  const { data: departments = [], isLoading } = useQuery<MasterDepartment[]>({
    queryKey: [`/api/master-departments?companyId=${companyId}`],
    queryFn: async () => {
      const res = await fetch(`/api/master-departments${companyId ? `?companyId=${companyId}` : ''}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch departments");
      return res.json();
    },
    enabled: !!companyId,
  });

  const invalidateDepts = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/master-departments") });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master-departments", { ...data, companyId }),
    onSuccess: () => {
      invalidateDepts();
      toast({ title: "Department created successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/master-departments/${id}`, data),
    onSuccess: () => {
      invalidateDepts();
      toast({ title: "Department updated successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master-departments/${id}`),
    onSuccess: () => {
      invalidateDepts();
      toast({ title: "Department deleted successfully" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", code: "", description: "" });
    setEditingItem(null);
  };

  const handleEdit = (item: MasterDepartment) => {
    setEditingItem(item);
    setFormData({ name: item.name, code: item.code || "", description: item.description || "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Departments
            </CardTitle>
            <CardDescription>Manage company departments</CardDescription>
          </div>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-department">
            <Plus className="h-4 w-4 mr-2" />
            Add Department
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : departments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No departments configured. Click "Add Department" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((dept) => (
                <TableRow key={dept.id} data-testid={`row-department-${dept.id}`}>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell>{dept.code || "-"}</TableCell>
                  <TableCell>{dept.description || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={dept.status === "active" ? "default" : "secondary"}>{dept.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(dept)} data-testid={`button-edit-department-${dept.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(dept.id)} data-testid={`button-delete-department-${dept.id}`}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Department" : "Add Department"}</DialogTitle>
            <DialogDescription>Enter department details below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-department-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input id="code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} data-testid="input-department-code" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} data-testid="input-department-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-department">
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DesignationsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterDesignation | null>(null);
  const [formData, setFormData] = useState({ name: "", code: "", level: 1, description: "" });

  const { data: designations = [], isLoading } = useQuery<MasterDesignation[]>({
    queryKey: [`/api/master-designations?companyId=${companyId}`],
    queryFn: async () => {
      const res = await fetch(`/api/master-designations${companyId ? `?companyId=${companyId}` : ''}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch designations");
      return res.json();
    },
    enabled: !!companyId,
  });

  const invalidateDesgs = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/master-designations") });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master-designations", { ...data, companyId }),
    onSuccess: () => {
      invalidateDesgs();
      toast({ title: "Designation created successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/master-designations/${id}`, data),
    onSuccess: () => {
      invalidateDesgs();
      toast({ title: "Designation updated successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master-designations/${id}`),
    onSuccess: () => {
      invalidateDesgs();
      toast({ title: "Designation deleted successfully" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", code: "", level: 1, description: "" });
    setEditingItem(null);
  };

  const handleEdit = (item: MasterDesignation) => {
    setEditingItem(item);
    setFormData({ name: item.name, code: item.code || "", level: item.level || 1, description: item.description || "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Designations
            </CardTitle>
            <CardDescription>Manage job titles and designations</CardDescription>
          </div>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-designation">
            <Plus className="h-4 w-4 mr-2" />
            Add Designation
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : designations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No designations configured. Click "Add Designation" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {designations.map((desg) => (
                <TableRow key={desg.id} data-testid={`row-designation-${desg.id}`}>
                  <TableCell className="font-medium">{desg.name}</TableCell>
                  <TableCell>{desg.code || "-"}</TableCell>
                  <TableCell>{desg.level}</TableCell>
                  <TableCell>
                    <Badge variant={desg.status === "active" ? "default" : "secondary"}>{desg.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(desg)} data-testid={`button-edit-designation-${desg.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(desg.id)} data-testid={`button-delete-designation-${desg.id}`}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Designation" : "Add Designation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-designation-name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} data-testid="input-designation-code" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <Input id="level" type="number" value={formData.level} onChange={(e) => setFormData({ ...formData, level: parseInt(e.target.value) || 1 })} data-testid="input-designation-level" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} data-testid="input-designation-description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-designation">
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const LOC_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
  "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh",
  "Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir",
  "Ladakh","Lakshadweep","Puducherry"
];

const LOC_DISTRICTS: Record<string, string[]> = {
  "Andhra Pradesh": ["Visakhapatnam","Vijayawada","Guntur","Nellore","Kurnool","Kadapa","Tirupati","Anantapur","Rajahmundry","Eluru","Ongole","Vizianagaram","Srikakulam","Chittoor","Krishna","West Godavari","East Godavari"],
  "Arunachal Pradesh": ["Itanagar","Tawang","Bomdila","Ziro","Along","Pasighat","Tezu","Changlang","Tirap","Papum Pare"],
  "Assam": ["Guwahati","Dibrugarh","Jorhat","Silchar","Nagaon","Tinsukia","Kamrup","Sonitpur","Lakhimpur","Cachar","Barpeta","Dhubri","Golaghat","Sivasagar"],
  "Bihar": ["Patna","Gaya","Muzaffarpur","Bhagalpur","Darbhanga","Munger","Purnia","Arrah","Begusarai","Katihar","Nalanda","Vaishali","Madhubani","Sitamarhi","Saran","Samastipur","Rohtas","Aurangabad"],
  "Chhattisgarh": ["Raipur","Bhilai","Bilaspur","Korba","Durg","Rajnandgaon","Jagdalpur","Ambikapur","Raigarh","Dhamtari","Mahasamund"],
  "Goa": ["North Goa","South Goa"],
  "Gujarat": ["Ahmedabad","Surat","Vadodara","Rajkot","Bhavnagar","Jamnagar","Gandhinagar","Anand","Mehsana","Patan","Bharuch","Kheda","Kutch","Amreli","Junagadh","Porbandar","Banaskantha","Sabarkantha","Panchmahal","Dahod","Narmada","Tapi","Valsad","Navsari"],
  "Haryana": ["Gurugram","Faridabad","Rohtak","Ambala","Hisar","Karnal","Panipat","Sonipat","Yamunanagar","Panchkula","Bhiwani","Sirsa","Jhajjar","Jind","Mahendragarh","Rewari","Palwal","Mewat","Kaithal","Kurukshetra"],
  "Himachal Pradesh": ["Shimla","Kangra","Mandi","Solan","Kullu","Hamirpur","Una","Bilaspur","Chamba","Kinnaur","Lahaul and Spiti","Sirmaur"],
  "Jharkhand": ["Ranchi","Jamshedpur","Dhanbad","Bokaro","Hazaribagh","Deoghar","Giridih","Ramgarh","Dumka","Chaibasa","Pakur","Godda"],
  "Karnataka": ["Bengaluru","Mysuru","Hubballi","Mangaluru","Belagavi","Kalaburagi","Davanagere","Shivamogga","Tumakuru","Vijayapura","Dharwad","Udupi","Hassan","Mandya","Chitradurga","Chikkamagaluru","Kodagu","Bidar","Raichur","Koppal","Gadag","Haveri","Yadgir","Chamarajanagar","Bengaluru Rural"],
  "Kerala": ["Thiruvananthapuram","Kochi","Kozhikode","Thrissur","Kollam","Palakkad","Alappuzha","Malappuram","Kannur","Kasaragod","Kottayam","Idukki","Wayanad","Pathanamthitta"],
  "Madhya Pradesh": ["Bhopal","Indore","Jabalpur","Gwalior","Ujjain","Sagar","Rewa","Satna","Chhindwara","Dewas","Ratlam","Morena","Vidisha","Damoh","Katni","Shahdol","Mandsaur","Neemuch","Shivpuri","Guna","Tikamgarh","Chhatarpur","Panna","Hoshangabad","Narsinghpur","Balaghat","Seoni","Mandla","Dindori","Betul","Harda","Burhanpur","Khandwa","Khargone","Barwani","Alirajpur","Jhabua","Dhar","Rajgarh","Raisen","Sehore","Agar Malwa","Anuppur","Umaria","Ashoknagar","Bhind","Datia","Sheopur"],
  "Maharashtra": ["Mumbai","Pune","Nagpur","Thane","Nashik","Aurangabad","Solapur","Amravati","Kolhapur","Sangli","Satara","Latur","Ahmednagar","Jalgaon","Akola","Nanded","Raigad","Ratnagiri","Sindhudurg","Dhule","Nandurbar","Buldhana","Yavatmal","Washim","Hingoli","Parbhani","Osmanabad","Beed","Jalna","Wardha","Bhandara","Gondiya","Chandrapur","Gadchiroli","Mumbai Suburban"],
  "Manipur": ["Imphal West","Imphal East","Bishnupur","Thoubal","Churachandpur","Senapati","Ukhrul","Tamenglong","Jiribam","Kakching","Kangpokpi","Noney","Pherzawl","Tengnoupal"],
  "Meghalaya": ["East Khasi Hills","West Khasi Hills","South West Khasi Hills","Ri Bhoi","East Jaintia Hills","West Jaintia Hills","East Garo Hills","West Garo Hills","South Garo Hills","North Garo Hills","Eastern West Khasi Hills"],
  "Mizoram": ["Aizawl","Lunglei","Champhai","Serchhip","Kolasib","Mamit","Siaha","Lawngtlai","Saitual","Hnahthial","Khawzawl"],
  "Nagaland": ["Kohima","Dimapur","Mokokchung","Tuensang","Wokha","Zunheboto","Mon","Phek","Longleng","Kiphire","Peren"],
  "Odisha": ["Bhubaneswar","Cuttack","Rourkela","Berhampur","Sambalpur","Puri","Brahmapur","Balasore","Bhadrak","Baripada","Jharsuguda","Bargarh","Koraput","Rayagada","Kalahandi","Bolangir","Sundergarh","Kendujhar","Dhenkanal","Jagatsinghpur","Jajpur","Kendrapara","Khordha","Nayagarh","Ganjam","Gajapati","Malkangiri","Nabarangpur","Nuapada","Subarnapur","Angul","Deogarh"],
  "Punjab": ["Ludhiana","Amritsar","Jalandhar","Patiala","Bathinda","Hoshiarpur","Mohali","Ferozepur","Gurdaspur","Roopnagar","Fatehgarh Sahib","Sangrur","Faridkot","Muktsar","Mansa","Barnala","Moga","Kapurthala","Nawanshahr","Tarn Taran","Fazilka","Pathankot"],
  "Rajasthan": ["Jaipur","Jodhpur","Udaipur","Kota","Ajmer","Bikaner","Alwar","Bharatpur","Sikar","Pali","Sri Ganganagar","Nagaur","Jhunjhunu","Churu","Hanumangarh","Barmer","Jaisalmer","Jalore","Sirohi","Bundi","Bhilwara","Tonk","Sawai Madhopur","Karauli","Dausa","Dholpur","Banswara","Dungarpur","Rajsamand","Chittorgarh","Baran","Jhalawar","Pratapgarh"],
  "Sikkim": ["East Sikkim","West Sikkim","North Sikkim","South Sikkim","Pakyong","Soreng"],
  "Tamil Nadu": ["Chennai","Coimbatore","Madurai","Tiruchirappalli","Salem","Tirunelveli","Tiruppur","Vellore","Erode","Thoothukkudi","Dindigul","Thanjavur","Ranipet","Sivaganga","Virudhunagar","Nagapattinam","Ramanathapuram","Karur","Cuddalore","Kancheepuram","Tiruvannamalai","Krishnagiri","Dharmapuri","Namakkal","Perambalur","Ariyalur","Villupuram","Kanyakumari","Nilgiris","Pudukkottai","Tiruvarur","Kallakurichi","Chengalpattu","Tenkasi"],
  "Telangana": ["Hyderabad","Warangal","Nizamabad","Karimnagar","Khammam","Ramagundam","Mahbubnagar","Nalgonda","Adilabad","Suryapet","Siddipet","Jagtial","Jangaon","Jayashankar Bhupalpally","Jogulamba Gadwal","Kamareddy","Komaram Bheem","Mahabubabad","Mancherial","Medak","Medchal","Mulugu","Nagarkurnool","Narayanpet","Nirmal","Peddapalli","Rajanna Sircilla","Rangareddy","Sangareddy","Vikarabad","Wanaparthy","Yadadri Bhuvanagiri"],
  "Tripura": ["West Tripura","East Tripura","South Tripura","North Tripura","Gomati","Khowai","Sepahijala","Unakoti","Dhalai"],
  "Uttar Pradesh": ["Lucknow","Kanpur","Ghaziabad","Agra","Varanasi","Meerut","Prayagraj","Bareilly","Aligarh","Moradabad","Noida","Saharanpur","Gorakhpur","Faizabad","Jhansi","Mathura","Muzaffarnagar","Shahjahanpur","Firozabad","Rampur","Hapur","Etawah","Mirzapur","Bulandshahr","Sambhal","Amroha","Hardoi","Sitapur","Lakhimpur Kheri","Unnao","Rae Bareli","Jaunpur","Azamgarh","Ballia","Sultanpur","Ambedkar Nagar","Deoria","Bahraich","Basti","Gonda","Pratapgarh","Fatehpur","Banda","Chitrakoot","Hamirpur","Mahoba","Lalitpur","Etah","Mainpuri","Hathras","Kasganj","Badaun","Bijnor","Pilibhit","Kushinagar","Maharajganj","Siddharthnagar","Sant Kabir Nagar","Shravasti","Balrampur","Sonbhadra","Chandauli","Ghazipur","Mau","Sant Ravidas Nagar"],
  "Uttarakhand": ["Dehradun","Haridwar","Roorkee","Haldwani","Rudrapur","Kashipur","Rishikesh","Almora","Nainital","Pithoragarh","Bageshwar","Chamoli","Rudraprayag","Tehri Garhwal","Uttarkashi","Pauri Garhwal","Champawat","US Nagar"],
  "West Bengal": ["Kolkata","Howrah","Hooghly","North 24 Parganas","South 24 Parganas","Bardhaman","Nadia","Murshidabad","Birbhum","Bankura","Purulia","West Midnapore","East Midnapore","Jalpaiguri","Darjeeling","Alipurduar","Cooch Behar","Malda","Uttar Dinajpur","Dakshin Dinajpur","Jhargram"],
  "Delhi": ["Central Delhi","East Delhi","New Delhi","North Delhi","North East Delhi","North West Delhi","South Delhi","South East Delhi","South West Delhi","West Delhi","Shahdara"],
  "Chandigarh": ["Chandigarh"],
  "Puducherry": ["Puducherry","Karaikal","Mahe","Yanam"],
  "Jammu and Kashmir": ["Srinagar","Jammu","Anantnag","Baramulla","Budgam","Pulwama","Kupwara","Kathua","Udhampur","Reasi","Ramban","Kishtwar","Doda","Rajouri","Poonch","Shopian","Kulgam","Bandipora","Ganderbal","Samba"],
  "Ladakh": ["Leh","Kargil"],
  "Andaman and Nicobar Islands": ["South Andaman","North and Middle Andaman","Nicobar"],
  "Lakshadweep": ["Lakshadweep"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Dadra and Nagar Haveli","Daman","Diu"],
};

function LocationsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterLocation | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "", code: "", address: "", city: "", district: "", state: "", country: "India", latitude: "", longitude: ""
  });

  const districts = formData.state ? (LOC_DISTRICTS[formData.state] || []) : [];

  const { data: locations = [], isLoading } = useQuery<MasterLocation[]>({
    queryKey: [`/api/master-locations?companyId=${companyId}`],
    queryFn: async () => {
      const res = await fetch(`/api/master-locations${companyId ? `?companyId=${companyId}` : ''}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch locations");
      return res.json();
    },
    enabled: !!companyId,
  });

  const invalidateLocs = () => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes("/api/master-locations") });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master-locations", { ...data, companyId }),
    onSuccess: () => { invalidateLocs(); toast({ title: "Location created successfully" }); setDialogOpen(false); resetForm(); },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/master-locations/${id}`, data),
    onSuccess: () => { invalidateLocs(); toast({ title: "Location updated successfully" }); setDialogOpen(false); resetForm(); },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master-locations/${id}`),
    onSuccess: () => { invalidateLocs(); toast({ title: "Location deleted successfully" }); },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", code: "", address: "", city: "", district: "", state: "", country: "India", latitude: "", longitude: "" });
    setEditingItem(null);
  };

  const handleEdit = (item: MasterLocation) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      code: item.code || "",
      address: item.address || "",
      city: item.city || "",
      district: (item as any).district || "",
      state: item.state || "",
      country: item.country || "India",
      latitude: (item as any).latitude || "",
      longitude: (item as any).longitude || "",
    });
    setDialogOpen(true);
  };

  const handleGeoLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", variant: "destructive" });
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(f => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setGeoLoading(false);
        toast({ title: "Location captured", description: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` });
      },
      () => {
        setGeoLoading(false);
        toast({ title: "Could not get location", description: "Please allow location access or enter manually", variant: "destructive" });
      },
      { timeout: 10000 }
    );
  };

  const handleSubmit = () => {
    if (editingItem) updateMutation.mutate({ id: editingItem.id, data: formData });
    else createMutation.mutate(formData);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Locations
            </CardTitle>
            <CardDescription>Manage office locations and branches</CardDescription>
          </div>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-location">
            <Plus className="h-4 w-4 mr-2" />
            Add Location
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : locations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No locations configured. Click "Add Location" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>City</TableHead>
                <TableHead>District</TableHead>
                <TableHead>State</TableHead>
                <TableHead>GPS</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((loc) => (
                <TableRow key={loc.id} data-testid={`row-location-${loc.id}`}>
                  <TableCell className="font-medium">{loc.name}</TableCell>
                  <TableCell>{loc.code || "-"}</TableCell>
                  <TableCell>{loc.city || "-"}</TableCell>
                  <TableCell>{(loc as any).district || "-"}</TableCell>
                  <TableCell>{loc.state || "-"}</TableCell>
                  <TableCell>
                    {(loc as any).latitude ? (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />Tagged
                      </span>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={loc.status === "active" ? "default" : "secondary"}>{loc.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(loc)} data-testid={`button-edit-location-${loc.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(loc.id)} data-testid={`button-delete-location-${loc.id}`}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loc-name">Name *</Label>
                <Input id="loc-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-location-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-code">Code</Label>
                <Input id="loc-code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} data-testid="input-location-code" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-address">Address</Label>
              <Input id="loc-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} data-testid="input-location-address" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>State</Label>
                <Select value={formData.state} onValueChange={(v) => setFormData({ ...formData, state: v, district: "" })} data-testid="select-location-state">
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOC_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>District</Label>
                <Select value={formData.district} onValueChange={(v) => setFormData({ ...formData, district: v })} disabled={!formData.state} data-testid="select-location-district">
                  <SelectTrigger>
                    <SelectValue placeholder={formData.state ? "Select district" : "Select state first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loc-city">City</Label>
                <Input id="loc-city" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} data-testid="input-location-city" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-country">Country</Label>
                <Input id="loc-country" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} data-testid="input-location-country" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Geo Location (Lat / Lng)</Label>
                <Button type="button" size="sm" variant="outline" onClick={handleGeoLocation} disabled={geoLoading} className="h-7 text-xs">
                  {geoLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <LocateFixed className="h-3 w-3 mr-1" />}
                  {geoLoading ? "Locating..." : "Use My Location"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Latitude" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} data-testid="input-location-lat" />
                <Input placeholder="Longitude" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} data-testid="input-location-lng" />
              </div>
              {formData.latitude && formData.longitude && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {formData.latitude}, {formData.longitude}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-location">
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function EarningHeadsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EarningHead | null>(null);
  const [formData, setFormData] = useState({ name: "", code: "", type: "fixed", calculationBase: "", percentage: 0, isTaxable: true, isPartOfCTC: true });

  const earningHeadsQueryKey = [`/api/earning-heads?companyId=${companyId}`];
  const { data: earningHeads = [], isLoading } = useQuery<EarningHead[]>({
    queryKey: earningHeadsQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/earning-heads?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch earning heads");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/earning-heads", { ...data, companyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: earningHeadsQueryKey });
      toast({ title: "Earning head created successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/earning-heads/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: earningHeadsQueryKey });
      toast({ title: "Earning head updated successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/earning-heads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: earningHeadsQueryKey });
      toast({ title: "Earning head deleted successfully" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", code: "", type: "fixed", calculationBase: "", percentage: 0, isTaxable: true, isPartOfCTC: true });
    setEditingItem(null);
  };

  const handleEdit = (item: EarningHead) => {
    setEditingItem(item);
    setFormData({ 
      name: item.name, 
      code: item.code, 
      type: item.type,
      calculationBase: item.calculationBase || "",
      percentage: item.percentage || 0,
      isTaxable: item.isTaxable ?? true,
      isPartOfCTC: item.isPartOfCTC ?? true
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Earning Heads
            </CardTitle>
            <CardDescription>Manage salary earning components</CardDescription>
          </div>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-earning-head">
            <Plus className="h-4 w-4 mr-2" />
            Add Earning Head
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : earningHeads.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No earning heads configured. Click "Add Earning Head" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Taxable</TableHead>
                <TableHead>Part of CTC</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {earningHeads.map((head) => (
                <TableRow key={head.id} data-testid={`row-earning-head-${head.id}`}>
                  <TableCell className="font-medium">{head.name}</TableCell>
                  <TableCell>{head.code}</TableCell>
                  <TableCell className="capitalize">{head.type}</TableCell>
                  <TableCell>{head.isTaxable ? "Yes" : "No"}</TableCell>
                  <TableCell>{head.isPartOfCTC ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Badge variant={head.status === "active" ? "default" : "secondary"}>{head.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(head)} data-testid={`button-edit-earning-head-${head.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(head.id)} data-testid={`button-delete-earning-head-${head.id}`}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Earning Head" : "Add Earning Head"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-earning-head-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} data-testid="input-earning-head-code" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger data-testid="select-earning-head-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.type === "percentage" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="calculationBase">Calculation Base</Label>
                    <Select value={formData.calculationBase} onValueChange={(v) => setFormData({ ...formData, calculationBase: v })}>
                      <SelectTrigger data-testid="select-earning-head-base">
                        <SelectValue placeholder="Select base" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="gross">Gross</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            {formData.type === "percentage" && (
              <div className="space-y-2">
                <Label htmlFor="percentage">Percentage (%)</Label>
                <Input id="percentage" type="number" value={formData.percentage} onChange={(e) => setFormData({ ...formData, percentage: parseFloat(e.target.value) || 0 })} data-testid="input-earning-head-percentage" />
              </div>
            )}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={formData.isTaxable} onCheckedChange={(v) => setFormData({ ...formData, isTaxable: v })} data-testid="switch-earning-head-taxable" />
                <Label>Taxable</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formData.isPartOfCTC} onCheckedChange={(v) => setFormData({ ...formData, isPartOfCTC: v })} data-testid="switch-earning-head-ctc" />
                <Label>Part of CTC</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-earning-head">
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DeductionHeadsManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DeductionHead | null>(null);
  const [formData, setFormData] = useState({ name: "", code: "", type: "fixed", calculationBase: "", percentage: 0, isStatutory: false });

  const deductionHeadsQueryKey = [`/api/deduction-heads?companyId=${companyId}`];
  const { data: deductionHeads = [], isLoading } = useQuery<DeductionHead[]>({
    queryKey: deductionHeadsQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/deduction-heads?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deduction heads");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/deduction-heads", { ...data, companyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deductionHeadsQueryKey });
      toast({ title: "Deduction head created successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/deduction-heads/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deductionHeadsQueryKey });
      toast({ title: "Deduction head updated successfully" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/deduction-heads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deductionHeadsQueryKey });
      toast({ title: "Deduction head deleted successfully" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ name: "", code: "", type: "fixed", calculationBase: "", percentage: 0, isStatutory: false });
    setEditingItem(null);
  };

  const handleEdit = (item: DeductionHead) => {
    setEditingItem(item);
    setFormData({ 
      name: item.name, 
      code: item.code, 
      type: item.type,
      calculationBase: item.calculationBase || "",
      percentage: item.percentage || 0,
      isStatutory: item.isStatutory ?? false
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Deduction Heads
            </CardTitle>
            <CardDescription>Manage salary deduction components</CardDescription>
          </div>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} data-testid="button-add-deduction-head">
            <Plus className="h-4 w-4 mr-2" />
            Add Deduction Head
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : deductionHeads.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No deduction heads configured. Click "Add Deduction Head" to create one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Statutory</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deductionHeads.map((head) => (
                <TableRow key={head.id} data-testid={`row-deduction-head-${head.id}`}>
                  <TableCell className="font-medium">{head.name}</TableCell>
                  <TableCell>{head.code}</TableCell>
                  <TableCell className="capitalize">{head.type}</TableCell>
                  <TableCell>{head.isStatutory ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Badge variant={head.status === "active" ? "default" : "secondary"}>{head.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(head)} data-testid={`button-edit-deduction-head-${head.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(head.id)} data-testid={`button-delete-deduction-head-${head.id}`}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Deduction Head" : "Add Deduction Head"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-deduction-head-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} data-testid="input-deduction-head-code" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger data-testid="select-deduction-head-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.type === "percentage" && (
                <div className="space-y-2">
                  <Label htmlFor="calculationBase">Calculation Base</Label>
                  <Select value={formData.calculationBase} onValueChange={(v) => setFormData({ ...formData, calculationBase: v })}>
                    <SelectTrigger data-testid="select-deduction-head-base">
                      <SelectValue placeholder="Select base" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="gross">Gross</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {formData.type === "percentage" && (
              <div className="space-y-2">
                <Label htmlFor="percentage">Percentage (%)</Label>
                <Input id="percentage" type="number" value={formData.percentage} onChange={(e) => setFormData({ ...formData, percentage: parseFloat(e.target.value) || 0 })} data-testid="input-deduction-head-percentage" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={formData.isStatutory} onCheckedChange={(v) => setFormData({ ...formData, isStatutory: v })} data-testid="switch-deduction-head-statutory" />
              <Label>Statutory Deduction</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-deduction-head">
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StatutorySettingsTab({ companyId, selectedCompany }: { companyId: string | undefined; selectedCompany: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [formData, setFormData] = useState({
    pfEmployeePercent: 12,
    pfEmployerPercent: 12,
    pfWageCeiling: 15000,
    pfEnabled: true,
    esicEmployeePercent: 75,
    esicEmployerPercent: 325,
    esicWageCeiling: 21000,
    esicEnabled: true,
    esicCalcOnGross: false,
    lwfEmployeePercent: 20,
    lwfEmployerPercent: 40,
    lwfEmployeeMaxCap: 34,
    lwfEmployerMaxCap: 68,
    lwfCalculationBase: "gross",
    lwfEnabled: false,
    ptMaxAmount: 200,
    ptEnabled: true,
    ptState: "",
    bonusPercent: 833,
    bonusCalculationBase: "basic",
    bonusMaxCeiling: 7000,
    bonusMinPercent: 833,
    bonusMaxPercent: 2000,
    bonusEnabled: true,
    bonusSkipCeiling: false,
  });

  const { data: statutorySettingsArr, isLoading } = useQuery<StatutorySettings[]>({
    queryKey: [`/api/statutory-settings`, companyId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/statutory-settings?companyId=${companyId}`);
      return res.json();
    },
    enabled: !!companyId,
  });

  const statutorySettings = statutorySettingsArr && statutorySettingsArr.length > 0 ? statutorySettingsArr[0] : null;

  useEffect(() => {
    if (statutorySettings) {
      setFormData({
        pfEmployeePercent: statutorySettings.pfEmployeePercent ?? 12,
        pfEmployerPercent: statutorySettings.pfEmployerPercent ?? 12,
        pfWageCeiling: statutorySettings.pfWageCeiling ?? 15000,
        pfEnabled: statutorySettings.pfEnabled ?? true,
        esicEmployeePercent: statutorySettings.esicEmployeePercent ?? 75,
        esicEmployerPercent: statutorySettings.esicEmployerPercent ?? 325,
        esicWageCeiling: statutorySettings.esicWageCeiling ?? 21000,
        esicEnabled: statutorySettings.esicEnabled ?? true,
        esicCalcOnGross: statutorySettings.esicCalcOnGross ?? false,
        lwfEmployeePercent: statutorySettings.lwfEmployeePercent ?? 20,
        lwfEmployerPercent: statutorySettings.lwfEmployerPercent ?? 40,
        lwfEmployeeMaxCap: statutorySettings.lwfEmployeeMaxCap ?? 34,
        lwfEmployerMaxCap: statutorySettings.lwfEmployerMaxCap ?? 68,
        lwfCalculationBase: statutorySettings.lwfCalculationBase || "gross",
        lwfEnabled: statutorySettings.lwfEnabled ?? false,
        ptMaxAmount: statutorySettings.ptMaxAmount ?? 200,
        ptEnabled: statutorySettings.ptEnabled ?? true,
        ptState: statutorySettings.ptState || "",
        bonusPercent: statutorySettings.bonusPercent ?? 833,
        bonusCalculationBase: statutorySettings.bonusCalculationBase || "basic",
        bonusMaxCeiling: statutorySettings.bonusMaxCeiling ?? 7000,
        bonusMinPercent: statutorySettings.bonusMinPercent ?? 833,
        bonusMaxPercent: statutorySettings.bonusMaxPercent ?? 2000,
        bonusEnabled: statutorySettings.bonusEnabled ?? true,
        bonusSkipCeiling: (statutorySettings as any).bonusSkipCeiling ?? false,
      });
    }
  }, [statutorySettings]);

  const saveMutation = useMutation({
    mutationFn: (data: typeof formData) => {
      if (statutorySettings?.id) {
        return apiRequest("PATCH", `/api/statutory-settings/${statutorySettings.id}`, data);
      }
      return apiRequest("POST", "/api/statutory-settings", { ...data, companyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/statutory-settings`] });
      toast({ title: "Statutory settings saved successfully" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  if (!companyId && user?.role !== "super_admin") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Please select a company to configure statutory settings.
        </CardContent>
      </Card>
    );
  }

  if (selectedCompany === "__global__" && user?.role === "super_admin") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Please select a specific company to configure statutory settings. These settings are company-specific.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading...
        </CardContent>
      </Card>
    );
  }

  const indianStates = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", 
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", 
    "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", 
    "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", 
    "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", 
    "Uttar Pradesh", "Uttarakhand", "West Bengal"
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending} data-testid="button-save-statutory">
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Statutory Settings"}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Provident Fund (PF)</CardTitle>
              <Switch 
                checked={formData.pfEnabled} 
                onCheckedChange={(v) => setFormData({ ...formData, pfEnabled: v })} 
                data-testid="switch-pf-enabled"
              />
            </div>
            <CardDescription>Employee Provident Fund contribution settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employee Contribution (%)</Label>
                <Input 
                  type="number" 
                  value={formData.pfEmployeePercent} 
                  onChange={(e) => setFormData({ ...formData, pfEmployeePercent: parseInt(e.target.value) || 0 })}
                  disabled={!formData.pfEnabled}
                  data-testid="input-pf-employee-percent"
                />
              </div>
              <div className="space-y-2">
                <Label>Employer Contribution (%)</Label>
                <Input 
                  type="number" 
                  value={formData.pfEmployerPercent} 
                  onChange={(e) => setFormData({ ...formData, pfEmployerPercent: parseInt(e.target.value) || 0 })}
                  disabled={!formData.pfEnabled}
                  data-testid="input-pf-employer-percent"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Wage Ceiling (Monthly)</Label>
              <Input 
                type="number" 
                value={formData.pfWageCeiling} 
                onChange={(e) => setFormData({ ...formData, pfWageCeiling: parseInt(e.target.value) || 0 })}
                disabled={!formData.pfEnabled}
                data-testid="input-pf-ceiling"
              />
              <p className="text-xs text-muted-foreground">PF contribution is calculated on basic up to this limit</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">ESIC</CardTitle>
              <Switch 
                checked={formData.esicEnabled} 
                onCheckedChange={(v) => setFormData({ ...formData, esicEnabled: v })} 
                data-testid="switch-esic-enabled"
              />
            </div>
            <CardDescription>Employee State Insurance Corporation settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employee Contribution (%)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={(formData.esicEmployeePercent / 100).toFixed(2)} 
                  onChange={(e) => setFormData({ ...formData, esicEmployeePercent: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                  disabled={!formData.esicEnabled}
                  data-testid="input-esic-employee-percent"
                />
                <p className="text-xs text-muted-foreground">Standard: 0.75%</p>
              </div>
              <div className="space-y-2">
                <Label>Employer Contribution (%)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={(formData.esicEmployerPercent / 100).toFixed(2)} 
                  onChange={(e) => setFormData({ ...formData, esicEmployerPercent: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                  disabled={!formData.esicEnabled}
                  data-testid="input-esic-employer-percent"
                />
                <p className="text-xs text-muted-foreground">Standard: 3.25%</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Wage Ceiling (Monthly)</Label>
              <Input 
                type="number" 
                value={formData.esicWageCeiling} 
                onChange={(e) => setFormData({ ...formData, esicWageCeiling: parseInt(e.target.value) || 0 })}
                disabled={!formData.esicEnabled}
                data-testid="input-esic-ceiling"
              />
              <p className="text-xs text-muted-foreground">ESIC is applicable for employees with gross up to this limit</p>
            </div>

            {/* Calculation method toggle */}
            <div className={`flex items-center justify-between rounded-lg border p-3 ${!formData.esicEnabled ? "opacity-50" : ""}`}>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Calculate on Gross (Old Setup)</p>
                <p className="text-xs text-muted-foreground">
                  {formData.esicCalcOnGross
                    ? "ESIC calculated on total gross salary"
                    : "ESIC calculated as per new rule (Basic + DA)"}
                </p>
              </div>
              <Switch
                checked={formData.esicCalcOnGross ?? false}
                onCheckedChange={(v) => setFormData({ ...formData, esicCalcOnGross: v })}
                disabled={!formData.esicEnabled}
                data-testid="switch-esic-calc-on-gross"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Labour Welfare Fund (LWF)</CardTitle>
              <Switch 
                checked={formData.lwfEnabled} 
                onCheckedChange={(v) => setFormData({ ...formData, lwfEnabled: v })} 
                data-testid="switch-lwf-enabled"
              />
            </div>
            <CardDescription>State-specific Labour Welfare Fund settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Calculation Base</Label>
              <Select 
                value={formData.lwfCalculationBase} 
                onValueChange={(v) => setFormData({ ...formData, lwfCalculationBase: v })}
                disabled={!formData.lwfEnabled}
              >
                <SelectTrigger data-testid="select-lwf-calc-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gross">Gross Salary</SelectItem>
                  <SelectItem value="basic">Basic Salary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employee % (basis points, e.g. 20 = 0.2%)</Label>
                <Input 
                  type="number" 
                  value={formData.lwfEmployeePercent} 
                  onChange={(e) => setFormData({ ...formData, lwfEmployeePercent: parseInt(e.target.value) || 0 })}
                  disabled={!formData.lwfEnabled}
                  data-testid="input-lwf-employee-percent"
                />
              </div>
              <div className="space-y-2">
                <Label>Employee Max Cap (per month)</Label>
                <Input 
                  type="number" 
                  value={formData.lwfEmployeeMaxCap} 
                  onChange={(e) => setFormData({ ...formData, lwfEmployeeMaxCap: parseInt(e.target.value) || 0 })}
                  disabled={!formData.lwfEnabled}
                  data-testid="input-lwf-employee-cap"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employer % (basis points, e.g. 40 = 0.4%)</Label>
                <Input 
                  type="number" 
                  value={formData.lwfEmployerPercent} 
                  onChange={(e) => setFormData({ ...formData, lwfEmployerPercent: parseInt(e.target.value) || 0 })}
                  disabled={!formData.lwfEnabled}
                  data-testid="input-lwf-employer-percent"
                />
              </div>
              <div className="space-y-2">
                <Label>Employer Max Cap (per month)</Label>
                <Input 
                  type="number" 
                  value={formData.lwfEmployerMaxCap} 
                  onChange={(e) => setFormData({ ...formData, lwfEmployerMaxCap: parseInt(e.target.value) || 0 })}
                  disabled={!formData.lwfEnabled}
                  data-testid="input-lwf-employer-cap"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">LWF rates and caps change yearly. Update these values as per the latest government notification for your state.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Professional Tax (PT)</CardTitle>
              <Switch 
                checked={formData.ptEnabled} 
                onCheckedChange={(v) => setFormData({ ...formData, ptEnabled: v })} 
                data-testid="switch-pt-enabled"
              />
            </div>
            <CardDescription>State-specific Professional Tax settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>State</Label>
              <Select 
                value={formData.ptState} 
                onValueChange={(v) => setFormData({ ...formData, ptState: v })}
                disabled={!formData.ptEnabled}
              >
                <SelectTrigger data-testid="select-pt-state">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {indianStates.map(state => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Maximum Monthly Amount</Label>
              <Input 
                type="number" 
                value={formData.ptMaxAmount} 
                onChange={(e) => setFormData({ ...formData, ptMaxAmount: parseInt(e.target.value) || 0 })}
                disabled={!formData.ptEnabled}
                data-testid="input-pt-max-amount"
              />
              <p className="text-xs text-muted-foreground">PT is calculated based on salary slabs defined by each state (max Rs. 200/month)</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Bonus</CardTitle>
              <Switch 
                checked={formData.bonusEnabled} 
                onCheckedChange={(v) => setFormData({ ...formData, bonusEnabled: v })} 
                data-testid="switch-bonus-enabled"
              />
            </div>
            <CardDescription>Statutory bonus calculation settings as per the Payment of Bonus Act</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Calculation Base</Label>
              <Select 
                value={formData.bonusCalculationBase} 
                onValueChange={(v) => setFormData({ ...formData, bonusCalculationBase: v })}
                disabled={!formData.bonusEnabled}
              >
                <SelectTrigger data-testid="select-bonus-calc-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic Salary</SelectItem>
                  <SelectItem value="gross">Gross Salary</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Bonus is typically calculated on basic salary or minimum wage, whichever is higher</p>
            </div>
            <div className="space-y-2">
              <Label>Bonus Percentage (%)</Label>
              <Input 
                type="number" 
                step="0.01"
                value={(formData.bonusPercent / 100).toFixed(2)} 
                onChange={(e) => setFormData({ ...formData, bonusPercent: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                disabled={!formData.bonusEnabled}
                data-testid="input-bonus-percent"
              />
              <p className="text-xs text-muted-foreground">Standard statutory bonus: 8.33% (minimum). Enter actual percentage to apply.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Minimum Bonus (%)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={(formData.bonusMinPercent / 100).toFixed(2)} 
                  onChange={(e) => setFormData({ ...formData, bonusMinPercent: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                  disabled={!formData.bonusEnabled}
                  data-testid="input-bonus-min-percent"
                />
                <p className="text-xs text-muted-foreground">As per Act: 8.33%</p>
              </div>
              <div className="space-y-2">
                <Label>Maximum Bonus (%)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={(formData.bonusMaxPercent / 100).toFixed(2)} 
                  onChange={(e) => setFormData({ ...formData, bonusMaxPercent: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                  disabled={!formData.bonusEnabled}
                  data-testid="input-bonus-max-percent"
                />
                <p className="text-xs text-muted-foreground">As per Act: 20%</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Monthly Wage Ceiling for Bonus</Label>
              <Input 
                type="number" 
                value={formData.bonusMaxCeiling} 
                onChange={(e) => setFormData({ ...formData, bonusMaxCeiling: parseInt(e.target.value) || 0 })}
                disabled={!formData.bonusEnabled || (formData as any).bonusSkipCeiling}
                data-testid="input-bonus-ceiling"
              />
              <p className="text-xs text-muted-foreground">Bonus is calculated on salary up to this ceiling (currently Rs. 7,000/month as per the Act). Update when government revises.</p>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div>
                <Label className="text-sm font-medium">Skip Wage Ceiling</Label>
                <p className="text-xs text-muted-foreground mt-0.5">When enabled, bonus is calculated on the full salary with no ceiling limit.</p>
              </div>
              <Switch
                checked={(formData as any).bonusSkipCeiling ?? false}
                onCheckedChange={(v) => setFormData({ ...formData, bonusSkipCeiling: v } as any)}
                disabled={!formData.bonusEnabled}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const DAYS_OF_WEEK = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
];

function TimeOfficePolicyTab({ companyId, selectedCompany }: { companyId: string | undefined; selectedCompany: string }) {
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

const holidayTypeColors: Record<string, string> = {
  public: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  restricted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  optional: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
};

interface HolidayFormData {
  date: string;
  name: string;
  description: string;
  type: string;
  companyId: string;
}

const emptyHolidayForm: HolidayFormData = {
  date: "",
  name: "",
  description: "",
  type: "public",
  companyId: "",
};

function HolidayCalendarTab({ companyId, selectedCompany, userRole }: { companyId: string; selectedCompany: string; userRole?: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = userRole === "super_admin";

  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [deletingHoliday, setDeletingHoliday] = useState<Holiday | null>(null);
  const [formData, setFormData] = useState<HolidayFormData>(emptyHolidayForm);

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const effectiveCompanyId = selectedCompany === "__global__" ? "" : companyId;

  const queryKey = effectiveCompanyId
    ? ["/api/holidays", `?companyId=${effectiveCompanyId}`]
    : ["/api/holidays"];

  const { data: holidays = [], isLoading } = useQuery<Holiday[]>({
    queryKey,
    queryFn: async () => {
      const url = effectiveCompanyId
        ? `/api/holidays?companyId=${effectiveCompanyId}`
        : "/api/holidays";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch holidays");
      return res.json();
    },
  });

  const filteredHolidays = holidays.filter((h) => h.date.startsWith(selectedYear));

  const createMutation = useMutation({
    mutationFn: async (data: HolidayFormData) => {
      return apiRequest("POST", "/api/holidays", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      setDialogOpen(false);
      setFormData(emptyHolidayForm);
      toast({ title: "Holiday Created", description: "Holiday has been added successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<HolidayFormData> }) => {
      return apiRequest("PATCH", `/api/holidays/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      setDialogOpen(false);
      setEditingHoliday(null);
      setFormData(emptyHolidayForm);
      toast({ title: "Holiday Updated", description: "Holiday has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/holidays/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      setDeleteDialogOpen(false);
      setDeletingHoliday(null);
      toast({ title: "Holiday Deleted", description: "Holiday has been deleted successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingHoliday(null);
    setFormData({
      ...emptyHolidayForm,
      companyId: effectiveCompanyId || (user?.companyId || ""),
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setFormData({
      date: holiday.date,
      name: holiday.name,
      description: holiday.description || "",
      type: holiday.type,
      companyId: holiday.companyId,
    });
    setDialogOpen(true);
  };

  const handleOpenDelete = (holiday: Holiday) => {
    setDeletingHoliday(holiday);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.date || !formData.companyId) {
      toast({ title: "Validation Error", description: "Name, Date and Company are required.", variant: "destructive" });
      return;
    }
    if (editingHoliday) {
      updateMutation.mutate({ id: editingHoliday.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getCompanyName = (cId: string) => {
    return companies.find((c) => c.id === cId)?.companyName || "Unknown";
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => (currentYear - 1 + i).toString());

  return (
    <div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Holiday Calendar
              </CardTitle>
              <CardDescription>Manage company holidays and observances</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add Holiday
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading holidays...</div>
          ) : filteredHolidays.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No holidays found for {selectedYear}. Click "Add Holiday" to create one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  {isSuperAdmin && <TableHead>Company</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHolidays
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((holiday) => (
                    <TableRow key={holiday.id}>
                      <TableCell className="font-medium">{holiday.date}</TableCell>
                      <TableCell>{holiday.name}</TableCell>
                      <TableCell>
                        <Badge className={holidayTypeColors[holiday.type] || ""} variant="secondary">
                          {holiday.type.charAt(0).toUpperCase() + holiday.type.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{holiday.description || "—"}</TableCell>
                      {isSuperAdmin && <TableCell>{getCompanyName(holiday.companyId)}</TableCell>}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(holiday)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenDelete(holiday)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingHoliday ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
            <DialogDescription>
              {editingHoliday ? "Update the holiday details below." : "Fill in the details to add a new holiday."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isSuperAdmin && (
              <div className="space-y-2">
                <Label>Company</Label>
                <Select value={formData.companyId} onValueChange={(v) => setFormData({ ...formData, companyId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>{company.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Republic Day"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingHoliday ? "Update Holiday" : "Add Holiday"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Holiday</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingHoliday?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletingHoliday && deleteMutation.mutate(deletingHoliday.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
