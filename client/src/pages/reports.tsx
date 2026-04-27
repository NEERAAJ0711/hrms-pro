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
  UserRound,
  FilePen,
  FileUser,
  CalendarRange,
  TrendingUp,
  Building2,
  BookOpen,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Company, Employee, Payroll, SalaryStructure, Attendance, StatutorySettings, FnfSettlement, LeaveRequest, TimeOfficePolicy, Holiday, LoanAdvance, EarningHead, DeductionHead } from "@shared/schema";
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
  const [selectedYear, setSelectedYear] = useState(format(new Date(), "yyyy"));
  const [yearType, setYearType] = useState<"calendar" | "financial" | "custom">("calendar");
  const [customFromMonth, setCustomFromMonth] = useState(format(new Date(), "yyyy-MM"));
  const [customToMonth, setCustomToMonth] = useState(format(new Date(), "yyyy-MM"));
  const [docEmployee, setDocEmployee] = useState<string>("");
  const [activeTab, setActiveTab] = useState("monthly");
  const [contractorPrincipalId, setContractorPrincipalId] = useState<string>(isSuperAdmin ? "" : (user?.companyId || ""));
  const [selectedContractorId, setSelectedContractorId] = useState<string>("");
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewTitle, setViewTitle] = useState("");
  const [viewHeaders, setViewHeaders] = useState<string[]>([]);
  const [viewRows, setViewRows] = useState<(string | number)[][]>([]);
  const [ctrlReport, setCtrlReport] = useState<string>("");
  const [empSearchQuery, setEmpSearchQuery] = useState("");
  const [empSearchOpen, setEmpSearchOpen] = useState(false);

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
  const { data: earningHeads = [] } = useQuery<EarningHead[]>({
    queryKey: ["/api/earning-heads"],
    enabled: !!hasAccess,
    queryFn: async () => {
      const res = await fetch("/api/earning-heads", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const { data: deductionHeads = [] } = useQuery<DeductionHead[]>({
    queryKey: ["/api/deduction-heads"],
    enabled: !!hasAccess,
    queryFn: async () => {
      const res = await fetch("/api/deduction-heads", { credentials: "include" });
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

  const { data: companyContractors = [] } = useQuery<{ contractorId: string; contractorName: string; startDate: string }[]>({
    queryKey: ["/api/companies", contractorPrincipalId, "contractors"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${contractorPrincipalId}/contractors`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hasAccess && !!contractorPrincipalId,
  });

  const { data: contractorTaggedEmpList = [] } = useQuery<Employee[]>({
    queryKey: ["/api/companies", contractorPrincipalId, "contractors", selectedContractorId, "employees"],
    queryFn: async () => {
      const res = await fetch(
        `/api/companies/${contractorPrincipalId}/contractors/${selectedContractorId}/employees`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hasAccess && !!contractorPrincipalId && !!selectedContractorId,
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
      basicSalary: 0, hra: 0, conveyance: 0, medicalAllowance: 0 as number,
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
        const oth = (pr.otherAllowances ?? 0) + med;
        const bonus = pr.bonus ?? 0;
        const gross = basic + hra + conv + spl + oth;
        const pf = pr.pfEmployee ?? 0;
        const esi = pr.esi ?? 0;
        const pt = pr.professionalTax ?? 0;
        const lwf = pr.lwfEmployee ?? 0;
        const tds = pr.tds ?? 0;
        const otherDed = pr.otherDeductions ?? 0;
        const loanDed = (pr as any).loanDeduction ?? 0;
        return {
          basicSalary: basic, hra, conveyance: conv, medicalAllowance: 0,
          specialAllowance: spl, otherAllowances: oth, grossSalary: gross,
          pfEmployee: pf, esi, professionalTax: pt, lwfEmployee: lwf,
          tds, otherDeductions: otherDed, loanDeduction: loanDed, bonus,
          totalEarnings: pr.totalEarnings, totalDeductions: pr.totalDeductions, netSalary: pr.netSalary,
        };
      }

      if (ss) {
        // Use payDays (Present + Weekly Off + Holidays + Paid Leaves) for correct proration
        const storedPayDays = Number(pr.payDays) || Number(pr.presentDays) || 0;
        const payDaysForFactor = overridePayDays ?? storedPayDays;
        const factor = pr.workingDays > 0 ? Math.min(Number(payDaysForFactor) / pr.workingDays, 1) : 0;
        const basic = pr.basicSalary;
        const hra = Math.round((ss.hra || 0) * factor);
        const conv = Math.round((ss.conveyance || 0) * factor);
        const med = ss.medicalAllowance || 0;
        const spl = Math.round((ss.specialAllowance || 0) * factor);
        const oth = Math.round(((ss.otherAllowances || 0) + med) * factor);
        const gross = basic + hra + conv + spl + oth;
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
          basicSalary: basic, hra, conveyance: conv, medicalAllowance: 0,
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
      medicalAllowance: 0, specialAllowance: ss.specialAllowance || 0,
      otherAllowances: (ss.otherAllowances || 0) + (ss.medicalAllowance || 0), grossSalary: ss.grossSalary,
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

  const generateAttendanceSheet = (fileType: "excel" | "pdf", empOverride?: Employee[]) => {
    const emps = empOverride ?? filteredEmployees;
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

  const generateSalarySheet = (fileType: "excel" | "pdf", empOverride?: Employee[]) => {
    const monthPayroll = payrollRecords.filter(p =>
      p.month === monthName && p.year === yearNum &&
      (effectiveCompany ? p.companyId === effectiveCompany : true)
    );
    const emps = empOverride ?? filteredEmployees;

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
      const earnOth = (c?.otherAllowances || 0) + (c?.specialAllowance || 0);
      const customEarningsMap: Record<string, number> = (pr as any)?.customEarnings || {};
      const customEarn = Object.values(customEarningsMap).reduce((s: number, v) => s + (Number(v) || 0), 0) as number;
      const customDeductionsMap: Record<string, number> = (pr as any)?.customDeductions || {};
      const customDed = Object.values(customDeductionsMap).reduce((s: number, v) => s + (Number(v) || 0), 0) as number;
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
        customEarnings: customEarningsMap,
        customEarn,
        bonus: c?.bonus || 0,
        otHours: Number((pr as any)?.otHours || 0),
        otAmount: Number((pr as any)?.otAmount || 0),
        pf: c?.pfEmployee || 0,
        esic: c?.esi || 0,
        lwf: c?.lwfEmployee || 0,
        tds: c?.tds || 0,
        pt: c?.professionalTax || 0,
        adv: (c?.otherDeductions || 0) + ((c as any)?.loanDeduction || 0),
        customDeductions: customDeductionsMap,
        customDed,
        netPay: c?.netSalary || 0,
        get rateTotal() { return this.rateBasic + this.rateHra + this.rateConv + this.rateOth; },
        get earnTotal() { return this.earnBasic + this.earnHra + this.earnConv + this.earnOth + this.customEarn + this.bonus + this.otAmount; },
        get dedTotal() { return this.pf + this.esic + this.lwf + this.tds + this.pt + this.adv + this.customDed; },
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

    // Collect all unique custom earning heads present in this month's data
    const allCustomHeadIds = [...new Set(dataRows.flatMap(r => Object.keys(r.customEarnings)))];
    const usedHeads = allCustomHeadIds.map(id => ({
      id,
      name: earningHeads.find(h => h.id === id)?.name || "Custom",
    }));

    // Collect all unique custom deduction heads present in this month's data
    const allCustomDedHeadIds = [...new Set(dataRows.flatMap(r => Object.keys(r.customDeductions)))];
    const usedDedHeads = allCustomDedHeadIds.map(id => ({
      id,
      name: deductionHeads.find(h => h.id === id)?.name || "Custom",
    }));

    if (fileType === "excel") {
      const rows = dataRows.map(r => {
        const row: Record<string, string | number> = {
          "Code": r.code, "Name": r.name, "Department": r.dept, "Designation": r.desig,
          "Month Days": r.monthDays, "Pay Days": r.payDays,
          "Rate: Basic": r.rateBasic, "Rate: HRA": r.rateHra, "Rate: Conv": r.rateConv, "Rate: Other": r.rateOth,
          "Rate: Total": r.rateBasic + r.rateHra + r.rateConv + r.rateOth,
          "Earn: Basic": r.earnBasic, "Earn: HRA": r.earnHra, "Earn: Conv": r.earnConv, "Earn: Other": r.earnOth,
        };
        usedHeads.forEach(h => { row[`Earn: ${h.name}`] = r.customEarnings[h.id] || 0; });
        row["Earn: Bonus"] = r.bonus;
        row["OT Hrs"] = r.otHours;
        row["OT Amount"] = r.otAmount;
        row["Earn: Total"] = r.earnTotal;
        row["Ded: PF"] = r.pf; row["Ded: ESIC"] = r.esic; row["Ded: LWF"] = r.lwf;
        row["Ded: TDS"] = r.tds; row["Ded: PT"] = r.pt; row["Ded: Adv"] = r.adv;
        usedDedHeads.forEach(h => { row[`Ded: ${h.name}`] = r.customDeductions[h.id] || 0; });
        row["Ded: Total"] = r.dedTotal;
        row["Net Pay"] = r.netPay;
        return row;
      });
      const totalExcelRow: Record<string, string | number> = { "Code": "", "Name": "TOTAL", "Department": "", "Designation": "", "Month Days": "", "Pay Days": "" };
      const fixedNumKeys = ["Rate: Basic","Rate: HRA","Rate: Conv","Rate: Other","Rate: Total","Earn: Basic","Earn: HRA","Earn: Conv","Earn: Other"];
      const customNumKeys = usedHeads.map(h => `Earn: ${h.name}`);
      const customDedNumKeys = usedDedHeads.map(h => `Ded: ${h.name}`);
      const trailNumKeys = ["Earn: Bonus","OT Hrs","OT Amount","Earn: Total","Ded: PF","Ded: ESIC","Ded: LWF","Ded: TDS","Ded: PT","Ded: Adv",...customDedNumKeys,"Ded: Total","Net Pay"];
      const numKeys = [...fixedNumKeys, ...customNumKeys, ...trailNumKeys];
      for (const k of numKeys) totalExcelRow[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
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
    const sumEarnTotal = dataRows.reduce((a, r) => a + r.earnTotal, 0);
    const sumDedTotal = dataRows.reduce((a, r) => a + r.dedTotal, 0);
    const totalsRow = [
      { content: "TOTAL", colSpan: 6, styles: { fontStyle: "bold" as const, halign: "right" as const } },
      sum("otHours"),
      sum("rateBasic"), sum("rateHra"), sum("rateConv"), sum("rateOth"), sumRateTotal,
      sum("earnBasic"), sum("earnHra"), sum("earnConv"), sum("earnOth"),
      ...usedHeads.map(h => dataRows.reduce((s, r) => s + (r.customEarnings[h.id] || 0), 0)),
      sum("bonus"), sum("otAmount"), sumEarnTotal,
      sum("pf"), sum("esic"), sum("lwf"), sum("tds"), sum("pt"), sum("adv"),
      ...usedDedHeads.map(h => dataRows.reduce((s, r) => s + (r.customDeductions[h.id] || 0), 0)),
      sumDedTotal,
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
          { content: "Earnings",    colSpan: 7 + usedHeads.length,  styles: { halign: "center" } },
          { content: "Deductions",  colSpan: 7 + usedDedHeads.length,  styles: { halign: "center" } },
          { content: "Net Pay",     rowSpan: 2, styles: { halign: "center", valign: "middle" } },
        ],
        [
          "Basic", "HRA", "Conv", "Other", "Total",
          "Basic", "HRA", "Conv", "Other",
          ...usedHeads.map(h => h.name.length > 8 ? h.name.slice(0, 7) + "." : h.name),
          "Bonus", "OT Amt", "Total",
          "PF", "ESIC", "LWF", "TDS", "PT", "Adv",
          ...usedDedHeads.map(h => h.name.length > 8 ? h.name.slice(0, 7) + "." : h.name),
          "Total",
        ],
      ],
      body: dataRows.map(r => [
        r.code, r.name, r.dept, r.desig, r.monthDays, r.payDays,
        r.otHours,
        r.rateBasic, r.rateHra, r.rateConv, r.rateOth, r.rateBasic + r.rateHra + r.rateConv + r.rateOth,
        r.earnBasic, r.earnHra, r.earnConv, r.earnOth,
        ...usedHeads.map(h => r.customEarnings[h.id] || 0),
        r.bonus, r.otAmount, r.earnTotal,
        r.pf, r.esic, r.lwf, r.tds, r.pt, r.adv,
        ...usedDedHeads.map(h => r.customDeductions[h.id] || 0),
        r.dedTotal,
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

  const generatePFStatement = (fileType: "excel" | "pdf", empOverride?: Employee[]) => {
    const pfEmployees = (empOverride ?? filteredEmployees).filter(e => e.pfApplicable);
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

  const generateESICStatement = (fileType: "excel" | "pdf", empOverride?: Employee[]) => {
    const esicEmployees = (empOverride ?? filteredEmployees).filter(e => e.esiApplicable);
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
      (effectiveCompany ? p.companyId === effectiveCompany : true) &&
      (docEmployee ? p.employeeId === docEmployee : true)
    );

    const emps = docEmployee ? filteredEmployees.filter(e => e.id === docEmployee) : filteredEmployees;

    const buildPaySlipPDF = (emp: Employee, c: ReturnType<typeof getProRatedComponents>, workingDays?: number, presentDays?: number, leaveDays?: number, payDays?: number, otHoursArg?: number, otAmountArg?: number, pr?: Payroll | null) => {
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
      if (c.specialAllowance > 0) earnRows.push(["Special Allowance", fmt(c.specialAllowance)]);
      // Custom earning heads stored per payroll record
      const payrollCustom: Record<string, number> = (pr as any)?.customEarnings || {};
      const customEarnSum = Object.entries(payrollCustom).reduce((acc, [headId, amt]) => {
        const head = earningHeads.find((h) => h.id === headId);
        if (head && amt) earnRows.push([head.name, fmt(amt as number)]);
        return acc + (Number(amt) || 0);
      }, 0);
      const residualOther = (c.otherAllowances || 0) - customEarnSum;
      if (residualOther > 0) earnRows.push(["Other Allowances", fmt(residualOther)]);
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
      // Custom deduction heads stored per payroll record
      const payrollCustomDed: Record<string, number> = (pr as any)?.customDeductions || {};
      Object.entries(payrollCustomDed).forEach(([headId, amt]) => {
        const head = deductionHeads.find((h) => h.id === headId);
        if (head && amt) dedRows.push([head.name, fmt(amt as number)]);
      });

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
        // Collect dynamic head IDs across all pay slip records
        const psEarnIds = [...new Set(monthPayroll.flatMap(p => Object.keys((p as any).customEarnings || {})))];
        const psDedIds  = [...new Set(monthPayroll.flatMap(p => Object.keys((p as any).customDeductions || {})))];
        const psEarnHeads = psEarnIds.map(id => ({ id, name: earningHeads.find(h => h.id === id)?.name || "Custom" }));
        const psDedHeads  = psDedIds.map(id => ({ id, name: deductionHeads.find(h => h.id === id)?.name || "Custom" }));

        const rows = monthPayroll.map(p => {
          const emp = employees.find(e => e.id === p.employeeId);
          const ss = salaryStructures.find(s => s.employeeId === p.employeeId);
          const c = emp ? getProRatedComponents(emp, ss, p) : null;
          const prCustomEarn: Record<string, number> = (p as any).customEarnings || {};
          const prCustomDed: Record<string, number> = (p as any).customDeductions || {};
          const customEarnSum = Object.values(prCustomEarn).reduce((s, v) => s + (Number(v) || 0), 0);
          const residualOther = Math.max(0, (c?.otherAllowances || 0) - customEarnSum);
          const row: Record<string, string | number> = {
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
            "Special Allowance": c?.specialAllowance || 0,
          };
          psEarnHeads.forEach(h => { row[h.name] = prCustomEarn[h.id] || 0; });
          row["Other Allowances"] = residualOther;
          row["Statutory Bonus"] = c?.bonus || 0;
          row["OT Hours"] = Number((p as any).otHours || 0);
          row["OT Amount"] = Number((p as any).otAmount || 0);
          row["Total Earnings"] = c?.totalEarnings || 0;
          row["PF Deduction"] = c?.pfEmployee || 0;
          row["ESI Deduction"] = c?.esi || 0;
          row["Prof. Tax"] = c?.professionalTax || 0;
          row["LWF"] = c?.lwfEmployee || 0;
          row["TDS"] = c?.tds || 0;
          row["Other Deductions"] = c?.otherDeductions || 0;
          row["Loan / Advance"] = (c as any)?.loanDeduction || 0;
          psDedHeads.forEach(h => { row[h.name] = prCustomDed[h.id] || 0; });
          row["Total Deductions"] = c?.totalDeductions || 0;
          row["Net Salary"] = c?.netSalary || 0;
          return row;
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
          buildPaySlipPDF(emp, c, p.workingDays, Number(p.presentDays), p.leaveDays || 0, Number(p.payDays) || undefined, Number((p as any).otHours || 0), Number((p as any).otAmount || 0), p);
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
        "Name": [emp.firstName, emp.lastName].filter(Boolean).join(" ").trim(),
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
          "Special Allowance": ss?.specialAllowance || 0,
          "Other Allowances": (ss?.otherAllowances || 0) + (ss?.medicalAllowance || 0),
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

  // ── CTC Register helpers ──────────────────────────────────────────────────
  const calcCTCComponents = (emp: Employee, ss: SalaryStructure | undefined) => {
    const zero = { basic: 0, hra: 0, conv: 0, spl: 0, other: 0, customEarns: {} as Record<string, number>, gross: 0, erPF: 0, erESI: 0, edli: 0, erLWF: 0, gratuity: 0, bonus: 0, monthlyCTC: 0 };

    // Derive components: prefer salary structure, fall back to most recent payroll record scaled to full month
    let basic = 0, hra = 0, conv = 0, spl = 0, other = 0, customEarns: Record<string, number> = {};

    if (ss) {
      basic = ss.basicSalary || 0;
      hra   = ss.hra || 0;
      conv  = ss.conveyance || 0;
      spl   = ss.specialAllowance || 0;
      customEarns = (ss as any).customEarnings || {};
      const customEarnSum = Object.values(customEarns).reduce((s, v) => s + (Number(v) || 0), 0);
      other = Math.max(0, (ss.otherAllowances || 0) + (ss.medicalAllowance || 0) - customEarnSum);
    } else {
      // Find most recent payroll record for this employee as fallback
      const monthOrder = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const empPayrolls = payrollRecords
        .filter(p => p.employeeId === emp.id)
        .sort((a, b) => b.year - a.year || monthOrder.indexOf(b.month) - monthOrder.indexOf(a.month));
      if (empPayrolls.length === 0) return zero;
      const pr = empPayrolls[0];
      const payDays = Number(pr.payDays) || Number(pr.workingDays) || 0;
      const scale   = payDays > 0 && pr.workingDays > 0 ? pr.workingDays / payDays : 1;
      basic = Math.round((pr.basicSalary || 0) * scale);
      hra   = Math.round(((pr.hra ?? 0)) * scale);
      conv  = Math.round(((pr.conveyance ?? 0)) * scale);
      spl   = Math.round(((pr.specialAllowance ?? 0)) * scale);
      customEarns = Object.fromEntries(Object.entries((pr as any).customEarnings || {}).map(([k, v]) => [k, Math.round(Number(v) * scale)]));
      const customEarnSum = Object.values(customEarns).reduce((s, v) => s + (Number(v) || 0), 0);
      other = Math.max(0, Math.round(((pr.otherAllowances ?? 0) + (pr.medicalAllowance ?? 0)) * scale) - customEarnSum);
    }

    const customEarnSum2 = Object.values(customEarns).reduce((s, v) => s + (Number(v) || 0), 0);
    const gross = basic + hra + conv + spl + other + customEarnSum2;
    const settings = getStatutorySettings(emp.companyId);
    let erPF = 0, erESI = 0, edli = 0, erLWF = 0, gratuity = 0, bonus = 0;
    if (settings) {
      const pfWageCeiling = Number(settings.pfWageCeiling) || 15000;
      if (settings.pfEnabled && emp.pfApplicable) {
        const pfBase = Math.min(basic, pfWageCeiling);
        erPF = Math.round(pfBase * (Number(settings.pfEmployerPercent) || 12) / 100);
        edli = Math.min(Math.round(pfBase * 0.5 / 100), 75);
      }
      if (settings.esicEnabled && emp.esiApplicable) {
        const wageCeiling = Number(settings.esicWageCeiling) || 21000;
        const erPercent   = Number(settings.esicEmployerPercent) || 325;
        const contractedGross = ss?.grossSalary || gross;
        if (contractedGross <= wageCeiling) {
          if (settings.esicCalcOnGross) {
            erESI = Math.round(Math.min(gross, wageCeiling) * erPercent / 10000);
          } else {
            const esicBase = Math.min(Math.max(basic, gross * 0.5), wageCeiling);
            erESI = Math.round(esicBase * erPercent / 10000);
          }
        }
      }
      if (settings.lwfEnabled && emp.lwfApplicable) {
        const lwfBase = settings.lwfCalculationBase === "basic" ? basic : gross;
        const erPercent = Number(settings.lwfEmployerPercent) || 40;
        const erMaxCap  = Number(settings.lwfEmployerMaxCap) || 68;
        erLWF = Math.min(Math.round(lwfBase * erPercent / 10000), erMaxCap);
      }
      if (emp.bonusApplicable && settings.bonusEnabled) {
        const bonusPercent  = Number(settings.bonusPercent) || 833;
        const bonusCeiling  = Number(settings.bonusMaxCeiling) || 7000;
        const bonusBase     = settings.bonusCalculationBase === "gross" ? gross : basic;
        const bonusWage     = (settings as any).bonusSkipCeiling ? bonusBase : Math.min(bonusBase, bonusCeiling);
        bonus = Math.round(bonusWage * bonusPercent / 10000);
      }
    }
    if ((emp as any).gratuityApplicable) {
      gratuity = Math.round(basic * 15 / 26 / 12);
    }
    const monthlyCTC = gross + erPF + erESI + edli + erLWF + gratuity + bonus;
    return { basic, hra, conv, spl, other, customEarns, gross, erPF, erESI, edli, erLWF, gratuity, bonus, monthlyCTC };
  };

  const generateCTCRegister = (fileType: "excel" | "pdf") => {
    const emps = filteredEmployees.filter(e => e.status === "active");
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No active employees found.", variant: "destructive" });
      return;
    }

    // Collect all custom earning head IDs across salary structures AND payroll records
    const ctcEarnIds = [...new Set(emps.flatMap(e => {
      const ss = salaryStructures.find(s => s.employeeId === e.id);
      if (ss) return Object.keys((ss as any)?.customEarnings || {});
      const pr = payrollRecords.filter(p => p.employeeId === e.id).sort((a, b) => b.year - a.year)[0];
      return Object.keys((pr as any)?.customEarnings || {});
    }))];
    const ctcEarnHeads = ctcEarnIds.map(id => ({ id, name: earningHeads.find(h => h.id === id)?.name || "Custom" }));

    if (fileType === "excel") {
      const rows = emps.map(emp => {
        const ss = salaryStructures.find(s => s.employeeId === emp.id);
        const c  = calcCTCComponents(emp, ss);
        const row: Record<string, string | number> = {
          "Emp Code":    emp.employeeCode,
          "Name":        `${emp.firstName} ${emp.lastName}`,
          "Department":  emp.department  || "",
          "Designation": emp.designation || "",
          "Basic":       c.basic,
          "HRA":         c.hra,
          "Conveyance":  c.conv,
          "Special All.": c.spl,
        };
        ctcEarnHeads.forEach(h => { row[h.name] = c.customEarns[h.id] || 0; });
        row["Other All."]      = c.other;
        row["Gross Salary"]    = c.gross;
        row["Employer PF"]     = c.erPF;
        row["Employer ESI"]    = c.erESI;
        row["EDLI"]            = c.edli;
        row["Employer LWF"]    = c.erLWF;
        row["Gratuity"]        = c.gratuity;
        row["Bonus (Mthly)"]   = c.bonus;
        row["Monthly CTC"]     = c.monthlyCTC;
        row["Annual CTC"]      = c.monthlyCTC * 12;
        return row;
      });
      downloadExcel(rows, "CTC_Register", "CTC Register");
      return;
    }

    // PDF ─────────────────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const pageW = doc.internal.pageSize.getWidth();
    const companyName = effectiveCompany ? (companies.find(c => c.id === effectiveCompany)?.companyName || "All Companies") : "All Companies";
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("CTC Register", pageW / 2, 14, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`${companyName}   |   Period: ${monthName} ${yearNum}`, pageW / 2, 20, { align: "center" });

    const baseHeaders = ["#", "Code", "Name", "Dept", "Basic", "HRA", "Conv.", "Spl."];
    const customHeaders = ctcEarnHeads.map(h => h.name);
    const tailHeaders = ["Other", "Gross", "Er.PF", "Er.ESI", "EDLI", "Er.LWF", "Gratuity", "Bonus", "Mthly CTC", "Annual CTC"];
    const allHeaders = [...baseHeaders, ...customHeaders, ...tailHeaders];

    const bodyRows: (string | number)[][] = emps.map((emp, i) => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const c  = calcCTCComponents(emp, ss);
      const base: (string | number)[] = [i + 1, emp.employeeCode, `${emp.firstName} ${emp.lastName}`, emp.department || "N/A", c.basic, c.hra, c.conv, c.spl];
      const custom: number[] = ctcEarnHeads.map(h => c.customEarns[h.id] || 0);
      const tail: (string | number)[] = [c.other, c.gross, c.erPF, c.erESI, c.edli, c.erLWF, c.gratuity, c.bonus, c.monthlyCTC, c.monthlyCTC * 12];
      return [...base, ...custom, ...tail];
    });

    // Totals row
    const totIdx = { gross: allHeaders.indexOf("Gross"), erPF: allHeaders.indexOf("Er.PF"), erESI: allHeaders.indexOf("Er.ESI"), edli: allHeaders.indexOf("EDLI"), erLWF: allHeaders.indexOf("Er.LWF"), grat: allHeaders.indexOf("Gratuity"), bonus: allHeaders.indexOf("Bonus"), mCTC: allHeaders.indexOf("Mthly CTC"), aCTC: allHeaders.indexOf("Annual CTC") };
    const totRow: (string | number)[] = allHeaders.map((_, ci) => {
      if (ci === 0) return "Total";
      const vals = bodyRows.map(r => Number(r[ci]) || 0);
      const sumCols = [totIdx.gross, totIdx.erPF, totIdx.erESI, totIdx.edli, totIdx.erLWF, totIdx.grat, totIdx.bonus, totIdx.mCTC, totIdx.aCTC, ...ctcEarnHeads.map((_, i) => baseHeaders.length + i), 5, 6, 7, 8, baseHeaders.length + ctcEarnHeads.length];
      return sumCols.includes(ci) ? vals.reduce((a, b) => a + b, 0) : "";
    });

    (doc as any).autoTable({
      head: [allHeaders],
      body: [...bodyRows, totRow],
      startY: 26,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", halign: "center" },
      didParseCell: (d: any) => {
        if (d.row.index === bodyRows.length) { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = [240, 240, 240]; }
      },
    });
    doc.save(`CTC_Register_${monthName}_${yearNum}.pdf`);
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

  const viewAttendanceSheet = (empOverride?: Employee[]) => {
    const emps = empOverride ?? filteredEmployees;
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

  const viewSalarySheet = (empOverride?: Employee[]) => {
    const monthPayroll = payrollRecords.filter(p => p.month === monthName && p.year === yearNum && (effectiveCompany ? p.companyId === effectiveCompany : true));
    const emps = empOverride ?? filteredEmployees;

    // Collect all unique custom earning heads used in this month's payroll
    const allViewHeadIds = [...new Set(monthPayroll.flatMap(p => Object.keys((p as any).customEarnings || {})))];
    const viewUsedHeads = allViewHeadIds.map(id => ({
      id,
      name: earningHeads.find(h => h.id === id)?.name || "Custom",
    }));

    // Collect all unique custom deduction heads used in this month's payroll
    const allViewDedHeadIds = [...new Set(monthPayroll.flatMap(p => Object.keys((p as any).customDeductions || {})))];
    const viewUsedDedHeads = allViewDedHeadIds.map(id => ({
      id,
      name: deductionHeads.find(h => h.id === id)?.name || "Custom",
    }));

    const headers = [
      "Code", "Name", "Dept", "Designation", "Mon.Days", "Pay Days", "OT Hrs",
      "R.Basic", "R.HRA", "R.Conv", "R.Oth", "R.Total",
      "E.Basic", "E.HRA", "E.Conv", "E.Oth",
      ...viewUsedHeads.map(h => h.name),
      "Bonus", "E.OT Amt", "E.Total",
      "PF", "ESIC", "LWF", "TDS", "PT", "Other Ded", "Loan/Adv",
      ...viewUsedDedHeads.map(h => h.name),
      "D.Total", "Net Pay",
    ];
    let rows: (string | number)[][] = [];
    const buildViewRow = (emp: Employee, c: ReturnType<typeof getProRatedComponents> | null, pr: Payroll | null): (string | number)[] => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const rBasic = ss?.basicSalary || 0, rHra = ss?.hra || 0, rConv = ss?.conveyance || 0;
      const rOth = (ss?.otherAllowances || 0) + (ss?.specialAllowance || 0) + (ss?.medicalAllowance || 0);
      const eBasic = c?.basicSalary || 0, eHra = c?.hra || 0, eConv = c?.conveyance || 0;
      const eOth = (c?.otherAllowances || 0) + (c?.specialAllowance || 0);
      const prCustom: Record<string, number> = (pr as any)?.customEarnings || {};
      const customEarn = Object.values(prCustom).reduce((s: number, v) => s + (Number(v) || 0), 0) as number;
      const prCustomDed: Record<string, number> = (pr as any)?.customDeductions || {};
      const customDedAmt = Object.values(prCustomDed).reduce((s: number, v) => s + (Number(v) || 0), 0) as number;
      const bonus = c?.bonus || 0;
      const otHoursVal = Number((pr as any)?.otHours || 0);
      const otAmtVal = Number((pr as any)?.otAmount || 0);
      const pf = c?.pfEmployee || 0, esic = c?.esi || 0, lwf = c?.lwfEmployee || 0;
      const tds = c?.tds || 0, pt = c?.professionalTax || 0;
      const othDed = c?.otherDeductions || 0, loanAdv = (c as any)?.loanDeduction || 0;
      const earnTotal = eBasic + eHra + eConv + eOth + customEarn + bonus + otAmtVal;
      const dedTotal = pf + esic + lwf + tds + pt + othDed + loanAdv + customDedAmt;
      return [
        emp.employeeCode || "", `${emp.firstName} ${emp.lastName}`, emp.department || "-", emp.designation || "-",
        pr ? pr.workingDays : "-", pr ? (pr.payDays ?? pr.presentDays) : "-",
        otHoursVal,
        rBasic, rHra, rConv, rOth, rBasic + rHra + rConv + rOth,
        eBasic, eHra, eConv, eOth,
        ...viewUsedHeads.map(h => prCustom[h.id] || 0),
        bonus, otAmtVal, earnTotal,
        pf, esic, lwf, tds, pt, othDed, loanAdv,
        ...viewUsedDedHeads.map(h => prCustomDed[h.id] || 0),
        dedTotal,
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

  const viewPFStatement = (empOverride?: Employee[]) => {
    const pfEmployees = (empOverride ?? filteredEmployees).filter(e => e.pfApplicable);
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

  const viewESICStatement = (empOverride?: Employee[]) => {
    const esicEmployees = (empOverride ?? filteredEmployees).filter(e => e.esiApplicable);
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
    const monthPayroll = payrollRecords.filter(p =>
      p.month === monthName && p.year === yearNum &&
      (effectiveCompany ? p.companyId === effectiveCompany : true) &&
      (docEmployee ? p.employeeId === docEmployee : true)
    );
    const emps = docEmployee ? filteredEmployees.filter(e => e.id === docEmployee) : filteredEmployees;

    // Collect dynamic custom head IDs from actual payroll records
    const vpEarnIds = [...new Set(monthPayroll.flatMap(p => Object.keys((p as any).customEarnings || {})))];
    const vpDedIds  = [...new Set(monthPayroll.flatMap(p => Object.keys((p as any).customDeductions || {})))];
    const vpEarnHeads = vpEarnIds.map(id => ({ id, name: earningHeads.find(h => h.id === id)?.name || "Custom" }));
    const vpDedHeads  = vpDedIds.map(id => ({ id, name: deductionHeads.find(h => h.id === id)?.name || "Custom" }));

    const headers = [
      "Code", "Name", "Dept", "Basic", "HRA", "Conv.", "Spl.",
      ...vpEarnHeads.map(h => h.name),
      "Other", "Bonus", "OT Hrs", "OT Amt", "Tot.Earn",
      "PF", "ESI", "PT", "LWF", "TDS", "Other Ded", "Loan/Adv",
      ...vpDedHeads.map(h => h.name),
      "Tot.Ded", "Net Salary",
    ];

    let rows: (string | number)[][] = [];
    if (monthPayroll.length > 0) {
      rows = monthPayroll.map(p => {
        const emp = employees.find(e => e.id === p.employeeId);
        const ss = salaryStructures.find(s => s.employeeId === p.employeeId);
        const c = emp ? getProRatedComponents(emp, ss, p) : null;
        const prCustomEarn: Record<string, number> = (p as any).customEarnings || {};
        const prCustomDed: Record<string, number> = (p as any).customDeductions || {};
        const customEarnSum = Object.values(prCustomEarn).reduce((s, v) => s + (Number(v) || 0), 0);
        const residualOther = Math.max(0, (c?.otherAllowances || 0) - customEarnSum);
        return [
          emp?.employeeCode || "", getEmployeeName(p.employeeId), emp?.department || "N/A",
          c?.basicSalary || 0, c?.hra || 0, c?.conveyance || 0, c?.specialAllowance || 0,
          ...vpEarnHeads.map(h => prCustomEarn[h.id] || 0),
          residualOther, c?.bonus || 0,
          Number((p as any).otHours || 0), Number((p as any).otAmount || 0),
          c?.totalEarnings || 0,
          c?.pfEmployee || 0, c?.esi || 0, c?.professionalTax || 0, c?.lwfEmployee || 0,
          c?.tds || 0, c?.otherDeductions || 0, (c as any)?.loanDeduction || 0,
          ...vpDedHeads.map(h => prCustomDed[h.id] || 0),
          c?.totalDeductions || 0, c?.netSalary || 0,
        ];
      });
    } else {
      rows = emps.map(emp => {
        const ss = salaryStructures.find(s => s.employeeId === emp.id);
        const c = getProRatedComponents(emp, ss, null);
        return [
          emp.employeeCode, `${emp.firstName} ${emp.lastName}`, emp.department || "N/A",
          c.basicSalary, c.hra, c.conveyance, c.specialAllowance,
          ...vpEarnHeads.map(() => 0),
          c.otherAllowances, c.bonus, 0, 0,
          c.totalEarnings,
          c.pfEmployee, c.esi, c.professionalTax, c.lwfEmployee,
          c.tds, c.otherDeductions, (c as any).loanDeduction || 0,
          ...vpDedHeads.map(() => 0),
          c.totalDeductions, c.netSalary,
        ];
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

  const viewCTCRegister = () => {
    const emps = filteredEmployees.filter(e => e.status === "active");
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No active employees found.", variant: "destructive" });
      return;
    }
    const ctcEarnIds = [...new Set(emps.flatMap(e => {
      const ss = salaryStructures.find(s => s.employeeId === e.id);
      if (ss) return Object.keys((ss as any)?.customEarnings || {});
      const pr = payrollRecords.filter(p => p.employeeId === e.id).sort((a, b) => b.year - a.year)[0];
      return Object.keys((pr as any)?.customEarnings || {});
    }))];
    const ctcEarnHeads = ctcEarnIds.map(id => ({ id, name: earningHeads.find(h => h.id === id)?.name || "Custom" }));
    const headers = [
      "Code", "Name", "Dept", "Basic", "HRA", "Conv.", "Spl.",
      ...ctcEarnHeads.map(h => h.name),
      "Other", "Gross", "Er.PF", "Er.ESI", "EDLI", "Er.LWF", "Gratuity", "Bonus", "Mthly CTC", "Annual CTC",
    ];
    const rows: (string | number)[][] = emps.map(emp => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const c  = calcCTCComponents(emp, ss);
      return [
        emp.employeeCode, `${emp.firstName} ${emp.lastName}`, emp.department || "N/A",
        c.basic, c.hra, c.conv, c.spl,
        ...ctcEarnHeads.map(h => c.customEarns[h.id] || 0),
        c.other, c.gross, c.erPF, c.erESI, c.edli, c.erLWF, c.gratuity, c.bonus, c.monthlyCTC, c.monthlyCTC * 12,
      ];
    });
    openViewDialog("CTC Register", headers, rows);
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

  // ─── Annual report helpers ────────────────────────────────────────────────
  const yearNum2 = parseInt(selectedYear);

  // Build month list per year-type; each entry carries its own calendar year
  const allMonthsOfYear: { name: string; num: number; year: number }[] = (() => {
    if (yearType === "calendar") {
      return months.map((m, i) => ({ name: m, num: i + 1, year: yearNum2 }));
    }
    if (yearType === "financial") {
      const result: { name: string; num: number; year: number }[] = [];
      for (let i = 3; i < 12; i++) result.push({ name: months[i], num: i + 1, year: yearNum2 });
      for (let i = 0; i < 3; i++) result.push({ name: months[i], num: i + 1, year: yearNum2 + 1 });
      return result;
    }
    // custom
    const [fy, fm] = customFromMonth.split("-").map(Number);
    const [ty, tm] = customToMonth.split("-").map(Number);
    const result: { name: string; num: number; year: number }[] = [];
    let cy = fy, cm = fm;
    while ((cy < ty || (cy === ty && cm <= tm)) && result.length < 24) {
      result.push({ name: months[cm - 1], num: cm, year: cy });
      cm++; if (cm > 12) { cm = 1; cy++; }
    }
    return result;
  })();

  // Human-readable period label used in file names and report titles
  const periodLabel = yearType === "calendar"
    ? selectedYear
    : yearType === "financial"
      ? `FY${selectedYear}-${String(yearNum2 + 1).slice(-2)}`
      : `${customFromMonth}_to_${customToMonth}`;

  // Start/end date strings for the selected period (used by leave register)
  const periodStartDate = yearType === "calendar"
    ? `${selectedYear}-01-01`
    : yearType === "financial"
      ? `${selectedYear}-04-01`
      : `${customFromMonth}-01`;
  const periodEndDate = yearType === "calendar"
    ? `${selectedYear}-12-31`
    : yearType === "financial"
      ? `${yearNum2 + 1}-03-31`
      : `${customToMonth}-31`;

  const getPayrollForMonth = (employeeId: string, month: string, year: number) =>
    payrollRecords.find(p => p.employeeId === employeeId && p.month === month && p.year === year) || null;

  // ─── Yearly PF Summary ────────────────────────────────────────────────────
  const buildYearlyPFRows = () => {
    const pfEmps = filteredEmployees.filter(e => e.pfApplicable);
    return pfEmps.map(emp => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const settings = getStatutorySettings(emp.companyId);
      const pfWageCeiling = Number(settings?.pfWageCeiling) || 15000;
      let totalEE = 0, totalER = 0;
      const monthly: Record<string, { ee: number; er: number }> = {};
      for (const m of allMonthsOfYear) {
        const pr = getPayrollForMonth(emp.id, m.name, m.year);
        const c = getProRatedComponents(emp, ss, pr);
        const ee = c.pfEmployee;
        const epsWage = Math.min(c.basicSalary, pfWageCeiling);
        const er = Math.round(epsWage * 0.0833);
        const key = `${m.name.slice(0,3)} ${m.year}`;
        monthly[key] = { ee, er };
        totalEE += ee;
        totalER += er;
      }
      return { emp, monthly, totalEE, totalER };
    });
  };

  const generateYearlyPFSummary = (fileType: "excel" | "pdf") => {
    const rows = buildYearlyPFRows();
    if (!rows.length) { toast({ title: "No Data", description: "No PF-applicable employees.", variant: "destructive" }); return; }
    const colKeys = allMonthsOfYear.map(m => `${m.name.slice(0,3)} ${m.year}`);
    if (fileType === "excel") {
      const data = rows.map(r => {
        const row: Record<string, string | number> = {
          "UAN": r.emp.uan || "",
          "Emp Code": r.emp.employeeCode,
          "Name": `${r.emp.firstName} ${r.emp.lastName}`,
          "Company": getCompanyName(r.emp.companyId),
        };
        for (const k of colKeys) { row[`${k} EE`] = r.monthly[k]?.ee ?? 0; row[`${k} ER`] = r.monthly[k]?.er ?? 0; }
        row["Total EE"] = r.totalEE; row["Total ER"] = r.totalER; row["Grand Total"] = r.totalEE + r.totalER;
        return row;
      });
      downloadExcel(data, `PF_Summary_${periodLabel}`, "PF Summary");
    } else {
      const headers = ["UAN", "Name", ...colKeys, "Total EE", "Total ER"];
      const pdfRows = rows.map(r => [r.emp.uan || "N/A", `${r.emp.firstName} ${r.emp.lastName}`, ...colKeys.map(k => r.monthly[k]?.ee ?? 0), r.totalEE, r.totalER] as (string | number)[]);
      downloadPDF(`PF Summary - ${periodLabel}`, headers, pdfRows, `PF_Summary_${periodLabel}`);
    }
  };

  const viewYearlyPFSummary = () => {
    const rows = buildYearlyPFRows();
    if (!rows.length) { toast({ title: "No Data", description: "No PF-applicable employees.", variant: "destructive" }); return; }
    const colKeys = allMonthsOfYear.map(m => `${m.name.slice(0,3)} ${m.year}`);
    const headers = ["UAN", "Name", "Company", ...colKeys.map(k => `${k} EE`), "Total EE", "Total ER"];
    openViewDialog(`PF Summary - ${periodLabel}`, headers, rows.map(r => [r.emp.uan || "N/A", `${r.emp.firstName} ${r.emp.lastName}`, getCompanyName(r.emp.companyId), ...colKeys.map(k => r.monthly[k]?.ee ?? 0), r.totalEE, r.totalER]));
  };

  // ─── Yearly ESIC Summary ──────────────────────────────────────────────────
  const buildYearlyESICRows = () => {
    const esicEmps = filteredEmployees.filter(e => e.esiApplicable);
    return esicEmps.map(emp => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const settings = getStatutorySettings(emp.companyId);
      const wageCeiling = Number(settings?.esicWageCeiling) || 21000;
      const erPercent = Number(settings?.esicEmployerPercent) || 325;
      let totalEE = 0, totalER = 0;
      const monthly: Record<string, { ee: number; er: number }> = {};
      for (const m of allMonthsOfYear) {
        const pr = getPayrollForMonth(emp.id, m.name, m.year);
        const c = getProRatedComponents(emp, ss, pr);
        const contractedGross = ss?.grossSalary || c.grossSalary;
        let er = 0;
        if (contractedGross <= wageCeiling) {
          if (settings?.esicCalcOnGross) {
            er = Math.round(Math.min(c.grossSalary, wageCeiling) * erPercent / 10000);
          } else {
            const esicBase = Math.min(Math.max(c.basicSalary, c.grossSalary * 0.5), wageCeiling);
            er = Math.round(esicBase * erPercent / 10000);
          }
        }
        const key = `${m.name.slice(0,3)} ${m.year}`;
        monthly[key] = { ee: c.esi, er };
        totalEE += c.esi;
        totalER += er;
      }
      return { emp, monthly, totalEE, totalER };
    });
  };

  const generateYearlyESICSummary = (fileType: "excel" | "pdf") => {
    const rows = buildYearlyESICRows();
    if (!rows.length) { toast({ title: "No Data", description: "No ESIC-applicable employees.", variant: "destructive" }); return; }
    const colKeys = allMonthsOfYear.map(m => `${m.name.slice(0,3)} ${m.year}`);
    if (fileType === "excel") {
      const data = rows.map(r => {
        const row: Record<string, string | number> = { "ESIC No.": r.emp.esiNumber || "", "Emp Code": r.emp.employeeCode, "Name": `${r.emp.firstName} ${r.emp.lastName}`, "Company": getCompanyName(r.emp.companyId) };
        for (const k of colKeys) { row[`${k} EE`] = r.monthly[k]?.ee ?? 0; row[`${k} ER`] = r.monthly[k]?.er ?? 0; }
        row["Total EE"] = r.totalEE; row["Total ER"] = r.totalER; row["Grand Total"] = r.totalEE + r.totalER;
        return row;
      });
      downloadExcel(data, `ESIC_Summary_${periodLabel}`, "ESIC Summary");
    } else {
      const headers = ["ESIC No.", "Name", ...colKeys, "Total EE", "Total ER"];
      const pdfRows = rows.map(r => [r.emp.esiNumber || "N/A", `${r.emp.firstName} ${r.emp.lastName}`, ...colKeys.map(k => r.monthly[k]?.ee ?? 0), r.totalEE, r.totalER] as (string | number)[]);
      downloadPDF(`ESIC Summary - ${periodLabel}`, headers, pdfRows, `ESIC_Summary_${periodLabel}`);
    }
  };

  const viewYearlyESICSummary = () => {
    const rows = buildYearlyESICRows();
    if (!rows.length) { toast({ title: "No Data", description: "No ESIC-applicable employees.", variant: "destructive" }); return; }
    const colKeys = allMonthsOfYear.map(m => `${m.name.slice(0,3)} ${m.year}`);
    const headers = ["ESIC No.", "Name", "Company", ...colKeys.map(k => `${k} EE`), "Total EE", "Total ER"];
    openViewDialog(`ESIC Summary - ${periodLabel}`, headers, rows.map(r => [r.emp.esiNumber || "N/A", `${r.emp.firstName} ${r.emp.lastName}`, getCompanyName(r.emp.companyId), ...colKeys.map(k => r.monthly[k]?.ee ?? 0), r.totalEE, r.totalER]));
  };

  // ─── Yearly Salary Detail ─────────────────────────────────────────────────
  const buildYearlySalaryRows = () => {
    return filteredEmployees.map(emp => {
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      let totalGross = 0, totalNet = 0, totalPF = 0, totalESIC = 0;
      const monthly: Record<string, { gross: number; net: number; pf: number; esic: number }> = {};
      for (const m of allMonthsOfYear) {
        const pr = getPayrollForMonth(emp.id, m.name, m.year);
        const c = getProRatedComponents(emp, ss, pr);
        const key = `${m.name.slice(0,3)} ${m.year}`;
        monthly[key] = { gross: c.grossSalary, net: c.netSalary, pf: c.pfEmployee, esic: c.esi };
        totalGross += c.grossSalary;
        totalNet += c.netSalary;
        totalPF += c.pfEmployee;
        totalESIC += c.esi;
      }
      return { emp, monthly, totalGross, totalNet, totalPF, totalESIC };
    });
  };

  const generateYearlySalaryDetail = (fileType: "excel" | "pdf") => {
    const rows = buildYearlySalaryRows();
    if (!rows.length) { toast({ title: "No Data", description: "No employees found.", variant: "destructive" }); return; }
    const colKeys = allMonthsOfYear.map(m => `${m.name.slice(0,3)} ${m.year}`);
    if (fileType === "excel") {
      const data = rows.map(r => {
        const row: Record<string, string | number> = { "Emp Code": r.emp.employeeCode, "Name": `${r.emp.firstName} ${r.emp.lastName}`, "Department": r.emp.department || "", "Company": getCompanyName(r.emp.companyId) };
        for (const k of colKeys) { row[`${k} Gross`] = r.monthly[k]?.gross ?? 0; row[`${k} Net`] = r.monthly[k]?.net ?? 0; }
        row["Total Gross"] = r.totalGross; row["Total PF"] = r.totalPF; row["Total ESIC"] = r.totalESIC; row["Total Net"] = r.totalNet;
        return row;
      });
      downloadExcel(data, `Salary_Detail_${periodLabel}`, "Salary Detail");
    } else {
      const headers = ["Code", "Name", ...colKeys.map(k => `${k} Net`), "Total Gross", "Total Net"];
      const pdfRows = rows.map(r => [r.emp.employeeCode, `${r.emp.firstName} ${r.emp.lastName}`, ...colKeys.map(k => r.monthly[k]?.net ?? 0), r.totalGross, r.totalNet] as (string | number)[]);
      downloadPDF(`Salary Detail - ${periodLabel}`, headers, pdfRows, `Salary_Detail_${periodLabel}`);
    }
  };

  const viewYearlySalaryDetail = () => {
    const rows = buildYearlySalaryRows();
    if (!rows.length) { toast({ title: "No Data", description: "No employees found.", variant: "destructive" }); return; }
    const colKeys = allMonthsOfYear.map(m => `${m.name.slice(0,3)} ${m.year}`);
    const headers = ["Code", "Name", "Company", ...colKeys.map(k => `${k} Net`), "Total Gross", "Total Net"];
    openViewDialog(`Salary Detail - ${periodLabel}`, headers, rows.map(r => [r.emp.employeeCode, `${r.emp.firstName} ${r.emp.lastName}`, getCompanyName(r.emp.companyId), ...colKeys.map(k => r.monthly[k]?.net ?? 0), r.totalGross, r.totalNet]));
  };

  // ─── Employee Personal File ───────────────────────────────────────────────
  const generateEmployeePersonalFile = (_fileType: "excel" | "pdf") => {
    const emp = docEmployee ? employees.find(e => e.id === docEmployee) : null;
    const targetEmps = emp ? [emp] : filteredEmployees;
    if (!targetEmps.length) { toast({ title: "No Data", description: "No employee selected or found.", variant: "destructive" }); return; }

    if (_fileType === "excel") {
      const data = targetEmps.map(e => ({
        "Emp Code": e.employeeCode, "Name": `${e.firstName} ${e.lastName}`,
        "Gender": e.gender || "", "Date of Birth": e.dateOfBirth || "", "Date of Joining": e.dateOfJoining || "",
        "Department": e.department || "", "Designation": e.designation || "", "Employment Type": e.employmentType || "",
        "Location": e.location || "", "Mobile": e.mobileNumber || "", "Official Email": e.officialEmail || "",
        "PAN": e.pan || "", "Aadhaar": e.aadhaar || "", "Bank Account": e.bankAccount || "", "IFSC": e.ifsc || "",
        "UAN": e.uan || "", "ESIC No.": e.esiNumber || "", "Father/Husband Name": e.fatherHusbandName || "",
        "Present Address": e.presentAddress || "", "Permanent Address": e.permanentAddress || "",
        "PF Applicable": e.pfApplicable ? "Yes" : "No", "ESI Applicable": e.esiApplicable ? "Yes" : "No",
        "Status": e.status, "Company": getCompanyName(e.companyId),
      }));
      downloadExcel(data, `Employee_Personal_File_${selectedYear}`, "Personal File");
      return;
    }

    // ── PDF: full multi-section Employee Personal File ──────────────────────
    const doc = new jsPDF({ format: "a4", unit: "mm" });
    const PW = 210, ML = 14, MR = 14, UW = PW - ML - MR;

    const fmtDate = (d?: string | null) => {
      if (!d) return "";
      try { return format(new Date(d.includes("T") ? d : d + "T00:00:00"), "dd-MMM-yyyy"); } catch { return d; }
    };
    const companyHeader = (d: jsPDF, company: typeof companies[0] | undefined, y: number): number => {
      d.setFont("helvetica", "bold"); d.setFontSize(13);
      d.text((company?.companyName || "Company").toUpperCase(), PW / 2, y, { align: "center" }); y += 5;
      d.setFont("helvetica", "normal"); d.setFontSize(8);
      const addr = (company as any)?.registeredAddress || "";
      if (addr) { d.text(addr.toUpperCase(), PW / 2, y, { align: "center" }); y += 4; }
      return y;
    };

    targetEmps.forEach((e, empIdx) => {
      const company = companies.find(c => c.id === e.companyId);
      const ss = salaryStructures.find(s => s.employeeId === e.id);
      const empName = `${e.firstName} ${e.lastName}`.toUpperCase();
      const doj = fmtDate(e.dateOfJoining);
      const dob = fmtDate(e.dateOfBirth);
      const cityStr = (company as any)?.city || "Gurgaon";
      const grossStr = ss ? `${ss.grossSalary.toLocaleString("en-IN")}.00` : (e.grossSalary ? `${e.grossSalary.toLocaleString("en-IN")}.00` : "");

      if (empIdx > 0) doc.addPage();

      // ══════════════════════════════════════════════════════════
      // PAGE 1 – EMPLOYEE'S FILE CHECK LIST
      // ══════════════════════════════════════════════════════════
      let y = 10;

      // Solid blue header bar
      doc.setFillColor(30, 58, 138);
      doc.rect(ML, y, UW, 16, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold"); doc.setFontSize(14);
      doc.text((company?.companyName || "Company").toUpperCase(), PW / 2, y + 7, { align: "center" });
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      const regAddr1 = (company as any)?.registeredAddress || "";
      if (regAddr1) doc.text(regAddr1.toUpperCase(), PW / 2, y + 12.5, { align: "center" });
      doc.setTextColor(0, 0, 0); y += 20;

      // Title box
      doc.setFillColor(239, 246, 255);
      doc.setDrawColor(30, 58, 138); doc.setLineWidth(0.4);
      doc.rect(ML, y, UW, 10, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.setTextColor(30, 58, 138);
      doc.text("EMPLOYEE'S FILE CHECK LIST", PW / 2, y + 7, { align: "center" });
      doc.setTextColor(0, 0, 0); y += 14;

      // Employee info block
      autoTable(doc, {
        body: [
          [
            { content: "NAME", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: empName },
            { content: "DESIGNATION", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: (e.designation || "").toUpperCase() },
          ],
          [
            { content: "PAYCODE NO.", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: e.employeeCode || "" },
            { content: "DEPARTMENT", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: (e.department || "").toUpperCase() },
          ],
          [
            { content: "DATE OF JOINING", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: doj },
            { content: "CARD NO.", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: e.employeeCode || "" },
          ],
        ],
        startY: y,
        theme: "grid",
        styles: { fontSize: 10, cellPadding: 3, lineColor: [30, 58, 138], lineWidth: 0.25, valign: "middle" },
        columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 62 }, 2: { cellWidth: 40 }, 3: { cellWidth: 40 } },
        margin: { left: ML, right: MR },
      });
      y = (doc as any).lastAutoTable.finalY + 8;

      // Checklist table
      const checkItems = [
        "EMP HISTORY SHEET", "BIO-DATA",
        "NAUKARI KI LIYE PRATHNA PATRA (Application for Employment)",
        "APPOINTMENT LETTER", "DUTY JOIN", "PF FORM-2", "FORM-11", "FORM-F",
        "CONFIRMATION LETTER", "FORM-16", "ESIC FORM-1", "INDUCTION",
        "APPLICATION FORM", "EMP BACK GROUND",
      ];
      autoTable(doc, {
        head: [[
          { content: "S.No.", styles: { halign: "center" as const } },
          { content: "CHECK POINT / DOCUMENT NAME", styles: { halign: "left" as const } },
          { content: "CHECK LIST  ✓", styles: { halign: "center" as const } },
        ]],
        body: checkItems.map((item, i) => [
          { content: String(i + 1), styles: { halign: "center" as const } },
          { content: item },
          { content: "" },
        ]),
        startY: y,
        theme: "grid",
        styles: { fontSize: 10, cellPadding: 3.5, lineColor: [30, 58, 138], lineWidth: 0.25, valign: "middle" },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold", fontSize: 10, halign: "center" as const },
        alternateRowStyles: { fillColor: [248, 251, 255] },
        columnStyles: {
          0: { cellWidth: 18, halign: "center" as const, fontStyle: "bold" },
          1: { cellWidth: 130 },
          2: { cellWidth: 34, halign: "center" as const },
        },
        margin: { left: ML, right: MR },
      });
      // Paycode stamp bottom-right
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.setTextColor(30, 58, 138);
      doc.text(e.employeeCode || "", PW - MR, (doc as any).lastAutoTable.finalY + 8, { align: "right" });
      doc.setTextColor(0, 0, 0);

      // ══════════════════════════════════════════════════════════
      // PAGE 2 – EMPLOYEE HISTORY SHEET
      // ══════════════════════════════════════════════════════════
      doc.addPage(); y = 10;

      // Header bar
      doc.setFillColor(30, 58, 138);
      doc.rect(ML, y, UW, 16, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold"); doc.setFontSize(14);
      doc.text((company?.companyName || "Company").toUpperCase(), PW / 2, y + 7, { align: "center" });
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      if (regAddr1) doc.text(regAddr1.toUpperCase(), PW / 2, y + 12.5, { align: "center" });
      doc.setTextColor(0, 0, 0); y += 20;

      // Title
      doc.setFillColor(239, 246, 255);
      doc.setDrawColor(30, 58, 138); doc.setLineWidth(0.4);
      doc.rect(ML, y, UW, 10, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.setTextColor(30, 58, 138);
      doc.text("EMPLOYEE HISTORY SHEET", PW / 2, y + 7, { align: "center" });
      doc.setTextColor(0, 0, 0); y += 14;

      // Employee info block
      autoTable(doc, {
        body: [
          [
            { content: "NAME", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: empName, colSpan: 3 },
            { content: "PAY CODE", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: e.employeeCode || "" },
          ],
          [
            { content: "DESIGNATION", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: (e.designation || "").toUpperCase(), colSpan: 3 },
            { content: "DEPARTMENT", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: (e.department || "").toUpperCase() },
          ],
          [
            { content: "DATE OF JOINING", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: doj },
            { content: "CARD NO.", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: e.employeeCode || "" },
            { content: "GROSS SALARY", styles: { fontStyle: "bold", fillColor: [219, 234, 254] as [number,number,number] } },
            { content: grossStr ? `Rs. ${grossStr}` : "" },
          ],
        ],
        startY: y,
        theme: "grid",
        styles: { fontSize: 10, cellPadding: 3, lineColor: [30, 58, 138], lineWidth: 0.25, valign: "middle" },
        columnStyles: {
          0: { cellWidth: 36 }, 1: { cellWidth: 36 }, 2: { cellWidth: 28 },
          3: { cellWidth: 30 }, 4: { cellWidth: 30 }, 5: { cellWidth: 22 },
        },
        margin: { left: ML, right: MR },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // Increment table
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(30, 58, 138);
      doc.text("SALARY INCREMENT HISTORY", ML, y); doc.setTextColor(0, 0, 0); y += 5;
      autoTable(doc, {
        head: [["INCREASE DATE", "INCREASE AMOUNT (Rs.)", "CTC SALARY (Rs.)", "REMARKS"]],
        body: Array(4).fill(["", "", "", ""]),
        startY: y,
        styles: { fontSize: 9.5, cellPadding: 5, lineColor: [30, 58, 138], lineWidth: 0.2, valign: "middle" },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold", halign: "center" as const, lineColor: [20, 40, 120] },
        alternateRowStyles: { fillColor: [248, 251, 255] },
        columnStyles: { 0: { cellWidth: 42, halign: "center" as const }, 1: { cellWidth: 50, halign: "center" as const }, 2: { cellWidth: 50, halign: "center" as const }, 3: { cellWidth: 40 } },
        margin: { left: ML, right: MR },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // Side-by-side: Salary Growth + Career History
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(30, 58, 138);
      doc.text("SALARY GROWTH TABLE", ML, y);
      doc.text("CAREER HISTORY", ML + 105, y);
      doc.setTextColor(0, 0, 0); y += 5;

      const growthRows: [string, string][] = [];
      if (e.dateOfJoining && (ss || e.grossSalary)) growthRows.push([doj, grossStr ? `Rs. ${grossStr}` : ""]);
      while (growthRows.length < 6) growthRows.push(["", ""]);
      autoTable(doc, {
        head: [["YEAR / DATE", "GROSS SALARY (Rs.)"]],
        body: growthRows,
        startY: y,
        styles: { fontSize: 9.5, cellPadding: 4, lineColor: [30, 58, 138], lineWidth: 0.2, valign: "middle" },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold", halign: "center" as const },
        alternateRowStyles: { fillColor: [248, 251, 255] },
        columnStyles: { 0: { cellWidth: 50, halign: "center" as const }, 1: { cellWidth: 50, halign: "center" as const } },
        margin: { left: ML },
      });

      // ══════════════════════════════════════════════════════════
      // PAGE 3 – JOB APPLICATION LETTER (Naukari ki Liye Prarthna Patra)
      // ══════════════════════════════════════════════════════════
      doc.addPage(); y = 20;
      y = companyHeader(doc, company, y); y += 8;
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text("NAUKARI KI LIYE PRARTHNA PATRA", PW / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text("(Application for Employment)", PW / 2, y, { align: "center" }); y += 10;

      doc.setFontSize(10);
      doc.text("Vishay :-", ML, y);
      doc.setFont("helvetica", "bold");
      doc.text(`${e.designation || "Post"} ke pad ke liye avedan patra`, ML + 20, y); y += 8;
      doc.setFont("helvetica", "normal");
      doc.text("Mahoday,", ML, y); y += 7;
      const appLines = [
        `Mujhe pata chala hai ki aapki company mein ${e.designation || "____"} ki jagah khaali hai.`,
        "Mujhe kaam karne ka achha anubhav hai. Yadi aap mujhe ek baar seva ka avsar pradan karen to main",
        "aapka kaam badi mehnat aur imandaari se karunga/karungi tatha kisi bhi avaidh karya, rajnitik ya",
        "asamajik gatividhiyon mein bhaag nahi lunga/lungi.",
      ];
      appLines.forEach(line => { doc.text(line, ML, y, { maxWidth: UW }); y += 6; });
      y += 12;
      doc.text("Sthan :", ML, y); doc.text("Naam :", ML + 100, y);
      doc.setLineWidth(0.2); doc.line(ML + 15, y + 1, ML + 60, y + 1); y += 8;
      doc.text("Dinank :", ML, y); doc.text("Hastakshar :", ML + 100, y);
      doc.line(ML + 20, y + 1, ML + 65, y + 1);

      // ══════════════════════════════════════════════════════════
      // PAGE 4 – APPOINTMENT LETTER (Niyukti Patra)
      // ══════════════════════════════════════════════════════════
      doc.addPage(); y = 15;
      y = companyHeader(doc, company, y); y += 4;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(e.employeeCode || "", PW - MR, 15, { align: "right" }); // paycode top-right

      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text("Sewa mein,", ML, y); doc.text(doj, PW - MR, y, { align: "right" }); y += 6;
      doc.text("Shrimaan Prabandak Mahoday,", ML, y); y += 5;
      doc.text((company?.companyName || "").toUpperCase(), ML, y); y += 5;
      const regAddr = (company as any)?.registeredAddress || "";
      if (regAddr) { doc.text(regAddr.toUpperCase(), ML, y); y += 5; }
      y += 5;

      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text("vkids ukSdjh ds fy, vkosnu i= vkSj lk{kkRdkj ds lanHkZ esa", PW / 2, y, { align: "center" }); y += 5;
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      doc.text(`(With reference to your job application and interview for ${e.designation || "Post"})`, PW / 2, y, { align: "center" }); y += 8;

      const apptData: [string, string][] = [
        ["Naam / Name", empName],
        ["Pita/Pati ka Naam / Father's / Husband's Name", e.fatherHusbandName || ""],
        ["Asthayi Pata / Temporary Address", e.presentAddress || ""],
        ["Sthayi Pata / Permanent Address", e.permanentAddress || ""],
        ["Janm Tithi / Date of Birth", dob],
        ["Kaam Shuru Karne ki Tarikh / Date of Joining", doj],
        ["Pad / Designation", e.designation || ""],
        ["Vibhag / Department", e.department || ""],
        ["Sreni / Category (Akushal/Adh-Kushal/Kushal/Atikushal)", ""],
        ["Vetan / Salary", grossStr ? `${grossStr} /-` : ""],
      ];
      autoTable(doc, {
        body: apptData,
        startY: y,
        theme: "grid",
        styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [0,0,0], lineWidth: 0.2 },
        columnStyles: { 0:{fontStyle:"bold", cellWidth:90, fillColor:[248,248,248]}, 1:{cellWidth:86} },
        margin: { left: ML },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
      if (y > 220) { doc.addPage(); y = 15; }

      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
      doc.text("NIYAM AUR SHARTEN / TERMS AND CONDITIONS", ML, y); y += 4;
      doc.setLineWidth(0.3); doc.line(ML, y, PW - MR, y); y += 5;

      const terms = [
        `1. Aap 6 mahine tak asthayi/probation par niyukt rahenge. Zaroorat padne par yah avadhi ____ mahine ke liye dobara badhayi ja sakti hai. Kisi bhi sthiti mein probation karya-kal 12 mahine se adhik nahi badhayi ja sakti.`,
        `2. Asthayi/probation karya-kal ya badhayi gayi asthayi/probation karya-kal ke dauran aapko yah adhikar hoga ki aap bina kisi soochna (notice) diye naukari chhod sakte hain. Is asthayi/probation ke dauran company ko bhi adhikar hoga ki wah aapko bina kisi soochna (notice) ke naukari chhodne ke liye keh sakti hai.`,
        `3. Kisi ek din ____ ghante karya karne ke uparant aur kisi ek hafte mein ____ ghante karya karne ke baad aap overtime (OT) vetan ke haqdar hain. Factory Act 1948 (Dhara 59) ke tahat OT hamesha aapki sveekrti se hoga.`,
        `4. Kaam ki zaroorat ke anusaar company aapka tabadala (transfer) company ke kisi doosre vibhag ya Bharat mein company ki kisi anya factory mein kar sakti hai. Agar aapka tabadala ek se doosre rajya mein kiya jaata hai to aapki yatra ka kharch company ke dwara diya jaayega.`,
        `5. Aapki aayu _____ varsh ki hone par aapko company dwara retire kar diya jaayega.`,
        `6. Asthayi/probation karya-kal khatm hone ke baad aapki niyukti pakki (permanent) ki jaayegi, company dwara is sandarbh mein aapko patra diya jaayega.`,
        `7. Jab tak aap is company mein kaam karte hain, aapko bina company ki aagya liye doosri kisi company mein kaam karne ki anumati nahi hai.`,
        `8. Bhartiya Shram Kanoon ke niyam anusaar jaise hi aap is company mein ____ din kaam kar lete hain to aapko ____ din ki chhutti har ____ karya dinon ke baad vetan sahit lene ka adhikar hoga.`,
        `9. Aapko varsh mein 7 din ka aakashmik avakash (CL) ka adhikar hoga poore vetan ke saath.`,
        `10. Aapko varsh mein ESIC ke niyamanusaar bimari ke avakash ka adhikar hoga. Yadi aap ESIC sadasya nahi hain to aapko varsh mein 7 din ka bimari avakash (SL) vetan sahit lene ka adhikar hoga.`,
        `16. Company mein aane ka samay subah 09:30 baje aur jaane ka samay 18:00 baje hai, jisme bhojan ka samay GENERAL aur chai ka samay 16:00 se 16:15 hai.`,
        `17. Yadi aapko oopar di gayi sharten manzoor hain to aap is niyukti patra ki doosri prati par sveekriti ke liye apne hastakshar karen aur dinank ${doj} se kaam par aayein.`,
      ];
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      terms.forEach(t => {
        if (y > 265) { doc.addPage(); y = 15; }
        const lines = doc.splitTextToSize(t, UW);
        doc.text(lines, ML, y); y += lines.length * 5 + 2;
      });
      y += 6;
      if (y > 260) { doc.addPage(); y = 15; }
      doc.text(`For ${(company?.companyName || "").toUpperCase()}`, ML, y); y += 8;
      doc.text("Authorized Signatory", ML, y); y += 12;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text("Karmachari ki Sveekrati / Employee Acceptance :", ML, y); y += 6;
      doc.setFont("helvetica", "normal");
      doc.text(`Main ${empName} upar di gayi sabhi niyam aur sharten se sahmat hun.`, ML, y); y += 8;
      doc.text("Hastakshar / Signature : ____________________    Dinank / Date : ____________________", ML, y);

      // ══════════════════════════════════════════════════════════
      // PAGE 5 – PF FORM-2 (Nomination & Declaration)
      // ══════════════════════════════════════════════════════════
      doc.addPage(); y = 12;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      doc.text("Form-2 (Revised)", PW - MR, y, { align: "right" });
      doc.setFontSize(12);
      doc.text("NOMINATION AND DECLARATION", PW / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text("(FOR UNEXEMPTED/EXEMPTED ESTABLISHMENTS)", PW / 2, y, { align: "center" }); y += 4;
      doc.text("Declaration & Nomination Form under the Employee's Provident Fund and Employees Pension Scheme", PW / 2, y, { align: "center" }); y += 4;
      doc.text("(Paragraph 33 & 61(1) of Employee's Provident Fund Scheme, 1952 & paragraph 18 of the Employee's Pension Scheme 1995)", PW / 2, y, { align: "center" }); y += 8;

      // Two-column fields
      const f2L: [string, string][] = [
        ["1. Name (In block letters)", empName],
        ["2. Father's/Husband's Name", e.fatherHusbandName || ""],
        ["3. Date of Birth", dob],
        ["4. Sex", e.gender || ""],
        ["5. Marital Status", ""],
      ];
      const f2R: [string, string][] = [
        ["6. Account No.", e.uan || ""],
        ["7. Permanent Address", e.permanentAddress || ""],
        ["   Temporary Address", e.presentAddress || ""],
        ["8. Date of Appointment", doj],
      ];
      let lyF2 = y, ryF2 = y;
      doc.setFontSize(8.5);
      f2L.forEach(([l, v]) => {
        doc.setFont("helvetica", "bold"); doc.text(`${l} :`, ML, lyF2 + 4);
        doc.setFont("helvetica", "normal");
        const vLines = doc.splitTextToSize(v, 50); doc.text(vLines, ML + 55, lyF2 + 4);
        lyF2 += 8;
      });
      f2R.forEach(([l, v]) => {
        doc.setFont("helvetica", "bold"); doc.text(`${l} :`, PW / 2 + 2, ryF2 + 4);
        doc.setFont("helvetica", "normal");
        const vLines = doc.splitTextToSize(v, 44); doc.text(vLines, PW / 2 + 46, ryF2 + 4);
        ryF2 += Math.max(vLines.length, 1) * 5 + 3;
      });
      y = Math.max(lyF2, ryF2) + 5;

      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("PART - A (EPF)", PW / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text("I hereby nominate the person(s) / cancel the nomination made by me previously and nominate the person(s) mentioned below to", ML, y); y += 4;
      doc.text("receive the amount standing to my credit in the Employee's Provident Fund in the event of my death.", ML, y); y += 7;

      autoTable(doc, {
        head: [["Name of\nnominee/nominees", "Address", "Nominee's\nrelationship\nwith the member", "Date\nof birth", "Total Amt.\nof share", "Guardian\n(if minor)"]],
        body: [
          [e.fatherHusbandName || "", e.permanentAddress || "", "FATHER", "", "100.00 %", ""],
          ["", "", "", "", "", ""], ["", "", "", "", "", ""],
        ],
        startY: y,
        styles: { fontSize: 7.5, cellPadding: 2, lineColor: [0,0,0], lineWidth: 0.2 },
        headStyles: { fillColor: [225,225,225], textColor: [0,0,0], fontStyle: "bold", fontSize: 7, lineColor: [0,0,0], halign: "center" },
        columnStyles: { 0:{cellWidth:32}, 1:{cellWidth:45}, 2:{cellWidth:22}, 3:{cellWidth:18}, 4:{cellWidth:22}, 5:{cellWidth:31} },
        margin: { left: ML },
      });
      y = (doc as any).lastAutoTable.finalY + 5;

      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text("1. Certified that I have no family as defined in 2(g) of the Employee's Provident Fund Scheme 1952.", ML, y); y += 5;
      doc.text("2. Certified that my father/mother is/are dependent upon me.", ML, y); y += 7;
      doc.text("Signature or thumb Impression of the subscriber : _____________________", PW - MR, y, { align: "right" }); y += 10;

      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("PARA - B (EPS)    (Para 18)", PW / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text("I hereby furnish below particulars of the members of my family who would be eligible to receive widow/children", ML, y); y += 4;
      doc.text("pension in the event of my death.", ML, y); y += 7;

      autoTable(doc, {
        head: [["S.No.", "Name & Address of the family member", "Address", "Date of Birth", "Relationship with Member"]],
        body: [
          ["1", e.fatherHusbandName || "", e.permanentAddress || "", "", "FATHER"],
          ["2", "", "", "", ""], ["3", "", "", "", ""],
          ["4", "", "", "", ""], ["5", "", "", "", ""],
        ],
        startY: y,
        styles: { fontSize: 7.5, cellPadding: 2, lineColor: [0,0,0], lineWidth: 0.2 },
        headStyles: { fillColor: [225,225,225], textColor: [0,0,0], fontStyle: "bold", fontSize: 7.5, lineColor: [0,0,0] },
        columnStyles: { 0:{cellWidth:12}, 1:{cellWidth:38}, 2:{cellWidth:50}, 3:{cellWidth:25}, 4:{cellWidth:45} },
        margin: { left: ML },
      });
      y = (doc as any).lastAutoTable.finalY + 5;
      if (y > 250) { doc.addPage(); y = 15; }
      doc.text("Certified that I have no family as defined in Para 2(VII) of Employee's Pension Scheme, 1995.", ML, y, { maxWidth: UW }); y += 7;
      doc.text("Signature or thumb Impression of the subscriber : _____________________", PW - MR, y, { align: "right" }); y += 8;

      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text("CERTIFICATE BY EMPLOYER", ML, y); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(`Certified that the above declaration and nomination has been signed/thumb impressed before me by ${empName}`, ML, y, { maxWidth: UW }); y += 5;
      doc.text(`employed in my establishment after he/she has read the entries have been read over to him/her by me and got confirmed by him/her.`, ML, y, { maxWidth: UW }); y += 7;
      doc.text(`Place   ${cityStr}`, ML, y); y += 5;
      doc.text(`Date    ${doj}`, ML, y); y += 5;
      doc.text(`Name & Address of the factory/Establishment:   ${(company?.companyName || "").toUpperCase()}`, ML, y); y += 4;
      if (regAddr) { doc.text(regAddr.toUpperCase(), ML + 5, y); y += 4; }
      doc.text(`For   ${(company?.companyName || "").toUpperCase()}`, PW - MR, y + 3, { align: "right" }); y += 10;
      doc.text("Authority Signature", PW - MR, y, { align: "right" });

      // ══════════════════════════════════════════════════════════
      // PAGE 6 – NOMINATION FORM (Factories Act 1950 – Rule 93)
      // ══════════════════════════════════════════════════════════
      doc.addPage(); y = 25;
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("NOMINATION FORM", PW / 2, y, { align: "center" }); y += 6;
      doc.setFontSize(10);
      doc.text("UNDER RULE 93 OF FACTORIES ACT, 1950", PW / 2, y, { align: "center" }); y += 18;

      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text("I hereby declare that in the event of death before resuming work the", ML, y); y += 6;
      doc.text("balance of my pay due for the period of leave with wages not availed of shall be paid to :", ML, y); y += 12;
      doc.text("Shri/Smt/Km :", ML + 10, y);
      doc.setFont("helvetica", "bold"); doc.text(e.fatherHusbandName || "____________________", ML + 38, y);
      doc.setFont("helvetica", "normal"); y += 8;
      doc.text("who is my :", ML + 10, y);
      doc.setLineWidth(0.2); doc.line(ML + 32, y + 1, ML + 90, y + 1); y += 18;

      doc.text("Signature of worker", PW - MR, y, { align: "right" }); y += 12;
      doc.text("Witness :", ML, y); y += 8;
      doc.text("1.", ML + 8, y); doc.text(`Name      ${empName}`, PW / 2 + 10, y); y += 7;
      doc.text("2.", ML + 8, y); doc.text(`Date      ${doj}`, PW / 2 + 10, y); y += 12;
      doc.setFont("helvetica", "bold"); doc.text("Present Address :", ML, y); y += 5;
      doc.setFont("helvetica", "normal"); doc.text(e.presentAddress || "", ML + 4, y); y += 10;
      doc.setFont("helvetica", "bold"); doc.text("Permanent Home Address :", ML, y); y += 5;
      doc.setFont("helvetica", "normal"); doc.text(e.permanentAddress || "", ML + 4, y); y += 14;
      doc.setFont("helvetica", "bold"); doc.text("Employer's Stamp and Signature", ML, y);

      // ══════════════════════════════════════════════════════════
      // PAGE 7 – FORM 'F' (Payment of Gratuity Nomination)
      // ══════════════════════════════════════════════════════════
      doc.addPage(); y = 15;
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("FORM 'F'", PW / 2, y, { align: "center" }); y += 5;
      doc.setFontSize(11);
      doc.text("PAYMENT OF GRATUITY", PW / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text("(See sub-rule (1) of Rule 5)", PW / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text("NOMINATION", PW / 2, y, { align: "center" }); y += 9;

      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text("To,", ML, y); y += 5;
      doc.text(`${(company?.companyName || "").toUpperCase()}`, ML + 4, y); y += 5;
      if (regAddr) { doc.text(regAddr.toUpperCase(), ML + 4, y); y += 5; }
      doc.setFontSize(8.5); doc.text("(Give here name & description of the establishment with full address)", ML + 4, y); y += 8;

      doc.setFontSize(10);
      doc.text(`1.   Shri/Smt : ${empName}`, ML, y);
      doc.setFontSize(8.5); doc.text("(Name in full here)", ML + 130, y); y += 6;

      const fFormText = [
        "Whose particulars are given in the statement below hereby nominate the person(s) mentioned below to receive the gratuity payable after my death as also the gratuity standing to my credit in the event of my death before the month has become payable and direct that the said amount of gratuity shall be paid in proportion directed against the names of the nominees.",
        "2. I hereby certify the persons mentioned is/are a member of my family within the meaning of clause (h) of section 2 of the Payment of Gratuity Act, 1972.",
        "3. I hereby declare that I have no family within meaning of clause (h) of section (2) of said Act.",
        "4. (a) My father/mother/parents is/are not dependent on me.\n   (b) My husband's/father/mother/parents is/are not dependent on my husband.",
        "5. I have excluded from my family by a notice dated ................................ to the controlling authority in terms of the provision to clause (h) of section 2 of the said Act.",
        "6. Nomination made herein invalidates my previous nomination.",
      ];
      doc.setFontSize(8.5);
      fFormText.forEach(t => {
        const lines = doc.splitTextToSize(t, UW);
        doc.text(lines, ML, y); y += lines.length * 5 + 3;
      });
      y += 3;

      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text("NOMINEE'S", PW / 2, y, { align: "center" }); y += 5;
      autoTable(doc, {
        head: [["Name in full with full address of nominee", "Relationship with the employee", "Age of nominee", "Proportion by which the gratuity will be shared"]],
        body: [
          [`1.  ${e.fatherHusbandName || ""}\n${e.permanentAddress || ""}`, "FATHER", "", "100 %"],
          ["2.", "", "", ""], ["3.", "", "", ""], ["4.", "", "", ""],
        ],
        startY: y,
        styles: { fontSize: 8, cellPadding: 3, lineColor: [0,0,0], lineWidth: 0.2 },
        headStyles: { fillColor: [225,225,225], textColor: [0,0,0], fontStyle: "bold", fontSize: 8, lineColor: [0,0,0], halign: "center" },
        columnStyles: { 0:{cellWidth:55}, 1:{cellWidth:35}, 2:{cellWidth:25}, 3:{cellWidth:55} },
        margin: { left: ML },
      });
      y = (doc as any).lastAutoTable.finalY + 7;
      if (y > 240) { doc.addPage(); y = 15; }

      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
      doc.text("Statement", ML, y); y += 5;
      const stmtData: [string, string][] = [
        ["1. Name of the employee in full", empName],
        ["2. Sex", e.gender || ""],
        ["3. Religion", "Hindu"],
        ["4. Whether unmarried/married/widow/widower", "Married"],
        ["5. Department/Branch/Section where employed", e.department || ""],
        ["6. Post held with Ticket No. or serial no if any", e.designation || ""],
        ["7. Date of appointment", doj],
        ["8. Permanent Address", e.permanentAddress || ""],
      ];
      autoTable(doc, {
        body: stmtData,
        startY: y,
        styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [0,0,0], lineWidth: 0.2 },
        columnStyles: { 0:{fontStyle:"bold", cellWidth:75, fillColor:[248,248,248]}, 1:{cellWidth:95} },
        margin: { left: ML },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
      if (y > 265) { doc.addPage(); y = 15; }
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(`Place : ${cityStr}`, ML, y);
      doc.text("Signature/Thumb impression of the employee : ___________________", PW - MR, y, { align: "right" }); y += 6;
      doc.text(`Date : ${doj}`, ML, y); y += 10;
      doc.text("Declaration by witness : Nomination signed/thumb impressed before me", ML, y); y += 6;
      doc.text("Name in full & address :", ML, y); doc.text("Signature of witness :", ML + 100, y); y += 10;
      doc.text(`Place : ${cityStr}`, ML, y); y += 5;
      doc.text(`Date : ${doj}`, ML, y); y += 8;
      doc.setFont("helvetica", "bold");
      doc.text("Certificate by the employer:", ML, y); y += 5;
      doc.setFont("helvetica", "normal");
      doc.text("Certificate that the particulars of the above nomination have been verified and recorded in this establishment.", ML, y, { maxWidth: UW }); y += 6;
      doc.text(`Date :`, ML, y);
      doc.text("Signature of the employer/officer authorised", PW - MR, y, { align: "right" }); y += 5;
      doc.text(`Name & address of the establishment: ${(company?.companyName || "").toUpperCase()}`, ML, y); y += 4;
      if (regAddr) { doc.text(regAddr.toUpperCase(), ML + 4, y); }

      // ══════════════════════════════════════════════════════════
      // PAGE 8 – NEW FORM NO. 11 (EPF Declaration Form)
      // ══════════════════════════════════════════════════════════
      doc.addPage(); y = 12;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("New Form No. 11 — Declaration Form", PW / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text("(To be retained by the Employer for future reference)", PW / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "bold");
      doc.text("The Employees' Provident Fund Organisation", PW / 2, y, { align: "center" }); y += 4;
      doc.setFont("helvetica", "normal");
      doc.text("The Employees' Provident Funds Scheme, 1952 (Paragraph 34 & 57)", PW / 2, y, { align: "center" }); y += 4;
      doc.text("The Employees' Pension Scheme, 1995 (Paragraph 24)", PW / 2, y, { align: "center" }); y += 4;
      const form11Intro = "Declaration by a person taking up employment in an establishment in which the E.P.F. Scheme, 1952 AND/OR E.P.S, 1995 is applicable.";
      doc.text(doc.splitTextToSize(form11Intro, UW), PW / 2, y, { align: "center" }); y += 10;

      const form11Rows: [string, string][] = [
        ["1   Name of the member", empName],
        ["2   Father's name / Spouse's name\n    (Please tick whichever is applicable)", e.fatherHusbandName || ""],
        ["3   Date of Birth (DD/MM/YYYY)", e.dateOfBirth ? format(new Date(e.dateOfBirth + "T00:00:00"), "dd/MM/yyyy") : ""],
        ["4   Gender (Male/Female/Transgender)", e.gender || ""],
        ["5   Marital Status (Married/Unmarried/Widow/Widower/Divorcee)", "Married"],
        ["6   (a) Email ID", e.officialEmail || ""],
        ["    (b) Mobile No", e.mobileNumber || ""],
        ["7   Whether earlier a member of Employee's Provident Fund Scheme 1952", e.uan ? "Yes" : "No"],
        ["8   Whether earlier a member of Employee's Pension Scheme 1995", e.uan ? "Yes" : "No"],
        ["9   (a) Universal Account Number (UAN)", e.uan || ""],
        ["    (b) Previous PF Account Number", ""],
        ["    (c) Date of exit from previous employment (DD/MM/YYYY)", ""],
        ["    (d) Scheme Certificate No. (if issued)", ""],
        ["    (e) Pension Payment Order (PPO) No. (if issued)", ""],
        ["10  (a) International Worker", "No"],
        ["    (b) Country of origin", "India"],
        ["    (c) Passport No.", ""],
        ["    (d) Validity of passport", ""],
        ["11  (a) Bank Account No. & IFS Code", `${e.bankAccount || ""}   ${e.ifsc || ""}`],
        ["    (b) Aadhaar Number", e.aadhaar || ""],
        ["    (c) Permanent Account Number (PAN), if available", e.pan || ""],
      ];
      autoTable(doc, {
        body: form11Rows,
        startY: y,
        styles: { fontSize: 8, cellPadding: 2, lineColor: [0,0,0], lineWidth: 0.2 },
        columnStyles: { 0:{fontStyle:"bold", cellWidth:90, fillColor:[248,248,248]}, 1:{cellWidth:80} },
        margin: { left: ML },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
      if (y > 230) { doc.addPage(); y = 15; }

      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text("UNDERTAKING", ML, y); y += 5;
      const undertakingItems = [
        "1) Certified that the particulars are true to the best of my knowledge.",
        "2) I authorize EPFO to use my Aadhaar for verification/authentication/eKYC purpose for service delivery.",
        "3) Kindly transfer the funds and service details, if applicable from the previous PF account as declared above to the present P.F. Account. (The transfer would be possible only if the identified KYC details approved by previous employer has been verified by present employer using his Digital Signature Certificate.)",
        "4) In case of changes in above details, the same will be intimated to employer at the earliest.",
      ];
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      undertakingItems.forEach(u => {
        const lines = doc.splitTextToSize(u, UW);
        doc.text(lines, ML, y); y += lines.length * 5 + 2;
      });
      y += 4;
      if (y > 255) { doc.addPage(); y = 15; }
      doc.text(`Date : ${doj}`, ML, y);
      doc.text("Signature of Member : ___________________", PW - MR, y, { align: "right" }); y += 6;
      doc.text(`Place : ${cityStr}`, ML, y); y += 10;

      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text("DECLARATION BY THE PRESENT EMPLOYER", ML, y); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(`A   THE MEMBER MR./MS/MRS. ${empName} AND HAS BEEN ALLOTTED PF MEMBER ID __________________ HAS JOINED ON ${doj}`, ML, y, { maxWidth: UW }); y += 8;
      doc.text("B   IN CASE THE PERSON WAS EARLIER NOT A MEMBER OF EPF SCHEME, 1952 AND EPS 1995", ML, y); y += 5;
      doc.text("    (POST ALLOTMENT OF UAN) THE UAN ALLOTTED FOR MEMBER IS : __________________", ML, y); y += 5;
      doc.text("    (PLEASE TICK THE APPROPRIATE OPTION)", ML, y); y += 5;
      doc.text("    [ ] THE KYC DETAILS OF THE ABOVE MEMBER IN UAN DATABASE HAVE NOT BEEN UPLOADED", ML, y); y += 5;
      doc.text("    [ ] HAVE BEEN UPLOADED BUT NOT APPROVED", ML, y); y += 5;
      doc.text("    [ ] HAVE BEEN UPLOADED AND APPROVED WITH DSC", ML, y); y += 5;
      doc.text("C   IN CASE THE PERSON WAS EARLIER A MEMBER OF EPF SCHEME, 1952 AND EPS 1995", ML, y); y += 5;
      doc.text("    THE ABOVE MEMBER ID HAS BEEN TAGGED WITH HIS/HER PREVIOUS MEMBER ID AS DECLARED BY MEMBER", ML, y, { maxWidth: UW }); y += 8;
      if (y > 255) { doc.addPage(); y = 15; }
      doc.text(`DATE ${doj}`, ML, y);
      doc.text("SIGNATURE OF EMPLOYER WITH ESTABLISHMENT SEAL", PW - MR, y, { align: "right" });

      // ══════════════════════════════════════════════════════════
      // PAGE 9 – DUTY JOINING APPLICATION
      // ══════════════════════════════════════════════════════════
      doc.addPage(); y = 20;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text("Sewa mein,", ML, y); doc.text(doj, PW - MR, y, { align: "right" }); y += 6;
      doc.text("Prabandak (Karmik evam Prashasan),", ML, y); y += 5;
      doc.text((company?.companyName || "").toUpperCase(), ML, y); y += 5;
      if (regAddr) { doc.text(regAddr.toUpperCase(), ML, y); y += 5; }
      y += 5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text(e.employeeCode || "", PW - MR, y - 15, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);

      const dutyText = [
        `Main ${empName} putra/putri/patni ${e.fatherHusbandName || "___________"} mool nivaasi ${e.permanentAddress || "___________"} Maanvar se nivedan karta/karti hun ki aap mujhe apni company mein aaj dinank ${doj} ko purvaahn/aparahn 09:30 baje duty join karne ki anumati pradan karein.`,
      ];
      dutyText.forEach(t => {
        const lines = doc.splitTextToSize(t, UW);
        doc.text(lines, ML, y); y += lines.length * 6 + 4;
      });
      y += 8;
      doc.text("Dhanyavaad", ML, y); y += 16;
      doc.setFont("helvetica", "bold"); doc.text("Asthayi Pata :", ML, y);
      doc.text("Sthayi Pata :", ML + 98, y); y += 5;
      doc.setFont("helvetica", "normal");
      const pAddrLines = doc.splitTextToSize(e.presentAddress || "", 80);
      const perAddrLines = doc.splitTextToSize(e.permanentAddress || "", 80);
      doc.text(pAddrLines, ML, y); doc.text(perAddrLines, ML + 98, y);

      // ══════════════════════════════════════════════════════════
      // PAGE 10 – INDUCTION FORM
      // ══════════════════════════════════════════════════════════
      doc.addPage(); y = 15;
      y = companyHeader(doc, company, y); y += 4;
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("Induction", PW / 2, y, { align: "center" }); y += 8;

      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text(`Paycode:- ${e.employeeCode || ""}`, ML, y);
      doc.text(`Name:- ${empName}`, ML + 60, y); y += 9;

      const inductionPts = [
        "Aapko muhaiya karaya gaya rozgaar poornatah aapki marzi ke anusaar hai. Hamare yahan kam se kam 18 varsh se adhik aayu vale vyakti ko rozgaar diya jaata hai.",
        "Aapko chah mahine ki parekh avadhi par rakha jaayega. Is avadhi mein prabandhan aapke kaam-kaaj ka jayza lega. Yadi aapka kaam-kaaj company ki ummidon par khara hai to aapko sthayi kiya ja sakta hai aur agar sudhar ki zaroorat hai to sudhar ke liye teen mahine ka samay diya ja sakta hai.",
        "Aapko vetan kanoon tatha rajya mein laagu samay par badalte rahane wale kanunon ke anusaar vetan diya jaayega.",
        "Agar aapka vetan 21,000/- rupaye prati mah tak hai to aapko arjit vetan ka 0.75% E.S.I. kata jaayega aur 3.25% prabandhan dwara jama karaya jaayega.",
        "Yadi aapka mul vetan 15,000/- rupaye tak hai to aapki arjit mul vetan ka 12% Provident Fund (PF) kata jaayega aur 12% prabandhan dwara jama karaya jaayega.",
        "Aapko har 20 din ke kaam ke badle ek din ka arjit avakash paane ka haq hoga barshart 240 din kaam kiya ho. Arjit avakash par hone ke dauran madhya ya pahle ya baad mein padne wale avakash/ravivar ko arjit avakash mein nahi gina jaayega. Aap adhiktam 45 din ka arjit avakash jama rakh sakte hain.",
        "Aapko pratiyarsh 7 din ka aakashmik avakash diya jaayega yaani aap pratyek 40 din ke baad ek din ka aakashmik avakash le sakte hain.",
        "Yadi aap E.S.I. ke antargat nahi aate hain to aapko pratyek varsh 7 din ka rugnavakash yaani pratyek 40 din ke baad ek din ka rugnavakash le sakte hain.",
        "Yadi aap stri hain aur kam se kam 80 din karya kiya hai to chah saptah ka matritva avakash diya jaayega.",
        "Aapko sal mein 10 vaitanik avakash diye ja'enge, jisme 3 rashtriya avakash, 7 tyohar avakash shamil hain.",
        "Aapke karya ki avadhi 09:30 baje se 18:00 baje hogi, jisme 30 minute khaan-paan aur 15 minute chai ka samay shamil hai.",
        "Aap kisi bhi din adhiktam 2 ghante ya saptah mein 12 ghante ya 3 mahine mein 50 ghante ka overtime apni sahimati ke saath kar sakte hain, jiske liye aapko aapke vetan ka 200% vetan diya jaayega.",
        "Yadi aapne company mein parekh avadhi poori kar li hai to aap ek mahine ka samay dekar ya ek mahine ka vetan uski jagah dekar company se tyagpatra de sakte hain. Company bhi is tarah aapko karya chhodne ke liye keh sakti hai.",
        "Aapki aayu 58 varsh hone par aap seva nivrit ho jaayenge.",
        "Factory mein aakashmik nikas peeli patti aur agni shaman lagaaye gaye hain jinaka prayog bataye gaye tarikon se karna hai aur fire mein prashikshit vyaktiyon ke photo-graph pratyek floor par lagaaye gaye hain.",
        "Agar aapko kuch bhi jaankari leni hai to aap prashasnik vibhag mein mil sakte hain.",
        "Agar aapko kisi bhi prakar ki shikaayat hai to aap karya samiti ke chune gaye sadasyon ke dwara apni shikaayat prabandhan tak pahuncha sakte hain.",
        "Aapko apna pahechan patra jo kisi bhi sarkari vibhag dwara jaari kiya gaya ho uski chhaaya pratilhipi deni hogi.",
        "Company dwara diya gaya pahechan patra company mein ghusane se lekar nikalane tak pahan kar rakhna hoga.",
        "Aapki prishth bhoomi ke liye prabandhan dwara pulis satyapan karaya ja sakta hai.",
        "Important Telephone No: Jaankari telephone no. gate par lage hain.",
        "Threat Awareness: Dhamkiyon se satarkta ke liye samay samay par di gayi prashikshan mein bataye gaye upaayon par dhyan den.",
      ];
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      inductionPts.forEach((pt, i) => {
        if (y > 270) { doc.addPage(); y = 15; }
        const lines = doc.splitTextToSize(`${i + 1}. ${pt}`, UW);
        doc.text(lines, ML, y); y += lines.length * 5 + 2;
      });
    });

    const label = targetEmps.length === 1 ? targetEmps[0].employeeCode : "All";
    doc.save(`Employee_Personal_File_${label}.pdf`);
    toast({ title: "Downloaded", description: `Employee Personal File downloaded successfully.` });
  };

  const viewEmployeePersonalFile = () => {
    const emp = docEmployee ? employees.find(e => e.id === docEmployee) : null;
    const targetEmps = emp ? [emp] : filteredEmployees;
    if (!targetEmps.length) { toast({ title: "No Data", description: "No employee selected or found.", variant: "destructive" }); return; }
    const headers = ["Field", "Value"];
    const e = targetEmps[0];
    const rows: (string | number)[][] = [
      ["Emp Code", e.employeeCode],
      ["Name", `${e.firstName} ${e.lastName}`],
      ["Gender", e.gender || "N/A"],
      ["Date of Birth", e.dateOfBirth || "N/A"],
      ["Date of Joining", e.dateOfJoining || "N/A"],
      ["Department", e.department || "N/A"],
      ["Designation", e.designation || "N/A"],
      ["Mobile", e.mobileNumber || "N/A"],
      ["PAN", e.pan || "N/A"],
      ["Aadhaar", e.aadhaar || "N/A"],
      ["Bank Account", e.bankAccount || "N/A"],
      ["UAN", e.uan || "N/A"],
      ["ESIC No.", e.esiNumber || "N/A"],
      ["Company", getCompanyName(e.companyId)],
    ];
    openViewDialog(`Employee Personal File – ${e.firstName} ${e.lastName}`, headers, rows);
  };

  // ─── Employee Leave Register ──────────────────────────────────────────────
  const buildLeaveRegisterRows = () => {
    const yearStart = periodStartDate;
    const yearEnd   = periodEndDate;
    const targetEmps = docEmployee ? employees.filter(e => e.id === docEmployee) : filteredEmployees;
    const rows: { code: string; name: string; dept: string; company: string; leaveType: string; opens: number; earned: number; availed: number; balance: number }[] = [];
    for (const emp of targetEmps) {
      const empLeaves = leaveRequests.filter(lr =>
        lr.employeeId === emp.id &&
        lr.status === "approved" &&
        lr.startDate >= yearStart && lr.startDate <= yearEnd
      );
      const byType: Record<string, number> = {};
      for (const lr of empLeaves) {
        const start = new Date(lr.startDate);
        const end   = new Date(lr.endDate);
        const days  = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
        byType[(lr as any).leaveType || "Other"] = (byType[(lr as any).leaveType || "Other"] || 0) + days;
      }
      if (Object.keys(byType).length === 0) {
        rows.push({ code: emp.employeeCode, name: `${emp.firstName} ${emp.lastName}`, dept: emp.department || "", company: getCompanyName(emp.companyId), leaveType: "—", opens: 0, earned: 0, availed: 0, balance: 0 });
      } else {
        for (const [lt, availed] of Object.entries(byType)) {
          rows.push({ code: emp.employeeCode, name: `${emp.firstName} ${emp.lastName}`, dept: emp.department || "", company: getCompanyName(emp.companyId), leaveType: lt, opens: 0, earned: availed, availed, balance: 0 });
        }
      }
    }
    return rows;
  };

  const generateEmployeeLeaveRegister = (fileType: "excel" | "pdf") => {
    const rows = buildLeaveRegisterRows();
    if (!rows.length) { toast({ title: "No Data", description: "No approved leave records found.", variant: "destructive" }); return; }
    if (fileType === "excel") {
      const data = rows.map(r => ({
        "Emp Code": r.code, "Name": r.name, "Department": r.dept, "Company": r.company,
        "Leave Type": r.leaveType, "Availed (Days)": r.availed,
      }));
      downloadExcel(data, `Leave_Register_${periodLabel}`, "Leave Register");
    } else {
      const headers = ["Code", "Name", "Dept", "Company", "Leave Type", "Availed (Days)"];
      const pdfRows = rows.map(r => [r.code, r.name, r.dept, r.company, r.leaveType, r.availed] as (string | number)[]);
      downloadPDF(`Employee Leave Register - ${periodLabel}`, headers, pdfRows, `Leave_Register_${periodLabel}`);
    }
  };

  const viewEmployeeLeaveRegister = () => {
    const rows = buildLeaveRegisterRows();
    if (!rows.length) { toast({ title: "No Data", description: "No approved leave records found.", variant: "destructive" }); return; }
    const headers = ["Code", "Name", "Dept", "Company", "Leave Type", "Availed (Days)"];
    openViewDialog(`Employee Leave Register - ${periodLabel}`, headers, rows.map(r => [r.code, r.name, r.dept, r.company, r.leaveType, r.availed]));
  };

  // ─── Offer Letter ─────────────────────────────────────────────────────────
  const generateOfferLetter = (_fileType: "excel" | "pdf") => {
    const emp = employees.find(e => e.id === docEmployee);
    if (!emp) { toast({ title: "Select Employee", description: "Please select an employee first.", variant: "destructive" }); return; }
    const company = companies.find(c => c.id === emp.companyId);
    const ss = salaryStructures.find(s => s.employeeId === emp.id);
    const doc = new jsPDF();
    const todayDate = format(new Date(), "dd MMMM yyyy");
    // Header
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(company?.companyName || "Company Name", 105, 18, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(company?.registeredAddress || "", 105, 24, { align: "center" });
    doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.5);
    doc.line(14, 28, 196, 28);
    // Title
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("OFFER LETTER", 105, 38, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Date: ${todayDate}`, 14, 48);
    doc.text(`Ref No.: OL/${emp.employeeCode}/${format(new Date(), "yyyy")}`, 14, 54);
    // Salutation
    doc.setFontSize(10);
    doc.text(`Dear ${emp.firstName} ${emp.lastName},`, 14, 66);
    // Body
    const body = [
      `We are pleased to offer you the position of ${emp.designation || "Employee"} in the ${emp.department || ""}`,
      `department at ${company?.companyName || "our company"}, effective from ${emp.dateOfJoining || todayDate}.`,
      "",
      `Your compensation package is as follows:`,
    ];
    let y = 74;
    for (const line of body) {
      doc.text(line, 14, y); y += 6;
    }
    // CTC Table
    if (ss) {
      const ctcRows: [string, string][] = [
        ["Basic Salary", `₹ ${ss.basicSalary.toLocaleString("en-IN")} / month`],
        ["HRA", `₹ ${(ss.hra || 0).toLocaleString("en-IN")} / month`],
        ["Conveyance", `₹ ${(ss.conveyance || 0).toLocaleString("en-IN")} / month`],
        ["Special Allowance", `₹ ${(ss.specialAllowance || 0).toLocaleString("en-IN")} / month`],
        ["Other Allowances", `₹ ${(ss.otherAllowances || 0).toLocaleString("en-IN")} / month`],
        ["Gross Salary", `₹ ${ss.grossSalary.toLocaleString("en-IN")} / month`],
        ["Annual CTC", `₹ ${(ss.grossSalary * 12).toLocaleString("en-IN")} / year`],
      ];
      autoTable(doc, {
        body: ctcRows,
        startY: y + 2,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: "bold", fillColor: [240, 244, 255], cellWidth: 70 }, 1: { cellWidth: 80 } },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }
    // Conditions
    const conditions = [
      "This offer is subject to satisfactory background verification and document submission.",
      "Please confirm your acceptance by signing and returning a copy of this letter.",
      "We look forward to welcoming you to our team.",
    ];
    for (const line of conditions) {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.text(line, 14, y); y += 7;
    }
    y += 8;
    doc.text("Yours sincerely,", 14, y); y += 12;
    doc.text("Authorized Signatory", 14, y); y += 6;
    doc.text(company?.companyName || "", 14, y);
    doc.save(`Offer_Letter_${emp.employeeCode}.pdf`);
    toast({ title: "Downloaded", description: `Offer_Letter_${emp.employeeCode}.pdf has been downloaded.` });
  };

  // ─── Appointment Letter ───────────────────────────────────────────────────
  const generateAppointmentLetter = (_fileType: "excel" | "pdf") => {
    const emp = employees.find(e => e.id === docEmployee);
    if (!emp) { toast({ title: "Select Employee", description: "Please select an employee first.", variant: "destructive" }); return; }
    const company = companies.find(c => c.id === emp.companyId);
    const ss = salaryStructures.find(s => s.employeeId === emp.id);
    const doc = new jsPDF();
    const todayDate = format(new Date(), "dd MMMM yyyy");
    // Header
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(company?.companyName || "Company Name", 105, 18, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(company?.registeredAddress || "", 105, 24, { align: "center" });
    doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.5);
    doc.line(14, 28, 196, 28);
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("APPOINTMENT LETTER", 105, 38, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Date: ${todayDate}`, 14, 48);
    doc.text(`Ref No.: AL/${emp.employeeCode}/${format(new Date(), "yyyy")}`, 14, 54);
    doc.setFontSize(10);
    doc.text(`To,`, 14, 64);
    doc.text(`${emp.firstName} ${emp.lastName}`, 14, 70);
    doc.text(emp.presentAddress || emp.address || "", 14, 76);
    let y = 88;
    doc.text(`Sub: Appointment as ${emp.designation || "Employee"}`, 14, y); y += 10;
    doc.text(`Dear ${emp.firstName},`, 14, y); y += 8;
    const paras = [
      `With reference to your application and the subsequent discussions, we are pleased to appoint you as`,
      `${emp.designation || "Employee"} in the ${emp.department || ""} department of ${company?.companyName || "our organisation"},`,
      `with effect from ${emp.dateOfJoining || todayDate}. The terms and conditions of your appointment are as under:`,
    ];
    for (const p of paras) { doc.text(p, 14, y); y += 6; }
    y += 4;
    const clauses: [string, string][] = [
      ["1. Designation", emp.designation || ""],
      ["2. Department", emp.department || ""],
      ["3. Date of Joining", emp.dateOfJoining || ""],
      ["4. Employment Type", emp.employmentType || "Permanent"],
      ["5. Location", emp.location || ""],
      ["6. Gross Salary", ss ? `₹ ${ss.grossSalary.toLocaleString("en-IN")} per month` : "As per offer letter"],
      ["7. Annual CTC", ss ? `₹ ${(ss.grossSalary * 12).toLocaleString("en-IN")} per annum` : "As per offer letter"],
      ["8. PF Applicable", emp.pfApplicable ? "Yes" : "No"],
      ["9. ESI Applicable", emp.esiApplicable ? "Yes" : "No"],
    ];
    autoTable(doc, {
      body: clauses,
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { fontStyle: "bold", fillColor: [240, 244, 255], cellWidth: 65 }, 1: { cellWidth: 105 } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
    const footer = [
      "This appointment is subject to your maintaining satisfactory performance and conduct.",
      "You will be governed by the service rules and policies of the organisation as applicable.",
      "Kindly sign and return a duplicate copy of this letter as your acceptance.",
    ];
    for (const f of footer) { if (y > 260) { doc.addPage(); y = 20; } doc.text(f, 14, y); y += 7; }
    y += 10;
    doc.text("For " + (company?.companyName || ""), 14, y); y += 14;
    doc.text("Authorized Signatory", 14, y); y += 6;
    doc.text("(HR Department)", 14, y); y += 16;
    doc.text(`Employee Acceptance:`, 14, y); y += 8;
    doc.text(`I accept the above terms and conditions of appointment.`, 14, y); y += 12;
    doc.text(`Signature: ___________________    Date: ___________________`, 14, y);
    doc.save(`Appointment_Letter_${emp.employeeCode}.pdf`);
    toast({ title: "Downloaded", description: `Appointment_Letter_${emp.employeeCode}.pdf has been downloaded.` });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Individual Attendance Sheet
  // ─────────────────────────────────────────────────────────────────────────
  const generateIndividualAttendanceSheet = (_fileType: "excel" | "pdf") => {
    const empsToRun = docEmployee
      ? filteredEmployees.filter(e => e.id === docEmployee)
      : filteredEmployees;
    if (empsToRun.length === 0) {
      toast({ title: "No Data", description: "Select an employee or ensure employees exist for the selected company.", variant: "destructive" });
      return;
    }

    const tToMins = (t: string): number => {
      const p = (t || "00:00").split(":").map(Number);
      return (p[0] || 0) * 60 + (p[1] || 0);
    };
    const minsToHHMM = (m: number): string => {
      const h = Math.floor(Math.abs(m) / 60);
      const mn = Math.abs(m) % 60;
      return `${String(h).padStart(2, "0")}.${String(mn).padStart(2, "0")}`;
    };
    const fmtT = (t: string): string => {
      if (!t) return "";
      const [hh, mm] = t.split(":").map(Number);
      return `${String(hh).padStart(2, "0")}.${String(mm || 0).padStart(2, "0")}`;
    };

    const getPolicy = (emp: Employee) => {
      const pol = emp.timeOfficePolicyId ? timeOfficePolicies.find(p => p.id === emp.timeOfficePolicyId) : null;
      const cp = timeOfficePolicies.filter(p => p.companyId === emp.companyId);
      return pol || cp.find(p => p.isDefault && p.status === "active") || cp.find(p => p.status === "active");
    };

    const getStatusCode = (rec: Attendance | undefined, emp: Employee, dateStr: string): string => {
      if (!rec) {
        const s = getDayStatus(dateStr, emp);
        if (s === "WO") return "OFF";
        if (s === "H") return "HOL";
        if (s === "L") return "EL";
        return "A-A";
      }
      if (rec.status === "present") return "P-P";
      if (rec.status === "absent") return "A-A";
      if (rec.status === "weekend") return "OFF";
      if (rec.status === "holiday") return "HOL";
      if (rec.status === "on_leave") return rec.leaveTypeCode || "EL";
      if (rec.status === "half_day") return "P-A";
      return rec.status.toUpperCase();
    };

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const PW = 297, PH = 210, ML = 8, MR = 8;
    const company = companies.find(co => co.id === (effectiveCompany || empsToRun[0]?.companyId));
    const companyName = (company?.companyName || "Company").toUpperCase();
    const companyAddr = ((company as any)?.registeredAddress || "").toUpperCase();
    const periodLabel = `01 ${monthName.toUpperCase()} ${yearNum}  TO  ${daysInMonth} ${monthName.toUpperCase()} ${yearNum}`;

    let isFirst = true;

    for (const emp of empsToRun) {
      if (!isFirst) doc.addPage();
      isFirst = false;

      const policy = getPolicy(emp);
      const dutyStart = policy?.dutyStartTime || "09:30";
      const dutyEnd = policy?.dutyEndTime || "18:00";
      const shiftLabel = policy?.policyName?.toUpperCase() || "GENERAL";
      const shiftCode = shiftLabel.charAt(0);
      const dutyStartMins = tToMins(dutyStart);
      const dutyEndMins = tToMins(dutyEnd);
      const empName = `${emp.firstName} ${emp.lastName}`.toUpperCase();
      const designation = (emp.designation || "").toUpperCase();
      const department = (emp.department || "").toUpperCase();
      const designDept = [designation, department].filter(Boolean).join(" / ");
      const dojStr = emp.dateOfJoining ? format(new Date(emp.dateOfJoining + "T00:00:00"), "dd-MM-yyyy") : "";

      // ── HEADER ──────────────────────────────────────────────────
      let y = 9;
      doc.setFillColor(30, 58, 138);
      doc.rect(ML, y - 1, PW - ML - MR, 12, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(companyName, PW / 2, y + 5, { align: "center" }); y += 13;
      doc.setTextColor(0, 0, 0);

      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      if (companyAddr) { doc.text(companyAddr, PW / 2, y, { align: "center" }); y += 4; }

      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text("INDIVIDUAL ATTENDANCE SHEET", PW / 2, y, { align: "center" }); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(`Period : ${periodLabel}`, PW / 2, y, { align: "center" }); y += 3;
      doc.setDrawColor(30, 58, 138); doc.setLineWidth(0.5);
      doc.line(ML, y, PW - MR, y); y += 2;

      // ── EMPLOYEE INFO BLOCK ─────────────────────────────────────
      const infoLabelFill = [219, 234, 254] as [number, number, number];
      autoTable(doc, {
        body: [
          [
            { content: "Paycode", styles: { fontStyle: "bold" as const, fillColor: infoLabelFill } },
            { content: emp.employeeCode || "" },
            { content: "Card No.", styles: { fontStyle: "bold" as const, fillColor: infoLabelFill } },
            { content: emp.employeeCode || "" },
            { content: "Employee Name", styles: { fontStyle: "bold" as const, fillColor: infoLabelFill } },
            { content: empName },
            { content: "No. of Days", styles: { fontStyle: "bold" as const, fillColor: infoLabelFill } },
            { content: String(daysInMonth) },
          ],
          [
            { content: "Designation", styles: { fontStyle: "bold" as const, fillColor: infoLabelFill } },
            { content: designation },
            { content: "Department", styles: { fontStyle: "bold" as const, fillColor: infoLabelFill } },
            { content: department },
            { content: "Shift", styles: { fontStyle: "bold" as const, fillColor: infoLabelFill } },
            { content: `${shiftLabel}  (${dutyStart} – ${dutyEnd})` },
            { content: "Date of Joining", styles: { fontStyle: "bold" as const, fillColor: infoLabelFill } },
            { content: dojStr },
          ],
        ],
        startY: y,
        styles: { fontSize: 8, cellPadding: 2.2, lineColor: [30, 58, 138], lineWidth: 0.2, valign: "middle" },
        columnStyles: {
          0: { cellWidth: 22 }, 1: { cellWidth: 26 },
          2: { cellWidth: 18 }, 3: { cellWidth: 26 },
          4: { cellWidth: 26 }, 5: { cellWidth: 70 },
          6: { cellWidth: 24 }, 7: { cellWidth: 62 },
        },
        margin: { left: ML, right: MR },
        theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 1;

      // ── BUILD DAILY DATA ─────────────────────────────────────────
      let presentCount = 0, offCount = 0, holidayCount = 0, leaveCount = 0, tourCount = 0, absentCount = 0;
      let totalWorkMins = 0, totalOTMins = 0;
      let totArrE = 0, totArrL = 0, totDepE = 0, totDepL = 0;
      interface DayRow { date: string; day: string; shift: string; inT: string; outT: string; arrE: string; arrL: string; depE: string; depL: string; wh: string; ot: string; status: string; remark: string; }
      const dailyRows: DayRow[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
        const dateObj = new Date(dateStr + "T00:00:00");
        const dayAbbr = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][dateObj.getDay()];
        const rec = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
        const sc = getStatusCode(rec, emp, dateStr);
        let inT = "", outT = "", wh = "", ot = "";
        let arrE = "", arrL = "", depE = "", depL = "";
        if (rec && rec.status === "present" && rec.clockIn) {
          inT = fmtT(rec.clockIn);
          outT = rec.clockOut ? fmtT(rec.clockOut) : "";
          wh = rec.workHours || "";
          ot = rec.otHours && parseFloat(rec.otHours) > 0 ? rec.otHours : "";
          const ciM = tToMins(rec.clockIn);
          const coM = rec.clockOut ? tToMins(rec.clockOut) : dutyEndMins;
          const aE = Math.max(0, dutyStartMins - ciM);
          const aL = Math.max(0, ciM - dutyStartMins);
          const dE = Math.max(0, dutyEndMins - coM);
          const dL = Math.max(0, coM - dutyEndMins);
          if (aE > 0) arrE = minsToHHMM(aE);
          if (aL > 0) arrL = minsToHHMM(aL);
          if (dE > 0) depE = minsToHHMM(dE);
          if (dL > 0) depL = minsToHHMM(dL);
          totArrE += aE; totArrL += aL; totDepE += dE; totDepL += dL;
          if (rec.workHours) { const [wHh, wHm] = rec.workHours.split(".").map(Number); totalWorkMins += (wHh || 0) * 60 + (wHm || 0); }
          if (rec.otHours && parseFloat(rec.otHours) > 0) { const [oHh, oHm] = rec.otHours.split(".").map(Number); totalOTMins += (oHh || 0) * 60 + (oHm || 0); }
        }
        if (sc === "P-P" || sc === "P-A") presentCount++;
        else if (sc === "OFF") offCount++;
        else if (sc === "HOL") holidayCount++;
        else if (["EL", "CL", "SL", "PL", "ML", "LOP"].includes(sc)) leaveCount++;
        else if (sc === "TOUR" || sc === "OD") tourCount++;
        else absentCount++;
        dailyRows.push({ date: `${String(d).padStart(2, "0")}-${monthStr}-${yearStr}`, day: dayAbbr, shift: shiftCode, inT, outT, arrE, arrL, depE, depL, wh, ot, status: sc, remark: rec?.notes || "" });
      }

      const totalWorkStr = minsToHHMM(totalWorkMins);
      const totalOTStr = minsToHHMM(totalOTMins);
      const payDays = Math.min(presentCount + offCount + holidayCount + leaveCount + tourCount, daysInMonth);
      const ss = salaryStructures.find(s => s.employeeId === emp.id);
      const rate = ss?.grossSalary || emp.grossSalary || 0;

      // ── SUMMARY BAR ──────────────────────────────────────────────
      autoTable(doc, {
        head: [["Present", "Off", "Holiday", "Leave", "Tour", "Absent", "Working Hours", "Overtime Hours", "Rate (₹)", "Days Payable"]],
        body: [[
          presentCount.toFixed(2), offCount.toFixed(2), String(holidayCount),
          leaveCount.toFixed(2), String(tourCount), absentCount.toFixed(2),
          totalWorkStr, totalOTStr,
          rate > 0 ? rate.toLocaleString("en-IN") : "—", payDays.toFixed(2),
        ]],
        startY: y,
        styles: { fontSize: 8, cellPadding: 2, halign: "center" as const, lineColor: [30, 58, 138], lineWidth: 0.2, valign: "middle" },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold", fontSize: 7.5, halign: "center" as const },
        bodyStyles: { fillColor: [239, 246, 255] },
        columnStyles: {
          0: { cellWidth: 21 }, 1: { cellWidth: 18 }, 2: { cellWidth: 20 },
          3: { cellWidth: 17 }, 4: { cellWidth: 15 }, 5: { cellWidth: 21 },
          6: { cellWidth: 28 }, 7: { cellWidth: 28 }, 8: { cellWidth: 28 }, 9: { cellWidth: 28 },
        },
        margin: { left: ML, right: MR },
        theme: "grid",
      });
      y = (doc as any).lastAutoTable.finalY + 2;

      // ── DAILY DETAIL TABLE ───────────────────────────────────────
      const tableBody: any[][] = [
        ...dailyRows.map(r => [
          `${r.date}  ${r.day}`, r.shift,
          r.inT, r.outT,
          r.arrE, r.arrL, r.depE, r.depL,
          r.wh, r.ot, r.status, r.remark,
        ]),
        [
          { content: "TOTAL", styles: { fontStyle: "bold" as const, fillColor: [220, 230, 255] } },
          { content: "", styles: { fillColor: [220, 230, 255] } },
          { content: "", styles: { fillColor: [220, 230, 255] } },
          { content: "", styles: { fillColor: [220, 230, 255] } },
          { content: minsToHHMM(totArrE), styles: { fontStyle: "bold" as const, fillColor: [220, 230, 255] } },
          { content: minsToHHMM(totArrL), styles: { fontStyle: "bold" as const, fillColor: [220, 230, 255] } },
          { content: minsToHHMM(totDepE), styles: { fontStyle: "bold" as const, fillColor: [220, 230, 255] } },
          { content: minsToHHMM(totDepL), styles: { fontStyle: "bold" as const, fillColor: [220, 230, 255] } },
          { content: totalWorkStr, styles: { fontStyle: "bold" as const, fillColor: [220, 230, 255] } },
          { content: totalOTStr, styles: { fontStyle: "bold" as const, fillColor: [220, 230, 255] } },
          { content: "", styles: { fillColor: [220, 230, 255] } },
          { content: "*** End of Report ***", styles: { halign: "left" as const, fontStyle: "bold" as const, fillColor: [220, 230, 255] } },
        ],
      ];

      autoTable(doc, {
        startY: y,
        head: [
          [
            { content: "Date & Day", rowSpan: 2, styles: { valign: "middle" as const, halign: "center" as const } },
            { content: "Shift", rowSpan: 2, styles: { valign: "middle" as const, halign: "center" as const } },
            { content: "Time", colSpan: 2, styles: { halign: "center" as const } },
            { content: "Arrival Variance", colSpan: 2, styles: { halign: "center" as const } },
            { content: "Departure Variance", colSpan: 2, styles: { halign: "center" as const } },
            { content: "Work\nHours", rowSpan: 2, styles: { valign: "middle" as const, halign: "center" as const } },
            { content: "OT\nHours", rowSpan: 2, styles: { valign: "middle" as const, halign: "center" as const } },
            { content: "Status", rowSpan: 2, styles: { valign: "middle" as const, halign: "center" as const } },
            { content: "Remark", rowSpan: 2, styles: { valign: "middle" as const, halign: "center" as const } },
          ],
          [
            { content: "In", styles: { halign: "center" as const } },
            { content: "Out", styles: { halign: "center" as const } },
            { content: "Early", styles: { halign: "center" as const } },
            { content: "Late", styles: { halign: "center" as const } },
            { content: "Early", styles: { halign: "center" as const } },
            { content: "Late", styles: { halign: "center" as const } },
          ],
        ],
        body: tableBody,
        styles: { fontSize: 7, cellPadding: 1.5, lineColor: [100, 120, 180], lineWidth: 0.15, halign: "center" as const, valign: "middle" as const },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold", fontSize: 7, lineColor: [20, 40, 120], lineWidth: 0.2 },
        alternateRowStyles: { fillColor: [248, 250, 255] },
        columnStyles: {
          0: { cellWidth: 34, halign: "left" as const },
          1: { cellWidth: 10 },
          2: { cellWidth: 15 },
          3: { cellWidth: 15 },
          4: { cellWidth: 14 },
          5: { cellWidth: 14 },
          6: { cellWidth: 14 },
          7: { cellWidth: 14 },
          8: { cellWidth: 17 },
          9: { cellWidth: 15 },
          10: { cellWidth: 18, fontStyle: "bold" as const },
          11: { halign: "left" as const },
        },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 10 && data.row.index < tableBody.length - 1) {
            const s = String(data.cell.raw);
            if (s === "P-P" || s === "P-A") { data.cell.styles.textColor = [10, 130, 10]; data.cell.styles.fontStyle = "bold"; }
            else if (s === "A-A") { data.cell.styles.textColor = [200, 20, 20]; data.cell.styles.fontStyle = "bold"; }
            else if (s === "OFF") { data.cell.styles.textColor = [30, 70, 200]; data.cell.styles.fontStyle = "bold"; }
            else if (s === "HOL") { data.cell.styles.textColor = [160, 90, 0]; data.cell.styles.fontStyle = "bold"; }
            else if (s !== "") { data.cell.styles.textColor = [120, 40, 140]; data.cell.styles.fontStyle = "bold"; }
          }
          if (data.section === "body" && data.row.index < dailyRows.length) {
            const dayObj = new Date(`${yearStr}-${monthStr}-${String(data.row.index + 1).padStart(2,"0")}T00:00:00`);
            if (dayObj.getDay() === 0) data.cell.styles.fillColor = [255, 250, 235];
          }
        },
        tableLineColor: [30, 58, 138],
        tableLineWidth: 0.3,
        margin: { left: ML, right: MR },
      });

      // ── FOOTER ──────────────────────────────────────────────────
      const footerY = PH - 7;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(80, 80, 80);
      doc.text("Checked By : _______________________", ML, footerY);
      doc.text("HR Manager : _______________________", PW / 2 - 35, footerY);
      doc.text("Authorized Signatory : _______________________", PW - MR - 75, footerY);
      doc.setTextColor(0, 0, 0);
    }

    const label = empsToRun.length === 1 ? empsToRun[0].employeeCode : "All";
    doc.save(`Individual_Attendance_Sheet_${label}_${selectedMonth}.pdf`);
    toast({ title: "Downloaded", description: `Individual Attendance Sheet saved.` });
  };

  const viewIndividualAttendanceSheet = () => {
    const empsToRun = docEmployee
      ? filteredEmployees.filter(e => e.id === docEmployee)
      : filteredEmployees;
    if (empsToRun.length === 0) {
      toast({ title: "No Data", description: "No employees found.", variant: "destructive" });
      return;
    }
    const fmtT = (t: string) => (t || "").replace(":", ".");
    const headers = ["Emp Code", "Date", "Day", "Shift", "In", "Out", "Work Hrs", "OT Hrs", "Status"];
    const rows: (string | number)[][] = [];
    empsToRun.forEach(emp => {
      const pol = emp.timeOfficePolicyId ? timeOfficePolicies.find(p => p.id === emp.timeOfficePolicyId) : null;
      const cp = timeOfficePolicies.filter(p => p.companyId === emp.companyId);
      const ep = pol || cp.find(p => p.isDefault && p.status === "active") || cp.find(p => p.status === "active");
      const shiftName = ep?.policyName?.charAt(0).toUpperCase() || "G";
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
        const dateObj = new Date(dateStr + "T00:00:00");
        const dayAbbr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()];
        const rec = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
        const statusMap: Record<string, string> = { present: "P-P", absent: "A-A", weekend: "OFF", holiday: "HOL", on_leave: "EL", half_day: "P-A" };
        const sc = rec ? (statusMap[rec.status] || rec.status.toUpperCase()) : (getDayStatus(dateStr, emp) === "WO" ? "OFF" : "A-A");
        rows.push([emp.employeeCode, dateStr, dayAbbr, shiftName, rec?.clockIn ? fmtT(rec.clockIn) : "", rec?.clockOut ? fmtT(rec.clockOut) : "", rec?.workHours || "", rec?.otHours || "", sc]);
      }
    });
    openViewDialog(`Individual Attendance Sheet - ${monthName} ${yearNum}`, headers, rows);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Monthly Attendance Register (Grid)
  // ─────────────────────────────────────────────────────────────────────────
  const generateMonthlyAttendanceRegister = (_fileType: "excel" | "pdf") => {
    const emps = filteredEmployees;
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No employees found for selected filters.", variant: "destructive" });
      return;
    }

    const fmtT = (t: string): string => {
      if (!t) return "";
      const [h, m] = t.split(":").map(Number);
      return `${String(h).padStart(2, "0")}.${String(m || 0).padStart(2, "0")}`;
    };
    const minsStr = (m: number) => `${Math.floor(m / 60)}.${String(m % 60).padStart(2, "0")}`;

    const getPolicy = (emp: Employee) => {
      const pol = emp.timeOfficePolicyId ? timeOfficePolicies.find(p => p.id === emp.timeOfficePolicyId) : null;
      const cp = timeOfficePolicies.filter(p => p.companyId === emp.companyId);
      return pol || cp.find(p => p.isDefault && p.status === "active") || cp.find(p => p.status === "active");
    };

    const getStatusCode = (rec: Attendance | undefined, emp: Employee, dateStr: string): string => {
      if (!rec) {
        const s = getDayStatus(dateStr, emp);
        if (s === "WO") return "OFF";
        if (s === "H") return "HOL";
        if (s === "L") return "EL";
        return "A-A";
      }
      if (rec.status === "present") return "P-P";
      if (rec.status === "absent") return "A-A";
      if (rec.status === "weekend") return "OFF";
      if (rec.status === "holiday") return "HOL";
      if (rec.status === "on_leave") return rec.leaveTypeCode || "EL";
      if (rec.status === "half_day") return "P-A";
      return rec.status.toUpperCase();
    };

    const company = companies.find(co => co.id === (effectiveCompany || emps[0]?.companyId));
    const companyName = (company?.companyName || "Company").toUpperCase();
    const companyAddr = ((company as any)?.registeredAddress || "").toUpperCase();

    // A3 landscape
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const PW = 420, ML = 6, MR = 6;

    // ── HEADER ─────────────────────────────────────────────────────
    let y = 8;
    doc.setFillColor(30, 58, 138);
    doc.rect(ML, y - 1, PW - ML - MR, 14, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text(companyName, PW / 2, y + 5.5, { align: "center" }); y += 15;
    doc.setTextColor(0, 0, 0);

    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    if (companyAddr) { doc.text(companyAddr, PW / 2, y, { align: "center" }); y += 5; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("MONTHLY ATTENDANCE REGISTER", PW / 2, y, { align: "center" }); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(`Period : 01 ${monthName.toUpperCase()} ${yearNum}  —  ${daysInMonth} ${monthName.toUpperCase()} ${yearNum}`, PW / 2, y, { align: "center" }); y += 3;
    doc.setDrawColor(30, 58, 138); doc.setLineWidth(0.5);
    doc.line(ML, y, PW - MR, y); y += 3;

    // ── DAY COLUMN HEADERS ──────────────────────────────────────────
    const dayAbbrs = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const dObj = new Date(`${yearStr}-${monthStr}-${String(d).padStart(2, "0")}T00:00:00`);
      const abbr = dayAbbrs[dObj.getDay()];
      return `${d}\n${abbr}`;
    });

    // ── BUILD ROWS ─────────────────────────────────────────────────
    const ROWS_PER_EMP = 6;
    const HEAD_COLS = [
      "S.No",
      "Paycode\nName\nDesig.\nDept.",
      "Type",
      ...dayHeaders,
      "Summary",
    ];

    const allRows: any[][] = [];
    // Accumulate totals for a grand total row
    let grandPresent = 0, grandOff = 0, grandHol = 0, grandLeave = 0, grandTour = 0, grandAbsent = 0, grandOTMins = 0;

    emps.forEach((emp, empIdx) => {
      const policy = getPolicy(emp);
      const shiftCode = policy?.policyName?.charAt(0).toUpperCase() || "G";

      const shiftCells: string[] = [];
      const inCells: string[] = [];
      const outCells: string[] = [];
      const hrsCells: string[] = [];
      const otCells: string[] = [];
      const statusCells: string[] = [];

      let presentCount = 0, offCount = 0, holidayCount = 0, leaveCount = 0, tourCount = 0, absentCount = 0;
      let totalWorkMins = 0, totalOTMins = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
        const rec = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
        const sc = getStatusCode(rec, emp, dateStr);
        shiftCells.push(shiftCode);
        if (rec && rec.status === "present" && rec.clockIn) {
          inCells.push(fmtT(rec.clockIn));
          outCells.push(rec.clockOut ? fmtT(rec.clockOut) : "");
          hrsCells.push(rec.workHours || "");
          otCells.push(rec.otHours && parseFloat(rec.otHours) > 0 ? rec.otHours : "");
          if (rec.workHours) { const [wh, wm] = rec.workHours.split(".").map(Number); totalWorkMins += (wh || 0) * 60 + (wm || 0); }
          if (rec.otHours && parseFloat(rec.otHours) > 0) { const [oh, om] = rec.otHours.split(".").map(Number); totalOTMins += (oh || 0) * 60 + (om || 0); }
        } else { inCells.push(""); outCells.push(""); hrsCells.push(""); otCells.push(""); }
        statusCells.push(sc);
        if (sc === "P-P" || sc === "P-A") presentCount++;
        else if (sc === "OFF") offCount++;
        else if (sc === "HOL") holidayCount++;
        else if (["EL", "CL", "SL", "PL", "ML", "LOP"].includes(sc)) leaveCount++;
        else if (sc === "TOUR" || sc === "OD") tourCount++;
        else if (sc === "A-A") absentCount++;
      }

      const payDays = Math.min(presentCount + offCount + holidayCount + leaveCount + tourCount, daysInMonth);
      grandPresent += presentCount; grandOff += offCount; grandHol += holidayCount;
      grandLeave += leaveCount; grandTour += tourCount; grandAbsent += absentCount; grandOTMins += totalOTMins;

      const empFullName = `${emp.firstName} ${emp.lastName}`.toUpperCase();
      const desig = (emp.designation || "").toUpperCase();
      const dept = (emp.department || "").toUpperCase();
      const doj = emp.dateOfJoining ? format(new Date(emp.dateOfJoining + "T00:00:00"), "dd/MM/yy") : "";

      const infoLines = [`${emp.employeeCode || ""}`, empFullName, desig, dept, "", doj];
      const summaryLines = [
        `P: ${presentCount}  Off: ${offCount}`,
        `Hol: ${holidayCount}  Leave: ${leaveCount}`,
        `Tour: ${tourCount}  Absent: ${absentCount}`,
        `Pay Days: ${payDays.toFixed(1)}`,
        `Work: ${minsStr(totalWorkMins)}`,
        `OT: ${minsStr(totalOTMins)}`,
      ];
      const rowTypes = ["Shift", "In", "Out", "Hrs", "OT", "Status"];
      const dayCellGroups = [shiftCells, inCells, outCells, hrsCells, otCells, statusCells];

      for (let ri = 0; ri < ROWS_PER_EMP; ri++) {
        allRows.push([
          ri === 0 ? (empIdx + 1) : "",
          infoLines[ri],
          rowTypes[ri],
          ...dayCellGroups[ri],
          summaryLines[ri],
        ]);
      }
    });

    // Grand total row
    allRows.push([
      { content: "", styles: { fillColor: [220, 232, 255] } },
      { content: "GRAND TOTAL", styles: { fontStyle: "bold", fillColor: [220, 232, 255], fontSize: 6 } },
      { content: "", styles: { fillColor: [220, 232, 255] } },
      ...Array.from({ length: daysInMonth }, () => ({ content: "", styles: { fillColor: [220, 232, 255] } })),
      { content: `P:${grandPresent} Off:${grandOff} Hol:${grandHol}\nLv:${grandLeave} Ab:${grandAbsent}\nOT:${minsStr(grandOTMins)}`, styles: { fontStyle: "bold", fillColor: [220, 232, 255], fontSize: 5.5 } },
    ]);

    // ── COLUMN WIDTHS ────────────────────────────────────────────────
    // Usable: 420 - 12 = 408; fixed: SNo=7, Info=32, Type=9, Summary=38 = 86; days: 408-86=322
    const dayColW = Math.max(4.5, Math.min(8.0, parseFloat(((408 - 86) / daysInMonth).toFixed(1))));
    const colStyles: Record<number, any> = {
      0: { cellWidth: 7, halign: "center", fontStyle: "bold", fontSize: 5.5 },
      1: { cellWidth: 32, halign: "left", fontSize: 5.5, overflow: "linebreak" },
      2: { cellWidth: 9, halign: "center", fontStyle: "bold", fontSize: 5.5 },
    };
    for (let d = 0; d < daysInMonth; d++) {
      const dObj = new Date(`${yearStr}-${monthStr}-${String(d + 1).padStart(2, "0")}T00:00:00`);
      const isSun = dObj.getDay() === 0;
      colStyles[3 + d] = { cellWidth: dayColW, halign: "center", fontSize: 5, fillColor: isSun ? [255, 250, 230] : undefined };
    }
    colStyles[3 + daysInMonth] = { cellWidth: 38, halign: "left", fontSize: 5.5, overflow: "linebreak" };

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [HEAD_COLS],
      body: allRows,
      styles: { fontSize: 5.5, cellPadding: 0.7, lineColor: [120, 140, 200], lineWidth: 0.12, valign: "middle", overflow: "linebreak" },
      headStyles: {
        fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold", fontSize: 5.5,
        lineColor: [15, 35, 100], lineWidth: 0.2, halign: "center", minCellHeight: 8,
      },
      columnStyles: colStyles,
      didParseCell: (data: any) => {
        if (data.section !== "body") return;
        const rowIdx = data.row.index;
        const colIdx = data.column.index;
        const isGrandTotal = rowIdx === allRows.length - 1;
        if (isGrandTotal) return;

        const groupIdx = Math.floor(rowIdx / ROWS_PER_EMP);
        const subRow = rowIdx % ROWS_PER_EMP;

        // Alternating background per employee
        const bgEven: [number,number,number] = [245, 248, 255];
        const bgOdd: [number,number,number] = [255, 255, 255];
        if (!data.cell.styles.fillColor || (Array.isArray(data.cell.styles.fillColor) && data.cell.styles.fillColor[0] !== 255)) {
          data.cell.styles.fillColor = groupIdx % 2 === 0 ? bgEven : bgOdd;
        }

        // First sub-row: thicker top border, bold paycode
        if (subRow === 0) {
          data.cell.styles.lineWidthTop = 0.4;
          if (colIdx === 1) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fontSize = 6; }
          if (colIdx === 0) data.cell.styles.fontStyle = "bold";
        }

        // Type column always bold
        if (colIdx === 2) data.cell.styles.fontStyle = "bold";

        // Status row colouring
        if (colIdx >= 3 && colIdx < 3 + daysInMonth && subRow === 5) {
          const s = String(data.cell.raw);
          if (s === "P-P" || s === "P-A") { data.cell.styles.textColor = [10, 120, 10]; data.cell.styles.fontStyle = "bold"; }
          else if (s === "A-A") { data.cell.styles.textColor = [190, 20, 20]; data.cell.styles.fontStyle = "bold"; }
          else if (s === "OFF") { data.cell.styles.textColor = [30, 70, 200]; }
          else if (s === "HOL") { data.cell.styles.textColor = [150, 90, 0]; }
          else if (s !== "") { data.cell.styles.textColor = [120, 40, 140]; }
        }
      },
      tableLineColor: [30, 58, 138],
      tableLineWidth: 0.25,
    });

    // ── FOOTER ─────────────────────────────────────────────────────
    const footerY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(60, 60, 60);
    doc.text("Prepared By : ___________________________", ML, footerY);
    doc.text("HR Manager : ___________________________", PW / 2 - 30, footerY);
    doc.text("Authorized Signatory : ___________________________", PW - MR - 90, footerY);
    doc.setTextColor(0, 0, 0);

    doc.save(`Monthly_Attendance_Register_${selectedMonth}.pdf`);
    toast({ title: "Downloaded", description: `Monthly_Attendance_Register_${selectedMonth}.pdf has been downloaded.` });
  };

  const viewMonthlyAttendanceRegister = () => {
    const emps = filteredEmployees;
    if (emps.length === 0) {
      toast({ title: "No Data", description: "No employees found.", variant: "destructive" });
      return;
    }
    const getStatusCode = (rec: Attendance | undefined, emp: Employee, dateStr: string): string => {
      if (!rec) {
        const s = getDayStatus(dateStr, emp);
        if (s === "WO") return "OFF";
        if (s === "H") return "HOL";
        if (s === "L") return "EL";
        return "A-A";
      }
      if (rec.status === "present") return "P-P";
      if (rec.status === "absent") return "A-A";
      if (rec.status === "weekend") return "OFF";
      if (rec.status === "holiday") return "HOL";
      if (rec.status === "on_leave") return rec.leaveTypeCode || "EL";
      if (rec.status === "half_day") return "P-A";
      return rec.status.toUpperCase();
    };
    const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    const headers = ["Code", "Name", ...dayHeaders, "P", "Off", "Hol", "Leave", "Absent", "Pay Days", "OT Hrs"];
    const rows: (string | number)[][] = [];
    emps.forEach(emp => {
      let pC = 0, offC = 0, holC = 0, lvC = 0, abC = 0, totalOTMins = 0;
      const dayCells: string[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
        const rec = attendance.find(a => a.employeeId === emp.id && a.date === dateStr);
        const sc = getStatusCode(rec, emp, dateStr);
        dayCells.push(sc);
        if (sc === "P-P" || sc === "P-A") pC++;
        else if (sc === "OFF") offC++;
        else if (sc === "HOL") holC++;
        else if (["EL", "CL", "SL", "PL", "ML", "LOP"].includes(sc)) lvC++;
        else abC++;
        if (rec?.otHours) {
          const [oh, om] = rec.otHours.split(".").map(Number);
          totalOTMins += (oh || 0) * 60 + (om || 0);
        }
      }
      const payDays = Math.min(pC + offC + holC + lvC, daysInMonth);
      const otStr = `${Math.floor(totalOTMins / 60)}.${String(totalOTMins % 60).padStart(2, "0")}`;
      rows.push([emp.employeeCode, `${emp.firstName} ${emp.lastName}`, ...dayCells, pC, offC, holC, lvC, abC, payDays, otStr]);
    });
    openViewDialog(`Monthly Attendance Register - ${monthName} ${yearNum}`, headers, rows);
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
      title: "Monthly Attendance Register",
      description: "Grid-format register showing each employee's daily shift, punch-in/out, working hours, OT, and status for the full month with summary totals",
      icon: CalendarRange,
      color: "text-violet-600",
      bgColor: "bg-violet-50 dark:bg-violet-950",
      generate: generateMonthlyAttendanceRegister,
      view: viewMonthlyAttendanceRegister,
      pdfOnly: true,
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

  // Reusable card renderer
  const renderCard = (report: { title: string; description: string; icon: React.ElementType; color: string; bgColor: string; generate: (f: "excel" | "pdf") => void; view: () => void; pdfOnly?: boolean }) => (
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
          <Button variant="outline" size="sm" className="flex-1" onClick={() => report.view()}>
            <Eye className="h-4 w-4 mr-1.5 text-blue-600" />View
          </Button>
          {!report.pdfOnly && (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => report.generate("excel")}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5 text-green-600" />Excel
            </Button>
          )}
          <Button variant="outline" size="sm" className="flex-1" onClick={() => report.generate("pdf")}>
            <Download className="h-4 w-4 mr-1.5 text-red-600" />PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Period picker shared by Annual, Employee Wise, HR Docs tabs
  const PeriodPicker = () => (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 rounded-md border bg-background p-0.5">
        {(["calendar", "financial", "custom"] as const).map(t => (
          <button
            key={t}
            onClick={() => setYearType(t)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${yearType === t ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted text-muted-foreground"}`}
          >
            {t === "calendar" ? "Calendar Year" : t === "financial" ? "Financial Year" : "Custom"}
          </button>
        ))}
      </div>
      {yearType === "calendar" && (
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Year:</label>
          <Input type="number" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-24 h-8 text-sm" min={2020} max={2099} />
        </div>
      )}
      {yearType === "financial" && (
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">FY starting:</label>
          <Input type="number" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-24 h-8 text-sm" min={2020} max={2099} />
          <span className="text-xs text-muted-foreground font-medium">→ FY {selectedYear}-{String(yearNum2 + 1).slice(-2)}</span>
        </div>
      )}
      {yearType === "custom" && (
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">From:</label>
          <Input type="month" value={customFromMonth} onChange={e => setCustomFromMonth(e.target.value)} className="w-36 h-8 text-sm" />
          <label className="text-xs font-medium text-muted-foreground">To:</label>
          <Input type="month" value={customToMonth} onChange={e => setCustomToMonth(e.target.value)} className="w-36 h-8 text-sm" />
        </div>
      )}
    </div>
  );

  // Common filter bar
  const companyFilter = isSuperAdmin ? (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">Company:</label>
      <Select value={selectedCompany || "__all__"} onValueChange={setSelectedCompany}>
        <SelectTrigger className="w-56"><SelectValue placeholder="All Companies" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Companies</SelectItem>
          {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  ) : null;

  const contractorCompanies = companies;
  const filteredContractorEmployees = employees.filter(e =>
    (selectedCompany && selectedCompany !== "__all__" ? e.companyId === selectedCompany : true)
  );

  // Annual report cards
  const annualCards = [
    { title: "Yearly PF Summary", description: "Month-wise PF employee and employer contributions for all PF-applicable employees for the selected year", icon: Shield, color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950", generate: generateYearlyPFSummary, view: viewYearlyPFSummary },
    { title: "Yearly ESIC Summary", description: "Month-wise ESIC IP and employer contributions for all ESIC-applicable employees for the selected year", icon: Receipt, color: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-950", generate: generateYearlyESICSummary, view: viewYearlyESICSummary },
    { title: "Yearly Salary Detail", description: "Month-wise gross and net salary breakdown for all employees — full-year payroll register", icon: TrendingUp, color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-950", generate: generateYearlySalaryDetail, view: viewYearlySalaryDetail },
  ];

  // Employee-wise cards
  const employeeWiseCards = [
    { title: "Individual Attendance Sheet", description: "Per-employee detailed attendance register with daily shift, punch times, arrival/departure variance, working hours, OT, and status for the selected month", icon: ClipboardList, color: "text-violet-600", bgColor: "bg-violet-50 dark:bg-violet-950", generate: generateIndividualAttendanceSheet, view: viewIndividualAttendanceSheet, pdfOnly: true },
    { title: "Employee List", description: "Complete employee directory with personal details, department, designation, and contact info", icon: Users, color: "text-teal-600", bgColor: "bg-teal-50 dark:bg-teal-950", generate: generateEmployeeList, view: viewEmployeeList },
    { title: "Employee Personal File", description: "Complete personal and employment profile of each employee including salary, statutory details, bank info, and address", icon: FileUser, color: "text-indigo-600", bgColor: "bg-indigo-50 dark:bg-indigo-950", generate: generateEmployeePersonalFile, view: viewEmployeePersonalFile },
    { title: "Employee Pay Structure", description: "Salary component breakdown for each employee including basic, allowances, and statutory applicability", icon: ClipboardList, color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950", generate: generateEmployeePayStructure, view: viewEmployeePayStructure },
  ];

  // HR Document cards (PDF only for letters)
  const hrDocCards = [
    { title: "Offer Letter", description: "Generate formal offer letter for an employee with designation, department, joining date, and CTC breakdown", icon: FilePen, color: "text-sky-600", bgColor: "bg-sky-50 dark:bg-sky-950", generate: generateOfferLetter, view: () => { toast({ title: "PDF Only", description: "Offer Letter is available as PDF download only." }); }, pdfOnly: true },
    { title: "Appointment Letter", description: "Generate formal appointment letter with complete terms and conditions, compensation details, and acceptance section", icon: BookOpen, color: "text-violet-600", bgColor: "bg-violet-50 dark:bg-violet-950", generate: generateAppointmentLetter, view: () => { toast({ title: "PDF Only", description: "Appointment Letter is available as PDF download only." }); }, pdfOnly: true },
    { title: "Employee Leave Register", description: "Year-wise leave register showing approved leaves by type for each employee with day counts", icon: CalendarRange, color: "text-rose-600", bgColor: "bg-rose-50 dark:bg-rose-950", generate: generateEmployeeLeaveRegister, view: viewEmployeeLeaveRegister },
  ];

  // Contractor-wise cards — same reports as monthly but scoped to contractor employees
  const contractorCards = [
    { title: "Attendance Sheet (Contractor)", description: "Monthly attendance for contractor employees — present, absent, OT and pay-day counts", icon: Calendar, color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950", generate: (ft: "excel" | "pdf") => generateAttendanceSheet(ft, contractorTaggedEmpList), view: () => viewAttendanceSheet(contractorTaggedEmpList) },
    { title: "Salary Sheet (Contractor)", description: "Monthly salary register for contractor / principal-employer employees", icon: CreditCard, color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-950", generate: (ft: "excel" | "pdf") => generateSalarySheet(ft, contractorTaggedEmpList), view: () => viewSalarySheet(contractorTaggedEmpList) },
    { title: "PF Statement (Contractor)", description: "Monthly PF ECR for contractor employees", icon: Shield, color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950", generate: (ft: "excel" | "pdf") => generatePFStatement(ft, contractorTaggedEmpList), view: () => viewPFStatement(contractorTaggedEmpList) },
    { title: "ESIC Statement (Contractor)", description: "Monthly ESIC contributions for contractor employees", icon: Receipt, color: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-950", generate: (ft: "excel" | "pdf") => generateESICStatement(ft, contractorTaggedEmpList), view: () => viewESICStatement(contractorTaggedEmpList) },
  ];

  type CtrlFilter = "company" | "month" | "period" | "employee" | "contractor";
  const ctrlAllReports: Array<{ key: string; title: string; category: string; filters: CtrlFilter[]; icon: React.ElementType; color: string; bgColor: string; generate: (ft: "excel" | "pdf") => void; view: () => void; pdfOnly?: boolean }> = [
    { key: "att",      category: "Monthly",       title: "Attendance Sheet",             icon: Calendar,      color: "text-blue-600",   bgColor: "bg-blue-50 dark:bg-blue-950",    filters: ["company","month"],             generate: generateAttendanceSheet,              view: viewAttendanceSheet },
    { key: "mth_reg",  category: "Monthly",       title: "Monthly Attendance Register",  icon: CalendarRange, color: "text-violet-600", bgColor: "bg-violet-50 dark:bg-violet-950",filters: ["company","month"],             generate: generateMonthlyAttendanceRegister,    view: viewMonthlyAttendanceRegister, pdfOnly: true },
    { key: "punch",    category: "Monthly",       title: "Attendance Punch",             icon: Clock,         color: "text-sky-600",    bgColor: "bg-sky-50 dark:bg-sky-950",      filters: ["company","month"],             generate: generateAttendancePunchReport,        view: viewAttendancePunchReport },
    { key: "sal",      category: "Monthly",       title: "Salary Sheet",                 icon: CreditCard,    color: "text-green-600",  bgColor: "bg-green-50 dark:bg-green-950",  filters: ["company","month"],             generate: generateSalarySheet,           view: viewSalarySheet },
    { key: "pf",       category: "Monthly",       title: "PF Statement",                 icon: Shield,        color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950",filters: ["company","month"],             generate: generatePFStatement,           view: viewPFStatement },
    { key: "esic",     category: "Monthly",       title: "ESIC Statement",               icon: Receipt,       color: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-950",filters: ["company","month"],             generate: generateESICStatement,         view: viewESICStatement },
    { key: "payslip",  category: "Monthly",       title: "Pay Slip",                     icon: FileText,      color: "text-red-600",    bgColor: "bg-red-50 dark:bg-red-950",      filters: ["company","month","employee"],  generate: generatePaySlip,               view: viewPaySlip },
    { key: "fnf",      category: "Monthly",       title: "Full & Final Settlement",      icon: HandCoins,     color: "text-rose-600",   bgColor: "bg-rose-50 dark:bg-rose-950",    filters: ["company","month"],             generate: generateFnFReport,             view: viewFnFReport },
    { key: "bonus",    category: "Monthly",       title: "Bonus Report",                 icon: Landmark,      color: "text-amber-600",  bgColor: "bg-amber-50 dark:bg-amber-950",  filters: ["company","month"],             generate: generateBonusReport,           view: viewBonusReport },
    { key: "lwf",      category: "Monthly",       title: "LWF Report",                   icon: Scale,         color: "text-cyan-600",   bgColor: "bg-cyan-50 dark:bg-cyan-950",    filters: ["company","month"],             generate: generateLWFReport,             view: viewLWFReport },
    { key: "loan",     category: "Monthly",       title: "Advance & Loan",               icon: Banknote,      color: "text-emerald-600",bgColor: "bg-emerald-50 dark:bg-emerald-950",filters: ["company"],                  generate: generateAdvanceReport,         view: viewAdvanceReport },
    { key: "leave",    category: "Monthly",       title: "Leave Report",                 icon: CalendarX,     color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950",filters: ["company","month"],             generate: generateLeaveReport,           view: viewLeaveReport },
    { key: "ctc",      category: "Monthly",       title: "CTC Register",                 icon: Building2,     color: "text-teal-600",   bgColor: "bg-teal-50 dark:bg-teal-950",    filters: ["company"],                    generate: generateCTCRegister,           view: viewCTCRegister },
    { key: "ypf",      category: "Annual",        title: "Yearly PF Summary",            icon: Shield,        color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950",filters: ["company","period"],            generate: generateYearlyPFSummary,       view: viewYearlyPFSummary },
    { key: "yesic",    category: "Annual",        title: "Yearly ESIC Summary",          icon: Receipt,       color: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-950",filters: ["company","period"],            generate: generateYearlyESICSummary,     view: viewYearlyESICSummary },
    { key: "ysal",     category: "Annual",        title: "Yearly Salary Detail",         icon: TrendingUp,    color: "text-green-600",  bgColor: "bg-green-50 dark:bg-green-950",  filters: ["company","period"],            generate: generateYearlySalaryDetail,    view: viewYearlySalaryDetail },
    { key: "ind_att",  category: "Employee Wise", title: "Individual Attendance Sheet",   icon: ClipboardList, color: "text-violet-600", bgColor: "bg-violet-50 dark:bg-violet-950",filters: ["company","employee","month"],  generate: generateIndividualAttendanceSheet, view: viewIndividualAttendanceSheet, pdfOnly: true },
    { key: "emplist",  category: "Employee Wise", title: "Employee List",                icon: Users,         color: "text-teal-600",   bgColor: "bg-teal-50 dark:bg-teal-950",    filters: ["company","employee","period"], generate: generateEmployeeList,          view: viewEmployeeList },
    { key: "empfile",  category: "Employee Wise", title: "Employee Personal File",       icon: FileUser,      color: "text-indigo-600", bgColor: "bg-indigo-50 dark:bg-indigo-950",filters: ["company","employee","period"], generate: generateEmployeePersonalFile,  view: viewEmployeePersonalFile },
    { key: "emppay",   category: "Employee Wise", title: "Employee Pay Structure",       icon: ClipboardList, color: "text-blue-600",   bgColor: "bg-blue-50 dark:bg-blue-950",    filters: ["company","employee","period"], generate: generateEmployeePayStructure,  view: viewEmployeePayStructure },
    { key: "offer",    category: "HR Documents",  title: "Offer Letter",                 icon: FilePen,       color: "text-sky-600",    bgColor: "bg-sky-50 dark:bg-sky-950",      filters: ["company","employee","period"], generate: generateOfferLetter,           view: () => toast({ title: "PDF Only", description: "Offer Letter is PDF only." }), pdfOnly: true },
    { key: "appt",     category: "HR Documents",  title: "Appointment Letter",           icon: BookOpen,      color: "text-violet-600", bgColor: "bg-violet-50 dark:bg-violet-950",filters: ["company","employee","period"], generate: generateAppointmentLetter,     view: () => toast({ title: "PDF Only", description: "Appointment Letter is PDF only." }), pdfOnly: true },
    { key: "leavereg", category: "HR Documents",  title: "Leave Register",               icon: CalendarRange, color: "text-rose-600",   bgColor: "bg-rose-50 dark:bg-rose-950",    filters: ["company","employee","period"], generate: generateEmployeeLeaveRegister, view: viewEmployeeLeaveRegister },
    { key: "c_att",    category: "Contractor",    title: "Attendance Sheet",             icon: Calendar,      color: "text-blue-600",   bgColor: "bg-blue-50 dark:bg-blue-950",    filters: ["contractor","month"],          generate: (ft) => generateAttendanceSheet(ft, contractorTaggedEmpList), view: () => viewAttendanceSheet(contractorTaggedEmpList) },
    { key: "c_sal",    category: "Contractor",    title: "Salary Sheet",                 icon: CreditCard,    color: "text-green-600",  bgColor: "bg-green-50 dark:bg-green-950",  filters: ["contractor","month"],          generate: (ft) => generateSalarySheet(ft, contractorTaggedEmpList),    view: () => viewSalarySheet(contractorTaggedEmpList) },
    { key: "c_pf",     category: "Contractor",    title: "PF Statement",                 icon: Shield,        color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950",filters: ["contractor","month"],          generate: (ft) => generatePFStatement(ft, contractorTaggedEmpList),   view: () => viewPFStatement(contractorTaggedEmpList) },
    { key: "c_esic",   category: "Contractor",    title: "ESIC Statement",               icon: Receipt,       color: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-950",filters: ["contractor","month"],          generate: (ft) => generateESICStatement(ft, contractorTaggedEmpList), view: () => viewESICStatement(contractorTaggedEmpList) },
  ];
  const ctrlSelected = ctrlAllReports.find(r => r.key === ctrlReport) ?? null;

  return (
    <div className="p-6" data-testid="reports-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6" />Reports</h1>
        <p className="text-muted-foreground">Generate and download reports in Excel and PDF format</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="ctrl" className="flex items-center gap-1.5"><SlidersHorizontal className="h-4 w-4" />Quick Generate</TabsTrigger>
          <TabsTrigger value="monthly" className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />Monthly</TabsTrigger>
          <TabsTrigger value="annual" className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4" />Annual</TabsTrigger>
          <TabsTrigger value="employee" className="flex items-center gap-1.5"><UserRound className="h-4 w-4" />Employee Wise</TabsTrigger>
          <TabsTrigger value="hr" className="flex items-center gap-1.5"><FilePen className="h-4 w-4" />HR Documents</TabsTrigger>
          <TabsTrigger value="contractor" className="flex items-center gap-1.5"><Building2 className="h-4 w-4" />Contractor Compliances</TabsTrigger>
        </TabsList>

        {/* ── Quick Generate Controller ── */}
        <TabsContent value="ctrl">
          <div className="max-w-xl mx-auto">
            <Card className="shadow-sm">
              <CardContent className="pt-6 space-y-4">

                {/* Report dropdown */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Report</label>
                  <Select value={ctrlReport || "__none__"} onValueChange={v => setCtrlReport(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="w-full" data-testid="ctrl-report-select">
                      <SelectValue placeholder="— Select report —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select report —</SelectItem>
                      {(["Monthly", "Annual", "Employee Wise", "HR Documents", "Contractor"] as const).map(cat => (
                        <SelectGroup key={cat}>
                          <SelectLabel>{cat}</SelectLabel>
                          {ctrlAllReports.filter(r => r.category === cat).map(r => (
                            <SelectItem key={r.key} value={r.key}>{r.title}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Filters — appear only after a report is picked */}
                {ctrlSelected && (
                  <>
                    {/* Company */}
                    {ctrlSelected.filters.includes("company") && isSuperAdmin && (
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Company</label>
                        <Select value={selectedCompany || "__all__"} onValueChange={setSelectedCompany}>
                          <SelectTrigger className="w-full" data-testid="ctrl-company-select"><SelectValue placeholder="All Companies" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">All Companies</SelectItem>
                            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Month */}
                    {ctrlSelected.filters.includes("month") && (
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Month</label>
                        <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full" data-testid="ctrl-month-input" />
                      </div>
                    )}

                    {/* Period */}
                    {ctrlSelected.filters.includes("period") && (
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Period</label>
                        <PeriodPicker />
                      </div>
                    )}

                    {/* Employee — searchable combobox */}
                    {ctrlSelected.filters.includes("employee") && (() => {
                      const selectedEmp = filteredEmployees.find(e => e.id === docEmployee);
                      const empMatches = filteredEmployees.filter(e => {
                        const q = empSearchQuery.toLowerCase();
                        return !q || `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q);
                      });
                      return (
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Employee</label>
                          <div className="relative">
                            <Input
                              data-testid="ctrl-employee-search"
                              placeholder="Search employee…"
                              value={empSearchOpen ? empSearchQuery : (selectedEmp ? `${selectedEmp.firstName} ${selectedEmp.lastName} (${selectedEmp.employeeCode})` : "")}
                              onFocus={() => { setEmpSearchOpen(true); setEmpSearchQuery(""); }}
                              onChange={e => setEmpSearchQuery(e.target.value)}
                              onBlur={() => setTimeout(() => setEmpSearchOpen(false), 150)}
                              autoComplete="off"
                            />
                            {empSearchOpen && (
                              <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto">
                                <div
                                  className="cursor-pointer px-3 py-2 text-sm hover:bg-accent text-muted-foreground"
                                  onMouseDown={() => { setDocEmployee(""); setEmpSearchOpen(false); setEmpSearchQuery(""); }}
                                >
                                  All Employees
                                </div>
                                {empMatches.map(e => (
                                  <div
                                    key={e.id}
                                    className={`cursor-pointer px-3 py-2 text-sm hover:bg-accent flex items-center justify-between ${docEmployee === e.id ? "bg-accent/60 font-medium" : ""}`}
                                    onMouseDown={() => { setDocEmployee(e.id); setEmpSearchOpen(false); setEmpSearchQuery(""); }}
                                  >
                                    <span>{e.firstName} {e.lastName}</span>
                                    <span className="text-xs text-muted-foreground ml-2">{e.employeeCode}</span>
                                  </div>
                                ))}
                                {empMatches.length === 0 && (
                                  <div className="px-3 py-2 text-sm text-muted-foreground">No employees found</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Contractor */}
                    {ctrlSelected.filters.includes("contractor") && (
                      <>
                        {isSuperAdmin && (
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium">Principal Company</label>
                            <Select value={contractorPrincipalId || "__none__"} onValueChange={v => { const val = v === "__none__" ? "" : v; setContractorPrincipalId(val); setSelectedContractorId(""); setSelectedCompany(""); }}>
                              <SelectTrigger className="w-full" data-testid="ctrl-principal-select"><SelectValue placeholder="Select principal company…" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Select Principal Company —</SelectItem>
                                {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium">Contractor</label>
                          <Select value={selectedContractorId || "__none__"} onValueChange={v => { const val = v === "__none__" ? "" : v; setSelectedContractorId(val); setSelectedCompany(val); }} disabled={!contractorPrincipalId}>
                            <SelectTrigger className="w-full" data-testid="ctrl-contractor-select"><SelectValue placeholder={companyContractors.length === 0 ? "No contractors mapped" : "Select contractor…"} /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Select Contractor —</SelectItem>
                              {companyContractors.map(c => <SelectItem key={c.contractorId} value={c.contractorId}>{c.contractorName}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Button className="flex-1" variant="outline" onClick={() => ctrlSelected.view()} data-testid="ctrl-view-btn">
                        <Eye className="h-4 w-4 mr-1.5 text-blue-600" />View
                      </Button>
                      {!ctrlSelected.pdfOnly && (
                        <Button className="flex-1" variant="outline" onClick={() => ctrlSelected.generate("excel")} data-testid="ctrl-excel-btn">
                          <FileSpreadsheet className="h-4 w-4 mr-1.5 text-green-600" />Excel
                        </Button>
                      )}
                      <Button className="flex-1" variant="outline" onClick={() => ctrlSelected.generate("pdf")} data-testid="ctrl-pdf-btn">
                        <Download className="h-4 w-4 mr-1.5 text-red-600" />PDF
                      </Button>
                    </div>
                  </>
                )}

              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Monthly ── */}
        <TabsContent value="monthly">
          <div className="flex flex-wrap items-center gap-4 mb-5 p-3 bg-muted/30 rounded-lg border">
            {companyFilter}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Month:</label>
              <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-44" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {reportCards.map(r => renderCard(r))}
          </div>
        </TabsContent>

        {/* ── Annual ── */}
        <TabsContent value="annual">
          <div className="flex flex-wrap items-center gap-4 mb-5 p-3 bg-muted/30 rounded-lg border">
            {companyFilter}
            <PeriodPicker />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {annualCards.map(r => renderCard(r))}
          </div>
        </TabsContent>

        {/* ── Employee Wise ── */}
        <TabsContent value="employee">
          <div className="flex flex-wrap items-center gap-4 mb-5 p-3 bg-muted/30 rounded-lg border">
            {companyFilter}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Employee:</label>
              <Select value={docEmployee || "__none__"} onValueChange={v => setDocEmployee(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-56"><SelectValue placeholder="All Employees" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">All Employees</SelectItem>
                  {filteredEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Month:</label>
              <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-40" />
            </div>
            <PeriodPicker />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {employeeWiseCards.map(r => renderCard(r))}
          </div>
        </TabsContent>

        {/* ── HR Documents ── */}
        <TabsContent value="hr">
          <div className="flex flex-wrap items-center gap-4 mb-5 p-3 bg-muted/30 rounded-lg border">
            {companyFilter}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Employee:</label>
              <Select value={docEmployee || "__none__"} onValueChange={v => setDocEmployee(v === "__none__" ? "" : v)}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Select employee for letters" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— All Employees —</SelectItem>
                  {filteredEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <PeriodPicker />
          </div>
          {!docEmployee && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-5">
              Select an employee above to generate Offer Letter or Appointment Letter. Leave Register works for all employees too.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {hrDocCards.map(r => renderCard(r))}
          </div>
        </TabsContent>

        {/* ── Contractor Compliances ── */}
        <TabsContent value="contractor">
          <div className="flex flex-wrap items-center gap-4 mb-5 p-3 bg-muted/30 rounded-lg border">

            {/* Step 1: Principal Employer Company — only super admin needs to pick */}
            {isSuperAdmin && (
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">1</div>
                <label className="text-sm font-medium">Principal Company:</label>
                <Select
                  value={contractorPrincipalId || "__none__"}
                  onValueChange={v => {
                    const val = v === "__none__" ? "" : v;
                    setContractorPrincipalId(val);
                    setSelectedContractorId("");
                    setSelectedCompany("");
                  }}
                >
                  <SelectTrigger className="w-60"><SelectValue placeholder="Select company…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Select Principal Company —</SelectItem>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Step 2 (or Step 1 for company admin): Contractor mapped to that company */}
            <div className="flex items-center gap-2">
              {isSuperAdmin && (
                <div className={`flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold shrink-0 ${contractorPrincipalId ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</div>
              )}
              <label className="text-sm font-medium">Contractor:</label>
              <Select
                value={selectedContractorId || "__none__"}
                onValueChange={v => {
                  const val = v === "__none__" ? "" : v;
                  setSelectedContractorId(val);
                  setSelectedCompany(val);
                }}
                disabled={!contractorPrincipalId}
              >
                <SelectTrigger className="w-60">
                  <SelectValue placeholder={companyContractors.length === 0 ? "No contractors mapped" : "Select contractor…"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— All Contractors —</SelectItem>
                  {companyContractors.map(c => <SelectItem key={c.contractorId} value={c.contractorId}>{c.contractorName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Month:</label>
              <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-44" />
            </div>
          </div>

          {!contractorPrincipalId ? (
            <div className="text-center py-14 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Select a Principal Company to get started</p>
              <p className="text-sm mt-1">Then choose a contractor mapped to that company to view compliance reports.</p>
            </div>
          ) : companyContractors.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No contractors mapped to this company</p>
              <p className="text-sm mt-1">Go to Company settings and add contractor companies first.</p>
            </div>
          ) : (
            <>
              {selectedContractorId && (
                <p className="text-sm text-muted-foreground mb-4">
                  Showing {filteredContractorEmployees.length} employee(s) for contractor: <span className="font-medium text-foreground">{companyContractors.find(c => c.contractorId === selectedContractorId)?.contractorName}</span>
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {contractorCards.map(r => renderCard(r))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>{viewTitle}</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-auto">
            {viewRows.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No data available for this report.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-background z-10">
                  <tr>{viewHeaders.map((h, i) => <th key={i} className="border px-3 py-2 text-left font-semibold bg-primary/10 text-xs whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {viewRows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                      {row.map((cell, ci) => <td key={ci} className="border px-3 py-1.5 text-xs whitespace-nowrap">{cell}</td>)}
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
