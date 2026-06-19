import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { jsPDF, autoTable } from "@/lib/jspdf-shim";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useSort, sortData } from "@/lib/use-sort";
import { SortableHead } from "@/components/sortable-head";
import { fetchJson } from "@/lib/api";
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
import {
  WorkmenRegisterView, FormVIIIView, MusterRollView, WagesRegisterView, WageSlipView,
  DeductionsRegisterView, FinesRegisterView, AdvancesRegisterView, OTRegisterView,
  AnnualReturnView, EmploymentCardView, ServiceCertificateView, CLRAPackageView,
  MonthYearPicker, fmtDate, clraForm, clraVariant,
} from "./clra-views";

export function ComplianceReportTab({ companyId, isSuperAdmin, user, toast }: {
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
    fetchJson<{ id: string; company_name: string }[]>("/api/compliance/companies")
      .then((list) => {
        const match = list.find(c => c.id === companyId);
        if (match) setCompanyName(match.company_name);
      }).catch(() => {});
    const projectsUrl = isSuperAdmin ? `/api/compliance/clients?companyId=${companyId}` : "/api/compliance/clients";
    fetchJson<ComplianceClient[]>(projectsUrl).then(setProjects).catch(() => {});
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
