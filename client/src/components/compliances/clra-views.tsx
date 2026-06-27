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

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function fmtDate(d: string) {
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

export function WorkmenRegisterView({ data, state }: { data: WorkmenRegisterData; state?: string }) {
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
// CLRA forms are dated the 7th of the month AFTER the package month
// (e.g. an April package is dated 7 May). Falls back to today if month/year invalid.
const CL_SIGN_DATE = (month?: string, year?: string) => {
  const s = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const idx = month ? s.indexOf(month) : -1;
  const y = year ? parseInt(year) : NaN;
  const d = (idx >= 0 && !isNaN(y)) ? new Date(y, idx + 1, 7) : new Date();
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
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
export const clraVariant = (state?: string): ClraVariant =>
  (state === "Delhi" || state === "Uttar Pradesh") ? "central" : "haryana";
export const clraForm = (state: string | undefined, key: string): { no: string; rule: string; title: string } => {
  const n = CLRA_NUM[clraVariant(state)][key];
  return { no: n.no, rule: n.rule, title: CLRA_TITLES[key] };
};

// ─── Form VIII — Register of Particulars of Contractors ───────────────────────
export function FormVIIIView({ data, state }: { data: FormVIIIData; state?: string }) {
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
export function MusterRollView({ data, state }: { data: MusterRollData; state?: string }) {
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
export function WagesRegisterView({ data, state }: { data: WagesRegisterData; state?: string }) {
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
export function WageSlipView({ data, state }: { data: WagesRegisterData; state?: string }) {
  const { company, client: c, month, year, employees } = data;
  const f = clraForm(state, "wageSlip");
  const monthIdx = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month);
  const monthFull = monthIdx >= 0 ? ["January","February","March","April","May","June","July","August","September","October","November","December"][monthIdx] : month;
  const today = CL_SIGN_DATE(month, year);
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
export function DeductionsRegisterView({ data, month, year, state }: { data: WorkmenRegisterData; month: string; year: string; state?: string }) {
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
export function FinesRegisterView({ data, month, year, state }: { data: WorkmenRegisterData; month: string; year: string; state?: string }) {
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
export function AdvancesRegisterView({ data, state }: { data: WagesRegisterData; state?: string }) {
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
export function OTRegisterView({ data, state }: { data: OTRegisterData; state?: string }) {
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
export function AnnualReturnView({ data, fromYear, toYear, state }: { data: WorkmenRegisterData; fromYear: string; toYear: string; state?: string }) {
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
export function MonthYearPicker({ label, month, year, onMonth, onYear }: {
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
export function EmploymentCardView({ data, month, year, state }: { data: WorkmenRegisterData; month: string; year: string; state?: string }) {
  const { company, client: c } = data;
  const f = clraForm(state, "employmentCard");
  const monthIdx = MONTHS_SHORT.indexOf(month);
  const isJoiningMonth = (e: any) => {
    const d = new Date((e as any).assignedDate || e.dateOfJoining);
    return !isNaN(d.getTime()) && d.getFullYear() === parseInt(year) && d.getMonth() === monthIdx;
  };
  const employees = data.employees.filter(isJoiningMonth);
  const v = (...p: (string | null | undefined)[]) => p.filter(Boolean).join(", ") || "—";
  const today = CL_SIGN_DATE(month, year);
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
export function ServiceCertificateView({ workmen, wages, state }: { workmen: WorkmenRegisterData; wages: WagesRegisterData; state?: string }) {
  const { company, client: c } = workmen;
  const f = clraForm(state, "serviceCert");
  const { month, year } = wages;
  const monthIdx = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month);
  const monthFull = monthIdx >= 0 ? ["January","February","March","April","May","June","July","August","September","October","November","December"][monthIdx] : month;
  const today = CL_SIGN_DATE(month, year);
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
export function CLRAPackageView({ data, state }: { data: ClraPackageData; state?: string }) {
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
