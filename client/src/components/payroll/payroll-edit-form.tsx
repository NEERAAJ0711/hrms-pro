import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import type { Payroll } from "@shared/schema";

export function PayrollEditForm({ payroll, onSubmit, isPending }: { payroll: Payroll; onSubmit: (data: { id: string; totalEarnings: number; totalDeductions: number; netSalary: number; status: string }) => void; isPending: boolean }) {
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
