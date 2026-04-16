import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SearchableEmployeeSelect } from "@/components/searchable-employee-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  FileText,
  Eye,
  Trash2,
  CheckCircle,
  IndianRupee,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Employee, Company, FnfSettlement } from "@shared/schema";

const EXIT_TYPE_LABELS: Record<string, string> = {
  resignation: "Resignation",
  termination: "Termination",
  retirement: "Retirement",
  absconding: "Absconding",
  end_of_contract: "End of Contract",
  death: "Death",
  other: "Other",
};

const FNF_STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  approved: "default",
  paid: "outline",
  cancelled: "destructive",
};

export default function FnfSettlementPage() {
  const { toast } = useToast();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingSettlement, setViewingSettlement] = useState<FnfSettlement | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const [salaryDue, setSalaryDue] = useState(0);
  const [leaveEncashment, setLeaveEncashment] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [gratuity, setGratuity] = useState(0);
  const [noticePay, setNoticePay] = useState(0);
  const [otherEarnings, setOtherEarnings] = useState(0);
  const [otherEarningsRemarks, setOtherEarningsRemarks] = useState("");
  const [pfDeduction, setPfDeduction] = useState(0);
  const [esiDeduction, setEsiDeduction] = useState(0);
  const [professionalTax, setProfessionalTax] = useState(0);
  const [tds, setTds] = useState(0);
  const [loanRecovery, setLoanRecovery] = useState(0);
  const [noticePeriodRecovery, setNoticePeriodRecovery] = useState(0);
  const [otherDeductions, setOtherDeductions] = useState(0);
  const [otherDeductionsRemarks, setOtherDeductionsRemarks] = useState("");
  const [remarks, setRemarks] = useState("");

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: settlements = [], isLoading } = useQuery<FnfSettlement[]>({
    queryKey: ["/api/fnf-settlements", selectedCompanyId],
    queryFn: async () => {
      const url = selectedCompanyId
        ? `/api/fnf-settlements?companyId=${selectedCompanyId}`
        : "/api/fnf-settlements";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch settlements");
      return res.json();
    },
  });

  const exitedEmployees = employees.filter(
    (e) => e.status === "inactive" && (!selectedCompanyId || e.companyId === selectedCompanyId)
  );

  const totalEarnings = salaryDue + leaveEncashment + bonus + gratuity + noticePay + otherEarnings;
  const totalDeductions = pfDeduction + esiDeduction + professionalTax + tds + loanRecovery + noticePeriodRecovery + otherDeductions;
  const netPayable = totalEarnings - totalDeductions;

  const resetForm = () => {
    setSelectedEmployeeId("");
    setSalaryDue(0);
    setLeaveEncashment(0);
    setBonus(0);
    setGratuity(0);
    setNoticePay(0);
    setOtherEarnings(0);
    setOtherEarningsRemarks("");
    setPfDeduction(0);
    setEsiDeduction(0);
    setProfessionalTax(0);
    setTds(0);
    setLoanRecovery(0);
    setNoticePeriodRecovery(0);
    setOtherDeductions(0);
    setOtherDeductionsRemarks("");
    setRemarks("");
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/fnf-settlements", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fnf-settlements"] });
      toast({ title: "F&F Settlement Created", description: "Settlement entry has been saved as draft." });
      setFormDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/fnf-settlements/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fnf-settlements"] });
      toast({ title: "Settlement Updated", description: "F&F settlement has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/fnf-settlements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fnf-settlements"] });
      toast({ title: "Settlement Deleted", description: "F&F settlement has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    if (!emp) return;

    createMutation.mutate({
      employeeId: selectedEmployeeId,
      companyId: emp.companyId,
      settlementDate: new Date().toISOString().split("T")[0],
      lastWorkingDay: emp.exitDate || new Date().toISOString().split("T")[0],
      salaryDue,
      leaveEncashment,
      bonus,
      gratuity,
      noticePay,
      otherEarnings,
      otherEarningsRemarks: otherEarningsRemarks || null,
      totalEarnings,
      pfDeduction,
      esiDeduction,
      professionalTax,
      tds,
      loanRecovery,
      noticePeriodRecovery,
      otherDeductions,
      otherDeductionsRemarks: otherDeductionsRemarks || null,
      totalDeductions,
      netPayable,
      remarks: remarks || null,
      status: "draft",
      createdAt: new Date().toISOString(),
    });
  };

  const getEmployeeName = (employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    return emp ? `${emp.firstName} ${emp.lastName} (${emp.employeeCode})` : "Unknown";
  };

  const getCompanyName = (companyId: string) => {
    const company = companies.find((c) => c.id === companyId);
    return company?.companyName || "Unknown";
  };

  const formatCurrency = (amount: number | null) => {
    return `₹${(amount || 0).toLocaleString("en-IN")}`;
  };

  const existingFnfEmployeeIds = settlements
    .filter((s) => s.status !== "cancelled")
    .map((s) => s.employeeId);

  const availableExitedEmployees = exitedEmployees.filter(
    (e) => !existingFnfEmployeeIds.includes(e.id)
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Full & Final Settlement</h1>
          <p className="text-muted-foreground">Manage settlement entries for exited employees</p>
        </div>
        <Button
          onClick={() => { resetForm(); setFormDialogOpen(true); }}
          disabled={availableExitedEmployees.length === 0}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Settlement
        </Button>
      </div>

      {exitedEmployees.length === 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardContent className="p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              No exited employees found. Mark employees as exited from the Employees page to create F&F settlements.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-4 mb-6">
        {companies.length > 1 && (
          <Select value={selectedCompanyId || "all"} onValueChange={(v) => setSelectedCompanyId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Badge variant="secondary" className="text-xs">
          {settlements.length} settlement{settlements.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : settlements.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No settlements found</h3>
              <p className="text-muted-foreground">Create a new F&F settlement for exited employees.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Last Working Day</TableHead>
                    <TableHead>Settlement Date</TableHead>
                    <TableHead className="text-right">Total Earnings</TableHead>
                    <TableHead className="text-right">Total Deductions</TableHead>
                    <TableHead className="text-right">Net Payable</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{getEmployeeName(s.employeeId)}</TableCell>
                      <TableCell>{getCompanyName(s.companyId)}</TableCell>
                      <TableCell>{s.lastWorkingDay}</TableCell>
                      <TableCell>{s.settlementDate}</TableCell>
                      <TableCell className="text-right text-green-600">{formatCurrency(s.totalEarnings)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatCurrency(s.totalDeductions)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(s.netPayable)}</TableCell>
                      <TableCell>
                        <Badge variant={FNF_STATUS_COLORS[s.status] as any}>
                          {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setViewingSettlement(s); setViewDialogOpen(true); }}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {s.status === "draft" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Approve this F&F settlement?")) {
                                  updateMutation.mutate({ id: s.id, data: { status: "approved" } });
                                }
                              }}
                              title="Approve"
                              className="text-green-600 hover:text-green-700"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {s.status === "approved" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Mark this settlement as paid?")) {
                                  updateMutation.mutate({ id: s.id, data: { status: "paid" } });
                                }
                              }}
                              title="Mark Paid"
                              className="text-blue-600 hover:text-blue-700"
                            >
                              <IndianRupee className="h-4 w-4" />
                            </Button>
                          )}
                          {s.status !== "paid" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Delete this F&F settlement?")) {
                                  deleteMutation.mutate(s.id);
                                }
                              }}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formDialogOpen} onOpenChange={(open) => { setFormDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Full & Final Settlement</DialogTitle>
            <DialogDescription>Create settlement entry for an exited employee.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Select Employee *</Label>
              <SearchableEmployeeSelect
                employees={availableExitedEmployees}
                value={selectedEmployeeId}
                onValueChange={setSelectedEmployeeId}
                placeholder="Search by name or ID..."
                renderLabel={(emp) => `${emp.employeeCode} - ${emp.firstName} ${emp.lastName}${emp.exitDate ? ` | Exit: ${emp.exitDate}` : ""}`}
              />
            </div>

            {selectedEmployeeId && (() => {
              const emp = employees.find((e) => e.id === selectedEmployeeId);
              if (!emp) return null;
              return (
                <Card className="bg-muted/50">
                  <CardContent className="p-4 text-sm space-y-1">
                    <p><strong>Employee:</strong> {emp.firstName} {emp.lastName} ({emp.employeeCode})</p>
                    <p><strong>Company:</strong> {getCompanyName(emp.companyId)}</p>
                    <p><strong>Department:</strong> {emp.department || "-"}</p>
                    <p><strong>Date of Joining:</strong> {emp.dateOfJoining}</p>
                    <p><strong>Date of Leaving:</strong> {emp.exitDate || "-"}</p>
                    <p><strong>Exit Type:</strong> {EXIT_TYPE_LABELS[emp.exitType || ""] || emp.exitType || "-"}</p>
                    {emp.exitReason && <p><strong>Exit Reason:</strong> {emp.exitReason}</p>}
                  </CardContent>
                </Card>
              );
            })()}

            <Separator />

            <div>
              <h3 className="font-semibold text-green-700 mb-3">Earnings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Salary Due</Label>
                  <Input type="number" value={salaryDue} onChange={(e) => setSalaryDue(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Leave Encashment</Label>
                  <Input type="number" value={leaveEncashment} onChange={(e) => setLeaveEncashment(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Bonus</Label>
                  <Input type="number" value={bonus} onChange={(e) => setBonus(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Gratuity</Label>
                  <Input type="number" value={gratuity} onChange={(e) => setGratuity(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Notice Pay</Label>
                  <Input type="number" value={noticePay} onChange={(e) => setNoticePay(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Other Earnings</Label>
                  <Input type="number" value={otherEarnings} onChange={(e) => setOtherEarnings(Number(e.target.value) || 0)} />
                </div>
              </div>
              {otherEarnings > 0 && (
                <div className="mt-2 space-y-2">
                  <Label>Other Earnings Remarks</Label>
                  <Input value={otherEarningsRemarks} onChange={(e) => setOtherEarningsRemarks(e.target.value)} placeholder="Specify other earnings..." />
                </div>
              )}
              <div className="mt-3 text-right font-semibold text-green-700">
                Total Earnings: {formatCurrency(totalEarnings)}
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-red-700 mb-3">Deductions</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>PF Deduction</Label>
                  <Input type="number" value={pfDeduction} onChange={(e) => setPfDeduction(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>ESI Deduction</Label>
                  <Input type="number" value={esiDeduction} onChange={(e) => setEsiDeduction(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Professional Tax</Label>
                  <Input type="number" value={professionalTax} onChange={(e) => setProfessionalTax(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>TDS</Label>
                  <Input type="number" value={tds} onChange={(e) => setTds(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Loan Recovery</Label>
                  <Input type="number" value={loanRecovery} onChange={(e) => setLoanRecovery(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Notice Period Recovery</Label>
                  <Input type="number" value={noticePeriodRecovery} onChange={(e) => setNoticePeriodRecovery(Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>Other Deductions</Label>
                  <Input type="number" value={otherDeductions} onChange={(e) => setOtherDeductions(Number(e.target.value) || 0)} />
                </div>
              </div>
              {otherDeductions > 0 && (
                <div className="mt-2 space-y-2">
                  <Label>Other Deductions Remarks</Label>
                  <Input value={otherDeductionsRemarks} onChange={(e) => setOtherDeductionsRemarks(e.target.value)} placeholder="Specify other deductions..." />
                </div>
              )}
              <div className="mt-3 text-right font-semibold text-red-700">
                Total Deductions: {formatCurrency(totalDeductions)}
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <span className="text-lg font-bold">Net Payable:</span>
              <span className={`text-2xl font-bold ${netPayable >= 0 ? "text-green-700" : "text-red-700"}`}>
                {formatCurrency(netPayable)}
              </span>
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Additional remarks..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFormDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!selectedEmployeeId || createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Save as Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>F&F Settlement Details</DialogTitle>
            <DialogDescription>
              {viewingSettlement && getEmployeeName(viewingSettlement.employeeId)}
            </DialogDescription>
          </DialogHeader>
          {viewingSettlement && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Employee:</span>
                  <p className="font-medium">{getEmployeeName(viewingSettlement.employeeId)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Company:</span>
                  <p className="font-medium">{getCompanyName(viewingSettlement.companyId)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Working Day:</span>
                  <p className="font-medium">{viewingSettlement.lastWorkingDay}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Settlement Date:</span>
                  <p className="font-medium">{viewingSettlement.settlementDate}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p><Badge variant={FNF_STATUS_COLORS[viewingSettlement.status] as any}>{viewingSettlement.status.charAt(0).toUpperCase() + viewingSettlement.status.slice(1)}</Badge></p>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold text-green-700 mb-2">Earnings</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Salary Due</span><span>{formatCurrency(viewingSettlement.salaryDue)}</span></div>
                  <div className="flex justify-between"><span>Leave Encashment</span><span>{formatCurrency(viewingSettlement.leaveEncashment)}</span></div>
                  <div className="flex justify-between"><span>Bonus</span><span>{formatCurrency(viewingSettlement.bonus)}</span></div>
                  <div className="flex justify-between"><span>Gratuity</span><span>{formatCurrency(viewingSettlement.gratuity)}</span></div>
                  <div className="flex justify-between"><span>Notice Pay</span><span>{formatCurrency(viewingSettlement.noticePay)}</span></div>
                  {(viewingSettlement.otherEarnings || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>Other Earnings {viewingSettlement.otherEarningsRemarks ? `(${viewingSettlement.otherEarningsRemarks})` : ""}</span>
                      <span>{formatCurrency(viewingSettlement.otherEarnings)}</span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between font-semibold text-green-700">
                    <span>Total Earnings</span>
                    <span>{formatCurrency(viewingSettlement.totalEarnings)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold text-red-700 mb-2">Deductions</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>PF Deduction</span><span>{formatCurrency(viewingSettlement.pfDeduction)}</span></div>
                  <div className="flex justify-between"><span>ESI Deduction</span><span>{formatCurrency(viewingSettlement.esiDeduction)}</span></div>
                  <div className="flex justify-between"><span>Professional Tax</span><span>{formatCurrency(viewingSettlement.professionalTax)}</span></div>
                  <div className="flex justify-between"><span>TDS</span><span>{formatCurrency(viewingSettlement.tds)}</span></div>
                  <div className="flex justify-between"><span>Loan Recovery</span><span>{formatCurrency(viewingSettlement.loanRecovery)}</span></div>
                  <div className="flex justify-between"><span>Notice Period Recovery</span><span>{formatCurrency(viewingSettlement.noticePeriodRecovery)}</span></div>
                  {(viewingSettlement.otherDeductions || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>Other Deductions {viewingSettlement.otherDeductionsRemarks ? `(${viewingSettlement.otherDeductionsRemarks})` : ""}</span>
                      <span>{formatCurrency(viewingSettlement.otherDeductions)}</span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between font-semibold text-red-700">
                    <span>Total Deductions</span>
                    <span>{formatCurrency(viewingSettlement.totalDeductions)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <span className="text-lg font-bold">Net Payable:</span>
                <span className={`text-2xl font-bold ${(viewingSettlement.netPayable || 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {formatCurrency(viewingSettlement.netPayable)}
                </span>
              </div>

              {viewingSettlement.remarks && (
                <div>
                  <span className="text-muted-foreground text-sm">Remarks:</span>
                  <p className="text-sm">{viewingSettlement.remarks}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
