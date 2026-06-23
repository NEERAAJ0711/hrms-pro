import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSort, sortData } from "@/lib/use-sort";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/hooks/use-can";
import { format } from "date-fns";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AiInsightsPanel } from "@/components/ai-insights-panel";
import { fetchJson, fetchJsonOrEmpty, mutateJson } from "@/lib/api";
import type { Payroll, SalaryStructure, Employee, Company, StatutorySettings, Attendance, WageGrade, EarningHead, DeductionHead } from "@shared/schema";
import FnfSettlementPage from "@/pages/fnf-settlement";
import { PageHeader } from "@/components/page-header";
import { salaryStructureSchema, statusColors, months, type SalaryStructureFormValues } from "@/components/payroll/constants";
import { PayrollSummaryCards } from "@/components/payroll/summary-cards";
import { PayrollTab } from "@/components/payroll/payroll-tab";
import { StructuresTab } from "@/components/payroll/structures-tab";
import { SalaryStructureDialog } from "@/components/payroll/salary-structure-dialog";
import { BulkUploadDialog } from "@/components/payroll/bulk-upload-dialog";
import { PayrollDetailsDialog } from "@/components/payroll/payroll-details-dialog";
import { PayrollEditForm } from "@/components/payroll/payroll-edit-form";

export default function PayrollPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { can } = useCan();
  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = ["super_admin", "company_admin", "hr_admin", "manager"].includes(user?.role || "");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingStructureId, setEditingStructureId] = useState<string | null>(null);
  const [editingPayroll, setEditingPayroll] = useState<Payroll | null>(null);
  const [isPayrollEditOpen, setIsPayrollEditOpen] = useState(false);
  const [viewingPayrollRecord, setViewingPayrollRecord] = useState<Payroll | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>(isSuperAdmin ? "__all__" : (user?.companyId || ""));
  const [structureSearch, setStructureSearch] = useState("");
  const [contractorFilter, setContractorFilter] = useState("own");
  const [selectedMonth, setSelectedMonth] = useState(months[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [payrollSearch, setPayrollSearch] = useState("");
  const [selectedPayrollIds, setSelectedPayrollIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const [grossInputAmt, setGrossInputAmt] = useState<string>("");
  const [customEarningAmounts, setCustomEarningAmounts] = useState<Record<string, number>>({});
  const [customDeductionAmounts, setCustomDeductionAmounts] = useState<Record<string, number>>({});

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  type ContractorRow = { id: string; companyId: string; contractorId: string; startDate: string; contractorName: string };
  type PERow = { id: string; companyId: string; contractorId: string; startDate: string; companyName: string };

  const { data: myContractors = [] } = useQuery<ContractorRow[]>({
    queryKey: ["/api/companies", user?.companyId, "contractors"],
    queryFn: () => fetchJson(`/api/companies/${user?.companyId}/contractors`),
    enabled: !isSuperAdmin && !!user?.companyId,
  });

  const { data: myPrincipalEmployers = [] } = useQuery<PERow[]>({
    queryKey: ["/api/companies", user?.companyId, "principal-employers"],
    queryFn: () => fetchJson(`/api/companies/${user?.companyId}/principal-employers`),
    enabled: !isSuperAdmin && !!user?.companyId,
  });

  // Parse contractor filter
  const prFilterParts = contractorFilter.split(":");
  const prFilterType = prFilterParts[0]; // "own" | "c" | "pe"
  const prFilterCompanyId = prFilterParts[1] || "";
  const prFilterContractorId = prFilterParts[2] || "";
  const prIsContractorView = prFilterType !== "own";

  type ContractorEmployee = { id?: string; employeeId: string };

  const { data: prTaggedRecords = [] } = useQuery<ContractorEmployee[]>({
    queryKey: ["/api/companies", prFilterCompanyId, "contractors", prFilterContractorId, "employees"],
    queryFn: () => fetchJson(`/api/companies/${prFilterCompanyId}/contractors/${prFilterContractorId}/employees`),
    enabled: prIsContractorView && !!prFilterCompanyId && !!prFilterContractorId,
  });

  const prTaggedIds = new Set(prTaggedRecords.map((r) => (r as any).id ?? r.employeeId));

  const prContractorCompanyId = prFilterType === "c" ? prFilterContractorId : "";
  const { data: prContractorEmployees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/companies", prContractorCompanyId, "employees"],
    queryFn: () => fetchJson(`/api/companies/${prContractorCompanyId}/employees`),
    enabled: prFilterType === "c" && !!prContractorCompanyId,
  });

  // Combined employee pool for payroll view
  const prAllEmployees: Employee[] = prFilterType === "c" ? [...employees, ...prContractorEmployees] : employees;

  useEffect(() => {
    if (isSuperAdmin) return;
    const parts = contractorFilter.split(":");
    const type = parts[0];
    if (type === "own") {
      setSelectedCompany(user?.companyId || "");
    } else if (type === "c") {
      // contractor employees fetched separately; keep own company for now
      setSelectedCompany(user?.companyId || "");
    } else if (type === "pe") {
      setSelectedCompany(user?.companyId || "");
    }
  }, [contractorFilter]);

  const { data: salaryStructures = [], isLoading: isLoadingStructures } = useQuery<SalaryStructure[]>({
    queryKey: ["/api/salary-structures"],
  });

  const { data: wageGrades = [] } = useQuery<WageGrade[]>({
    queryKey: ["/api/wage-grades"],
    queryFn: () => mutateJson("GET", "/api/wage-grades"),
  });

  const getEmployeeWageGrade = (employeeId: string): WageGrade | undefined => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp?.wageGradeId) return undefined;
    return wageGrades.find(g => g.id === emp.wageGradeId && g.status === "active");
  };

  const { data: payrollRecords = [], isLoading: isLoadingPayroll } = useQuery<Payroll[]>({
    queryKey: ["/api/payroll"],
  });

  const { data: loanAdvances = [] } = useQuery<any[]>({
    queryKey: ["/api/loan-advances"],
    enabled: isAdmin,
  });

  const form = useForm<SalaryStructureFormValues>({
    resolver: zodResolver(salaryStructureSchema),
    defaultValues: {
      employeeId: "",
      companyId: isSuperAdmin ? "" : (user?.companyId || ""),
      basicSalary: 0,
      hra: 0,
      conveyance: 0,
      specialAllowance: 0,
      otherAllowances: 0,
      grossSalary: 0,
      pfEmployee: 0,
      pfEmployer: 0,
      vpfAmount: 0,
      esi: 0,
      professionalTax: 0,
      lwfEmployee: 0,
      tds: 0,
      otherDeductions: 0,
      netSalary: 0,
      effectiveFrom: format(new Date(), "yyyy-MM-dd"),
    },
  });

  useEffect(() => {
    if (!isSuperAdmin && user?.companyId) {
      form.setValue("companyId", user.companyId);
    }
  }, [isSuperAdmin, user?.companyId]);

  const watchCompanyId = form.watch("companyId");
  const watchEmployeeId = form.watch("employeeId");
  const watchGrossSalary = form.watch("grossSalary");

  const dialogWageGrade = watchEmployeeId ? getEmployeeWageGrade(watchEmployeeId) : undefined;
  const isGrossCompliantWithMinWage = !dialogWageGrade || watchGrossSalary >= (dialogWageGrade.minimumWage ?? 0);

  // Compute the minimum allowed effectiveFrom date when editing (must be after last generated payroll)
  const SS_MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const empPayrollForValidation = editingStructureId
    ? payrollRecords.filter(p => p.employeeId === watchEmployeeId)
    : [];
  const latestEmpPayroll = empPayrollForValidation.length > 0
    ? empPayrollForValidation.reduce((l, p) => {
        return (p.year * 100 + (SS_MONTH_NAMES.indexOf(p.month) + 1)) > (l.year * 100 + (SS_MONTH_NAMES.indexOf(l.month) + 1)) ? p : l;
      })
    : null;
  const minEffectiveDateStr = latestEmpPayroll
    ? (() => {
        const idx = SS_MONTH_NAMES.indexOf(latestEmpPayroll.month);
        const next = new Date(latestEmpPayroll.year, idx + 1, 1);
        return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
      })()
    : "";

  const { data: earningHeads = [] } = useQuery<EarningHead[]>({
    queryKey: ["/api/earning-heads", watchCompanyId],
    queryFn: () => {
      if (!watchCompanyId) return [];
      return fetchJsonOrEmpty(`/api/earning-heads?companyId=${watchCompanyId}`, []);
    },
    enabled: !!watchCompanyId,
  });
  const activeEarningHeads = earningHeads.filter((h) => h.status === "active");

  const { data: deductionHeads = [] } = useQuery<DeductionHead[]>({
    queryKey: ["/api/deduction-heads", watchCompanyId],
    queryFn: () => {
      if (!watchCompanyId) return [];
      return fetchJsonOrEmpty(`/api/deduction-heads?companyId=${watchCompanyId}`, []);
    },
    enabled: !!watchCompanyId,
  });
  const activeDeductionHeads = deductionHeads.filter((h) => h.status === "active");

  const { data: statutoryData } = useQuery<StatutorySettings | StatutorySettings[]>({
    queryKey: ["/api/statutory-settings", watchCompanyId],
    queryFn: () => {
      const companyId = form.getValues("companyId");
      return mutateJson("GET", companyId ? `/api/statutory-settings?companyId=${companyId}` : "/api/statutory-settings");
    }
  });

  const statutorySettingsList = Array.isArray(statutoryData) 
    ? statutoryData 
    : (statutoryData ? [statutoryData] : []);

  const filteredStructures = salaryStructures.filter(s => {
    const companyMatch = selectedCompany === "__all__" || s.companyId === selectedCompany
      || (prFilterType === "c" && s.companyId === prContractorCompanyId);
    if (!companyMatch) return false;
    if (prIsContractorView && !prTaggedIds.has(s.employeeId)) return false;
    if (!structureSearch.trim()) return true;
    const q = structureSearch.trim().toLowerCase();
    const emp = prAllEmployees.find(e => e.id === s.employeeId);
    const name = emp ? `${emp.firstName} ${emp.lastName} ${emp.employeeCode}`.toLowerCase() : "";
    return name.includes(q);
  });

  const { sort: structSort, toggle: toggleStructSort } = useSort("name");
  const sortedStructures = sortData(filteredStructures, structSort, (s, col) => {
    if (col === "name") { const emp = prAllEmployees.find(e => e.id === s.employeeId); return emp ? `${emp.firstName} ${emp.lastName}` : ""; }
    if (col === "basic") return s.basicSalary;
    if (col === "hra") return s.hra || 0;
    if (col === "gross") return s.grossSalary;
    if (col === "net") return s.netSalary;
    if (col === "effective") return s.effectiveFrom;
    return "";
  });

  const filteredPayroll = payrollRecords.filter(p => {
    const companyMatch = selectedCompany === "__all__" || p.companyId === selectedCompany
      || (prFilterType === "c" && p.companyId === prContractorCompanyId);
    if (!companyMatch) return false;
    if (prIsContractorView && !prTaggedIds.has(p.employeeId)) return false;
    if (p.month !== selectedMonth || p.year !== parseInt(selectedYear)) return false;
    if (payrollSearch.trim()) {
      const q = payrollSearch.trim().toLowerCase();
      const emp = employees.find(e => e.id === p.employeeId);
      const name = emp ? `${emp.firstName} ${emp.lastName}`.toLowerCase() : "";
      const code = (emp?.employeeCode || "").toLowerCase();
      if (!name.includes(q) && !code.includes(q)) return false;
    }
    return true;
  });

  const calculateStatutoryDeductions = (companyId: string, employeeId: string, basicSalary: number, grossSalary: number) => {
    // Find settings specifically for the company
    const settings = statutorySettingsList.find(s => s.companyId === companyId);
    const employee = employees.find(e => e.id === employeeId);

    let pfEmployee = 0;
    let pfEmployer = 0;
    let esi = 0;
    let pt = 0;

    // Calculate PF (12% of basic or ceiling from settings) - only if employee is PF applicable
    if (settings?.pfEnabled && employee?.pfApplicable) {
      const pfBase = Math.min(basicSalary, Number(settings.pfWageCeiling) || 15000);
      pfEmployee = Math.round(pfBase * (Number(settings.pfEmployeePercent) || 12) / 100);
      pfEmployer = Math.round(pfBase * (Number(settings.pfEmployerPercent) || 12) / 100);
    }

    if (settings?.esicEnabled && employee?.esiApplicable) {
      const wageCeiling = Number(settings.esicWageCeiling) || 21000;
      const percent = Number(settings.esicEmployeePercent) || 75;
      if (settings.esicCalcOnGross) {
        // Old Setup: ESIC calculated on full Gross Salary
        if (grossSalary <= wageCeiling) {
          const esicBase = Math.min(grossSalary, wageCeiling);
          esi = Math.round(esicBase * percent / 10000);
        }
      } else {
        // New Rule (Jan 2026): ESIC base = higher of Basic or 50% of Gross, capped at ceiling
        // Eligibility: gross salary must be <= ESIC wage ceiling (₹21,000)
        if (grossSalary <= wageCeiling) {
          const esicBase = Math.min(Math.max(basicSalary, grossSalary * 0.5), wageCeiling);
          esi = Math.round(esicBase * percent / 10000);
        }
      }
    }

    // Calculate PT (fixed amount from settings)
    if (settings?.ptEnabled) {
      pt = Math.min(Number(settings.ptMaxAmount) || 200, 200);
    }

    let lwfEmployee = 0;
    let lwfEmployer = 0;
    if (settings?.lwfEnabled && employee?.lwfApplicable) {
      const lwfBase = (settings.lwfCalculationBase === "basic") ? basicSalary : grossSalary;
      const empPercent = Number(settings.lwfEmployeePercent) || 20;
      const empCap = Number(settings.lwfEmployeeMaxCap) || 34;
      const emplrPercent = Number(settings.lwfEmployerPercent) || 40;
      const emplrCap = Number(settings.lwfEmployerMaxCap) || 68;
      lwfEmployee = Math.min(Math.round(lwfBase * empPercent / 10000), empCap);
      lwfEmployer = Math.min(Math.round(lwfBase * emplrPercent / 10000), emplrCap);
    }

    return { pfEmployee, pfEmployer, esi, pt, lwfEmployee, lwfEmployer };
  };

  const calculateSalary = (autoCalculateStatutory = true, customAmountsOverride?: Record<string, number>) => {
    const companyId = form.getValues("companyId");
    const employeeId = form.getValues("employeeId");
    const basic = Number(form.getValues("basicSalary")) || 0;
    const hra = Number(form.getValues("hra")) || 0;
    const conveyance = Number(form.getValues("conveyance")) || 0;
    const special = Number(form.getValues("specialAllowance")) || 0;
    const other = Number(form.getValues("otherAllowances")) || 0;

    // Start from the manually-overridden or current amounts
    const baseAmounts = customAmountsOverride ?? customEarningAmounts;

    // Auto-compute percentage-type heads from the current basic/gross breakdown.
    // Use a preliminary gross (without pct heads) as the base for "gross"-based heads.
    const fixedCustomSum = Object.entries(baseAmounts)
      .filter(([hid]) => {
        const h = activeEarningHeads.find(x => x.id === hid);
        return !h || h.type !== "percentage";
      })
      .reduce((acc, [, v]) => acc + (v || 0), 0);
    const prelimGross = basic + hra + conveyance + special + other + fixedCustomSum;

    const updatedAmounts = { ...baseAmounts };
    for (const head of activeEarningHeads) {
      if (head.type === "percentage" && (head.percentage ?? 0) > 0) {
        const base = head.calculationBase === "basic" ? basic : prelimGross;
        updatedAmounts[head.id] = Math.round(base * (head.percentage ?? 0) / 100);
      }
    }

    // Only push the percentage updates back to state if they actually changed
    const pctChanged = activeEarningHeads
      .filter(h => h.type === "percentage")
      .some(h => (updatedAmounts[h.id] ?? 0) !== (customEarningAmounts[h.id] ?? 0));
    if (pctChanged && !customAmountsOverride) {
      setCustomEarningAmounts(updatedAmounts);
    }

    const amounts = customAmountsOverride ? updatedAmounts : (pctChanged ? updatedAmounts : baseAmounts);
    const customSum = Object.values(amounts).reduce((acc, v) => acc + (v || 0), 0);

    const gross = basic + hra + conveyance + special + other + customSum;
    form.setValue("grossSalary", gross);
    
    // Auto-calculate statutory deductions if enabled and employee is selected
    if (autoCalculateStatutory && companyId && employeeId) {
      const statutory = calculateStatutoryDeductions(companyId, employeeId, basic, gross);
      form.setValue("pfEmployee", statutory.pfEmployee, { shouldDirty: true, shouldValidate: true });
      form.setValue("pfEmployer", statutory.pfEmployer, { shouldDirty: true, shouldValidate: true });
      form.setValue("esi", statutory.esi, { shouldDirty: true, shouldValidate: true });
      form.setValue("professionalTax", statutory.pt, { shouldDirty: true, shouldValidate: true });
      form.setValue("lwfEmployee", statutory.lwfEmployee, { shouldDirty: true, shouldValidate: true });
    }
    
    const pfEmp = Number(form.getValues("pfEmployee")) || 0;
    const vpfAmt = Number(form.getValues("vpfAmount")) || 0;
    const esiVal = Number(form.getValues("esi")) || 0;
    const ptVal = Number(form.getValues("professionalTax")) || 0;
    const lwfEmp = Number(form.getValues("lwfEmployee")) || 0;
    const tds = Number(form.getValues("tds")) || 0;
    const otherDed = Number(form.getValues("otherDeductions")) || 0;
    const customDedSum = Object.values(customDeductionAmounts).reduce((acc, v) => acc + (v || 0), 0);

    const totalDeductions = pfEmp + vpfAmt + esiVal + ptVal + lwfEmp + tds + otherDed + customDedSum;
    const net = gross - totalDeductions;
    
    form.setValue("netSalary", net);
  };

  // Full salary breakdown formula:
  //   Basic      = max(minimumWage, 50% of gross)   — wage-grade: never below min wage
  //   HRA        = min(50% of Basic, gross − Basic)  — capped at remaining
  //   Conveyance = min(50% of HRA,   gross − Basic − HRA)  — capped at remaining
  //   Special    = gross − Basic − HRA − Conveyance  — absorbs the rest
  //   Other = 0 (user fills manually if needed)
  const breakdownComponents = (gross: number, minimumWage = 0) => {
    const basic      = Math.max(minimumWage, Math.round(gross * 0.5));
    const afterBasic = gross - basic;                                             // ≥ 0
    const hra        = Math.min(Math.round(basic * 0.5),  afterBasic);           // 50% basic
    const afterHra   = afterBasic - hra;
    const conveyance = Math.min(Math.round(hra   * 0.5),  afterHra);            // 50% of HRA
    const special    = Math.max(0, afterHra - conveyance);
    return { basic, hra, conveyance, special };
  };

  const applyGross = (gross: number, minimumWage = 0) => {
    const { basic, hra, conveyance, special } = breakdownComponents(gross, minimumWage);
    form.setValue("basicSalary",      basic,      { shouldDirty: true, shouldValidate: true });
    form.setValue("hra",              hra,        { shouldDirty: true, shouldValidate: true });
    form.setValue("conveyance",       conveyance, { shouldDirty: true, shouldValidate: true });
    form.setValue("specialAllowance", special,    { shouldDirty: true, shouldValidate: true });
    form.setValue("otherAllowances",  0,          { shouldDirty: true, shouldValidate: true });
    setCustomEarningAmounts({});
    setGrossInputAmt(String(gross));
    setTimeout(() => calculateSalary(true), 0);
  };

  const autoBreakdownGross = (grossStr: string) => {
    const entered = Math.round(Number(grossStr) || 0);
    if (entered <= 0) {
      toast({ title: "Enter a valid Gross Salary", description: "Please enter a gross salary amount greater than 0.", variant: "destructive" });
      return;
    }
    const empId = form.getValues("employeeId");
    const emp   = employees.find(e => e.id === empId);
    const grade = emp?.wageGradeId
      ? wageGrades.find(g => g.id === emp.wageGradeId && g.status === "active")
      : undefined;
    if (grade && grade.minimumWage > 0) {
      if (entered < grade.minimumWage) {
        toast({
          title: "Below Minimum Wage",
          description: `Gross ₹${entered.toLocaleString("en-IN")} cannot be less than minimum wage ₹${grade.minimumWage.toLocaleString("en-IN")} for grade "${grade.name}".`,
          variant: "destructive",
        });
        setGrossInputAmt(String(grade.minimumWage));
        return;
      }
      applyGross(entered, grade.minimumWage);
      return;
    }
    applyGross(entered);
  };

  const createStructureMutation = useMutation({
    mutationFn: async (data: SalaryStructureFormValues) => {
      return apiRequest("POST", "/api/salary-structures", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-structures"] });
      setIsCreateOpen(false);
      form.reset();
      toast({
        title: "Salary Structure Created",
        description: "The salary structure has been created successfully.",
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

  const updateStructureMutation = useMutation({
    mutationFn: async (data: SalaryStructureFormValues & { id: string }) => {
      const { id, ...rest } = data;
      return apiRequest("PATCH", `/api/salary-structures/${id}`, rest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-structures"] });
      setIsCreateOpen(false);
      setEditingStructureId(null);
      form.reset();
      toast({
        title: "Salary Structure Updated",
        description: "The salary structure has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteStructureMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/salary-structures/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/salary-structures"] });
      toast({ title: "Salary Structure Deleted", description: "The salary structure has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updatePayrollMutation = useMutation({
    mutationFn: async (data: { id: string; totalEarnings: number; totalDeductions: number; netSalary: number; status: string }) => {
      const { id, ...rest } = data;
      return apiRequest("PATCH", `/api/payroll/${id}`, rest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      setIsPayrollEditOpen(false);
      setEditingPayroll(null);
      toast({ title: "Payroll Updated", description: "The payroll record has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePayrollMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/payroll/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      toast({ title: "Payroll Deleted", description: "The payroll record has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const finalizePayrollMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/payroll/${id}`, { status: "processed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      toast({ title: "Payroll Finalized", description: "The payroll has been marked as processed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkFinalizePayrollMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const draftIds = ids.filter(id => {
        const rec = payrollRecords.find(p => p.id === id);
        return rec?.status === "draft";
      });
      await Promise.all(draftIds.map(id => apiRequest("PATCH", `/api/payroll/${id}`, { status: "processed" })));
      return draftIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      setSelectedPayrollIds(new Set());
      toast({ title: "Payroll Finalized", description: `${count} record(s) marked as processed.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkDeletePayrollMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => apiRequest("DELETE", `/api/payroll/${id}`)));
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      setSelectedPayrollIds(new Set());
      setBulkDeleteConfirmOpen(false);
      toast({ title: "Payroll Deleted", description: `${count} record(s) deleted.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    setSelectedPayrollIds(new Set());
  }, [selectedMonth, selectedYear, selectedCompany, contractorFilter]);

  const handleEditStructure = (structure: SalaryStructure) => {
    setEditingStructureId(structure.id);
    const savedCustom = (structure as any).customEarnings || {};
    setCustomEarningAmounts(savedCustom);
    setCustomDeductionAmounts((structure as any).customDeductions || {});
    const customSum = Object.values(savedCustom as Record<string, number>).reduce((a: number, v) => a + (v || 0), 0);
    form.reset({
      employeeId: structure.employeeId,
      companyId: structure.companyId,
      basicSalary: structure.basicSalary,
      hra: structure.hra || 0,
      conveyance: structure.conveyance || 0,
      specialAllowance: structure.specialAllowance || 0,
      otherAllowances: Math.max(0, (structure.otherAllowances || 0) + (structure.medicalAllowance || 0) - customSum),
      grossSalary: structure.grossSalary,
      pfEmployee: structure.pfEmployee || 0,
      pfEmployer: structure.pfEmployer || 0,
      vpfAmount: (structure as any).vpfAmount || 0,
      esi: structure.esi || 0,
      professionalTax: structure.professionalTax || 0,
      lwfEmployee: structure.lwfEmployee || 0,
      tds: structure.tds || 0,
      otherDeductions: structure.otherDeductions || 0,
      netSalary: structure.netSalary,
      effectiveFrom: structure.effectiveFrom,
    });
    setIsCreateOpen(true);
    // Trigger auto-compute for percentage heads after form is fully populated
    setTimeout(() => calculateSalary(false), 0);
  };

  const handleStructureDialogClose = (open: boolean) => {
    setIsCreateOpen(open);
    if (!open) {
      setEditingStructureId(null);
      setGrossInputAmt("");
      setCustomEarningAmounts({});
      setCustomDeductionAmounts({});
      form.reset({
        employeeId: "",
        companyId: isSuperAdmin ? "" : (user?.companyId || ""),
        basicSalary: 0,
        hra: 0,
        conveyance: 0,
        specialAllowance: 0,
        otherAllowances: 0,
        grossSalary: 0,
        pfEmployee: 0,
        pfEmployer: 0,
        vpfAmount: 0,
        esi: 0,
        professionalTax: 0,
        lwfEmployee: 0,
        tds: 0,
        otherDeductions: 0,
        netSalary: 0,
        effectiveFrom: format(new Date(), "yyyy-MM-dd"),
      });
    }
  };

  const generatePayrollMutation = useMutation({
    mutationFn: async (companyId: string) => {
      const monthIndex = months.indexOf(selectedMonth);
      const payrollYear = parseInt(selectedYear);
      const payMonthEndDay = new Date(payrollYear, monthIndex + 1, 0).getDate();
      const payMonthStart = `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-01`;
      const payMonthEnd = `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(payMonthEndDay).padStart(2, "0")}`;

      const companyEmployees = employees.filter(e => {
        if (e.companyId !== companyId) return false;
        const joined = (e as any).dateOfJoining;
        const exited = (e as any).exitDate;
        if (joined && joined > payMonthEnd) return false;
        if (exited && exited < payMonthStart) return false;
        return true;
      });
      const daysInMonth = new Date(parseInt(selectedYear), monthIndex + 1, 0).getDate();
      
      const settingsRes = await apiRequest("GET", `/api/statutory-settings?companyId=${companyId}`);
      const companyStatutorySettings: StatutorySettings[] = await settingsRes.json();
      const settings = companyStatutorySettings[0];

      // Fetch time office policies (needed for computed weekly-off calculation)
      const topRes = await apiRequest("GET", `/api/time-office-policies?companyId=${companyId}`);
      const timeOfficePolicies: any[] = topRes.ok ? await topRes.json() : [];

      // Fetch company holidays for this month (needed for computed WO logic)
      const holidaysRes = await apiRequest("GET", `/api/holidays?companyId=${companyId}`);
      const companyHolidays: any[] = holidaysRes.ok ? await holidaysRes.json() : [];

      // Helper: resolve which time-office policy applies to an employee
      const getPolicyForEmployee = (emp: any) => {
        const active = timeOfficePolicies.filter((p: any) => p.status === "active");
        if (emp.timeOfficePolicyId) {
          const match = active.find((p: any) => p.id === emp.timeOfficePolicyId);
          if (match) return match;
        }
        return active.find((p: any) => p.isDefault) || active[0] || null;
      };

      // Helper: is a given Date a weekly-off day for an employee (per policy)?
      const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
      const isDayWeeklyOff = (policy: any, d: Date): boolean => {
        if (!policy) return false;
        const name = dayNames[d.getDay()];
        return name === policy.weeklyOff1 || name === policy.weeklyOff2;
      };

      // Compute earned WO days for a given employee in a given month.
      // Formula: earnedWOs = round(presentTotal × wosPerWeek / workingDaysPerWeek)
      // Applies only to WO days with NO stored record (manual day-by-day attendance).
      // Any stored record on a WO day (weekend or absent) is respected as-is.
      const computeEarnedWOs = (emp: any, periodAtt: any[], year: number, monthIdx: number): number => {
        const policy = getPolicyForEmployee(emp);
        if (!policy) return 0;
        const daysCount = new Date(year, monthIdx + 1, 0).getDate();
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        const wosPerWeek = (policy.weeklyOff1 ? 1 : 0) + (policy.weeklyOff2 ? 1 : 0);
        const workingDaysPerWeek = Math.max(1, 7 - wosPerWeek);

        // Count stored presents
        const storedPresents = periodAtt.filter((a: any) => a.status === "present").length;
        const storedHalfDays = periodAtt.filter((a: any) => a.status === "half_day").length;
        const presentTotal = storedPresents + storedHalfDays * 0.5;

        // Count WO days with no stored record (past dates only)
        // "auto" WO means any unrecorded past day can absorb the earned WO
        const hasAutoWO = policy.weeklyOff1 === "auto" || policy.weeklyOff2 === "auto";
        let unrecordedWoDays = 0;
        for (let d = 1; d <= daysCount; d++) {
          const date = new Date(year, monthIdx, d);
          if (date > today) break;
          // Build date string directly to avoid UTC timezone shift (toISOString shifts IST dates back 1 day)
          const dateStr = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const storedRecord = periodAtt.find((a: any) => a.date === dateStr);
          if (!storedRecord && (hasAutoWO || isDayWeeklyOff(policy, date))) unrecordedWoDays++;
        }

        if (unrecordedWoDays === 0) return 0;

        // Proportional WOs capped at unrecorded WO days
        // Use Math.floor so we never inflate WO count beyond what was actually earned
        const earned = Math.floor(presentTotal * wosPerWeek / workingDaysPerWeek);
        return Math.min(Math.max(0, earned), unrecordedWoDays);
      };

      // Fetch compliance setup to get pf_type and esic_type per employee
      const complianceSetupMap: Record<string, any> = {};
      try {
        const csRes = await apiRequest("GET", `/api/compliance/setup?companyId=${companyId}`);
        if (csRes.ok) {
          const csData: any[] = await csRes.json();
          for (const cs of csData) complianceSetupMap[cs.employeeId] = cs;
        }
      } catch (_) {}
      
      let generated = 0;
      let skippedFinalized = 0;
      let regenerated = 0;
      
      for (const emp of companyEmployees) {
        const empStructures = salaryStructures
          .filter(s => s.employeeId === emp.id && s.effectiveFrom <= payMonthEnd)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
        const structure = empStructures[0];
        if (!structure) continue;

        const attendanceRes = await apiRequest("GET", `/api/attendance?employeeId=${emp.id}`);
        const attendanceData: Attendance[] = await attendanceRes.json();
        
        const periodAttendance = attendanceData.filter(a => {
          const d = new Date(a.date);
          return d.getMonth() === monthIndex && d.getFullYear() === parseInt(selectedYear);
        });

        const presentDays = periodAttendance.filter(a => a.status === "present").length;
        const leaveDays = periodAttendance.filter(a => a.status === "on_leave").length;
        const halfDays = periodAttendance.filter(a => a.status === "half_day").length;
        // Stored WO records (Quick Entry / manually marked) + computed WOs from per-week rule
        const storedWeeklyOffDays = periodAttendance.filter(a => a.status === "weekend").length;
        const computedWODays = computeEarnedWOs(emp, periodAttendance, payrollYear, monthIndex);
        const weeklyOffDays = storedWeeklyOffDays + computedWODays;
        const holidayDays = periodAttendance.filter(a => a.status === "holiday").length;

        // Sum OT hours from present/half-day records ("HH:MM" or decimal string)
        const parseOtH = (val: string | null | undefined): number => {
          if (!val || val === "0") return 0;
          if (String(val).includes(":")) {
            const [h, m] = String(val).split(":").map(Number);
            return (h || 0) + (m || 0) / 60;
          }
          return parseFloat(String(val)) || 0;
        };
        const totalOtHours = parseFloat(
          periodAttendance
            .filter(a => a.status === "present" || a.status === "half_day")
            .reduce((sum, a) => sum + parseOtH((a as any).otHours), 0)
            .toFixed(2)
        );

        // Pay Days = days employee is entitled to be paid for
        // = Present Days + Half Days (as 0.5) + Weekly Offs + Holidays + Paid Leaves
        const effectivePresentDays = presentDays + (halfDays * 0.5);
        const payDays = effectivePresentDays + weeklyOffDays + holidayDays + leaveDays;
        
        const workingDays = daysInMonth; 
        // Proration based on Pay Days, capped at 1 to avoid over-payment
        const prorationFactor = workingDays > 0 ? Math.min(payDays / workingDays, 1) : 0;

        const basicSalary = Math.round(structure.basicSalary * prorationFactor);
        const grossSalary = Math.round(structure.grossSalary * prorationFactor);
        
        let pfEmployee = 0;
        let esi = 0;
        let pt = 0;

        const empSetup = complianceSetupMap[emp.id] || {};
        const pfType   = empSetup.pfType   || "actual";
        const esicType = empSetup.esicType || "actual";

        if (settings?.pfEnabled && emp.pfApplicable) {
          const pfWageCeiling = Number(settings.pfWageCeiling) || 15000;
          // Always deduct PF on earned/prorated basic salary (actual wages paid for the period)
          const pfBase = Math.min(basicSalary, pfWageCeiling);
          pfEmployee = Math.round(pfBase * (Number(settings.pfEmployeePercent) || 12) / 100);
        }

        if (settings?.esicEnabled && emp.esiApplicable) {
          const wageCeiling = Number(settings.esicWageCeiling) || 21000;
          const percent = Number(settings.esicEmployeePercent) || 75;
          // Eligibility: always check contracted gross (determines coverage regardless of attendance)
          // Deduction base: always on earned/prorated salary (actual wages paid for the period)
          const eligibilityGross = structure.grossSalary;
          if (eligibilityGross <= wageCeiling) {
            if (settings.esicCalcOnGross) {
              // Old Setup: ESIC on earned gross salary
              const esicBase = Math.min(grossSalary, wageCeiling);
              esi = Math.round(esicBase * percent / 10000);
            } else {
              // New Rule (Jan 2026): base = higher of earned Basic or 50% of earned Gross, capped at ceiling
              const esicBase = Math.min(Math.max(basicSalary, grossSalary * 0.5), wageCeiling);
              esi = Math.round(esicBase * percent / 10000);
            }
          }
        }

        if (settings?.ptEnabled) {
          pt = Math.min(Number(settings.ptMaxAmount) || 200, 200);
        }

        let lwfEmployee = 0;
        if (settings?.lwfEnabled && emp.lwfApplicable) {
          const lwfBase = (settings.lwfCalculationBase === "basic") ? basicSalary : grossSalary;
          const empPercent = Number(settings.lwfEmployeePercent) || 20;
          const empCap = Number(settings.lwfEmployeeMaxCap) || 34;
          lwfEmployee = Math.min(Math.round(lwfBase * empPercent / 10000), empCap);
        }

        let monthlyBonus = 0;
        if (emp.bonusApplicable && emp.bonusPaidMonthly && settings?.bonusEnabled) {
          const bonusPercent = Number(settings.bonusPercent) || 833;
          const bonusCeiling = Number(settings.bonusMaxCeiling) || 7000;
          // Use RATE salary from structure (not prorated) for correct wage ceiling application,
          // then prorate the resulting bonus by Pay Days
          const rateBonusBase = settings.bonusCalculationBase === "gross"
            ? (structure.grossSalary || 0)
            : (structure.basicSalary || 0);
          const rateBonusWage = (settings as any).bonusSkipCeiling ? rateBonusBase : Math.min(rateBonusBase, bonusCeiling);
          const fullMonthBonus = Math.round(rateBonusWage * bonusPercent / 10000);
          monthlyBonus = Math.round(fullMonthBonus * prorationFactor);
        }
        
        // OT Amount per India standard: (Gross ÷ 26 working days ÷ 8 hrs) × multiplier × OT hours
        // 26 is the statutory base for OT calculation (Factories Act / Min Wages Act)
        // multiplier: 1X = single rate, 2X = double rate (overtime premium)
        const OT_BASE_DAYS = 26;
        const otMultiplier = (emp as any).otApplicable
          ? ((emp as any).otRate === "1x" ? 1 : 2)
          : 0;
        const otRatePerHour = otMultiplier > 0
          ? Math.round((structure.grossSalary / OT_BASE_DAYS / 8) * otMultiplier * 100) / 100
          : 0;
        const otAmount = (emp as any).otApplicable
          ? Math.round(otRatePerHour * totalOtHours)
          : 0;

        const hra = Math.round((structure.hra || 0) * prorationFactor);
        const conveyance = Math.round((structure.conveyance || 0) * prorationFactor);
        const specialAllowance = Math.round((structure.specialAllowance || 0) * prorationFactor);
        const otherAllowances = Math.round(((structure.otherAllowances || 0) + (structure.medicalAllowance || 0)) * prorationFactor);

        // Compute custom earning head display amounts for the payslip breakdown.
        // grossSalary already includes ALL custom earning components (both fixed and
        // percentage heads) as saved at structure-creation time. We simply prorate
        // the saved amounts for display; we do NOT re-derive from current percentages
        // because doing so can produce a negative "adjustment" that strips allowances
        // from totalEarnings when a percentage head's formula has drifted from what
        // was saved in the structure (e.g. percentage changed, or base changed).
        // To update component amounts the salary structure must be re-saved.
        const savedCustom: Record<string, number> = (structure as any).customEarnings || {};
        const proratedCustomEarnings: Record<string, number> = {};
        for (const head of activeEarningHeads) {
          const displayAmt = Math.round((savedCustom[head.id] || 0) * prorationFactor);
          if (displayAmt > 0) {
            proratedCustomEarnings[head.id] = displayAmt;
          }
        }

        // totalEarnings = prorated gross (bakes in all components) + bonus + OT
        const totalEarnings = grossSalary + monthlyBonus + otAmount;

        // Compute custom deduction head amounts (prorated)
        const savedCustomDed: Record<string, number> = (structure as any).customDeductions || {};
        const proratedCustomDeductions: Record<string, number> = {};
        for (const head of activeDeductionHeads) {
          let displayAmt = 0;
          if (head.type === "percentage" && (head.percentage ?? 0) > 0) {
            const base = head.calculationBase === "basic" ? basicSalary : grossSalary;
            displayAmt = Math.round(base * (head.percentage ?? 0) / 100);
          } else {
            displayAmt = Math.round((savedCustomDed[head.id] || 0) * prorationFactor);
          }
          if (displayAmt > 0) {
            proratedCustomDeductions[head.id] = displayAmt;
          }
        }
        const customDedTotal = Object.values(proratedCustomDeductions).reduce((s, v) => s + (v || 0), 0);

        // Loan/Advance deduction: sum installmentAmount for active loans where deductionStartMonth <= payrollYM
        const payrollYM = `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}`;
        const empLoans = loanAdvances.filter(l =>
          l.employeeId === emp.id &&
          l.status === "active" &&
          l.deductionStartMonth &&
          l.deductionStartMonth <= payrollYM &&
          l.installmentAmount > 0
        );
        const scheduledLoanDeduction = empLoans.reduce((sum: number, l: any) => sum + Number(l.installmentAmount), 0);
        // Cap loan deduction so net salary never goes negative
        // VPF: prorate in same proportion as payroll (if full month, full VPF; if partial, prorate)
        const vpfDeduction = Math.round(((structure as any).vpfAmount || 0) * prorationFactor);

        const deductionsBeforeLoan = pfEmployee + vpfDeduction + esi + pt + lwfEmployee + (structure.tds || 0) + (structure.otherDeductions || 0) + customDedTotal;
        const netBeforeLoan = Math.max(0, totalEarnings - deductionsBeforeLoan);
        const loanDeduction = Math.min(scheduledLoanDeduction, netBeforeLoan);

        const totalDeductions = deductionsBeforeLoan + loanDeduction;
        const netSalary = totalEarnings - totalDeductions; // always >= 0

        const payrollData = {
          employeeId: emp.id,
          companyId: companyId,
          month: selectedMonth,
          year: parseInt(selectedYear),
          basicSalary: basicSalary,
          hra: hra,
          conveyance: conveyance,
          medicalAllowance: 0,
          specialAllowance: specialAllowance,
          otherAllowances: otherAllowances,
          bonus: monthlyBonus,
          otHours: String(totalOtHours),
          otAmount: otAmount,
          customEarnings: proratedCustomEarnings,
          customDeductions: proratedCustomDeductions,
          totalEarnings: totalEarnings,
          pfEmployee: pfEmployee,
          vpfAmount: vpfDeduction,
          esi: esi,
          professionalTax: pt,
          lwfEmployee: lwfEmployee,
          tds: structure.tds || 0,
          otherDeductions: structure.otherDeductions || 0,
          loanDeduction: loanDeduction,
          totalDeductions: totalDeductions,
          netSalary: netSalary,
          workingDays: workingDays,
          presentDays: effectivePresentDays,
          payDays: payDays,
          leaveDays: leaveDays,
          status: "draft",
          generatedAt: new Date().toISOString(),
        };
        
        try {
          const response = await apiRequest("POST", "/api/payroll", payrollData);
          const result = await response.json();
          if (result.id && result.generatedAt === payrollData.generatedAt) {
            regenerated++;
          } else {
            generated++;
          }
        } catch (err: any) {
          if (err.message?.includes("finalized") || err.message?.includes("Paid")) {
            skippedFinalized++;
          } else {
            throw err;
          }
        }
      }
      
      return { generated, regenerated, skippedFinalized };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
      const parts: string[] = [];
      if (result.generated > 0) parts.push(`${result.generated} new`);
      if (result.regenerated > 0) parts.push(`${result.regenerated} regenerated`);
      if (result.skippedFinalized > 0) parts.push(`${result.skippedFinalized} skipped (already paid)`);
      toast({
        title: "Payroll Generated",
        description: `${selectedMonth} ${selectedYear}: ${parts.join(", ") || "No employees with salary structures"}`,
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

  const getEmployeeName = (employeeId: string) => {
    const employee = prAllEmployees.find(e => e.id === employeeId);
    return employee ? `[${employee.employeeCode}] ${employee.firstName} ${employee.lastName}` : "Unknown";
  };

  const getCompanyName = (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    return company?.companyName || "Unknown";
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const totalPayroll = filteredPayroll.reduce((sum, p) => sum + p.netSalary, 0);
  const totalEarnings = filteredPayroll.reduce((sum, p) => sum + p.totalEarnings, 0);
  const totalDeductions = filteredPayroll.reduce((sum, p) => sum + p.totalDeductions, 0);

  const handleDownloadSalaryTemplate = () => {
    const companyId = isSuperAdmin ? selectedCompany : user?.companyId;
    const params = companyId && companyId !== "__all__" ? `?companyId=${encodeURIComponent(companyId)}` : "";
    window.open(`/api/salary-structures/bulk-template${params}`, "_blank");
  };

  const handleBulkSalaryUpload = async (file: File) => {
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const companyId = isSuperAdmin ? selectedCompany : user?.companyId;
      if (companyId && companyId !== "__all__") {
        formData.append("companyId", companyId);
      }
      const res = await fetch("/api/salary-structures/bulk-upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Upload Failed", description: result.error || "Failed to process file", variant: "destructive" });
        setBulkUploading(false);
        return;
      }
      setBulkResult(result);
      if (result.created > 0 || result.updated > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/salary-structures"] });
      }
      toast({
        title: "Upload Complete",
        description: `${result.created} created, ${result.updated ?? 0} updated, ${result.skipped} skipped`,
        variant: (result.created > 0 || result.updated > 0) ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Upload failed", variant: "destructive" });
    }
    setBulkUploading(false);
  };

  return (
    <div className="p-6" data-testid="payroll-page">
      <PageHeader
        className="mb-6"
        title="Payroll Management"
        description="Manage salary structures and process payroll"
        actions={
          <>
          <Button
            variant="outline"
            onClick={() => { setBulkUploadOpen(true); setBulkResult(null); }}
          >
            <Upload className="h-4 w-4 mr-2" />
            Bulk Upload
          </Button>
          <SalaryStructureDialog
            open={isCreateOpen}
            onOpenChange={handleStructureDialogClose}
            can={can}
            editingStructureId={editingStructureId}
            form={form}
            customEarningAmounts={customEarningAmounts}
            setCustomEarningAmounts={setCustomEarningAmounts}
            customDeductionAmounts={customDeductionAmounts}
            setCustomDeductionAmounts={setCustomDeductionAmounts}
            createStructureMutation={createStructureMutation}
            updateStructureMutation={updateStructureMutation}
            isSuperAdmin={isSuperAdmin}
            companies={companies}
            userCompanyId={user?.companyId ?? undefined}
            employees={employees}
            payrollRecords={payrollRecords}
            monthNames={SS_MONTH_NAMES}
            wageGrades={wageGrades}
            applyGross={applyGross}
            calculateSalary={calculateSalary}
            dialogWageGrade={dialogWageGrade}
            isGrossCompliantWithMinWage={isGrossCompliantWithMinWage}
            watchGrossSalary={watchGrossSalary}
            grossInputAmt={grossInputAmt}
            setGrossInputAmt={setGrossInputAmt}
            autoBreakdownGross={autoBreakdownGross}
            activeEarningHeads={activeEarningHeads}
            activeDeductionHeads={activeDeductionHeads}
            statutorySettingsList={statutorySettingsList}
            watchCompanyId={watchCompanyId}
            minEffectiveDateStr={minEffectiveDateStr}
            latestEmpPayroll={latestEmpPayroll}
          />
          </>
        }
      />

      {["super_admin", "company_admin", "hr_admin"].includes(user?.role || "") && (
        <div className="mb-6">
          <AiInsightsPanel
            endpoint={`/api/ai/insights/executive?month=${months.indexOf(selectedMonth) + 1}&year=${selectedYear}`}
            title="Executive AI Summary"
            description="Company-wide workforce health for the selected period."
            actionLabel="the executive summary"
            testIdPrefix="executive-summary"
          />
        </div>
      )}

      <PayrollSummaryCards
        totalPayroll={totalPayroll}
        totalEarnings={totalEarnings}
        totalDeductions={totalDeductions}
        employeeCount={filteredPayroll.length}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        formatCurrency={formatCurrency}
      />

      <Tabs defaultValue="payroll">
        <TabsList className="mb-4">
          <TabsTrigger value="payroll" data-testid="tab-payroll">Payroll</TabsTrigger>
          <TabsTrigger value="structures" data-testid="tab-structures">Salary Structures</TabsTrigger>
          <TabsTrigger value="fnf" data-testid="tab-fnf">F&F Settlement</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll">
          <PayrollTab
            isSuperAdmin={isSuperAdmin}
            userCompanyName={companies.find(c => c.id === user?.companyId)?.companyName || ""}
            companies={companies}
            selectedCompany={selectedCompany}
            setSelectedCompany={setSelectedCompany}
            myContractors={myContractors}
            myPrincipalEmployers={myPrincipalEmployers}
            contractorFilter={contractorFilter}
            setContractorFilter={setContractorFilter}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
            months={months}
            filteredPayroll={filteredPayroll}
            isLoadingPayroll={isLoadingPayroll}
            payrollSearch={payrollSearch}
            setPayrollSearch={setPayrollSearch}
            selectedPayrollIds={selectedPayrollIds}
            setSelectedPayrollIds={setSelectedPayrollIds}
            bulkDeleteConfirmOpen={bulkDeleteConfirmOpen}
            setBulkDeleteConfirmOpen={setBulkDeleteConfirmOpen}
            statusColors={statusColors}
            can={can}
            isGeneratePending={generatePayrollMutation.isPending}
            onGenerate={(companyId) => generatePayrollMutation.mutate(companyId)}
            onBulkFinalize={(ids) => bulkFinalizePayrollMutation.mutate(ids)}
            isBulkFinalizePending={bulkFinalizePayrollMutation.isPending}
            onBulkDelete={(ids) => bulkDeletePayrollMutation.mutate(ids)}
            isBulkDeletePending={bulkDeletePayrollMutation.isPending}
            onFinalize={(id) => finalizePayrollMutation.mutate(id)}
            onDelete={(id) => deletePayrollMutation.mutate(id)}
            onView={(record) => setViewingPayrollRecord(record)}
            onEdit={(record) => { setEditingPayroll(record); setIsPayrollEditOpen(true); }}
            getEmployeeName={getEmployeeName}
            formatCurrency={formatCurrency}
          />
        </TabsContent>

        <TabsContent value="structures">
          <StructuresTab
            isLoading={isLoadingStructures}
            filteredStructures={filteredStructures}
            sortedStructures={sortedStructures}
            structSort={structSort}
            toggleStructSort={toggleStructSort}
            structureSearch={structureSearch}
            setStructureSearch={setStructureSearch}
            payrollRecords={payrollRecords}
            getEmployeeName={getEmployeeName}
            formatCurrency={formatCurrency}
            getEmployeeWageGrade={getEmployeeWageGrade}
            onEditStructure={handleEditStructure}
            onDeleteStructure={(id) => deleteStructureMutation.mutate(id)}
          />
        </TabsContent>
        <TabsContent value="fnf">
          <FnfSettlementPage />
        </TabsContent>
      </Tabs>

      {editingPayroll && (
        <Dialog open={isPayrollEditOpen} onOpenChange={(open) => { setIsPayrollEditOpen(open); if (!open) setEditingPayroll(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Payroll Record</DialogTitle>
              <DialogDescription>Update payroll record details</DialogDescription>
            </DialogHeader>
            <PayrollEditForm
              payroll={editingPayroll}
              onSubmit={(data) => updatePayrollMutation.mutate(data)}
              isPending={updatePayrollMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      <BulkUploadDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        isSuperAdmin={isSuperAdmin}
        selectedCompany={selectedCompany}
        setSelectedCompany={setSelectedCompany}
        companies={companies}
        bulkFileInputRef={bulkFileInputRef}
        bulkUploading={bulkUploading}
        bulkResult={bulkResult}
        onDownloadTemplate={handleDownloadSalaryTemplate}
        onUpload={handleBulkSalaryUpload}
      />

      <PayrollDetailsDialog
        record={viewingPayrollRecord}
        onOpenChange={(open) => { if (!open) setViewingPayrollRecord(null); }}
        allEmployees={prAllEmployees}
        earningHeads={earningHeads}
        deductionHeads={deductionHeads}
        loanAdvances={loanAdvances}
        statusColors={statusColors}
        getEmployeeName={getEmployeeName}
        formatCurrency={formatCurrency}
      />
    </div>
  );
}
