import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Calculator, Users } from "lucide-react";

interface SummaryCardsProps {
  totalPayroll: number;
  totalEarnings: number;
  totalDeductions: number;
  employeeCount: number;
  selectedMonth: string;
  selectedYear: string;
  formatCurrency: (amount: number) => string;
}

export function PayrollSummaryCards({ totalPayroll, totalEarnings, totalDeductions, employeeCount, selectedMonth, selectedYear, formatCurrency }: SummaryCardsProps) {
  return (
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
          <div className="text-2xl font-bold">{employeeCount}</div>
        </CardContent>
      </Card>
    </div>
  );
}
