import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { DollarSign, Plus, FileText, Users, Calculator, Download, Building2, Edit, Trash2, CheckCircle, Upload, FileSpreadsheet, Loader2, Eye, AlertTriangle, ShieldCheck } from "lucide-react";
import { SearchableEmployeeSelect } from "@/components/searchable-employee-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Payroll, SalaryStructure, Employee, Company, StatutorySettings, Attendance, WageGrade } from "@shared/schema";
import FnfSettlementPage from "@/pages/fnf-settlement";

const salaryStructureSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  companyId: z.string().min(1, "Company is required"),
  basicSalary: z.coerce.number().min(1, "Basic salary is required"),
  hra: z.coerce.number().default(0),
  conveyance: z.coerce.number().default(0),
  medicalAllowance: z.coerce.number().default(0),
  specialAllowance: z.coerce.number().default(0),
  otherAllowances: z.coerce.number().default(0),
  grossSalary: z.coerce.number(),
  pfEmployee: z.coerce.number().default(0),
  pfEmployer: z.coerce.number().default(0),
  esi: z.coerce.number().default(0),
  professionalTax: z.coerce.number().default(0),
  lwfEmployee: z.coerce.number().default(0),
  tds: z.coerce.number().default(0),
  otherDeductions: z.coerce.number().default(0),
  netSalary: z.coerce.number(),
  effectiveFrom: z.string().min(1, "Effective date is required"),
});

