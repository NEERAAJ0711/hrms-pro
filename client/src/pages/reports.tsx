import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Calendar,
  Users,
  CreditCard,
  Shield,
  Receipt,
  ClipboardList,
  HandCoins,
  Landmark,
  Scale,
  Clock,
  Eye,
  Banknote,
  CalendarX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Company, Employee, Payroll, SalaryStructure, Attendance, StatutorySettings, FnfSettlement, LeaveRequest, TimeOfficePolicy, Holiday, LoanAdvance } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const REPORTS_ALLOWED_ROLES = ["super_admin", "company_admin", "hr_admin"];

export default function ReportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === "super_admin";
  const hasAccess = user && REPORTS_ALLOWED_ROLES.includes(user.role);
  const [selectedCompany, setSelectedCompany] = useState<string>(isSuperAdmin ? "" : (user?.companyId || ""));
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewTitle, setViewTitle] = useState("");
  const [viewHeaders, setViewHeaders] = useState<string[]>([]);
  const [viewRows, setViewRows] = useState<(string | number)[][]>([]);

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
    enabled: !!hasAccess,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: !!hasAccess,
  });

  const { data: attendance = [] } = useQuery<Attendance[]>({
    queryKey: ["/api/attendance"],
    enabled: !!hasAccess,
  });

  const { data: salaryStructures = [] } = useQuery<SalaryStructure[]>({
    queryKey: ["/api/salary-structures"],
    enabled: !!hasAccess,
  });

  const { data: payrollRecords = [] } = useQuery<Payroll[]>({
    queryKey: ["/api/payroll"],
    enabled: !!hasAccess,
  });

  const { data: statutorySettingsData = [] } = useQuery<StatutorySettings[]>({
    queryKey: ["/api/statutory-settings"],
    enabled: !!hasAccess,
  });

  const { data: fnfSettlements = [] } = useQuery<FnfSettlement[]>({
    queryKey: ["/api/fnf-settlements"],
    enabled: !!hasAccess,
    queryFn: async () => {
      const res = await fetch("/api/fnf-settlements", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: leaveRequests = [] } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave-requests"],
    enabled: !!hasAccess,
    queryFn: async () => {
      const res = await fetch("/api/leave-requests", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: timeOfficePolicies = [] } = useQuery<TimeOfficePolicy[]>({
    queryKey: ["/api/time-office-policies"],
    enabled: !!hasAccess,
    queryFn: async () => {
      const res = await fetch("/api/time-office-policies", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: holidays = [] } = useQuery<Holiday[]>({
    queryKey: ["/api/holidays"],
    enabled: !!hasAccess,
    queryFn: async () => {
      const res = await fetch("/api/holidays", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: loanAdvances = [] } = useQuery<LoanAdvance[]>({
    queryKey: ["/api/loan-advances"],
    enabled: !!hasAccess,
    queryFn: async () => {
      const res = await fetch("/api/loan-advances", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: leaveTypes = [] } = useQuery<{ id: string; name: string; code: string }[]>({
    queryKey: ["/api/leave-types"],
    enabled: !!hasAccess,
    queryFn: async () => {
      const res = await fetch("/api/leave-types", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const getStatutorySettings = (companyId: string | null): StatutorySettings | undefined => {
    if (!companyId) return undefined;
    return statutorySettingsData.find(s => s.companyId === companyId);
  };

  const calculateMonthlyBonus = (emp: Employee, basicSalary: number, grossSalary: number): number => {
    if (!emp.bonusApplicable || !emp.bonusPaidMonthly) return 0;
    const settings = getStatutorySettings(emp.companyId);
    if (!settings?.bonusEnabled) return 0;
    const bonusPercent = Number(settings.bonusPercent) || 833;
    const bonusCeiling = Number(settings.bonusMaxCeiling) || 7000;
    const bonusBase = settings.bonusCalculationBase === "gross" ? grossSalary : basicSalary;
    const bonusWage = (settings as any).bonusSkipCeiling ? bonusBase : Math.min(bonusBase, bonusCeiling);
    return Math.round(bonusWage * bonusPercent / 10000);
  };

  const getProRatedComponents = (emp: Employee, ss: SalaryStructure | undefined, pr: Payroll | null, overridePayDays?: number) => {
    const zero = {
      basicSalary: 0, hra: 0, conveyance: 0, medicalAllowance: 0,
      specialAllowance: 0, otherAllowances: 0, grossSalary: 0,
      pfEmployee: 0, esi: 0, professionalTax: 0, lwfEmployee: 0,
      tds: 0, otherDeductions: 0, loanDeduction: 0, bonus: 0,
      totalEarnings: 0, totalDeductions: 0, netSalary: 0,
    };

    if (!ss && !pr) return zero;

    if (pr) {
      const hasComponents = pr.hra !== null && pr.hra !== undefined;
      if (hasComponents) {
        const basic = pr.basicSalary;
        const hra = pr.hra ?? 0;
        const conv = pr.conveyance ?? 0;
        const med = pr.medicalAllowance ?? 0;
        const spl = pr.specialAllowance ?? 0;
        const oth = pr.otherAllowances ?? 0;
        const bonus = pr.bonus ?? 0;
        const gross = basic + hra + conv + med + spl + oth;
        const pf = pr.pfEmployee ?? 0;
        const esi = pr.esi ?? 0;
        const pt = pr.professionalTax ?? 0;
        const lwf = pr.lwfEmployee ?? 0;
        const tds = pr.tds ?? 0;
        const otherDed = pr.otherDeductions ?? 0;
        const loanDed = (pr as any).loanDeduction ?? 0;
        return {
          basicSalary: basic, hra, conveyance: conv, medicalAllowance: med,
          specialAllowance: spl, otherAllowances: oth, grossSalary: gross,
          pfEmployee: pf, esi, professionalTax: pt, lwfEmployee: lwf,
          tds, otherDeductions: otherDed, loanDeduction: loanDed, bonus,
          totalEarnings: pr.totalEarnings, totalDeductions: pr.totalDeductions, netSalary: pr.netSalary,
        };
      }

      if (ss) {
        // Use payDays (Present + Weekly Off + Holidays + Paid Leaves) for correct proration
        const storedPayDays = Number(pr.payDays) || pr.presentDays;
        const payDaysForFactor = overridePayDays ?? storedPayDays;
        const factor = pr.workingDays > 0 ? Math.min(payDaysForFactor / pr.workingDays, 1) : 0;
        const basic = pr.basicSalary;
        const hra = Math.round((ss.hra || 0) * factor);
        const conv = Math.round((ss.conveyance || 0) * factor);
        const med = Math.round((ss.medicalAllowance || 0) * factor);
        const spl = Math.round((ss.specialAllowance || 0) * factor);
        const oth = Math.round((ss.otherAllowances || 0) * factor);
        const gross = basic + hra + conv + med + spl + oth;
        const bonus = pr.totalEarnings - gross;
        const totalDedKnown = pr.totalDeductions;
        const tds = ss.tds || 0;
        const otherDed = ss.otherDeductions || 0;
        const remainingDed = totalDedKnown - tds - otherDed;
        const settings = getStatutorySettings(emp.companyId);
        let pf = 0, esi = 0, pt = 0, lwf = 0;
        if (settings) {
          if (settings.pfEnabled && emp.pfApplicable) {
            const pfBase = Math.min(basic, Number(settings.pfWageCeiling) || 15000);
            pf = Math.round(pfBase * (Number(settings.pfEmployeePercent) || 12) / 100);
          }
          if (settings.esicEnabled && emp.esiApplicable) {
            const wageCeiling = Number(settings.esicWageCeiling) || 21000;
            const esicPercent = Number(settings.esicEmployeePercent) || 75;
            // Eligibility on contracted salary; deduction on earned/prorated salary
            const contractedGross = ss?.grossSalary || gross;
            if (contractedGross <= wageCeiling) {
              if (settings.esicCalcOnGross) {
                esi = Math.round(Math.min(gross, wageCeiling) * esicPercent / 10000);
              } else {
                const esicBase = Math.min(Math.max(basic, gross * 0.5), wageCeiling);
                esi = Math.round(esicBase * esicPercent / 10000);
              }
            }
          }
          if (settings.ptEnabled) pt = Math.min(Number(settings.ptMaxAmount) || 200, 200);
          if (settings.lwfEnabled && emp.lwfApplicable) {
            const lwfBase = (settings.lwfCalculationBase === "basic") ? basic : gross;
            lwf = Math.min(Math.round(lwfBase * (Number(settings.lwfEmployeePercent) || 20) / 10000), Number(settings.lwfEmployeeMaxCap) || 34);
          }
        }
        return {
          basicSalary: basic, hra, conveyance: conv, medicalAllowance: med,
          specialAllowance: spl, otherAllowances: oth, grossSalary: gross,
          pfEmployee: pf, esi, professionalTax: pt, lwfEmployee: lwf,
          tds, otherDeductions: otherDed, loanDeduction: (pr as any).loanDeduction ?? 0, bonus: Math.max(bonus, 0),
          totalEarnings: pr.totalEarnings, totalDeductions: pr.totalDeductions, netSalary: pr.netSalary,
        };
      }

      return {
        ...zero,
        basicSalary: pr.basicSalary,
        grossSalary: pr.basicSalary,
        loanDeduction: (pr as any).loanDeduction ?? 0,
        totalEarnings: pr.totalEarnings, totalDeductions: pr.totalDeductions, netSalary: pr.netSalary,
      };
    }

    if (!ss) return zero;

    const bonus = calculateMonthlyBonus(emp, ss.basicSalary, ss.grossSalary);
    const totalEarn = ss.grossSalary + bonus;
    const totalDed = (ss.pfEmployee || 0) + (ss.esi || 0) + (ss.professionalTax || 0) + (ss.lwfEmployee || 0) + (ss.tds || 0) + (ss.otherDeductions || 0);
    return {
      basicSalary: ss.basicSalary, hra: ss.hra || 0, conveyance: ss.conveyance || 0,
      medicalAllowance: ss.medicalAllowance || 0, specialAllowance: ss.specialAllowance || 0,
      otherAllowances: ss.otherAllowances || 0, grossSalary: ss.grossSalary,
      pfEmployee: ss.pfEmployee || 0, esi: ss.esi || 0, professionalTax: ss.professionalTax || 0,
      lwfEmployee: ss.lwfEmployee || 0, tds: ss.tds || 0, otherDeductions: ss.otherDeductions || 0,
      bonus, totalEarnings: totalEarn, totalDeductions: totalDed, netSalary: totalEarn - totalDed,
    };
  };

  if (!hasAccess) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You do not have permission to access the Reports module.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const effectiveCompany = selectedCompany === "__all__" ? "" : selectedCompany;
  const filteredEmployees = employees.filter(e =>
    effectiveCompany ? e.companyId === effectiveCompany : true
  );

  const getCompanyName = (companyId: string | null) => {
    if (!companyId) return "N/A";
    return companies.find(c => c.id === companyId)?.companyName || "N/A";
  };

  const getEmployeeName = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    return emp ? `${emp.firstName} ${emp.lastName}` : "N/A";
  };

  const getEmployeeCode = (employeeId: string) => {
    return employees.find(e => e.id === employeeId)?.employeeCode || "N/A";
  };

  const downloadExcel = (data: Record<string, string | number | boolean | null | undefined>[], filename: string, sheetName: string) => {
    if (data.length === 0) {
      toast({ title: "No Data", description: "No data available for this report.", variant: "destructive" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
    toast({ title: "Downloaded", description: `${filename}.xlsx has been downloaded.` });
  };

  const downloadPDF = (title: string, headers: string[], rows: (string | number)[][], filename: string) => {
    if (rows.length === 0) {
      toast({ title: "No Data", description: "No data available for this report.", variant: "destructive" });
      return;
    }
    const doc = new jsPDF({ orientation: "landscape" });
    const companyName = effectiveCompany ? getCompanyName(effectiveCompany) : "All Companies";
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Company: ${companyName}`, 14, 22);
    doc.text(`Generated: ${format(new Date(), "dd-MMM-yyyy HH:mm")}`, 14, 28);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 34,
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        halign: "center",
        valign: "middle",
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 7,
        lineColor: [0, 0, 0],
        lineWidth: 0.3,
      },
      bodyStyles: {
        lineColor: [100, 100, 100],
        lineWidth: 0.15,
      },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { halign: "left", cellWidth: 18 },
        1: { halign: "left", cellWidth: 30 },
      },
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.3,
    });

    doc.save(`${filename}.pdf`);
    toast({ title: "Downloaded", description: `${filename}.pdf has been downloaded.` });
  };

  const [yearStr, monthStr] = selectedMonth.split("-");
  const monthNum = parseInt(monthStr);
  const yearNum = parseInt(yearStr);
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const monthName = months[monthNum - 1];

  const getEmployeeWeeklyOffs = (emp: Employee): string[] => {
    const policy = emp.timeOfficePolicyId
      ? timeOfficePolicies.find(p => p.id === emp.timeOfficePolicyId)
      : null;
    const companyPolicies = timeOfficePolicies.filter(p => p.companyId === emp.companyId);
    const effectivePolicy = policy || companyPolicies.find(p => p.isDefault && p.status === "active") || companyPolicies.find(p => p.status === "active");
    const offs: string[] = [];
    if (effectivePolicy) {
      offs.push(effectivePolicy.weeklyOff1);
      if (effectivePolicy.weeklyOff2) offs.push(effectivePolicy.weeklyOff2);
    } else {
      offs.push("sunday", "saturday");
    }
    return offs;
  };

  const dayNameMap: Record<number, string> = { 0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday" };

  const isHoliday = (dateStr: string, companyId: string): boolean => {
    return holidays.some(h => h.date === dateStr && h.companyId === companyId && h.status === "active");
  };

  const isApprovedLeave = (dateStr: string, employeeId: string): boolean => {
    return leaveRequests.some(lr => {
      if (lr.employeeId !== employeeId || lr.status !== "approved") return false;
      return dateStr >= lr.startDate && dateStr <= lr.endDate;
    });
  };

  const getDayStatus = (dateStr: string, emp: Employee): string => {
    const record = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
    const date = new Date(dateStr + "T00:00:00");
    const dayName = dayNameMap[date.getDay()];
    const weeklyOffs = getEmployeeWeeklyOffs(emp);

    if (record) {
      if (record.status === "present") return "P";
      if (record.status === "half_day") return "HD";
      if (record.status === "absent") return "A";
      if (record.status === "on_leave") return "L";
      if (record.status === "holiday") return "H";
      if (record.status === "weekend") return "WO";
      return record.status.charAt(0).toUpperCase();
    }

    if (weeklyOffs.includes(dayName)) return "WO";
    if (isHoliday(dateStr, emp.companyId)) return "H";
    if (isApprovedLeave(dateStr, emp.id)) return "L";
    return "-";
  };

  const generateAttendanceSheet = (fileType: "excel" | "pdf") => {
    const emps = filteredEmployees;
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No employees found for selected filters.", variant: "destructive" });
      return;
    }

    const buildAttendanceRow = (emp: Employee) => {
      let present = 0, absent = 0, halfDay = 0, totalOT = 0, storedWO = 0, storedH = 0, lCount = 0;
      const dayStatuses: string[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
        const status = getDayStatus(dateStr, emp);
        dayStatuses.push(status);

        if (status === "P") present++;
        else if (status === "A") absent++;
        else if (status === "HD") halfDay++;
        else if (status === "H") storedH++;
        else if (status === "L") lCount++;

        const record = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
        if (record) {
          totalOT += parseFloat(record.otHours || "0");
          if (record.status === "weekend") storedWO++;
        }
      }

      totalOT = Math.round(totalOT);
      const payDays = Math.min(Math.round(present + halfDay * 0.5 + storedWO + storedH + lCount), daysInMonth);

      return { dayStatuses, present, absent, halfDay, woCount: storedWO, hCount: storedH, lCount, totalOT, payDays, totalWO: storedWO, totalH: storedH };
    };

    if (fileType === "excel") {
      const rows = emps.map(emp => {
        const data = buildAttendanceRow(emp);
        const row: Record<string, string | number | null | undefined> = {
          "Emp Code": emp.employeeCode,
          "Employee Name": `${emp.firstName} ${emp.lastName}`,
        };
        for (let d = 0; d < daysInMonth; d++) {
          row[String(d + 1)] = data.dayStatuses[d];
        }
        row["P"] = data.present;
        row["A"] = data.absent;
        row["HD"] = data.halfDay;
        row["WO"] = data.woCount;
        row["H"] = data.hCount;
        row["L"] = data.lCount;
        row["OT"] = data.totalOT;
        row["Pay Days"] = data.payDays;
        return row;
      });
      downloadExcel(rows, `Attendance_Sheet_${selectedMonth}`, "Attendance");
    } else {
      const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
      const headers = ["Code", "Name", ...dayHeaders, "P", "A", "HD", "WO", "H", "L", "OT", "Pay Days"];
      const rows = emps.map(emp => {
        const data = buildAttendanceRow(emp);
        return [
          emp.employeeCode,
          `${emp.firstName} ${emp.lastName}`,
          ...data.dayStatuses,
          data.present,
          data.absent,
          data.halfDay,
          data.woCount,
          data.hCount,
          data.lCount,
          data.totalOT,
          data.payDays,
        ] as (string | number)[];
      });
      downloadPDF(`Attendance Sheet - ${monthName} ${yearNum}`, headers, rows, `Attendance_Sheet_${selectedMonth}`);
    }
  };

  const generateSalarySheet = (fileType: "excel" | "pdf") => {
    const monthPayroll = payrollRecords.filter(p =>
      p.month === monthName && p.year === yearNum &&
      (effectiveCompany ? p.companyId === effectiveCompany : true)
    );
    const emps = filteredEmployees;

    // Compute Pay Days from stored attendance records directly:
    // Present + Half Days (0.5) + stored Weekend records + stored Holiday records + Leave records
    // Stored "weekend" records come from Quick Entry / manual entry and represent earned weekly offs.
    const computePayDays = (emp: Employee): number => {
      let present = 0, halfDay = 0, storedWO = 0, storedH = 0, lCount = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
        const record = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
        if (!record) continue;
        if (record.status === "present") present++;
        else if (record.status === "half_day") halfDay++;
        else if (record.status === "weekend") storedWO++;
        else if (record.status === "holiday") storedH++;
        else if (record.status === "on_leave") lCount++;
      }
      return Math.min(Math.round(present + halfDay * 0.5 + storedWO + storedH + lCount), daysInMonth);
    };

    const buildRow = (emp: Employee, c: ReturnType<typeof getProRatedComponents> | null, pr: Payroll | null) => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const rateOth = (ss?.otherAllowances || 0) + (ss?.specialAllowance || 0) + (ss?.medicalAllowance || 0);
      const earnOth = (c?.otherAllowances || 0) + (c?.specialAllowance || 0) + (c?.medicalAllowance || 0);
      // Always compute Pay Days from live attendance data — do not rely on stored pr.payDays
      const payDaysVal = computePayDays(emp);
      return {
        code: emp.employeeCode || "",
        name: `${emp.firstName} ${emp.lastName}`,
        dept: emp.department || "-",
        desig: emp.designation || "-",
        monthDays: pr ? pr.workingDays : daysInMonth,
        payDays: payDaysVal,
        rateBasic: ss?.basicSalary || 0,
        rateHra: ss?.hra || 0,
        rateConv: ss?.conveyance || 0,
        rateOth,
        earnBasic: c?.basicSalary || 0,
        earnHra: c?.hra || 0,
        earnConv: c?.conveyance || 0,
        earnOth,
        bonus: c?.bonus || 0,
        otHours: Number((pr as any)?.otHours || 0),
        otAmount: Number((pr as any)?.otAmount || 0),
        pf: c?.pfEmployee || 0,
        esic: c?.esi || 0,
        lwf: c?.lwfEmployee || 0,
        tds: c?.tds || 0,
        pt: c?.professionalTax || 0,
        adv: (c?.otherDeductions || 0) + ((c as any)?.loanDeduction || 0),
        netPay: c?.netSalary || 0,
        get rateTotal() { return this.rateBasic + this.rateHra + this.rateConv + this.rateOth; },
        get earnTotal() { return this.earnBasic + this.earnHra + this.earnConv + this.earnOth + this.bonus + this.otAmount; },
        get dedTotal() { return this.pf + this.esic + this.lwf + this.tds + this.pt + this.adv; },
      };
    };

    const dataRows = monthPayroll.length > 0
      ? monthPayroll.map(p => {
          const emp = employees.find(e => e.id === p.employeeId);
          if (!emp) return null;
          const ss = salaryStructures.find(s => s.employeeId === emp.id);
          const attPayDays = computePayDays(emp);
          return buildRow(emp, getProRatedComponents(emp, ss, p, attPayDays), p);
        }).filter(Boolean) as ReturnType<typeof buildRow>[]
      : emps.map(emp => {
          const ss = salaryStructures.find(s => s.employeeId === emp.id);
          return buildRow(emp, getProRatedComponents(emp, ss, null), null);
        });

    if (dataRows.length === 0) {
      toast({ title: "No Data", description: "No salary data available.", variant: "destructive" });
      return;
    }

    if (fileType === "excel") {
      const rows = dataRows.map(r => ({
        "Code": r.code, "Name": r.name, "Department": r.dept, "Designation": r.desig,
        "Month Days": r.monthDays, "Pay Days": r.payDays,
        "Rate: Basic": r.rateBasic, "Rate: HRA": r.rateHra, "Rate: Conv": r.rateConv, "Rate: Other": r.rateOth,
        "Rate: Total": r.rateBasic + r.rateHra + r.rateConv + r.rateOth,
        "Earn: Basic": r.earnBasic, "Earn: HRA": r.earnHra, "Earn: Conv": r.earnConv, "Earn: Other": r.earnOth, "Earn: Bonus": r.bonus,
        "OT Hrs": r.otHours, "OT Amount": r.otAmount,
        "Earn: Total": r.earnBasic + r.earnHra + r.earnConv + r.earnOth + r.bonus + r.otAmount,
        "Ded: PF": r.pf, "Ded: ESIC": r.esic, "Ded: LWF": r.lwf, "Ded: TDS": r.tds, "Ded: PT": r.pt, "Ded: Adv": r.adv,
        "Ded: Total": r.pf + r.esic + r.lwf + r.tds + r.pt + r.adv,
        "Net Pay": r.netPay,
      }));
      const totalExcelRow: Record<string, string | number> = { "Code": "", "Name": "TOTAL", "Department": "", "Designation": "", "Month Days": "", "Pay Days": "" };
      const numKeys = ["Rate: Basic","Rate: HRA","Rate: Conv","Rate: Other","Rate: Total","Earn: Basic","Earn: HRA","Earn: Conv","Earn: Other","Earn: Bonus","OT Hrs","OT Amount","Earn: Total","Ded: PF","Ded: ESIC","Ded: LWF","Ded: TDS","Ded: PT","Ded: Adv","Ded: Total","Net Pay"];
      for (const k of numKeys) totalExcelRow[k] = rows.reduce((s, r) => s + (Number(r[k as keyof typeof r]) || 0), 0);
      downloadExcel([...rows, totalExcelRow], `Salary_Sheet_${selectedMonth}`, "Salary Sheet");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = 297;
    const ml = 8;
    const company = companies.find(co => co.id === effectiveCompany);
    const companyName = company?.companyName || (effectiveCompany ? getCompanyName(effectiveCompany) : "All Companies");
    const companyAddr = (company as any)?.registeredAddress || (company as any)?.address || "";
    const companyCityState = [(company as any)?.city, (company as any)?.state].filter(Boolean).join(" - ");

    let y = 14;

    // ── Company Header ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    const nameW = doc.getTextWidth(companyName);
    doc.text(companyName, pageW / 2, y, { align: "center" });
    doc.setLineWidth(0.5);
    doc.line(pageW / 2 - nameW / 2, y + 1.5, pageW / 2 + nameW / 2, y + 1.5);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    if (companyAddr) { doc.text(companyAddr, pageW / 2, y, { align: "center" }); y += 4.5; }
    if (companyCityState) { doc.text(companyCityState, pageW / 2, y, { align: "center" }); y += 4.5; }
    y += 2;

    // ── Report Title ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const title = `Salary Sheet - ${monthName} ${yearNum}`;
    const titleW = doc.getTextWidth(title);
    doc.text(title, pageW / 2, y, { align: "center" });
    doc.setLineWidth(0.4);
    doc.line(pageW / 2 - titleW / 2, y + 1.5, pageW / 2 + titleW / 2, y + 1.5);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`Generated: ${format(new Date(), "dd-MMM-yyyy HH:mm")}`, ml, y);
    y += 5;

    // ── Totals ──
    const sum = (key: keyof typeof dataRows[0]) =>
      dataRows.reduce((acc, r) => acc + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);

    const sumRateTotal = dataRows.reduce((a, r) => a + r.rateBasic + r.rateHra + r.rateConv + r.rateOth, 0);
    const sumEarnTotal = dataRows.reduce((a, r) => a + r.earnBasic + r.earnHra + r.earnConv + r.earnOth + r.bonus + r.otAmount, 0);
    const sumDedTotal = dataRows.reduce((a, r) => a + r.pf + r.esic + r.lwf + r.tds + r.pt + r.adv, 0);
    const totalsRow = [
      { content: "TOTAL", colSpan: 6, styles: { fontStyle: "bold" as const, halign: "right" as const } },
      sum("otHours"),
      sum("rateBasic"), sum("rateHra"), sum("rateConv"), sum("rateOth"), sumRateTotal,
      sum("earnBasic"), sum("earnHra"), sum("earnConv"), sum("earnOth"), sum("bonus"), sum("otAmount"), sumEarnTotal,
      sum("pf"), sum("esic"), sum("lwf"), sum("tds"), sum("pt"), sum("adv"), sumDedTotal,
      sum("netPay"),
    ];

    autoTable(doc, {
      startY: y,
      head: [
        [
          { content: "Code",        rowSpan: 2, styles: { halign: "center", valign: "middle" } },
          { content: "Name",        rowSpan: 2, styles: { halign: "center", valign: "middle" } },
          { content: "Department",  rowSpan: 2, styles: { halign: "center", valign: "middle" } },
          { content: "Designation", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
          { content: "Mon.Days",    rowSpan: 2, styles: { halign: "center", valign: "middle" } },
          { content: "Pay Days",    rowSpan: 2, styles: { halign: "center", valign: "middle" } },
          { content: "OT Hrs",      rowSpan: 2, styles: { halign: "center", valign: "middle" } },
          { content: "Rate",        colSpan: 5,  styles: { halign: "center" } },
          { content: "Earnings",    colSpan: 7,  styles: { halign: "center" } },
          { content: "Deductions",  colSpan: 7,  styles: { halign: "center" } },
          { content: "Net Pay",     rowSpan: 2, styles: { halign: "center", valign: "middle" } },
        ],
        [
          "Basic", "HRA", "Conv", "Other", "Total",
          "Basic", "HRA", "Conv", "Other", "Bonus", "OT Amt", "Total",
          "PF", "ESIC", "LWF", "TDS", "PT", "Adv", "Total",
        ],
      ],
      body: dataRows.map(r => [
        r.code, r.name, r.dept, r.desig, r.monthDays, r.payDays,
        r.otHours,
        r.rateBasic, r.rateHra, r.rateConv, r.rateOth, r.rateBasic + r.rateHra + r.rateConv + r.rateOth,
        r.earnBasic, r.earnHra, r.earnConv, r.earnOth, r.bonus, r.otAmount, r.earnBasic + r.earnHra + r.earnConv + r.earnOth + r.bonus + r.otAmount,
        r.pf, r.esic, r.lwf, r.tds, r.pt, r.adv, r.pf + r.esic + r.lwf + r.tds + r.pt + r.adv,
        r.netPay,
      ]),
      foot: [totalsRow],
      footStyles: {
        fillColor: [220, 220, 220],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        fontSize: 7,
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        halign: "right",
      },
      styles: {
        fontSize: 6.5,
        cellPadding: 1.2,
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        textColor: [0, 0, 0],
        halign: "right",
      },
      headStyles: {
        fillColor: [59, 89, 152],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 6.5,
        halign: "center",
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
      },
      columnStyles: {
        // Info columns
        0:  { cellWidth: 13, halign: "center" },  // Code
        1:  { cellWidth: 26, halign: "left" },     // Name
        2:  { cellWidth: 18, halign: "left" },     // Dept
        3:  { cellWidth: 18, halign: "left" },     // Desig
        4:  { cellWidth: 10, halign: "center" },   // Mon.Days
        5:  { cellWidth: 10, halign: "center" },   // Pay Days
        // Rate (5 cols)
        6:  { cellWidth: 10 },  // R.Basic
        7:  { cellWidth: 9 },   // R.HRA
        8:  { cellWidth: 8 },   // R.Conv
        9:  { cellWidth: 8 },   // R.Other
        10: { cellWidth: 11, fillColor: [235, 240, 255] },  // R.Total (highlighted)
        // Earnings (6 cols)
        11: { cellWidth: 10 },  // E.Basic
        12: { cellWidth: 9 },   // E.HRA
        13: { cellWidth: 8 },   // E.Conv
        14: { cellWidth: 8 },   // E.Other
        15: { cellWidth: 8 },   // Bonus
        16: { cellWidth: 11, fillColor: [235, 240, 255] },  // E.Total (highlighted)
        // Deductions (7 cols)
        17: { cellWidth: 8 },   // PF
        18: { cellWidth: 8 },   // ESIC
        19: { cellWidth: 7 },   // LWF
        20: { cellWidth: 7 },   // TDS
        21: { cellWidth: 7 },   // PT
        22: { cellWidth: 9 },   // Adv
        23: { cellWidth: 11, fillColor: [235, 240, 255] },  // D.Total (highlighted)
        // Net Pay
        24: { cellWidth: 12 },
      },
      margin: { left: ml, right: ml },
      theme: "plain",
    });

    doc.save(`Salary_Sheet_${selectedMonth}.pdf`);
  };

  const generatePFStatement = (fileType: "excel" | "pdf") => {
    const pfEmployees = filteredEmployees.filter(e => e.pfApplicable);
    if (pfEmployees.length === 0) {
      toast({ title: "No Data", description: "No PF-applicable employees found.", variant: "destructive" });
      return;
    }

    const getPFData = (emp: Employee) => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const pr = payrollRecords.find(p => p.employeeId === emp.id && p.month === monthName && p.year === yearNum);
      const c = getProRatedComponents(emp, ss, pr || null);
      const settings = getStatutorySettings(emp.companyId);
      const pfWageCeiling = Number(settings?.pfWageCeiling) || 15000;
      const pfPercent = Number(settings?.pfEmployeePercent) || 12;
      const epfWage = c.basicSalary;
      const epsWage = Math.min(epfWage, pfWageCeiling);
      const epfEE = c.pfEmployee;
      const epsER = Math.round(epsWage * 0.0833);
      const epfDiff = Math.max(epfEE - epsER, 0);
      return { grossSalary: c.grossSalary, epfWage, epsWage, epfEE, epsER, epfDiff, ncpDays: pr?.leaveDays || 0 };
    };

    if (fileType === "excel") {
      const rows = pfEmployees.map(emp => {
        const d = getPFData(emp);
        return {
          "UAN": emp.uan || "",
          "Member Name": `${emp.firstName} ${emp.lastName}`,
          "Gross Wages": d.grossSalary,
          "EPF Wages": d.epfWage,
          "EPS Wages": d.epsWage,
          "EDLI Wages": d.epsWage,
          "EPF Contribution (EE)": d.epfEE,
          "EPS Contribution (ER)": d.epsER,
          "EPF Diff (ER)": d.epfDiff,
          "NCP Days": d.ncpDays,
        };
      });
      downloadExcel(rows, `PF_ECR_${selectedMonth}`, "PF ECR");
    } else {
      const headers = ["UAN", "Name", "Gross", "EPF Wages", "EPS Wages", "EPF (EE)", "EPS (ER)", "EPF Diff", "NCP"];
      const rows = pfEmployees.map(emp => {
        const d = getPFData(emp);
        return [
          emp.uan || "N/A",
          `${emp.firstName} ${emp.lastName}`,
          d.grossSalary,
          d.epfWage,
          d.epsWage,
          d.epfEE,
          d.epsER,
          d.epfDiff,
          d.ncpDays,
        ] as (string | number)[];
      });
      downloadPDF(`PF Statement (ECR) - ${monthName} ${yearNum}`, headers, rows, `PF_ECR_${selectedMonth}`);
    }
  };

  const generateESICStatement = (fileType: "excel" | "pdf") => {
    const esicEmployees = filteredEmployees.filter(e => e.esiApplicable);
    if (esicEmployees.length === 0) {
      toast({ title: "No Data", description: "No ESIC-applicable employees found.", variant: "destructive" });
      return;
    }

    const getESICData = (emp: Employee) => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const pr = payrollRecords.find(p => p.employeeId === emp.id && p.month === monthName && p.year === yearNum);
      const c = getProRatedComponents(emp, ss, pr || null);
      const settings = getStatutorySettings(emp.companyId);
      const wageCeiling = Number(settings?.esicWageCeiling) || 21000;
      const empPercent = Number(settings?.esicEmployeePercent) || 75;
      const erPercent = Number(settings?.esicEmployerPercent) || 325;
      const esiEE = c.esi;
      let esiER = 0;
      // Eligibility on contracted salary; employer contribution on earned/prorated salary
      const contractedGross = ss?.grossSalary || c.grossSalary;
      if (contractedGross <= wageCeiling) {
        if (settings?.esicCalcOnGross) {
          esiER = Math.round(Math.min(c.grossSalary, wageCeiling) * erPercent / 10000);
        } else {
          const esicBase = Math.min(Math.max(c.basicSalary, c.grossSalary * 0.5), wageCeiling);
          esiER = Math.round(esicBase * erPercent / 10000);
        }
      }
      return { grossSalary: c.grossSalary, esiEE, esiER, days: Number(pr?.payDays) || pr?.presentDays || pr?.workingDays || 0 };
    };

    if (fileType === "excel") {
      const rows = esicEmployees.map(emp => {
        const d = getESICData(emp);
        return {
          "ESIC Number": emp.esiNumber || "",
          "Employee Name": `${emp.firstName} ${emp.lastName}`,
          "No. of Days": d.days,
          "Total Wages": d.grossSalary,
          "IP Contribution (0.75%)": d.esiEE,
          "Employer Contribution (3.25%)": d.esiER,
          "Total Contribution": d.esiEE + d.esiER,
        };
      });
      downloadExcel(rows, `ESIC_Statement_${selectedMonth}`, "ESIC Statement");
    } else {
      const headers = ["ESIC No.", "Name", "Days", "Wages", "IP (0.75%)", "ER (3.25%)", "Total"];
      const rows = esicEmployees.map(emp => {
        const d = getESICData(emp);
        return [
          emp.esiNumber || "N/A",
          `${emp.firstName} ${emp.lastName}`,
          d.days,
          d.grossSalary,
          d.esiEE,
          d.esiER,
          d.esiEE + d.esiER,
        ] as (string | number)[];
      });
      downloadPDF(`ESIC Statement - ${monthName} ${yearNum}`, headers, rows, `ESIC_Statement_${selectedMonth}`);
    }
  };

  const generatePaySlip = (fileType: "excel" | "pdf") => {
    const monthPayroll = payrollRecords.filter(p =>
      p.month === monthName && p.year === yearNum &&
      (effectiveCompany ? p.companyId === effectiveCompany : true)
    );

    const emps = filteredEmployees;

    const buildPaySlipPDF = (emp: Employee, c: ReturnType<typeof getProRatedComponents>, workingDays?: number, presentDays?: number, leaveDays?: number, payDays?: number, otHoursArg?: number, otAmountArg?: number) => {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const company = companies.find(co => co.id === emp.companyId);
      const companyName = company?.companyName || getCompanyName(emp.companyId);
      const pageW = 210;
      const ml = 14;
      const contentW = pageW - ml * 2;

      const fmt = (n: number | null | undefined) => {
        const v = Number(n) || 0;
        return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      const toWords = (n: number): string => {
        if (n <= 0) return "Zero";
        const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
        const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
        const convert = (num: number): string => {
          if (num < 20) return ones[num];
          if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
          if (num < 1000) return ones[Math.floor(num / 100)] + " Hundred" + (num % 100 ? " " + convert(num % 100) : "");
          if (num < 100000) return convert(Math.floor(num / 1000)) + " Thousand" + (num % 1000 ? " " + convert(num % 1000) : "");
          if (num < 10000000) return convert(Math.floor(num / 100000)) + " Lakh" + (num % 100000 ? " " + convert(num % 100000) : "");
          return convert(Math.floor(num / 10000000)) + " Crore" + (num % 10000000 ? " " + convert(num % 10000000) : "");
        };
        return convert(Math.floor(n));
      };

      let y = 16;

      // ── Company Name ──
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text(companyName, pageW / 2, y, { align: "center" });
      const nameW = doc.getTextWidth(companyName);
      doc.setLineWidth(0.5);
      doc.line(pageW / 2 - nameW / 2, y + 1.5, pageW / 2 + nameW / 2, y + 1.5);
      y += 7;

      // ── Company Address ──
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const addr = (company as any)?.registeredAddress || (company as any)?.address || "";
      if (addr) { doc.text(addr, pageW / 2, y, { align: "center" }); y += 4.5; }
      const cityState = [(company as any)?.city, (company as any)?.state].filter(Boolean).join(" - ");
      if (cityState) { doc.text(cityState, pageW / 2, y, { align: "center" }); y += 4.5; }
      y += 3;

      // ── Payslip Title ──
      const title = `PaySlip For ${monthName}-${yearNum}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(title, pageW / 2, y, { align: "center" });
      const titleW = doc.getTextWidth(title);
      doc.setLineWidth(0.4);
      doc.line(pageW / 2 - titleW / 2, y + 1.5, pageW / 2 + titleW / 2, y + 1.5);
      y += 9;

      // ── Employee Info Box ──
      const salDays = workingDays || 0;
      const presDays = presentDays || 0;
      const lvDays = leaveDays || 0;
      // payDaysVal: days employee is entitled to pay (present + weekly off + holidays + paid leaves)
      const payDaysVal = payDays ?? (presDays + lvDays);
      const absDays = Math.max(0, salDays - payDaysVal);
      // Off Days = weekly offs + public holidays (paid non-working days)
      const offDays = Math.max(0, payDaysVal - presDays - lvDays);

      const leftInfo: [string, string][] = [
        ["Code", emp.employeeCode || "-"],
        ["Name", `${emp.firstName} ${emp.lastName}`],
        ["Designation", emp.designation || "-"],
        ["Office", (emp as any).location || companyName],
        ["Department", emp.department || "-"],
        ["UAN No", (emp as any).uan || "-"],
      ];
      const otHrsVal = Number(otHoursArg || 0);
      const otAmtVal = Number(otAmountArg || 0);
      const rightInfo: [string, string, string, string][] = [
        ["Salary Days", fmt(salDays), "PAN No", (emp as any).pan || "-"],
        ["Pay Days", fmt(payDaysVal), "Bank Name", (emp as any).bankName || "-"],
        ["Present Days", fmt(presDays), "Bank A/c", (emp as any).bankAccount || "-"],
        ["Absent Days", fmt(absDays), "Late Days", "0.00"],
        ["Off Days", fmt(offDays), "Holiday", "0.00"],
        ["Leave Days", fmt(lvDays), "Encashed Days", "0.00"],
        ["OT Hours", otHrsVal.toFixed(2), "OT Amount", fmt(otAmtVal)],
      ];

      const infoRows = Math.max(leftInfo.length, rightInfo.length);

      autoTable(doc, {
        startY: y,
        body: Array.from({ length: infoRows }, (_, i) => {
          const [ll, lv] = leftInfo[i] || ["", ""];
          const [rl1, rv1, rl2, rv2] = rightInfo[i] || ["", "", "", ""];
          return [
            { content: ll, styles: { fontStyle: "bold" } },
            lv,
            { content: rl1, styles: { fontStyle: "bold" } },
            rv1,
            { content: rl2, styles: { fontStyle: "bold" } },
            rv2,
          ];
        }),
        styles: {
          fontSize: 8.2,
          cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 },
          textColor: [0, 0, 0],
          lineColor: [0, 0, 0],
          lineWidth: 0.25,
          overflow: "ellipsize",
        },
        columnStyles: {
          0: { cellWidth: 24, fontStyle: "bold" },
          1: { cellWidth: 57 },
          2: { cellWidth: 25, fontStyle: "bold" },
          3: { cellWidth: 22, halign: "right" },
          4: { cellWidth: 28, fontStyle: "bold" },
          5: { cellWidth: 26, halign: "right" },
        },
        margin: { left: ml, right: ml },
        theme: "plain",
      });

      y = ((doc as any).lastAutoTable?.finalY || y) + 5;

      // ── Earnings / Deductions Table ──
      const earnRows: [string, string][] = [];
      if (c.basicSalary > 0) earnRows.push(["Basic Salary", fmt(c.basicSalary)]);
      if (c.hra > 0) earnRows.push(["House Rent Allowance", fmt(c.hra)]);
      if (c.conveyance > 0) earnRows.push(["Conveyance Allowances", fmt(c.conveyance)]);
      if (c.medicalAllowance > 0) earnRows.push(["Medical Allowance", fmt(c.medicalAllowance)]);
      if (c.specialAllowance > 0) earnRows.push(["Special Allowance", fmt(c.specialAllowance)]);
      if (c.otherAllowances > 0) earnRows.push(["Other Allowances", fmt(c.otherAllowances)]);
      if (c.bonus > 0) earnRows.push(["Bonus", fmt(c.bonus)]);
      if (otAmtVal > 0) earnRows.push([`OT Amount (${otHrsVal.toFixed(2)} hrs)`, fmt(otAmtVal)]);

      const dedRows: [string, string][] = [];
      if (c.pfEmployee > 0) dedRows.push(["Employee PF Deduction", fmt(c.pfEmployee)]);
      if (c.esi > 0) dedRows.push(["ESI Deduction", fmt(c.esi)]);
      if (c.professionalTax > 0) dedRows.push(["Professional Tax", fmt(c.professionalTax)]);
      if (c.lwfEmployee > 0) dedRows.push(["LWF", fmt(c.lwfEmployee)]);
      if (c.tds > 0) dedRows.push(["TDS", fmt(c.tds)]);
      if (c.otherDeductions > 0) dedRows.push(["Other Deductions", fmt(c.otherDeductions)]);
      if ((c as any).loanDeduction > 0) dedRows.push(["Loan / Advance", fmt((c as any).loanDeduction)]);

      const maxR = Math.max(earnRows.length, dedRows.length, 1);
      while (earnRows.length < maxR) earnRows.push(["", ""]);
      while (dedRows.length < maxR) dedRows.push(["", ""]);

      const tableBody = earnRows.map(([el, ea], i) => [el, ea, dedRows[i][0], dedRows[i][1]]);

      autoTable(doc, {
        startY: y,
        head: [[
          { content: "Earnings", styles: { halign: "left" } },
          { content: "Amt. (Rs.)", styles: { halign: "right" } },
          { content: "Deductions", styles: { halign: "left" } },
          { content: "Amt. (Rs.)", styles: { halign: "right" } },
        ]],
        body: tableBody,
        foot: [
          [
            { content: "Gross Pay :", styles: { fontStyle: "bold", halign: "right" } },
            { content: fmt(c.totalEarnings), styles: { fontStyle: "bold", halign: "right" } },
            { content: "Deductions :", styles: { fontStyle: "bold", halign: "right" } },
            { content: fmt(c.totalDeductions), styles: { fontStyle: "bold", halign: "right" } },
          ],
          [
            { content: "", colSpan: 2 },
            { content: "Net pay :", styles: { fontStyle: "bold", halign: "right" } },
            { content: fmt(c.netSalary), styles: { fontStyle: "bold", halign: "right" } },
          ],
        ],
        styles: {
          fontSize: 9,
          cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 },
          lineColor: [0, 0, 0],
          lineWidth: 0.25,
          textColor: [0, 0, 0],
        },
        headStyles: {
          fillColor: [210, 210, 210],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          fontSize: 9,
          lineColor: [0, 0, 0],
          lineWidth: 0.25,
        },
        footStyles: {
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          fontSize: 9.5,
          lineColor: [0, 0, 0],
          lineWidth: 0.25,
        },
        columnStyles: {
          0: { cellWidth: 62 },
          1: { cellWidth: 29, halign: "right" },
          2: { cellWidth: 62 },
          3: { cellWidth: 29, halign: "right" },
        },
        margin: { left: ml, right: ml },
        theme: "plain",
      });

      const finalY = (doc as any).lastAutoTable?.finalY || y + 60;
      let ty = finalY + 5;

      // ── Amount in Words ──
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.25);
      doc.rect(ml, ty, contentW, 9);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Rupees ${toWords(Math.round(c.netSalary))} Only`, ml + 3, ty + 6);
      ty += 14;

      // ── Signature Space ──
      doc.rect(ml, ty, contentW, 18);
      ty += 23;

      // ── Footer ──
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text("This is a system generated document does not require Signature", pageW / 2, ty, { align: "center" });
      doc.setTextColor(0, 0, 0);

      doc.save(`PaySlip_${emp.employeeCode}_${selectedMonth}.pdf`);
    };

    if (fileType === "excel") {
      if (monthPayroll.length > 0) {
        const rows = monthPayroll.map(p => {
          const emp = employees.find(e => e.id === p.employeeId);
          const ss = salaryStructures.find(s => s.employeeId === p.employeeId);
          const c = emp ? getProRatedComponents(emp, ss, p) : null;
          return {
            "Emp Code": emp?.employeeCode || "",
            "Employee Name": getEmployeeName(p.employeeId),
            "Department": emp?.department || "",
            "Designation": emp?.designation || "",
            "Working Days": p.workingDays,
            "Present Days": p.presentDays,
            "Leave Days": p.leaveDays || 0,
            "Basic Salary": c?.basicSalary || 0,
            "HRA": c?.hra || 0,
            "Conveyance": c?.conveyance || 0,
            "Medical Allowance": c?.medicalAllowance || 0,
            "Special Allowance": c?.specialAllowance || 0,
            "Other Allowances": c?.otherAllowances || 0,
            "Statutory Bonus": c?.bonus || 0,
            "Total Earnings": c?.totalEarnings || 0,
            "PF Deduction": c?.pfEmployee || 0,
            "ESI Deduction": c?.esi || 0,
            "Prof. Tax": c?.professionalTax || 0,
            "LWF": c?.lwfEmployee || 0,
            "TDS": c?.tds || 0,
            "Other Deductions": c?.otherDeductions || 0,
            "Loan / Advance": (c as any)?.loanDeduction || 0,
            "Total Deductions": c?.totalDeductions || 0,
            "Net Salary": c?.netSalary || 0,
          };
        });
        downloadExcel(rows, `PaySlips_${selectedMonth}`, "Pay Slips");
      } else {
        const rows = emps.map(emp => {
          const ss = salaryStructures.find(s => s.employeeId === emp.id);
          const c = getProRatedComponents(emp, ss, null);
          return {
            "Emp Code": emp.employeeCode,
            "Employee Name": `${emp.firstName} ${emp.lastName}`,
            "Department": emp.department || "",
            "Designation": emp.designation || "",
            "Working Days": "-",
            "Present Days": "-",
            "Leave Days": "-",
            "Basic Salary": c.basicSalary,
            "HRA": c.hra,
            "Conveyance": c.conveyance,
            "Medical Allowance": c.medicalAllowance,
            "Special Allowance": c.specialAllowance,
            "Other Allowances": c.otherAllowances,
            "Statutory Bonus": c.bonus,
            "Total Earnings": c.totalEarnings,
            "PF Deduction": c.pfEmployee,
            "ESI Deduction": c.esi,
            "Prof. Tax": c.professionalTax,
            "LWF": c.lwfEmployee,
            "TDS": c.tds,
            "Other Deductions": c.otherDeductions,
            "Loan / Advance": (c as any).loanDeduction || 0,
            "Total Deductions": c.totalDeductions,
            "Net Salary": c.netSalary,
          };
        });
        downloadExcel(rows, `PaySlips_${selectedMonth}`, "Pay Slips");
      }
    } else {
      if (monthPayroll.length > 0) {
        monthPayroll.forEach(p => {
          const emp = employees.find(e => e.id === p.employeeId);
          if (!emp) return;
          const ss = salaryStructures.find(s => s.employeeId === p.employeeId);
          const c = getProRatedComponents(emp, ss, p);
          buildPaySlipPDF(emp, c, p.workingDays, p.presentDays, p.leaveDays || 0, Number(p.payDays) || undefined, Number((p as any).otHours || 0), Number((p as any).otAmount || 0));
        });
        toast({ title: "Downloaded", description: `${monthPayroll.length} pay slip(s) downloaded.` });
      } else if (emps.length > 0) {
        let generated = 0;
        emps.forEach(emp => {
          const ss = salaryStructures.find(s => s.employeeId === emp.id);
          if (!ss) return;
          const c = getProRatedComponents(emp, ss, null);
          buildPaySlipPDF(emp, c);
          generated++;
        });
        if (generated > 0) {
          toast({ title: "Downloaded", description: `${generated} pay slip(s) downloaded.` });
        } else {
          toast({ title: "No Data", description: "No salary structures found to generate pay slips.", variant: "destructive" });
        }
      } else {
        toast({ title: "No Data", description: "No payroll or employee data available.", variant: "destructive" });
      }
    }
  };

  const generateEmployeeList = (fileType: "excel" | "pdf") => {
    const emps = filteredEmployees;
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No employees found.", variant: "destructive" });
      return;
    }

    if (fileType === "excel") {
      const rows = emps.map(emp => ({
        "Emp Code": emp.employeeCode,
        "First Name": emp.firstName,
        "Last Name": emp.lastName,
        "Company": getCompanyName(emp.companyId),
        "Gender": emp.gender || "",
        "Date of Birth": emp.dateOfBirth || "",
        "Mobile": emp.mobileNumber || "",
        "Email": emp.officialEmail || "",
        "Date of Joining": emp.dateOfJoining || "",
        "Department": emp.department || "",
        "Designation": emp.designation || "",
        "Location": emp.location || "",
        "Employment Type": emp.employmentType || "",
        "Status": emp.status,
        "PF Applicable": emp.pfApplicable ? "Yes" : "No",
        "ESI Applicable": emp.esiApplicable ? "Yes" : "No",
        "UAN": emp.uan || "",
        "ESI Number": emp.esiNumber || "",
        "PAN": emp.pan || "",
        "Bank Account": emp.bankAccount || "",
        "IFSC": emp.ifsc || "",
      }));
      downloadExcel(rows, "Employee_List", "Employees");
    } else {
      const headers = ["Code", "Name", "Company", "Department", "Designation", "DOJ", "Mobile", "Status"];
      const rows = emps.map(emp => [
        emp.employeeCode,
        `${emp.firstName} ${emp.lastName}`,
        getCompanyName(emp.companyId),
        emp.department || "N/A",
        emp.designation || "N/A",
        emp.dateOfJoining || "N/A",
        emp.mobileNumber || "N/A",
        emp.status,
      ] as (string | number)[]);
      downloadPDF("Employee List", headers, rows, "Employee_List");
    }
  };

  const generateEmployeePayStructure = (fileType: "excel" | "pdf") => {
    const emps = filteredEmployees;
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No employees found.", variant: "destructive" });
      return;
    }

    if (fileType === "excel") {
      const rows = emps.map(emp => {
        const ss = salaryStructures.find(s => s.employeeId === emp.id);
        return {
          "Emp Code": emp.employeeCode,
          "Employee Name": `${emp.firstName} ${emp.lastName}`,
          "Gross Salary": emp.grossSalary || ss?.grossSalary || 0,
          "Basic Salary": ss?.basicSalary || 0,
          "HRA": ss?.hra || 0,
          "Conveyance": ss?.conveyance || 0,
          "Medical Allowance": ss?.medicalAllowance || 0,
          "Special Allowance": ss?.specialAllowance || 0,
          "Other Allowances": ss?.otherAllowances || 0,
          "PF (Employee)": ss?.pfEmployee || 0,
          "PF (Employer)": ss?.pfEmployer || 0,
          "ESI": ss?.esi || 0,
          "Prof. Tax": ss?.professionalTax || 0,
          "LWF": ss?.lwfEmployee || 0,
          "TDS": ss?.tds || 0,
          "Other Deductions": ss?.otherDeductions || 0,
          "Net Salary": ss?.netSalary || 0,
          "PF Applicable": emp.pfApplicable ? "Yes" : "No",
          "ESI Applicable": emp.esiApplicable ? "Yes" : "No",
          "Effective From": ss?.effectiveFrom || "N/A",
        };
      });
      downloadExcel(rows, "Employee_Pay_Structure", "Pay Structure");
    } else {
      const headers = ["Code", "Name", "Gross", "Basic", "HRA", "Conv.", "Spl.All.", "PF", "ESI", "PT", "LWF", "Net", "PF App.", "ESI App."];
      const rows = emps.map(emp => {
        const ss = salaryStructures.find(s => s.employeeId === emp.id);
        return [
          emp.employeeCode,
          `${emp.firstName} ${emp.lastName}`,
          emp.grossSalary || ss?.grossSalary || 0,
          ss?.basicSalary || 0,
          ss?.hra || 0,
          ss?.conveyance || 0,
          ss?.specialAllowance || 0,
          ss?.pfEmployee || 0,
          ss?.esi || 0,
          ss?.professionalTax || 0,
          ss?.lwfEmployee || 0,
          ss?.netSalary || 0,
          emp.pfApplicable ? "Yes" : "No",
          emp.esiApplicable ? "Yes" : "No",
        ] as (string | number)[];
      });
      downloadPDF("Employee Pay Structure", headers, rows, "Employee_Pay_Structure");
    }
  };

  const generateFnFReport = (fileType: "excel" | "pdf") => {
    const settlements = fnfSettlements.filter(s =>
      effectiveCompany ? s.companyId === effectiveCompany : true
    );
    if (settlements.length === 0) {
      toast({ title: "No Data", description: "No F&F settlements found for selected filters.", variant: "destructive" });
      return;
    }

    if (fileType === "excel") {
      const rows = settlements.map(s => ({
        "Emp Code": getEmployeeCode(s.employeeId),
        "Employee Name": getEmployeeName(s.employeeId),
        "Company": getCompanyName(s.companyId),
        "Settlement Date": s.settlementDate,
        "Last Working Day": s.lastWorkingDay,
        "Salary Due": s.salaryDue || 0,
        "Leave Encashment": s.leaveEncashment || 0,
        "Bonus": s.bonus || 0,
        "Gratuity": s.gratuity || 0,
        "Notice Pay": s.noticePay || 0,
        "Other Earnings": s.otherEarnings || 0,
        "Total Earnings": s.totalEarnings,
        "PF Deduction": s.pfDeduction || 0,
        "ESI Deduction": s.esiDeduction || 0,
        "Professional Tax": s.professionalTax || 0,
        "TDS": s.tds || 0,
        "Loan Recovery": s.loanRecovery || 0,
        "Notice Period Recovery": s.noticePeriodRecovery || 0,
        "Other Deductions": s.otherDeductions || 0,
        "Total Deductions": s.totalDeductions,
        "Net Payable": s.netPayable,
        "Status": s.status.charAt(0).toUpperCase() + s.status.slice(1),
        "Remarks": s.remarks || "",
      }));
      downloadExcel(rows, `FnF_Settlement_Report`, "F&F Settlement");
    } else {
      const headers = ["Code", "Name", "Company", "Settlement Date", "Total Earn.", "Total Ded.", "Net Payable", "Status"];
      const rows = settlements.map(s => [
        getEmployeeCode(s.employeeId),
        getEmployeeName(s.employeeId),
        getCompanyName(s.companyId),
        s.settlementDate,
        s.totalEarnings,
        s.totalDeductions,
        s.netPayable,
        s.status.charAt(0).toUpperCase() + s.status.slice(1),
      ] as (string | number)[]);
      downloadPDF("Full & Final Settlement Report", headers, rows, `FnF_Settlement_Report`);
    }
  };

  const generateBonusReport = (fileType: "excel" | "pdf") => {
    const bonusEmps = filteredEmployees.filter(e => e.bonusApplicable && e.status === "active");
    if (bonusEmps.length === 0) {
      toast({ title: "No Data", description: "No bonus-applicable employees found.", variant: "destructive" });
      return;
    }

    const monthPayrolls = payrollRecords.filter(p => p.month === monthName && p.year === yearNum);

    if (fileType === "excel") {
      const rows = bonusEmps.map(emp => {
        const ss = salaryStructures.find(s => s.employeeId === emp.id);
        const settings = getStatutorySettings(emp.companyId);
        const bonusPercent = Number(settings?.bonusPercent) || 833;
        const bonusCeiling = Number(settings?.bonusMaxCeiling) || 7000;
        const calcBase = settings?.bonusCalculationBase || "basic";
        const basicSalary = ss?.basicSalary || 0;
        const grossSalary = ss?.grossSalary || emp.grossSalary || 0;
        const bonusBase = calcBase === "gross" ? grossSalary : basicSalary;
        const bonusWage = (settings as any)?.bonusSkipCeiling ? bonusBase : Math.min(bonusBase, bonusCeiling);
        const monthlyBonus = Math.round(bonusWage * bonusPercent / 10000);
        const annualBonus = monthlyBonus * 12;

        const pr = monthPayrolls.find(p => p.employeeId === emp.id);
        const actualMonthlyBonus = pr?.bonus ?? monthlyBonus;

        return {
          "Emp Code": emp.employeeCode,
          "Employee Name": `${emp.firstName} ${emp.lastName}`,
          "Company": getCompanyName(emp.companyId),
          "Basic Salary": basicSalary,
          "Gross Salary": grossSalary,
          "Bonus Calc. Base": calcBase === "gross" ? "Gross" : "Basic",
          "Bonus Wage (Capped)": bonusWage,
          "Bonus %": (bonusPercent / 100).toFixed(2) + "%",
          "Monthly Bonus": actualMonthlyBonus,
          "Annual Bonus": annualBonus,
          "Paid Monthly": emp.bonusPaidMonthly ? "Yes" : "No",
        };
      });
      downloadExcel(rows, `Bonus_Report_${monthName}_${yearStr}`, "Bonus Report");
    } else {
      const headers = ["Code", "Name", "Company", "Basic", "Gross", "Bonus Wage", "Bonus %", "Monthly", "Annual", "Monthly?"];
      const rows = bonusEmps.map(emp => {
        const ss = salaryStructures.find(s => s.employeeId === emp.id);
        const settings = getStatutorySettings(emp.companyId);
        const bonusPercent = Number(settings?.bonusPercent) || 833;
        const bonusCeiling = Number(settings?.bonusMaxCeiling) || 7000;
        const calcBase = settings?.bonusCalculationBase || "basic";
        const basicSalary = ss?.basicSalary || 0;
        const grossSalary = ss?.grossSalary || emp.grossSalary || 0;
        const bonusBase = calcBase === "gross" ? grossSalary : basicSalary;
        const bonusWage = (settings as any)?.bonusSkipCeiling ? bonusBase : Math.min(bonusBase, bonusCeiling);
        const monthlyBonus = Math.round(bonusWage * bonusPercent / 10000);
        const annualBonus = monthlyBonus * 12;
        return [
          emp.employeeCode,
          `${emp.firstName} ${emp.lastName}`,
          getCompanyName(emp.companyId),
          basicSalary,
          grossSalary,
          bonusWage,
          (bonusPercent / 100).toFixed(2) + "%",
          monthlyBonus,
          annualBonus,
          emp.bonusPaidMonthly ? "Yes" : "No",
        ] as (string | number)[];
      });
      downloadPDF(`Bonus Report - ${monthName} ${yearStr}`, headers, rows, `Bonus_Report_${monthName}_${yearStr}`);
    }
  };

  const generateLWFReport = (fileType: "excel" | "pdf") => {
    const lwfEmps = filteredEmployees.filter(e => e.lwfApplicable && e.status === "active");
    if (lwfEmps.length === 0) {
      toast({ title: "No Data", description: "No LWF-applicable employees found.", variant: "destructive" });
      return;
    }

    const monthPayrolls = payrollRecords.filter(p => p.month === monthName && p.year === yearNum);

    if (fileType === "excel") {
      const rows = lwfEmps.map(emp => {
        const ss = salaryStructures.find(s => s.employeeId === emp.id);
        const settings = getStatutorySettings(emp.companyId);
        const basicSalary = ss?.basicSalary || 0;
        const grossSalary = ss?.grossSalary || emp.grossSalary || 0;
        const calcBase = settings?.lwfCalculationBase || "gross";
        const lwfBase = calcBase === "basic" ? basicSalary : grossSalary;
        const empPercent = Number(settings?.lwfEmployeePercent) || 20;
        const erPercent = Number(settings?.lwfEmployerPercent) || 40;
        const empMaxCap = Number(settings?.lwfEmployeeMaxCap) || 34;
        const erMaxCap = Number(settings?.lwfEmployerMaxCap) || 68;
        const monthlyEmpLWF = Math.min(Math.round(lwfBase * empPercent / 10000), empMaxCap);
        const monthlyErLWF = Math.min(Math.round(lwfBase * erPercent / 10000), erMaxCap);
        const annualEmpLWF = monthlyEmpLWF * 12;
        const annualErLWF = monthlyErLWF * 12;

        const pr = monthPayrolls.find(p => p.employeeId === emp.id);
        const actualEmpLWF = pr?.lwfEmployee ?? monthlyEmpLWF;

        return {
          "Emp Code": emp.employeeCode,
          "Employee Name": `${emp.firstName} ${emp.lastName}`,
          "Company": getCompanyName(emp.companyId),
          "Basic Salary": basicSalary,
          "Gross Salary": grossSalary,
          "LWF Base": calcBase === "basic" ? "Basic" : "Gross",
          "LWF Base Amount": lwfBase,
          "Employee %": (empPercent / 100).toFixed(2) + "%",
          "Employer %": (erPercent / 100).toFixed(2) + "%",
          "Monthly Employee LWF": actualEmpLWF,
          "Monthly Employer LWF": monthlyErLWF,
          "Monthly Total LWF": actualEmpLWF + monthlyErLWF,
          "Annual Employee LWF": annualEmpLWF,
          "Annual Employer LWF": annualErLWF,
          "Annual Total LWF": annualEmpLWF + annualErLWF,
        };
      });
      downloadExcel(rows, `LWF_Report_${monthName}_${yearStr}`, "LWF Report");
    } else {
      const headers = ["Code", "Name", "Company", "LWF Base", "Emp LWF/M", "Er LWF/M", "Total/M", "Emp LWF/Y", "Er LWF/Y", "Total/Y"];
      const rows = lwfEmps.map(emp => {
        const ss = salaryStructures.find(s => s.employeeId === emp.id);
        const settings = getStatutorySettings(emp.companyId);
        const basicSalary = ss?.basicSalary || 0;
        const grossSalary = ss?.grossSalary || emp.grossSalary || 0;
        const calcBase = settings?.lwfCalculationBase || "gross";
        const lwfBase = calcBase === "basic" ? basicSalary : grossSalary;
        const empPercent = Number(settings?.lwfEmployeePercent) || 20;
        const erPercent = Number(settings?.lwfEmployerPercent) || 40;
        const empMaxCap = Number(settings?.lwfEmployeeMaxCap) || 34;
        const erMaxCap = Number(settings?.lwfEmployerMaxCap) || 68;
        const monthlyEmpLWF = Math.min(Math.round(lwfBase * empPercent / 10000), empMaxCap);
        const monthlyErLWF = Math.min(Math.round(lwfBase * erPercent / 10000), erMaxCap);
        const annualEmpLWF = monthlyEmpLWF * 12;
        const annualErLWF = monthlyErLWF * 12;
        return [
          emp.employeeCode,
          `${emp.firstName} ${emp.lastName}`,
          getCompanyName(emp.companyId),
          lwfBase,
          monthlyEmpLWF,
          monthlyErLWF,
          monthlyEmpLWF + monthlyErLWF,
          annualEmpLWF,
          annualErLWF,
          annualEmpLWF + annualErLWF,
        ] as (string | number)[];
      });
      downloadPDF(`LWF Report - ${monthName} ${yearStr}`, headers, rows, `LWF_Report_${monthName}_${yearStr}`);
    }
  };

  const shufflePunchTime = (baseTime: string, dateStr: string, empId: string, isIn: boolean): string => {
    let hash = isIn ? 5381 : 7919;
    const combined = dateStr + empId + (isIn ? "IN" : "OUT");
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) + hash + combined.charCodeAt(i)) & 0x7fffffff;
    }
    const offsetMinutes = (hash % 21) - 10;
    const [hh, mm] = baseTime.split(":").map(Number);
    let totalMin = hh * 60 + mm + offsetMinutes;
    if (totalMin < 0) totalMin = 0;
    if (totalMin >= 1440) totalMin = 1439;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const generateAttendancePunchReport = (fileType: "excel" | "pdf") => {
    const emps = filteredEmployees;
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No employees found for selected filters.", variant: "destructive" });
      return;
    }

    const getEmpDutyTiming = (emp: Employee) => {
      const policy = emp.timeOfficePolicyId
        ? timeOfficePolicies.find(p => p.id === emp.timeOfficePolicyId)
        : null;
      const compPolicies = timeOfficePolicies.filter(p => p.companyId === emp.companyId);
      const effectivePolicy = policy || compPolicies.find(p => p.isDefault && p.status === "active") || compPolicies.find(p => p.status === "active");
      const dutyStart = effectivePolicy?.dutyStartTime || "09:00";
      const dutyEnd = effectivePolicy?.dutyEndTime || "18:00";
      const [sh, sm] = dutyStart.split(":").map(Number);
      const [eh, em] = dutyEnd.split(":").map(Number);
      let dutyMin = (eh * 60 + em) - (sh * 60 + sm);
      if (dutyMin <= 0) dutyMin += 1440;
      const dutyHours = dutyMin / 60;
      return { dutyStart, dutyEnd, dutyHours };
    };

    const calcTotalHours = (inTime: string, outTime: string): string => {
      const [ih, im] = inTime.split(":").map(Number);
      const [oh, om] = outTime.split(":").map(Number);
      let diffMin = (oh * 60 + om) - (ih * 60 + im);
      if (diffMin < 0) diffMin += 1440;
      const hrs = diffMin / 60;
      return hrs.toFixed(2);
    };

    const monthShort = monthName.substring(0, 3);

    if (fileType === "excel") {
      const allRows: Record<string, string | number | null | undefined>[] = [];
      emps.forEach(emp => {
        const duty = getEmpDutyTiming(emp);
        const inRow: Record<string, string | number | null | undefined> = {
          "Employee Code": emp.employeeCode,
          "Employee Name": `${emp.firstName} ${emp.lastName}`,
          "Type": "IN",
        };
        const outRow: Record<string, string | number | null | undefined> = {
          "Employee Code": "",
          "Employee Name": "",
          "Type": "OUT",
        };
        const totalRow: Record<string, string | number | null | undefined> = {
          "Employee Code": "",
          "Employee Name": "",
          "Type": "TOTAL_HOURS",
        };
        const otRow: Record<string, string | number | null | undefined> = {
          "Employee Code": "",
          "Employee Name": "",
          "Type": "OT_HOURS",
        };
        const statusRow: Record<string, string | number | null | undefined> = {
          "Employee Code": "",
          "Employee Name": "",
          "Type": "STATUS",
        };
        let sumTotalHrs = 0;
        let sumOtHrs = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
          const status = getDayStatus(dateStr, emp);
          const record = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
          const colKey = `${d} ${monthShort}`;

          if (status === "P" || status === "HD") {
            const isQuickEntry = !record || !record.clockIn || record.notes?.includes("Quick Entry");
            let inTime = record?.clockIn || "";
            let outTime = record?.clockOut || "";
            if (isQuickEntry) {
              inTime = shufflePunchTime(duty.dutyStart, dateStr, emp.id, true);
              outTime = shufflePunchTime(duty.dutyEnd, dateStr, emp.id, false);
            }
            const hrs = (inTime && outTime) ? parseFloat(calcTotalHours(inTime, outTime)) : 0;
            const ot = hrs > duty.dutyHours ? Math.round(hrs - duty.dutyHours) : 0;
            inRow[colKey] = inTime;
            outRow[colKey] = outTime;
            totalRow[colKey] = hrs;
            otRow[colKey] = ot;
            statusRow[colKey] = status;
            sumTotalHrs += hrs;
            sumOtHrs += ot;
          } else {
            const label = status === "-" ? "A" : status;
            inRow[colKey] = "";
            outRow[colKey] = "";
            totalRow[colKey] = "";
            otRow[colKey] = "";
            statusRow[colKey] = label;
          }
        }
        inRow["Total"] = "";
        outRow["Total"] = "";
        totalRow["Total"] = Math.round(sumTotalHrs * 100) / 100;
        otRow["Total"] = sumOtHrs;
        statusRow["Total"] = "";
        allRows.push(inRow, outRow, totalRow, otRow, statusRow);
      });
      downloadExcel(allRows, `Attendance_Punch_${selectedMonth}`, "Punch Report");
    } else {
      const dayHeaders: string[] = [];
      for (let i = 1; i <= daysInMonth; i++) {
        dayHeaders.push(`${i} ${monthShort}`);
      }
      const headers = ["Emp Code", "Name", "Type", ...dayHeaders, "Total"];
      const allRows: (string | number)[][] = [];
      emps.forEach(emp => {
        const duty = getEmpDutyTiming(emp);
        const inCells: (string | number)[] = [emp.employeeCode, `${emp.firstName} ${emp.lastName}`, "IN"];
        const outCells: (string | number)[] = ["", "", "OUT"];
        const totalCells: (string | number)[] = ["", "", "TOTAL_HOURS"];
        const otCells: (string | number)[] = ["", "", "OT_HOURS"];
        const statusCells: (string | number)[] = ["", "", "STATUS"];
        let sumTotalHrs = 0;
        let sumOtHrs = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
          const status = getDayStatus(dateStr, emp);
          const record = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);

          if (status === "P" || status === "HD") {
            const isQuickEntry = !record || !record.clockIn || record.notes?.includes("Quick Entry");
            let inTime = record?.clockIn || "";
            let outTime = record?.clockOut || "";
            if (isQuickEntry) {
              inTime = shufflePunchTime(duty.dutyStart, dateStr, emp.id, true);
              outTime = shufflePunchTime(duty.dutyEnd, dateStr, emp.id, false);
            }
            const hrs = (inTime && outTime) ? parseFloat(calcTotalHours(inTime, outTime)) : 0;
            const ot = hrs > duty.dutyHours ? Math.round(hrs - duty.dutyHours) : 0;
            inCells.push(inTime);
            outCells.push(outTime);
            totalCells.push(hrs);
            otCells.push(ot);
            statusCells.push(status);
            sumTotalHrs += hrs;
            sumOtHrs += ot;
          } else {
            const label = status === "-" ? "A" : status;
            inCells.push("");
            outCells.push("");
            totalCells.push("");
            otCells.push("");
            statusCells.push(label);
          }
        }
        inCells.push("");
        outCells.push("");
        totalCells.push(Math.round(sumTotalHrs * 100) / 100);
        otCells.push(sumOtHrs);
        statusCells.push("");
        allRows.push(inCells, outCells, totalCells, otCells, statusCells);
      });
      downloadPDF(`Attendance Punch Report - ${monthName} ${yearNum}`, headers, allRows, `Attendance_Punch_${selectedMonth}`);
    }
  };

  const openViewDialog = (title: string, headers: string[], rows: (string | number)[][]) => {
    if (rows.length === 0) {
      toast({ title: "No Data", description: "No data available for this report.", variant: "destructive" });
      return;
    }
    setViewTitle(title);
    setViewHeaders(headers);
    setViewRows(rows);
    setViewDialogOpen(true);
  };

  const viewAttendanceSheet = () => {
    const emps = filteredEmployees;
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No employees found for selected filters.", variant: "destructive" });
      return;
    }
    const buildAttendanceRow = (emp: Employee) => {
      let present = 0, absent = 0, halfDay = 0, totalOT = 0, storedWO = 0, storedH = 0, lCount = 0;
      const dayStatuses: string[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
        const status = getDayStatus(dateStr, emp);
        dayStatuses.push(status);
        if (status === "P") present++;
        else if (status === "A") absent++;
        else if (status === "HD") halfDay++;
        else if (status === "H") storedH++;
        else if (status === "L") lCount++;
        const record = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
        if (record) {
          totalOT += parseFloat(record.otHours || "0");
          if (record.status === "weekend") storedWO++;
        }
      }
      totalOT = Math.round(totalOT);
      const payDays = Math.min(Math.round(present + halfDay * 0.5 + storedWO + storedH + lCount), daysInMonth);
      return { dayStatuses, present, absent, halfDay, woCount: storedWO, hCount: storedH, lCount, totalOT, payDays };
    };
    const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    const headers = ["Code", "Name", ...dayHeaders, "P", "A", "HD", "WO", "H", "L", "OT", "Pay Days"];
    const rows = emps.map(emp => {
      const data = buildAttendanceRow(emp);
      return [emp.employeeCode, `${emp.firstName} ${emp.lastName}`, ...data.dayStatuses, data.present, data.absent, data.halfDay, data.woCount, data.hCount, data.lCount, data.totalOT, data.payDays] as (string | number)[];
    });
    openViewDialog(`Attendance Sheet - ${monthName} ${yearNum}`, headers, rows);
  };

  const viewAttendancePunchReport = () => {
    const emps = filteredEmployees;
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No employees found for selected filters.", variant: "destructive" });
      return;
    }
    const getEmpDutyTiming = (emp: Employee) => {
      const policy = emp.timeOfficePolicyId ? timeOfficePolicies.find(p => p.id === emp.timeOfficePolicyId) : null;
      const compPolicies = timeOfficePolicies.filter(p => p.companyId === emp.companyId);
      const effectivePolicy = policy || compPolicies.find(p => p.isDefault && p.status === "active") || compPolicies.find(p => p.status === "active");
      const dutyStart = effectivePolicy?.dutyStartTime || "09:00";
      const dutyEnd = effectivePolicy?.dutyEndTime || "18:00";
      const [sh, sm] = dutyStart.split(":").map(Number);
      const [eh, em] = dutyEnd.split(":").map(Number);
      let dutyMin = (eh * 60 + em) - (sh * 60 + sm);
      if (dutyMin <= 0) dutyMin += 1440;
      return { dutyStart, dutyEnd, dutyHours: dutyMin / 60 };
    };
    const calcTotalHours = (inTime: string, outTime: string): string => {
      const [ih, im] = inTime.split(":").map(Number);
      const [oh, om] = outTime.split(":").map(Number);
      let diffMin = (oh * 60 + om) - (ih * 60 + im);
      if (diffMin < 0) diffMin += 1440;
      return (diffMin / 60).toFixed(2);
    };
    const monthShort = monthName.substring(0, 3);
    const dayHeaders: string[] = [];
    for (let i = 1; i <= daysInMonth; i++) dayHeaders.push(`${i} ${monthShort}`);
    const headers = ["Emp Code", "Name", "Type", ...dayHeaders, "Total"];
    const allRows: (string | number)[][] = [];
    emps.forEach(emp => {
      const duty = getEmpDutyTiming(emp);
      const inCells: (string | number)[] = [emp.employeeCode, `${emp.firstName} ${emp.lastName}`, "IN"];
      const outCells: (string | number)[] = ["", "", "OUT"];
      const totalCells: (string | number)[] = ["", "", "TOTAL_HOURS"];
      const otCells: (string | number)[] = ["", "", "OT_HOURS"];
      const statusCells: (string | number)[] = ["", "", "STATUS"];
      let sumTotalHrs = 0, sumOtHrs = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
        const status = getDayStatus(dateStr, emp);
        const record = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
        if (status === "P" || status === "HD") {
          const isQuickEntry = !record || !record.clockIn || record.notes?.includes("Quick Entry");
          let inTime = record?.clockIn || "";
          let outTime = record?.clockOut || "";
          if (isQuickEntry) {
            inTime = shufflePunchTime(duty.dutyStart, dateStr, emp.id, true);
            outTime = shufflePunchTime(duty.dutyEnd, dateStr, emp.id, false);
          }
          const hrs = (inTime && outTime) ? parseFloat(calcTotalHours(inTime, outTime)) : 0;
          const ot = hrs > duty.dutyHours ? Math.round(hrs - duty.dutyHours) : 0;
          inCells.push(inTime); outCells.push(outTime); totalCells.push(hrs); otCells.push(ot); statusCells.push(status);
          sumTotalHrs += hrs; sumOtHrs += ot;
        } else {
          const label = status === "-" ? "A" : status;
          inCells.push(""); outCells.push(""); totalCells.push(""); otCells.push(""); statusCells.push(label);
        }
      }
      inCells.push(""); outCells.push(""); totalCells.push(Math.round(sumTotalHrs * 100) / 100); otCells.push(sumOtHrs); statusCells.push("");
      allRows.push(inCells, outCells, totalCells, otCells, statusCells);
    });
    openViewDialog(`Attendance Punch Report - ${monthName} ${yearNum}`, headers, allRows);
  };

  const viewSalarySheet = () => {
    const monthPayroll = payrollRecords.filter(p => p.month === monthName && p.year === yearNum && (effectiveCompany ? p.companyId === effectiveCompany : true));
    const emps = filteredEmployees;
    const headers = ["Code", "Name", "Dept", "Designation", "Mon.Days", "Pay Days", "OT Hrs", "R.Basic", "R.HRA", "R.Conv", "R.Oth", "R.Total", "E.Basic", "E.HRA", "E.Conv", "E.Oth", "Bonus", "E.OT Amt", "E.Total", "PF", "ESIC", "LWF", "TDS", "PT", "Other Ded", "Loan/Adv", "D.Total", "Net Pay"];
    let rows: (string | number)[][] = [];
    const buildViewRow = (emp: Employee, c: ReturnType<typeof getProRatedComponents> | null, pr: Payroll | null): (string | number)[] => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const rBasic = ss?.basicSalary || 0, rHra = ss?.hra || 0, rConv = ss?.conveyance || 0;
      const rOth = (ss?.otherAllowances || 0) + (ss?.specialAllowance || 0) + (ss?.medicalAllowance || 0);
      const eBasic = c?.basicSalary || 0, eHra = c?.hra || 0, eConv = c?.conveyance || 0;
      const eOth = (c?.otherAllowances || 0) + (c?.specialAllowance || 0) + (c?.medicalAllowance || 0);
      const bonus = c?.bonus || 0;
      const otHoursVal = Number((pr as any)?.otHours || 0);
      const otAmtVal = Number((pr as any)?.otAmount || 0);
      const pf = c?.pfEmployee || 0, esic = c?.esi || 0, lwf = c?.lwfEmployee || 0;
      const tds = c?.tds || 0, pt = c?.professionalTax || 0;
      const othDed = c?.otherDeductions || 0, loanAdv = (c as any)?.loanDeduction || 0;
      return [
        emp.employeeCode || "", `${emp.firstName} ${emp.lastName}`, emp.department || "-", emp.designation || "-",
        pr ? pr.workingDays : "-", pr ? (pr.payDays ?? pr.presentDays) : "-",
        otHoursVal,
        rBasic, rHra, rConv, rOth, rBasic + rHra + rConv + rOth,
        eBasic, eHra, eConv, eOth, bonus, otAmtVal, eBasic + eHra + eConv + eOth + bonus + otAmtVal,
        pf, esic, lwf, tds, pt, othDed, loanAdv, pf + esic + lwf + tds + pt + othDed + loanAdv,
        c?.netSalary || 0,
      ];
    };
    if (monthPayroll.length > 0) {
      rows = monthPayroll.map(p => {
        const emp = employees.find(e => e.id === p.employeeId);
        if (!emp) return [];
        const ss = salaryStructures.find(s => s.employeeId === emp.id);
        return buildViewRow(emp, getProRatedComponents(emp, ss, p), p);
      }).filter(r => r.length > 0);
    } else {
      rows = emps.map(emp => {
        const ss = salaryStructures.find(s => s.employeeId === emp.id);
        return buildViewRow(emp, getProRatedComponents(emp, ss, null), null);
      });
    }
    // TOTAL row — sum all numeric columns, label first 6 cols
    if (rows.length > 0) {
      const totalRow: (string | number)[] = ["", "TOTAL", "", "", "", ""];
      for (let col = 6; col < rows[0].length; col++) {
        totalRow.push(rows.reduce((s, r) => s + (typeof r[col] === "number" ? (r[col] as number) : 0), 0));
      }
      rows = [...rows, totalRow];
    }
    openViewDialog(`Salary Sheet - ${monthName} ${yearNum}`, headers, rows);
  };

  const viewPFStatement = () => {
    const pfEmployees = filteredEmployees.filter(e => e.pfApplicable);
    if (pfEmployees.length === 0) {
      toast({ title: "No Data", description: "No PF-applicable employees found.", variant: "destructive" });
      return;
    }
    const headers = ["UAN", "Name", "Gross", "EPF Wages", "EPS Wages", "EPF (EE)", "EPS (ER)", "EPF Diff", "NCP"];
    const rows = pfEmployees.map(emp => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const pr = payrollRecords.find(p => p.employeeId === emp.id && p.month === monthName && p.year === yearNum);
      const c = getProRatedComponents(emp, ss, pr || null);
      const settings = getStatutorySettings(emp.companyId);
      const pfWageCeiling = Number(settings?.pfWageCeiling) || 15000;
      const epfWage = c.basicSalary;
      const epsWage = Math.min(epfWage, pfWageCeiling);
      const epfEE = c.pfEmployee;
      const epsER = Math.round(epsWage * 0.0833);
      const epfDiff = Math.max(epfEE - epsER, 0);
      return [emp.uan || "N/A", `${emp.firstName} ${emp.lastName}`, c.grossSalary, epfWage, epsWage, epfEE, epsER, epfDiff, pr?.leaveDays || 0] as (string | number)[];
    });
    openViewDialog(`PF Statement (ECR) - ${monthName} ${yearNum}`, headers, rows);
  };

  const viewESICStatement = () => {
    const esicEmployees = filteredEmployees.filter(e => e.esiApplicable);
    if (esicEmployees.length === 0) {
      toast({ title: "No Data", description: "No ESIC-applicable employees found.", variant: "destructive" });
      return;
    }
    const headers = ["ESIC No.", "Name", "Days", "Wages", "IP (0.75%)", "ER (3.25%)", "Total"];
    const rows = esicEmployees.map(emp => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const pr = payrollRecords.find(p => p.employeeId === emp.id && p.month === monthName && p.year === yearNum);
      const c = getProRatedComponents(emp, ss, pr || null);
      const settings = getStatutorySettings(emp.companyId);
      const wageCeiling = Number(settings?.esicWageCeiling) || 21000;
      const erPercent = Number(settings?.esicEmployerPercent) || 325;
      const esiEE = c.esi;
      let esiER = 0;
      // Eligibility on contracted salary; employer contribution on earned/prorated salary
      const contractedGrossV = ss?.grossSalary || c.grossSalary;
      if (contractedGrossV <= wageCeiling) {
        if (settings?.esicCalcOnGross) {
          esiER = Math.round(Math.min(c.grossSalary, wageCeiling) * erPercent / 10000);
        } else {
          const esicBase = Math.min(Math.max(c.basicSalary, c.grossSalary * 0.5), wageCeiling);
          esiER = Math.round(esicBase * erPercent / 10000);
        }
      }
      return [emp.esiNumber || "N/A", `${emp.firstName} ${emp.lastName}`, pr?.presentDays || pr?.workingDays || 0, c.grossSalary, esiEE, esiER, esiEE + esiER] as (string | number)[];
    });
    openViewDialog(`ESIC Statement - ${monthName} ${yearNum}`, headers, rows);
  };

  const viewPaySlip = () => {
    const monthPayroll = payrollRecords.filter(p => p.month === monthName && p.year === yearNum && (effectiveCompany ? p.companyId === effectiveCompany : true));
    const emps = filteredEmployees;
    const headers = ["Code", "Name", "Dept", "Basic", "HRA", "Conv.", "Med.", "Spl.", "Other", "Bonus", "OT Hrs", "OT Amt", "Tot.Earn", "PF", "ESI", "PT", "LWF", "TDS", "Other Ded", "Loan/Adv", "Tot.Ded", "Net Salary"];
    let rows: (string | number)[][] = [];
    if (monthPayroll.length > 0) {
      rows = monthPayroll.map(p => {
        const emp = employees.find(e => e.id === p.employeeId);
        const ss = salaryStructures.find(s => s.employeeId === p.employeeId);
        const c = emp ? getProRatedComponents(emp, ss, p) : null;
        return [emp?.employeeCode || "", getEmployeeName(p.employeeId), emp?.department || "N/A", c?.basicSalary || 0, c?.hra || 0, c?.conveyance || 0, c?.medicalAllowance || 0, c?.specialAllowance || 0, c?.otherAllowances || 0, c?.bonus || 0, Number((p as any).otHours || 0), Number((p as any).otAmount || 0), c?.totalEarnings || 0, c?.pfEmployee || 0, c?.esi || 0, c?.professionalTax || 0, c?.lwfEmployee || 0, c?.tds || 0, c?.otherDeductions || 0, (c as any)?.loanDeduction || 0, c?.totalDeductions || 0, c?.netSalary || 0];
      });
    } else {
      rows = emps.map(emp => {
        const ss = salaryStructures.find(s => s.employeeId === emp.id);
        const c = getProRatedComponents(emp, ss, null);
        return [emp.employeeCode, `${emp.firstName} ${emp.lastName}`, emp.department || "N/A", c.basicSalary, c.hra, c.conveyance, c.medicalAllowance, c.specialAllowance, c.otherAllowances, c.bonus, 0, 0, c.totalEarnings, c.pfEmployee, c.esi, c.professionalTax, c.lwfEmployee, c.tds, c.otherDeductions, (c as any).loanDeduction || 0, c.totalDeductions, c.netSalary];
      });
    }
    openViewDialog(`Pay Slip Summary - ${monthName} ${yearNum}`, headers, rows);
  };

  const viewEmployeeList = () => {
    const emps = filteredEmployees;
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No employees found.", variant: "destructive" });
      return;
    }
    const headers = ["Code", "Name", "Company", "Department", "Designation", "DOJ", "Mobile", "Status"];
    const rows = emps.map(emp => [emp.employeeCode, `${emp.firstName} ${emp.lastName}`, getCompanyName(emp.companyId), emp.department || "N/A", emp.designation || "N/A", emp.dateOfJoining || "N/A", emp.mobileNumber || "N/A", emp.status] as (string | number)[]);
    openViewDialog("Employee List", headers, rows);
  };

  const viewEmployeePayStructure = () => {
    const emps = filteredEmployees;
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No employees found.", variant: "destructive" });
      return;
    }
    const headers = ["Code", "Name", "Gross", "Basic", "HRA", "Conv.", "Spl.All.", "PF", "ESI", "PT", "LWF", "Net", "PF App.", "ESI App."];
    const rows = emps.map(emp => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      return [emp.employeeCode, `${emp.firstName} ${emp.lastName}`, emp.grossSalary || ss?.grossSalary || 0, ss?.basicSalary || 0, ss?.hra || 0, ss?.conveyance || 0, ss?.specialAllowance || 0, ss?.pfEmployee || 0, ss?.esi || 0, ss?.professionalTax || 0, ss?.lwfEmployee || 0, ss?.netSalary || 0, emp.pfApplicable ? "Yes" : "No", emp.esiApplicable ? "Yes" : "No"] as (string | number)[];
    });
    openViewDialog("Employee Pay Structure", headers, rows);
  };

  const viewFnFReport = () => {
    const settlements = fnfSettlements.filter(s => effectiveCompany ? s.companyId === effectiveCompany : true);
    if (settlements.length === 0) {
      toast({ title: "No Data", description: "No F&F settlements found for selected filters.", variant: "destructive" });
      return;
    }
    const headers = ["Code", "Name", "Company", "Settlement Date", "Total Earn.", "Total Ded.", "Net Payable", "Status"];
    const rows = settlements.map(s => [getEmployeeCode(s.employeeId), getEmployeeName(s.employeeId), getCompanyName(s.companyId), s.settlementDate, s.totalEarnings, s.totalDeductions, s.netPayable, s.status.charAt(0).toUpperCase() + s.status.slice(1)] as (string | number)[]);
    openViewDialog("Full & Final Settlement Report", headers, rows);
  };

  const viewBonusReport = () => {
    const bonusEmps = filteredEmployees.filter(e => e.bonusApplicable && e.status === "active");
    if (bonusEmps.length === 0) {
      toast({ title: "No Data", description: "No bonus-applicable employees found.", variant: "destructive" });
      return;
    }
    const headers = ["Code", "Name", "Company", "Basic", "Gross", "Bonus Wage", "Bonus %", "Monthly", "Annual", "Monthly?"];
    const rows = bonusEmps.map(emp => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const settings = getStatutorySettings(emp.companyId);
      const bonusPercent = Number(settings?.bonusPercent) || 833;
      const bonusCeiling = Number(settings?.bonusMaxCeiling) || 7000;
      const calcBase = settings?.bonusCalculationBase || "basic";
      const basicSalary = ss?.basicSalary || 0;
      const grossSalary = ss?.grossSalary || emp.grossSalary || 0;
      const bonusBase = calcBase === "gross" ? grossSalary : basicSalary;
      const bonusWage = (settings as any)?.bonusSkipCeiling ? bonusBase : Math.min(bonusBase, bonusCeiling);
      const monthlyBonus = Math.round(bonusWage * bonusPercent / 10000);
      const annualBonus = monthlyBonus * 12;
      return [emp.employeeCode, `${emp.firstName} ${emp.lastName}`, getCompanyName(emp.companyId), basicSalary, grossSalary, bonusWage, (bonusPercent / 100).toFixed(2) + "%", monthlyBonus, annualBonus, emp.bonusPaidMonthly ? "Yes" : "No"] as (string | number)[];
    });
    openViewDialog(`Bonus Report - ${monthName} ${yearStr}`, headers, rows);
  };

  const viewLWFReport = () => {
    const lwfEmps = filteredEmployees.filter(e => e.lwfApplicable && e.status === "active");
    if (lwfEmps.length === 0) {
      toast({ title: "No Data", description: "No LWF-applicable employees found.", variant: "destructive" });
      return;
    }
    const headers = ["Code", "Name", "Company", "LWF Base", "Emp LWF/M", "Er LWF/M", "Total/M", "Emp LWF/Y", "Er LWF/Y", "Total/Y"];
    const rows = lwfEmps.map(emp => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const settings = getStatutorySettings(emp.companyId);
      const basicSalary = ss?.basicSalary || 0;
      const grossSalary = ss?.grossSalary || emp.grossSalary || 0;
      const calcBase = settings?.lwfCalculationBase || "gross";
      const lwfBase = calcBase === "basic" ? basicSalary : grossSalary;
      const empPercent = Number(settings?.lwfEmployeePercent) || 20;
      const erPercent = Number(settings?.lwfEmployerPercent) || 40;
      const empMaxCap = Number(settings?.lwfEmployeeMaxCap) || 34;
      const erMaxCap = Number(settings?.lwfEmployerMaxCap) || 68;
      const monthlyEmpLWF = Math.min(Math.round(lwfBase * empPercent / 10000), empMaxCap);
      const monthlyErLWF = Math.min(Math.round(lwfBase * erPercent / 10000), erMaxCap);
      const annualEmpLWF = monthlyEmpLWF * 12;
      const annualErLWF = monthlyErLWF * 12;
      return [emp.employeeCode, `${emp.firstName} ${emp.lastName}`, getCompanyName(emp.companyId), lwfBase, monthlyEmpLWF, monthlyErLWF, monthlyEmpLWF + monthlyErLWF, annualEmpLWF, annualErLWF, annualEmpLWF + annualErLWF] as (string | number)[];
    });
    openViewDialog(`LWF Report - ${monthName} ${yearStr}`, headers, rows);
  };

  // ── Advance / Loan Report ────────────────────────────────────────────────────
  const buildAdvanceRows = () => {
    const filtered = effectiveCompany
      ? loanAdvances.filter(la => la.companyId === effectiveCompany)
      : loanAdvances;
    return filtered.map(la => {
      const emp = employees.find(e => e.id === la.employeeId);
      return {
        code: emp?.employeeCode || "",
        name: emp ? `${emp.firstName} ${emp.lastName}` : "-",
        dept: emp?.department || "-",
        company: getCompanyName(la.companyId),
        type: la.type === "loan" ? "Loan" : "Advance",
        amount: la.amount,
        purpose: la.purpose || "-",
        requestDate: la.requestDate,
        status: la.status,
        installments: la.totalInstallments ?? "-",
        installmentAmt: la.installmentAmount ?? "-",
        balance: la.remainingBalance ?? "-",
        startMonth: la.deductionStartMonth || "-",
        remarks: la.remarks || "-",
      };
    });
  };

  const generateAdvanceReport = (fileType: "excel" | "pdf") => {
    const rows = buildAdvanceRows();
    if (rows.length === 0) {
      toast({ title: "No Data", description: "No loan/advance records found.", variant: "destructive" });
      return;
    }
    const headers = ["Code", "Name", "Department", "Company", "Type", "Amount", "Purpose", "Request Date", "Status", "Installments", "Inst. Amt", "Balance", "Start Month", "Remarks"];
    if (fileType === "excel") {
      const excelRows = rows.map(r => ({
        "Code": r.code, "Name": r.name, "Department": r.dept, "Company": r.company,
        "Type": r.type, "Amount": r.amount, "Purpose": r.purpose,
        "Request Date": r.requestDate, "Status": r.status,
        "Installments": r.installments, "Installment Amt": r.installmentAmt,
        "Remaining Balance": r.balance, "Deduction Start Month": r.startMonth, "Remarks": r.remarks,
      }));
      downloadExcel(excelRows, `Advance_Loan_Report`, "Advance & Loan Report");
      return;
    }
    const pdfRows = rows.map(r => [r.code, r.name, r.dept, r.company, r.type, r.amount, r.purpose, r.requestDate, r.status, r.installments, r.installmentAmt, r.balance, r.startMonth, r.remarks] as (string | number)[]);
    downloadPDF("Advance & Loan Report", headers, pdfRows, "Advance_Loan_Report");
  };

  const viewAdvanceReport = () => {
    const rows = buildAdvanceRows();
    if (rows.length === 0) {
      toast({ title: "No Data", description: "No loan/advance records found.", variant: "destructive" });
      return;
    }
    const headers = ["Code", "Name", "Dept", "Company", "Type", "Amount", "Purpose", "Req Date", "Status", "Instal.", "Inst.Amt", "Balance", "Start Month", "Remarks"];
    openViewDialog("Advance & Loan Report", headers, rows.map(r => [r.code, r.name, r.dept, r.company, r.type, r.amount, r.purpose, r.requestDate, r.status, r.installments, r.installmentAmt, r.balance, r.startMonth, r.remarks]));
  };

  // ── Leave Report ─────────────────────────────────────────────────────────────
  const buildLeaveRows = () => {
    const filtered = effectiveCompany
      ? leaveRequests.filter(lr => lr.companyId === effectiveCompany)
      : leaveRequests;
    return filtered.map(lr => {
      const emp = employees.find(e => e.id === lr.employeeId);
      const lt = leaveTypes.find(t => t.id === lr.leaveTypeId);
      return {
        code: emp?.employeeCode || "",
        name: emp ? `${emp.firstName} ${emp.lastName}` : "-",
        dept: emp?.department || "-",
        company: getCompanyName(lr.companyId),
        leaveType: lt ? `${lt.name} (${lt.code})` : lr.leaveTypeId,
        startDate: lr.startDate,
        endDate: lr.endDate,
        days: lr.days,
        reason: lr.reason || "-",
        status: lr.status,
        appliedOn: lr.createdAt ? lr.createdAt.substring(0, 10) : "-",
      };
    });
  };

  const generateLeaveReport = (fileType: "excel" | "pdf") => {
    const rows = buildLeaveRows();
    if (rows.length === 0) {
      toast({ title: "No Data", description: "No leave requests found.", variant: "destructive" });
      return;
    }
    const headers = ["Code", "Name", "Department", "Company", "Leave Type", "Start Date", "End Date", "Days", "Reason", "Status", "Applied On"];
    if (fileType === "excel") {
      const excelRows = rows.map(r => ({
        "Code": r.code, "Name": r.name, "Department": r.dept, "Company": r.company,
        "Leave Type": r.leaveType, "Start Date": r.startDate, "End Date": r.endDate,
        "Days": r.days, "Reason": r.reason, "Status": r.status, "Applied On": r.appliedOn,
      }));
      downloadExcel(excelRows, `Leave_Report`, "Leave Report");
      return;
    }
    const pdfRows = rows.map(r => [r.code, r.name, r.dept, r.company, r.leaveType, r.startDate, r.endDate, r.days, r.reason, r.status, r.appliedOn] as (string | number)[]);
    downloadPDF("Leave Report", headers, pdfRows, "Leave_Report");
  };

  const viewLeaveReport = () => {
    const rows = buildLeaveRows();
    if (rows.length === 0) {
      toast({ title: "No Data", description: "No leave requests found.", variant: "destructive" });
      return;
    }
    const headers = ["Code", "Name", "Dept", "Company", "Leave Type", "Start", "End", "Days", "Reason", "Status", "Applied On"];
    openViewDialog("Leave Report", headers, rows.map(r => [r.code, r.name, r.dept, r.company, r.leaveType, r.startDate, r.endDate, r.days, r.reason, r.status, r.appliedOn]));
  };

  const reportCards = [
    {
      title: "Attendance Sheet",
      description: "Monthly attendance record with day-wise status, present/absent counts, and OT hours for all employees",
      icon: Calendar,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-950",
      generate: generateAttendanceSheet,
      view: viewAttendanceSheet,
    },
    {
      title: "Attendance Punch Report",
      description: "Daily in/out punch times for all employees with shuffled timings based on duty schedule",
      icon: Clock,
      color: "text-sky-600",
      bgColor: "bg-sky-50 dark:bg-sky-950",
      generate: generateAttendancePunchReport,
      view: viewAttendancePunchReport,
    },
    {
      title: "Salary Sheet",
      description: "Monthly salary register with earnings breakdown, deductions, and net salary for payroll processing",
      icon: CreditCard,
      color: "text-green-600",
      bgColor: "bg-green-50 dark:bg-green-950",
      generate: generateSalarySheet,
      view: viewSalarySheet,
    },
    {
      title: "PF Statement (ECR)",
      description: "Electronic Challan cum Return format with UAN, EPF/EPS wages, and contribution details",
      icon: Shield,
      color: "text-purple-600",
      bgColor: "bg-purple-50 dark:bg-purple-950",
      generate: generatePFStatement,
      view: viewPFStatement,
    },
    {
      title: "ESIC Statement",
      description: "Monthly ESIC contribution statement with IP and employer contribution breakdowns",
      icon: Receipt,
      color: "text-orange-600",
      bgColor: "bg-orange-50 dark:bg-orange-950",
      generate: generateESICStatement,
      view: viewESICStatement,
    },
    {
      title: "Pay Slip",
      description: "Individual employee pay slips with complete earnings, deductions, and net salary details",
      icon: FileText,
      color: "text-red-600",
      bgColor: "bg-red-50 dark:bg-red-950",
      generate: generatePaySlip,
      view: viewPaySlip,
    },
    {
      title: "Employee List",
      description: "Complete employee directory with personal details, department, designation, and contact info",
      icon: Users,
      color: "text-teal-600",
      bgColor: "bg-teal-50 dark:bg-teal-950",
      generate: generateEmployeeList,
      view: viewEmployeeList,
    },
    {
      title: "Employee Pay Structure",
      description: "Salary component breakdown for each employee including basic, allowances, and statutory applicability",
      icon: ClipboardList,
      color: "text-indigo-600",
      bgColor: "bg-indigo-50 dark:bg-indigo-950",
      generate: generateEmployeePayStructure,
      view: viewEmployeePayStructure,
    },
    {
      title: "Full & Final Settlement",
      description: "Settlement report for exited employees with earnings, deductions, and net payable amounts",
      icon: HandCoins,
      color: "text-rose-600",
      bgColor: "bg-rose-50 dark:bg-rose-950",
      generate: generateFnFReport,
      view: viewFnFReport,
    },
    {
      title: "Bonus Report",
      description: "Annual and monthly statutory bonus statement for all bonus-applicable employees with calculation details",
      icon: Landmark,
      color: "text-amber-600",
      bgColor: "bg-amber-50 dark:bg-amber-950",
      generate: generateBonusReport,
      view: viewBonusReport,
    },
    {
      title: "LWF Report",
      description: "Annual and monthly Labour Welfare Fund statement with employee and employer contribution breakdowns",
      icon: Scale,
      color: "text-cyan-600",
      bgColor: "bg-cyan-50 dark:bg-cyan-950",
      generate: generateLWFReport,
      view: viewLWFReport,
    },
    {
      title: "Advance & Loan Report",
      description: "Complete record of all employee loans and advances with amounts, installment schedule, remaining balance, and current status",
      icon: Banknote,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 dark:bg-emerald-950",
      generate: generateAdvanceReport,
      view: viewAdvanceReport,
    },
    {
      title: "Leave Report",
      description: "Employee-wise leave application history with leave type, dates, duration, reason, and approval status",
      icon: CalendarX,
      color: "text-purple-600",
      bgColor: "bg-purple-50 dark:bg-purple-950",
      generate: generateLeaveReport,
      view: viewLeaveReport,
    },
  ];

  return (
    <div className="p-6" data-testid="reports-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Reports
          </h1>
          <p className="text-muted-foreground">Generate and download reports in Excel and PDF format</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Company:</label>
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger className="w-60">
                <SelectValue placeholder="All Companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Companies</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Month:</label>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reportCards.map((report) => (
          <Card key={report.title} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-lg ${report.bgColor}`}>
                  <report.icon className={`h-5 w-5 ${report.color}`} />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{report.title}</CardTitle>
                  <CardDescription className="text-xs mt-1">{report.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => report.view()}
                >
                  <Eye className="h-4 w-4 mr-1.5 text-blue-600" />
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => report.generate("excel")}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1.5 text-green-600" />
                  Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => report.generate("pdf")}
                >
                  <Download className="h-4 w-4 mr-1.5 text-red-600" />
                  PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {viewRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No data available for this report.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-background z-10">
                  <tr>
                    {viewHeaders.map((h, i) => (
                      <th key={i} className="border px-3 py-2 text-left font-semibold bg-primary/10 text-xs whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewRows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border px-3 py-1.5 text-xs whitespace-nowrap">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
