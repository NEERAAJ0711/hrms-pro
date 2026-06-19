import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { jsPDF, autoTable } from "@/lib/jspdf-shim";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useSort, sortData } from "@/lib/use-sort";
import { SortableHead } from "@/components/sortable-head";
import { fetchJson, mutateJson } from "@/lib/api";
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
import { computeAdjPayDays, computeNetPayMaxDays } from "./employee-setup-tab";

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2 — Adjustments Workbench (existing feature)
// ═══════════════════════════════════════════════════════════════════════════════
export function AdjustmentsTab({ companyId, isSuperAdmin, user, toast }: {
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
      const data = await fetchJson<EmployeeRow[]>(
        `/api/compliance/employees?companyId=${companyId}&month=${selectedMonth}&year=${selectedYear}`
      );
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
      const result = await mutateJson<{ saved: number }>("POST", "/api/compliance/adjustments/bulk", { companyId, month: selectedMonth, year: parseInt(selectedYear), complianceType, partyName: partyName || null, adjustments });
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