type SalaryStructureFormValues = z.infer<typeof salaryStructureSchema>;

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  processed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
};

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function PayrollEditForm({ payroll, onSubmit, isPending }: { payroll: Payroll; onSubmit: (data: { id: string; totalEarnings: number; totalDeductions: number; netSalary: number; status: string }) => void; isPending: boolean }) {
  const [totalEarnings, setTotalEarnings] = useState(payroll.totalEarnings);
  const [totalDeductions, setTotalDeductions] = useState(payroll.totalDeductions);
  const [netSalary, setNetSalary] = useState(payroll.netSalary);
  const [status, setStatus] = useState(payroll.status);

  useEffect(() => {
    setTotalEarnings(payroll.totalEarnings);
    setTotalDeductions(payroll.totalDeductions);
    setNetSalary(payroll.netSalary);
    setStatus(payroll.status);
  }, [payroll.id]);

  useEffect(() => {
    setNetSalary(totalEarnings - totalDeductions);
  }, [totalEarnings, totalDeductions]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ id: payroll.id, totalEarnings, totalDeductions, netSalary: totalEarnings - totalDeductions, status }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Total Earnings</label>
          <Input type="number" value={totalEarnings} onChange={(e) => setTotalEarnings(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Total Deductions</label>
          <Input type="number" value={totalDeductions} onChange={(e) => setTotalDeductions(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Net Salary</label>
          <Input type="number" value={netSalary} readOnly className="bg-muted font-bold" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Updating..." : "Update Payroll"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function PayrollPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = ["super_admin", "company_admin", "hr_admin", "manager"].includes(user?.role || "");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingStructureId, setEditingStructureId] = useState<string | null>(null);
  const [editingPayroll, setEditingPayroll] = useState<Payroll | null>(null);
  const [isPayrollEditOpen, setIsPayrollEditOpen] = useState(false);
  const [viewingPayrollRecord, setViewingPayrollRecord] = useState<Payroll | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>(isSuperAdmin ? "__all__" : (user?.companyId || ""));
  const [selectedMonth, setSelectedMonth] = useState(months[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);
  const [grossInputAmt, setGrossInputAmt] = useState<string>("");

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: salaryStructures = [], isLoading: isLoadingStructures } = useQuery<SalaryStructure[]>({
    queryKey: ["/api/salary-structures"],
  });

  const { data: wageGrades = [] } = useQuery<WageGrade[]>({
    queryKey: ["/api/wage-grades"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/wage-grades");
      return res.json();
    },
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
      medicalAllowance: 0,
      specialAllowance: 0,
      otherAllowances: 0,
      grossSalary: 0,
      pfEmployee: 0,
      pfEmployer: 0,
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

  const { data: statutoryData } = useQuery<StatutorySettings | StatutorySettings[]>({
    queryKey: ["/api/statutory-settings", watchCompanyId],
    queryFn: async () => {
      const companyId = form.getValues("companyId");
      const res = await apiRequest("GET", companyId ? `/api/statutory-settings?companyId=${companyId}` : "/api/statutory-settings");
      return res.json();
    }
  });

  const statutorySettingsList = Array.isArray(statutoryData) 
    ? statutoryData 
    : (statutoryData ? [statutoryData] : []);

  const filteredStructures = selectedCompany === "__all__"
    ? salaryStructures
    : salaryStructures.filter(s => s.companyId === selectedCompany);

  const filteredPayroll = payrollRecords.filter(p => 
    (selectedCompany === "__all__" || p.companyId === selectedCompany) &&
    p.month === selectedMonth &&
    p.year === parseInt(selectedYear)
  );

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

  const calculateSalary = (autoCalculateStatutory = true) => {
    const companyId = form.getValues("companyId");
    const employeeId = form.getValues("employeeId");
    const basic = Number(form.getValues("basicSalary")) || 0;
    const hra = Number(form.getValues("hra")) || 0;
    const conveyance = Number(form.getValues("conveyance")) || 0;
    const medical = Number(form.getValues("medicalAllowance")) || 0;
    const special = Number(form.getValues("specialAllowance")) || 0;
    const other = Number(form.getValues("otherAllowances")) || 0;
    
    const gross = basic + hra + conveyance + medical + special + other;
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
    const esiVal = Number(form.getValues("esi")) || 0;
    const ptVal = Number(form.getValues("professionalTax")) || 0;
    const lwfEmp = Number(form.getValues("lwfEmployee")) || 0;
    const tds = Number(form.getValues("tds")) || 0;
    const otherDed = Number(form.getValues("otherDeductions")) || 0;
    
    const totalDeductions = pfEmp + esiVal + ptVal + lwfEmp + tds + otherDed;
    const net = gross - totalDeductions;
    
    form.setValue("netSalary", net);
  };

  // Auto-breakdown: given a gross salary, distribute into standard India payroll components
  const autoBreakdownGross = (grossStr: string) => {
    const gross = Math.round(Number(grossStr) || 0);
    if (gross <= 0) {
      toast({ title: "Enter a valid Gross Salary", description: "Please enter a gross salary amount greater than 0.", variant: "destructive" });
      return;
    }
    // Standard India breakdown
    const basic      = Math.round(gross * 0.40);            // 40% of gross
    const hra        = Math.round(basic * 0.50);            // 50% of basic (20% gross)
    const conveyance = Math.min(1600, Math.round(gross * 0.05));  // ₹1,600 max (tax-exempt)
    const medical    = Math.min(1250, Math.round(gross * 0.04));  // ₹1,250 max (standard)
    const special    = Math.max(0, gross - basic - hra - conveyance - medical);

    form.setValue("basicSalary", basic, { shouldDirty: true, shouldValidate: true });
    form.setValue("hra", hra, { shouldDirty: true, shouldValidate: true });
    form.setValue("conveyance", conveyance, { shouldDirty: true, shouldValidate: true });
    form.setValue("medicalAllowance", medical, { shouldDirty: true, shouldValidate: true });
    form.setValue("specialAllowance", special, { shouldDirty: true, shouldValidate: true });
    form.setValue("otherAllowances", 0, { shouldDirty: true, shouldValidate: true });
    // Re-run full calculation including statutory deductions
    setTimeout(() => calculateSalary(true), 0);
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

  const handleEditStructure = (structure: SalaryStructure) => {
    setEditingStructureId(structure.id);
    form.reset({
      employeeId: structure.employeeId,
      companyId: structure.companyId,
      basicSalary: structure.basicSalary,
      hra: structure.hra || 0,
      conveyance: structure.conveyance || 0,
      medicalAllowance: structure.medicalAllowance || 0,
      specialAllowance: structure.specialAllowance || 0,
      otherAllowances: structure.otherAllowances || 0,
      grossSalary: structure.grossSalary,
      pfEmployee: structure.pfEmployee || 0,
      pfEmployer: structure.pfEmployer || 0,
      esi: structure.esi || 0,
      professionalTax: structure.professionalTax || 0,
      lwfEmployee: structure.lwfEmployee || 0,
      tds: structure.tds || 0,
      otherDeductions: structure.otherDeductions || 0,
      netSalary: structure.netSalary,
      effectiveFrom: structure.effectiveFrom,
    });
    setIsCreateOpen(true);
  };

  const handleStructureDialogClose = (open: boolean) => {
    setIsCreateOpen(open);
    if (!open) {
      setEditingStructureId(null);
      setGrossInputAmt("");
      form.reset({
        employeeId: "",
        companyId: isSuperAdmin ? "" : (user?.companyId || ""),
        basicSalary: 0,
        hra: 0,
        conveyance: 0,
        medicalAllowance: 0,
        specialAllowance: 0,
        otherAllowances: 0,
        grossSalary: 0,
        pfEmployee: 0,
        pfEmployer: 0,
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
        let unrecordedWoDays = 0;
        for (let d = 1; d <= daysCount; d++) {
          const date = new Date(year, monthIdx, d);
          if (date > today) break;
          const dateStr = date.toISOString().slice(0, 10);
          const storedRecord = periodAtt.find((a: any) => a.date === dateStr);
          if (!storedRecord && isDayWeeklyOff(policy, date)) unrecordedWoDays++;
        }

        if (unrecordedWoDays === 0) return 0;

        // Proportional WOs capped at unrecorded WO days
        const earned = Math.round(presentTotal * wosPerWeek / workingDaysPerWeek);
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

        const totalEarnings = grossSalary + monthlyBonus + otAmount;

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
        const deductionsBeforeLoan = pfEmployee + esi + pt + lwfEmployee + (structure.tds || 0) + (structure.otherDeductions || 0);
        const netBeforeLoan = Math.max(0, totalEarnings - deductionsBeforeLoan);
        const loanDeduction = Math.min(scheduledLoanDeduction, netBeforeLoan);

        const totalDeductions = deductionsBeforeLoan + loanDeduction;
        const netSalary = totalEarnings - totalDeductions; // always >= 0

        const hra = Math.round((structure.hra || 0) * prorationFactor);
        const conveyance = Math.round((structure.conveyance || 0) * prorationFactor);
        const medicalAllowance = Math.round((structure.medicalAllowance || 0) * prorationFactor);
        const specialAllowance = Math.round((structure.specialAllowance || 0) * prorationFactor);
        const otherAllowances = Math.round((structure.otherAllowances || 0) * prorationFactor);

        const payrollData = {
          employeeId: emp.id,
          companyId: companyId,
          month: selectedMonth,
          year: parseInt(selectedYear),
          basicSalary: basicSalary,
          hra: hra,
          conveyance: conveyance,
          medicalAllowance: medicalAllowance,
          specialAllowance: specialAllowance,
          otherAllowances: otherAllowances,
          bonus: monthlyBonus,
          otHours: String(totalOtHours),
          otAmount: otAmount,
          totalEarnings: totalEarnings,
          pfEmployee: pfEmployee,
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
          payDays: Math.round(payDays),
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
    const employee = employees.find(e => e.id === employeeId);
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
    window.open("/api/salary-structures/bulk-template", "_blank");
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Payroll Management</h1>
          <p className="text-muted-foreground">Manage salary structures and process payroll</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => { setBulkUploadOpen(true); setBulkResult(null); }}
          >
            <Upload className="h-4 w-4 mr-2" />
            Bulk Upload
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={handleStructureDialogClose}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-structure">
                <Plus className="h-4 w-4 mr-2" />
                Add Salary Structure
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingStructureId ? "Edit Salary Structure" : "Create Salary Structure"}</DialogTitle>
              <DialogDescription>Define salary components for an employee</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => editingStructureId ? updateStructureMutation.mutate({ ...data, id: editingStructureId }) : createStructureMutation.mutate(data))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {isSuperAdmin ? (
                    <FormField
                      control={form.control}
                      name="companyId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company</FormLabel>
                          <Select 
                            value={field.value} 
                            onValueChange={(value) => {
                              field.onChange(value);
                              form.setValue("employeeId", "");
                            }}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-structure-company">
                                <SelectValue placeholder="Select company" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {companies.map((company) => (
                                <SelectItem key={company.id} value={company.id}>{company.companyName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="space-y-2">
                      <FormLabel>Company</FormLabel>
                      <p className="text-sm font-medium">{companies.find(c => c.id === user?.companyId)?.companyName || "—"}</p>
                    </div>
                  )}
                  <FormField
                    control={form.control}
                    name="employeeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employee</FormLabel>
                        <SearchableEmployeeSelect
                          employees={employees.filter(e => e.companyId === form.watch("companyId"))}
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            if (!editingStructureId) {
                              const emp = employees.find(e => e.id === value);
                              const grade = emp?.wageGradeId
                                ? wageGrades.find(g => g.id === emp.wageGradeId && g.status === "active")
                                : undefined;
                              if (grade && grade.minimumWage > 0) {
                                // Auto-breakdown from minimum wage
                                const gross = grade.minimumWage;
                                setGrossInputAmt(String(gross));
                                const basic      = Math.round(gross * 0.40);
                                const hra        = Math.round(basic * 0.50);
                                const conveyance = Math.min(1600, Math.round(gross * 0.05));
                                const medical    = Math.min(1250, Math.round(gross * 0.04));
                                const special    = Math.max(0, gross - basic - hra - conveyance - medical);
                                form.setValue("basicSalary", basic, { shouldDirty: true, shouldValidate: true });
                                form.setValue("hra", hra, { shouldDirty: true, shouldValidate: true });
                                form.setValue("conveyance", conveyance, { shouldDirty: true, shouldValidate: true });
                                form.setValue("medicalAllowance", medical, { shouldDirty: true, shouldValidate: true });
                                form.setValue("specialAllowance", special, { shouldDirty: true, shouldValidate: true });
                                form.setValue("otherAllowances", 0, { shouldDirty: true, shouldValidate: true });
                                setTimeout(() => calculateSalary(true), 0);
                                return;
                              }
                            }
                            calculateSalary();
                          }}
                          placeholder="Search by name or ID..."
                          data-testid="select-structure-employee"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {dialogWageGrade && (
                  <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${isGrossCompliantWithMinWage ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950" : "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"}`}>
                    {isGrossCompliantWithMinWage ? (
                      <ShieldCheck className="h-5 w-5 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    )}
                    <div className="flex-1">
                      <p className={`font-medium ${isGrossCompliantWithMinWage ? "text-green-800 dark:text-green-300" : "text-amber-800 dark:text-amber-300"}`}>
                        {isGrossCompliantWithMinWage ? "Minimum Wage Compliant" : "Below Minimum Wage"}
                      </p>
                      <p className={`mt-0.5 ${isGrossCompliantWithMinWage ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
                        Wage Grade: <strong>{dialogWageGrade.name}</strong> — Minimum Wage:{" "}
                        <strong>
                          {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(dialogWageGrade.minimumWage)}
                          {dialogWageGrade.period ? `/${dialogWageGrade.period}` : "/month"}
                        </strong>
                        {!isGrossCompliantWithMinWage && (
                          <span className="block mt-0.5">
                            Shortfall:{" "}
                            <strong>
                              {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(dialogWageGrade.minimumWage - watchGrossSalary)}
                            </strong>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Auto Breakdown from Gross ─────────────────────────── */}
                <div className="rounded-lg border bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 p-3">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-1.5">
                    <Calculator className="h-3.5 w-3.5" />
                    Auto Breakdown from Gross Salary
                    {grossInputAmt && Number(grossInputAmt) > 0 && (
                      <span className="ml-auto font-normal text-blue-600 dark:text-blue-400">
                        Basic 40% · HRA 50% of Basic · Conv ≤₹1,600 · Med ≤₹1,250 · Special = Remainder
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                      <Input
                        type="number"
                        placeholder="Enter gross salary (e.g. 18000)"
                        className="pl-6 h-8 text-sm"
                        value={grossInputAmt}
                        onChange={(e) => setGrossInputAmt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); autoBreakdownGross(grossInputAmt); } }}
                        data-testid="input-gross-breakdown"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 whitespace-nowrap"
                      onClick={() => autoBreakdownGross(grossInputAmt)}
                      data-testid="button-auto-breakdown"
                    >
                      <Calculator className="h-3.5 w-3.5 mr-1.5" />
                      Auto Fill
                    </Button>
                  </div>
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1.5">
                    When an employee has a Wage Grade assigned, salary is auto-filled from the minimum wage on selection.
                  </p>
                </div>
                {/* ─────────────────────────────────────────────────────── */}

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Earnings</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="basicSalary"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Basic Salary</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={(e) => { field.onChange(e); calculateSalary(); }} data-testid="input-basic-salary" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="hra"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>HRA</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={(e) => { field.onChange(e); calculateSalary(); }} data-testid="input-hra" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="conveyance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Conveyance</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={(e) => { field.onChange(e); calculateSalary(); }} data-testid="input-conveyance" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="medicalAllowance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Medical Allowance</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={(e) => { field.onChange(e); calculateSalary(); }} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="specialAllowance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Special Allowance</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={(e) => { field.onChange(e); calculateSalary(); }} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="grossSalary"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gross Salary</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} readOnly className="bg-muted" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Deductions</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="pfEmployee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PF (Employee) - Auto-calculated</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={(e) => { field.onChange(e); calculateSalary(false); }} data-testid="input-pf" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="esi"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ESI - Auto-calculated</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={(e) => { field.onChange(e); calculateSalary(false); }} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="professionalTax"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PT - Auto-calculated</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={(e) => { field.onChange(e); calculateSalary(false); }} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lwfEmployee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>LWF - Auto-calculated</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={(e) => { field.onChange(e); calculateSalary(false); }} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>TDS</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={(e) => { field.onChange(e); calculateSalary(false); }} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="netSalary"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Net Salary</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} readOnly className="bg-muted font-bold" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="effectiveFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Effective From</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-effective-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="submit" disabled={createStructureMutation.isPending || updateStructureMutation.isPending} data-testid="button-submit-structure">
                    {editingStructureId
                      ? (updateStructureMutation.isPending ? "Updating..." : "Update Structure")
                      : (createStructureMutation.isPending ? "Creating..." : "Create Structure")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payroll</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPayroll)}</div>
            <p className="text-xs text-muted-foreground">{selectedMonth} {selectedYear}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <Calculator className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalEarnings)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deductions</CardTitle>
            <Calculator className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalDeductions)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredPayroll.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="payroll">
        <TabsList className="mb-4">
          <TabsTrigger value="payroll" data-testid="tab-payroll">Payroll</TabsTrigger>
          <TabsTrigger value="structures" data-testid="tab-structures">Salary Structures</TabsTrigger>
          <TabsTrigger value="fnf" data-testid="tab-fnf">F&F Settlement</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Payroll Records</CardTitle>
                  <CardDescription>View and process monthly payroll</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  {isSuperAdmin ? (
                    <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                      <SelectTrigger className="w-48" data-testid="select-payroll-company">
                        <SelectValue placeholder="All Companies" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Companies</SelectItem>
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>{company.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm font-medium">{companies.find(c => c.id === user?.companyId)?.companyName || ""}</span>
                  )}
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-36" data-testid="select-payroll-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month) => (
                        <SelectItem key={month} value={month}>{month}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-24" data-testid="select-payroll-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026].map((year) => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {companies.length > 0 && selectedCompany !== "__all__" && (() => {
                    const allPaid = filteredPayroll.length > 0 && filteredPayroll.every(p => p.status === "paid");
                    const hasExisting = filteredPayroll.length > 0;
                    return (
                      <Button 
                        onClick={() => generatePayrollMutation.mutate(selectedCompany)}
                        disabled={generatePayrollMutation.isPending || allPaid}
                        data-testid="button-generate-payroll"
                        title={allPaid ? "All payroll records are finalized (Paid) for this month" : ""}
                      >
                        <Calculator className="h-4 w-4 mr-2" />
                        {generatePayrollMutation.isPending ? "Generating..." : allPaid ? "Payroll Finalized" : hasExisting ? "Regenerate Payroll" : "Generate Payroll"}
                      </Button>
                    );
                  })()}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingPayroll ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredPayroll.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No payroll records</h3>
                  <p className="text-muted-foreground">Generate payroll for the selected period</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">Sr.</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Earnings</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net Salary</TableHead>
                      <TableHead className="text-center">Pay Days</TableHead>
                      <TableHead className="text-center">OT Hrs</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayroll.map((record, idx) => (
                      <TableRow key={record.id} data-testid={`row-payroll-${record.id}`}>
                        <TableCell className="text-center text-muted-foreground font-medium text-sm">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{getEmployeeName(record.employeeId)}</TableCell>
                        <TableCell className="text-right text-green-600">{formatCurrency(record.totalEarnings)}</TableCell>
                        <TableCell className="text-right text-red-600">{formatCurrency(record.totalDeductions)}</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(record.netSalary)}</TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm">{record.payDays ?? record.presentDays}<span className="text-muted-foreground">/{record.workingDays}</span></span>
                        </TableCell>
                        <TableCell className="text-center text-orange-600 font-medium">
                          {Number((record as any).otHours) > 0 ? `${Number((record as any).otHours).toFixed(1)}h` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[record.status] || ""}>
                            {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => setViewingPayrollRecord(record)} title="View Details">
                              <Eye className="h-4 w-4 text-blue-600" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setEditingPayroll(record); setIsPayrollEditOpen(true); }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            {record.status === "draft" && (
                              <Button variant="ghost" size="icon" onClick={() => finalizePayrollMutation.mutate(record.id)}>
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Payroll Record</AlertDialogTitle>
                                  <AlertDialogDescription>Are you sure you want to delete this payroll record? This action cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deletePayrollMutation.mutate(record.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="structures">
          <Card>
            <CardHeader>
              <CardTitle>Salary Structures</CardTitle>
              <CardDescription>Employee salary components and breakdowns</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingStructures ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredStructures.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No salary structures</h3>
                  <p className="text-muted-foreground">Add salary structures for employees</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">Sr.</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Basic</TableHead>
                      <TableHead className="text-right">HRA</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Min. Wage</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStructures.map((structure, idx) => {
                      const structureWageGrade = getEmployeeWageGrade(structure.employeeId);
                      const structureMinWageCompliant = !structureWageGrade || structure.grossSalary >= (structureWageGrade.minimumWage ?? 0);
                      return (
                      <TableRow key={structure.id} data-testid={`row-structure-${structure.id}`}>
                        <TableCell className="text-center text-muted-foreground font-medium text-sm">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{getEmployeeName(structure.employeeId)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(structure.basicSalary)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(structure.hra || 0)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(structure.grossSalary)}</TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatCurrency((structure.pfEmployee || 0) + (structure.esi || 0) + (structure.professionalTax || 0) + (structure.tds || 0))}
                        </TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(structure.netSalary)}</TableCell>
                        <TableCell>{format(new Date(structure.effectiveFrom), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          {structureWageGrade ? (
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full w-fit ${structureMinWageCompliant ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"}`}>
                                {structureMinWageCompliant ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                                {structureMinWageCompliant ? "Compliant" : "Below Min"}
                              </span>
                              <span className="text-xs text-muted-foreground">{structureWageGrade.name}: {formatCurrency(structureWageGrade.minimumWage)}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No grade</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditStructure(structure)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Salary Structure</AlertDialogTitle>
                                  <AlertDialogDescription>Are you sure you want to delete this salary structure? This action cannot be undone.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteStructureMutation.mutate(structure.id)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
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

      <Dialog open={bulkUploadOpen} onOpenChange={setBulkUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Bulk Salary Structure Upload
            </DialogTitle>
            <DialogDescription>
              Upload an Excel file to create salary structures for multiple employees at once.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isSuperAdmin && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Company</label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>{company.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCompany === "__all__" && (
                  <p className="text-xs text-amber-600">Please select a company to continue.</p>
                )}
              </div>
            )}
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">
                Upload an Excel file (.xlsx) with salary structure data
              </p>
              <input
                ref={bulkFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBulkSalaryUpload(file);
                  e.target.value = "";
                }}
              />
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadSalaryTemplate}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <Button
                  size="sm"
                  onClick={() => bulkFileInputRef.current?.click()}
                  disabled={bulkUploading || (isSuperAdmin && selectedCompany === "__all__")}
                >
                  {bulkUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Select File
                    </>
                  )}
                </Button>
              </div>
            </div>

            {bulkResult && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">{bulkResult.created}</p>
                    <p className="text-xs text-green-600 dark:text-green-500">Created</p>
                  </div>
                  <div className="flex-1 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{(bulkResult as any).updated ?? 0}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500">Updated</p>
                  </div>
                  <div className="flex-1 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{bulkResult.skipped}</p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-500">Skipped</p>
                  </div>
                </div>
                {bulkResult.errors.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">Issues Found:</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {bulkResult.errors.map((err, i) => (
                        <p key={i} className="text-xs text-red-700 dark:text-red-400">{err}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkUploadOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingPayrollRecord} onOpenChange={(open) => { if (!open) setViewingPayrollRecord(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payroll Details - {viewingPayrollRecord?.month} {viewingPayrollRecord?.year}</DialogTitle>
            <DialogDescription>
              {viewingPayrollRecord && getEmployeeName(viewingPayrollRecord.employeeId)}
            </DialogDescription>
          </DialogHeader>
          {viewingPayrollRecord && (() => {
            const record = viewingPayrollRecord;
            const emp = employees.find(e => e.id === record.employeeId);
            const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            const mIdx = MONTH_NAMES.indexOf(record.month);
            const payrollYM = mIdx >= 0 ? `${record.year}-${String(mIdx + 1).padStart(2, "0")}` : "";
            const activeLoans = loanAdvances.filter((l: any) =>
              l.employeeId === record.employeeId &&
              l.status === "active" &&
              l.deductionStartMonth &&
              payrollYM &&
              l.deductionStartMonth <= payrollYM &&
              Number(l.installmentAmount) > 0
            );
            const storedLoanDeduction = (record as any).loanDeduction || 0;
            const hasUnrecordedLoans = activeLoans.length > 0 && storedLoanDeduction === 0;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Employee</p>
                    <p className="font-medium">{getEmployeeName(record.employeeId)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Department</p>
                    <p className="font-medium">{emp?.department || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Period</p>
                    <p className="font-medium">{record.month} {record.year}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Status</p>
                    <Badge className={statusColors[record.status] || ""}>{record.status.charAt(0).toUpperCase() + record.status.slice(1)}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Working Days</p>
                    <p className="font-medium">{record.workingDays}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Present Days</p>
                    <p className="font-medium">{record.presentDays}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Pay Days</p>
                    <p className="font-medium text-primary">{record.payDays ?? record.workingDays}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Off Days</p>
                    <p className="font-medium text-blue-600">{Math.max(0, (record.payDays ?? 0) - record.presentDays - (record.leaveDays || 0))}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Absent Days</p>
                    <p className="font-medium text-red-500">{Math.max(0, record.workingDays - (record.payDays ?? record.workingDays))}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Leave Days</p>
                    <p className="font-medium">{record.leaveDays || 0}</p>
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-green-50 dark:bg-green-950 p-3 border-b">
                    <h4 className="font-semibold text-green-800 dark:text-green-300">Earnings</h4>
                  </div>
                  <div className="p-3 space-y-2 text-sm">
                    <div className="flex justify-between"><span>Basic Salary</span><span className="font-medium">{formatCurrency(record.basicSalary || 0)}</span></div>
                    <div className="flex justify-between"><span>HRA</span><span className="font-medium">{formatCurrency(record.hra || 0)}</span></div>
                    <div className="flex justify-between"><span>Conveyance</span><span className="font-medium">{formatCurrency(record.conveyance || 0)}</span></div>
                    <div className="flex justify-between"><span>Medical Allowance</span><span className="font-medium">{formatCurrency(record.medicalAllowance || 0)}</span></div>
                    <div className="flex justify-between"><span>Special Allowance</span><span className="font-medium">{formatCurrency(record.specialAllowance || 0)}</span></div>
                    <div className="flex justify-between"><span>Other Allowances</span><span className="font-medium">{formatCurrency(record.otherAllowances || 0)}</span></div>
                    {(record.bonus || 0) > 0 && <div className="flex justify-between"><span>Bonus</span><span className="font-medium">{formatCurrency(record.bonus || 0)}</span></div>}
                    {Number((record as any).otHours) > 0 && (
                      <div className="flex justify-between text-orange-700 dark:text-orange-400">
                        <span>OT ({Number((record as any).otHours).toFixed(2)} hrs)</span>
                        <span className="font-medium">{formatCurrency((record as any).otAmount || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2 font-bold text-green-700 dark:text-green-400">
                      <span>Total Earnings</span><span>{formatCurrency(record.totalEarnings)}</span>
                    </div>
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-red-50 dark:bg-red-950 p-3 border-b flex items-center justify-between">
                    <h4 className="font-semibold text-red-800 dark:text-red-300">Deductions</h4>
                    {hasUnrecordedLoans && (
                      <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 rounded px-2 py-0.5 font-medium">
                        ⚠ Regenerate payroll to include loan deduction
                      </span>
                    )}
                  </div>
                  <div className="p-3 space-y-2 text-sm">
                    <div className="flex justify-between"><span>PF (Employee)</span><span className="font-medium">{formatCurrency(record.pfEmployee || 0)}</span></div>
                    <div className="flex justify-between"><span>ESI</span><span className="font-medium">{formatCurrency(record.esi || 0)}</span></div>
                    <div className="flex justify-between"><span>Professional Tax</span><span className="font-medium">{formatCurrency(record.professionalTax || 0)}</span></div>
                    <div className="flex justify-between"><span>LWF (Employee)</span><span className="font-medium">{formatCurrency(record.lwfEmployee || 0)}</span></div>
                    <div className="flex justify-between"><span>TDS</span><span className="font-medium">{formatCurrency(record.tds || 0)}</span></div>
                    <div className="flex justify-between"><span>Other Deductions</span><span className="font-medium">{formatCurrency(record.otherDeductions || 0)}</span></div>
                    <div className={`flex justify-between ${storedLoanDeduction > 0 ? "text-indigo-700 font-medium" : "text-muted-foreground"}`}>
                      <span>Loan / Advance Deduction</span>
                      <span className="font-medium">{formatCurrency(storedLoanDeduction)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-bold text-red-700 dark:text-red-400">
                      <span>Total Deductions</span><span>{formatCurrency(record.totalDeductions)}</span>
                    </div>
                  </div>
                </div>

                {/* Active Loan / Advance Detail Card */}
                {activeLoans.length > 0 && (
                  <div className="border border-indigo-200 rounded-lg overflow-hidden">
                    <div className="bg-indigo-50 p-3 border-b border-indigo-200">
                      <h4 className="font-semibold text-indigo-800 text-sm">Active Loan / Advance Details</h4>
                      <p className="text-xs text-indigo-600 mt-0.5">Installments scheduled for {record.month} {record.year}</p>
                    </div>
                    <div className="p-3 space-y-3 text-sm">
                      {(() => {
                        const totalScheduled = activeLoans.reduce((s: number, l: any) => s + Number(l.installmentAmount), 0);
                        return activeLoans.map((loan: any) => {
                          const scheduled = Number(loan.installmentAmount);
                          // Actual deduction = proportional share of storedLoanDeduction
                          const share = totalScheduled > 0 ? scheduled / totalScheduled : 1;
                          const actualDeduction = storedLoanDeduction > 0
                            ? Math.min(scheduled, Math.round(storedLoanDeduction * share))
                            : scheduled; // if not yet generated, show scheduled
                          const isCapped = storedLoanDeduction > 0 && actualDeduction < scheduled;
                          const afterDeduction = Math.max(0, (Number(loan.remainingBalance) || 0) - actualDeduction);
                          return (
                            <div key={loan.id} className="border rounded p-3 bg-white space-y-2">
                              <div className="flex items-center justify-between">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${loan.type === "loan" ? "bg-indigo-100 text-indigo-700" : "bg-teal-100 text-teal-700"}`}>
                                  {loan.type === "loan" ? "Loan" : "Advance"}
                                </span>
                                <span className="text-xs text-muted-foreground">Since {loan.deductionStartMonth}</span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <p className="text-muted-foreground">Scheduled Installment</p>
                                  <p className={`font-bold ${isCapped ? "line-through text-muted-foreground" : "text-red-600"}`}>{formatCurrency(scheduled)}</p>
                                  {isCapped && <p className="font-bold text-orange-600">Deducted: {formatCurrency(actualDeduction)}</p>}
                                  {isCapped && <p className="text-orange-500">(capped at net pay)</p>}
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Current Balance</p>
                                  <p className="font-bold text-indigo-700">{formatCurrency(loan.remainingBalance)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Balance After Deduction</p>
                                  <p className={`font-bold ${afterDeduction <= 0 ? "text-green-600" : "text-orange-600"}`}>
                                    {afterDeduction <= 0 ? "Fully Recovered ✓" : formatCurrency(afterDeduction)}
                                  </p>
                                </div>
                              </div>
                              {loan.purpose && <p className="text-xs text-muted-foreground truncate">Purpose: {loan.purpose}</p>}
                            </div>
                          );
                        });
                      })()}
                      {hasUnrecordedLoans && (
                        <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
                          <strong>Note:</strong> This payroll was generated before the loan was active. Regenerate payroll to include the ₹{activeLoans.reduce((s: number, l: any) => s + Number(l.installmentAmount), 0).toLocaleString("en-IN")} deduction in the payslip calculations.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="border rounded-lg p-4 bg-primary/5">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Net Salary</span>
                    <span className="text-primary">{formatCurrency(record.netSalary)}</span>
                  </div>
                  {hasUnrecordedLoans && (
                    <div className="flex justify-between text-sm text-amber-700 mt-1">
                      <span>Net (after loan, if regenerated)</span>
                      <span className="font-medium">{formatCurrency(Math.max(0, record.netSalary - Math.min(activeLoans.reduce((s: number, l: any) => s + Number(l.installmentAmount), 0), record.netSalary)))}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
