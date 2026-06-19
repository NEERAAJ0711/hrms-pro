import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldCheck, Building2, Settings2, Users, Briefcase, FileBarChart2, Lock,
} from "lucide-react";
import { EmployeeSetupTab } from "@/components/compliances/employee-setup-tab";
import { AdjustmentsTab } from "@/components/compliances/adjustments-tab";
import { ClientSetupTab } from "@/components/compliances/client-setup-tab";
import { ComplianceReportTab } from "@/components/compliances/compliance-report-tab";
import { PageHeader } from "@/components/page-header";
import { fetchJson } from "@/lib/api";

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CompliancesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isSuperAdmin = user?.role === "super_admin";

  // Page-level access guard. Compliance management is restricted to admins.
  // The sidebar already hides this entry for non-admins; this guard protects
  // direct-URL navigation and mirrors the server's requireAdminRole on every
  // /api/compliance/* endpoint.
  const COMPLIANCE_ROLES = ["super_admin", "company_admin", "hr_admin"];
  const hasComplianceAccess = !!user && COMPLIANCE_ROLES.includes(user.role);

  const [companies, setCompanies] = useState<{ id: string; company_name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");

  // Load companies once for super_admin
  useEffect(() => {
    if (isSuperAdmin && hasComplianceAccess) {
      fetchJson<{ id: string; company_name: string }[]>("/api/compliance/companies")
        .then(data => { setCompanies(data); if (data.length > 0) setSelectedCompany(data[0].id); })
        .catch(() => {});
    }
  }, [isSuperAdmin, hasComplianceAccess]);

  const effectiveCompanyId = isSuperAdmin ? selectedCompany : (user?.companyId || "");

  if (!hasComplianceAccess) {
    return (
      <div className="p-6" data-testid="compliances-page">
        <Card className="max-w-md mx-auto mt-12">
          <CardContent className="pt-8 pb-6 text-center">
            <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold mb-1">Access denied</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Compliance management is restricted to administrators. Please contact your administrator if you need access.
            </p>
            <Button variant="outline" onClick={() => setLocation("/dashboard")} data-testid="button-back-dashboard">
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* ── Page header */}
      <PageHeader
        title="Compliance Management"
        description="Configure employee-wise statutory settings and manage compliance adjustments"
        icon={
          <div className="p-2 bg-blue-600 rounded-lg">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
        }
      />

      {/* ── Company selector (super_admin only) */}
      {isSuperAdmin && (
        <Card className="border border-blue-100 bg-blue-50/40">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-blue-600" />
              <Label className="text-sm font-medium text-gray-700">Company</Label>
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="w-72 bg-white">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Main tabs */}
      <Tabs defaultValue="setup" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="setup" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Employee Setup
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Adjustments
          </TabsTrigger>
          <TabsTrigger value="client-setup" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" /> Client Setup
          </TabsTrigger>
          <TabsTrigger value="compliance-report" className="flex items-center gap-2">
            <FileBarChart2 className="h-4 w-4" /> Compliance Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup">
          <EmployeeSetupTab
            companyId={effectiveCompanyId}
            isSuperAdmin={isSuperAdmin}
            toast={toast}
          />
        </TabsContent>

        <TabsContent value="adjustments">
          <AdjustmentsTab
            companyId={effectiveCompanyId}
            isSuperAdmin={isSuperAdmin}
            user={user}
            toast={toast}
          />
        </TabsContent>

        <TabsContent value="client-setup">
          <ClientSetupTab
            companyId={effectiveCompanyId}
            isSuperAdmin={isSuperAdmin}
            toast={toast}
          />
        </TabsContent>

        <TabsContent value="compliance-report">
          <ComplianceReportTab
            companyId={effectiveCompanyId}
            isSuperAdmin={isSuperAdmin}
            user={user}
            toast={toast}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
