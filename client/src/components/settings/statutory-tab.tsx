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
import { queryClient } from "@/lib/queryClient";
import { fetchJson, apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/hooks/use-can";
import type { Company, Setting, MasterDepartment, MasterDesignation, MasterLocation, EarningHead, DeductionHead, StatutorySettings, TimeOfficePolicy, Holiday, WageGrade, ContractorMaster, LeavePolicy } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";

export function StatutorySettingsTab({ companyId, selectedCompany }: { companyId: string | undefined; selectedCompany: string }) {
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
    queryFn: () => fetchJson<StatutorySettings[]>(`/api/statutory-settings?companyId=${companyId}`),
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

