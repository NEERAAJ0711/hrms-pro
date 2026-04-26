import { useState, useEffect, useCallback } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
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
  Download, AlertTriangle, Building2, Trash2, Settings2, Users, ArrowLeft, CheckCircle,
  Briefcase, Plus, UserPlus, UserMinus, CalendarDays, XCircle, FileBarChart2, ChevronDown,
} from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const COMPLIANCE_TYPES = ["PF","ESI","Professional Tax","Labour Dept","Minimum Wage","ESIC Inspection","Custom"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const REPORT_STATES = ["Delhi","Uttar Pradesh","Haryana","Maharashtra","Karnataka","Rajasthan","Gujarat","Punjab","Madhya Pradesh","Telangana"];
const REPORT_ACTS   = ["Contract Labour (R&A) Act","Minimum Wages Act","Payment of Wages Act","ESI Act","EPF & MP Act","Maternity Benefit Act","Payment of Bonus Act","Factories Act"];
const REPORT_TYPES  = [
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
}

interface EmployeeRow {
  employeeId:   string;
  employeeCode: string;
  employeeName: string;
  department:   string;
  designation:  string;
  monDays:      number;
  payDays:      number;
  rBasic:  number; rHra: number; rConv: number; rTotal: number;
  eBasic:  number; eHra: number; eConv: number; eOth: number; bonus: number; eTotal: number;
  pfType: string; esicType: string; lwfType: string; bonusType: string; diffAdj: string;
  otType: string;
  pf: number; esic: number; lwf: number; tds: number; pt: number; otherDed: number; loanAdv: number; dTotal: number; netPay: number;
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
  const isSuperAdmin = user?.role === "super_admin";

  const [companies, setCompanies] = useState<{ id: string; company_name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");

  // Load companies once for super_admin
  useEffect(() => {
    if (isSuperAdmin) {
      fetch("/api/compliance/companies", { credentials: "include" })
        .then(r => r.json())
        .then(data => { setCompanies(data); if (data.length > 0) setSelectedCompany(data[0].id); })
        .catch(() => {});
    }
  }, [isSuperAdmin]);

  const effectiveCompanyId = isSuperAdmin ? selectedCompany : (user?.companyId || "");

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
    const filtered = rows.filter(r =>
      !search ||
      r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      r.employeeCode.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Employee-wise Compliance Setup</CardTitle>
              <CardDescription>Click Configure to set statutory & payroll rules per employee.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading || !companyId}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
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
                  <TableHead className="font-semibold w-28">Code</TableHead>
                  <TableHead className="font-semibold">Employee Name</TableHead>
                  <TableHead className="font-semibold">Department</TableHead>
                  <TableHead className="font-semibold">Designation</TableHead>
                  <TableHead className="font-semibold">PF</TableHead>
                  <TableHead className="font-semibold">ESIC</TableHead>
                  <TableHead className="font-semibold">LWF</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(row => (
                  <TableRow key={row.employeeId} className="hover:bg-gray-50">
                    <TableCell className="text-xs font-mono text-gray-500">{row.employeeCode}</TableCell>
                    <TableCell className="font-medium text-gray-800">{row.employeeName}</TableCell>
                    <TableCell className="text-sm text-gray-600">{row.department || row.empDepartment || <span className="text-gray-300">—</span>}</TableCell>
                    <TableCell className="text-sm text-gray-600">{row.designation || row.empDesignation || <span className="text-gray-300">—</span>}</TableCell>
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

// ─── Shared helper: compute adjusted pay-days for compliance display ───────────
// Priority:
//  1. If pfType="actual"  → back-calc from actual PF amount  → ensures PF is consistent
//  2. If esicType="actual"→ back-calc from actual ESIC amount→ ensures ESIC is consistent
//  3. Both "actual"       → pick whichever is closer to the net-pay back-calc
//  4. Neither             → back-calc from net pay (compPayable ≈ netPay)
function computeAdjPayDays(
  pfType: string, esicType: string,
  pf: number, esic: number,
  rBasic: number, rTotal: number,
  monDays: number, netPay: number, totalDeds: number, payDays: number
): number {
  if (monDays <= 0) return payDays;

  // Base: back-calculate from net pay
  const netDays = rTotal > 0
    ? Math.min(monDays, Math.max(0, Math.round((netPay + totalDeds) * monDays / rTotal)))
    : payDays;

  // PF-based: pf = 0.12 × rBasic × days/monDays  →  days = pf × monDays / (0.12 × rBasic)
  let pfDays: number | null = null;
  if (pfType === "actual" && pf > 0 && rBasic > 0) {
    pfDays = Math.min(monDays, Math.max(0, Math.round(pf * monDays / (0.12 * rBasic))));
  } else if (pfType === "actual" && pf === 0) {
    // No PF deducted → 0 days (employee absent / no payroll)
    pfDays = 0;
  }

  // ESIC-based: esic = 0.0075 × min(rTotal,21000) × days/monDays
  let esicDays: number | null = null;
  const esicBase = Math.min(rTotal, ESIC_CEILING);
  if (esicType === "actual" && esic > 0 && esicBase > 0) {
    esicDays = Math.min(monDays, Math.max(0, Math.round(esic * monDays / (0.0075 * esicBase))));
  } else if (esicType === "actual" && esic === 0) {
    esicDays = 0;
  }

  if (pfDays !== null && esicDays !== null) {
    // Both actual: pick whichever best matches net pay
    return Math.abs(pfDays - netDays) <= Math.abs(esicDays - netDays) ? pfDays : esicDays;
  }
  if (pfDays !== null)   return pfDays;
  if (esicDays !== null) return esicDays;
  return netDays;
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

  const set = (field: keyof EmployeeSetup, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // ── Derived limits for Basic (PF) and Gross (ESIC) ────────────────────────
  const actualBasic = setup.originalBasicSalary || 0;
  const actualGross = setup.originalGrossSalary || 0;
  // PF Actual:
  //   If actualBasic <= ceiling → min=actualBasic, max=ceiling
  //   If actualBasic >  ceiling → only ceiling is valid (min=max=ceiling)
  // PF Exempted: min = ceiling
  // ESIC Actual: same logic with ESIC_CEILING
  // ESIC Exempted: min = ESIC_CEILING

  const basicMin = form.pfType === "actual"   ? Math.min(actualBasic, PF_CEILING)    : form.pfType === "exempted" ? PF_CEILING   : 0;
  const basicMax = form.pfType === "actual"   ? PF_CEILING  : undefined;
  const grossMin = form.esicType === "actual" ? Math.min(actualGross, ESIC_CEILING)  : form.esicType === "exempted" ? ESIC_CEILING : 0;
  const grossMax = form.esicType === "actual" ? ESIC_CEILING : undefined;

  // Helper: validate and clamp a salary value
  const clampBasic = (raw: string) => {
    const v = parseFloat(raw);
    if (isNaN(v)) return raw;
    if (basicMax !== undefined && v > basicMax) return String(basicMax);
    if (v < basicMin) return String(basicMin);
    return String(v);
  };
  const clampGross = (raw: string) => {
    const v = parseFloat(raw);
    if (isNaN(v)) return raw;
    if (grossMax !== undefined && v > grossMax) return String(grossMax);
    if (v < grossMin) return String(grossMin);
    return String(v);
  };

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

  // ── Same As Actual: clear manual basic/gross ──────────────────────────────
  const onSameAsActualChange = (checked: boolean) => {
    setForm(prev => ({ ...prev, sameAsActual: checked, basicSalary: checked ? "" : prev.basicSalary, grossSalary: checked ? "" : prev.grossSalary }));
  };

  // ── Hint text builders ────────────────────────────────────────────────────
  const basicHint = () => {
    if (form.sameAsActual) return "Using payroll values";
    if (form.pfType === "actual") {
      if (actualBasic >= PF_CEILING) return `Actual basic ₹${actualBasic.toLocaleString()} exceeds ceiling — enter ₹${PF_CEILING.toLocaleString()}`;
      return `Min ₹${actualBasic.toLocaleString()} · Max ₹${PF_CEILING.toLocaleString()}`;
    }
    if (form.pfType === "exempted") return `Min ₹${PF_CEILING.toLocaleString()} (PF ceiling)`;
    return null;
  };
  const grossHint = () => {
    if (form.sameAsActual) return "Using payroll values";
    if (form.esicType === "actual") {
      if (actualGross >= ESIC_CEILING) return `Actual gross ₹${actualGross.toLocaleString()} exceeds ceiling — enter ₹${ESIC_CEILING.toLocaleString()}`;
      return `Min ₹${actualGross.toLocaleString()} · Max ₹${ESIC_CEILING.toLocaleString()}`;
    }
    if (form.esicType === "exempted") return `Min ₹${ESIC_CEILING.toLocaleString()} (ESIC ceiling)`;
    return null;
  };

  // ── OT hint ───────────────────────────────────────────────────────────────
  const otHints: Record<string, string> = {
    actual: "Same OT hours & amount as payroll",
    double: "OT hours ÷ 2, same OT amount",
    adjust: "OT hours & amount = 0; added to net pay",
    na: "No OT",
  };

  const save = async () => {
    // Validate basic/gross before save
    const basicVal = form.basicSalary !== "" ? parseFloat(form.basicSalary) : null;
    const grossVal = form.grossSalary !== "" ? parseFloat(form.grossSalary) : null;

    if (!form.sameAsActual) {
      if (form.pfType === "actual" && basicVal !== null) {
        const basicMinLabel = actualBasic >= PF_CEILING
          ? `₹${PF_CEILING.toLocaleString()} (PF ceiling — actual basic ₹${actualBasic.toLocaleString()} exceeds ceiling)`
          : `₹${basicMin.toLocaleString()} (actual basic)`;
        if (basicVal < basicMin) {
          toast({ title: "Invalid Basic", description: `Basic must be at least ${basicMinLabel}.`, variant: "destructive" }); return;
        }
        if (basicMax !== undefined && basicVal > basicMax) {
          toast({ title: "Invalid Basic", description: `Basic is capped at ₹${basicMax.toLocaleString()} (PF ceiling).`, variant: "destructive" }); return;
        }
      }
      if (form.pfType === "exempted" && basicVal !== null && basicVal < PF_CEILING) {
        toast({ title: "Invalid Basic", description: `Exempted: basic must be ≥ ₹${PF_CEILING.toLocaleString()} (PF ceiling).`, variant: "destructive" }); return;
      }
      if (form.esicType === "actual" && grossVal !== null) {
        const grossMinLabel = actualGross >= ESIC_CEILING
          ? `₹${ESIC_CEILING.toLocaleString()} (ESIC ceiling — actual gross ₹${actualGross.toLocaleString()} exceeds ceiling)`
          : `₹${grossMin.toLocaleString()} (actual gross)`;
        if (grossVal < grossMin) {
          toast({ title: "Invalid Gross", description: `Gross must be at least ${grossMinLabel}.`, variant: "destructive" }); return;
        }
        if (grossMax !== undefined && grossVal > grossMax) {
          toast({ title: "Invalid Gross", description: `Gross is capped at ₹${grossMax.toLocaleString()} (ESIC ceiling).`, variant: "destructive" }); return;
        }
      }
      if (form.esicType === "exempted" && grossVal !== null && grossVal < ESIC_CEILING) {
        toast({ title: "Invalid Gross", description: `Exempted: gross must be ≥ ₹${ESIC_CEILING.toLocaleString()} (ESIC ceiling).`, variant: "destructive" }); return;
      }
    }

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
          basicSalary:     form.basicSalary,
          grossSalary:     form.grossSalary,
          sameAsActual:    form.sameAsActual,
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

  const bh = basicHint();
  const gh = grossHint();
  const disableBasicGross = form.sameAsActual;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Compliances Setup</CardTitle>
            <p className="text-sm text-gray-500 mt-0.5">
              {form.employeeCode} — <strong>{form.employeeName}</strong>
            </p>
            <div className="flex gap-2 mt-1 text-xs text-gray-400">
              <span>PF {setup.pfApplicable ? <span className="text-green-600">✓ Enabled</span> : <span className="text-red-400">✗ Disabled</span>}</span>
              <span>·</span>
              <span>ESIC {setup.esicApplicable ? <span className="text-green-600">✓ Enabled</span> : <span className="text-red-400">✗ Disabled</span>}</span>
              <span>·</span>
              <span>LWF {setup.lwfApplicable ? <span className="text-green-600">✓ Enabled</span> : <span className="text-red-400">✗ Disabled</span>}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Row 1: Department | Designation | Weekly Off */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">Department</Label>
            <Input value={form.department} onChange={e => set("department", e.target.value)}
              placeholder="e.g. CONSTRUCTION" className="h-10 bg-white border-gray-300" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">Designation</Label>
            <Input value={form.designation} onChange={e => set("designation", e.target.value)}
              placeholder="e.g. LABOUR" className="h-10 bg-white border-gray-300" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">Weekly Off</Label>
            <Select value={form.weeklyOff} onValueChange={v => set("weeklyOff", v)}>
              <SelectTrigger className="h-10 bg-white border-gray-300"><SelectValue /></SelectTrigger>
              <SelectContent>{WEEKLY_OFF_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: OT | Payment | Diff Adjustment */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">OT</Label>
            <Select value={form.otType} onValueChange={v => set("otType", v)}>
              <SelectTrigger className="h-10 bg-white border-gray-300"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="na">NA — No OT</SelectItem>
                <SelectItem value="actual">Actual — Same hours & amount</SelectItem>
                <SelectItem value="double">Double — Hours ÷ 2, same amount</SelectItem>
                <SelectItem value="adjust">Adjust — OT = 0, added to net pay</SelectItem>
              </SelectContent>
            </Select>
            {form.otType && otHints[form.otType] && (
              <p className="text-xs text-blue-600 mt-0.5">{otHints[form.otType]}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">Payment<span className="text-red-500 ml-0.5">*</span></Label>
            <Select value={form.paymentMode} onValueChange={v => {
              set("paymentMode", v);
              if (v === "compliance") set("diffAdjustments", ["carry_fwd"]);
            }}>
              <SelectTrigger className="h-10 bg-white border-gray-300"><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_MODE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">Diff Adjustment<span className="text-red-500 ml-0.5">*</span></Label>
            <MultiSelect
              options={DIFF_ADJ_OPTIONS}
              selected={form.paymentMode === "compliance" ? ["carry_fwd"] : form.diffAdjustments}
              onChange={vals => { if (form.paymentMode !== "compliance") set("diffAdjustments", vals); }}
              placeholder="Select adjustments..."
              disabled={form.paymentMode === "compliance"}
            />
            {form.paymentMode === "compliance" && (
              <p className="text-xs text-amber-600 mt-0.5">Locked to Carry Fwd — Payment is set to Compliances</p>
            )}
          </div>
        </div>

        {/* Row 3: PF | ESIC | LWF */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">PF<span className="text-red-500 ml-0.5">*</span></Label>
            <Select value={form.pfType} onValueChange={onPfTypeChange}>
              <SelectTrigger className="h-10 bg-white border-gray-300"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="actual" disabled={!setup.pfApplicable}>
                  Actual {!setup.pfApplicable && "(PF not enabled in payroll)"}
                </SelectItem>
                <SelectItem value="exempted">Exempted — basic ≥ ₹{PF_CEILING.toLocaleString()}</SelectItem>
                <SelectItem value="ctc">CTC — show only, no deduction</SelectItem>
                <SelectItem value="na">N/A</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">ESIC</Label>
            <Select value={form.esicType} onValueChange={onEsicTypeChange}>
              <SelectTrigger className="h-10 bg-white border-gray-300"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="actual" disabled={!setup.esicApplicable}>
                  Actual {!setup.esicApplicable && "(ESIC not enabled in payroll)"}
                </SelectItem>
                <SelectItem value="exempted">Exempted — gross ≥ ₹{ESIC_CEILING.toLocaleString()}</SelectItem>
                <SelectItem value="ctc">CTC — show only, no deduction</SelectItem>
                <SelectItem value="na">N/A</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">LWF</Label>
            <Select value={form.lwfType} onValueChange={onLwfTypeChange}>
              <SelectTrigger className="h-10 bg-white border-gray-300"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="na">N/A</SelectItem>
                <SelectItem value="actual" disabled={!setup.lwfApplicable}>
                  Actual {!setup.lwfApplicable && "(LWF not enabled in payroll)"}
                </SelectItem>
                <SelectItem value="exempted">Exempted</SelectItem>
                <SelectItem value="ctc">CTC — show only, no deduction</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 4: Bonus */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">Bonus</Label>
            <Select value={form.bonusType || "actual"} onValueChange={v => set("bonusType", v)}>
              <SelectTrigger className="h-10 bg-white border-gray-300"><SelectValue /></SelectTrigger>
              <SelectContent>{BONUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 5: BASIC | GROSS | Same As Actual */}
        <div className="grid grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">
              BASIC
              {actualBasic > 0 && <span className="ml-1 text-gray-400 font-normal">(Payroll: ₹{actualBasic.toLocaleString()})</span>}
            </Label>
            <Input
              value={disableBasicGross ? "" : form.basicSalary}
              disabled={disableBasicGross}
              onChange={e => set("basicSalary", e.target.value)}
              onBlur={e => { if (!disableBasicGross && basicMin > 0) set("basicSalary", clampBasic(e.target.value)); }}
              placeholder={disableBasicGross ? "Auto (Same As Actual)" : basicMax !== undefined ? `${basicMin}–${basicMax}` : "Enter basic salary"}
              className="h-10 bg-white border-gray-300 disabled:bg-gray-50 disabled:text-gray-400"
            />
            {!disableBasicGross && bh && <p className="text-xs text-blue-600 mt-0.5">{bh}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">
              GROSS
              {actualGross > 0 && <span className="ml-1 text-gray-400 font-normal">(Payroll: ₹{actualGross.toLocaleString()})</span>}
            </Label>
            <Input
              value={disableBasicGross ? "" : form.grossSalary}
              disabled={disableBasicGross}
              onChange={e => set("grossSalary", e.target.value)}
              onBlur={e => { if (!disableBasicGross && grossMin > 0) set("grossSalary", clampGross(e.target.value)); }}
              placeholder={disableBasicGross ? "Auto (Same As Actual)" : grossMax !== undefined ? `${grossMin}–${grossMax}` : "Enter gross salary"}
              className="h-10 bg-white border-gray-300 disabled:bg-gray-50 disabled:text-gray-400"
            />
            {!disableBasicGross && gh && <p className="text-xs text-blue-600 mt-0.5">{gh}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-gray-600">Same As Actual</Label>
            <div className="flex items-center h-10 gap-2">
              <Checkbox
                checked={form.sameAsActual}
                onCheckedChange={onSameAsActualChange}
                className="h-5 w-5"
              />
              <span className="text-xs text-gray-500">Use payroll values</span>
            </div>
          </div>
        </div>

        {/* CTC note */}
        {(form.pfType === "ctc" || form.esicType === "ctc" || form.lwfType === "ctc") && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-700">
            <strong>CTC mode:</strong> Deduction is calculated and shown in the compliance sheet but <em>not</em> deducted from net pay.
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t">
          <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Setup"}
          </Button>
          <Button variant="outline" onClick={onBack}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
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
      const totalDeds = ap + ae + al + r.pt + r.loanAdv;
      const adjPayDays = computeAdjPayDays(
        r.pfType || "actual", r.esicType || "actual",
        ap, ae,
        Math.min(r.rBasic, PF_CEILING), Math.min(r.rTotal, ESIC_CEILING),
        r.monDays, r.netPay, totalDeds, r.payDays
      );
      const compPayable = r.monDays > 0
        ? Math.round(r.rTotal * adjPayDays / r.monDays) - totalDeds
        : 0;
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
      const totalDeds = adjPf + adjEsic + adjLwf + r.pt;
      const actualPaid = r.netPay;
      const adjPayDays = computeAdjPayDays(
        r.pfType || "actual", r.esicType || "actual",
        adjPf, adjEsic,
        r.rBasic, r.rTotal,
        r.monDays, actualPaid, totalDeds, r.payDays
      );
      const compPayable = r.monDays > 0
        ? Math.round(r.rTotal * adjPayDays / r.monDays) - totalDeds
        : 0;
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
            <th>Emp Code</th><th>Employee Name</th><th>Compliance Payable</th>
            <th>Prev Bal</th><th>Other Adj</th><th>Actual Payable</th>
            <th>Carry Fwd</th><th>Remarks</th>
          </tr>
          ${trRows.map(r => `<tr>
            <td>${r.empCode}</td>
            <td>${r.empName}</td>
            <td class="num">${r.compPayable.toLocaleString("en-IN")}</td>
            <td class="${r.prevBal < 0 ? "neg" : r.prevBal > 0 ? "pos" : "num"}">${r.prevBal !== 0 ? (r.prevBal > 0 ? "+" : "") + r.prevBal.toLocaleString("en-IN") : "—"}</td>
            <td class="${r.otherAdj < 0 ? "neg" : r.otherAdj > 0 ? "pos" : "num"}">${r.otherAdj !== 0 ? r.otherAdj.toLocaleString("en-IN") : "—"}</td>
            <td class="num">${r.actualPaid.toLocaleString("en-IN")}</td>
            <td class="${r.carryFwd < 0 ? "neg" : r.carryFwd > 0 ? "pos" : "num"}">${r.carryFwd !== 0 ? (r.carryFwd > 0 ? "+" : "") + r.carryFwd.toLocaleString("en-IN") : "0"}</td>
            <td>${r.remarks}</td>
          </tr>`).join("")}
          <tr class="tot">
            <td colspan="2"><strong>TOTAL</strong></td>
            <td class="num tot"><strong>${trRows.reduce((a, r) => a + r.compPayable, 0).toLocaleString("en-IN")}</strong></td>
            <td class="num tot"><strong>${trRows.reduce((a, r) => a + r.prevBal, 0).toLocaleString("en-IN")}</strong></td>
            <td class="num tot"><strong>${trRows.reduce((a, r) => a + r.otherAdj, 0).toLocaleString("en-IN")}</strong></td>
            <td class="num tot"><strong>${trRows.reduce((a, r) => a + r.actualPaid, 0).toLocaleString("en-IN")}</strong></td>
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

  const filtered = rows.filter(r =>
    !search ||
    r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
    r.employeeCode.toLowerCase().includes(search.toLowerCase())
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
              {loading ? "Loading..." : "Load Employees"}
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
                  <TableHead className="font-semibold text-xs sticky left-0 bg-gray-50 z-10 min-w-[70px]">Code</TableHead>
                  <TableHead className="font-semibold text-xs min-w-[140px]">Name</TableHead>
                  <TableHead className="font-semibold text-xs min-w-[80px]">Dept</TableHead>
                  <TableHead className="font-semibold text-xs min-w-[90px]">Designation</TableHead>
                  <TableHead className="font-semibold text-xs text-center">Mon.Days</TableHead>
                  <TableHead className="font-semibold text-xs text-center">Pay Days</TableHead>
                  {/* Rate columns */}
                  <TableHead className="font-semibold text-xs text-center bg-blue-50">R.Basic</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-blue-50">R.HRA</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-blue-50">R.Total</TableHead>
                  {/* Earned columns */}
                  <TableHead className="font-semibold text-xs text-center bg-green-50">E.Basic</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-green-50">E.HRA</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-green-50">Bonus</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-green-50">E.Total</TableHead>
                  {/* Deduction columns */}
                  <TableHead className="font-semibold text-xs text-center bg-red-50">PF</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-red-50">ESIC</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-red-50">LWF</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-red-50">PT</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-red-50">Other Ded</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-red-50">D.Total</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-violet-50">Compliance Payable</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-amber-50">Prev Bal</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-violet-50">Other Adj</TableHead>
                  <TableHead className="font-semibold text-xs text-center bg-violet-50">Actual Payable</TableHead>
                  <TableHead className="font-semibold text-xs text-center">Carry Fwd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={24} className="text-center py-10 text-gray-400">No employees match your search</TableCell></TableRow>
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
                  // Other Ded = loan advances (always shown from payroll)
                  const otherDedVal = row.loanAdv;
                  // Other Adj computed later (after compPayable) based on diffAdj selections
                  // Auto-adjust Pay Days based on actual PF/ESIC amounts so columns stay consistent.
                  // See computeAdjPayDays() for full priority rules.
                  const actualPaid = row.netPay;
                  const totalDeds  = adjPf + adjEsic + adjLwf + row.pt;
                  const adjPayDays = computeAdjPayDays(
                    row.pfType || "actual", row.esicType || "actual",
                    adjPf, adjEsic,
                    row.rBasic, row.rTotal,
                    row.monDays, actualPaid, totalDeds, row.payDays
                  );
                  // E columns prorated from compliance rates × adjusted pay days
                  const eBasicCalc = row.monDays > 0 ? Math.round(row.rBasic * adjPayDays / row.monDays) : 0;
                  const eHraCalc   = row.monDays > 0 ? Math.round(row.rHra   * adjPayDays / row.monDays) : 0;
                  // Bonus based on bonusType setup
                  const bonusCalc = (() => {
                    const bt = row.bonusType || "actual";
                    if (bt === "na")     return 0;
                    if (bt === "actual") return row.bonus;
                    const monthlyBonus = Math.round(row.rBasic * 8.33 / 100);
                    if (bt === "annual") return monthlyBonus;
                    // monthly → prorated by adj pay days
                    return row.monDays > 0 ? Math.round(monthlyBonus * adjPayDays / row.monDays) : 0;
                  })();
                  const eTotalCalc = eBasicCalc + eHraCalc + bonusCalc;
                  const adjDTotal   = adjPf + adjEsic + adjLwf + row.pt + otherDedVal;
                  const compPayable = row.monDays > 0
                    ? Math.round(row.rTotal * adjPayDays / row.monDays) - totalDeds
                    : 0;
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
                      <TableCell className="text-gray-500">{row.department || "-"}</TableCell>
                      <TableCell className="text-gray-500">{row.designation || "-"}</TableCell>
                      <TableCell className="text-center text-gray-700">{row.monDays}</TableCell>
                      <TableCell className="text-center text-gray-700 font-medium">{adjPayDays}</TableCell>
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
                      <TableCell className="text-center bg-red-50/40" title="Loan / Advance">{n(otherDedVal)}</TableCell>
                      <TableCell className="text-center bg-red-50/40 font-medium">{n(adjDTotal)}</TableCell>
                      {/* Compliance Payable / Prev Bal / Other Adj / Actual Payable / Carry Fwd */}
                      <TableCell className="text-center bg-violet-50/40 font-semibold">{n(compPayable)}</TableCell>
                      <TableCell className={`text-center bg-amber-50/60 font-medium ${(row.prevBal||0) < 0 ? "text-red-600" : (row.prevBal||0) > 0 ? "text-green-700" : "text-gray-400"}`}
                        title="Carry forward from previous month">
                        {(row.prevBal||0) !== 0 ? ((row.prevBal||0) > 0 ? "+" : "") + (row.prevBal||0).toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className={`text-center bg-violet-50/40 font-medium ${otherAdjVal < 0 ? "text-red-600" : otherAdjVal > 0 ? "text-green-700" : "text-gray-400"}`}
                        title={`Sel: ${(row.diffAdj || "none")} | Gap: ${compPayable - prevBal - actualPaid}`}>
                        {otherAdjVal !== 0 ? otherAdjVal.toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="text-center bg-violet-50/40">{n(actualPaid)}</TableCell>
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
                    const deds = ap + ae + al + r.pt;
                    const oth  = r.loanAdv;
                    const pd   = computeAdjPayDays(
                      r.pfType || "actual", r.esicType || "actual",
                      ap, ae,
                      r.rBasic, r.rTotal,
                      r.monDays, r.netPay, deds, r.payDays
                    );
                    const eb   = r.monDays > 0 ? Math.round(r.rBasic * pd / r.monDays) : 0;
                    const eh   = r.monDays > 0 ? Math.round(r.rHra   * pd / r.monDays) : 0;
                    const bt   = r.bonusType || "actual";
                    const mbonus = Math.round(r.rBasic * 8.33 / 100);
                    const bc   = bt === "na" ? 0
                                 : bt === "actual" ? r.bonus
                                 : bt === "annual" ? mbonus
                                 : (r.monDays > 0 ? Math.round(mbonus * pd / r.monDays) : 0);
                    const et   = eb + eh + bc;
                    const cp   = r.monDays > 0 ? Math.round(r.rTotal * pd / r.monDays) - deds : 0;
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
                  const totAdjDTotal = totAdjPf + totAdjEsic + totAdjLwf + sum("pt") + totOtherDed;
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
                      <TableCell className="text-center bg-red-50">{n(totOtherDed)}</TableCell>
                      <TableCell className="text-center bg-red-50">{n(totAdjDTotal)}</TableCell>
                      <TableCell className="text-center bg-violet-50">{n(totComp)}</TableCell>
                      <TableCell className={`text-center bg-amber-50 font-bold ${totPrevBal < 0 ? "text-red-600" : totPrevBal > 0 ? "text-green-700" : "text-gray-400"}`}>
                        {totPrevBal !== 0 ? (totPrevBal > 0 ? "+" : "") + totPrevBal.toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className={`text-center bg-violet-50 font-bold ${totOtherAdj < 0 ? "text-red-600" : totOtherAdj > 0 ? "text-green-700" : "text-gray-400"}`}>
                        {totOtherAdj !== 0 ? totOtherAdj.toLocaleString("en-IN") : "—"}
                      </TableCell>
                      <TableCell className="text-center bg-violet-50">{n(totActual)}</TableCell>
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
            <p className="text-gray-400">Select filters and click <strong>Load Employees</strong> to begin</p>
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

  // View Assignments dialog
  const [assignClientId, setAssignClientId] = useState<string | null>(null);
  const [assignClientName, setAssignClientName] = useState("");
  const [assignments, setAssignments] = useState<ClientAssignment[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  // Assign new employee within the assignments dialog
  const [assignEmpId, setAssignEmpId] = useState("");
  const [assignDate, setAssignDate] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  // De-assign
  const [deassignId, setDeassignId] = useState<string | null>(null);
  const [deassignDate, setDeassignDate] = useState("");
  const [deassignSaving, setDeassignSaving] = useState(false);

  // All employees for assignment dropdown
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string; code: string }[]>([]);

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
      const res = await fetch("/api/employees", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const list = (Array.isArray(data) ? data : data.employees || []).filter(
        (e: any) => !e.companyId || e.companyId === companyId || e.company_id === companyId
      );
      setAllEmployees(list.map((e: any) => ({
        id: e.id,
        code: e.employeeCode || e.employee_code || "",
        name: `${e.firstName || e.first_name || ""} ${e.lastName || e.last_name || ""}`.trim(),
      })));
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
        body: JSON.stringify({ employeeId: assignEmpId, assignedDate: assignDate }),
      });
      if (!res.ok) throw new Error("Failed to assign");
      toast({ title: "Assigned", description: "Employee assigned to project" });
      setAssignEmpId(""); setAssignDate("");
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
                    <div className="flex items-center gap-1 justify-center">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                        onClick={() => openAssignments(client)}>
                        <Users className="h-3 w-3 mr-1" /> Employees
                      </Button>
                      {client.status === "active" && (
                        <Button size="sm" variant="outline"
                          className="h-7 px-2 text-xs border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => { setEndClientId(client.id); setEndDate(""); }}>
                          <XCircle className="h-3 w-3 mr-1" /> End
                        </Button>
                      )}
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
            <div className="flex items-end gap-3 p-3 bg-blue-50 rounded-lg">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-gray-600">Assign Employee</Label>
                <Select value={assignEmpId} onValueChange={setAssignEmpId}>
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

            {/* Assignment list */}
            {assignLoading ? (
              <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
            ) : assignments.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">No employees assigned yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs">Employee</TableHead>
                    <TableHead className="text-xs">Department</TableHead>
                    <TableHead className="text-xs text-center">Assigned Date</TableHead>
                    <TableHead className="text-xs text-center">De-assigned Date</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="text-xs text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map(a => (
                    <TableRow key={a.id} className="text-sm">
                      <TableCell>
                        <div className="font-medium text-gray-800">{a.first_name} {a.last_name}</div>
                        <div className="text-xs text-gray-500">{a.employee_code}</div>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">{a.department || "—"}</TableCell>
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
                        {a.status === "active" && (
                          <Button size="sm" variant="outline"
                            className="h-7 px-2 text-xs border-orange-200 text-orange-600 hover:bg-orange-50"
                            onClick={() => { setDeassignId(a.id); setDeassignDate(""); }}>
                            <UserMinus className="h-3 w-3 mr-1" /> De-assign
                          </Button>
                        )}
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

function WorkmenRegisterView({ data }: { data: WorkmenRegisterData }) {
  const c = data.client;
  const val = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(", ") || "—";

  return (
    <div
      id="workmen-register-print"
      className="bg-white"
      style={{ fontFamily: '"Times New Roman", Times, serif', padding: "24px 32px", fontSize: "11px", color: "#000" }}
    >
      {/* Titles */}
      <div style={{ textAlign: "center", marginBottom: "14px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "0.5px" }}>Form IX</div>
        <div style={{ fontSize: "12px", fontWeight: 700 }}>[See rule 74]</div>
        <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Register of Workmen Employed by Contractor
        </div>
        <div style={{ height: "1px", background: "#333", marginTop: "8px" }} />
      </div>

      {/* Header info */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12px", fontSize: "11px" }}>
        <tbody>
          {[
            ["Name and address of Contractor",                                            val(data.company.name, data.company.address)],
            ["Name and address of establishment in/under which contract is carried on",   val(c?.client_name, c?.client_address)],
            ["Name and location of work",                                                  val(c?.nature_of_work, c?.location_of_work)],
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
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "32px", fontSize: "11px" }}>
        <div><strong>Place : </strong>{c?.location_of_work || "—"}</div>
        <div style={{ fontWeight: 700, borderTop: "1px solid #333", paddingTop: "4px", minWidth: "180px", textAlign: "center" }}>
          Signature of the Contractor
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
    ["Name and location of work",                                               v(c?.nature_of_work, c?.location_of_work)],
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
const CL_FOOTER = (c: ClientInfo) => (
  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "28px", fontSize: "10.5px" }}>
    <div><strong>Place : </strong>{c?.location_of_work || "—"}</div>
    <div style={{ fontWeight: 700, borderTop: "1px solid #333", paddingTop: "4px", minWidth: "180px", textAlign: "center" }}>Signature of the Contractor</div>
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

// ─── Form VIII — Register of Particulars of Contractors ───────────────────────
function FormVIIIView({ data }: { data: FormVIIIData }) {
  const { company, client: c, month, year, totalWages, disbursedWages, maxWorkmen } = data;
  const monthFull = month && ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(month)
    ? ["January","February","March","April","May","June","July","August","September","October","November","December"][["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month)]
    : month;
  return CL_WRAP("form-viii-print", <>
    {CL_TITLE("FORM VIII","See rule 73","Register of Particulars of Contractors")}
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
    {CL_FOOTER(c)}
  </>);
}

// ─── Form XII — Muster Roll ────────────────────────────────────────────────────
function MusterRollView({ data }: { data: MusterRollData }) {
  const { company, client: c, month, year, daysInMonth, employees } = data;
  const monthFull = month && ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(month)
    ? ["January","February","March","April","May","June","July","August","September","October","November","December"][["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month)]
    : month;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  return CL_WRAP("muster-roll-print", <>
    {CL_TITLE("Form No. XII","See Rule 77 (1) (a) (i)","Muster Roll")}
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
    {CL_FOOTER(c)}
  </>);
}

// ─── Form XIII — Register of Wages ────────────────────────────────────────────
function WagesRegisterView({ data }: { data: WagesRegisterData }) {
  const { company, client: c, month, year, employees } = data;
  const monthFull = month && ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(month)
    ? ["January","February","March","April","May","June","July","August","September","October","November","December"][["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month)]
    : month;
  const totals = employees.reduce((a, e) => ({
    basicSalary: a.basicSalary + e.basicSalary,
    hra: a.hra + e.hra, conveyance: a.conveyance + e.conveyance,
    otherAllowances: a.otherAllowances + e.otherAllowances + e.medicalAllowance + e.specialAllowance,
    bonus: a.bonus + e.bonus, totalEarnings: a.totalEarnings + e.totalEarnings,
    pf: a.pf + e.pf, esi: a.esi + e.esi, pt: a.pt + e.pt,
    lwf: a.lwf + e.lwf, loanDeduction: a.loanDeduction + e.loanDeduction,
    otherDeductions: a.otherDeductions + e.otherDeductions + e.tds,
    totalDeductions: a.totalDeductions + e.totalDeductions, netSalary: a.netSalary + e.netSalary,
  }), { basicSalary:0, hra:0, conveyance:0, otherAllowances:0, bonus:0, totalEarnings:0, pf:0, esi:0, pt:0, lwf:0, loanDeduction:0, otherDeductions:0, totalDeductions:0, netSalary:0 });
  return CL_WRAP("wages-register-print", <>
    {CL_TITLE("Form XIII","See Rule 77 (1) (a) (ii)","Register of Wages")}
    {CL_HDR(c, company, [["For the month of", `${monthFull} ${year}`]])}
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8.5px" }}>
      <thead>
        <tr>
          <th style={CL_TH} rowSpan={2}>{"S.\nNo."}</th>
          <th style={CL_TH} rowSpan={2}>{"Name of\nWorkman"}</th>
          <th style={CL_TH} rowSpan={2}>{"Father's /\nHusband's\nName"}</th>
          <th style={CL_TH} rowSpan={2}>{"Designation"}</th>
          <th style={CL_TH} rowSpan={2}>{"Rate of\nWages\n(₹/month)"}</th>
          <th style={CL_TH} rowSpan={2}>{"Pay\nDays"}</th>
          <th style={{ ...CL_TH, background: "#e8f5e9" }} colSpan={5}>Earnings</th>
          <th style={{ ...CL_TH, background: "#fce4ec" }} colSpan={6}>Deductions</th>
          <th style={CL_TH} rowSpan={2}>{"Net\nSalary\n(₹)"}</th>
          <th style={CL_TH} rowSpan={2}>{"Signature /\nThumb\nImpression"}</th>
        </tr>
        <tr>
          <th style={{ ...CL_TH, background: "#e8f5e9" }}>{"Basic (₹)"}</th>
          <th style={{ ...CL_TH, background: "#e8f5e9" }}>{"HRA (₹)"}</th>
          <th style={{ ...CL_TH, background: "#e8f5e9" }}>{"Conv.\n& Other\n(₹)"}</th>
          <th style={{ ...CL_TH, background: "#e8f5e9" }}>{"Bonus\n(₹)"}</th>
          <th style={{ ...CL_TH, background: "#e8f5e9" }}>{"Total\nEarnings\n(₹)"}</th>
          <th style={{ ...CL_TH, background: "#fce4ec" }}>{"PF (₹)"}</th>
          <th style={{ ...CL_TH, background: "#fce4ec" }}>{"ESI (₹)"}</th>
          <th style={{ ...CL_TH, background: "#fce4ec" }}>{"PT (₹)"}</th>
          <th style={{ ...CL_TH, background: "#fce4ec" }}>{"LWF (₹)"}</th>
          <th style={{ ...CL_TH, background: "#fce4ec" }}>{"Loan /\nAdv (₹)"}</th>
          <th style={{ ...CL_TH, background: "#fce4ec" }}>{"Total\nDeds\n(₹)"}</th>
        </tr>
      </thead>
      <tbody>
        {employees.length === 0 && <tr><td colSpan={17} style={{ ...CL_TD, textAlign: "center", padding: "16px" }}>No payroll data for this month</td></tr>}
        {employees.map(e => (
          <tr key={e.serialNo}>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.serialNo}</td>
            <td style={{ ...CL_TD, fontWeight: 700 }}>{e.name}</td>
            <td style={CL_TD}>{e.fatherHusbandName || "—"}</td>
            <td style={CL_TD}>{e.designation || "—"}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.monthlyRate)}</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.payDays}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.basicSalary)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.hra)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.conveyance + e.medicalAllowance + e.specialAllowance + e.otherAllowances)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.bonus)}</td>
            <td style={{ ...CL_TD, textAlign: "right", fontWeight: 700 }}>{ni(e.totalEarnings)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.pf)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.esi)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.pt)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.lwf)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(e.loanDeduction)}</td>
            <td style={{ ...CL_TD, textAlign: "right", fontWeight: 700 }}>{ni(e.totalDeductions)}</td>
            <td style={{ ...CL_TD, textAlign: "right", fontWeight: 700 }}>{ni(e.netSalary)}</td>
            <td style={CL_TD}></td>
          </tr>
        ))}
        {employees.length > 0 && (
          <tr style={{ fontWeight: 700, background: "#f0f0f0" }}>
            <td colSpan={4} style={{ ...CL_TD, textAlign: "center" }}>TOTAL</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>—</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>—</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.basicSalary)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.hra)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.otherAllowances + totals.conveyance)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.bonus)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.totalEarnings)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.pf)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.esi)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.pt)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.lwf)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.loanDeduction)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.totalDeductions)}</td>
            <td style={{ ...CL_TD, textAlign: "right" }}>{ni(totals.netSalary)}</td>
            <td style={CL_TD}></td>
          </tr>
        )}
      </tbody>
    </table>
    {CL_FOOTER(c)}
  </>);
}

// ─── Form XIV — Wage Slip ──────────────────────────────────────────────────────
function WageSlipView({ data }: { data: WagesRegisterData }) {
  const { company, client: c, month, year, employees } = data;
  const monthFull = month && ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(month)
    ? ["January","February","March","April","May","June","July","August","September","October","November","December"][["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month)]
    : month;
  return CL_WRAP("wage-slip-print", <>
    {CL_TITLE("Form XIV","See Rule 77 (1) (a) (iii)","Wage Slip")}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px", marginTop: "8px" }}>
      {employees.length === 0 && <div style={{ color: "#666", padding: "20px" }}>No payroll data for this month</div>}
      {employees.map(e => (
        <div key={e.serialNo} style={{ border: "1px solid #aaa", padding: "12px 14px", fontSize: "9.5px" }}>
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: "10.5px", marginBottom: "6px" }}>
            {company.name}
          </div>
          <div style={{ textAlign: "center", fontSize: "9px", marginBottom: "8px", color: "#555" }}>
            Wage Slip for {monthFull} {year}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={{ padding: "2px 0", fontWeight: 700 }}>Name</td><td>: {e.name}</td></tr>
              <tr><td style={{ padding: "2px 0", fontWeight: 700 }}>Designation</td><td>: {e.designation || "—"}</td></tr>
              <tr><td style={{ padding: "2px 0", fontWeight: 700 }}>Pay Days</td><td>: {e.payDays}</td></tr>
            </tbody>
          </table>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 8px", marginTop: "6px" }}>
            <div>
              <div style={{ fontWeight: 700, borderBottom: "1px solid #ccc", marginBottom: "3px", paddingBottom: "2px" }}>Earnings (₹)</div>
              {[["Basic", e.basicSalary], ["HRA", e.hra], ["Conveyance", e.conveyance], ["Special All.", e.specialAllowance], ["Other All.", (e.otherAllowances || 0) + (e.medicalAllowance || 0)], ["Bonus", e.bonus]].filter(([,v]) => (v as number) > 0).map(([l,v]) => (
                <div key={String(l)} style={{ display: "flex", justifyContent: "space-between" }}><span>{l}</span><span>{ni(v as number)}</span></div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid #ccc", marginTop: "3px", paddingTop: "2px" }}><span>Total</span><span>{ni(e.totalEarnings)}</span></div>
            </div>
            <div>
              <div style={{ fontWeight: 700, borderBottom: "1px solid #ccc", marginBottom: "3px", paddingBottom: "2px" }}>Deductions (₹)</div>
              {[["PF", e.pf], ["ESI", e.esi], ["Prof. Tax", e.pt], ["LWF", e.lwf], ["TDS", e.tds], ["Loan / Adv.", e.loanDeduction], ["Others", e.otherDeductions]].filter(([,v]) => (v as number) > 0).map(([l,v]) => (
                <div key={String(l)} style={{ display: "flex", justifyContent: "space-between" }}><span>{l}</span><span>{ni(v as number)}</span></div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid #ccc", marginTop: "3px", paddingTop: "2px" }}><span>Total</span><span>{ni(e.totalDeductions)}</span></div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "10px", background: "#f5f5f5", padding: "4px 6px", marginTop: "8px", border: "1px solid #ccc" }}>
            <span>Net Salary</span><span>₹ {ni(e.netSalary)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "16px", fontSize: "9px" }}>
            <div style={{ borderTop: "1px solid #555", paddingTop: "2px", minWidth: "80px", textAlign: "center" }}>Employee Signature</div>
            <div style={{ borderTop: "1px solid #555", paddingTop: "2px", minWidth: "80px", textAlign: "center" }}>Employer Signature</div>
          </div>
        </div>
      ))}
    </div>
  </>);
}

// ─── Form XV — Register of Deductions ─────────────────────────────────────────
function DeductionsRegisterView({ data }: { data: WorkmenRegisterData }) {
  const { company, client: c } = data;
  return CL_WRAP("deductions-register-print", <>
    {CL_TITLE("Form XV","See Rule 77 (2) (a)","Register of Deductions for Damage or Loss")}
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
        </tr>
      </thead>
      <tbody>
        {data.employees.map(e => (
          <tr key={e.serialNo}>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.serialNo}</td>
            <td style={{ ...CL_TD, fontWeight: 700 }}>{e.name}</td>
            <td style={CL_TD}>{e.designation || "—"}</td>
            <td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td>
            <td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td>
          </tr>
        ))}
      </tbody>
    </table>
    {CL_FOOTER(c as ClientInfo)}
  </>);
}

// ─── Form XVI — Register of Fines ─────────────────────────────────────────────
function FinesRegisterView({ data }: { data: WorkmenRegisterData }) {
  const { company, client: c } = data;
  return CL_WRAP("fines-register-print", <>
    {CL_TITLE("Form XVI","See Rule 77 (2) (b)","Register of Fines")}
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
        </tr>
      </thead>
      <tbody>
        {data.employees.map(e => (
          <tr key={e.serialNo}>
            <td style={{ ...CL_TD, textAlign: "center" }}>{e.serialNo}</td>
            <td style={{ ...CL_TD, fontWeight: 700 }}>{e.name}</td>
            <td style={CL_TD}>{e.designation || "—"}</td>
            <td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td>
            <td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td><td style={CL_TD}></td>
          </tr>
        ))}
      </tbody>
    </table>
    {CL_FOOTER(c as ClientInfo)}
  </>);
}

// ─── Form XVII — Register of Advances ─────────────────────────────────────────
function AdvancesRegisterView({ data }: { data: WagesRegisterData }) {
  const { company, client: c, month, year, employees } = data;
  const monthFull = month && ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(month)
    ? ["January","February","March","April","May","June","July","August","September","October","November","December"][["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month)]
    : month;
  return CL_WRAP("advances-register-print", <>
    {CL_TITLE("Form XVII","See Rule 77 (2) (c)","Register of Advances")}
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
        </tr>
      </thead>
      <tbody>
        {employees.length === 0 && <tr><td colSpan={11} style={{ ...CL_TD, textAlign: "center", padding: "16px" }}>No data</td></tr>}
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
          </tr>
        ))}
      </tbody>
    </table>
    {CL_FOOTER(c)}
  </>);
}

// ─── Form XVIII — Register of Overtime ────────────────────────────────────────
function OTRegisterView({ data }: { data: OTRegisterData }) {
  const { company, client: c, month, year, employees } = data;
  const monthFull = month && ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(month)
    ? ["January","February","March","April","May","June","July","August","September","October","November","December"][["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month)]
    : month;
  const totals = employees.reduce((a, e) => ({
    normalDays: a.normalDays + e.normalDays, otDays: a.otDays + e.otDays,
    otHours: a.otHours + e.otHours, normalWages: a.normalWages + e.normalWages,
    otWages: a.otWages + e.otWages,
  }), { normalDays:0, otDays:0, otHours:0, normalWages:0, otWages:0 });
  return CL_WRAP("ot-register-print", <>
    {CL_TITLE("Form XVIII","See Rule 77 (2) (d)","Register of Overtime")}
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
        {employees.length === 0 && <tr><td colSpan={10} style={{ ...CL_TD, textAlign: "center", padding: "16px" }}>No OT data for this month</td></tr>}
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
      </tbody>
    </table>
    {CL_FOOTER(c)}
  </>);
}

// ─── Form XIX — Annual Return ──────────────────────────────────────────────────
function AnnualReturnView({ data, fromYear, toYear }: { data: WorkmenRegisterData; fromYear: string; toYear: string }) {
  const { company, client: c } = data;
  return CL_WRAP("annual-return-print", <>
    {CL_TITLE("Form XIX","See Rule 83","Annual Return")}
    {CL_HDR(c as ClientInfo, company, [["Year", fromYear === toYear ? fromYear : `${fromYear} – ${toYear}`]])}
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
      <thead>
        <tr>
          <th style={CL_TH}>{"S.\nNo."}</th>
          <th style={CL_TH}>{"Name & Surname\nof Workman"}</th>
          <th style={CL_TH}>{"Father's /\nHusband's Name"}</th>
          <th style={CL_TH}>{"Designation"}</th>
          <th style={CL_TH}>{"Date of\nJoining"}</th>
          <th style={CL_TH}>{"Date of\nLeaving"}</th>
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
            <td style={{ ...CL_TD, textAlign: "center" }}>{fmtDate(e.dateOfJoining)}</td>
            <td style={{ ...CL_TD, textAlign: "center" }}>{fmtDate(e.dateOfLeaving) || "—"}</td>
            <td style={CL_TD}></td>
            <td style={CL_TD}></td>
          </tr>
        ))}
      </tbody>
    </table>
    {CL_FOOTER(c as ClientInfo)}
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
  const [fromMonth,       setFromMonth]       = useState(MONTHS_SHORT[now.getMonth()]);
  const [fromYear,        setFromYear]        = useState(String(now.getFullYear()));
  const [toMonth,         setToMonth]         = useState(MONTHS_SHORT[now.getMonth()]);
  const [toYear,          setToYear]          = useState(String(now.getFullYear()));
  const [workmenData,   setWorkmenData]   = useState<WorkmenRegisterData | null>(null);
  const [formVIIIData,  setFormVIIIData]  = useState<FormVIIIData | null>(null);
  const [musterData,    setMusterData]    = useState<MusterRollData | null>(null);
  const [wagesData,     setWagesData]     = useState<WagesRegisterData | null>(null);
  const [otData,        setOtData]        = useState<OTRegisterData | null>(null);
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
    setWorkmenData(null); setFormVIIIData(null); setMusterData(null); setWagesData(null); setOtData(null);
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
      }
      setLoaded(true);
    } catch (e: any) {
      toast({ title: "Error loading report", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  // Auto-set From Month from project start date when Workmen Register is selected
  useEffect(() => {
    if (selectedReport === "Form IX – Workmen Register" && selectedProject !== "company") {
      const proj = projects.find(p => p.id === selectedProject);
      if (proj?.project_start_date) {
        const d = new Date(proj.project_start_date);
        if (!isNaN(d.getTime())) {
          setFromMonth(MONTHS_SHORT[d.getMonth()]);
          setFromYear(String(d.getFullYear()));
        }
      }
    }
  }, [selectedProject, selectedReport, projects]);

  const isWorkmenRegister = selectedReport === "Form IX – Workmen Register";
  const hasReport = !!(workmenData || formVIIIData || musterData || wagesData || otData);

  const printReport = async () => {
    const printDiv = document.getElementById("report-print-area");
    if (!printDiv) return;
    const formLabel = selectedReport.replace(/[^a-zA-Z0-9\s\-]/g, "").replace(/\s+/g, "_");
    const fileName = `${formLabel}_${toMonth}_${toYear}.pdf`;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(printDiv, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
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

  const downloadExcel = () => {
    if (!workmenData) { toast({ title: "No data", description: "Generate a report first.", variant: "destructive" }); return; }
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
    <p class="title">Form IX</p>
    <p class="subtitle">[See rule 74]</p>
    <p class="subtitle">REGISTER OF WORKMEN EMPLOYED BY CONTRACTOR</p>
    <br/>
    <table class="hdr"><tbody>
      <tr><td>Name and address of Contractor :</td><td>${val(workmenData.company.name, workmenData.company.address)}</td></tr>
      <tr><td>Name and address of establishment in/under which contract is carried on :</td><td>${val(c?.client_name, c?.client_address)}</td></tr>
      <tr><td>Name and location of work :</td><td>${val(c?.nature_of_work, c?.location_of_work)}</td></tr>
      <tr><td>Name and address of Principal Employer :</td><td>${val(c?.principal_employer_name, c?.principal_employer_address)}</td></tr>
    </tbody></table>
    <table class="main"><thead><tr>
      <th>Sr. No.</th><th>Name &amp; Surname of Workman</th><th>Age &amp; Sex</th>
      <th>Father's / Husband's Name</th><th>Wages Period</th><th>Designation</th>
      <th>Permanent Home Address of Workman</th><th>Present Address</th>
      <th>Date of Joining</th><th>Date of Leaving</th><th>Signature / Thumb Impression</th>
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
      <td class="sno">${fmtDate(e.dateOfJoining)}</td>
      <td class="sno">${fmtDate(e.dateOfLeaving)}</td>
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
    a.download = `Form-IX-Workmen-Register-${fromMonth}-${fromYear}.xls`;
    a.click();
  };

  const downloadPDF = () => {
    if (!workmenData) { toast({ title: "No report", description: "Generate a report first.", variant: "destructive" }); return; }
    const c = workmenData.client;
    const val = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(", ") || "";

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();

    // Titles
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text("Form IX", pw / 2, 14, { align: "center" });
    doc.setFontSize(11);
    doc.text("[See rule 74]", pw / 2, 20, { align: "center" });
    doc.text("REGISTER OF WORKMEN EMPLOYED BY CONTRACTOR", pw / 2, 26, { align: "center" });
    doc.setDrawColor(80, 80, 80);
    doc.line(10, 29, pw - 10, 29);

    // Header lines
    const headers = [
      ["Name and address of Contractor : ",                                          val(workmenData.company.name, workmenData.company.address)],
      ["Name and address of establishment in/under which contract is carried on : ", val(c?.client_name, c?.client_address)],
      ["Name and location of work : ",                                               val(c?.nature_of_work, c?.location_of_work)],
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
      head: [["Sr.\nNo.", "Name & Surname\nof Workman", "Age &\nSex", "Father's /\nHusband's Name", "Wages\nPeriod", "Designation", "Permanent Home\nAddress of Workman", "Present Address", "Date of\nJoining", "Date of\nLeaving", "Signature /\nThumb Impression"]],
      body: workmenData.employees.map(e => [
        e.serialNo,
        e.name,
        `${e.age}${e.sex ? ", " + e.sex : ""}`,
        e.fatherHusbandName || "",
        e.wagesPeriod,
        e.designation || "",
        e.permanentAddress || "",
        e.presentAddress || "",
        fmtDate(e.dateOfJoining),
        fmtDate(e.dateOfLeaving),
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

    // Footer
    const lastY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.text(`Place : ${val(c?.location_of_work)}`, 10, lastY);
    doc.setFont("times", "bold");
    doc.text("Signature of the Contractor", pw - 10, lastY, { align: "right" });

    doc.save(`Form-IX-Workmen-Register-${fromMonth}-${fromYear}.pdf`);
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
            {isWorkmenRegister ? (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">From Month <span className="text-amber-500">(Project Start)</span></Label>
                <div className="flex gap-1 h-9 items-center px-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 font-medium min-w-[140px]">
                  {fromMonth} {fromYear}
                </div>
              </div>
            ) : (
              <MonthYearPicker label="From Month" month={fromMonth} year={fromYear} onMonth={setFromMonth} onYear={setFromYear} />
            )}
            <MonthYearPicker label="To Month" month={toMonth} year={toYear} onMonth={setToMonth} onYear={setToYear} />
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
                </>) : (
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
            {isWorkmenRegister && workmenData && <WorkmenRegisterView data={workmenData} />}
            {selectedReport === "Form VIII – Contractor Particulars"  && formVIIIData && <FormVIIIView data={formVIIIData} />}
            {selectedReport === "Form XII – Muster Roll"              && musterData   && <MusterRollView data={musterData} />}
            {selectedReport === "Form XIII – Wages Register"          && wagesData    && <WagesRegisterView data={wagesData} />}
            {selectedReport === "Form XIV – Wage Slip"                && wagesData    && <WageSlipView data={wagesData} />}
            {selectedReport === "Form XV – Deductions Register"       && workmenData  && <DeductionsRegisterView data={workmenData} />}
            {selectedReport === "Form XVI – Fines Register"           && workmenData  && <FinesRegisterView data={workmenData} />}
            {selectedReport === "Form XVII – Advances Register"       && wagesData    && <AdvancesRegisterView data={wagesData} />}
            {selectedReport === "Form XVIII – OT Register"            && otData       && <OTRegisterView data={otData} />}
            {selectedReport === "Form XIX – Annual Return"            && workmenData  && <AnnualReturnView data={workmenData} fromYear={fromYear} toYear={toYear} />}
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
