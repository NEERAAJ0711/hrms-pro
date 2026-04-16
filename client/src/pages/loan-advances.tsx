import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SearchableEmployeeSelect } from "@/components/searchable-employee-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet,
  PlusCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Ban,
  Loader2,
  IndianRupee,
  Calendar,
  User,
  TrendingDown,
  AlertCircle,
  CalendarClock,
  RefreshCw,
} from "lucide-react";
import type { LoanAdvance } from "@shared/schema";

type EnrichedLoanAdvance = LoanAdvance & { employeeName: string; employeeCode: string };

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  pending:   { label: "Pending",   variant: "outline",      color: "text-amber-600 border-amber-400 bg-amber-50" },
  active:    { label: "Active",    variant: "default",      color: "text-blue-600 border-blue-400 bg-blue-50" },
  approved:  { label: "Approved",  variant: "default",      color: "text-green-600 border-green-400 bg-green-50" },
  rejected:  { label: "Rejected",  variant: "destructive",  color: "text-red-600 border-red-400 bg-red-50" },
  closed:    { label: "Closed",    variant: "secondary",    color: "text-gray-600 border-gray-300 bg-gray-50" },
  cancelled: { label: "Cancelled", variant: "secondary",    color: "text-gray-500 border-gray-300 bg-gray-50" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: "text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function fmt(amount: number | null | undefined) {
  if (!amount && amount !== 0) return "—";
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

export default function LoanAdvancesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = ["super_admin", "company_admin", "hr_admin", "manager"].includes(user?.role || "");

  const [applyOpen, setApplyOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selected, setSelected] = useState<EnrichedLoanAdvance | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [scheduleForm, setScheduleForm] = useState({ totalInstallments: "", installmentAmount: "", deductionStartMonth: "", remarks: "" });

  const { data: allEmployees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    enabled: isAdmin,
  });

  const { data: myEmployeeRecord, isLoading: myEmpLoading } = useQuery<any>({
    queryKey: ["/api/employees/me"],
    enabled: !isAdmin,
    retry: false,
    queryFn: async () => {
      const res = await fetch("/api/employees/me", { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const isEmployeeUnlinked = !isAdmin && !myEmpLoading && myEmployeeRecord === null;

  // Apply form
  const [applyForm, setApplyForm] = useState({ type: "advance", amount: "", purpose: "", employeeId: "" });
  // Approve form
  const [approveForm, setApproveForm] = useState({ totalInstallments: "", installmentAmount: "", deductionStartMonth: "", remarks: "" });
  // Reject form
  const [rejectReason, setRejectReason] = useState("");

  const { data: records = [], isLoading } = useQuery<EnrichedLoanAdvance[]>({
    queryKey: ["/api/loan-advances"],
    staleTime: 0,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/loan-advances"] });

  const applyMutation = useMutation({
    mutationFn: async (data: object) => {
      const res = await apiRequest("POST", "/api/loan-advances", data);
      return res.json();
    },
    onSuccess: () => { invalidate(); setApplyOpen(false); setApplyForm({ type: "advance", amount: "", purpose: "", employeeId: "" }); toast({ title: "Application submitted", description: "Loan/advance request has been submitted for approval." }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: object }) => {
      const res = await apiRequest("POST", `/api/loan-advances/${id}/approve`, data);
      return res.json();
    },
    onSuccess: () => { invalidate(); setApproveOpen(false); setApproveForm({ totalInstallments: "", installmentAmount: "", deductionStartMonth: "", remarks: "" }); toast({ title: "Approved", description: "Application approved and deduction schedule set." }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/loan-advances/${id}/reject`, { rejectionReason: reason });
      return res.json();
    },
    onSuccess: () => { invalidate(); setRejectOpen(false); setRejectReason(""); toast({ title: "Rejected", description: "Application has been rejected." }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/loan-advances/${id}/cancel`, {});
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Cancelled", description: "Your application has been cancelled." }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/loan-advances/${id}/close`, {});
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Closed", description: "Loan/advance has been marked as closed." }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: object }) => {
      const res = await apiRequest("POST", `/api/loan-advances/${id}/reschedule`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setScheduleOpen(false);
      setScheduleForm({ totalInstallments: "", installmentAmount: "", deductionStartMonth: "", remarks: "" });
      toast({ title: "Schedule Updated", description: "Deduction schedule has been changed successfully." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const recalcBalanceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/loan-advances/${id}/recalculate-balance`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidate();
      toast({
        title: "Balance Recalculated",
        description: `₹${Number(data.totalDeducted).toLocaleString("en-IN")} deducted across ${data.paidMonths} month(s). New balance: ₹${Number(data.remainingBalance).toLocaleString("en-IN")}`,
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openApprove = (r: EnrichedLoanAdvance) => {
    setSelected(r);
    const suggested = r.totalInstallments
      ? String(Math.ceil(r.amount / r.totalInstallments))
      : String(Math.ceil(r.amount / 3));
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const ym = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
    setApproveForm({ totalInstallments: "3", installmentAmount: suggested, deductionStartMonth: ym, remarks: "" });
    setApproveOpen(true);
  };

  // Auto-calc installment amount when installments change (approve form)
  const handleInstallmentChange = (installments: string) => {
    if (selected && installments) {
      const amt = Math.ceil(selected.amount / Number(installments));
      setApproveForm(f => ({ ...f, totalInstallments: installments, installmentAmount: String(amt) }));
    } else {
      setApproveForm(f => ({ ...f, totalInstallments: installments }));
    }
  };

  const openChangeSchedule = (r: EnrichedLoanAdvance) => {
    setSelected(r);
    const balance = r.remainingBalance || r.amount;
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const ym = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
    const instl = r.totalInstallments || 1;
    const amt = Math.ceil(balance / instl);
    setScheduleForm({
      totalInstallments: String(instl),
      installmentAmount: String(amt),
      deductionStartMonth: r.deductionStartMonth || ym,
      remarks: "",
    });
    setScheduleOpen(true);
  };

  const handleScheduleInstallmentChange = (installments: string) => {
    if (selected && installments) {
      const balance = selected.remainingBalance || selected.amount;
      const amt = Math.ceil(balance / Number(installments));
      setScheduleForm(f => ({ ...f, totalInstallments: installments, installmentAmount: String(amt) }));
    } else {
      setScheduleForm(f => ({ ...f, totalInstallments: installments }));
    }
  };

  const filteredRecords = records.filter(r => {
    if (activeTab === "all") return true;
    if (activeTab === "pending") return r.status === "pending";
    if (activeTab === "active") return r.status === "active";
    if (activeTab === "closed") return ["closed", "rejected", "cancelled"].includes(r.status);
    return true;
  });

  const stats = {
    total: records.length,
    pending: records.filter(r => r.status === "pending").length,
    active: records.filter(r => r.status === "active").length,
    totalActiveAmount: records.filter(r => r.status === "active").reduce((sum, r) => sum + (r.remainingBalance || 0), 0),
  };

  return (
    <>
    <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Wallet className="h-6 w-6 text-primary" />
              Loan & Advance
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isAdmin ? "Manage employee loan and advance requests" : "Apply for and track your loan/advance requests"}
            </p>
          </div>
          <Button onClick={() => setApplyOpen(true)} className="gap-2" disabled={isEmployeeUnlinked}>
            <PlusCircle className="h-4 w-4" />
            Apply
          </Button>
        </div>

        {/* Unlinked employee warning banner */}
        {isEmployeeUnlinked && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">Account not linked to an employee profile</p>
              <p className="text-sm text-amber-700 mt-0.5">
                Your user account is not linked to any employee record. You cannot apply for a loan or advance until your account is linked.
                Please contact your HR administrator to link your account.
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 p-2"><Wallet className="h-4 w-4 text-blue-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Applications</p>
                  <p className="text-xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-amber-100 p-2"><Clock className="h-4 w-4 text-amber-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Pending Approval</p>
                  <p className="text-xl font-bold">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2"><TrendingDown className="h-4 w-4 text-green-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Deductions</p>
                  <p className="text-xl font-bold">{stats.active}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-100 p-2"><IndianRupee className="h-4 w-4 text-purple-600" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Outstanding</p>
                  <p className="text-lg font-bold">{fmt(stats.totalActiveAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">All ({records.length})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
                <TabsTrigger value="active">Active ({stats.active})</TabsTrigger>
                <TabsTrigger value="closed">Closed/Rejected</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Wallet className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground font-medium">No applications found</p>
                <p className="text-muted-foreground/70 text-sm mt-1">
                  {activeTab === "pending" ? "No pending applications" : "Click 'Apply' to submit a new request"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">Sr.</TableHead>
                      {isAdmin && <TableHead>Employee</TableHead>}
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Request Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Deduction</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((r, idx) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-center text-muted-foreground font-medium text-sm">{idx + 1}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="rounded-full bg-primary/10 p-1.5">
                                <User className="h-3 w-3 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{r.employeeName}</p>
                                <p className="text-xs text-muted-foreground">{r.employeeCode}</p>
                              </div>
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${r.type === "loan" ? "bg-indigo-100 text-indigo-700" : "bg-teal-100 text-teal-700"}`}>
                            {r.type === "loan" ? "Loan" : "Advance"}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold">{fmt(r.amount)}</TableCell>
                        <TableCell className="max-w-[150px] truncate text-sm text-muted-foreground">{r.purpose || "—"}</TableCell>
                        <TableCell className="text-sm">{fmtDate(r.requestDate)}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-sm">
                          {r.status === "active" && r.installmentAmount ? (
                            <div>
                              <p className="font-medium">{fmt(r.installmentAmount)}/mo</p>
                              <p className="text-xs text-muted-foreground">{r.totalInstallments} instl. from {r.deductionStartMonth}</p>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {r.status === "active" ? fmt(r.remainingBalance) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="View" onClick={() => { setSelected(r); setViewOpen(true); }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {isAdmin && r.status === "pending" && (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" title="Approve" onClick={() => openApprove(r)}>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" title="Reject" onClick={() => { setSelected(r); setRejectOpen(true); }}>
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {isAdmin && r.status === "active" && (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" title="Change Deduction Schedule" onClick={() => openChangeSchedule(r)}>
                                  <CalendarClock className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-700 hover:text-green-800 hover:bg-green-50" title="Sync Balance from Payroll Records" onClick={() => recalcBalanceMutation.mutate(r.id)} disabled={recalcBalanceMutation.isPending}>
                                  <RefreshCw className={`h-3.5 w-3.5 ${recalcBalanceMutation.isPending ? "animate-spin" : ""}`} />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500 hover:bg-gray-100" title="Mark as Closed" onClick={() => closeMutation.mutate(r.id)}>
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {!isAdmin && r.status === "pending" && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" title="Cancel" onClick={() => cancelMutation.mutate(r.id)}>
                                <XCircle className="h-3.5 w-3.5" />
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
      </div>

      {/* Apply Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Apply for Loan / Advance
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Employee <span className="text-red-500">*</span></Label>
                <SearchableEmployeeSelect
                  employees={allEmployees}
                  value={applyForm.employeeId}
                  onValueChange={v => setApplyForm(f => ({ ...f, employeeId: v }))}
                  placeholder="Select employee..."
                />
                <p className="text-xs text-muted-foreground">Select the employee this application is for.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={applyForm.type} onValueChange={v => setApplyForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Salary Advance</SelectItem>
                  <SelectItem value="loan">Loan</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {applyForm.type === "advance" ? "Advance against upcoming salary — typically recovered in 1–2 months." : "Loan amount recovered over multiple installments from salary."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₹) <span className="text-red-500">*</span></Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  type="number"
                  min="1"
                  placeholder="Enter amount"
                  value={applyForm.amount}
                  onChange={e => setApplyForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Purpose / Reason</Label>
              <Textarea
                placeholder="Briefly describe the reason for this request..."
                rows={3}
                value={applyForm.purpose}
                onChange={e => setApplyForm(f => ({ ...f, purpose: e.target.value }))}
              />
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-sm text-amber-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>{isAdmin ? "Deductions will begin after approval on the selected employee's payroll." : "Your request will be reviewed by HR / Manager. Deductions will start after approval."}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button
              disabled={!applyForm.amount || (isAdmin && !applyForm.employeeId) || applyMutation.isPending}
              onClick={() => {
                const selectedEmp = isAdmin ? allEmployees.find(e => e.id === applyForm.employeeId) : null;
                applyMutation.mutate({
                  type: applyForm.type,
                  amount: Number(applyForm.amount),
                  purpose: applyForm.purpose,
                  ...(isAdmin && applyForm.employeeId ? {
                    employeeId: applyForm.employeeId,
                    companyId: selectedEmp?.companyId,
                  } : {}),
                });
              }}
            >
              {applyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Approve & Schedule Deductions
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg bg-muted/50 border p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee</span>
                  <span className="font-medium">{selected.employeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium capitalize">{selected.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Requested Amount</span>
                  <span className="font-bold text-primary">{fmt(selected.amount)}</span>
                </div>
                {selected.purpose && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Purpose</span>
                    <span className="font-medium max-w-[200px] text-right">{selected.purpose}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>No. of Installments <span className="text-red-500">*</span></Label>
                  <Select value={approveForm.totalInstallments} onValueChange={handleInstallmentChange}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                        <SelectItem key={n} value={String(n)}>{n} month{n > 1 ? "s" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Monthly Deduction (₹) <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      type="number"
                      min="1"
                      value={approveForm.installmentAmount}
                      onChange={e => setApproveForm(f => ({ ...f, installmentAmount: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Deduction Start Month <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="month"
                  value={approveForm.deductionStartMonth}
                  onChange={e => setApproveForm(f => ({ ...f, deductionStartMonth: e.target.value }))}
                />
              </div>

              {approveForm.totalInstallments && approveForm.installmentAmount && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 space-y-0.5">
                  <p className="font-semibold">Deduction Summary</p>
                  <p>{approveForm.totalInstallments} × {fmt(Number(approveForm.installmentAmount))} = {fmt(Number(approveForm.totalInstallments) * Number(approveForm.installmentAmount))}</p>
                  <p className="text-xs text-green-600">
                    {Number(approveForm.totalInstallments) * Number(approveForm.installmentAmount) !== selected.amount
                      ? `Note: Total (${fmt(Number(approveForm.totalInstallments) * Number(approveForm.installmentAmount))}) differs from requested amount.`
                      : "Total matches requested amount."}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Internal Remarks (optional)</Label>
                <Textarea
                  placeholder="Any remarks for the approval..."
                  rows={2}
                  value={approveForm.remarks}
                  onChange={e => setApproveForm(f => ({ ...f, remarks: e.target.value }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!approveForm.totalInstallments || !approveForm.installmentAmount || !approveForm.deductionStartMonth || approveMutation.isPending}
              onClick={() => selected && approveMutation.mutate({
                id: selected.id,
                data: {
                  totalInstallments: Number(approveForm.totalInstallments),
                  installmentAmount: Number(approveForm.installmentAmount),
                  deductionStartMonth: approveForm.deductionStartMonth,
                  remarks: approveForm.remarks || undefined,
                }
              })}
            >
              {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Approve & Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Reject Application
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {selected && (
              <div className="rounded-lg bg-muted/50 border p-3 text-sm">
                <p><span className="text-muted-foreground">Employee: </span><span className="font-medium">{selected.employeeName}</span></p>
                <p><span className="text-muted-foreground">Amount: </span><span className="font-medium">{fmt(selected.amount)}</span></p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Reason for Rejection <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Provide a reason for rejecting this application..."
                rows={3}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => selected && rejectMutation.mutate({ id: selected.id, reason: rejectReason })}
            >
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Deduction Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-indigo-600" />
              Change Deduction Schedule
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-1">
              {/* Current schedule summary */}
              <div className="rounded-lg bg-muted/50 border p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee</span>
                  <span className="font-medium">{selected.employeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Remaining Balance</span>
                  <span className="font-bold text-indigo-700">{fmt(selected.remainingBalance ?? selected.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Schedule</span>
                  <span className="font-medium">{fmt(selected.installmentAmount)}/mo × {selected.totalInstallments} instl.</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deduction from</span>
                  <span className="font-medium">{selected.deductionStartMonth || "—"}</span>
                </div>
              </div>

              {/* New schedule inputs */}
              <div className="space-y-1.5">
                <Label>New Number of Installments <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  placeholder="e.g. 3"
                  value={scheduleForm.totalInstallments}
                  onChange={e => handleScheduleInstallmentChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">How many monthly deductions to recover the remaining balance.</p>
              </div>

              <div className="space-y-1.5">
                <Label>Monthly Installment Amount (₹) <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    type="number"
                    min="1"
                    placeholder="Auto-calculated"
                    value={scheduleForm.installmentAmount}
                    onChange={e => setScheduleForm(f => ({ ...f, installmentAmount: e.target.value }))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Auto-calculated from remaining balance ÷ installments. Adjust if needed.</p>
              </div>

              <div className="space-y-1.5">
                <Label>New Start Month <span className="text-red-500">*</span></Label>
                <Input
                  type="month"
                  value={scheduleForm.deductionStartMonth}
                  onChange={e => setScheduleForm(f => ({ ...f, deductionStartMonth: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Month from which new deductions will begin.</p>
              </div>

              <div className="space-y-1.5">
                <Label>Reason for Change</Label>
                <Textarea
                  placeholder="e.g. Employee requested extension due to medical expense..."
                  rows={2}
                  value={scheduleForm.remarks}
                  onChange={e => setScheduleForm(f => ({ ...f, remarks: e.target.value }))}
                />
              </div>

              {/* New schedule preview */}
              {scheduleForm.totalInstallments && scheduleForm.installmentAmount && (
                <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm space-y-1">
                  <p className="font-semibold text-indigo-700">New Schedule Preview</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monthly deduction</span>
                    <span className="font-medium">{fmt(Number(scheduleForm.installmentAmount))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Number of months</span>
                    <span className="font-medium">{scheduleForm.totalInstallments}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total recovery</span>
                    <span className={`font-bold ${Number(scheduleForm.totalInstallments) * Number(scheduleForm.installmentAmount) !== (selected.remainingBalance ?? selected.amount) ? "text-amber-600" : "text-indigo-700"}`}>
                      {fmt(Number(scheduleForm.totalInstallments) * Number(scheduleForm.installmentAmount))}
                    </span>
                  </div>
                  {Number(scheduleForm.totalInstallments) * Number(scheduleForm.installmentAmount) !== (selected.remainingBalance ?? selected.amount) && (
                    <p className="text-xs text-amber-600">Note: Total differs from remaining balance {fmt(selected.remainingBalance ?? selected.amount)}</p>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={!scheduleForm.totalInstallments || !scheduleForm.installmentAmount || !scheduleForm.deductionStartMonth || rescheduleMutation.isPending}
              onClick={() => selected && rescheduleMutation.mutate({
                id: selected.id,
                data: {
                  totalInstallments: Number(scheduleForm.totalInstallments),
                  installmentAmount: Number(scheduleForm.installmentAmount),
                  deductionStartMonth: scheduleForm.deductionStartMonth,
                  remarks: scheduleForm.remarks || undefined,
                },
              })}
            >
              {rescheduleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Application Details
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 py-1 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-4">
                {isAdmin && (
                  <>
                    <div><p className="text-muted-foreground">Employee</p><p className="font-medium">{selected.employeeName}</p></div>
                    <div><p className="text-muted-foreground">Emp. Code</p><p className="font-medium">{selected.employeeCode}</p></div>
                  </>
                )}
                <div><p className="text-muted-foreground">Type</p><p className="font-medium capitalize">{selected.type}</p></div>
                <div><p className="text-muted-foreground">Status</p><StatusBadge status={selected.status} /></div>
                <div><p className="text-muted-foreground">Amount</p><p className="font-bold text-primary">{fmt(selected.amount)}</p></div>
                <div><p className="text-muted-foreground">Request Date</p><p className="font-medium">{fmtDate(selected.requestDate)}</p></div>
                {selected.purpose && <div className="col-span-2"><p className="text-muted-foreground">Purpose</p><p className="font-medium">{selected.purpose}</p></div>}
              </div>
              {selected.status === "active" && (
                <div className="rounded-lg border p-4 space-y-2 bg-blue-50/50">
                  <p className="font-semibold text-blue-700">Deduction Schedule</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div><p className="text-muted-foreground">Monthly Amount</p><p className="font-medium">{fmt(selected.installmentAmount)}</p></div>
                    <div><p className="text-muted-foreground">Total Installments</p><p className="font-medium">{selected.totalInstallments}</p></div>
                    <div><p className="text-muted-foreground">Start Month</p><p className="font-medium">{selected.deductionStartMonth}</p></div>
                    <div><p className="text-muted-foreground">Remaining Balance</p><p className="font-bold text-blue-700">{fmt(selected.remainingBalance)}</p></div>
                  </div>
                  {selected.approvedAt && <div><p className="text-muted-foreground">Approved On</p><p className="font-medium">{fmtDate(selected.approvedAt)}</p></div>}
                  {selected.remarks && <div><p className="text-muted-foreground">Remarks</p><p className="font-medium">{selected.remarks}</p></div>}
                </div>
              )}
              {selected.status === "rejected" && selected.rejectionReason && (
                <div className="rounded-lg border border-red-200 p-4 bg-red-50 text-red-800">
                  <p className="font-semibold mb-1">Rejection Reason</p>
                  <p>{selected.rejectionReason}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
