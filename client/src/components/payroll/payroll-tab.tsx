import { FileText, Edit, Trash2, CheckCircle, Eye, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calculator } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Payroll, Company } from "@shared/schema";

interface ContractorRow { id: string; companyId: string; contractorId: string; startDate: string; contractorName: string }
interface PERow { id: string; companyId: string; contractorId: string; startDate: string; companyName: string }

interface PayrollTabProps {
  isSuperAdmin: boolean;
  userCompanyName: string;
  companies: Company[];
  selectedCompany: string;
  setSelectedCompany: (value: string) => void;
  myContractors: ContractorRow[];
  myPrincipalEmployers: PERow[];
  contractorFilter: string;
  setContractorFilter: (value: string) => void;
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  selectedYear: string;
  setSelectedYear: (value: string) => void;
  months: string[];
  filteredPayroll: Payroll[];
  isLoadingPayroll: boolean;
  payrollSearch: string;
  setPayrollSearch: (value: string) => void;
  selectedPayrollIds: Set<string>;
  setSelectedPayrollIds: (ids: Set<string>) => void;
  bulkDeleteConfirmOpen: boolean;
  setBulkDeleteConfirmOpen: (open: boolean) => void;
  statusColors: Record<string, string>;
  can: (resource: string, action: string) => boolean;
  isGeneratePending: boolean;
  onGenerate: (companyId: string) => void;
  onBulkFinalize: (ids: string[]) => void;
  isBulkFinalizePending: boolean;
  onBulkDelete: (ids: string[]) => void;
  isBulkDeletePending: boolean;
  onFinalize: (id: string) => void;
  onDelete: (id: string) => void;
  onView: (record: Payroll) => void;
  onEdit: (record: Payroll) => void;
  getEmployeeName: (employeeId: string) => string;
  formatCurrency: (amount: number) => string;
}

