import { useState } from "react";
import { format } from "date-fns";
import { Building2, Edit, Trash2, ShieldCheck, AlertTriangle, Search, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead } from "@/components/sortable-head";
import type { SortState } from "@/lib/use-sort";
import type { SalaryStructure, Payroll, WageGrade } from "@shared/schema";

interface StructuresTabProps {
  isLoading: boolean;
  filteredStructures: SalaryStructure[];
  sortedStructures: SalaryStructure[];
  structSort: SortState;
  toggleStructSort: (col: string) => void;
  structureSearch: string;
  setStructureSearch: (value: string) => void;
  payrollRecords: Payroll[];
  getEmployeeName: (employeeId: string) => string;
  formatCurrency: (amount: number) => string;
  getEmployeeWageGrade: (employeeId: string) => WageGrade | undefined;
  onEditStructure: (structure: SalaryStructure) => void;
  onDeleteStructure: (id: string) => void;
}

export function StructuresTab({
  isLoading: isLoadingStructures,
  filteredStructures,
  sortedStructures,
  structSort,
  toggleStructSort,
  structureSearch,
  setStructureSearch,
  payrollRecords,
  getEmployeeName,
  formatCurrency,
  getEmployeeWageGrade,
  onEditStructure,
  onDeleteStructure,
}: StructuresTabProps) {
  const [deleteStructureId, setDeleteStructureId] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>Salary Structures</CardTitle>
          <CardDescription>Employee salary components and breakdowns</CardDescription>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search employee…"
            value={structureSearch}
            onChange={e => setStructureSearch(e.target.value)}
            data-testid="input-structure-search"
            className="w-full pl-8 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
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
                <SortableHead col="name" sort={structSort} onToggle={toggleStructSort}>Employee</SortableHead>
                <SortableHead col="basic" sort={structSort} onToggle={toggleStructSort} className="text-right">Basic</SortableHead>
                <SortableHead col="hra" sort={structSort} onToggle={toggleStructSort} className="text-right">HRA</SortableHead>
                <SortableHead col="gross" sort={structSort} onToggle={toggleStructSort} className="text-right">Gross</SortableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <SortableHead col="net" sort={structSort} onToggle={toggleStructSort} className="text-right">Net</SortableHead>
                <SortableHead col="effective" sort={structSort} onToggle={toggleStructSort}>Effective</SortableHead>
                <TableHead>Min. Wage</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStructures.map((structure, idx) => {
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
                      {payrollRecords.some(p => p.employeeId === structure.employeeId) ? (
                        <span
                          title="Payroll has been generated — create a new structure to make changes"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-amber-700 bg-amber-50 border border-amber-200 cursor-default select-none"
                        >
                          <Lock className="h-3 w-3" />
                          Locked
                        </span>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => onEditStructure(structure)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteStructureId(structure.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        )}

        <ConfirmDialog
          open={!!deleteStructureId}
          onOpenChange={(open) => { if (!open) setDeleteStructureId(null); }}
          title="Delete Salary Structure"
          description="Are you sure you want to delete this salary structure? This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => { if (deleteStructureId) onDeleteStructure(deleteStructureId); }}
          testIdPrefix="delete-structure"
        />
      </CardContent>
    </Card>
  );
}
