import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Payroll, Employee, EarningHead, DeductionHead } from "@shared/schema";

interface PayrollDetailsDialogProps {
  record: Payroll | null;
  onOpenChange: (open: boolean) => void;
  allEmployees: Employee[];
  earningHeads: EarningHead[];
  deductionHeads: DeductionHead[];
  loanAdvances: any[];
  statusColors: Record<string, string>;
  getEmployeeName: (employeeId: string) => string;
  formatCurrency: (amount: number) => string;
}

export function PayrollDetailsDialog({
  record: viewingPayrollRecord,
  onOpenChange,
  allEmployees: prAllEmployees,
  earningHeads,
  deductionHeads,
  loanAdvances,
  statusColors,
  getEmployeeName,
  formatCurrency,
}: PayrollDetailsDialogProps) {
  return (
    <Dialog open={!!viewingPayrollRecord} onOpenChange={(open) => { if (!open) onOpenChange(false); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payroll Details - {viewingPayrollRecord?.month} {viewingPayrollRecord?.year}</DialogTitle>
          <DialogDescription>
            {viewingPayrollRecord && getEmployeeName(viewingPayrollRecord.employeeId)}
          </DialogDescription>
        </DialogHeader>
        {viewingPayrollRecord && (() => {
          const record = viewingPayrollRecord;
          const emp = prAllEmployees.find(e => e.id === record.employeeId);
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
                  <p className="font-medium">{Number(record.presentDays)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Pay Days</p>
                  <p className="font-medium text-primary">{Number(record.payDays ?? record.workingDays)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Off Days</p>
                  <p className="font-medium text-blue-600">{Math.max(0, Number(record.payDays ?? 0) - Number(record.presentDays) - (record.leaveDays || 0))}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Absent Days</p>
                  <p className="font-medium text-red-500">{Math.max(0, record.workingDays - Number(record.payDays ?? record.workingDays))}</p>
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
                  <div className="flex justify-between"><span>Special Allowance</span><span className="font-medium">{formatCurrency(record.specialAllowance || 0)}</span></div>
                  {/* Custom earning heads stored on the payroll record */}
                  {Object.entries((record as any).customEarnings || {}).map(([headId, amt]) => {
                    const head = earningHeads.find(h => h.id === headId);
                    if (!head || !amt) return null;
                    const isPct = head.type === "percentage" && (head.percentage ?? 0) > 0;
                    return (
                      <div key={headId} className="flex justify-between">
                        <span>
                          {head.name}
                          {isPct && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({head.percentage}% of {head.calculationBase === "basic" ? "Basic" : "Gross"})
                            </span>
                          )}
                        </span>
                        <span className="font-medium">{formatCurrency(amt as number)}</span>
                      </div>
                    );
                  })}
                  {/* Other Allowances: only show when there's a residual amount not covered by named heads (absorbs any legacy medicalAllowance) */}
                  {(() => {
                    const customSum = Object.values((record as any).customEarnings || {}).reduce((a: number, v) => a + (Number(v) || 0), 0);
                    const residual = (record.otherAllowances || 0) + (record.medicalAllowance || 0) - customSum;
                    return residual > 0
                      ? <div className="flex justify-between"><span>Other Allowances</span><span className="font-medium">{formatCurrency(residual)}</span></div>
                      : null;
                  })()}
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
                  {((record as any).vpfAmount || 0) > 0 && (
                    <div className="flex justify-between"><span>VPF (Voluntary PF)</span><span className="font-medium">{formatCurrency((record as any).vpfAmount)}</span></div>
                  )}
                  <div className="flex justify-between"><span>ESI</span><span className="font-medium">{formatCurrency(record.esi || 0)}</span></div>
                  <div className="flex justify-between"><span>Professional Tax</span><span className="font-medium">{formatCurrency(record.professionalTax || 0)}</span></div>
                  <div className="flex justify-between"><span>LWF (Employee)</span><span className="font-medium">{formatCurrency(record.lwfEmployee || 0)}</span></div>
                  <div className="flex justify-between"><span>TDS</span><span className="font-medium">{formatCurrency(record.tds || 0)}</span></div>
                  <div className="flex justify-between"><span>Other Deductions</span><span className="font-medium">{formatCurrency(record.otherDeductions || 0)}</span></div>
                  {/* Custom deduction heads stored on the payroll record */}
                  {Object.entries((record as any).customDeductions || {}).map(([headId, amt]) => {
                    const head = deductionHeads.find(h => h.id === headId);
                    if (!head || !amt) return null;
                    const isPct = head.type === "percentage" && (head.percentage ?? 0) > 0;
                    return (
                      <div key={headId} className="flex justify-between">
                        <span>
                          {head.name}
                          {isPct && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({head.percentage}% of {head.calculationBase === "basic" ? "Basic" : "Gross"})
                            </span>
                          )}
                        </span>
                        <span className="font-medium">{formatCurrency(amt as number)}</span>
                      </div>
                    );
                  })}
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
  );
}
