import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Building2, Calendar, CalendarDays, Percent, Save, Briefcase, Smartphone, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth";
import type { Company, Setting } from "@shared/schema";
import type { SettingFormData } from "@/components/settings/types";
import { GeneralSettings, LocalizationSettings, NotificationSettings, SecuritySettings } from "@/components/settings/general-tab";
import { MastersSettings } from "@/components/settings/masters-tab";
import { StatutorySettingsTab } from "@/components/settings/statutory-tab";
import { HolidayCalendarTab } from "@/components/settings/holidays-tab";
import { TimeOfficePolicyTab } from "@/components/settings/time-office-tab";
import { MobileAppVersionTab } from "@/components/settings/mobile-app-tab";
import { ApiKeysTab } from "@/components/settings/api-keys-tab";

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
        await api.settings.save(setting);
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
      <PageHeader
        title="Settings"
        description="Configure system preferences and company settings"
        className="mb-6"
        actions={
          <>
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
            {activeTab === "general" && (
              <Button onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending} data-testid="button-save-settings">
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="general" data-testid="tab-general">
            <Building2 className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="masters" data-testid="tab-masters">
            <Briefcase className="h-4 w-4 mr-2" />
            Masters
          </TabsTrigger>
          <TabsTrigger value="statutory" data-testid="tab-statutory">
            <Percent className="h-4 w-4 mr-2" />
            Statutory
          </TabsTrigger>
          <TabsTrigger value="holidays" data-testid="tab-holidays">
            <CalendarDays className="h-4 w-4 mr-2" />
            Holidays
          </TabsTrigger>
          <TabsTrigger value="timeoffice" data-testid="tab-timeoffice">
            <Calendar className="h-4 w-4 mr-2" />
            Time Office
          </TabsTrigger>
          {user?.role === "super_admin" && (
            <TabsTrigger value="mobile-app" data-testid="tab-mobile-app">
              <Smartphone className="h-4 w-4 mr-2" />
              Mobile App
            </TabsTrigger>
          )}
          {user?.role === "super_admin" && (
            <TabsTrigger value="api-keys" data-testid="tab-api-keys">
              <KeyRound className="h-4 w-4 mr-2" />
              API Keys
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general">
          <div className="grid gap-6">
            <GeneralSettings formData={formData} handleInputChange={handleInputChange} />
            <LocalizationSettings formData={formData} handleInputChange={handleInputChange} />
            <NotificationSettings formData={formData} handleInputChange={handleInputChange} />
            <SecuritySettings formData={formData} handleInputChange={handleInputChange} />
          </div>
        </TabsContent>

        <TabsContent value="masters">
          <MastersSettings companyId={companyIdForQueries} selectedCompany={selectedCompany} userRole={user?.role} />
        </TabsContent>

        <TabsContent value="statutory">
          <StatutorySettingsTab companyId={companyIdForQueries} selectedCompany={selectedCompany} />
        </TabsContent>

        <TabsContent value="holidays">
          <HolidayCalendarTab companyId={companyIdForQueries} selectedCompany={selectedCompany} userRole={user?.role || ""} />
        </TabsContent>

        <TabsContent value="timeoffice">
          <TimeOfficePolicyTab companyId={companyIdForQueries} selectedCompany={selectedCompany} />
        </TabsContent>
        {user?.role === "super_admin" && (
          <TabsContent value="mobile-app">
            <MobileAppVersionTab />
          </TabsContent>
        )}
        {user?.role === "super_admin" && (
          <TabsContent value="api-keys">
            <ApiKeysTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
