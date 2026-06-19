import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { jsPDF, autoTable } from "@/lib/jspdf-shim";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useSort, sortData } from "@/lib/use-sort";
import { SortableHead } from "@/components/sortable-head";
import { fetchJsonOrEmpty } from "@/lib/api";
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

import {
  MONTHS, MONTHS_SHORT, COMPLIANCE_TYPES, CURRENT_YEAR, YEARS,
  REPORT_STATES, REPORT_ACTS, REPORT_TYPES, WEEKLY_OFF_OPTIONS, OT_TYPE_OPTIONS,
  PAYMENT_MODE_OPTIONS, DIFF_ADJ_OPTIONS, STATUTORY_OPTIONS, BONUS_OPTIONS,
  DEFAULT_CLIENT_FORM, fmt, diff,
} from "./types";
import type {
  EmployeeSetup, EmployeeRow, EditState, WorkmenEmployee, WorkmenRegisterData,
  ClientInfo, FormVIIIData, MusterEmp, MusterRollData, WagesEmp, WagesRegisterData,
  OTEmp, OTRegisterData, ClraPackageData, ComplianceClient, ClientAssignment,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1 — Employee Compliance Setup
// ═══════════════════════════════════════════════════════════════════════════════
export function EmployeeSetupTab({ companyId, isSuperAdmin, toast }: {
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
export function computeAdjPayDays(
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
export function computeNetPayMaxDays(
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
    queryFn: () => fetchJsonOrEmpty<any[]>(`/api/wage-grades?companyId=${companyId}`, []),
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