export function PayrollTab({
  isSuperAdmin,
  userCompanyName,
  companies,
  selectedCompany,
  setSelectedCompany,
  myContractors,
  myPrincipalEmployers,
  contractorFilter,
  setContractorFilter,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  months,
  filteredPayroll,
  isLoadingPayroll,
  payrollSearch,
  setPayrollSearch,
  selectedPayrollIds,
  setSelectedPayrollIds,
  bulkDeleteConfirmOpen,
  setBulkDeleteConfirmOpen,
  statusColors,
  can,
  isGeneratePending,
  onGenerate,
  onBulkFinalize,
  isBulkFinalizePending,
  onBulkDelete,
  isBulkDeletePending,
  onFinalize,
  onDelete,
  onView,
  onEdit,
  getEmployeeName,
  formatCurrency,
}: PayrollTabProps) {
  return (
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
              <span className="text-sm font-medium">{userCompanyName}</span>
            )}
            {!isSuperAdmin && (myContractors.length > 0 || myPrincipalEmployers.length > 0) && (
              <Select value={contractorFilter} onValueChange={setContractorFilter}>
                <SelectTrigger className="w-52" data-testid="select-payroll-contractor-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">Own Employees</SelectItem>
                  {myContractors.map((c) => (
                    <SelectItem key={c.id} value={`c:${c.companyId}:${c.contractorId}`}>
                      Contractor: {c.contractorName}
                    </SelectItem>
                  ))}
                  {myPrincipalEmployers.map((pe) => (
                    <SelectItem key={pe.id} value={`pe:${pe.companyId}:${pe.contractorId}`}>
                      PE: {pe.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              const monthIndex = months.indexOf(selectedMonth);
              const lastDayOfPayMonth = new Date(parseInt(selectedYear), monthIndex + 1, 0);
              lastDayOfPayMonth.setHours(23, 59, 59, 999);
              const isMonthIncomplete = new Date() <= lastDayOfPayMonth;
              const disableReason = allPaid
                ? "All payroll records are finalized (Paid) for this month"
                : isMonthIncomplete
                  ? `${selectedMonth} ${selectedYear} is not yet complete — payroll can only be generated after the month ends`
                  : "";
              if (!can("payroll", "process")) return null;
              return (
                <Button
                  onClick={() => onGenerate(selectedCompany)}
                  disabled={isGeneratePending || allPaid || isMonthIncomplete}
                  data-testid="button-generate-payroll"
                  title={disableReason}
                >
                  <Calculator className="h-4 w-4 mr-2" />
                  {isGeneratePending
                    ? "Generating..."
                    : allPaid
                      ? "Payroll Finalized"
                      : isMonthIncomplete
                        ? "Month Incomplete"
                        : hasExisting
                          ? "Regenerate Payroll"
                          : "Generate Payroll"}
                </Button>
              );
            })()}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative max-w-xs flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search employee name or code…"
              value={payrollSearch}
              onChange={e => setPayrollSearch(e.target.value)}
              data-testid="input-payroll-search"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-input bg-background shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {selectedPayrollIds.size > 0 && (
            <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-md">
              <span className="text-sm font-medium">{selectedPayrollIds.size} selected</span>
              {can("payroll", "mark_paid") && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-green-700 border-green-300 hover:bg-green-50"
                disabled={isBulkFinalizePending}
                onClick={() => onBulkFinalize(Array.from(selectedPayrollIds))}
                data-testid="button-bulk-finalize"
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Finalize
              </Button>
              )}
              {can("payroll", "process") && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-red-700 border-red-300 hover:bg-red-50"
                onClick={() => setBulkDeleteConfirmOpen(true)}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-muted-foreground"
                onClick={() => setSelectedPayrollIds(new Set())}
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* Bulk delete confirmation */}
        <AlertDialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedPayrollIds.size} Payroll Record(s)?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {selectedPayrollIds.size} selected payroll record(s). This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => onBulkDelete(Array.from(selectedPayrollIds))}
                disabled={isBulkDeletePending}
              >
                {isBulkDeletePending ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    data-testid="checkbox-select-all"
                    className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                    checked={filteredPayroll.length > 0 && filteredPayroll.every(p => selectedPayrollIds.has(p.id))}
                    ref={el => { if (el) el.indeterminate = selectedPayrollIds.size > 0 && !filteredPayroll.every(p => selectedPayrollIds.has(p.id)); }}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedPayrollIds(new Set(filteredPayroll.map(p => p.id)));
                      } else {
                        setSelectedPayrollIds(new Set());
                      }
                    }}
                  />
                </TableHead>
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
                <TableRow key={record.id} data-testid={`row-payroll-${record.id}`} className={selectedPayrollIds.has(record.id) ? "bg-muted/50" : ""}>
                  <TableCell>
                    <input
                      type="checkbox"
                      data-testid={`checkbox-payroll-${record.id}`}
                      className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                      checked={selectedPayrollIds.has(record.id)}
                      onChange={e => {
                        const next = new Set(selectedPayrollIds);
                        if (e.target.checked) next.add(record.id); else next.delete(record.id);
                        setSelectedPayrollIds(next);
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground font-medium text-sm">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{getEmployeeName(record.employeeId)}</TableCell>
                  <TableCell className="text-right text-green-600">{formatCurrency(record.totalEarnings)}</TableCell>
                  <TableCell className="text-right text-red-600">{formatCurrency(record.totalDeductions)}</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(record.netSalary)}</TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm">{Number(record.payDays ?? record.presentDays)}<span className="text-muted-foreground">/{record.workingDays}</span></span>
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
                      <Button variant="ghost" size="icon" onClick={() => onView(record)} title="View Details">
                        <Eye className="h-4 w-4 text-blue-600" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onEdit(record)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      {record.status === "draft" && (
                        <Button variant="ghost" size="icon" onClick={() => onFinalize(record.id)}>
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
                            <AlertDialogAction onClick={() => onDelete(record.id)}>Delete</AlertDialogAction>
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
  );
}
