import type { UseFormReturn } from "react-hook-form";
import { format } from "date-fns";
import { Plus, Calculator, AlertTriangle, ShieldCheck } from "lucide-react";
import { SearchableEmployeeSelect } from "@/components/searchable-employee-select";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { Company, Employee, Payroll, StatutorySettings, WageGrade, EarningHead, DeductionHead } from "@shared/schema";
import type { SalaryStructureFormValues } from "./constants";

interface SimpleMutation {
  isPending: boolean;
  mutate: (variables: any) => void;
}

interface SalaryStructureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  can: (resource: string, action: string) => boolean;
  editingStructureId: string | null;
  form: UseFormReturn<SalaryStructureFormValues>;
  customEarningAmounts: Record<string, number>;
  setCustomEarningAmounts: (amounts: Record<string, number>) => void;
  customDeductionAmounts: Record<string, number>;
  setCustomDeductionAmounts: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  createStructureMutation: SimpleMutation;
  updateStructureMutation: SimpleMutation;
  isSuperAdmin: boolean;
  companies: Company[];
  userCompanyId: string | undefined;
  employees: Employee[];
  payrollRecords: Payroll[];
  monthNames: string[];
  wageGrades: WageGrade[];
  applyGross: (gross: number, minimumWage?: number) => void;
  calculateSalary: (autoCalculateStatutory?: boolean, customAmountsOverride?: Record<string, number>) => void;
  dialogWageGrade: WageGrade | undefined;
  isGrossCompliantWithMinWage: boolean;
  watchGrossSalary: number;
  grossInputAmt: string;
  setGrossInputAmt: (value: string) => void;
  autoBreakdownGross: (grossStr: string) => void;
  activeEarningHeads: EarningHead[];
  activeDeductionHeads: DeductionHead[];
  statutorySettingsList: StatutorySettings[];
  watchCompanyId: string;
  minEffectiveDateStr: string;
  latestEmpPayroll: Payroll | null;
}

