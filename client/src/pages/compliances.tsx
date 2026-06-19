import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { jsPDF, autoTable } from "@/lib/jspdf-shim";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useSort, sortData } from "@/lib/use-sort";
import { SortableHead } from "@/components/sortable-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldCheck, Search, Save, RefreshCw, CheckCircle2,
  Download, Upload, AlertTriangle, Building2, Trash2, Settings2, Users, ArrowLeft, CheckCircle,
  Briefcase, Plus, UserPlus, UserMinus, CalendarDays, XCircle, FileBarChart2, ChevronDown, FileSpreadsheet,
  Lock, Pencil,
} from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const COMPLIANCE_TYPES = ["PF","ESI","Professional Tax","Labour Dept","Minimum Wage","ESIC Inspection","Custom"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const REPORT_STATES = ["Delhi","Uttar Pradesh","Haryana","Maharashtra","Karnataka","Rajasthan","Gujarat","Punjab","Madhya Pradesh","Telangana"];
const REPORT_ACTS   = ["Contract Labour (R&A) Act","Minimum Wages Act","Payment of Wages Act","ESI Act","EPF & MP Act","Maternity Benefit Act","Payment of Bonus Act","Factories Act"];
const REPORT_TYPES  = [
  "CLRA Full Package – Forms VIII + IX + XII + XIII",
  "Form VIII – Contractor Particulars",
  "Form IX – Workmen Register",
  "Form XII – Muster Roll",
  "Form XIII – Wages Register",
  "Form XIV – Wage Slip",
  "Form XV – Deductions Register",
  "Form XVI – Fines Register",
  "Form XVII – Advances Register",
  "Form XVIII – OT Register",
  "Form XIX – Annual Return",
];

const WEEKLY_OFF_OPTIONS = [
  { value: "sunday",           label: "Sunday" },
  { value: "saturday_sunday",  label: "Saturday + Sunday" },
  { value: "second_fourth_sat",label: "2nd & 4th Saturday + Sunday" },
  { value: "custom",           label: "Custom" },
];
const OT_TYPE_OPTIONS = [
  { value: "actual",  label: "Actual" },
  { value: "double",  label: "Double" },
  { value: "adjust",  label: "Adjust" },
];
const PAYMENT_MODE_OPTIONS = [
  { value: "actual",      label: "Actual" },
  { value: "compliance",  label: "Compliances" },
  { value: "both",        label: "Both" },
];
const DIFF_ADJ_OPTIONS = [
  { value: "carry_fwd",   label: "Carry Fwd" },
  { value: "fooding",     label: "Fooding" },
  { value: "advance",     label: "Advance" },
  { value: "incentive",   label: "Incentive" },
  { value: "reward_rec",  label: "Reward & Recognition" },
];
const STATUTORY_OPTIONS = [
  { value: "actual",    label: "Actual" },
  { value: "exempted",  label: "Exempted" },
  { value: "ctc",       label: "CTC" },
  { value: "na",        label: "N/A" },
];
const BONUS_OPTIONS = [
  { value: "na",       label: "N/A" },
  { value: "actual",   label: "Actual" },
  { value: "monthly",  label: "Monthly" },
  { value: "annual",   label: "Annual" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmployeeSetup {
  employeeId:      string;
  employeeCode:    string;
  employeeName:    string;
  empDepartment:   string;
  empDesignation:  string;
  pfApplicable:    boolean;
  esicApplicable:  boolean;
  lwfApplicable:   boolean;
  setupId:         string | null;
  department:      string;
  designation:     string;
  weeklyOff:       string;
  otType:          string;
  paymentMode:     string;
  diffAdjustments: string[];
  pfType:          string;
  esicType:        string;
  lwfType:         string;
  bonusType:       string;
  basicSalary:     string;
  grossSalary:     string;
  sameAsActual:    boolean;
  originalBasicSalary: number;
  originalGrossSalary: number;
  wageGradeId:     string;
  wageGradeName:   string;
  gradeMinWage:    number;
  allowances:      string;
}

interface EmployeeRow {
  employeeId:   string;
  employeeCode: string;
  employeeName: string;
  department:   string;
  designation:  string;
  monDays:      number;
  payDays:      number;
  structureGross: number;
  rBasic:  number; rHra: number; rConv: number; rTotal: number;
  eBasic:  number; eHra: number; eConv: number; eOth: number; bonus: number; eTotal: number;
  pfType: string; esicType: string; lwfType: string; bonusType: string; diffAdj: string;
  otType: string;
  pf: number; vpf: number; esic: number; lwf: number; tds: number; pt: number; otherDed: number; loanAdv: number; dTotal: number; netPay: number;
  prevBal: number;
  paymentMode: string;
  originalAttendance:   number;
  originalOtHours:      string;
  originalBasicSalary:  number;
  originalGrossSalary:  number;
  originalNetSalary:    number;
  adjustment: {
    id: string;
    complianceType: string;
    partyName: string;
    adjustedAttendance:   number | null;
    adjustedOtHours:      string | null;
    adjustedBasicSalary:  number | null;
    adjustedGrossSalary:  number | null;
    adjustedNetSalary:    number | null;
    remarks:  string | null;
    status:   string;
  } | null;
}

interface EditState {
  adjustedAttendance:   string;
  adjustedOtHours:      string;
  adjustedBasicSalary:  string;
  adjustedGrossSalary:  string;
  adjustedNetSalary:    string;
  remarks: string;
}

interface WorkmenEmployee {
  serialNo: number; employeeCode: string; name: string; age: string; sex: string;
  fatherHusbandName: string; wagesPeriod: string; designation: string;
  permanentAddress: string; presentAddress: string; dateOfJoining: string; dateOfLeaving: string;
}
interface WorkmenRegisterData {
  company: { name: string; address: string };
  client: {
    client_name: string | null; client_address: string | null;
    principal_employer_name: string | null; principal_employer_address: string | null;
    nature_of_work: string | null; location_of_work: string | null;
    project_start_date: string | null;
  } | null;
  employees: WorkmenEmployee[];
}

type ClientInfo = {
  client_name?: string | null; client_address?: string | null;
  principal_employer_name?: string | null; principal_employer_address?: string | null;
  nature_of_work?: string | null; location_of_work?: string | null;
  project_name?: string | null; project_start_date?: string | null; project_end_date?: string | null;
} | null;

interface FormVIIIData {
  company: { name: string; address: string };
  client: ClientInfo;
  month: string; year: string;
  totalWages: number; disbursedWages: number; maxWorkmen: number;
}

interface MusterEmp {
  serialNo: number; name: string; fatherHusbandName: string;
  gender: string; designation: string;
  attendance: Record<number, string>;
  presentDays: number; woHd: number; netPayDays: number;
}
interface MusterRollData {
  company: { name: string; address: string };
  client: ClientInfo;
  month: string; year: string; daysInMonth: number;
  employees: MusterEmp[];
}

interface WagesEmp {
  serialNo: number; name: string; fatherHusbandName: string;
  designation: string; payDays: number; workingDays: number; monthlyRate: number;
  setupBasic: number; setupHra: number;
  basicSalary: number; hra: number; conveyance: number;
  medicalAllowance: number; specialAllowance: number;
  otherAllowances: number; bonus: number; totalEarnings: number;
  pf: number; esi: number; pt: number; lwf: number;
  tds: number; loanDeduction: number; otherDeductions: number;
  totalDeductions: number; netSalary: number;
}
interface WagesRegisterData {
  company: { name: string; address: string };
  client: ClientInfo;
  month: string; year: string;
  employees: WagesEmp[];
}

interface OTEmp {
  serialNo: number; name: string; designation: string;
  normalDays: number; otDays: number; otHours: number;
  normalWages: number; otWages: number;
}
interface OTRegisterData {
  company: { name: string; address: string };
  client: ClientInfo;
  month: string; year: string;
  employees: OTEmp[];
}

interface ClraPackageData {
  viii:  FormVIIIData;
  ix:    WorkmenRegisterData;
  xii:   MusterRollData;
  xiii:  WagesRegisterData;
  xviii: OTRegisterData;
}

const fmt = (n: number | null | undefined) =>
  n != null ? `Rs.${n.toLocaleString("en-IN")}` : "-";

const diff = (orig: number, adj: number | null | undefined) => {
  if (adj == null || adj === orig) return null;
  const d = adj - orig;
  return { d, up: d > 0 };
};

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
      fetch("/api/compliance/companies", { credentials: "include" })
        .then(r => r.json())
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
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-600 rounded-lg">
          <ShieldCheck className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance Management</h1>
          <p className="text-sm text-gray-500">Configure employee-wise statutory settings and manage compliance adjustments</p>
        </div>
      </div>

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

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1 — Employee Compliance Setup
// ═══════════════════════════════════════════════════════════════════════════════
function EmployeeSetupTab({ companyId, isSuperAdmin, toast }: {
  companyId: string; isSuperAdmin: boolean; toast: any;
}) {
  const [rows, setRows] = useState<EmployeeSetup[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<EmployeeSetup | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const { sort, toggle } = useSort("employeeName", "asc");

  // ── Shared 13-column header + row builder ─────────────────────────────────
  // Columns 1-5 are reference-only (key + info). Columns 6-13 are editable config.
  const CONFIG_HEADERS = [
    "Emp Code",          // 1  — upload key (read-only)
    "Employee Name",     // 2  — ref only
    "Gross Wages",       // 3  — ref only (actual salary structure gross)
    "Grade",             // 4  — ref only
    "Grade Rate",        // 5  — ref only (grade minimum wage)
    "Allowances",        // 6  — editable
    "Same As Actual",    // 7  — editable (TRUE/FALSE)
    "Payment Mode",      // 8  — editable
    "PF Type",           // 9  — editable
    "ESIC Type",         // 10 — editable
    "LWF Type",          // 11 — editable
    "Bonus Type",        // 12 — editable
    "OT Type",           // 13 — editable
  ];
  const buildRow = (r: EmployeeSetup) => [
    r.employeeCode,
    r.employeeName,
    r.originalGrossSalary || 0,
    r.wageGradeName || "",
    r.gradeMinWage || 0,
    r.allowances || "",
    String(r.sameAsActual),
    r.paymentMode || "actual",
    r.pfType    || "actual",
    r.esicType  || "actual",
    r.lwfType   || "na",
    r.bonusType || "actual",
    r.otType    || "na",
  ];

  // ── Download Excel template (pre-filled with current values, ready to edit) ─
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([CONFIG_HEADERS, ...rows.map(buildRow)]);
    ws["!cols"] = CONFIG_HEADERS.map((h, i) =>
      ({ wch: i < 2 ? 22 : i < 5 ? 16 : Math.max(h.length + 4, 16) })
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compliance Config");
    XLSX.writeFile(wb, `compliance_config_template.xlsx`);
    toast({ title: "Template downloaded", description: "Edit columns 6-13 and re-upload." });
  };

  // ── Download current config as Excel ──────────────────────────────────────
  const downloadConfig = () => {
    const ws = XLSX.utils.aoa_to_sheet([CONFIG_HEADERS, ...rows.map(buildRow)]);
    ws["!cols"] = CONFIG_HEADERS.map((h, i) =>
      ({ wch: i < 2 ? 22 : i < 5 ? 16 : Math.max(h.length + 4, 16) })
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compliance Config");
    XLSX.writeFile(wb, `compliance_config_export.xlsx`);
    toast({ title: "Downloaded", description: `${rows.length} employee(s) config exported.` });
  };

  // ── Bulk upload handler ────────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadRef.current) uploadRef.current.value = "";
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (raw.length < 2) throw new Error("No data rows found in file.");
      const hdrs: string[] = (raw[0] as string[]).map(h => String(h).trim().toLowerCase());

      const col = (name: string) => hdrs.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
      const iCode  = col("emp code");
      const iAllow = col("allowances");
      const iSame  = col("same as actual");
      const iPay   = col("payment mode");
      const iPf    = col("pf type");
      const iEsic  = col("esic type");
      const iLwf   = col("lwf type");
      const iBonus = col("bonus type");
      const iOt    = col("ot type");

      if (iCode < 0) throw new Error("Column 'Emp Code' not found. Use the downloaded template.");

      // Build lookup map: empCode → existing setup row
      const codeMap: Record<string, EmployeeSetup> = {};
      for (const r of rows) codeMap[r.employeeCode.trim().toLowerCase()] = r;

      const setups: any[] = [];
      for (let i = 1; i < raw.length; i++) {
        const row = raw[i] as any[];
        const code = String(row[iCode] || "").trim().toLowerCase();
        if (!code) continue;
        const match = codeMap[code];
        if (!match) continue; // skip unknown codes

        const sameRaw = String(row[iSame] ?? "").trim().toLowerCase();
        const sameAs  = sameRaw === "true" || sameRaw === "1" || sameRaw === "yes";

        setups.push({
          employeeId:      match.employeeId,
          department:      match.department,
          designation:     match.designation,
          weeklyOff:       match.weeklyOff || "sunday",
          allowances:      iAllow >= 0 ? String(row[iAllow] ?? "").trim() : match.allowances,
          sameAsActual:    iSame  >= 0 ? sameAs : match.sameAsActual,
          paymentMode:     iPay   >= 0 ? String(row[iPay]   || "actual").trim() : match.paymentMode,
          pfType:          iPf    >= 0 ? String(row[iPf]    || "actual").trim() : match.pfType,
          esicType:        iEsic  >= 0 ? String(row[iEsic]  || "actual").trim() : match.esicType,
          lwfType:         iLwf   >= 0 ? String(row[iLwf]   || "na").trim()     : match.lwfType,
          bonusType:       iBonus >= 0 ? String(row[iBonus] || "actual").trim() : match.bonusType,
          otType:          iOt    >= 0 ? String(row[iOt]    || "na").trim()     : match.otType,
          diffAdjustments: match.diffAdjustments,
          basicSalary:     match.basicSalary,
          grossSalary:     match.grossSalary,
          wageGradeId:     match.wageGradeId,
        });
      }

      if (setups.length === 0) throw new Error("No matching employees found — check Emp Code column.");

      const res = await fetch("/api/compliance/setup/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyId, setups }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Server error (${res.status})`);
      }
      toast({ title: "Upload successful", description: `${setups.length} employee(s) updated.` });
      load();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setUploading(false);
  };

  const load = useCallback(async (attempt = 0) => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/compliance/setup?companyId=${companyId}`, { credentials: "include" });
      const text = await res.text();
      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        try { errMsg = JSON.parse(text).error || errMsg; } catch {}
        throw new Error(errMsg);
      }
      let data: EmployeeSetup[];
      try {
        data = JSON.parse(text);
      } catch {
        // Server returned non-JSON (likely mid-HMR reload) — auto-retry once
        if (attempt < 2) {
          setLoading(false);
          setTimeout(() => load(attempt + 1), 800);
          return;
        }
        throw new Error("Server returned invalid data — click Retry");
      }
      setRows(data);
      setLoaded(true);
    } catch (e: any) {
      setLoadError(e.message);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { if (companyId) load(); }, [companyId, load]);

  // When a saved record comes back from the form, update the list
  const onSaved = (updated: EmployeeSetup) => {
    setRows(prev => prev.map(r => r.employeeId === updated.employeeId ? updated : r));
    setSelected(updated);
  };

  // ── List view
  if (!selected) {
    const filtered = sortData(
      rows.filter(r =>
        !search ||
        r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
        r.employeeCode.toLowerCase().includes(search.toLowerCase())
      ),
      sort,
      (row, col) => {
        if (col === "employeeCode")  return row.employeeCode;
        if (col === "employeeName")  return row.employeeName;
        if (col === "grossSalary")   return Number(row.grossSalary) > 0 ? Number(row.grossSalary) : row.originalGrossSalary;
        if (col === "wageGradeName") return row.wageGradeName;
        if (col === "pfType")        return row.pfType;
        if (col === "esicType")      return row.esicType;
        if (col === "lwfType")       return row.lwfType;
        if (col === "bonusType")     return row.bonusType;
        if (col === "status")        return row.setupId ? "configured" : "not set";
        return null;
      }
    );

    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg">Employee-wise Compliance Setup</CardTitle>
              <CardDescription>Click Configure to set statutory & payroll rules per employee.</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={!loaded || rows.length === 0}
                title="Download blank Excel template pre-filled with employee list">
                <FileSpreadsheet className="h-4 w-4 mr-1 text-green-600" /> Download Template
              </Button>
              <Button variant="outline" size="sm" onClick={downloadConfig} disabled={!loaded || rows.length === 0}
                title="Download current compliance configuration as Excel">
                <Download className="h-4 w-4 mr-1 text-blue-600" /> Download Config
              </Button>
              <Button variant="outline" size="sm"
                disabled={!loaded || uploading}
                onClick={() => uploadRef.current?.click()}
                title="Upload filled Excel to apply bulk compliance configuration">
                {uploading
                  ? <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Uploading...</>
                  : <><Upload className="h-4 w-4 mr-1 text-violet-600" /> Bulk Upload</>}
              </Button>
              <input ref={uploadRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
              <Button variant="outline" size="sm" onClick={load} disabled={loading || !companyId}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search employee..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 w-64 text-sm"
            />
            <span className="text-sm text-gray-400">{filtered.length} employee(s)</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && (
            <div className="text-center py-12 text-gray-400">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p>Loading employees...</p>
            </div>
          )}
          {!loading && loadError && (
            <div className="text-center py-12">
              <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
              <p className="text-gray-600 font-medium mb-1">Failed to load employee setup</p>
              <p className="text-sm text-gray-400 mb-4">{loadError}</p>
              <Button size="sm" onClick={load} className="bg-blue-600 hover:bg-blue-700 text-white">
                <RefreshCw className="h-4 w-4 mr-2" /> Retry
              </Button>
            </div>
          )}
          {!loading && !loadError && !loaded && (
            <div className="text-center py-12 text-gray-400">
              {companyId ? <><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading...</> : "Select a company above"}
            </div>
          )}
          {loaded && filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">No employees found</div>
          )}
          {loaded && filtered.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 text-xs">
                  <SortableHead col="employeeCode" sort={sort} onToggle={toggle} className="font-semibold w-28">Code</SortableHead>
                  <SortableHead col="employeeName" sort={sort} onToggle={toggle} className="font-semibold">Employee Name</SortableHead>
                  <SortableHead col="grossSalary"  sort={sort} onToggle={toggle} className="font-semibold text-right">Gross Salary</SortableHead>
                  <SortableHead col="wageGradeName" sort={sort} onToggle={toggle} className="font-semibold">Grade</SortableHead>
                  <SortableHead col="pfType"       sort={sort} onToggle={toggle} className="font-semibold">PF</SortableHead>
                  <SortableHead col="esicType"     sort={sort} onToggle={toggle} className="font-semibold">ESIC</SortableHead>
                  <SortableHead col="lwfType"      sort={sort} onToggle={toggle} className="font-semibold">LWF</SortableHead>
                  <SortableHead col="bonusType"    sort={sort} onToggle={toggle} className="font-semibold">Bonus</SortableHead>
                  <SortableHead col="status"       sort={sort} onToggle={toggle} className="font-semibold">Status</SortableHead>
                  <TableHead className="w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(row => (
                  <TableRow key={row.employeeId} className="hover:bg-gray-50">
                    <TableCell className="text-xs font-mono text-gray-500">{row.employeeCode}</TableCell>
                    <TableCell className="font-medium text-gray-800">{row.employeeName}</TableCell>
                    <TableCell className="text-right font-medium text-gray-800">
                      {(Number(row.grossSalary) > 0 ? Number(row.grossSalary) : row.originalGrossSalary).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                      {row.wageGradeName || <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{row.pfType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{row.esicType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{row.lwfType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{row.bonusType}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.setupId ? (
                        <Badge className="bg-green-100 text-green-700 text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />Configured
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-400 text-xs">Not set</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => setSelected({ ...row })}
                      >
                        <Settings2 className="h-3 w-3 mr-1" /> Configure
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Detail / form view
  return (
    <SetupForm
      setup={selected}
      companyId={companyId}
      onBack={() => setSelected(null)}
      onSaved={onSaved}
      toast={toast}
    />
  );
}

// ─── Constants for compliance ceilings ────────────────────────────────────────
const PF_CEILING   = 15000;
const ESIC_CEILING = 21000;

// ─── Shared helper: compute adjusted pay-days for compliance rate calculation ──
//
// ONLY called when at least one type is non-actual (na/exempted/ctc).
// In that case we back-calculate days from the deduction amounts so the
// compliance-rate earned columns stay consistent with the actual deductions.
//
// rBasic = grade minimum wage (admin-configured)
// rTotal = rBasic + rHra  (compliance wage rate)
//
// PF  = 12%   × min(rBasic × D/monDays, 15,000)  → linear below ₹1,800 ceiling
// ESIC = 0.75% × min(rTotal × D/monDays, 21,000) → linear below ₹157.5 ceiling
//
// Priority:
//   1. PF  < ₹1,800  → D = pf   × monDays / (0.12   × rBasic)  (exact)
//      PF  ≥ ₹1,800  → ceiling hit → full month (Indian payroll standard)
//   2. ESIC < ₹157.5 → D = esic × monDays / (0.0075 × rTotal)  (exact)
//   3. eBasic back-calc → D = eBasic × monDays / rBasic (no bonus/deduction distortion)
//   4. Hard cap: result ≤ monDays
function computeAdjPayDays(
  pfType: string, esicType: string,
  pf: number, esic: number,
  rBasic: number, rTotal: number,
  monDays: number, payDays: number,
  eBasic: number = 0
): number {
  if (monDays <= 0) return payDays;

  const PF_CEIL_AMT   = 0.12   * PF_CEILING;   // ₹1,800
  const ESIC_CEIL_AMT = 0.0075 * ESIC_CEILING; // ₹157.5

  // Step 1 — PF
  // Below ceiling: back-calc exact days. At ceiling: full-month CTC basis (EPFO standard).
  let pfDays: number | null = null;
  if (pfType === "actual" && pf > 0 && rBasic > 0) {
    if (pf < PF_CEIL_AMT) {
      pfDays = Math.min(monDays, Math.max(0, Math.round(pf * monDays / (0.12 * rBasic))));
    } else {
      pfDays = monDays; // ceiling hit → full month
    }
  }

  // Step 2 — ESIC: usable only when deducted amount is below ceiling
  let esicDays: number | null = null;
  if (esicType === "actual" && esic > 0 && esic < ESIC_CEIL_AMT && rTotal > 0) {
    esicDays = Math.min(monDays, Math.max(0, Math.round(esic * monDays / (0.0075 * rTotal))));
  }

  let result: number;
  if (pfDays !== null && esicDays !== null) {
    result = Math.round((pfDays + esicDays) / 2);
  } else if (pfDays !== null) {
    result = pfDays;
  } else if (esicDays !== null) {
    result = esicDays;
  } else {
    // Step 3 — Absolute fallback: assume full calendar month.
    // When no PF/ESIC signal, netPay is the reliable source of truth.
    // computeNetPayMaxDays (called at every site) will cap adjPayDays appropriately.
    result = monDays;
  }

  return Math.min(result, monDays);
}

// Returns the maximum compliance pay-days that keeps compPayable ≤ netPay.
// When the compliance minimum (rate × days + bonus) would exceed what the employer
// actually paid, we reduce adjPayDays so the check stays within actual payment.
function computeNetPayMaxDays(
  netPay: number, totalDeds: number,
  rTotal: number, monDays: number,
  bonusType: string, bonus: number
): number {
  if (rTotal <= 0 || netPay <= 0 || monDays <= 0) return monDays;
  const monthlyBonus = Math.round(rTotal * 8.33 / 100);
  const bt = bonusType || "actual";
  if (bt === "monthly") {
    // Bonus prorates with days: both basic and bonus scale together, so floor is safe —
    // any overshoot from rounding up would push compPayable above netPay.
    const denom = rTotal + monthlyBonus;
    return denom > 0 ? Math.floor((netPay + totalDeds) * monDays / denom) : monDays;
  }
  // Fixed bonus (actual/annual/na): use Math.round to avoid float-precision under-count.
  // e.g. 8.9995 from payroll rounding must become 9, not 8 (Math.floor).
  const fixedBonus = bt === "na" ? 0 : bt === "annual" ? monthlyBonus : Math.min(bonus, monthlyBonus);
  const available   = netPay + totalDeds - fixedBonus;
  return available > 0 ? Math.round(available * monDays / rTotal) : 0;
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────
function MultiSelect({
  options, selected, onChange, placeholder = "Select...", disabled = false,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (val: string) => {
    if (disabled) return;
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };
  const label = selected.length === 0
    ? placeholder
    : selected.map(v => options.find(o => o.value === v)?.label).filter(Boolean).join(", ");
  return (
    <div className="relative">
      {open && !disabled && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        className={`w-full h-10 px-3 py-2 text-sm text-left border rounded-md flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          disabled
            ? "bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed opacity-70"
            : "bg-white border-gray-300 hover:bg-gray-50"
        }`}
      >
        <span className={`truncate ${selected.length === 0 ? "text-gray-400" : disabled ? "text-gray-600" : "text-gray-900"}`}>{label}</span>
        <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
      </button>
      {open && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1">
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer select-none">
              <Checkbox
                checked={selected.includes(o.value)}
                onCheckedChange={() => toggle(o.value)}
              />
              <span className="text-sm text-gray-800">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Per-employee Setup Form ──────────────────────────────────────────────────
function SetupForm({ setup, companyId, onBack, onSaved, toast }: {
  setup: EmployeeSetup;
  companyId: string;
  onBack: () => void;
  onSaved: (u: EmployeeSetup) => void;
  toast: any;
}) {
  const [form, setForm] = useState<EmployeeSetup>({ ...setup });
  const [saving, setSaving] = useState(false);

  // Fetch wage grades for this company
  const { data: wageGrades = [] } = useQuery<any[]>({
    queryKey: ["/api/wage-grades", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/wage-grades?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const set = (field: keyof EmployeeSetup, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // ── Derived limits for Basic (PF) and Gross (ESIC) ────────────────────────
  const actualBasic = setup.originalBasicSalary || 0;
  const actualGross = setup.originalGrossSalary || 0;
  const autoAllowances = actualGross - actualBasic;

  // ── PF type change: if switching to "actual", check payroll applicability ──
  const onPfTypeChange = (v: string) => {
    if (v === "actual" && !setup.pfApplicable) {
      toast({ title: "Not allowed", description: "PF Actual requires PF to be enabled in payroll settings.", variant: "destructive" });
      return;
    }
    set("pfType", v);
  };
  const onEsicTypeChange = (v: string) => {
    if (v === "actual" && !setup.esicApplicable) {
      toast({ title: "Not allowed", description: "ESIC Actual requires ESIC to be enabled in payroll settings.", variant: "destructive" });
      return;
    }
    set("esicType", v);
  };
  const onLwfTypeChange = (v: string) => {
    if (v === "actual" && !setup.lwfApplicable) {
      toast({ title: "Not allowed", description: "LWF Actual requires LWF to be enabled in payroll settings.", variant: "destructive" });
      return;
    }
    set("lwfType", v);
  };

  // ── Same As Actual: clear manual allowances ───────────────────────────────
  const onSameAsActualChange = (checked: boolean) => {
    setForm(prev => ({ ...prev, sameAsActual: checked, allowances: checked ? "" : prev.allowances }));
  };

  // ── OT hint ───────────────────────────────────────────────────────────────
  const otHints: Record<string, string> = {
    actual: "Same OT hours & amount as payroll",
    double: "OT hours ÷ 2, same OT amount",
    adjust: "OT hours & amount = 0; added to net pay",
    na: "No OT",
  };

  const save = async () => {

    setSaving(true);
    try {
      const res = await fetch(`/api/compliance/setup/${form.employeeId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          department:      form.department,
          designation:     form.designation,
          weeklyOff:       form.weeklyOff,
          otType:          form.otType,
          paymentMode:     form.paymentMode,
          diffAdjustments: form.diffAdjustments,
          pfType:          form.pfType,
          esicType:        form.esicType,
          lwfType:         form.lwfType,
          bonusType:       form.bonusType,
          sameAsActual:    form.sameAsActual,
          wageGradeId:     form.wageGradeId,
          allowances:      form.sameAsActual ? "" : form.allowances,
        }),
      });
      if (!res.ok) { let _e = `Server error (${res.status})`; try { const _j = await res.json(); _e = _j.error || _e; } catch {} throw new Error(_e); }
      toast({ title: "Saved", description: `Setup saved for ${form.employeeName}` });
      onSaved({ ...form, setupId: form.setupId || "saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // Grade's minimum wage → auto-compute allowances
  const selectedGrade = wageGrades.find((g: any) => g.id === form.wageGradeId);
  const gradeMinWage  = selectedGrade ? Number(selectedGrade.minimum_wage || 0) : 0;
  const gradeAllowances = gradeMinWage > 0 ? Math.max(0, actualGross - gradeMinWage) : autoAllowances;

  const Badge = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      ok ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-500 ring-1 ring-red-200"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-400"}`} />
      {label}
    </span>
  );

  return (
    <div className="space-y-5">
      {/* ── Header card ── */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <CardContent className="py-4 px-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-200 font-medium uppercase tracking-wide mb-0.5">Compliance Setup</p>
              <h2 className="text-xl font-bold leading-tight">{form.employeeName}</h2>
              <p className="text-sm text-blue-200 mt-0.5">{form.employeeCode}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <Badge ok={setup.pfApplicable}   label="PF" />
                <Badge ok={setup.esicApplicable} label="ESIC" />
                <Badge ok={setup.lwfApplicable}  label="LWF" />
              </div>
              <Button variant="outline" size="sm" onClick={onBack}
                className="border-white/40 text-white hover:bg-white/10 bg-transparent h-8 text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 1: Grade & Attendance ── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 pt-4 px-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Grade & Attendance</p>
        </CardHeader>
        <CardContent className="px-6 pb-5 space-y-4">
          <div className="grid grid-cols-3 gap-5">
            {/* Grade */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Wage Grade</Label>
              <Select
                value={form.wageGradeId || "none"}
                onValueChange={v => {
                  const gradeId = v === "none" ? "" : v;
                  const grade = wageGrades.find((g: any) => g.id === gradeId);
                  const minWage = grade ? Number(grade.minimum_wage || 0) : 0;
                  set("wageGradeId", gradeId);
                  set("wageGradeName", grade ? `${grade.name}${grade.state ? ` - ${grade.state}` : ""}` : "");
                  if (!form.sameAsActual && minWage > 0) {
                    set("allowances", String(Math.max(0, actualGross - minWage)));
                  }
                }}
              >
                <SelectTrigger className="h-10 bg-gray-50 border-gray-200 focus:bg-white">
                  <SelectValue placeholder="Select grade..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No Grade —</SelectItem>
                  {wageGrades.map((g: any) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}{g.state ? ` - ${g.state}` : ""}
                      {g.minimum_wage ? ` (₹${Number(g.minimum_wage).toLocaleString()})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {gradeMinWage > 0 && (
                <p className="text-xs text-blue-600">Min. Wage: ₹{gradeMinWage.toLocaleString()}</p>
              )}
            </div>

            {/* Allowances — right after Grade */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">
                Allowances
                {gradeAllowances > 0 && !form.sameAsActual && (
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">
                    (auto: ₹{gradeAllowances.toLocaleString()})
                  </span>
                )}
              </Label>
              <Input
                value={form.sameAsActual ? "" : form.allowances}
                disabled={form.sameAsActual}
                onChange={e => set("allowances", e.target.value)}
                placeholder={form.sameAsActual ? "Auto — uses payroll values" : gradeAllowances > 0 ? `₹${gradeAllowances.toLocaleString()}` : "e.g. 5000"}
                className="h-10 bg-gray-50 border-gray-200 focus:bg-white disabled:bg-gray-100 disabled:text-gray-400"
              />
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="sameAsActual"
                  checked={form.sameAsActual}
                  onCheckedChange={onSameAsActualChange}
                  className="h-3.5 w-3.5"
                />
                <label htmlFor="sameAsActual" className="text-xs text-gray-500 cursor-pointer select-none">
                  Same as actual payroll
                </label>
              </div>
            </div>

            {/* Weekly Off */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Weekly Off</Label>
              <Select value={form.weeklyOff} onValueChange={v => set("weeklyOff", v)}>
                <SelectTrigger className="h-10 bg-gray-50 border-gray-200 focus:bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{WEEKLY_OFF_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Payment Settings ── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 pt-4 px-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Payment Settings</p>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          <div className="grid grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">OT Treatment</Label>
              <Select value={form.otType} onValueChange={v => set("otType", v)}>
                <SelectTrigger className="h-10 bg-gray-50 border-gray-200 focus:bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="na">NA — No OT</SelectItem>
                  <SelectItem value="actual">Actual — Same hours & amount</SelectItem>
                  <SelectItem value="double">Double — Hours ÷ 2, same amount</SelectItem>
                  <SelectItem value="adjust">Adjust — OT = 0, added to net pay</SelectItem>
                </SelectContent>
              </Select>
              {form.otType && otHints[form.otType] && (
                <p className="text-xs text-blue-600">{otHints[form.otType]}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Payment Mode <span className="text-red-500">*</span></Label>
              <Select value={form.paymentMode} onValueChange={v => {
                set("paymentMode", v);
                if (v === "compliance") set("diffAdjustments", ["carry_fwd"]);
              }}>
                <SelectTrigger className="h-10 bg-gray-50 border-gray-200 focus:bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_MODE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Diff Adjustment <span className="text-red-500">*</span></Label>
              <MultiSelect
                options={DIFF_ADJ_OPTIONS}
                selected={form.paymentMode === "compliance" ? ["carry_fwd"] : form.diffAdjustments}
                onChange={vals => { if (form.paymentMode !== "compliance") set("diffAdjustments", vals); }}
                placeholder="Select adjustments..."
                disabled={form.paymentMode === "compliance"}
              />
              {form.paymentMode === "compliance" && (
                <p className="text-xs text-amber-600">Locked to Carry Fwd</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Statutory Deductions ── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 pt-4 px-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Statutory Deductions</p>
        </CardHeader>
        <CardContent className="px-6 pb-5 space-y-4">
          <div className="grid grid-cols-4 gap-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">PF <span className="text-red-500">*</span></Label>
              <Select value={form.pfType} onValueChange={onPfTypeChange}>
                <SelectTrigger className="h-10 bg-gray-50 border-gray-200 focus:bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="actual" disabled={!setup.pfApplicable}>
                    Actual {!setup.pfApplicable && "(not enabled)"}
                  </SelectItem>
                  <SelectItem value="exempted">Exempted</SelectItem>
                  <SelectItem value="ctc">CTC Mode</SelectItem>
                  <SelectItem value="na">N/A</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">ESIC</Label>
              <Select value={form.esicType} onValueChange={onEsicTypeChange}>
                <SelectTrigger className="h-10 bg-gray-50 border-gray-200 focus:bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="actual" disabled={!setup.esicApplicable}>
                    Actual {!setup.esicApplicable && "(not enabled)"}
                  </SelectItem>
                  <SelectItem value="exempted">Exempted</SelectItem>
                  <SelectItem value="ctc">CTC Mode</SelectItem>
                  <SelectItem value="na">N/A</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">LWF</Label>
              <Select value={form.lwfType} onValueChange={onLwfTypeChange}>
                <SelectTrigger className="h-10 bg-gray-50 border-gray-200 focus:bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="na">N/A</SelectItem>
                  <SelectItem value="actual" disabled={!setup.lwfApplicable}>
                    Actual {!setup.lwfApplicable && "(not enabled)"}
                  </SelectItem>
                  <SelectItem value="exempted">Exempted</SelectItem>
                  <SelectItem value="ctc">CTC Mode</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Bonus</Label>
              <Select value={form.bonusType || "actual"} onValueChange={v => set("bonusType", v)}>
                <SelectTrigger className="h-10 bg-gray-50 border-gray-200 focus:bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>{BONUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* CTC note */}
          {(form.pfType === "ctc" || form.esicType === "ctc" || form.lwfType === "ctc") && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-700 flex items-start gap-2">
              <span className="mt-0.5 text-amber-500">ℹ</span>
              <span><strong>CTC mode:</strong> Deduction is shown in compliance sheet but not deducted from net pay.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Actions ── */}
      <div className="flex items-center gap-3 pb-4">
        <Button onClick={save} disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 h-10 shadow-sm">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Setup"}
        </Button>
        <Button variant="outline" onClick={onBack} className="px-6 h-10">Cancel</Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2 — Adjustments Workbench (existing feature)
// ═══════════════════════════════════════════════════════════════════════════════
function AdjustmentsTab({ companyId, isSuperAdmin, user, toast }: {
  companyId: string; isSuperAdmin: boolean; user: any; toast: any;
}) {
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));
  const [complianceType, setComplianceType] = useState("PF");
  const [partyName, setPartyName] = useState("");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteEmpName, setDeleteEmpName] = useState("");
  const { sort: adjSort, toggle: adjToggle } = useSort("employeeName", "asc");

  const loadEmployees = useCallback(async () => {
    if (!companyId) { toast({ title: "Select a company", variant: "destructive" }); return; }
    setLoading(true);
    setLoaded(false);
    setEdits({});
    setDirty(new Set());
    try {
      const res = await fetch(
        `/api/compliance/employees?companyId=${companyId}&month=${selectedMonth}&year=${selectedYear}`,
        { credentials: "include" }
      );
      if (!res.ok) { let _e = `Server error (${res.status})`; try { const _j = await res.json(); _e = _j.error || _e; } catch {} throw new Error(_e); }
      const data: EmployeeRow[] = await res.json();
      setRows(data);
      const initEdits: Record<string, EditState> = {};
      for (const row of data) {
        // OT hours adjusted per otType rule (rules 9-11)
        const rawOt = parseFloat(row.originalOtHours || "0");
        const otByType = row.otType === "adjust" ? "0.00"
          : row.otType === "double" ? (rawOt / 2).toFixed(2)
          : row.originalOtHours; // actual / na → as-is
        initEdits[row.employeeId] = {
          adjustedAttendance:   row.adjustment?.adjustedAttendance  != null ? String(row.adjustment.adjustedAttendance)  : String(row.originalAttendance),
          adjustedOtHours:      row.adjustment?.adjustedOtHours     ?? otByType,
          adjustedBasicSalary:  row.adjustment?.adjustedBasicSalary != null ? String(row.adjustment.adjustedBasicSalary)  : String(row.originalBasicSalary),
          adjustedGrossSalary:  row.adjustment?.adjustedGrossSalary != null ? String(row.adjustment.adjustedGrossSalary)  : String(row.originalGrossSalary),
          adjustedNetSalary:    row.adjustment?.adjustedNetSalary   != null ? String(row.adjustment.adjustedNetSalary)    : String(row.originalNetSalary),
          remarks:              row.adjustment?.remarks              ?? "",
        };
      }
      setEdits(initEdits);
      setLoaded(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [companyId, selectedMonth, selectedYear, toast]);

  // Auto-save carry-forward amounts whenever rows are loaded
  // This persists the current month's Carry Fwd so next month can read it as Prev Bal
  useEffect(() => {
    if (!loaded || !companyId || rows.length === 0) return;
    const PF_CEILING   = 15000;
    const ESIC_CEILING = 21000;
    const adjDedLocal = (val: number, type: string | undefined) =>
      (type === "na" || type === "exempted" || type === "ctc") ? 0 : val;
    const data = rows.map(r => {
      const ap = adjDedLocal(r.pf,   r.pfType   || "actual");
      const ae = adjDedLocal(r.esic, r.esicType || "actual");
      const al = adjDedLocal(r.lwf,  r.lwfType  || "actual");
      const totalDeds = ap + ae + al + r.pt + r.tds + (r.vpf || 0);
      const totalDedsC = ap + ae + al + r.pt + r.tds + (r.vpf || 0);
      const eDaysC0 = r.eTotal > 0 ? computeAdjPayDays(
        r.pfType || "actual", r.esicType || "actual",
        ap, ae, r.rBasic, r.rTotal, r.monDays, r.payDays, r.eBasic
      ) : 0;
      let eDaysC = Math.min(eDaysC0, computeNetPayMaxDays(r.netPay, totalDedsC, r.rTotal, r.monDays, r.bonusType || "actual", r.bonus));
      const btC = r.bonusType || "actual";
      const mbC = Math.round(r.rTotal * 8.33 / 100);
      let ebC = r.monDays > 0 ? Math.round(r.rBasic * eDaysC / r.monDays) : 0;
      let ehC = r.monDays > 0 ? Math.round(r.rHra   * eDaysC / r.monDays) : 0;
      let bcC = btC === "na" ? 0 : btC === "actual" ? Math.min(r.bonus, mbC) : btC === "annual" ? mbC : (r.monDays > 0 ? Math.round(mbC * eDaysC / r.monDays) : 0);
      let etC = ebC + ehC + bcC;
      let compPayable = etC - totalDeds;
      if (compPayable > r.netPay && eDaysC > 0) {
        eDaysC -= 1;
        ebC = r.monDays > 0 ? Math.round(r.rBasic * eDaysC / r.monDays) : 0;
        ehC = r.monDays > 0 ? Math.round(r.rHra   * eDaysC / r.monDays) : 0;
        bcC = btC === "na" ? 0 : btC === "actual" ? Math.min(r.bonus, mbC) : btC === "annual" ? mbC : (r.monDays > 0 ? Math.round(mbC * eDaysC / r.monDays) : 0);
        etC = ebC + ehC + bcC;
        compPayable = etC - totalDeds;
      }
      const actualPaid    = r.netPay;
      const pb            = r.prevBal || 0;
      const isCompliance  = (r.paymentMode || "actual") === "compliance";
      let carryFwdAmount  = 0;
      if (isCompliance) {
        // Other Adj = 0; carry forward accumulates
        carryFwdAmount = compPayable - pb - actualPaid;
      } else {
        // Actual / Both: Carry Fwd is always 0
        carryFwdAmount = 0;
      }
      return { employeeId: r.employeeId, carryFwdAmount };
    });
    fetch("/api/compliance/carry-fwd/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ companyId, month: selectedMonth, year: Number(selectedYear), data }),
    }).catch(() => {}); // silent — non-critical background save
  }, [loaded, rows, companyId, selectedMonth, selectedYear]);

  const markDirty = (empId: string, field: keyof EditState, value: string) => {
    setEdits(prev => ({ ...prev, [empId]: { ...prev[empId], [field]: value } }));
    setDirty(prev => new Set(prev).add(empId));
  };

  const saveAll = async () => {
    if (!companyId || dirty.size === 0) return;
    setSaving(true);
    try {
      const adjustments = Array.from(dirty).map(empId => {
        const row = rows.find(r => r.employeeId === empId)!;
        const e = edits[empId];
        return {
          employeeId: empId,
          employeeName: row.employeeName,
          employeeCode: row.employeeCode,
          originalAttendance:   row.originalAttendance,
          originalOtHours:      row.originalOtHours,
          originalBasicSalary:  row.originalBasicSalary,
          originalGrossSalary:  row.originalGrossSalary,
          originalNetSalary:    row.originalNetSalary,
          adjustedAttendance:   e.adjustedAttendance  !== "" ? parseInt(e.adjustedAttendance)  : null,
          adjustedOtHours:      e.adjustedOtHours     || null,
          adjustedBasicSalary:  e.adjustedBasicSalary !== "" ? parseInt(e.adjustedBasicSalary)  : null,
          adjustedGrossSalary:  e.adjustedGrossSalary !== "" ? parseInt(e.adjustedGrossSalary)  : null,
          adjustedNetSalary:    e.adjustedNetSalary   !== "" ? parseInt(e.adjustedNetSalary)    : null,
          remarks: e.remarks || null,
          status: "draft",
        };
      });
      const res = await fetch("/api/compliance/adjustments/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, month: selectedMonth, year: parseInt(selectedYear), complianceType, partyName: partyName || null, adjustments }),
      });
      if (!res.ok) { let _e = `Server error (${res.status})`; try { const _j = await res.json(); _e = _j.error || _e; } catch {} throw new Error(_e); }
      const result = await res.json();
      toast({ title: "Saved", description: `${result.saved} record(s) saved.` });
      setDirty(new Set());
      await loadEmployees();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const finalizeAll = async () => {
    if (!companyId) return;
    if (dirty.size > 0) await saveAll();
    setSaving(true);
    try {
      const draftIds = rows.filter(r => r.adjustment?.status === "draft").map(r => r.adjustment!.id);
      await Promise.all(draftIds.map(id =>
        fetch(`/api/compliance/adjustments/${id}/finalize`, { method: "PATCH", credentials: "include" })
      ));
      toast({ title: "Finalized", description: `${draftIds.length} record(s) finalized.` });
      await loadEmployees();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const deleteAdjustment = async (id: string) => {
    try {
      await fetch(`/api/compliance/adjustments/${id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Deleted" });
      setDeleteId(null);
      await loadEmployees();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const resetRow = (empId: string) => {
    const row = rows.find(r => r.employeeId === empId);
    if (!row) return;
    const rawOt = parseFloat(row.originalOtHours || "0");
    const otByType = row.otType === "adjust" ? "0.00"
      : row.otType === "double" ? (rawOt / 2).toFixed(2)
      : row.originalOtHours;
    setEdits(prev => ({
      ...prev,
      [empId]: {
        adjustedAttendance:   String(row.originalAttendance),
        adjustedOtHours:      otByType,
        adjustedBasicSalary:  String(row.originalBasicSalary),
        adjustedGrossSalary:  String(row.originalGrossSalary),
        adjustedNetSalary:    String(row.originalNetSalary),
        remarks: "",
      },
    }));
    setDirty(prev => { const s = new Set(prev); s.add(empId); return s; });
  };

  const downloadTR = () => {
    const adjDedFn = (val: number, type: string | undefined) =>
      (type === "na" || type === "exempted" || type === "ctc") ? 0 : val;

    const trRows = rows.map(r => {
      const adjPf    = adjDedFn(r.pf,   r.pfType   || "actual");
      const adjEsic  = adjDedFn(r.esic, r.esicType || "actual");
      const adjLwf   = adjDedFn(r.lwf,  r.lwfType  || "actual");
      const totalDeds = adjPf + adjEsic + adjLwf + r.pt + r.tds + (r.vpf || 0);
      const actualPaid = r.netPay;
      const eDaysD0 = r.eTotal > 0 ? computeAdjPayDays(
        r.pfType || "actual", r.esicType || "actual",
        adjPf, adjEsic, r.rBasic, r.rTotal, r.monDays, r.payDays, r.eBasic
      ) : 0;
      let eDaysD = Math.min(eDaysD0, computeNetPayMaxDays(r.netPay, totalDeds, r.rTotal, r.monDays, r.bonusType || "actual", r.bonus));
      const btD = r.bonusType || "actual";
      const mbD = Math.round(r.rTotal * 8.33 / 100);
      let ebD = r.monDays > 0 ? Math.round(r.rBasic * eDaysD / r.monDays) : 0;
      let ehD = r.monDays > 0 ? Math.round(r.rHra   * eDaysD / r.monDays) : 0;
      let bcD = btD === "na" ? 0 : btD === "actual" ? Math.min(r.bonus, mbD) : btD === "annual" ? mbD : (r.monDays > 0 ? Math.round(mbD * eDaysD / r.monDays) : 0);
      let etD = ebD + ehD + bcD;
      let compPayable = etD - totalDeds;
      if (compPayable > r.netPay && eDaysD > 0) {
        eDaysD -= 1;
        ebD = r.monDays > 0 ? Math.round(r.rBasic * eDaysD / r.monDays) : 0;
        ehD = r.monDays > 0 ? Math.round(r.rHra   * eDaysD / r.monDays) : 0;
        bcD = btD === "na" ? 0 : btD === "actual" ? Math.min(r.bonus, mbD) : btD === "annual" ? mbD : (r.monDays > 0 ? Math.round(mbD * eDaysD / r.monDays) : 0);
        etD = ebD + ehD + bcD;
        compPayable = etD - totalDeds;
      }
      const prevBal = r.prevBal || 0;
      const isCompliance = (r.paymentMode || "actual") === "compliance";
      let otherAdj = 0;
      let carryFwd = 0;
      if (isCompliance) {
        otherAdj = 0;
        carryFwd = compPayable - prevBal - actualPaid;
      } else {
        const gap = compPayable - prevBal - actualPaid;
        const selAdjs = (r.diffAdj || "").split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
        if (selAdjs.length > 0 && !selAdjs.some((a: string) => a.includes("carry"))) {
          let rem = gap;
          if (selAdjs.some((a: string) => a.includes("food"))) {
            const food = Math.max(0, rem); otherAdj += food; rem -= food;
          }
          if (rem !== 0 && selAdjs.some((a: string) => a.includes("advance") || a.includes("incentive") || a.includes("reward"))) {
            otherAdj += rem; rem = 0;
          }
        } else {
          otherAdj = gap;
        }
        carryFwd = 0;
      }
      const remarks = (() => {
        if (isCompliance) return carryFwd !== 0 ? "Amount Carry fwd to next Month" : "-";
        const selAdjs = (r.diffAdj || "").split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
        if (selAdjs.some((a: string) => a.includes("carry"))) return "Amount Carry fwd to next Month And added in same month";
        if (selAdjs.some((a: string) => a.includes("advance"))) return "Adjusted in Advance";
        if (selAdjs.some((a: string) => a.includes("food"))) return "Adjusted in Fooding";
        if (selAdjs.some((a: string) => a.includes("incentive"))) return "Adjusted in Incentive";
        if (selAdjs.some((a: string) => a.includes("reward"))) return "Adjusted in Reward";
        return otherAdj !== 0 ? `Adjusted in ${selectedMonth} ${selectedYear}` : "-";
      })();
      return { empCode: r.employeeCode, empName: r.employeeName, compPayable, prevBal, otherAdj, actualPaid, carryFwd, remarks };
    });

    const htmlTable = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8">
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
        <x:Name>TR Report</x:Name>
        <x:WorksheetOptions><x:Print><x:FitWidth>1</x:FitWidth></x:Print></x:WorksheetOptions>
        </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 10pt; }
          th { background: #1a56db; color: #fff; font-weight: bold; text-align: center; padding: 6px 10px; border: 1px solid #1a3a8f; }
          td { padding: 5px 10px; border: 1px solid #ccc; }
          .title { font-size: 13pt; font-weight: bold; padding: 8px 0; }
          .sub   { font-size: 10pt; color: #555; padding-bottom: 6px; }
          .num   { text-align: right; mso-number-format:"#,##0"; }
          .neg   { color: #c0392b; text-align: right; }
          .pos   { color: #16a34a; text-align: right; }
          .tot   { font-weight: bold; background: #f1f5f9; border-top: 2px solid #1a56db; }
        </style>
      </head>
      <body>
        <table>
          <tr><td colspan="8" class="title">TR Report — ${selectedMonth} ${selectedYear}</td></tr>
          <tr><td colspan="8" class="sub">Generated on ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td></tr>
          <tr><td colspan="8"></td></tr>
          <tr>
            <th>Emp Code</th><th>Employee Name</th><th>Actual Payable</th>
            <th>Compliance Payable</th><th>2nd Payable</th><th>Prev Bal</th>
            <th>Carry Fwd</th><th>Remarks</th>
          </tr>
          ${trRows.map(r => `<tr>
            <td>${r.empCode}</td>
            <td>${r.empName}</td>
            <td class="num">${r.actualPaid.toLocaleString("en-IN")}</td>
            <td class="num">${r.compPayable.toLocaleString("en-IN")}</td>
            <td class="num">${r.otherAdj !== 0 ? Math.abs(r.otherAdj).toLocaleString("en-IN") : "—"}</td>
            <td class="${r.prevBal < 0 ? "neg" : r.prevBal > 0 ? "pos" : "num"}">${r.prevBal !== 0 ? (r.prevBal > 0 ? "+" : "") + r.prevBal.toLocaleString("en-IN") : "—"}</td>
            <td class="${r.carryFwd < 0 ? "neg" : r.carryFwd > 0 ? "pos" : "num"}">${r.carryFwd !== 0 ? (r.carryFwd > 0 ? "+" : "") + r.carryFwd.toLocaleString("en-IN") : "0"}</td>
            <td>${r.remarks}</td>
          </tr>`).join("")}
          <tr class="tot">
            <td colspan="2"><strong>TOTAL</strong></td>
            <td class="num tot"><strong>${trRows.reduce((a, r) => a + r.actualPaid, 0).toLocaleString("en-IN")}</strong></td>
            <td class="num tot"><strong>${trRows.reduce((a, r) => a + r.compPayable, 0).toLocaleString("en-IN")}</strong></td>
            <td class="num tot"><strong>${Math.abs(trRows.reduce((a, r) => a + r.otherAdj, 0)).toLocaleString("en-IN")}</strong></td>
            <td class="num tot"><strong>${trRows.reduce((a, r) => a + r.prevBal, 0).toLocaleString("en-IN")}</strong></td>
            <td class="num tot"><strong>${trRows.reduce((a, r) => a + r.carryFwd, 0).toLocaleString("en-IN")}</strong></td>
            <td class="tot"></td>
          </tr>
        </table>
      </body></html>`;

    const blob = new Blob([htmlTable], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `TR_Report_${selectedMonth}_${selectedYear}.xls`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const headers = ["Code","Employee","Dept","Desig","Orig Attendance","Adj Attendance","Orig OT","Adj OT","Orig Basic","Adj Basic","Orig Gross","Adj Gross","Orig Net","Adj Net","Remarks","Status"];
    const csvRows = rows.map(r => {
      const e = edits[r.employeeId];
      return [r.employeeCode, r.employeeName, r.department, r.designation,
        r.originalAttendance, e?.adjustedAttendance ?? "",
        r.originalOtHours, e?.adjustedOtHours ?? "",
        r.originalBasicSalary, e?.adjustedBasicSalary ?? "",
        r.originalGrossSalary, e?.adjustedGrossSalary ?? "",
        r.originalNetSalary, e?.adjustedNetSalary ?? "",
        e?.remarks ?? "",
        r.adjustment?.status ?? "new",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `compliance_${selectedMonth}_${selectedYear}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filtered = sortData(
    rows.filter(r =>
      !search ||
      r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      r.employeeCode.toLowerCase().includes(search.toLowerCase())
    ),
    adjSort,
    (row, col) => {
      if (col === "employeeCode")  return row.employeeCode;
      if (col === "employeeName")  return row.employeeName;
      if (col === "grossSalary")   return row.structureGross;
      if (col === "monDays")       return row.monDays;
      if (col === "payDays")       return row.payDays;
      if (col === "rBasic")        return row.rBasic;
      if (col === "rHra")          return row.rHra;
      if (col === "rTotal")        return row.rTotal;
      if (col === "eBasic")        return row.eBasic;
      if (col === "eHra")          return row.eHra;
      if (col === "bonus")         return row.bonus;
      if (col === "eTotal")        return row.eTotal;
      if (col === "pf")            return row.pf;
      if (col === "esic")          return row.esic;
      if (col === "lwf")           return row.lwf;
      if (col === "pt")            return row.pt;
      if (col === "tds")           return row.tds;
      if (col === "loanAdv")       return row.loanAdv;
      if (col === "dTotal")        return row.dTotal;
      if (col === "prevBal")       return row.prevBal;
      if (col === "compPayable")   return row.netPay;
      if (col === "otherAdj")      return row.netPay;
      if (col === "actualPayable") return row.netPay;
      return null;
    }
  );

  const hasDraft = rows.some(r => r.adjustment?.status === "draft");
  const hasFinalized = rows.some(r => r.adjustment?.status === "finalized");

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Year</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={loadEmployees} disabled={loading} className="h-9 bg-blue-600 hover:bg-blue-700 text-white">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Generating..." : "Generate Compliances"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action bar */}
      {loaded && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search employee..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 w-56 text-sm"
            />
            <span className="text-sm text-gray-500">{filtered.length} of {rows.length} employees</span>
            {dirty.size > 0 && (
              <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50">
                {dirty.size} unsaved
              </Badge>
            )}
            {hasDraft && <Badge className="bg-blue-100 text-blue-700">Has draft records</Badge>}
            {hasFinalized && <Badge className="bg-green-100 text-green-700">Has finalized records</Badge>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTR} className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
              <Download className="h-4 w-4 mr-1" /> Download TR
            </Button>
            <Button variant="outline" size="sm" onClick={saveAll} disabled={saving} className="border-blue-300 text-blue-700 hover:bg-blue-50">
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Saving..." : `Save (${dirty.size})`}
            </Button>
            <Button size="sm" onClick={finalizeAll} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Finalize All
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {loaded && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 text-xs">
                  {/* Identity */}
                  <SortableHead col="employeeCode" sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs sticky left-0 bg-gray-50 z-10 min-w-[70px]">Code</SortableHead>
                  <SortableHead col="employeeName" sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs min-w-[140px]">Name</SortableHead>
                  <SortableHead col="grossSalary"  sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center min-w-[100px]">Gross Salary</SortableHead>
                  <SortableHead col="monDays"      sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center">Mon.Days</SortableHead>
                  <SortableHead col="payDays"      sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center">Pay Days</SortableHead>
                  {/* Rate columns */}
                  <SortableHead col="rBasic"  sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-blue-50">R.Basic</SortableHead>
                  <SortableHead col="rHra"    sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-blue-50">Allowances</SortableHead>
                  <SortableHead col="rTotal"  sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-blue-50">R.Total</SortableHead>
                  {/* Earned columns */}
                  <SortableHead col="eBasic"  sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-green-50">E.Basic</SortableHead>
                  <SortableHead col="eHra"    sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-green-50">E.All.</SortableHead>
                  <SortableHead col="bonus"   sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-green-50">Bonus</SortableHead>
                  <SortableHead col="eTotal"  sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-green-50">E.Total</SortableHead>
                  {/* Deduction columns */}
                  <SortableHead col="pf"       sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-red-50">PF</SortableHead>
                  <SortableHead col="esic"     sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-red-50">ESIC</SortableHead>
                  <SortableHead col="lwf"      sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-red-50">LWF</SortableHead>
                  <SortableHead col="pt"       sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-red-50">PT</SortableHead>
                  <SortableHead col="tds"      sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-red-50">TDS</SortableHead>
                  <SortableHead col="loanAdv"  sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-red-50">Other Ded</SortableHead>
                  <SortableHead col="dTotal"   sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-red-50">D.Total</SortableHead>
                  <SortableHead col="actualPayable" sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-violet-50">Actual Payable</SortableHead>
                  <SortableHead col="compPayable"   sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-violet-50">Compliance Payable</SortableHead>
                  <SortableHead col="otherAdj" sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-violet-50">2nd Payable</SortableHead>
                  <SortableHead col="prevBal"  sort={adjSort} onToggle={adjToggle} className="font-semibold text-xs text-center bg-amber-50">Prev Bal</SortableHead>
                  <TableHead className="font-semibold text-xs text-center">Carry Fwd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={25} className="text-center py-10 text-gray-400">No employees match your search</TableCell></TableRow>
                )}
                {filtered.map(row => {
                  const n = (v: number) => v > 0 ? v.toLocaleString("en-IN") : "0";
                  // Helper: apply compliance type rule
                  // na / exempted / ctc → 0 | actual → payroll value
                  const adjDed = (val: number, type: string | undefined) =>
                    (type === "na" || type === "exempted" || type === "ctc") ? 0 : val;
                  const adjPf   = adjDed(row.pf,   row.pfType   || "actual");
                  const adjEsic = adjDed(row.esic, row.esicType || "actual");
                  const adjLwf  = adjDed(row.lwf,  row.lwfType  || "actual");
                  const otherDedVal = row.loanAdv;
                  const actualPaid  = row.netPay;
                  const totalDeds   = adjPf + adjEsic + adjLwf + row.pt + row.tds + (row.vpf || 0);
                  const adjDTotal   = adjPf + adjEsic + adjLwf + row.pt + row.tds + otherDedVal;
                  // ── Two-path calculation based on whether all types are "actual" ────────
                  // adjPayDays: back-calc from PF → ESIC → eBasic → monDays fallback,
                  // then capped so compPayable never exceeds actual netPay.
                  const rawAdjPayDays = row.eTotal > 0 ? computeAdjPayDays(
                    row.pfType || "actual", row.esicType || "actual",
                    adjPf, adjEsic, row.rBasic, row.rTotal, row.monDays, row.payDays, row.eBasic
                  ) : 0;
                  let adjPayDays = Math.min(rawAdjPayDays, computeNetPayMaxDays(
                    row.netPay, totalDeds, row.rTotal, row.monDays, row.bonusType || "actual", row.bonus
                  ));
                  // Earnings always from compliance rates × adjPayDays (never raw payroll values).
                  const bt = row.bonusType || "actual";
                  const monthlyBonus = Math.round(row.rTotal * 8.33 / 100);
                  let eBasicCalc = row.monDays > 0 ? Math.round(row.rBasic * adjPayDays / row.monDays) : 0;
                  let eHraCalc   = row.monDays > 0 ? Math.round(row.rHra   * adjPayDays / row.monDays) : 0;
                  let bonusCalc  = bt === "na" ? 0
                    : bt === "actual" ? Math.min(row.bonus, monthlyBonus)
                    : bt === "annual" ? monthlyBonus
                    : (row.monDays > 0 ? Math.round(monthlyBonus * adjPayDays / row.monDays) : 0);
                  let eTotalCalc = eBasicCalc + eHraCalc + bonusCalc;
                  let compPayable = eTotalCalc - totalDeds;
                  // Safety: if Math.round in computeNetPayMaxDays overshot by 1 day, decrement.
                  if (compPayable > row.netPay && adjPayDays > 0) {
                    adjPayDays -= 1;
                    eBasicCalc = row.monDays > 0 ? Math.round(row.rBasic * adjPayDays / row.monDays) : 0;
                    eHraCalc   = row.monDays > 0 ? Math.round(row.rHra   * adjPayDays / row.monDays) : 0;
                    bonusCalc  = bt === "na" ? 0
                      : bt === "actual" ? Math.min(row.bonus, monthlyBonus)
                      : bt === "annual" ? monthlyBonus
                      : (row.monDays > 0 ? Math.round(monthlyBonus * adjPayDays / row.monDays) : 0);
                    eTotalCalc = eBasicCalc + eHraCalc + bonusCalc;
                    compPayable = eTotalCalc - totalDeds;
                  }
                  const displayPayDays = adjPayDays;
                  // ── Carry Fwd logic split by paymentMode ───────────────────────────────
                  // compliance → Other Adj = 0; Carry Fwd = CompPayable − PrevBal − ActualPayable
                  // actual / both → Carry Fwd = 0; Other Adj absorbs the full gap
                  const prevBal     = row.prevBal || 0;
                  const isCompliance = (row.paymentMode || "actual") === "compliance";
                  let otherAdjVal   = 0;
                  let diff          = 0;
                  if (isCompliance) {
                    // Other Adj stays 0; carry forward accumulates
                    otherAdjVal = 0;
                    diff        = compPayable - prevBal - actualPaid;
                  } else {
                    // Actual / Both: absorb everything so Carry Fwd = 0
                    const gap   = compPayable - prevBal - actualPaid;
                    // Apply diffAdj selections (Fooding = positive only; Advance/Incentive/Reward = any)
                    const selAdjs = (row.diffAdj || "").split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
                    if (selAdjs.length > 0 && !selAdjs.some((a: string) => a.includes("carry"))) {
                      let rem = gap;
                      if (selAdjs.some((a: string) => a.includes("food"))) {
                        const food = Math.max(0, rem); otherAdjVal += food; rem -= food;
                      }
                      if (rem !== 0 && selAdjs.some((a: string) => a.includes("advance") || a.includes("incentive") || a.includes("reward"))) {
                        otherAdjVal += rem; rem = 0;
                      }
                    } else {
                      // No specific adj selected or carry selected → absorb full gap to zero
                      otherAdjVal = gap;
                    }
                    diff = 0;
                  }
                  return (
                    <TableRow key={row.employeeId} className="text-xs hover:bg-gray-50">
                      <TableCell className="font-mono text-gray-500 sticky left-0 bg-white">{row.employeeCode}</TableCell>
                      <TableCell className="font-medium text-gray-800 whitespace-nowrap">{row.employeeName}</TableCell>
                      <TableCell className="text-center font-medium text-gray-800">{n(row.structureGross)}</TableCell>
                      <TableCell className="text-center text-gray-700">{row.monDays}</TableCell>
                      <TableCell className="text-center text-gray-700 font-medium">{displayPayDays}</TableCell>
                      {/* Rate */}
                      <TableCell className="text-center bg-blue-50/40">{n(row.rBasic)}</TableCell>
                      <TableCell className="text-center bg-blue-50/40">{n(row.rHra)}</TableCell>
                      <TableCell className="text-center bg-blue-50/40 font-medium">{n(row.rTotal)}</TableCell>
                      {/* Earned — prorated from compliance rates × adj pay days */}
                      <TableCell className="text-center bg-green-50/40">{n(eBasicCalc)}</TableCell>
                      <TableCell className="text-center bg-green-50/40">{n(eHraCalc)}</TableCell>
                      <TableCell className="text-center bg-green-50/40" title={`Type: ${row.bonusType}`}>{n(bonusCalc)}</TableCell>
                      <TableCell className="text-center bg-green-50/40 font-medium">{n(eTotalCalc)}</TableCell>
                      {/* Deductions — compliance-adjusted */}
                      <TableCell className="text-center bg-red-50/40" title={`Type: ${row.pfType}`}>{n(adjPf)}</TableCell>
                      <TableCell className="text-center bg-red-50/40" title={`Type: ${row.esicType}`}>{n(adjEsic)}</TableCell>
                      <TableCell className="text-center bg-red-50/40" title={`Type: ${row.lwfType}`}>{n(adjLwf)}</TableCell>
                      <TableCell className="text-center bg-red-50/40">{n(row.pt)}</TableCell>
                      <TableCell className="text-center bg-red-50/40">{n(row.tds)}</TableCell>
                      <TableCell className="text-center bg-red-50/40" title="Loan / Advance">{n(otherDedVal)}</TableCell>
                      <TableCell className="text-center bg-red-50/40 font-medium">{n(adjDTotal)}</TableCell>
                      {/* Actual Payable / Compliance Payable / 2nd Payable / Prev Bal / Carry Fwd */}
                      <TableCell className="text-center bg-violet-50/40">{n(actualPaid)}</TableCell>
                      <TableCell className="text-center bg-violet-50/40 font-semibold">{n(compPayable)}</TableCell>
                      <TableCell className={`text-center bg-violet-50/40 font-medium ${otherAdjVal !== 0 ? "text-gray-800" : "text-gray-400"}`}
                        title={`Sel: ${(row.diffAdj || "none")} | Gap: ${compPayable - prevBal - actualPaid}`}>
                        {otherAdjVal !== 0 ? Math.abs(otherAdjVal).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className={`text-center bg-amber-50/60 font-medium ${(row.prevBal||0) < 0 ? "text-red-600" : (row.prevBal||0) > 0 ? "text-green-700" : "text-gray-400"}`}
                        title="Carry forward from previous month">
                        {(row.prevBal||0) !== 0 ? ((row.prevBal||0) > 0 ? "+" : "") + (row.prevBal||0).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className={`text-center font-semibold ${diff < 0 ? "text-red-600" : diff > 0 ? "text-green-700" : "text-gray-500"}`}>
                        {diff !== 0 ? (diff > 0 ? "+" : "") + diff.toLocaleString("en-IN") : "0"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* TOTAL row */}
                {filtered.length > 0 && (() => {
                  const n = (v: number) => v > 0 ? v.toLocaleString("en-IN") : "0";
                  const adjDed = (val: number, type: string | undefined) =>
                    (type === "na" || type === "exempted" || type === "ctc") ? 0 : val;
                  const sum = (f: keyof EmployeeRow) => filtered.reduce((a, r) => a + Number(r[f] ?? 0), 0);
                  // Per-row computed values for TOTAL aggregation
                  const rowCalcs = filtered.map(r => {
                    const ap   = adjDed(r.pf,   r.pfType   || "actual");
                    const ae   = adjDed(r.esic, r.esicType || "actual");
                    const al   = adjDed(r.lwf,  r.lwfType  || "actual");
                    const deds = ap + ae + al + r.pt + r.tds + (r.vpf || 0);
                    const oth  = r.loanAdv;
                    const pd0 = r.eTotal > 0 ? computeAdjPayDays(
                      r.pfType || "actual", r.esicType || "actual",
                      ap, ae, r.rBasic, r.rTotal, r.monDays, r.payDays, r.eBasic
                    ) : 0;
                    let pd = Math.min(pd0, computeNetPayMaxDays(r.netPay, deds, r.rTotal, r.monDays, r.bonusType || "actual", r.bonus));
                    const bt = r.bonusType || "actual";
                    const mb = Math.round(r.rTotal * 8.33 / 100);
                    let eb = r.monDays > 0 ? Math.round(r.rBasic * pd / r.monDays) : 0;
                    let eh = r.monDays > 0 ? Math.round(r.rHra   * pd / r.monDays) : 0;
                    let bc = bt === "na" ? 0 : bt === "actual" ? Math.min(r.bonus, mb) : bt === "annual" ? mb
                      : (r.monDays > 0 ? Math.round(mb * pd / r.monDays) : 0);
                    let et = eb + eh + bc;
                    let cp = et - deds;
                    if (cp > r.netPay && pd > 0) {
                      pd -= 1;
                      eb = r.monDays > 0 ? Math.round(r.rBasic * pd / r.monDays) : 0;
                      eh = r.monDays > 0 ? Math.round(r.rHra   * pd / r.monDays) : 0;
                      bc = bt === "na" ? 0 : bt === "actual" ? Math.min(r.bonus, mb) : bt === "annual" ? mb
                        : (r.monDays > 0 ? Math.round(mb * pd / r.monDays) : 0);
                      et = eb + eh + bc;
                      cp = et - deds;
                    }
                    // Mirror paymentMode-aware Other Adj logic
                    const pb2  = r.prevBal || 0;
                    const isC2 = (r.paymentMode || "actual") === "compliance";
                    let othadj = 0;
                    let diff2  = 0;
                    if (isC2) {
                      othadj = 0;
                      diff2  = cp - pb2 - r.netPay;
                    } else {
                      const gap2   = cp - pb2 - r.netPay;
                      const sels2  = (r.diffAdj || "").split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
                      if (sels2.length > 0 && !sels2.some((a: string) => a.includes("carry"))) {
                        let rem2 = gap2;
                        if (sels2.some((a: string) => a.includes("food"))) {
                          const f2 = Math.max(0, rem2); othadj += f2; rem2 -= f2;
                        }
                        if (rem2 !== 0 && sels2.some((a: string) => a.includes("advance") || a.includes("incentive") || a.includes("reward"))) {
                          othadj += rem2; rem2 = 0;
                        }
                      } else {
                        othadj = gap2;
                      }
                      diff2 = 0;
                    }
                    return { ap, ae, al, oth, othadj, diff2, pd, eb, eh, et, cp, deds };
                  });
                  const totAdjPf    = rowCalcs.reduce((a, c) => a + c.ap, 0);
                  const totAdjEsic  = rowCalcs.reduce((a, c) => a + c.ae, 0);
                  const totAdjLwf   = rowCalcs.reduce((a, c) => a + c.al, 0);
                  const totOtherDed = rowCalcs.reduce((a, c) => a + c.oth, 0);
                  const totOtherAdj = rowCalcs.reduce((a, c) => a + c.othadj, 0);
                  const totPayDays  = rowCalcs.reduce((a, c) => a + c.pd, 0);
                  const totEBasic   = rowCalcs.reduce((a, c) => a + c.eb, 0);
                  const totEHra     = rowCalcs.reduce((a, c) => a + c.eh, 0);
                  const totETotal   = rowCalcs.reduce((a, c) => a + c.et, 0);
                  const totAdjDTotal = totAdjPf + totAdjEsic + totAdjLwf + sum("pt") + sum("tds") + totOtherDed;
                  const totComp     = rowCalcs.reduce((a, c) => a + c.cp, 0);
                  const totActual   = sum("netPay");
                  const totPrevBal  = sum("prevBal");
                  const totDiff     = rowCalcs.reduce((a, c) => a + c.diff2, 0);
                  return (
                    <TableRow className="bg-gray-100 font-bold text-xs border-t-2 border-gray-300">
                      <TableCell className="sticky left-0 bg-gray-100" colSpan={4}>TOTAL</TableCell>
                      <TableCell className="text-center">{sum("monDays")}</TableCell>
                      <TableCell className="text-center font-medium">{totPayDays}</TableCell>
                      <TableCell className="text-center bg-blue-50">{n(sum("rBasic"))}</TableCell>
                      <TableCell className="text-center bg-blue-50">{n(sum("rHra"))}</TableCell>
                      <TableCell className="text-center bg-blue-50">{n(sum("rTotal"))}</TableCell>
                      <TableCell className="text-center bg-green-50">{n(totEBasic)}</TableCell>
                      <TableCell className="text-center bg-green-50">{n(totEHra)}</TableCell>
                      <TableCell className="text-center bg-green-50">{n(sum("bonus"))}</TableCell>
                      <TableCell className="text-center bg-green-50">{n(totETotal)}</TableCell>
                      <TableCell className="text-center bg-red-50">{n(totAdjPf)}</TableCell>
                      <TableCell className="text-center bg-red-50">{n(totAdjEsic)}</TableCell>
                      <TableCell className="text-center bg-red-50">{n(totAdjLwf)}</TableCell>
                      <TableCell className="text-center bg-red-50">{n(sum("pt"))}</TableCell>
                      <TableCell className="text-center bg-red-50">{n(sum("tds"))}</TableCell>
                      <TableCell className="text-center bg-red-50">{n(totOtherDed)}</TableCell>
                      <TableCell className="text-center bg-red-50">{n(totAdjDTotal)}</TableCell>
                      <TableCell className="text-center bg-violet-50">{n(totActual)}</TableCell>
                      <TableCell className="text-center bg-violet-50">{n(totComp)}</TableCell>
                      <TableCell className={`text-center bg-violet-50 font-bold ${totOtherAdj !== 0 ? "text-gray-800" : "text-gray-400"}`}>
                        {totOtherAdj !== 0 ? Math.abs(totOtherAdj).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className={`text-center bg-amber-50 font-bold ${totPrevBal < 0 ? "text-red-600" : totPrevBal > 0 ? "text-green-700" : "text-gray-400"}`}>
                        {totPrevBal !== 0 ? (totPrevBal > 0 ? "+" : "") + totPrevBal.toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className={`text-center ${totDiff < 0 ? "text-red-600" : totDiff > 0 ? "text-green-700" : "text-gray-500"}`}>
                        {totDiff !== 0 ? (totDiff > 0 ? "+" : "") + totDiff.toLocaleString("en-IN") : "0"}
                      </TableCell>
                    </TableRow>
                  );
                })()}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {!loaded && !loading && (
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldCheck className="h-12 w-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400">Select filters and click <strong>Generate Compliances</strong> to begin</p>
          </CardContent>
        </Card>
      )}

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Delete Adjustment
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Remove the compliance adjustment for <strong>{deleteEmpName}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteAdjustment(deleteId!)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3 — Client Setup
// ═══════════════════════════════════════════════════════════════════════════════
interface ComplianceClient {
  id: string;
  company_id: string;
  project_name: string;
  client_name: string | null;
  client_address: string | null;
  principal_employer_name: string | null;
  principal_employer_address: string | null;
  nature_of_work: string | null;
  location_of_work: string | null;
  project_start_date: string | null;
  project_end_date: string | null;
  status: string;
  active_employees: number;
}

interface ClientAssignment {
  id: string;
  employee_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  department: string | null;
  designation: string | null;
  present_address: string | null;
  assigned_date: string;
  deassigned_date: string | null;
  status: string;
}

const DEFAULT_CLIENT_FORM = {
  projectName: "",
  clientName: "",
  clientAddress: "",
  principalEmployerName: "",
  principalEmployerAddress: "",
  natureOfWork: "",
  locationOfWork: "",
  projectStartDate: "",
};

function ClientSetupTab({ companyId, isSuperAdmin, toast }: {
  companyId: string; isSuperAdmin: boolean; toast: any;
}) {
  const [clients, setClients] = useState<ComplianceClient[]>([]);
  const [loading, setLoading] = useState(false);

  // Add client dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ ...DEFAULT_CLIENT_FORM });
  const [addSaving, setAddSaving] = useState(false);

  // End project dialog
  const [endClientId, setEndClientId] = useState<string | null>(null);
  const [endDate, setEndDate] = useState("");
  const [endSaving, setEndSaving] = useState(false);

  // Edit client dialog
  const [editClientId, setEditClientId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...DEFAULT_CLIENT_FORM });
  const [editClientSaving, setEditClientSaving] = useState(false);

  // Delete client dialog
  const [deleteClient, setDeleteClient] = useState<ComplianceClient | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // View Assignments dialog
  const [assignClientId, setAssignClientId] = useState<string | null>(null);
  const [assignClientName, setAssignClientName] = useState("");
  const [assignments, setAssignments] = useState<ClientAssignment[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  // Assign new employee within the assignments dialog
  const [assignEmpId, setAssignEmpId] = useState("");
  const [assignDate, setAssignDate] = useState("");
  const [assignDesignation, setAssignDesignation] = useState("");
  const [assignPresentAddress, setAssignPresentAddress] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  // De-assign
  const [deassignId, setDeassignId] = useState<string | null>(null);
  const [deassignDate, setDeassignDate] = useState("");
  const [deassignSaving, setDeassignSaving] = useState(false);

  // Edit assignment (designation + present address)
  const [editAssignId, setEditAssignId] = useState<string | null>(null);
  const [editDesignation, setEditDesignation] = useState("");
  const [editPresentAddress, setEditPresentAddress] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Assignment list search
  const [assignSearch, setAssignSearch] = useState("");

  // All employees for assignment dropdown
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string; code: string; designation: string; presentAddress: string }[]>([]);

  const loadClients = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const url = isSuperAdmin
        ? `/api/compliance/clients?companyId=${companyId}`
        : "/api/compliance/clients";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load clients");
      setClients(await res.json());
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [companyId, isSuperAdmin, toast]);

  const loadEmployees = useCallback(async () => {
    if (!companyId) return;
    try {
      const url = `/api/compliance/employee-list${companyId ? `?companyId=${companyId}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setAllEmployees(Array.isArray(data) ? data : []);
    } catch (_) {}
  }, [companyId]);

  useEffect(() => { loadClients(); loadEmployees(); }, [loadClients, loadEmployees]);

  const submitAddClient = async () => {
    if (!addForm.projectName.trim()) {
      toast({ title: "Required", description: "Project name is required", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    try {
      const res = await fetch("/api/compliance/clients", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...addForm }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "Failed"); }
      toast({ title: "Client added", description: `${addForm.projectName} created successfully` });
      setAddOpen(false);
      setAddForm({ ...DEFAULT_CLIENT_FORM });
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setAddSaving(false);
  };

  const submitEndProject = async () => {
    if (!endDate) { toast({ title: "Required", description: "Select an end date", variant: "destructive" }); return; }
    setEndSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/${endClientId}/end`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate }),
      });
      if (!res.ok) throw new Error("Failed to end project");
      toast({ title: "Project ended", description: "Project end date saved" });
      setEndClientId(null); setEndDate("");
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setEndSaving(false);
  };

  const openEditClient = (client: ComplianceClient) => {
    setEditClientId(client.id);
    setEditForm({
      projectName: client.project_name || "",
      clientName: client.client_name || "",
      clientAddress: client.client_address || "",
      principalEmployerName: client.principal_employer_name || "",
      principalEmployerAddress: client.principal_employer_address || "",
      natureOfWork: client.nature_of_work || "",
      locationOfWork: client.location_of_work || "",
      projectStartDate: client.project_start_date ? String(client.project_start_date).slice(0, 10) : "",
    });
  };

  const submitEditClient = async () => {
    if (!editForm.projectName.trim()) {
      toast({ title: "Required", description: "Project name is required", variant: "destructive" });
      return;
    }
    setEditClientSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/${editClientId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Failed to update"); }
      toast({ title: "Project updated", description: `${editForm.projectName} saved successfully` });
      setEditClientId(null);
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setEditClientSaving(false);
  };

  const submitDeleteClient = async () => {
    if (!deleteClient) return;
    setDeleteSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/${deleteClient.id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Failed to delete"); }
      toast({ title: "Project deleted", description: `${deleteClient.project_name} removed` });
      setDeleteClient(null);
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeleteSaving(false);
  };

  const openAssignments = async (client: ComplianceClient) => {
    setAssignClientId(client.id);
    setAssignClientName(client.project_name);
    setAssignLoading(true);
    try {
      const res = await fetch(`/api/compliance/clients/${client.id}/employees`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      setAssignments(await res.json());
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setAssignLoading(false);
  };

  const submitAssign = async () => {
    if (!assignEmpId || !assignDate) {
      toast({ title: "Required", description: "Select employee and date", variant: "destructive" }); return;
    }
    setAssignSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/${assignClientId}/assign`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: assignEmpId, assignedDate: assignDate, designation: assignDesignation || undefined, presentAddress: assignPresentAddress || undefined }),
      });
      if (!res.ok) throw new Error("Failed to assign");
      toast({ title: "Assigned", description: "Employee assigned to project" });
      setAssignEmpId(""); setAssignDate(""); setAssignDesignation(""); setAssignPresentAddress("");
      const res2 = await fetch(`/api/compliance/clients/${assignClientId}/employees`, { credentials: "include" });
      setAssignments(await res2.json());
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setAssignSaving(false);
  };

  const submitDeassign = async () => {
    if (!deassignDate) {
      toast({ title: "Required", description: "Select de-assign date", variant: "destructive" }); return;
    }
    setDeassignSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/assignments/${deassignId}/deassign`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deassignedDate: deassignDate }),
      });
      if (!res.ok) throw new Error("Failed to de-assign");
      toast({ title: "De-assigned", description: "Employee de-assigned from project" });
      setDeassignId(null); setDeassignDate("");
      const res2 = await fetch(`/api/compliance/clients/${assignClientId}/employees`, { credentials: "include" });
      setAssignments(await res2.json());
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeassignSaving(false);
  };

  const submitEditAssignment = async () => {
    if (!editAssignId) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/assignments/${editAssignId}/update`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designation: editDesignation || null, presentAddress: editPresentAddress || null }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "Updated", description: "Assignment details updated successfully" });
      setEditAssignId(null);
      const res2 = await fetch(`/api/compliance/clients/${assignClientId}/employees`, { credentials: "include" });
      setAssignments(await res2.json());
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setEditSaving(false);
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-IN") : "—";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Client Projects</h2>
          <p className="text-xs text-gray-500">{clients.length} project(s) registered</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> Add Client
        </Button>
      </div>

      {/* Client List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No clients added yet. Click "Add Client" to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">Project Name</TableHead>
                <TableHead className="text-xs">Client</TableHead>
                <TableHead className="text-xs">Nature / Location</TableHead>
                <TableHead className="text-xs text-center">Start Date</TableHead>
                <TableHead className="text-xs text-center">End Date</TableHead>
                <TableHead className="text-xs text-center">Employees</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
                <TableHead className="text-xs text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map(client => (
                <TableRow key={client.id} className="text-sm">
                  <TableCell className="font-medium text-gray-800">{client.project_name}</TableCell>
                  <TableCell className="text-gray-600 text-xs max-w-[150px]">
                    <div className="truncate">{client.client_name || "—"}</div>
                    {client.client_address && <div className="text-gray-400 truncate">{client.client_address}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 max-w-[130px]">
                    <div className="truncate">{client.nature_of_work || "—"}</div>
                    <div className="text-gray-400 truncate">{client.location_of_work || ""}</div>
                  </TableCell>
                  <TableCell className="text-center text-xs text-gray-600">{fmt(client.project_start_date)}</TableCell>
                  <TableCell className="text-center text-xs text-gray-600">{fmt(client.project_end_date)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">{client.active_employees}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={client.status === "active"
                      ? "bg-green-100 text-green-700 text-xs"
                      : "bg-gray-100 text-gray-600 text-xs"}>
                      {client.status === "active" ? "Active" : "Ended"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-center flex-wrap">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                        onClick={() => openAssignments(client)} data-testid={`button-employees-client-${client.id}`}>
                        <Users className="h-3 w-3 mr-1" /> Employees
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                        onClick={() => openEditClient(client)} data-testid={`button-edit-client-${client.id}`}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      {client.status === "active" && (
                        <Button size="sm" variant="outline"
                          className="h-7 px-2 text-xs border-amber-200 text-amber-600 hover:bg-amber-50"
                          onClick={() => { setEndClientId(client.id); setEndDate(""); }}
                          data-testid={`button-end-client-${client.id}`}>
                          <XCircle className="h-3 w-3 mr-1" /> End
                        </Button>
                      )}
                      <Button size="sm" variant="outline"
                        className="h-7 px-2 text-xs border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteClient(client)} data-testid={`button-delete-client-${client.id}`}>
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── Add Client Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-blue-600" /> Add New Client Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Project Name <span className="text-red-500">*</span></Label>
              <Input value={addForm.projectName} onChange={e => setAddForm(f => ({ ...f, projectName: e.target.value }))}
                placeholder="e.g. Highway Construction Phase 1" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Project Start Date</Label>
              <Input type="date" value={addForm.projectStartDate}
                onChange={e => setAddForm(f => ({ ...f, projectStartDate: e.target.value }))} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Name of Client</Label>
                <Input value={addForm.clientName} onChange={e => setAddForm(f => ({ ...f, clientName: e.target.value }))}
                  placeholder="Client company name" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Address of Client</Label>
                <Input value={addForm.clientAddress} onChange={e => setAddForm(f => ({ ...f, clientAddress: e.target.value }))}
                  placeholder="Client address" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Name of Principal Employer</Label>
                <Input value={addForm.principalEmployerName}
                  onChange={e => setAddForm(f => ({ ...f, principalEmployerName: e.target.value }))}
                  placeholder="Principal employer name" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Address of Principal Employer</Label>
                <Input value={addForm.principalEmployerAddress}
                  onChange={e => setAddForm(f => ({ ...f, principalEmployerAddress: e.target.value }))}
                  placeholder="Principal employer address" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Nature of Work</Label>
                <Input value={addForm.natureOfWork} onChange={e => setAddForm(f => ({ ...f, natureOfWork: e.target.value }))}
                  placeholder="e.g. Civil Construction" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Location of Work</Label>
                <Input value={addForm.locationOfWork} onChange={e => setAddForm(f => ({ ...f, locationOfWork: e.target.value }))}
                  placeholder="e.g. NH-48, Gurugram" className="h-10" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAddClient} disabled={addSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {addSaving ? "Saving..." : "Add Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── End Project Dialog */}
      <Dialog open={!!endClientId} onOpenChange={() => { setEndClientId(null); setEndDate(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" /> End Project
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-600">Select the project end date. This will mark the project as ended.</p>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">End Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEndClientId(null); setEndDate(""); }}>Cancel</Button>
            <Button onClick={submitEndProject} disabled={endSaving}
              className="bg-red-600 hover:bg-red-700 text-white">
              {endSaving ? "Saving..." : "Confirm End"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Client Dialog */}
      <Dialog open={!!editClientId} onOpenChange={(o) => { if (!o) setEditClientId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" /> Edit Client Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Project Name <span className="text-red-500">*</span></Label>
              <Input value={editForm.projectName} onChange={e => setEditForm(f => ({ ...f, projectName: e.target.value }))}
                placeholder="e.g. Highway Construction Phase 1" className="h-10" data-testid="input-edit-project-name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Project Start Date</Label>
              <Input type="date" value={editForm.projectStartDate}
                onChange={e => setEditForm(f => ({ ...f, projectStartDate: e.target.value }))} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Name of Client</Label>
                <Input value={editForm.clientName} onChange={e => setEditForm(f => ({ ...f, clientName: e.target.value }))}
                  placeholder="Client company name" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Address of Client</Label>
                <Input value={editForm.clientAddress} onChange={e => setEditForm(f => ({ ...f, clientAddress: e.target.value }))}
                  placeholder="Client address" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Name of Principal Employer</Label>
                <Input value={editForm.principalEmployerName}
                  onChange={e => setEditForm(f => ({ ...f, principalEmployerName: e.target.value }))}
                  placeholder="Principal employer name" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Address of Principal Employer</Label>
                <Input value={editForm.principalEmployerAddress}
                  onChange={e => setEditForm(f => ({ ...f, principalEmployerAddress: e.target.value }))}
                  placeholder="Principal employer address" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Nature of Work</Label>
                <Input value={editForm.natureOfWork} onChange={e => setEditForm(f => ({ ...f, natureOfWork: e.target.value }))}
                  placeholder="e.g. Civil Construction" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Location of Work</Label>
                <Input value={editForm.locationOfWork} onChange={e => setEditForm(f => ({ ...f, locationOfWork: e.target.value }))}
                  placeholder="e.g. NH-48, Gurugram" className="h-10" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClientId(null)}>Cancel</Button>
            <Button onClick={submitEditClient} disabled={editClientSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-save-edit-client">
              {editClientSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Client Dialog */}
      <Dialog open={!!deleteClient} onOpenChange={(o) => { if (!o) setDeleteClient(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" /> Delete Client Project
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <span className="font-semibold">{deleteClient?.project_name}</span>?
              This permanently removes the project and all its employee assignments. This cannot be undone.
            </p>
            {!!deleteClient && deleteClient.active_employees > 0 && (
              <p className="text-xs text-amber-600">
                This project has {deleteClient.active_employees} assigned employee(s); their assignment records will also be removed.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteClient(null)}>Cancel</Button>
            <Button onClick={submitDeleteClient} disabled={deleteSaving}
              className="bg-red-600 hover:bg-red-700 text-white" data-testid="button-confirm-delete-client">
              {deleteSaving ? "Deleting..." : "Delete Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assignments Dialog */}
      <Dialog open={!!assignClientId} onOpenChange={() => { setAssignClientId(null); setAssignments([]); }}>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" /> Employees — {assignClientName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Assign new employee */}
            <div className="p-3 bg-blue-50 rounded-lg space-y-2">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-600">Assign Employee</Label>
                  <Select value={assignEmpId} onValueChange={v => {
                    setAssignEmpId(v);
                    const emp = allEmployees.find(e => e.id === v);
                    if (emp) {
                      if (!assignDesignation) setAssignDesignation(emp.designation);
                      if (!assignPresentAddress) setAssignPresentAddress(emp.presentAddress);
                    }
                  }}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                    <SelectContent>
                      {allEmployees
                        .filter(e => !assignments.some(a => a.employee_id === e.id && a.status === "active"))
                        .map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Assign Date</Label>
                  <Input type="date" value={assignDate} onChange={e => setAssignDate(e.target.value)} className="h-9 w-40 bg-white" />
                </div>
                <Button size="sm" onClick={submitAssign} disabled={assignSaving}
                  className="h-9 bg-blue-600 hover:bg-blue-700 text-white">
                  <UserPlus className="h-4 w-4 mr-1" /> {assignSaving ? "..." : "Assign"}
                </Button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-600">Designation</Label>
                  <Select value={assignDesignation} onValueChange={setAssignDesignation}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Select designation..." /></SelectTrigger>
                    <SelectContent>
                      {["LABOUR","HELPER","SUPERVISOR","MANAGER","EXECUTIVE","OFFICER","ENGINEER","TECHNICIAN","DRIVER","SECURITY GUARD","HOUSE KEEPING","ACCOUNTANT","CLERK","PEON","SWEEPER","ELECTRICIAN","PLUMBER","MECHANIC","OPERATOR"].map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-600">Present Address</Label>
                  <Input
                    className="h-9 bg-white"
                    placeholder="Enter present address..."
                    value={assignPresentAddress}
                    onChange={e => setAssignPresentAddress(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Assignment list */}
            {assignments.length > 0 && (
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                <Input
                  placeholder="Search by name or employee code..."
                  value={assignSearch}
                  onChange={e => setAssignSearch(e.target.value)}
                  className="h-8 text-sm"
                />
                {assignSearch && (
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setAssignSearch("")}>
                    <XCircle className="h-4 w-4 text-gray-400" />
                  </Button>
                )}
              </div>
            )}
            {assignLoading ? (
              <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
            ) : assignments.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">No employees assigned yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs">Employee</TableHead>
                    <TableHead className="text-xs">Designation</TableHead>
                    <TableHead className="text-xs text-center">Assigned Date</TableHead>
                    <TableHead className="text-xs text-center">De-assigned Date</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="text-xs text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.filter(a => {
                    if (!assignSearch.trim()) return true;
                    const q = assignSearch.toLowerCase();
                    return (
                      `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) ||
                      a.employee_code.toLowerCase().includes(q)
                    );
                  }).map(a => (
                    <TableRow key={a.id} className="text-sm">
                      <TableCell>
                        <div className="font-medium text-gray-800">{a.first_name} {a.last_name}</div>
                        <div className="text-xs text-gray-500">{a.employee_code}</div>
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">{a.designation || <span className="text-gray-400 italic">—</span>}</TableCell>
                      <TableCell className="text-center text-xs">{fmt(a.assigned_date)}</TableCell>
                      <TableCell className="text-center text-xs text-gray-500">{fmt(a.deassigned_date)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={a.status === "active"
                          ? "bg-green-100 text-green-700 text-xs"
                          : "bg-gray-100 text-gray-500 text-xs"}>
                          {a.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {a.status === "active" && (
                            <Button size="sm" variant="outline"
                              className="h-7 px-2 text-xs border-blue-200 text-blue-600 hover:bg-blue-50"
                              onClick={() => {
                                setEditAssignId(a.id);
                                setEditDesignation(a.designation || "");
                                setEditPresentAddress(a.present_address || "");
                              }}>
                              <Pencil className="h-3 w-3 mr-1" /> Edit
                            </Button>
                          )}
                          {a.status === "active" && (
                            <Button size="sm" variant="outline"
                              className="h-7 px-2 text-xs border-orange-200 text-orange-600 hover:bg-orange-50"
                              onClick={() => { setDeassignId(a.id); setDeassignDate(""); }}>
                              <UserMinus className="h-3 w-3 mr-1" /> De-assign
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── De-assign Confirm Dialog */}
      <Dialog open={!!deassignId} onOpenChange={() => { setDeassignId(null); setDeassignDate(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus className="h-5 w-5 text-orange-500" /> De-assign Employee
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-600">Select the date on which this employee is de-assigned from the project.</p>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">De-assign Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={deassignDate} onChange={e => setDeassignDate(e.target.value)} className="h-10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeassignId(null); setDeassignDate(""); }}>Cancel</Button>
            <Button onClick={submitDeassign} disabled={deassignSaving}
              className="bg-orange-600 hover:bg-orange-700 text-white">
              {deassignSaving ? "Saving..." : "Confirm De-assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Assignment Dialog */}
      <Dialog open={!!editAssignId} onOpenChange={() => setEditAssignId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-500" /> Edit Assignment Details
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Designation on this Project</Label>
              <Select value={editDesignation} onValueChange={setEditDesignation}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select designation..." /></SelectTrigger>
                <SelectContent>
                  {["LABOUR","HELPER","SUPERVISOR","MANAGER","EXECUTIVE","OFFICER","ENGINEER","TECHNICIAN","DRIVER","SECURITY GUARD","HOUSE KEEPING","ACCOUNTANT","CLERK","PEON","SWEEPER","ELECTRICIAN","PLUMBER","MECHANIC","OPERATOR"].map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">This overrides the employee's profile designation in all CLRA forms.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Present Address</Label>
              <Input
                value={editPresentAddress}
                onChange={e => setEditPresentAddress(e.target.value)}
                placeholder="Address at project site"
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAssignId(null)}>Cancel</Button>
            <Button onClick={submitEditAssignment} disabled={editSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white">
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return "";
  const p = d.split(/[-/]/);
  if (p.length === 3) {
    // YYYY-MM-DD
    if (p[0].length === 4) return `${p[2]}-${p[1]}-${p[0]}`;
    return d;
  }
  return d;
}

// ─── Form IX — Workmen Register ───────────────────────────────────────────────
const WR_TD: React.CSSProperties = { border: "1px solid #222", padding: "5px 6px", verticalAlign: "top", fontSize: "10px" };
const WR_TH: React.CSSProperties = { border: "1px solid #222", padding: "5px 4px", textAlign: "center", verticalAlign: "middle", fontSize: "10px", fontWeight: 700, background: "#f0f0f0", whiteSpace: "pre-wrap", lineHeight: "1.35" };

function WorkmenRegisterView({ data, state }: { data: WorkmenRegisterData; state?: string }) {
  const c = data.client;
  const f = clraForm(state, "workmen");
  const val = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(", ") || "—";

  return (
    <div
      id="workmen-register-print"
      className="bg-white"
      style={{ fontFamily: '"Times New Roman", Times, serif', padding: "24px 32px", fontSize: "11px", color: "#000" }}
    >
      {/* Titles */}
      <div style={{ textAlign: "center", marginBottom: "14px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "0.5px" }}>{f.no}</div>
        <div style={{ fontSize: "12px", fontWeight: 700 }}>[{f.rule}]</div>
        <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {f.title}
        </div>
        <div style={{ height: "1px", background: "#333", marginTop: "8px" }} />
      </div>

      {/* Header info */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px", fontSize: "11px" }}>
        <tbody>
          {[
            ["Name and address of Contractor",                                            val(data.company.name, data.company.address)],
            ["Name and address of establishment in/under which contract is carried on",   val(c?.client_name, c?.client_address)],
            ["Nature and location of work",                                                  val(c?.nature_of_work, c?.location_of_work)],
            ["Name and address of Principal Employer",                                     val(c?.principal_employer_name, c?.principal_employer_address)],
          ].map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: "3px 0", fontWeight: 700, whiteSpace: "nowrap", paddingRight: "6px", width: "1%", verticalAlign: "top" }}>{label} :</td>
              <td style={{ padding: "3px 0" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ height: "1px", background: "#bbb", marginBottom: "10px" }} />

      {/* Main table */}
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "4%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "6%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "8%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={WR_TH}>{"Serial\nNo."}</th>
            <th style={WR_TH}>{"Name and\nsurname of\nworkman"}</th>
            <th style={WR_TH}>{"Age\nand\nSex"}</th>
            <th style={WR_TH}>{"Father's /\nHusband's\nName"}</th>
            <th style={WR_TH}>{"Wages\nPeriod"}</th>
            <th style={WR_TH}>{"Designation"}</th>
            <th style={WR_TH}>{"Permanent home\naddress of workman"}</th>
            <th style={WR_TH}>{"Present address"}</th>
            <th style={WR_TH}>{"Date Of\nJoining"}</th>
            <th style={WR_TH}>{"Date of\nLeaving"}</th>
            <th style={WR_TH}>{"Signature\nor thumb\nimpression\nof workman"}</th>
          </tr>
        </thead>
        <tbody>
          {data.employees.length === 0 && (
            <tr><td colSpan={11} style={{ ...WR_TD, textAlign: "center", padding: "20px", color: "#666" }}>No employees found</td></tr>
          )}
          {data.employees.map((emp) => (
            <tr key={emp.serialNo}>
              <td style={{ ...WR_TD, textAlign: "center" }}>{emp.serialNo}</td>
              <td style={{ ...WR_TD, fontWeight: 700 }}>{emp.name}</td>
              <td style={{ ...WR_TD, textAlign: "center" }}>{emp.age ? `${emp.age},` : ""}<br />{emp.sex}</td>
              <td style={WR_TD}>{emp.fatherHusbandName || "—"}</td>
              <td style={{ ...WR_TD, textAlign: "center" }}>{emp.wagesPeriod}</td>
              <td style={WR_TD}>{emp.designation || "—"}</td>
              <td style={WR_TD}>{emp.permanentAddress || "—"}</td>
              <td style={WR_TD}>{emp.presentAddress || "—"}</td>
              <td style={{ ...WR_TD, textAlign: "center" }}>{fmtDate(emp.dateOfJoining)}</td>
              <td style={{ ...WR_TD, textAlign: "center" }}>{fmtDate(emp.dateOfLeaving)}</td>
              <td style={WR_TD}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "32px", fontSize: "11px", alignItems: "flex-end" }}>
        <div><strong>Place : </strong>{c?.location_of_work || "—"}</div>
        <div style={{ minWidth: "180px", textAlign: "center" }}>
          {(data.company as any).signature && <img src={(data.company as any).signature} alt="Authorized Signature" style={{ display: "block", maxHeight: "44px", maxWidth: "170px", objectFit: "contain", margin: "0 auto 2px" }} />}
          <div style={{ fontWeight: 700, borderTop: "1px solid #333", paddingTop: "4px" }}>
            Signature of the Contractor
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
const CL_TD:  React.CSSProperties = { border: "1px solid #222", padding: "4px 5px", verticalAlign: "top", fontSize: "9.5px" };
const CL_TH:  React.CSSProperties = { border: "1px solid #222", padding: "4px 4px", textAlign: "center", verticalAlign: "middle", fontSize: "9.5px", fontWeight: 700, background: "#f0f0f0", whiteSpace: "pre-wrap", lineHeight: "1.3" };
const CL_HDR  = (c: ClientInfo, company: { name: string; address: string }, extra?: [string,string][]) => {
  const v = (...p: (string|null|undefined)[]) => p.filter(Boolean).join(", ") || "—";
  const rows: [string,string][] = [
    ["Name and address of Contractor",                                          v(company.name, company.address)],
    ["Name and address of establishment in/under which contract is carried on", v(c?.client_name, c?.client_address)],
    ["Nature and location of work",                                               v(c?.nature_of_work, c?.location_of_work)],
    ["Name and address of Principal Employer",                                  v(c?.principal_employer_name, c?.principal_employer_address)],
    ...(extra || []),
  ];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px", fontSize: "10.5px" }}>
      <tbody>{rows.map(([label, value]) => (
        <tr key={label}>
          <td style={{ padding: "2px 0", fontWeight: 700, whiteSpace: "nowrap", paddingRight: "6px", width: "1%", verticalAlign: "top" }}>{label} :</td>
          <td style={{ padding: "2px 0" }}>{value}</td>
        </tr>
      ))}</tbody>
    </table>
  );
};
const MONTH_FULL = (m?: string) => {
  const s = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const f = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return m && s.includes(m) ? f[s.indexOf(m)] : (m || "");
};
const CL_FOOTER = (c: ClientInfo, sig?: string | null) => (
  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "28px", fontSize: "10.5px", alignItems: "flex-end" }}>
    <div><strong>Place : </strong>{c?.location_of_work || "—"}</div>
    <div style={{ minWidth: "180px", textAlign: "center" }}>
      {sig && <img src={sig} alt="Authorized Signature" style={{ display: "block", maxHeight: "44px", maxWidth: "170px", objectFit: "contain", margin: "0 auto 2px" }} />}
      <div style={{ fontWeight: 700, borderTop: "1px solid #333", paddingTop: "4px" }}>Signature of the Contractor</div>
    </div>
  </div>
);
const CL_WRAP = (id: string, children: React.ReactNode) => (
  <div id={id} className="bg-white" style={{ fontFamily: '"Times New Roman", Times, serif', padding: "24px 32px", fontSize: "10.5px", color: "#000" }}>{children}</div>
);
const CL_TITLE = (form: string, rule: string, title: string) => (
  <div style={{ textAlign: "center", marginBottom: "12px" }}>
    <div style={{ fontSize: "15px", fontWeight: 700 }}>{form}</div>
    <div style={{ fontSize: "11px", fontWeight: 700 }}>[{rule}]</div>
    <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{title}</div>
    <div style={{ height: "1px", background: "#333", marginTop: "6px" }} />
  </div>
);
const ni = (n: number) => n ? n.toLocaleString("en-IN") : "—";

// ─── State-aware CLRA form numbering ──────────────────────────────────────────
// Form titles are the same across states; only the FORM NUMBER and the RULE
// citation differ. Delhi & Uttar Pradesh follow the Central CLRA Rules; every
// other state (currently Haryana) keeps the existing state numbering.
type ClraVariant = "haryana" | "central";
const CLRA_TITLES: Record<string, string> = {
  contractor:     "Register of Particulars of Contractors",
  workmen:        "Register of Workmen Employed by Contractor",
  employmentCard: "Employment Card",
  serviceCert:    "Service Certificate",
  musterRoll:     "Muster Roll",
  wages:          "Register of Wages",
  wageSlip:       "Wage Slip",
  deductions:     "Register of Deductions for Damage or Loss",
  fines:          "Register of Fines",
  advances:       "Register of Advances",
  overtime:       "Register of Overtime",
  annualReturn:   "Annual Return",
};
const CLRA_NUM: Record<ClraVariant, Record<string, { no: string; rule: string }>> = {
  haryana: {
    contractor:     { no: "FORM VIII",    rule: "See rule 73" },
    workmen:        { no: "Form IX",      rule: "See rule 74" },
    employmentCard: { no: "Form X",       rule: "See Rule 75" },
    serviceCert:    { no: "Form XI",      rule: "See Rule 76" },
    musterRoll:     { no: "Form No. XII", rule: "See Rule 77 (1) (a) (i)" },
    wages:          { no: "Form XIII",    rule: "See Rule 77 (1) (a) (ii)" },
    wageSlip:       { no: "Form XV",      rule: "See rule 77(1)(b)" },
    deductions:     { no: "Form XV",      rule: "See Rule 77 (2) (a)" },
    fines:          { no: "Form XVI",     rule: "See Rule 77 (2) (b)" },
    advances:       { no: "Form XVII",    rule: "See Rule 77 (2) (c)" },
    overtime:       { no: "Form XVIII",   rule: "See Rule 77 (2) (d)" },
    annualReturn:   { no: "Form XIX",     rule: "See Rule 83" },
  },
  central: {
    contractor:     { no: "FORM XII",     rule: "See rule 74" },
    workmen:        { no: "Form XIII",    rule: "See rule 75" },
    employmentCard: { no: "Form XIV",     rule: "See rule 76" },
    serviceCert:    { no: "Form XV",      rule: "See rule 77" },
    musterRoll:     { no: "Form XVI",     rule: "See rule 78 (1) (a) (i)" },
    wages:          { no: "Form XVII",    rule: "See rule 78 (1) (a) (i)" },
    wageSlip:       { no: "Form XIX",     rule: "See rule 78 (1) (b)" },
    deductions:     { no: "Form XX",      rule: "See rule 78 (1) (a) (ii)" },
    fines:          { no: "Form XXI",     rule: "See rule 78 (1) (a) (ii)" },
    advances:       { no: "Form XXII",    rule: "See rule 78 (1) (a) (ii)" },
    overtime:       { no: "Form XXIII",   rule: "See rule 78 (1) (a) (iii)" },
    annualReturn:   { no: "Form XXIV",    rule: "See rule 82 (1)" },
  },
};
const clraVariant = (state?: string): ClraVariant =>
  (state === "Delhi" || state === "Uttar Pradesh") ? "central" : "haryana";
const clraForm = (state: string | undefined, key: string): { no: string; rule: string; title: string } => {
  const n = CLRA_NUM[clraVariant(state)][key];
  return { no: n.no, rule: n.rule, title: CLRA_TITLES[key] };
};

// ─── Form VIII — Register of Particulars of Contractors ───────────────────────
function FormVIIIView({ data, state }: { data: FormVIIIData; state?: string }) {
  const { company, client: c, month, year, totalWages, disbursedWages, maxWorkmen } = data;
  const f = clraForm(state, "contractor");
  const monthFull = month && ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(month)
    ? ["January","February","March","April","May","June","July","August","September","October","November","December"][["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month)]
    : month;
  return CL_WRAP("form-viii-print", <>
    {CL_TITLE(f.no, f.rule, f.title)}
    <div style={{ fontWeight: 700, fontSize: "11px", marginBottom: "6px" }}>PART – I</div>
    {CL_HDR(c, company, [
      ["Nature and location of work", [c?.nature_of_work, c?.location_of_work].filter(Boolean).join(", ") || "—"],
    ])}
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
      <thead>
        <tr>
          <th style={CL_TH}>{"Period of contract"}</th>
          <th style={CL_TH}>{"Amount / value of\ncontract work"}</th>
          <th style={CL_TH}>{"Maximum no. of workmen\nemployed by the contractor"}</th>
          <th style={CL_TH}>{"Security deposited with\nthe principal employer"}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ ...CL_TD, textAlign: "center" }}>
            {c?.project_start_date ? fmtDate(c.project_start_date) : "—"} to {c?.project_end_date ? fmtDate(c.project_end_date) : "—"}
          </td>
          <td style={{ ...CL_TD, textAlign: "center" }}>—</td>
          <td style={{ ...CL_TD, textAlign: "center" }}>{maxWorkmen || "—"}</td>
          <td style={{ ...CL_TD, textAlign: "center" }}>—</td>
        </tr>
      </tbody>
    </table>
    <div style={{ height: "1px", background: "#bbb", marginBottom: "10px" }} />
    <div style={{ fontWeight: 700, fontSize: "11px", marginBottom: "6px" }}>Part II — Progress of Contract Work</div>
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
      <thead>
        <tr>
          <th style={CL_TH}>Wage Period</th>
          <th style={CL_TH}>{"Total Amount of wages earned\nby the workmen"}</th>
          <th style={CL_TH}>{"Amount actually disbursed\non pay day"}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ ...CL_TD, textAlign: "center" }}>{monthFull}-{year}</td>
          <td style={{ ...CL_TD, textAlign: "center" }}>{totalWages ? ni(totalWages) : "—"}</td>
          <td style={{ ...CL_TD, textAlign: "center" }}>{disbursedWages ? ni(disbursedWages) : "—"}</td>
        </tr>
      </tbody>
    </table>
    {CL_FOOTER(c, (company as any).signature)}
  </>);
}

// ─── Form XII — Muster Roll ────────────────────────────────────────────────────
function MusterRollView({ data, state }: { data: MusterRollData; state?: string }) {
  const { company, client: c, month, year, daysInMonth, employees } = data;
  const f = clraForm(state, "musterRoll");
  const monthFull = month && ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(month)
    ? ["January","February","March","April","May","June","July","August","September","October","November","December"][["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month)]
    : month;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  return CL_WRAP("muster-roll-print", <>
    {CL_TITLE(f.no, f.rule, f.title)}
    {CL_HDR(c, company, [["For the month of", `${monthFull} ${year}`]])}
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8px" }}>
        <thead>
          <tr>
            <th style={{ ...CL_TH, fontSize: "8px" }}>{"S.\nNo."}</th>
            <th style={{ ...CL_TH, fontSize: "8px", minWidth: "80px" }}>{"Name of\nEmployee"}</th>
            <th style={{ ...CL_TH, fontSize: "8px" }}>{"Father's /\nHusband's\nName"}</th>
            <th style={{ ...CL_TH, fontSize: "8px" }}>{"Gender"}</th>
            {days.map(d => <th key={d} style={{ ...CL_TH, fontSize: "7.5px", padding: "2px", minWidth: "18px" }}>{d}</th>)}
            <th style={{ ...CL_TH, fontSize: "8px" }}>{"Total\nPresent\nDays"}</th>
            <th style={{ ...CL_TH, fontSize: "8px" }}>{"WO +\nHD"}</th>
            <th style={{ ...CL_TH, fontSize: "8px" }}>{"Net Pay\nDays"}</th>
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 && (
            <tr><td colSpan={4 + daysInMonth + 3} style={{ ...CL_TD, textAlign: "center", padding: "16px" }}>No employees</td></tr>
          )}
          {employees.map(e => (
            <tr key={e.serialNo}>
              <td style={{ ...CL_TD, fontSize: "8px", textAlign: "center" }}>{e.serialNo}</td>
              <td style={{ ...CL_TD, fontSize: "8px", fontWeight: 700 }}>{e.name}</td>
              <td style={{ ...CL_TD, fontSize: "8px" }}>{e.fatherHusbandName || "—"}</td>
              <td style={{ ...CL_TD, fontSize: "8px", textAlign: "center" }}>{e.gender}</td>
              {days.map(d => {
                const s = e.attendance[d] || "";
                const bg = s === "P" ? "" : s === "WO" ? "#e8f4f8" : s === "HD" ? "#fff8e0" : s === "A" ? "#fff0f0" : s === "L" ? "#f0fff0" : "";
                return <td key={d} style={{ ...CL_TD, fontSize: "7.5px", textAlign: "center", padding: "2px", background: bg }}>{s}</td>;
              })}
              <td style={{ ...CL_TD, fontSize: "8px", textAlign: "center", fontWeight: 700 }}>{e.presentDays}</td>
              <td style={{ ...CL_TD, fontSize: "8px", textAlign: "center" }}>{e.woHd}</td>
              <td style={{ ...CL_TD, fontSize: "8px", textAlign: "center", fontWeight: 700 }}>{e.netPayDays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {CL_FOOTER(c, (company as any).signature)}
  </>);
}

// ─── Form XIII — Register of Wages ────────────────────────────────────────────
function WagesRegisterView({ data, state }: { data: WagesRegisterData; state?: string }) {
  const { company, client: c, month, year, employees } = data;
  const f = clraForm(state, "wages");
  const monthFull = month && ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(month)
    ? ["January","February","March","April","May","June","July","August","September","October","November","December"][["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month)]
    : month;
  const totals = employees.reduce((a, e) => ({
    basicSalary:    a.basicSalary    + e.basicSalary,
    hra:            a.hra            + e.hra,
    bonus:          a.bonus          + e.bonus,
    totalEarnings:  a.totalEarnings  + e.totalEarnings,
    pf:             a.pf             + e.pf,
    esi:            a.esi            + e.esi,
    pt:             a.pt             + e.pt,
    lwf:            a.lwf            + e.lwf,
    tds:            a.tds            + e.tds,
    loanDeduction:  a.loanDeduction  + e.loanDeduction,
    totalDeductions:a.totalDeductions+ e.totalDeductions,
    netSalary:      a.netSalary      + e.netSalary,
  }), { basicSalary:0, hra:0, bonus:0, totalEarnings:0, pf:0, esi:0, pt:0, lwf:0, tds:0, loanDeduction:0, totalDeductions:0, netSalary:0 });

  const thE = { ...CL_TH, background: "#e8f5e9" };
  const thD = { ...CL_TH, background: "#fce4ec" };

  return CL_WRAP("wages-register-print", <>
    {CL_TITLE(f.no, f.rule, f.title)}
    {CL_HDR(c, company, [["For the month of", `${monthFull} ${year}`]])}
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8px", tableLayout: "fixed" }}>
      <colgroup>
        <col style={{ width: "3%" }} />
        <col style={{ width: "16%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "5%" }} />
        {/* Earnings: Basic, Allowances, Bonus, Total */}
        <col style={{ width: "7%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "6%" }} />
        <col style={{ width: "8%" }} />
        {/* Deductions: PF, ESI, LWF, Loan, Total */}
        <col style={{ width: "7%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "5%" }} />
        <col style={{ width: "6%" }} />
        <col style={{ width: "7%" }} />
        {/* Net Salary, Sign */}
        <col style={{ width: "8%" }} />
        <col style={{ width: "8%" }} />
      </colgroup>
      <thead>
        <tr>
          <th style={CL_TH} rowSpan={2}>{"Sl.\nNo."}</th>
          <th style={CL_TH} rowSpan={2}>{"Name of\nWorkman"}</th>
          <th style={CL_TH} rowSpan={2}>{"Designation"}</th>
          <th style={CL_TH} rowSpan={2}>{"Pay\nDays"}</th>
          <th style={{ ...thE, background: "#c8e6c9" }} colSpan={4}>Earnings (Rs.)</th>
          <th style={{ ...thD, background: "#f8bbd0" }} colSpan={5}>Deductions (Rs.)</th>
          <th style={CL_TH} rowSpan={2}>{"Net\nSalary\n(Rs.)"}</th>
          <th style={CL_TH} rowSpan={2}>{"Sign."}</th>
        </tr>
        <tr>
          <th style={thE}>{"Basic\n(Rs.)"}</th>
          <th style={thE}>{"Allowances\n(Rs.)"}</th>
          <th style={thE}>{"Bonus\n(Rs.)"}</th>
          <th style={{ ...thE, fontWeight: 900 }}>{"Total\nEarnings\n(Rs.)"}</th>
          <th style={thD}>{"PF\n(Rs.)"}</th>
          <th style={thD}>{"ESI\n(Rs.)"}</th>
          <th style={thD}>{"LWF\n(Rs.)"}</th>
          <th style={thD}>{"Loan\n(Rs.)"}</th>
          <th style={{ ...thD, fontWeight: 900 }}>{"Total\nDed.\n(Rs.)"}</th>
        </tr>
      </thead>
      <tbody>
        {employees.length === 0 && (
          <tr><td colSpan={15} style={{ ...CL_TD, textAlign: "center", padding: "16px" }}>No payroll data for this month</td></tr>
        )}
        {employees.map(e => {
          const visibleDed = e.pf + e.esi + e.lwf + e.loanDeduction;
          const visibleNet = e.totalEarnings - visibleDed;
          return (
            <tr key={e.serialNo}>
              <td style={{ ...CL_TD, textAlign: "center" }}>{e.serialNo}</td>
              <td style={{ ...CL_TD, fontWeight: 700, wordBreak: "break-word" }}>{e.name}</td>
              <td style={{ ...CL_TD, wordBreak: "break-word" }}>{e.designation || "—"}</td>
              <td style={{ ...CL_TD, textAlign: "center" }}>{e.payDays || "—"}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.basicSalary)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.hra)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.bonus)}</td>
              <td style={{ ...CL_TD, textAlign: "right", fontWeight: 700 }}>{ni(e.totalEarnings)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.pf)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.esi)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.lwf)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.loanDeduction)}</td>
              <td style={{ ...CL_TD, textAlign: "right", fontWeight: 700 }}>{ni(visibleDed)}</td>
              <td style={{ ...CL_TD, textAlign: "right", fontWeight: 700 }}>{ni(visibleNet)}</td>
              <td style={CL_TD}></td>
            </tr>
          );
        })}
        {employees.length > 0 && (() => {
          const totVisibleDed = totals.pf + totals.esi + totals.lwf + totals.loanDeduction;
          const totVisibleNet = totals.totalEarnings - totVisibleDed;
          return (
            <tr style={{ fontWeight: 700, background: "#f0f0f0" }}>
              <td colSpan={3} style={{ ...CL_TD, textAlign: "center", fontWeight: 900 }}>TOTAL</td>
              <td style={{ ...CL_TD, textAlign: "center" }}>—</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.basicSalary)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.hra)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.bonus)}</td>
              <td style={{ ...CL_TD, textAlign: "right", fontWeight: 900 }}>{ni(totals.totalEarnings)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.pf)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.esi)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.lwf)}</td>
              <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.loanDeduction)}</td>
              <td style={{ ...CL_TD, textAlign: "right", fontWeight: 900 }}>{ni(totVisibleDed)}</td>
              <td style={{ ...CL_TD, textAlign: "right", fontWeight: 900 }}>{ni(totVisibleNet)}</td>
              <td style={CL_TD}></td>
            </tr>
          );
        })()}
      </tbody>
    </table>
    {CL_FOOTER(c, (company as any).signature)}
  </>);
}

// ─── Form XV — Wage Slip (one per employee, full width) ──────────────────────
function WageSlipView({ data, state }: { data: WagesRegisterData; state?: string }) {
  const { company, client: c, month, year, employees } = data;
  const f = clraForm(state, "wageSlip");
  const monthIdx = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month);
  const monthFull = monthIdx >= 0 ? ["January","February","March","April","May","June","July","August","September","October","November","December"][monthIdx] : month;
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const v = (...p: (string | null | undefined)[]) => p.filter(Boolean).join(", ") || "—";
  const ROW = (label: string, val: React.ReactNode) => (
    <div key={label} style={{ marginBottom: "5px", fontSize: "9px" }}>
      <b>{label} :</b> {val}
    </div>
  );
  return CL_WRAP("wage-slip-print", <>
    {CL_TITLE(f.no, f.rule, f.title)}
    {employees.length === 0 && <div style={{ color: "#666", padding: "20px" }}>No payroll data for this month</div>}
    {employees.map((e, idx) => (
      <div key={e.serialNo} style={{ border: "1px solid #333", padding: "16px 20px", fontSize: "9px", pageBreakInside: "avoid", breakInside: "avoid", marginTop: idx > 0 ? "28px" : "8px" }}>
        <div style={{ textAlign: "center", fontWeight: 700, marginBottom: "12px" }}>
          <div style={{ fontSize: "13px" }}>{f.no.toUpperCase()}</div>
          <div style={{ fontSize: "10px", fontWeight: 400 }}>[{f.rule}]</div>
          <div style={{ fontSize: "12px" }}>{f.title.toUpperCase()}</div>
        </div>
        {ROW("Name and address of Contractor", v(company.name, company.address))}
        {ROW("Name and address of establishment in/under which contract is carried on", v(c?.client_name, c?.client_address))}
        {ROW("Name and location of work", v(c?.nature_of_work, c?.location_of_work))}
        {ROW("Name and address of Principal Employer", v(c?.principal_employer_name, c?.principal_employer_address))}
        <div style={{ margin: "5px 0", fontSize: "9px" }}><b>For the month of :</b> {monthFull} {year}</div>
        <div style={{ margin: "5px 0 8px", fontSize: "9px" }}>
          <b>Name and Father's Name of the workman :</b>{" "}
          <b>{e.name}{e.fatherHusbandName ? ` S/O ${e.fatherHusbandName}` : ""}</b>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8.5px" }}>
          <thead>
            <tr>
              <th style={{ ...CL_TH, width: "8%" }}>No. of days worked</th>
              <th style={{ ...CL_TH, width: "12%" }}>Rate of daily wages/piece rate</th>
              <th style={{ ...CL_TH, width: "12%" }}>No. of units worked in case of piece rate work</th>
              <th style={{ ...CL_TH, width: "10%" }}>Dates on which overtime worked</th>
              <th style={{ ...CL_TH, width: "12%" }}>Overtime hours worked and amount of overtime wages</th>
              <th style={{ ...CL_TH, width: "10%" }}>Gross wages payable</th>
              <th style={{ ...CL_TH, width: "16%" }}>Deductions if any</th>
              <th style={{ ...CL_TH, width: "10%" }}>Net amount paid</th>
              <th style={{ ...CL_TH, width: "10%" }}>Signature of the contractor or his representative</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...CL_TD, textAlign: "center" }}>{e.payDays}</td>
              <td style={{ ...CL_TD, textAlign: "center" }}>{ni(e.monthlyRate)}<br />(Monthly)</td>
              <td style={{ ...CL_TD, textAlign: "center" }}>N.A</td>
              <td style={{ ...CL_TD, textAlign: "center" }}>NIL</td>
              <td style={{ ...CL_TD, textAlign: "center" }}>0</td>
              <td style={{ ...CL_TD, textAlign: "center" }}>{ni(e.totalEarnings)}</td>
              <td style={{ ...CL_TD, lineHeight: "1.8" }}>
                PF : {ni(e.pf)}<br />
                ESIC : {ni(e.esi)}<br />
                LWF : {ni(e.lwf)}<br />
                ADJS : 0
              </td>
              <td style={{ ...CL_TD, textAlign: "center", fontWeight: 700 }}>{ni(e.netSalary)}</td>
              <td style={CL_TD}></td>
            </tr>
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "14px", fontSize: "8.5px" }}>
          <div>Place : {c?.location_of_work || "—"}<br />Date : {today}</div>
          <div style={{ textAlign: "center", borderTop: "1px solid #333", paddingTop: "4px", minWidth: "130px" }}>Signature / Thumb Impression<br />of Workman</div>
          <div style={{ textAlign: "center", borderTop: "1px solid #333", paddingTop: "4px", minWidth: "130px" }}>Signature of the Contractor</div>
        </div>
      </div>
    ))}
  </>);
}

// ─── Form XV — Register of Deductions ─────────────────────────────────────────
function DeductionsRegisterView({ data, month, year, state }: { data: WorkmenRegisterData; month: string; year: string; state?: string }) {
  const { company, client: c } = data;
  const f = clraForm(state, "deductions");
  const isNil = clraVariant(state) === "central";
  const nilText = `No deduction for damage or Loss during the month of ${MONTH_FULL(month)} ${year}.`;
  return CL_WRAP("deductions-register-print", <>
    {CL_TITLE(f.no, f.rule, f.title)}
    {CL_HDR(c as ClientInfo, company)}
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={CL_TH}>{"S.\nNo."}</th>
          <th style={CL_TH}>{"Name & Surname\nof Workman"}</th>
          <th style={CL_TH}>{"Designation"}</th>
          <th style={CL_TH}>{"Nature of Damage\nor Loss"}</th>
          <th style={CL_TH}>{"Date of Damage\nor Loss"}</th>
          <th style={CL_TH}>{"Amount of\nDeduction (₹)"}</th>
          <th style={CL_TH}>{"Date of\nDeduction"}</th>
          <th style={CL_TH}>{"No. of Instalments\n(if any)"}</th>
          <th style={CL_TH}>{"Remarks"}</th>
          <th style={CL_TH}>{"Signature of\nContractor"}</th>
          <th style={CL_TH}>{"Signature /\nThumb Impression\nof Workman"}</th>
        </tr>
      </thead>
      <tbody>
        {isNil
          ? <tr><td colSpan={11} style={{ ...CL_TD, textAlign: "center", padding: "20px", fontWeight: 700 }}>{nilText}</td></tr>
          : data.employees.map(e => (
          <tr key={e.serialNo}>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.serialNo}</td>
            <td style={{ ...CL_TD, fontWeight: 700 }}>{e.name}</td>
            <td style={CL_TD}>{e.designation || "—"}</td>
            <td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td>
            <td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td>
          </tr>
        ))}
      </tbody>
    </table>
    {CL_FOOTER(c as ClientInfo, (company as any).signature)}
  </>);
}

// ─── Form XVI — Register of Fines ─────────────────────────────────────────────
function FinesRegisterView({ data, month, year, state }: { data: WorkmenRegisterData; month: string; year: string; state?: string }) {
  const { company, client: c } = data;
  const f = clraForm(state, "fines");
  const isNil = clraVariant(state) === "central";
  const nilText = `No Fine Imposed to employee during the month of ${MONTH_FULL(month)} ${year}.`;
  return CL_WRAP("fines-register-print", <>
    {CL_TITLE(f.no, f.rule, f.title)}
    {CL_HDR(c as ClientInfo, company)}
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={CL_TH}>{"S.\nNo."}</th>
          <th style={CL_TH}>{"Name & Surname\nof Workman"}</th>
          <th style={CL_TH}>{"Designation"}</th>
          <th style={CL_TH}>{"Act or Omission\nfor which Fined"}</th>
          <th style={CL_TH}>{"Date of Act\nor Omission"}</th>
          <th style={CL_TH}>{"Date of\nImposition of Fine"}</th>
          <th style={CL_TH}>{"Amount of\nFine (₹)"}</th>
          <th style={CL_TH}>{"Date of\nRecovery"}</th>
          <th style={CL_TH}>{"Amount of\nRecovery (₹)"}</th>
          <th style={CL_TH}>{"Remarks"}</th>
          <th style={CL_TH}>{"Signature /\nThumb Impression\nof Workman"}</th>
        </tr>
      </thead>
      <tbody>
        {isNil
          ? <tr><td colSpan={11} style={{ ...CL_TD, textAlign: "center", padding: "20px", fontWeight: 700 }}>{nilText}</td></tr>
          : data.employees.map(e => (
          <tr key={e.serialNo}>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.serialNo}</td>
            <td style={{ ...CL_TD, fontWeight: 700 }}>{e.name}</td>
            <td style={CL_TD}>{e.designation || "—"}</td>
            <td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td>
            <td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td>
          </tr>
        ))}
      </tbody>
    </table>
    {CL_FOOTER(c as ClientInfo, (company as any).signature)}
  </>);
}

// ─── Form XVII — Register of Advances ─────────────────────────────────────────
function AdvancesRegisterView({ data, state }: { data: WagesRegisterData; state?: string }) {
  const { company, client: c, month, year, employees } = data;
  const f = clraForm(state, "advances");
  const isNil = clraVariant(state) === "central";
  const monthFull = month && ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(month)
    ? ["January","February","March","April","May","June","July","August","September","October","November","December"][["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month)]
    : month;
  return CL_WRAP("advances-register-print", <>
    {CL_TITLE(f.no, f.rule, f.title)}
    {CL_HDR(c, company, [["For the month of", `${monthFull} ${year}`]])}
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={CL_TH}>{"S.\nNo."}</th>
          <th style={CL_TH}>{"Name & Surname\nof Workman"}</th>
          <th style={CL_TH}>{"Designation"}</th>
          <th style={CL_TH}>{"Purpose of\nAdvance"}</th>
          <th style={CL_TH}>{"Date of\nAdvance"}</th>
          <th style={CL_TH}>{"Amount of\nAdvance (₹)"}</th>
          <th style={CL_TH}>{"Recovery\nPer Instalment (₹)"}</th>
          <th style={CL_TH}>{"No. of\nInstalments"}</th>
          <th style={CL_TH}>{"Amount\nRecovered (₹)"}</th>
          <th style={CL_TH}>{"Balance\nOutstanding (₹)"}</th>
          <th style={CL_TH}>{"Remarks"}</th>
          <th style={CL_TH}>{"Signature /\nThumb Impression\nof Workman"}</th>
        </tr>
      </thead>
      <tbody>
        {isNil
          ? <tr><td colSpan={12} style={{ ...CL_TD, textAlign: "center", padding: "20px", fontWeight: 700 }}>{`No Advance paid to employee during the month of ${monthFull} ${year}.`}</td></tr>
          : <>
        {employees.length === 0 && <tr><td colSpan={12} style={{ ...CL_TD, textAlign: "center", padding: "16px" }}>No data</td></tr>}
        {employees.map(e => (
          <tr key={e.serialNo}>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.serialNo}</td>
            <td style={{ ...CL_TD, fontWeight: 700 }}>{e.name}</td>
            <td style={CL_TD}>{e.designation || "—"}</td>
            <td style={CL_TD}>—</td>
            <td style={CL_TD}></td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{e.loanDeduction > 0 ? ni(e.loanDeduction) : "—"}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{e.loanDeduction > 0 ? ni(e.loanDeduction) : "—"}</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.loanDeduction > 0 ? "1" : "—"}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{e.loanDeduction > 0 ? ni(e.loanDeduction) : "—"}</td>
            <td style={CL_TD}></td>
            <td style={CL_TD}></td>
            <td style={CL_TD}></td>
          </tr>
        ))}
          </>}
      </tbody>
    </table>
    {CL_FOOTER(c, (company as any).signature)}
  </>);
}

// ─── Form XVIII — Register of Overtime ────────────────────────────────────────
function OTRegisterView({ data, state }: { data: OTRegisterData; state?: string }) {
  const { company, client: c, month, year, employees } = data;
  const f = clraForm(state, "overtime");
  const monthFull = month && ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(month)
    ? ["January","February","March","April","May","June","July","August","September","October","November","December"][["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month)]
    : month;
  const totals = employees.reduce((a, e) => ({
    normalDays: a.normalDays + e.normalDays, otDays: a.otDays + e.otDays,
    otHours: a.otHours + e.otHours, normalWages: a.normalWages + e.normalWages,
    otWages: a.otWages + e.otWages,
  }), { normalDays:0, otDays:0, otHours:0, normalWages:0, otWages:0 });
  const hasOT = totals.otHours > 0 || totals.otWages > 0;
  return CL_WRAP("ot-register-print", <>
    {CL_TITLE(f.no, f.rule, f.title)}
    {CL_HDR(c, company, [["For the month of", `${monthFull} ${year}`]])}
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={CL_TH}>{"S.\nNo."}</th>
          <th style={CL_TH}>{"Name & Surname\nof Workman"}</th>
          <th style={CL_TH}>{"Designation"}</th>
          <th style={CL_TH}>{"Normal Working\nDays"}</th>
          <th style={CL_TH}>{"OT Days"}</th>
          <th style={CL_TH}>{"OT Hours"}</th>
          <th style={CL_TH}>{"Normal Wages\n(₹)"}</th>
          <th style={CL_TH}>{"OT Wages\n(₹)"}</th>
          <th style={CL_TH}>{"Total Wages\n(₹)"}</th>
          <th style={CL_TH}>{"Signature /\nThumb Impression"}</th>
        </tr>
      </thead>
      <tbody>
        {!hasOT
          ? <tr><td colSpan={10} style={{ ...CL_TD, textAlign: "center", padding: "20px", fontWeight: 700 }}>{`No Overtime during the month of ${monthFull} ${year}.`}</td></tr>
          : <>
        {employees.map(e => (
          <tr key={e.serialNo}>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.serialNo}</td>
            <td style={{ ...CL_TD, fontWeight: 700 }}>{e.name}</td>
            <td style={CL_TD}>{e.designation || "—"}</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.normalDays}</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.otDays}</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.otHours}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.normalWages)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{e.otWages > 0 ? ni(e.otWages) : "—"}</td>
            <td style={{ ...CL_TD, textAlign: "right", fontWeight: 700 }}>{ni(e.normalWages + e.otWages)}</td>
            <td style={CL_TD}></td>
          </tr>
        ))}
        {employees.length > 0 && (
          <tr style={{ fontWeight: 700, background: "#f0f0f0" }}>
            <td colSpan={3} style={{ ...CL_TD, textAlign: "center" }}>TOTAL</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>{totals.normalDays}</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>{totals.otDays}</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>{totals.otHours}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.normalWages)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{totals.otWages > 0 ? ni(totals.otWages) : "—"}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.normalWages + totals.otWages)}</td>
            <td style={CL_TD}></td>
          </tr>
        )}
          </>}
      </tbody>
    </table>
    {CL_FOOTER(c, (company as any).signature)}
  </>);
}

// ─── Form XIX — Annual Return ──────────────────────────────────────────────────
function AnnualReturnView({ data, fromYear, toYear, state }: { data: WorkmenRegisterData; fromYear: string; toYear: string; state?: string }) {
  const { company, client: c } = data;
  const f = clraForm(state, "annualReturn");
  return CL_WRAP("annual-return-print", <>
    {CL_TITLE(f.no, f.rule, f.title)}
    {CL_HDR(c as ClientInfo, company, [["Year", fromYear === toYear ? fromYear : `${fromYear} – ${toYear}`]])}
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
      <thead>
        <tr>
          <th style={CL_TH}>{"S.\nNo."}</th>
          <th style={CL_TH}>{"Name & Surname\nof Workman"}</th>
          <th style={CL_TH}>{"Father's /\nHusband's Name"}</th>
          <th style={CL_TH}>{"Designation"}</th>
          <th style={CL_TH}>{"Date of\nAssign"}</th>
          <th style={CL_TH}>{"Date of\nDe-Assign"}</th>
          <th style={CL_TH}>{"Total Days\nWorked"}</th>
          <th style={CL_TH}>{"Remarks"}</th>
        </tr>
      </thead>
      <tbody>
        {data.employees.length === 0 && <tr><td colSpan={8} style={{ ...CL_TD, textAlign: "center", padding: "16px" }}>No employee data</td></tr>}
        {data.employees.map(e => (
          <tr key={e.serialNo}>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.serialNo}</td>
            <td style={{ ...CL_TD, fontWeight: 700 }}>{e.name}</td>
            <td style={CL_TD}>{e.fatherHusbandName || "—"}</td>
            <td style={CL_TD}>{e.designation || "—"}</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>{fmtDate((e as any).assignedDate || e.dateOfJoining)}</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>{fmtDate((e as any).deassignedDate || e.dateOfLeaving) || "—"}</td>
            <td style={CL_TD}></td>
            <td style={CL_TD}></td>
          </tr>
        ))}
      </tbody>
    </table>
    {CL_FOOTER(c as ClientInfo, (company as any).signature)}
  </>);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 4 — Compliance Report
// ═══════════════════════════════════════════════════════════════════════════════
function MonthYearPicker({ label, month, year, onMonth, onYear }: {
  label: string; month: string; year: string;
  onMonth: (v: string) => void; onYear: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-500">{label}</Label>
      <div className="flex gap-1">
        <Select value={month} onValueChange={onMonth}>
          <SelectTrigger className="w-20 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS_SHORT.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={year} onValueChange={onYear}>
          <SelectTrigger className="w-24 h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Form X — Employment Card (2-up, one card per employee) ──────────────────
function EmploymentCardView({ data, month, year, state }: { data: WorkmenRegisterData; month: string; year: string; state?: string }) {
  const { company, client: c } = data;
  const f = clraForm(state, "employmentCard");
  const monthIdx = MONTHS_SHORT.indexOf(month);
  const isJoiningMonth = (e: any) => {
    const d = new Date((e as any).assignedDate || e.dateOfJoining);
    return !isNaN(d.getTime()) && d.getFullYear() === parseInt(year) && d.getMonth() === monthIdx;
  };
  const employees = data.employees.filter(isJoiningMonth);
  const v = (...p: (string | null | undefined)[]) => p.filter(Boolean).join(", ") || "—";
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const HDR_ROW = (label: string, val: string) => (
    <div key={label} style={{ marginBottom: "3px", fontSize: "8.5px" }}>
      <b>{label} :</b> {val}
    </div>
  );
  return CL_WRAP("employment-card-print", <>
    {CL_TITLE(f.no, f.rule, f.title)}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "8px" }}>
      {employees.length === 0 && <div style={{ color: "#666", padding: "20px" }}>No employees joined this project in {month} {year}.</div>}
      {employees.map(e => (
        <div key={e.serialNo} style={{ border: "1px solid #333", padding: "14px 16px", pageBreakInside: "avoid", breakInside: "avoid" }}>
          <div style={{ textAlign: "center", fontWeight: 700, marginBottom: "10px" }}>
            <div style={{ fontSize: "12px" }}>{f.no}</div>
            <div style={{ fontSize: "10px" }}>[{f.rule}]</div>
            <div style={{ fontSize: "12px" }}>{f.title}</div>
          </div>
          {HDR_ROW("Name and address of Contractor",   v(company.name, company.address))}
          {HDR_ROW("Name and address of establishment in/under which contract is carried on", v(c?.client_name, c?.client_address))}
          {HDR_ROW("Nature and location of work",        v(c?.nature_of_work, c?.location_of_work))}
          {HDR_ROW("Name and address of Principal Employer", v(c?.principal_employer_name, c?.principal_employer_address))}
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px", fontSize: "8.5px" }}>
            <thead>
              <tr>
                {["Name of the workman","Serial no. in register of workman employed","Nature of employment/ designation","Wages rate (with particular unit, in case of piece work)","Wages Period","Date of Assign","Remarks"].map(h => (
                  <th key={h} style={{ ...CL_TH, fontSize: "8px", padding: "3px 4px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...CL_TD, fontWeight: 700, fontSize: "8.5px" }}>{e.name}</td>
                <td style={{ ...CL_TD, textAlign: "center", fontSize: "8.5px" }}>{e.serialNo}</td>
                <td style={{ ...CL_TD, fontSize: "8.5px" }}>{e.designation || "LABOUR"}</td>
                <td style={{ ...CL_TD, fontSize: "8.5px" }}></td>
                <td style={{ ...CL_TD, textAlign: "center", fontSize: "8.5px" }}>{e.wagesPeriod || "Monthly"}</td>
                <td style={{ ...CL_TD, textAlign: "center", fontSize: "8.5px" }}>{fmtDate((e as any).assignedDate || e.dateOfJoining) || "—"}</td>
                <td style={{ ...CL_TD, fontSize: "8.5px" }}></td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "14px", fontSize: "8px" }}>
            <div>Place : {c?.location_of_work || "—"}<br />Date : {today}</div>
            <div>Signature of the Contractor:</div>
          </div>
        </div>
      ))}
    </div>
  </>);
}

// ─── Form XI — Service Certificate (one per employee) ─────────────────────────
function ServiceCertificateView({ workmen, wages, state }: { workmen: WorkmenRegisterData; wages: WagesRegisterData; state?: string }) {
  const { company, client: c } = workmen;
  const f = clraForm(state, "serviceCert");
  const { month, year } = wages;
  const monthIdx = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month);
  const monthFull = monthIdx >= 0 ? ["January","February","March","April","May","June","July","August","September","October","November","December"][monthIdx] : month;
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const v = (...p: (string | null | undefined)[]) => p.filter(Boolean).join(", ") || "—";
  const wMap = new Map(wages.employees.map(e => [e.name, e]));
  const isLeavingMonth = (e: any) => {
    const dateStr = (e as any).deassignedDate || e.dateOfLeaving;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d.getFullYear() === parseInt(year) && d.getMonth() === monthIdx;
  };
  const employees = workmen.employees.filter(isLeavingMonth);
  const HDR = (label: string, val: string) => (
    <div key={label} style={{ marginBottom: "4px", fontSize: "9px" }}>
      <b>{label} :</b> {val}
    </div>
  );
  return CL_WRAP("service-cert-print", <>
    {CL_TITLE(f.no, f.rule, f.title)}
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {employees.length === 0 && <div style={{ color: "#666", padding: "16px" }}>No employees left this project in {month} {year}.</div>}
      {employees.map(e => {
        const w = wMap.get(e.name);
        const fromDate = fmtDate((e as any).assignedDate || e.dateOfJoining) || "—";
        const toDate   = fmtDate((e as any).deassignedDate || e.dateOfLeaving) || "—";
        const _start = new Date((e as any).assignedDate || e.dateOfJoining);
        const _end   = new Date((e as any).deassignedDate || e.dateOfLeaving);
        const calDays = (!isNaN(_start.getTime()) && !isNaN(_end.getTime()))
          ? Math.round((_end.getTime() - _start.getTime()) / 86400000) + 1
          : (w?.payDays ?? "—");
        return (
          <div key={e.serialNo} style={{ border: "1px solid #333", padding: "14px 16px", pageBreakInside: "avoid", breakInside: "avoid" }}>
            {HDR("Name and address of Contractor",                        v(company.name, company.address))}
            {HDR("Name and address of establishment in/under which contract is carried on", v(c?.client_name, c?.client_address))}
            {HDR("Nature and location of work",                             v(c?.nature_of_work, c?.location_of_work))}
            {HDR("Name and address of Principal Employer",                v(c?.principal_employer_name, c?.principal_employer_address))}
            <div style={{ marginBottom: "4px", fontSize: "9px" }}><b>Name and address of the workman :</b> <b style={{ fontSize: "9.5px" }}>{e.name}</b></div>
            <div style={{ marginBottom: "4px", fontSize: "9px" }}><b>Age and date of birth :</b> {e.age ? e.age + " yr" : "—"}</div>
            <div style={{ marginBottom: "8px", fontSize: "9px" }}><b>Father's/husband's Name :</b> {e.fatherHusbandName || "—"}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8.5px" }}>
              <thead>
                <tr>
                  <th style={CL_TH}>{"Serial\nNo."}</th>
                  <th style={CL_TH} colSpan={2}>{"Total period for which employed"}</th>
                  <th style={CL_TH}>{"Actual No.\nof days\nworked"}</th>
                  <th style={CL_TH}>{"Nature of\nwork done"}</th>
                  <th style={CL_TH}>{"Rate of wage (with particulars\nof out unit in case of\npiece work)"}</th>
                  <th style={CL_TH}>{"Total wages\nearned by\nworkman\nduring the\nperiod"}</th>
                  <th style={CL_TH}>{"Total\ndeduction\nmade,\nif any"}</th>
                  <th style={CL_TH}>{"Total wages\nactually\npaid"}</th>
                  <th style={CL_TH}>{"Remarks"}</th>
                </tr>
                <tr>
                  <th style={CL_TH}></th>
                  <th style={CL_TH}>From</th>
                  <th style={CL_TH}>To</th>
                  <th style={CL_TH}></th><th style={CL_TH}></th><th style={CL_TH}></th>
                  <th style={CL_TH}></th><th style={CL_TH}></th><th style={CL_TH}></th><th style={CL_TH}></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...CL_TD, textAlign: "center" }}>{e.serialNo}</td>
                  <td style={{ ...CL_TD, textAlign: "center" }}>{fromDate}</td>
                  <td style={{ ...CL_TD, textAlign: "center" }}>{toDate}</td>
                  <td style={{ ...CL_TD, textAlign: "center" }}>{calDays}</td>
                  <td style={CL_TD}>{e.designation || "LABOUR"}</td>
                  <td style={CL_TD}>Monthly</td>
                  <td style={{ ...CL_TD, textAlign: "right" }}>{w ? ni(w.totalEarnings) : "—"}</td>
                  <td style={CL_TD}>
                    {w ? <>PF : {ni(w.pf)}<br />ESIC : {ni(w.esi)}<br />LWF : {ni(w.lwf)}<br />VPF : 0</> : "—"}
                  </td>
                  <td style={{ ...CL_TD, textAlign: "right", fontWeight: 700 }}>{w ? ni(w.netSalary) : "—"}</td>
                  <td style={CL_TD}></td>
                </tr>
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "14px", fontSize: "8.5px" }}>
              <div>Place : {c?.location_of_work || "—"}<br />Date : {today}</div>
              <div style={{ textAlign: "right" }}>Signature of the Contractor:</div>
            </div>
          </div>
        );
      })}
    </div>
  </>);
}

// ─── CLRA Full Package — all 11 forms in one scrollable view ─────────────────
function CLRAPackageView({ data, state }: { data: ClraPackageData; state?: string }) {
  const SEP = <div style={{ borderTop: "2px dashed #aaa", margin: "28px 0 24px" }} />;
  return (
    <div style={{ background: "#fff" }}>
      <FormVIIIView data={data.viii} state={state} />
      {SEP}
      <WorkmenRegisterView data={data.ix} state={state} />
      {SEP}
      <EmploymentCardView data={data.ix} month={data.xiii.month} year={data.xiii.year} state={state} />
      {SEP}
      <ServiceCertificateView workmen={data.ix} wages={data.xiii} state={state} />
      {SEP}
      <MusterRollView data={data.xii} state={state} />
      {SEP}
      <WagesRegisterView data={data.xiii} state={state} />
      {SEP}
      <WageSlipView data={data.xiii} state={state} />
      {SEP}
      <DeductionsRegisterView data={data.ix} month={data.xiii.month} year={data.xiii.year} state={state} />
      {SEP}
      <FinesRegisterView data={data.ix} month={data.xiii.month} year={data.xiii.year} state={state} />
      {SEP}
      <AdvancesRegisterView data={data.xiii} state={state} />
      {SEP}
      <OTRegisterView data={data.xviii} state={state} />
    </div>
  );
}

function ComplianceReportTab({ companyId, isSuperAdmin, user, toast }: {
  companyId: string; isSuperAdmin: boolean; user: any; toast: any;
}) {
  const now = new Date();
  const [projects,        setProjects]        = useState<ComplianceClient[]>([]);
  const [companyName,     setCompanyName]     = useState("Company");
  const [selectedProject, setSelectedProject] = useState("company");
  const [selectedState,   setSelectedState]   = useState("");
  const [selectedAct,     setSelectedAct]     = useState("");
  const [selectedReport,  setSelectedReport]  = useState("");
  const [toMonth,         setToMonth]         = useState(MONTHS_SHORT[now.getMonth()]);
  const [toYear,          setToYear]          = useState(String(now.getFullYear()));
  const [workmenData,   setWorkmenData]   = useState<WorkmenRegisterData | null>(null);
  const [formVIIIData,  setFormVIIIData]  = useState<FormVIIIData | null>(null);
  const [musterData,    setMusterData]    = useState<MusterRollData | null>(null);
  const [wagesData,     setWagesData]     = useState<WagesRegisterData | null>(null);
  const [otData,        setOtData]        = useState<OTRegisterData | null>(null);
  const [clraData,      setClraData]      = useState<ClraPackageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);

  // Load company name and projects for the selector
  useEffect(() => {
    if (!companyId) return;
    fetch("/api/compliance/companies", { credentials: "include" })
      .then(r => r.json())
      .then((list: { id: string; company_name: string }[]) => {
        const match = list.find(c => c.id === companyId);
        if (match) setCompanyName(match.company_name);
      }).catch(() => {});
    const projectsUrl = isSuperAdmin ? `/api/compliance/clients?companyId=${companyId}` : "/api/compliance/clients";
    fetch(projectsUrl, { credentials: "include" }).then(r => r.json()).then(setProjects).catch(() => {});
  }, [companyId, isSuperAdmin]);

  const loadReport = async () => {
    if (!companyId) return;
    if (!selectedState) {
      toast({ title: "Select a state", description: "Please choose a state before generating the CLRA report. Form numbering depends on the state.", variant: "destructive" });
      return;
    }
    const allContractForms = REPORT_TYPES; // all 10 forms require a project
    const needsProject = allContractForms.includes(selectedReport);
    let effectiveProject = selectedProject;
    if (needsProject && selectedProject === "company") {
      if (projects.length > 0) {
        effectiveProject = projects[0].id;
        setSelectedProject(projects[0].id);
      } else {
        toast({ title: "No Projects Found", description: "Please add a project in the Projects tab before generating reports.", variant: "destructive" });
        return;
      }
    }
    setLoading(true);
    setWorkmenData(null); setFormVIIIData(null); setMusterData(null); setWagesData(null); setOtData(null); setClraData(null);
    setLoaded(false);
    const qp = new URLSearchParams({
      projectId: effectiveProject,
      month: toMonth, year: toYear,
      ...(isSuperAdmin ? { companyId } : {}),
    });
    const safeJson = async (res: Response) => {
      const text = await res.text();
      if (!res.ok) throw new Error(text.replace(/<[^>]*>/g, "").trim().slice(0, 200) || `HTTP ${res.status}`);
      try { return JSON.parse(text); }
      catch { throw new Error(`Server returned non-JSON response (HTTP ${res.status}). Please retry.`); }
    };
    try {
      if (selectedReport === "Form IX – Workmen Register") {
        const params = new URLSearchParams({ projectId: effectiveProject, ...(isSuperAdmin ? { companyId } : {}) });
        setWorkmenData(await safeJson(await fetch(`/api/compliance/workmen-register?${params}`, { credentials: "include" })));

      } else if (selectedReport === "Form VIII – Contractor Particulars") {
        setFormVIIIData(await safeJson(await fetch(`/api/compliance/form-viii?${qp}`, { credentials: "include" })));

      } else if (selectedReport === "Form XII – Muster Roll") {
        setMusterData(await safeJson(await fetch(`/api/compliance/muster-roll?${qp}`, { credentials: "include" })));

      } else if (selectedReport === "Form XIII – Wages Register" || selectedReport === "Form XIV – Wage Slip" || selectedReport === "Form XVII – Advances Register") {
        setWagesData(await safeJson(await fetch(`/api/compliance/wages-register?${qp}`, { credentials: "include" })));

      } else if (selectedReport === "Form XV – Deductions Register" || selectedReport === "Form XVI – Fines Register" || selectedReport === "Form XIX – Annual Return") {
        const params = new URLSearchParams({ projectId: effectiveProject, ...(isSuperAdmin ? { companyId } : {}) });
        setWorkmenData(await safeJson(await fetch(`/api/compliance/workmen-register?${params}`, { credentials: "include" })));

      } else if (selectedReport === "Form XVIII – OT Register") {
        setOtData(await safeJson(await fetch(`/api/compliance/ot-register?${qp}`, { credentials: "include" })));

      } else if (selectedReport === "CLRA Full Package – Forms VIII + IX + XII + XIII") {
        const ixParams = new URLSearchParams({ projectId: effectiveProject, ...(isSuperAdmin ? { companyId } : {}) });
        const [viii, ix, xii, xiii, xviii] = await Promise.all([
          safeJson(await fetch(`/api/compliance/form-viii?${qp}`,        { credentials: "include" })),
          safeJson(await fetch(`/api/compliance/workmen-register?${ixParams}`, { credentials: "include" })),
          safeJson(await fetch(`/api/compliance/muster-roll?${qp}`,      { credentials: "include" })),
          safeJson(await fetch(`/api/compliance/wages-register?${qp}`,   { credentials: "include" })),
          safeJson(await fetch(`/api/compliance/ot-register?${qp}`,      { credentials: "include" })),
        ]);
        setClraData({ viii, ix, xii, xiii, xviii });
      }
      setLoaded(true);
    } catch (e: any) {
      toast({ title: "Error loading report", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };


  const isWorkmenRegister = selectedReport === "Form IX – Workmen Register";
  const isCLRAPackage    = selectedReport === "CLRA Full Package – Forms VIII + IX + XII + XIII";
  const hasReport = !!(workmenData || formVIIIData || musterData || wagesData || otData || clraData);

  const printReport = async () => {
    const printDiv = document.getElementById("report-print-area");
    if (!printDiv) return;
    const formLabel = selectedReport.replace(/[^a-zA-Z0-9\s\-]/g, "").replace(/\s+/g, "_");
    const fileName = `${formLabel}_${toMonth}_${toYear}.pdf`;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { initJsPDF } = await import("@/lib/jspdf-shim");
      const canvas = await html2canvas(printDiv, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false, windowWidth: printDiv.scrollWidth, width: printDiv.scrollWidth });
      const pdf = await initJsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;
      const imgH = (canvas.height * usableW) / canvas.width;
      let remaining = imgH;
      let srcY = 0;
      let page = 0;
      while (remaining > 0) {
        if (page > 0) pdf.addPage();
        const sliceH = Math.min(remaining, usableH);
        const srcSliceH = (sliceH / imgH) * canvas.height;
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = srcSliceH;
        const ctx = sliceCanvas.getContext("2d")!;
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcSliceH, 0, 0, canvas.width, srcSliceH);
        pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, margin, usableW, sliceH);
        srcY += srcSliceH;
        remaining -= sliceH;
        page++;
      }
      pdf.save(fileName);
    } catch {
      toast({ title: "PDF Error", description: "Failed to generate PDF. Please try again.", variant: "destructive" });
    }
  };

  const downloadCLRAPackagePDF = async () => {
    if (!clraData) { toast({ title: "No data", description: "Generate the CLRA Package first.", variant: "destructive" }); return; }
    if (!selectedState) { toast({ title: "Select a state", description: "Please choose a state before downloading. Form numbering depends on the state.", variant: "destructive" }); return; }
    try {
      const { initJsPDF } = await import("@/lib/jspdf-shim");
      const doc = await initJsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const autoTbl = (_doc: any, opts: any) => _doc.autoTable(opts);
      // pw/ph are `let` so they can be updated when we flip orientation
      // for Forms X (Employment Card), XI (Service Certificate) and XV
      // (Wage Slip), which are rendered in portrait.
      let pw  = doc.internal.pageSize.getWidth();   // landscape: 297mm
      let ph  = doc.internal.pageSize.getHeight();  // landscape: 210mm
      const goPortrait = () => {
        doc.addPage("a4", "portrait");
        pw = doc.internal.pageSize.getWidth();  // 210mm
        ph = doc.internal.pageSize.getHeight(); // 297mm
      };
      const goLandscape = () => {
        doc.addPage("a4", "landscape");
        pw = doc.internal.pageSize.getWidth();  // 297mm
        ph = doc.internal.pageSize.getHeight(); // 210mm
      };
      const M   = 14;   // outer margin on all sides
      const LH  = 4.5;  // line height per text row in header (mm)
      const company  = clraData.viii.company;
      const cl       = clraData.viii.client;
      const monthIdx = MONTHS_SHORT.indexOf(toMonth);
      const monthFull = monthIdx >= 0 ? MONTHS[monthIdx] : toMonth;
      const pf = (k: string) => clraForm(selectedState, k);
      const isCentral = clraVariant(selectedState) === "central";
      const nilDeduct = `No deduction for damage or Loss during the month of ${monthFull} ${toYear}.`;
      const nilFine   = `No Fine Imposed to employee during the month of ${monthFull} ${toYear}.`;
      const nilAdv    = `No Advance paid to employee during the month of ${monthFull} ${toYear}.`;
      const nilOT     = `No Overtime during the month of ${monthFull} ${toYear}.`;
      const otHasData = clraData.xviii.employees.some((e: any) => e.otHours > 0 || e.otWages > 0);
      const v = (...ps: (string | null | undefined)[]) => ps.filter(Boolean).join(", ") || "—";

      // Load company authorized signature as base64 for PDF embedding
      const loadImgB64 = (url: string): Promise<string> => new Promise((res, rej) => {
        const img = new Image(); img.crossOrigin = "anonymous";
        img.onload = () => { const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d")!.drawImage(img, 0, 0); res(c.toDataURL("image/png")); };
        img.onerror = rej; img.src = url;
      });
      const sigB64: string | undefined = (company as any).signature
        ? await loadImgB64((company as any).signature).catch(() => undefined)
        : undefined;
      // Helper: draw signature image (or plain label if no sig) above a right-aligned x position
      const drawSig = (x: number, y: number, label = "Signature of the Contractor") => {
        const sigW = 40; const sigH = 14;
        doc.setFont("times", "bold"); doc.setFontSize(8.5);
        const labelW = doc.getTextWidth(label);
        const labelLeft = x - labelW;
        if (sigB64) {
          doc.addImage(sigB64, "PNG", labelLeft + (labelW - sigW) / 2, y - sigH - 1, sigW, sigH);
        }
        doc.setDrawColor(80,80,80); doc.line(labelLeft, y, x, y);
        doc.text(label, x, y + 4, { align: "right" });
      };

      // Draw page-number footer on every page (per-page dimensions so
      // portrait and landscape pages both center correctly)
      const addPageNum = () => {
        const total = doc.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
          doc.setPage(i);
          const ipw = doc.internal.pageSize.getWidth();
          const iph = doc.internal.pageSize.getHeight();
          doc.setFont("times", "normal"); doc.setFontSize(7.5);
          doc.text(`Page ${i} of ${total}`, ipw / 2, iph - 5, { align: "center" });
        }
      };

      const addTitle = (form: string, rule: string, title: string) => {
        doc.setFont("times", "bold"); doc.setFontSize(14);
        doc.text(form, pw / 2, M, { align: "center" });
        doc.setFontSize(10); doc.text(rule, pw / 2, M + 6, { align: "center" });
        doc.setFontSize(12); doc.text(title.toUpperCase(), pw / 2, M + 12, { align: "center" });
        doc.setDrawColor(80, 80, 80); doc.line(M, M + 15, pw - M, M + 15);
      };

      const addHdr = (extra?: [string, string][]): number => {
        const rows: [string, string][] = [
          ["Name and address of Contractor",                                          v(company.name, company.address)],
          ["Name and address of establishment in/under which contract is carried on", v(cl?.client_name, cl?.client_address)],
          ["Nature and location of work",                                               v(cl?.nature_of_work, cl?.location_of_work)],
          ["Name and address of Principal Employer",                                  v(cl?.principal_employer_name, cl?.principal_employer_address)],
          ...(extra || []),
        ];
        let cy = M + 19;  // start just below the title divider line
        const maxValW = pw - M * 2 - 80; // 80mm max for label width
        rows.forEach(([lbl, val]) => {
          doc.setFont("times", "bold"); doc.setFontSize(8.5);
          doc.text(lbl + " : ", M, cy);
          const lw = doc.getTextWidth(lbl + " : ");
          doc.setFont("times", "normal"); doc.setFontSize(8.5);
          const lines: string[] = doc.splitTextToSize(val, pw - M - lw - M);
          lines.forEach((line: string, i: number) => {
            doc.text(line, M + lw, cy + i * LH);
          });
          cy += Math.max(1, lines.length) * LH + 1;
        });
        doc.setDrawColor(80, 80, 80); doc.line(M, cy, pw - M, cy);
        return cy + 4;
      };

      // Format current date as "7 April 2026"
      const todayFmt = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

      const addFooter = (y: number) => {
        // `y` is the table bottom + small gap. The signature image is drawn
        // ~15mm ABOVE the line, so leave room or push the block to a new page.
        const sigBlockH = 24;
        let topY = y;
        if (topY + sigBlockH > ph - M) {
          doc.addPage("a4", pw > ph ? "landscape" : "portrait");
          pw = doc.internal.pageSize.getWidth();
          ph = doc.internal.pageSize.getHeight();
          topY = M + 8;
        }
        const lineY = topY + 16;  // signature line sits clear below the table
        doc.setFont("times", "normal"); doc.setFontSize(8.5);
        doc.text(`Place : ${v(cl?.location_of_work)}`, M, lineY);
        doc.text(`Date  : ${todayFmt}`, M, lineY + 5);
        drawSig(pw - M, lineY);
      };

      const lastY = () => (doc as any).lastAutoTable.finalY;

      const TS = { font: "times" as const, fontSize: 8, lineWidth: 0.3, lineColor: [50,50,50] as [number,number,number], valign: "top" as const, overflow: "linebreak" as const, cellPadding: 2 };
      const TH = { fillColor: [220,230,241] as [number,number,number], textColor: [0,0,0] as [number,number,number], fontStyle: "bold" as const, halign: "center" as const, fontSize: 8, lineWidth: 0.3, lineColor: [50,50,50] as [number,number,number], cellPadding: 2 };

      // ── Form VIII ──────────────────────────────────────────────────────────
      addTitle(pf("contractor").no, `[${pf("contractor").rule}]`, pf("contractor").title);
      // addHdr already outputs "Nature and location of work" — no extra row needed here
      let y = addHdr();
      doc.setFont("times", "bold"); doc.setFontSize(9.5); doc.text("PART – I", M, y); y += 5;
      const periodStr = (() => {
        const s = (cl as any)?.project_start_date ? fmtDate((cl as any).project_start_date) : "";
        const e = (cl as any)?.project_end_date   ? fmtDate((cl as any).project_end_date)   : "";
        if (!s && !e) return "—";
        return s ? (e ? `${s}  to  ${e}` : `${s}  to  —`) : `—  to  ${e}`;
      })();
      autoTbl(doc, {
        startY: y,
        head: [["Period of contract", "Amount value of contract work", "Maximum no. of workmen\nemployed by the contractor", "Security deposited with\nthe principal employer"]],
        body:  [[periodStr, "—", String(clraData.viii.maxWorkmen || "—"), "—"]],
        styles: TS, headStyles: TH, columnStyles: { 0:{ halign:"center" }, 1:{ halign:"center" }, 2:{ halign:"center" }, 3:{ halign:"center" } }, margin:{ left:M, right:M },
      });
      y = lastY() + 6;
      doc.setFont("times", "bold"); doc.setFontSize(9.5); doc.text("Part II — Progress of Contract Work", M, y); y += 5;
      autoTbl(doc, {
        startY: y,
        head: [["Wage Period", "Total Amount of wages earned by the workmen", "Amount actually disbursed on pay day"]],
        body:  [[`${monthFull}-${toYear}`, clraData.viii.totalWages ? clraData.viii.totalWages.toLocaleString("en-IN") : "—", clraData.viii.disbursedWages ? clraData.viii.disbursedWages.toLocaleString("en-IN") : "—"]],
        styles: TS, headStyles: TH, columnStyles: { 0:{ halign:"center" }, 1:{ halign:"center" }, 2:{ halign:"center" } }, margin:{ left:M, right:M },
      });
      addFooter(lastY() + 8);

      // ── Form IX — Workmen Register ─────────────────────────────────────────
      // Landscape A4 usable width = 297 - 28 = 269mm
      // Column widths: 10+28+14+24+14+22+44+40+19+19+35 = 269mm
      doc.addPage(); addTitle(pf("workmen").no, `[${pf("workmen").rule}]`, pf("workmen").title);
      y = addHdr();
      autoTbl(doc, {
        startY: y,
        head: [["Sr.\nNo.", "Name and\nsurname of\nworkman", "Age\nand\nSex", "Father's /\nHusband's\nName", "Wages\nPeriod", "Designation", "Permanent home\naddress of workman", "Present address", "Date of\nJoining", "Date of\nLeaving", "Signature /\nThumb\nImpression"]],
        body: clraData.ix.employees.map(e => [
          e.serialNo,
          e.name,
          `${e.age ? e.age + ",\n" : ""}${e.sex || ""}`,
          e.fatherHusbandName || "—",
          e.wagesPeriod || "Monthly",
          e.designation || "—",
          e.permanentAddress || "—",
          e.presentAddress || "—",
          fmtDate((e as any).assignedDate || e.dateOfJoining) || "—",
          fmtDate((e as any).deassignedDate || e.dateOfLeaving) || "—",
          "",
        ]),
        styles: { ...TS, minCellHeight: 10 }, headStyles: TH,
        columnStyles: {
          0:  { cellWidth: 10, halign: "center" },
          1:  { cellWidth: 28 },
          2:  { cellWidth: 14, halign: "center" },
          3:  { cellWidth: 24 },
          4:  { cellWidth: 14, halign: "center" },
          5:  { cellWidth: 22 },
          6:  { cellWidth: 44 },
          7:  { cellWidth: 40 },
          8:  { cellWidth: 19, halign: "center" },
          9:  { cellWidth: 19, halign: "center" },
          10: { cellWidth: 35 },
        },
        margin: { left: M, right: M },
      });
      addFooter(lastY() + 8);

      // ── Form X — Employment Card (PORTRAIT, 2-up stacked TOP/BOTTOM) ─────────
      {
        // Switch to portrait for this section. Each slot is full page width
        // (~182mm) × half page height (~132mm tall) — top half and bottom half.
        goPortrait();
        const slotW  = pw - 2 * M;                          // ~182mm wide
        const slotH  = Math.floor((ph - 2 * M - 4) / 2);    // ~132mm tall per slot
        const slot2Y = M + slotH + 4;                       // bottom slot y start
        const divY   = M + slotH + 2;                       // horizontal divider y

        const drawVDivX = () => {
          doc.setDrawColor(140); doc.setLineDashPattern([5, 3], 0);
          doc.line(M, divY, pw - M, divY);
          doc.setLineDashPattern([], 0); doc.setDrawColor(50);
        };

        const drawXSlot = (sy: number, e: any, w: any) => {
          const sx = M;
          const mr = M;                  // right margin for autoTbl
          const cx = sx + slotW / 2;     // centre of this slot
          let cy = sy;
          doc.setFont("times", "bold"); doc.setFontSize(11);
          doc.text(pf("employmentCard").no.toUpperCase(), cx, cy + 6, { align: "center" });
          doc.setFont("times", "normal"); doc.setFontSize(8);
          doc.text(`[${pf("employmentCard").rule}]`, cx, cy + 11, { align: "center" });
          doc.setFont("times", "bold"); doc.setFontSize(10);
          doc.text(pf("employmentCard").title.toUpperCase(), cx, cy + 16, { align: "center" });
          doc.setDrawColor(80, 80, 80); doc.line(sx, cy + 18, sx + slotW, cy + 18); cy += 22;
          ([ ["Name and address of Contractor",                                          v(company.name, company.address)],
             ["Name and address of establishment in/under which contract is carried on", v(cl?.client_name, cl?.client_address)],
             ["Nature and location of work",                                               v(cl?.nature_of_work, cl?.location_of_work)],
             ["Name and address of Principal Employer",                                  v(cl?.principal_employer_name, cl?.principal_employer_address)],
          ] as [string, string][]).forEach(([lbl, val]) => {
            doc.setFont("times", "bold"); doc.setFontSize(7.5); doc.text(lbl + " : ", sx, cy);
            const lw = doc.getTextWidth(lbl + " : ");
            doc.setFont("times", "normal"); doc.setFontSize(7.5);
            const ls: string[] = doc.splitTextToSize(val, slotW - lw);
            ls.forEach((l: string, i: number) => doc.text(l, sx + lw, cy + i * 3.5));
            cy += Math.max(1, ls.length) * 3.5 + 0.5;
          });
          doc.setDrawColor(80, 80, 80); doc.line(sx, cy, sx + slotW, cy); cy += 3;
          ([ ["Name of the Workman",       e.name || "—"],
             ["Father's / Husband's Name", e.fatherHusbandName || "—"],
             ["Designation",               e.designation || "LABOUR"],
             ["Date of Assign",            fmtDate(e.assignedDate || e.dateOfJoining) || "—"],
             ["Rate of Wages",             w?.monthlyRate ? `Rs. ${Number(w.monthlyRate).toLocaleString("en-IN")} (Monthly)` : (e.wagesPeriod || "Monthly")],
          ] as [string, string][]).forEach(([lbl, val]) => {
            doc.setFont("times", "bold"); doc.setFontSize(8); doc.text(lbl + " : ", sx, cy);
            const lw = doc.getTextWidth(lbl + " : ");
            doc.setFont("times", "normal"); doc.setFontSize(8);
            const ls: string[] = doc.splitTextToSize(val, slotW - lw);
            ls.forEach((l: string, i: number) => doc.text(l, sx + lw, cy + i * 4.5));
            cy += Math.max(1, ls.length) * 4.5;
          });
          doc.setDrawColor(80, 80, 80); doc.line(sx, cy, sx + slotW, cy); cy += 2;
          autoTbl(doc, {
            startY: cy,
            head: [["Sl.\nNo.", "Designation", "Rate of Wages", "Wages\nPeriod", "Date of\nJoining", "Remarks"]],
            body: [[e.serialNo, e.designation || "LABOUR", w?.monthlyRate ? `Rs. ${Number(w.monthlyRate).toLocaleString("en-IN")} Monthly` : "—", e.wagesPeriod || "Monthly", fmtDate(e.assignedDate || e.dateOfJoining) || "—", ""]],
            styles: { ...TS, fontSize: 8 }, headStyles: { ...TH, fontSize: 8 },
            // Widths scaled to slotW ≈ 182mm: 17+36+44+25+30+30 = 182mm
            columnStyles: { 0:{ cellWidth:17, halign:"center" }, 1:{ cellWidth:36 }, 2:{ cellWidth:44 }, 3:{ cellWidth:25, halign:"center" }, 4:{ cellWidth:30, halign:"center" }, 5:{ cellWidth:30 } },
            margin: { left: sx, right: mr },
          });
          const fy = lastY() + 6;
          doc.setFont("times", "normal"); doc.setFontSize(7.5);
          doc.text(`Place : ${v(cl?.location_of_work)}`, sx, fy);
          drawSig(sx + slotW, fy);
        };

        const wageMap    = new Map(clraData.xiii.employees.map((e: any) => [e.name, e]));
        const joinersThisMonth = clraData.ix.employees.filter((e: any) => {
          const d = new Date((e as any).assignedDate || e.dateOfJoining);
          return !isNaN(d.getTime()) && d.getFullYear() === parseInt(toYear) && d.getMonth() === monthIdx;
        });

        if (joinersThisMonth.length === 0) {
          addTitle(pf("employmentCard").no, `[${pf("employmentCard").rule}]`, pf("employmentCard").title);
          y = addHdr();
          doc.setFont("times", "italic"); doc.setFontSize(10);
          doc.text(`No employees joined this project in ${monthFull} ${toYear}.`, pw / 2, y + 12, { align: "center" });
        } else {
          for (let i = 0; i < joinersThisMonth.length; i += 2) {
            if (i > 0) doc.addPage("a4", "portrait");
            drawVDivX();
            drawXSlot(M, joinersThisMonth[i], wageMap.get(joinersThisMonth[i].name));
            if (joinersThisMonth[i + 1]) drawXSlot(slot2Y, joinersThisMonth[i + 1], wageMap.get(joinersThisMonth[i + 1].name));
          }
        }
      }

      // ── Form XI — Service Certificate (PORTRAIT, 2-up stacked TOP/BOTTOM) ────
      {
        goPortrait();
        const slotW  = pw - 2 * M;                          // ~182mm wide
        const slotH  = Math.floor((ph - 2 * M - 4) / 2);    // ~132mm tall per slot
        const slot2Y = M + slotH + 4;                       // bottom slot y start
        const divY   = M + slotH + 2;                       // horizontal divider y

        const wMap  = new Map(clraData.xiii.employees.map((e: any) => [e.name, e]));

        const drawVDivXI = () => {
          doc.setDrawColor(140); doc.setLineDashPattern([5,3], 0);
          doc.line(M, divY, pw - M, divY);
          doc.setLineDashPattern([], 0); doc.setDrawColor(50);
        };

        const drawXISlot = (sy: number, e: any, w: any) => {
          const sx = M;
          const mr = M;
          const cx = sx + slotW / 2;
          let cy = sy;
          doc.setFont("times","bold"); doc.setFontSize(11);
          doc.text(pf("serviceCert").no.toUpperCase(), cx, cy+6, {align:"center"});
          doc.setFont("times","normal"); doc.setFontSize(8);
          doc.text(`[${pf("serviceCert").rule}]`, cx, cy+11, {align:"center"});
          doc.setFont("times","bold"); doc.setFontSize(10);
          doc.text(pf("serviceCert").title.toUpperCase(), cx, cy+16, {align:"center"});
          doc.setDrawColor(80,80,80); doc.line(sx, cy+18, sx+slotW, cy+18); cy += 22;
          ([ ["Name and address of Contractor",                                          v(company.name, company.address)],
             ["Name and address of establishment in/under which contract is carried on", v(cl?.client_name, cl?.client_address)],
             ["Nature and location of work",                                               v(cl?.nature_of_work, cl?.location_of_work)],
             ["Name and address of Principal Employer",                                  v(cl?.principal_employer_name, cl?.principal_employer_address)],
             ["Workman Name",      e.name || "—"],
             ["Age / DOB",         e.age ? `${e.age} yr` : "—"],
             ["Father's / Husband's Name", e.fatherHusbandName || "—"],
          ] as [string,string][]).forEach(([lbl, val]) => {
            doc.setFont("times","bold"); doc.setFontSize(7.5); doc.text(lbl+" : ", sx, cy);
            const lw = doc.getTextWidth(lbl+" : ");
            doc.setFont("times","normal"); doc.setFontSize(7.5);
            const ls: string[] = doc.splitTextToSize(val, slotW - lw);
            ls.forEach((l:string, i:number) => doc.text(l, sx+lw, cy+i*3.5));
            cy += Math.max(1, ls.length)*3.5 + 0.5;
          });
          doc.setDrawColor(80,80,80); doc.line(sx, cy, sx+slotW, cy); cy += 3;
          // 10 columns sized for portrait slotW ≈ 182mm
          // 10+18+18+12+21+15+25+28+25+10 = 182mm
          const fromD = fmtDate((e as any).assignedDate || e.dateOfJoining) || "—";
          const toD   = fmtDate((e as any).deassignedDate || e.dateOfLeaving) || "—";
          const _s = new Date((e as any).assignedDate || e.dateOfJoining);
          const _t = new Date((e as any).deassignedDate || e.dateOfLeaving);
          const calDaysPdf = (!isNaN(_s.getTime()) && !isNaN(_t.getTime()))
            ? String(Math.round((_t.getTime() - _s.getTime()) / 86400000) + 1)
            : String(w?.payDays ?? "—");
          autoTbl(doc, {
            startY: cy,
            head:[["Sr.\nNo.","From","To","Days\nWrkd","Nature\nof Work","Rate\nof Wage","Total Wages\nEarned (Rs.)","Deductions","Net Wages\nPaid (Rs.)","Rmks"]],
            body:[[e.serialNo, fromD, toD, calDaysPdf, e.designation||"LABOUR", "Monthly",
              w ? w.totalEarnings.toLocaleString("en-IN") : "—",
              w ? `PF:${w.pf||0}\nESI:${w.esi||0}\nLWF:${w.lwf||0}` : "—",
              w ? w.netSalary.toLocaleString("en-IN") : "—", ""]],
            styles:{...TS, fontSize:7, minCellHeight:14}, headStyles:{...TH, fontSize:7},
            columnStyles:{
              0:{cellWidth:10, halign:"center"},
              1:{cellWidth:18, halign:"center"},
              2:{cellWidth:18, halign:"center"},
              3:{cellWidth:12, halign:"center"},
              4:{cellWidth:21},
              5:{cellWidth:15, halign:"center"},
              6:{cellWidth:25, halign:"right"},
              7:{cellWidth:28},
              8:{cellWidth:25, halign:"right"},
              9:{cellWidth:10},
            },
            margin:{left:sx, right:mr},
          });
          const fy = lastY()+6;
          doc.setFont("times","normal"); doc.setFontSize(7.5);
          doc.text(`Place : ${v(cl?.location_of_work)}`, sx, fy);
          drawSig(sx + slotW, fy);
        };

        // Show only employees who left (de-assigned) during the selected month
        const leaversThisMonth = clraData.ix.employees.filter((e: any) => {
          const dateStr = (e as any).deassignedDate || e.dateOfLeaving;
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return !isNaN(d.getTime()) && d.getFullYear() === parseInt(toYear) && d.getMonth() === monthIdx;
        });

        if (leaversThisMonth.length === 0) {
          addTitle(pf("serviceCert").no, `[${pf("serviceCert").rule}]`, pf("serviceCert").title);
          y = addHdr();
          doc.setFont("times", "italic"); doc.setFontSize(10);
          doc.text(`No employees left this project in ${monthFull} ${toYear}.`, pw / 2, y + 12, { align: "center" });
        } else {
          for (let i = 0; i < leaversThisMonth.length; i += 2) {
            if (i > 0) doc.addPage("a4", "portrait");
            drawVDivXI();
            drawXISlot(M, leaversThisMonth[i], wMap.get(leaversThisMonth[i].name));
            if (leaversThisMonth[i + 1]) drawXISlot(slot2Y, leaversThisMonth[i + 1], wMap.get(leaversThisMonth[i + 1].name));
          }
        }
      }

      // ── Form XII — Muster Roll (LANDSCAPE) ─────────────────────────────────
      goLandscape(); addTitle(pf("musterRoll").no, `[${pf("musterRoll").rule}]`, pf("musterRoll").title);
      y = addHdr([["For the month of", `${monthFull} ${toYear}`]]);
      const days = Array.from({ length: clraData.xii.daysInMonth }, (_, i) => i + 1);
      const usableW  = pw - M * 2;               // 297-28 = 269mm
      const fixedW   = 8 + 24 + 18 + 10;         // S.No + Name + Father + Gender = 60mm
      const summaryW = 12 + 10 + 13;             // TotalPresent + WO+HD + NetPayDays = 35mm
      const dayW     = parseFloat(((usableW - fixedW - summaryW) / days.length).toFixed(2));
      autoTbl(doc, {
        startY: y,
        head: [["S.\nNo.", "Name of\nEmployee", "Father's /\nHusband's\nName", "G", ...days.map(d => String(d)), "Pres.", "WO\n+HD", "Net\nDays"]],
        body: clraData.xii.employees.map(e => [e.serialNo, e.name, e.fatherHusbandName||"—", (e.gender||"").charAt(0), ...days.map(d => e.attendance[d]||""), e.presentDays, e.woHd, e.netPayDays]),
        styles: { ...TS, fontSize: 6, cellPadding: 1 }, headStyles: { ...TH, fontSize: 6, cellPadding: 1 },
        columnStyles: {
          0:{ cellWidth:8, halign:"center" }, 1:{ cellWidth:24 }, 2:{ cellWidth:18 }, 3:{ cellWidth:10, halign:"center" },
          ...Object.fromEntries(days.map((_, i) => [i + 4, { cellWidth: dayW, halign: "center" as const }])),
          [4 + days.length]:     { cellWidth: 12, halign: "center" as const },
          [4 + days.length + 1]: { cellWidth: 10, halign: "center" as const },
          [4 + days.length + 2]: { cellWidth: 13, halign: "center" as const },
        },
        margin:{ left:M, right:M },
      });
      addFooter(lastY() + 8);

      // ── Form XIII — Register of Wages ──────────────────────────────────────
      // Groups: Amount of Wages Rate | Amount of Wages Earned | Deductions
      // Allowances = single column (HRA + other combined)
      // Rate columns use monthly setup amounts; Earned columns use adjusted/prorated amounts
      // Days = from adjustment tab (original_attendance → adjusted_attendance)
      // Deductions: PF, ESIC, LWF, Adv only
      // Col widths: 8+38+9+20+9 | 13+13+12 | 14+14+12+13 | 12+12+10+10+11 | 16+23 = 269mm
      doc.addPage(); addTitle(pf("wages").no, `[${pf("wages").rule}]`, pf("wages").title);
      y = addHdr([["For the month of", `${monthFull} ${toYear}`]]);
      {
        const n0  = (n: number | null | undefined) => (n != null && n !== 0) ? n.toLocaleString("en-IN") : "0";
        const R_BG: [number,number,number] = [204, 229, 255]; // blue  – Rate
        const A_BG: [number,number,number] = [200, 230, 201]; // green – Earned
        const D_BG: [number,number,number] = [252, 228, 236]; // pink  – Deductions
        const thRate = { ...TH, fillColor: R_BG };
        const thEarn = { ...TH, fillColor: A_BG };
        const thDed  = { ...TH, fillColor: D_BG };
        autoTbl(doc, {
          startY: y,
          head: [
            // Row 1 — group headers
            [
              { content: "Sl.\nNo.",                            rowSpan: 2, styles: { ...TH,     cellWidth: 8,  halign:"center", valign:"middle" } },
              { content: "Name and Surname\nS/O Father's Name", rowSpan: 2, styles: { ...TH,     cellWidth: 38,                  valign:"middle" } },
              { content: "Sr.\nNo.",                            rowSpan: 2, styles: { ...TH,     cellWidth: 9,  halign:"center", valign:"middle" } },
              { content: "Designation /\nNature of Work",       rowSpan: 2, styles: { ...TH,     cellWidth: 20,                  valign:"middle" } },
              { content: "No. of\nDays",                        rowSpan: 2, styles: { ...TH,     cellWidth: 9,  halign:"center", valign:"middle" } },
              { content: "Amount of Wages Rate",                colSpan: 3, styles: { ...thRate,               halign:"center"                 } },
              { content: "Amount of Wages Earned",              colSpan: 4, styles: { ...thEarn,               halign:"center"                 } },
              { content: "Deductions",                          colSpan: 5, styles: { ...thDed,                halign:"center"                 } },
              { content: "Net\nAmount\nPaid",                   rowSpan: 2, styles: { ...TH,     cellWidth: 16, halign:"right",  valign:"middle" } },
              { content: "Signature /\nThumb\nImpression",      rowSpan: 2, styles: { ...TH,     cellWidth: 23,                  valign:"middle" } },
            ],
            // Row 2 — sub-column headers
            [
              { content: "Basic",          styles: { ...thRate, cellWidth: 13, halign:"right" } },
              { content: "Allowances",     styles: { ...thRate, cellWidth: 13, halign:"right" } },
              { content: "Total",          styles: { ...thRate, cellWidth: 12, halign:"right", fontStyle:"bold" } },
              { content: "Basic",          styles: { ...thEarn, cellWidth: 14, halign:"right" } },
              { content: "Allowances",     styles: { ...thEarn, cellWidth: 14, halign:"right" } },
              { content: "Bonus",          styles: { ...thEarn, cellWidth: 12, halign:"right" } },
              { content: "Total\n(Gross)", styles: { ...thEarn, cellWidth: 13, halign:"right", fontStyle:"bold" } },
              { content: "PF",             styles: { ...thDed,  cellWidth: 12, halign:"right" } },
              { content: "ESIC",           styles: { ...thDed,  cellWidth: 12, halign:"right" } },
              { content: "LWF",            styles: { ...thDed,  cellWidth: 10, halign:"right" } },
              { content: "Adv.",           styles: { ...thDed,  cellWidth: 10, halign:"right" } },
              { content: "Total\nDed.",    styles: { ...thDed,  cellWidth: 11, halign:"right", fontStyle:"bold" } },
            ],
          ],
          body: clraData.xiii.employees.map(e => {
            const totalDed = (e.pf || 0) + (e.esi || 0) + (e.lwf || 0) + (e.loanDeduction || 0);
            const netPay   = (e.totalEarnings || 0) - totalDed;
            return [
              e.serialNo,
              `${e.name}${e.fatherHusbandName ? "\nS/O " + e.fatherHusbandName : ""}`,
              e.serialNo,
              e.designation || "LABOUR",
              e.payDays ?? "—",
              // Amount of Wages Rate — monthly setup amounts (not prorated)
              (e.setupBasic || 0) > 0 ? (e.setupBasic || 0).toLocaleString("en-IN") : "—",
              (e.setupHra   || 0) > 0 ? (e.setupHra   || 0).toLocaleString("en-IN") : "—",
              (e.monthlyRate|| 0) > 0 ? (e.monthlyRate|| 0).toLocaleString("en-IN") : "—",
              // Amount of Wages Earned — prorated by adjusted days
              n0(e.basicSalary),
              n0(e.hra),
              (e.bonus || 0) > 0 ? (e.bonus || 0).toLocaleString("en-IN") : "0",
              n0(e.totalEarnings),
              // Deductions
              n0(e.pf),
              n0(e.esi),
              n0(e.lwf),
              n0(e.loanDeduction),
              n0(totalDed),
              // Net
              netPay > 0 ? netPay.toLocaleString("en-IN") : "0",
              "",
            ];
          }),
          styles: { ...TS, fontSize: 7.5, minCellHeight: 10 },
          headStyles: TH,
          columnStyles: {
            0:  { halign: "center" },
            2:  { halign: "center" },
            4:  { halign: "center" },
            5:  { halign: "right" },
            6:  { halign: "right" },
            7:  { halign: "right", fontStyle: "bold" },
            8:  { halign: "right" },
            9:  { halign: "right" },
            10: { halign: "right" },
            11: { halign: "right", fontStyle: "bold" },
            12: { halign: "right" },
            13: { halign: "right" },
            14: { halign: "right" },
            15: { halign: "right" },
            16: { halign: "right", fontStyle: "bold" },
            17: { halign: "right", fontStyle: "bold" },
          },
          margin: { left: M, right: M },
        });
      }
      addFooter(lastY() + 8);

      // ── Form XV — Wage Slip (PORTRAIT, one slip per full page) ──────────────
      {
        const wageEmps = clraData.xiii.employees;
        goPortrait();

        const drawXVPage = (e: any) => {
          const sx = M;
          const slotW = pw - 2 * M;   // ~182mm
          const cx = pw / 2;
          let cy = M;

          // Title block
          doc.setFont("times","bold"); doc.setFontSize(13);
          doc.text(pf("wageSlip").no.toUpperCase(), cx, cy + 6, { align: "center" });
          doc.setFont("times","normal"); doc.setFontSize(9);
          doc.text(`[${pf("wageSlip").rule}]`, cx, cy + 12, { align: "center" });
          doc.setFont("times","bold"); doc.setFontSize(11);
          doc.text(pf("wageSlip").title.toUpperCase(), cx, cy + 18, { align: "center" });
          doc.setDrawColor(80,80,80); doc.line(sx, cy + 21, sx + slotW, cy + 21);
          cy += 26;

          // Header rows — bold label + normal value on same line, wrapping
          const hdrRows: [string, string][] = [
            ["Name and address of Contractor",                                          v(company.name, company.address)],
            ["Name and address of establishment in/under which contract is carried on", v(cl?.client_name, cl?.client_address)],
            ["Name and location of work",                                               v(cl?.nature_of_work, cl?.location_of_work)],
            ["Name and address of Principal Employer",                                  v(cl?.principal_employer_name, cl?.principal_employer_address)],
          ];
          hdrRows.forEach(([lbl, val]) => {
            doc.setFont("times","bold"); doc.setFontSize(8.5); doc.text(lbl + " : ", sx, cy);
            const lw = doc.getTextWidth(lbl + " : ");
            doc.setFont("times","normal"); doc.setFontSize(8.5);
            const ls: string[] = doc.splitTextToSize(val, slotW - lw);
            ls.forEach((l: string, i: number) => doc.text(l, sx + lw, cy + i * 4));
            cy += Math.max(1, ls.length) * 4 + 1;
          });

          // "For the month of" row
          doc.setFont("times","bold"); doc.setFontSize(8.5);
          doc.text("For the month of : ", sx, cy);
          doc.setFont("times","normal");
          doc.text(`${monthFull} ${toYear}`, sx + doc.getTextWidth("For the month of : "), cy);
          cy += 5;

          // "Name and Father's Name of the workman" row
          const nameLine = `${e.name}${e.fatherHusbandName ? " S/O " + e.fatherHusbandName : ""}`;
          const nameLabel = "Name and Father's Name of the workman : ";
          doc.setFont("times","bold"); doc.setFontSize(8.5); doc.text(nameLabel, sx, cy);
          const nameLines: string[] = doc.splitTextToSize(nameLine, slotW - doc.getTextWidth(nameLabel));
          nameLines.forEach((l: string, i: number) => doc.text(l, sx + doc.getTextWidth(nameLabel), cy + i * 4));
          cy += Math.max(1, nameLines.length) * 4 + 2;

          doc.setDrawColor(80,80,80); doc.line(sx, cy, sx + slotW, cy); cy += 3;

          // Wage slip table — 9 columns, widths sum to slotW ≈ 182mm
          // 16 + 22 + 22 + 18 + 22 + 18 + 26 + 20 + 18 = 182mm
          autoTbl(doc, {
            startY: cy,
            head: [[
              "No. of\ndays\nworked",
              "Rate of\ndaily wages /\npiece rate",
              "No. of units\nworked in case\nof piece rate\nwork",
              "Dates on\nwhich\novertime\nworked",
              "Overtime hours\nworked and\namount of\novertime wages",
              "Gross\nwages\npayable",
              "Deductions\nif any",
              "Net\namount\npaid",
              "Signature of\nthe contractor\nor his\nrepresentative",
            ]],
            body: [[
              String(e.payDays ?? "—"),
              e.monthlyRate ? `${Number(e.monthlyRate).toLocaleString("en-IN")}\n(Monthly)` : "—",
              "N.A",
              "NIL",
              "0",
              e.totalEarnings ? Number(e.totalEarnings).toLocaleString("en-IN") : "—",
              `PF : ${e.pf||0}\nESIC : ${e.esi||0}\nLWF : ${e.lwf||0}\nADJS : 0`,
              e.netSalary ? Number(e.netSalary).toLocaleString("en-IN") : "—",
              "",
            ]],
            styles: { ...TS, fontSize: 8, minCellHeight: 20, cellPadding: 2, overflow: "linebreak" },
            headStyles: { ...TH, fontSize: 8, cellPadding: 2 },
            columnStyles: {
              0: { cellWidth: 16, halign: "center" },
              1: { cellWidth: 22, halign: "center" },
              2: { cellWidth: 22, halign: "center" },
              3: { cellWidth: 18, halign: "center" },
              4: { cellWidth: 22, halign: "center" },
              5: { cellWidth: 18, halign: "right" },
              6: { cellWidth: 26, halign: "left" },
              7: { cellWidth: 20, halign: "right" },
              8: { cellWidth: 18, halign: "center" },
            },
            margin: { left: sx, right: M },
          });

          const fy = lastY() + 8;
          doc.setFont("times","normal"); doc.setFontSize(8.5);
          doc.text(`Place : ${v(cl?.location_of_work)}`, sx, fy);
          doc.text(`Date : ${todayFmt}`, sx, fy + 5);
          const midX = sx + slotW / 2;
          doc.setDrawColor(80,80,80); doc.line(midX - 28, fy + 8, midX + 28, fy + 8);
          doc.setFont("times","bold"); doc.setFontSize(8.5);
          doc.text("Signature / Thumb Impression of Workman", midX, fy + 12, { align: "center" });
          drawSig(sx + slotW, fy);
        };

        if (wageEmps.length === 0) {
          addTitle(pf("wageSlip").no, `[${pf("wageSlip").rule}]`, pf("wageSlip").title);
          y = addHdr([["For the month of", `${monthFull} ${toYear}`]]);
          doc.setFont("times","italic"); doc.setFontSize(10);
          doc.text("No wage data available.", pw / 2, y + 12, { align: "center" });
        } else {
          wageEmps.forEach((e: any, idx: number) => {
            if (idx > 0) doc.addPage("a4", "portrait");
            drawXVPage(e);
          });
        }
      }

      // ── Form XVI — Damage Register (LANDSCAPE) ─────────────────────────────
      goLandscape(); addTitle(pf("deductions").no, `[${pf("deductions").rule}]`, pf("deductions").title);
      y = addHdr();
      autoTbl(doc, {
        startY: y,
        head: [["S.\nNo.", "Name & Surname\nof Workman", "Designation", "Nature of Damage\nor Loss", "Date of Damage\nor Loss", "Amount of\nDeduction (Rs.)", "Date of\nDeduction", "No. of\nInstalments", "Remarks", "Signature of\nContractor", "Signature /\nThumb Impression\nof Workman"]],
        body: isCentral
          ? [[{ content: nilDeduct, colSpan: 11, styles: { halign: "center", fontStyle: "bold" } }]]
          : clraData.ix.employees.map(e => [e.serialNo, e.name, e.designation||"—", "", "", "", "", "", "", "", ""]),
        styles: { ...TS, minCellHeight: 10 }, headStyles: TH,
        columnStyles: { 0:{ cellWidth:10, halign:"center" }, 1:{ cellWidth:30 }, 10:{ cellWidth:22 } },
        margin:{ left:M, right:M },
      });
      addFooter(lastY() + 8);

      // ── Form XVII — Fines Register ────────────────────────────────────────
      goLandscape(); addTitle(pf("fines").no, `[${pf("fines").rule}]`, pf("fines").title);
      y = addHdr();
      autoTbl(doc, {
        startY: y,
        head: [["S.\nNo.", "Name & Surname\nof Workman", "Designation", "Act or Omission\nfor which Fined", "Date of Act\nor Omission", "Date of Imposition\nof Fine", "Amount of\nFine (Rs.)", "Date of\nRecovery", "Amount of\nRecovery (Rs.)", "Remarks", "Signature /\nThumb Impression\nof Workman"]],
        body: isCentral
          ? [[{ content: nilFine, colSpan: 11, styles: { halign: "center", fontStyle: "bold" } }]]
          : clraData.ix.employees.map(e => [e.serialNo, e.name, e.designation||"—", "", "", "", "", "", "", "", ""]),
        styles: { ...TS, minCellHeight: 10 }, headStyles: TH,
        tableWidth: pw - 2 * M,
        columnStyles: { 0:{ cellWidth:12, halign:"center" }, 1:{ cellWidth:36 }, 2:{ cellWidth:24 }, 3:{ cellWidth:36 }, 4:{ cellWidth:22, halign:"center" }, 5:{ cellWidth:22, halign:"center" }, 6:{ cellWidth:20, halign:"right" }, 7:{ cellWidth:22, halign:"center" }, 8:{ cellWidth:20, halign:"right" }, 9:{ cellWidth:13 }, 10:{ cellWidth:22 } },
        margin:{ left:M, right:M },
      });
      addFooter(lastY() + 8);

      // ── Form XVIII — Advances Register ───────────────────────────────────
      goLandscape(); addTitle(pf("advances").no, `[${pf("advances").rule}]`, pf("advances").title);
      y = addHdr([["For the month of", `${monthFull} ${toYear}`]]);
      autoTbl(doc, {
        startY: y,
        head: [["S.\nNo.", "Name & Surname\nof Workman", "Designation", "Purpose of\nAdvance", "Date of\nAdvance", "Amount of\nAdvance (Rs.)", "Recovery Per\nInstalment (Rs.)", "No. of\nInstalments", "Amount\nRecovered (Rs.)", "Balance\nOutstanding (Rs.)", "Remarks", "Signature /\nThumb Impression\nof Workman"]],
        body: isCentral
          ? [[{ content: nilAdv, colSpan: 12, styles: { halign: "center", fontStyle: "bold" } }]]
          : clraData.xiii.employees.map(e => [e.serialNo, e.name, e.designation||"—", "—", "", e.loanDeduction > 0 ? e.loanDeduction.toLocaleString("en-IN") : "—", e.loanDeduction > 0 ? e.loanDeduction.toLocaleString("en-IN") : "—", e.loanDeduction > 0 ? "1" : "—", e.loanDeduction > 0 ? e.loanDeduction.toLocaleString("en-IN") : "—", "", "", ""]),
        styles: { ...TS, minCellHeight: 10 }, headStyles: TH,
        tableWidth: pw - 2 * M,
        columnStyles: { 0:{ cellWidth:10, halign:"center" }, 1:{ cellWidth:34 }, 2:{ cellWidth:22 }, 3:{ cellWidth:25 }, 4:{ cellWidth:18, halign:"center" }, 5:{ cellWidth:22, halign:"right" }, 6:{ cellWidth:24, halign:"right" }, 7:{ cellWidth:15, halign:"center" }, 8:{ cellWidth:22, halign:"right" }, 9:{ cellWidth:18, halign:"right" }, 10:{ cellWidth:15 }, 11:{ cellWidth:22 } },
        margin:{ left:M, right:M },
      });
      addFooter(lastY() + 8);

      // ── Form XIX — OT Register ────────────────────────────────────────────
      // Uses goLandscape() to guarantee A4 landscape (pw=297) after portrait wage-slip pages.
      // Column widths sum to pw-2*M = 269mm so every column has enough room.
      goLandscape(); addTitle(pf("overtime").no, `[${pf("overtime").rule}]`, pf("overtime").title);
      y = addHdr([["For the month of", `${monthFull} ${toYear}`]]);
      autoTbl(doc, {
        startY: y,
        head: [["S.\nNo.", "Name & Surname\nof Workman", "Designation", "Normal\nWorking\nDays", "OT\nDays", "OT\nHours", "Normal\nWages (Rs.)", "OT\nWages (Rs.)", "Total\nWages (Rs.)", "Signature /\nThumb\nImpression"]],
        body: otHasData
          ? clraData.xviii.employees.map(e => [e.serialNo, e.name, e.designation||"—", e.normalDays, e.otDays, e.otHours, e.normalWages.toLocaleString("en-IN"), e.otWages > 0 ? e.otWages.toLocaleString("en-IN") : "—", (e.normalWages + e.otWages).toLocaleString("en-IN"), ""])
          : [[{ content: nilOT, colSpan: 10, styles: { halign: "center", fontStyle: "bold" } }]],
        styles: TS, headStyles: TH,
        tableWidth: pw - 2 * M,
        columnStyles: {
          0: { cellWidth: 12, halign: "center" },
          1: { cellWidth: 46 },
          2: { cellWidth: 30 },
          3: { cellWidth: 22, halign: "center" },
          4: { cellWidth: 14, halign: "center" },
          5: { cellWidth: 14, halign: "center" },
          6: { cellWidth: 34, halign: "right" },
          7: { cellWidth: 34, halign: "right" },
          8: { cellWidth: 34, halign: "right" },
          9: { cellWidth: 29 },
        },
        margin:{ left:M, right:M },
      });
      addFooter(lastY() + 8);

      addPageNum();
      doc.save(`CLRA-Package-${toMonth}-${toYear}.pdf`);
    } catch (err: any) {
      toast({ title: "PDF Error", description: err.message || "Failed to generate PDF.", variant: "destructive" });
    }
  };

  const downloadExcel = () => {
    if (!workmenData) { toast({ title: "No data", description: "Generate a report first.", variant: "destructive" }); return; }
    if (!selectedState) { toast({ title: "Select a state", description: "Please choose a state before downloading. Form numbering depends on the state.", variant: "destructive" }); return; }
    const c = workmenData.client;
    const val = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(", ") || "";
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
    <x:ExcelWorksheet><x:Name>Workmen Register</x:Name><x:WorksheetOptions>
    <x:Print><x:Orientation>x:Landscape</x:Orientation></x:Print>
    </x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
    <style>
      body { font-family: "Times New Roman", serif; font-size: 11pt; }
      .title { font-size: 14pt; font-weight: bold; text-align: center; }
      .subtitle { font-size: 11pt; font-weight: bold; text-align: center; }
      .hdr td { font-size: 10pt; padding: 2px 0; vertical-align: top; }
      .hdr td:first-child { font-weight: bold; white-space: nowrap; padding-right: 6px; }
      table.main { border-collapse: collapse; width: 100%; margin-top: 10px; }
      table.main th { border: 1px solid #222; background: #dce6f1; font-size: 9pt; text-align: center; padding: 4px; vertical-align: middle; }
      table.main td { border: 1px solid #222; font-size: 9pt; padding: 4px 5px; vertical-align: top; }
      .sno { text-align: center; }
      .footer { margin-top: 24pt; display: flex; justify-content: space-between; }
    </style></head><body>
    <p class="title">${clraForm(selectedState, "workmen").no}</p>
    <p class="subtitle">[${clraForm(selectedState, "workmen").rule}]</p>
    <p class="subtitle">${clraForm(selectedState, "workmen").title.toUpperCase()}</p>
    <br/>
    <table class="hdr"><tbody>
      <tr><td>Name and address of Contractor :</td><td>${val(workmenData.company.name, workmenData.company.address)}</td></tr>
      <tr><td>Name and address of establishment in/under which contract is carried on :</td><td>${val(c?.client_name, c?.client_address)}</td></tr>
      <tr><td>Nature and location of work :</td><td>${val(c?.nature_of_work, c?.location_of_work)}</td></tr>
      <tr><td>Name and address of Principal Employer :</td><td>${val(c?.principal_employer_name, c?.principal_employer_address)}</td></tr>
    </tbody></table>
    <table class="main"><thead><tr>
      <th>Sr. No.</th><th>Name &amp; Surname of Workman</th><th>Age &amp; Sex</th>
      <th>Father's / Husband's Name</th><th>Wages Period</th><th>Designation</th>
      <th>Permanent Home Address of Workman</th><th>Present Address</th>
      <th>Date of Assign</th><th>Date of De-Assign</th><th>Signature / Thumb Impression</th>
    </tr></thead><tbody>
    ${workmenData.employees.map(e => `<tr>
      <td class="sno">${e.serialNo}</td>
      <td><b>${e.name}</b></td>
      <td class="sno">${e.age ? e.age + "," : ""}<br/>${e.sex}</td>
      <td>${e.fatherHusbandName || ""}</td>
      <td class="sno">${e.wagesPeriod}</td>
      <td>${e.designation || ""}</td>
      <td>${e.permanentAddress || ""}</td>
      <td>${e.presentAddress || ""}</td>
      <td class="sno">${fmtDate(e.assignedDate || e.dateOfJoining)}</td>
      <td class="sno">${fmtDate(e.deassignedDate || e.dateOfLeaving)}</td>
      <td></td>
    </tr>`).join("")}
    </tbody></table>
    <table style="width:100%;margin-top:24pt"><tr>
      <td>Place : ${c?.location_of_work || ""}</td>
      <td style="text-align:right;font-weight:bold">Signature of the Contractor</td>
    </tr></table>
    </body></html>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel" }));
    a.download = `${clraForm(selectedState, "workmen").no.replace(/\s+/g, "-")}-Workmen-Register-${toMonth}-${toYear}.xls`;
    a.click();
  };

  const downloadPDF = async () => {
    if (!workmenData) { toast({ title: "No report", description: "Generate a report first.", variant: "destructive" }); return; }
    if (!selectedState) { toast({ title: "Select a state", description: "Please choose a state before downloading. Form numbering depends on the state.", variant: "destructive" }); return; }
    const c = workmenData.client;
    const val = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(", ") || "";

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();

    // Titles
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text(clraForm(selectedState, "workmen").no, pw / 2, 14, { align: "center" });
    doc.setFontSize(11);
    doc.text(`[${clraForm(selectedState, "workmen").rule}]`, pw / 2, 20, { align: "center" });
    doc.text(clraForm(selectedState, "workmen").title.toUpperCase(), pw / 2, 26, { align: "center" });
    doc.setDrawColor(80, 80, 80);
    doc.line(10, 29, pw - 10, 29);

    // Header lines
    const headers = [
      ["Name and address of Contractor : ",                                          val(workmenData.company.name, workmenData.company.address)],
      ["Name and address of establishment in/under which contract is carried on : ", val(c?.client_name, c?.client_address)],
      ["Nature and location of work : ",                                               val(c?.nature_of_work, c?.location_of_work)],
      ["Name and address of Principal Employer : ",                                  val(c?.principal_employer_name, c?.principal_employer_address)],
    ];
    let y = 35;
    headers.forEach(([label, value]) => {
      doc.setFont("times", "bold");
      doc.setFontSize(9);
      const lw = doc.getTextWidth(label);
      doc.text(label, 10, y);
      doc.setFont("times", "normal");
      doc.text(value, 10 + lw, y, { maxWidth: pw - 20 - lw });
      y += 6;
    });

    doc.line(10, y, pw - 10, y);
    y += 3;

    // Main table
    autoTable(doc, {
      startY: y,
      head: [["Sr.\nNo.", "Name & Surname\nof Workman", "Age &\nSex", "Father's /\nHusband's Name", "Wages\nPeriod", "Designation", "Permanent Home\nAddress of Workman", "Present Address", "Date of\nAssign", "Date of\nDe-Assign", "Signature /\nThumb Impression"]],
      body: workmenData.employees.map(e => [
        e.serialNo,
        e.name,
        `${e.age}${e.sex ? ", " + e.sex : ""}`,
        e.fatherHusbandName || "",
        e.wagesPeriod,
        e.designation || "",
        e.permanentAddress || "",
        e.presentAddress || "",
        fmtDate((e as any).assignedDate || e.dateOfJoining),
        fmtDate((e as any).deassignedDate || e.dateOfLeaving),
        "",
      ]),
      styles:     { fontSize: 7.5, font: "times", cellPadding: 2, overflow: "linebreak", valign: "top", lineWidth: 0.25, lineColor: [0, 0, 0] },
      headStyles: { fillColor: [220, 230, 241], textColor: [0, 0, 0], fontStyle: "bold", halign: "center", fontSize: 7.5, lineWidth: 0.25, lineColor: [0, 0, 0] },
      columnStyles: {
        0:  { cellWidth: 10,  halign: "center" },
        1:  { cellWidth: 28 },
        2:  { cellWidth: 15,  halign: "center" },
        3:  { cellWidth: 24 },
        4:  { cellWidth: 16,  halign: "center" },
        5:  { cellWidth: 22 },
        6:  { cellWidth: 42 },
        7:  { cellWidth: 38 },
        8:  { cellWidth: 20,  halign: "center" },
        9:  { cellWidth: 20,  halign: "center" },
        10: { cellWidth: 22 },
      },
      margin: { left: 10, right: 10 },
    });

    // Footer — keep the signature block clear of the table bottom
    const ph2 = doc.internal.pageSize.getHeight();
    let topY = (doc as any).lastAutoTable.finalY + 8;
    if (topY + 24 > ph2 - 10) { doc.addPage(); topY = 18; }
    const lineY = topY + 16;
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.text(`Place : ${val(c?.location_of_work)}`, 10, lineY);

    doc.setFont("times", "bold");
    const label = "Signature of the Contractor";
    const labelW = doc.getTextWidth(label);
    const labelLeft = pw - 10 - labelW;
    const sigUrl = (workmenData.company as any).signature;
    if (sigUrl) {
      try {
        const b64 = await new Promise<string>((res, rej) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const cv = document.createElement("canvas");
            cv.width = img.naturalWidth; cv.height = img.naturalHeight;
            cv.getContext("2d")!.drawImage(img, 0, 0);
            res(cv.toDataURL("image/png"));
          };
          img.onerror = rej;
          img.src = sigUrl;
        });
        const sigW = 36, sigH = 14;
        doc.addImage(b64, "PNG", labelLeft + (labelW - sigW) / 2, lineY - sigH - 1, sigW, sigH);
      } catch { /* signature image failed to load — fall back to text only */ }
    }
    doc.setDrawColor(80, 80, 80); doc.line(labelLeft, lineY, pw - 10, lineY);
    doc.text(label, pw - 10, lineY + 4, { align: "right" });

    doc.save(`Form-IX-Workmen-Register-${toMonth}-${toYear}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Controller */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          {/* Row 1: Project | State | Act */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Select Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">{companyName}</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Select State</Label>
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select state..." /></SelectTrigger>
                <SelectContent>{REPORT_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Select Act</Label>
              <Select value={selectedAct} onValueChange={setSelectedAct}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select act..." /></SelectTrigger>
                <SelectContent>{REPORT_ACTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {/* Row 2: Report | From | To | Buttons */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-xs text-gray-500">Select Report</Label>
              <Select value={selectedReport} onValueChange={setSelectedReport}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select report type..." /></SelectTrigger>
                <SelectContent>{REPORT_TYPES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <MonthYearPicker label="Month" month={toMonth} year={toYear} onMonth={setToMonth} onYear={setToYear} />
            <div className="flex items-end gap-2 pb-0">
              <Button onClick={loadReport} disabled={loading} className="h-9 bg-blue-600 hover:bg-blue-700 text-white">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Loading..." : "View"}
              </Button>
              {loaded && hasReport && (<>
                {isWorkmenRegister ? (<>
                  <Button variant="outline" onClick={downloadPDF} className="h-9 border-red-200 text-red-600 hover:bg-red-50">
                    <Download className="h-4 w-4 mr-1.5" /> PDF
                  </Button>
                  <Button variant="outline" onClick={downloadExcel} className="h-9 border-green-300 text-green-700 hover:bg-green-50">
                    <Download className="h-4 w-4 mr-1.5" /> Excel
                  </Button>
                </>) : isCLRAPackage ? (
                  <Button variant="outline" onClick={downloadCLRAPackagePDF} className="h-9 border-purple-300 text-purple-700 hover:bg-purple-50">
                    <Download className="h-4 w-4 mr-1.5" /> Download CLRA Package PDF
                  </Button>
                ) : (
                  <Button variant="outline" onClick={printReport} className="h-9 border-indigo-300 text-indigo-700 hover:bg-indigo-50">
                    <Download className="h-4 w-4 mr-1.5" /> Download
                  </Button>
                )}
              </>)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Output */}
      {loaded && hasReport && (
        <Card className="overflow-hidden">
          <div id="report-print-area">
            {isCLRAPackage                                            && clraData     && <CLRAPackageView data={clraData} state={selectedState} />}
            {isWorkmenRegister && workmenData && <WorkmenRegisterView data={workmenData} state={selectedState} />}
            {selectedReport === "Form VIII – Contractor Particulars"  && formVIIIData && <FormVIIIView data={formVIIIData} state={selectedState} />}
            {selectedReport === "Form XII – Muster Roll"              && musterData   && <MusterRollView data={musterData} state={selectedState} />}
            {selectedReport === "Form XIII – Wages Register"          && wagesData    && <WagesRegisterView data={wagesData} state={selectedState} />}
            {selectedReport === "Form XIV – Wage Slip"                && wagesData    && <WageSlipView data={wagesData} state={selectedState} />}
            {selectedReport === "Form XV – Deductions Register"       && workmenData  && <DeductionsRegisterView data={workmenData} month={toMonth} year={toYear} state={selectedState} />}
            {selectedReport === "Form XVI – Fines Register"           && workmenData  && <FinesRegisterView data={workmenData} month={toMonth} year={toYear} state={selectedState} />}
            {selectedReport === "Form XVII – Advances Register"       && wagesData    && <AdvancesRegisterView data={wagesData} state={selectedState} />}
            {selectedReport === "Form XVIII – OT Register"            && otData       && <OTRegisterView data={otData} state={selectedState} />}
            {selectedReport === "Form XIX – Annual Return"            && workmenData  && <AnnualReturnView data={workmenData} fromYear={toYear} toYear={toYear} state={selectedState} />}
          </div>
        </Card>
      )}

      {loaded && !hasReport && (
        <Card>
          <CardContent className="py-14 text-center text-gray-400">
            <FileBarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No data found for the selected period.</p>
            <p className="text-xs mt-1">Try a different month / project combination.</p>
          </CardContent>
        </Card>
      )}

      {!loaded && !loading && (
        <Card>
          <CardContent className="py-14 text-center text-gray-400">
            <FileBarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Select a report and click View</p>
            <p className="text-xs mt-1">All 10 Haryana Contract Labour Act forms are available above.</p>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