export function SalaryStructureDialog({
  open: isCreateOpen,
  onOpenChange: handleStructureDialogClose,
  can,
  editingStructureId,
  form,
  customEarningAmounts,
  setCustomEarningAmounts,
  customDeductionAmounts,
  setCustomDeductionAmounts,
  createStructureMutation,
  updateStructureMutation,
  isSuperAdmin,
  companies,
  userCompanyId,
  employees,
  payrollRecords,
  monthNames: SS_MONTH_NAMES,
  wageGrades,
  applyGross,
  calculateSalary,
  dialogWageGrade,
  isGrossCompliantWithMinWage,
  watchGrossSalary,
  grossInputAmt,
  setGrossInputAmt,
  autoBreakdownGross,
  activeEarningHeads,
  activeDeductionHeads,
  statutorySettingsList,
  watchCompanyId,
  minEffectiveDateStr,
  latestEmpPayroll,
}: SalaryStructureDialogProps) {
  return (
    <Dialog open={isCreateOpen} onOpenChange={handleStructureDialogClose}>
      {can("payroll", "process") && (
      <DialogTrigger asChild>
        <Button data-testid="button-create-structure">
          <Plus className="h-4 w-4 mr-2" />
          Add Salary Structure
        </Button>
      </DialogTrigger>
      )}
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editingStructureId ? "Edit Salary Structure" : "Create Salary Structure"}</DialogTitle>
        <DialogDescription>Define salary components for an employee</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => {
          const customSum = Object.values(customEarningAmounts).reduce((acc, v) => acc + (v || 0), 0);
          const payload = { ...data, medicalAllowance: 0, otherAllowances: data.otherAllowances + customSum, customEarnings: customEarningAmounts, customDeductions: customDeductionAmounts };
          if (editingStructureId) {
            updateStructureMutation.mutate({ ...payload, id: editingStructureId });
          } else {
            createStructureMutation.mutate(payload as any);
          }
        })} className="space-y-4">
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
                <p className="text-sm font-medium">{companies.find(c => c.id === userCompanyId)?.companyName || "—"}</p>
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
                        // Auto-set effectiveFrom: DOJ for new employee, 1st of next payroll month for existing
                        const empPayrollAll = payrollRecords.filter(p => p.employeeId === value);
                        if (empPayrollAll.length === 0) {
                          const doj = emp?.dateOfJoining?.trim();
                          form.setValue("effectiveFrom", doj || format(new Date(), "yyyy-MM-dd"));
                        } else {
                          const latestPR = empPayrollAll.reduce((a, b) =>
                            (b.year * 100 + (SS_MONTH_NAMES.indexOf(b.month) + 1)) > (a.year * 100 + (SS_MONTH_NAMES.indexOf(a.month) + 1)) ? b : a
                          );
                          const next = new Date(latestPR.year, SS_MONTH_NAMES.indexOf(latestPR.month) + 1, 1);
                          form.setValue("effectiveFrom", `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`);
                        }
                        const grade = emp?.wageGradeId
                          ? wageGrades.find(g => g.id === emp.wageGradeId && g.status === "active")
                          : undefined;
                        if (grade && grade.minimumWage > 0) {
                          applyGross(grade.minimumWage, grade.minimumWage);
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
            {(() => {
              const empId = form.watch("employeeId");
              const emp   = employees.find(e => e.id === empId);
              const grade = emp?.wageGradeId
                ? wageGrades.find(g => g.id === emp.wageGradeId && g.status === "active")
                : undefined;
              return (
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-1.5 flex-wrap">
                  <Calculator className="h-3.5 w-3.5 shrink-0" />
                  Set Gross Salary
                  {grade && grade.minimumWage > 0 ? (
                    <span className="ml-auto font-normal text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded-full text-[10px]">
                      Wage Grade: {grade.name} · Min. Wage ₹{grade.minimumWage.toLocaleString("en-IN")} · Gross cannot be less than ₹{grade.minimumWage.toLocaleString("en-IN")}
                    </span>
                  ) : (
                    <span className="ml-auto font-normal text-blue-600 dark:text-blue-400 text-[10px]">
                      Basic = Gross · HRA &amp; Special auto-computed · Conv/Medical/Other = 0
                    </span>
                  )}
                </p>
              );
            })()}
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
              Basic = max(Min.Wage, 50% of Gross) · HRA = min(50% of Basic, rem.) · Conveyance = min(50% of HRA, rem.) · Special = balance
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
              {activeEarningHeads.map((head) => {
                const isPct = head.type === "percentage" && (head.percentage ?? 0) > 0;
                const pctLabel = isPct
                  ? ` (${head.percentage}% of ${head.calculationBase === "basic" ? "Basic" : "Gross"} – auto)`
                  : "";
                return (
                  <FormItem key={head.id}>
                    <FormLabel>
                      {head.name}
                      {isPct && (
                        <span className="text-xs font-normal text-muted-foreground ml-1">{pctLabel}</span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={customEarningAmounts[head.id] ?? 0}
                        readOnly={isPct}
                        className={isPct ? "bg-muted" : ""}
                        onChange={isPct ? undefined : (e) => {
                          const val = Number(e.target.value) || 0;
                          const newAmounts = { ...customEarningAmounts, [head.id]: val };
                          setCustomEarningAmounts(newAmounts);
                          calculateSalary(true, newAmounts);
                        }}
                        data-testid={`input-earning-${head.id}`}
                      />
                    </FormControl>
                  </FormItem>
                );
              })}
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
              {/* VPF — only show when employee is PF-applicable */}
              {(() => {
                const selEmpId = form.watch("employeeId");
                const selEmp = employees.find(e => e.id === selEmpId);
                const pfEnabled = !!statutorySettingsList.find(s => s.companyId === watchCompanyId)?.pfEnabled;
                if (!pfEnabled || !selEmp?.pfApplicable) return null;
                return (
                  <FormField
                    control={form.control}
                    name="vpfAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>VPF (Voluntary PF)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            placeholder="0"
                            {...field}
                            onChange={(e) => { field.onChange(e); calculateSalary(false); }}
                            data-testid="input-vpf"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Extra PF contributed voluntarily by employee. Employer contribution does not change.</p>
                      </FormItem>
                    )}
                  />
                );
              })()}
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
              {activeDeductionHeads.map((head) => {
                const isPct = head.type === "percentage" && (head.percentage ?? 0) > 0;
                const pctLabel = isPct
                  ? ` (${head.percentage}% of ${head.calculationBase === "basic" ? "Basic" : "Gross"} – auto)`
                  : "";
                return (
                  <FormItem key={head.id}>
                    <FormLabel>
                      {head.name}
                      {isPct && (
                        <span className="text-xs font-normal text-muted-foreground ml-1">{pctLabel}</span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={customDeductionAmounts[head.id] ?? 0}
                        readOnly={isPct}
                        className={isPct ? "bg-muted" : ""}
                        onChange={isPct ? undefined : (e) => {
                          const val = Number(e.target.value) || 0;
                          setCustomDeductionAmounts(prev => ({ ...prev, [head.id]: val }));
                          calculateSalary(false);
                        }}
                        data-testid={`input-deduction-${head.id}`}
                      />
                    </FormControl>
                  </FormItem>
                );
              })}
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
                  <Input
                    type="date"
                    {...field}
                    min={minEffectiveDateStr || undefined}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        // Always snap to 1st of the chosen month
                        const [y, m] = val.split("-");
                        field.onChange(`${y}-${m}-01`);
                      } else {
                        field.onChange(val);
                      }
                    }}
                    data-testid="input-effective-date"
                  />
                </FormControl>
                {editingStructureId && latestEmpPayroll && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Payroll already generated up to <strong>{latestEmpPayroll.month} {latestEmpPayroll.year}</strong>. Effective date must be <strong>{SS_MONTH_NAMES[(SS_MONTH_NAMES.indexOf(latestEmpPayroll.month) + 1) % 12]} {minEffectiveDateStr.slice(0, 4)}</strong> or later.
                  </p>
                )}
                {!editingStructureId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Date is auto-set to the 1st of the selected month. Salary structures take effect from the start of a month.
                  </p>
                )}
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
  );
}
