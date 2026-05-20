import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SearchableEmployeeSelect } from "@/components/searchable-employee-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet, PlusCircle, CheckCircle2, XCircle, Clock, Eye, Ban, Loader2,
  IndianRupee, Calendar, User, TrendingDown, AlertCircle, CalendarClock,
  RefreshCw, Pencil, Trash2, Receipt, Tag, FileText, Send, Check, X,
  LayoutDashboard, CreditCard,
} from "lucide-react";
import { format } from "date-fns";
import type { LoanAdvance } from "@shared/schema";

type EnrichedLoanAdvance = LoanAdvance & { employeeName: string; employeeCode: string };

const LOAN_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:   { label: "Pending",   color: "text-amber-600 border-amber-400 bg-amber-50" },
  active:    { label: "Active",    color: "text-blue-600 border-blue-400 bg-blue-50" },
  approved:  { label: "Approved",  color: "text-green-600 border-green-400 bg-green-50" },
  rejected:  { label: "Rejected",  color: "text-red-600 border-red-400 bg-red-50" },
  closed:    { label: "Closed",    color: "text-gray-600 border-gray-300 bg-gray-50" },
  cancelled: { label: "Cancelled", color: "text-gray-500 border-gray-300 bg-gray-50" },
};

const EXP_STATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string; icon: any }> = {
  submitted: { label: "Submitted", bg: "bg-sky-50",    text: "text-sky-700",   border: "border-sky-200",   icon: Send },
  approved:  { label: "Approved",  bg: "bg-green-50",  text: "text-green-700", border: "border-green-200", icon: Check },
  rejected:  { label: "Rejected",  bg: "bg-red-50",    text: "text-red-600",   border: "border-red-200",   icon: X },
  draft:     { label: "Draft",     bg: "bg-slate-50",  text: "text-slate-500", border: "border-slate-200", icon: FileText },
};

const EXP_CATEGORIES = [
  { value: "travel",               label: "Travel",                icon: "✈️" },
  { value: "food",                 label: "Food & Meals",          icon: "🍽️" },
  { value: "accommodation",        label: "Accommodation",         icon: "🏨" },
  { value: "medical",              label: "Medical",               icon: "🏥" },
  { value: "office_supplies",      label: "Office Supplies",       icon: "📎" },
  { value: "client_entertainment", label: "Client Entertainment",  icon: "🤝" },
  { value: "other",                label: "Other",                 icon: "📋" },
];

const getCatIcon = (cat: string) => EXP_CATEGORIES.find(c => c.value === cat)?.icon || "📋";
const getCatLabel = (cat: string) => EXP_CATEGORIES.find(c => c.value === cat)?.label || cat;

function StatusBadge({ status }: { status: string }) {
  const cfg = LOAN_STATUS_CONFIG[status] || { label: status, color: "text-gray-600" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>{cfg.label}</span>;
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

export default function FinancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = ["super_admin", "company_admin", "hr_admin", "manager"].includes(user?.role || "");

  // ── Loan & Advance state ──────────────────────────────────────────────────
  const [applyOpen, setApplyOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<EnrichedLoanAdvance | null>(null);
  const [editForm, setEditForm] = useState({ type: "advance", amount: "", purpose: "" });
  const [loanTab, setLoanTab] = useState("all");
  const [scheduleForm, setScheduleForm] = useState({ totalInstallments: "", installmentAmount: "", deductionStartMonth: "", remarks: "" });
  const [applyForm, setApplyForm] = useState({ type: "advance", amount: "", purpose: "", employeeId: "" });
  const [approveForm, setApproveForm] = useState({ totalInstallments: "", installmentAmount: "", deductionStartMonth: "", remarks: "" });
  const [rejectReason, setRejectReason] = useState("");

  // ── Expense state ─────────────────────────────────────────────────────────
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ date: format(new Date(), "yyyy-MM-dd"), category: "travel", amount: "", description: "", receiptNote: "", employeeId: "" });
  const [expRejectOpen, setExpRejectOpen] = useState(false);
  const [selectedExp, setSelectedExp] = useState<any>(null);
  const [expRejectReason, setExpRejectReason] = useState("");
  const [expFilterStatus, setExpFilterStatus] = useState("__all__");

  const { data: allEmployees = [] } = useQuery<any[]>({ queryKey: ["/api/employees"], enabled: isAdmin });
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

  const { data: loanRecords = [], isLoading: loanLoading } = useQuery<EnrichedLoanAdvance[]>({
    queryKey: ["/api/loan-advances"],
    staleTime: 0,
  });

  const { data: expenseRecords = [], isLoading: expLoading } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    staleTime: 0,
  });

  const { data: payslipRecords = [], isLoading: payslipLoading } = useQuery<any[]>({
    queryKey: ["/api/my-payslips"],
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const res = await fetch("/api/my-payslips", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [expandedPayslip, setExpandedPayslip] = useState<string | null>(null);

  const [location] = useLocation();
  const initialTab = (() => {
    if (typeof window === "undefined") return "loans";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "payslips" || t === "expenses" || t === "loans" ? t : "loans";
  })();
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && t !== activeTab && (t === "payslips" || t === "expenses" || t === "loans")) {
      setActiveTab(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const invalidateLoans = () => qc.invalidateQueries({ queryKey: ["/api/loan-advances"] });
  const invalidateExp   = () => qc.invalidateQueries({ queryKey: ["/api/expenses"] });

  // ── Loan mutations ────────────────────────────────────────────────────────
  const applyMutation = useMutation({
    mutationFn: async (data: object) => (await apiRequest("POST", "/api/loan-advances", data)).json(),
    onSuccess: () => { invalidateLoans(); setApplyOpen(false); setApplyForm({ type: "advance", amount: "", purpose: "", employeeId: "" }); toast({ title: "Application submitted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: object }) => (await apiRequest("POST", `/api/loan-advances/${id}/approve`, data)).json(),
    onSuccess: () => { invalidateLoans(); setApproveOpen(false); toast({ title: "Approved" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await apiRequest("POST", `/api/loan-advances/${id}/reject`, { rejectionReason: reason })).json(),
    onSuccess: () => { invalidateLoans(); setRejectOpen(false); setRejectReason(""); toast({ title: "Rejected" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/loan-advances/${id}/cancel`, {})).json(),
    onSuccess: () => { invalidateLoans(); toast({ title: "Cancelled" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/loan-advances/${id}/close`, {})).json(),
    onSuccess: () => { invalidateLoans(); toast({ title: "Closed" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: object }) => (await apiRequest("POST", `/api/loan-advances/${id}/reschedule`, data)).json(),
    onSuccess: () => { invalidateLoans(); setScheduleOpen(false); toast({ title: "Schedule Updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: object }) => (await apiRequest("PATCH", `/api/loan-advances/${id}`, data)).json(),
    onSuccess: () => { invalidateLoans(); setEditOpen(false); toast({ title: "Updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/loan-advances/${id}`)).json(),
    onSuccess: () => { invalidateLoans(); setDeleteOpen(false); setSelected(null); toast({ title: "Deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const recalcBalanceMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/loan-advances/${id}/recalculate-balance`, {})).json(),
    onSuccess: (data: any) => { invalidateLoans(); toast({ title: "Balance Recalculated", description: `New balance: ₹${Number(data.remainingBalance).toLocaleString("en-IN")}` }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Expense mutations ─────────────────────────────────────────────────────
  const createExpMutation = useMutation({
    mutationFn: async (data: object) => (await apiRequest("POST", "/api/expenses", data)).json(),
    onSuccess: () => { invalidateExp(); setExpenseOpen(false); setExpenseForm({ date: format(new Date(), "yyyy-MM-dd"), category: "travel", amount: "", description: "", receiptNote: "", employeeId: "" }); toast({ title: "Expense submitted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approveExpMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("PATCH", `/api/expenses/${id}`, { status: "approved", approvedAt: new Date().toISOString() })).json(),
    onSuccess: () => { invalidateExp(); toast({ title: "Expense Approved" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectExpMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await apiRequest("PATCH", `/api/expenses/${id}`, { status: "rejected", rejectionReason: reason })).json(),
    onSuccess: () => { invalidateExp(); setExpRejectOpen(false); setExpRejectReason(""); toast({ title: "Expense Rejected" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteExpMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/expenses/${id}`)).json(),
    onSuccess: () => { invalidateExp(); toast({ title: "Expense deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openApprove = (r: EnrichedLoanAdvance) => {
    setSelected(r);
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const ym = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
    const suggested = String(Math.ceil(r.amount / 3));
    setApproveForm({ totalInstallments: "3", installmentAmount: suggested, deductionStartMonth: ym, remarks: "" });
    setApproveOpen(true);
  };

  const handleInstallmentChange = (installments: string) => {
    if (selected && installments) {
      setApproveForm(f => ({ ...f, totalInstallments: installments, installmentAmount: String(Math.ceil(selected.amount / Number(installments))) }));
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
    setScheduleForm({ totalInstallments: String(instl), installmentAmount: String(Math.ceil(balance / instl)), deductionStartMonth: r.deductionStartMonth || ym, remarks: "" });
    setScheduleOpen(true);
  };

  const handleScheduleInstallmentChange = (installments: string) => {
    if (selected && installments) {
      const balance = selected.remainingBalance || selected.amount;
      setScheduleForm(f => ({ ...f, totalInstallments: installments, installmentAmount: String(Math.ceil(balance / Number(installments))) }));
    } else {
      setScheduleForm(f => ({ ...f, totalInstallments: installments }));
    }
  };

  const getEmpName = (empId: string) => {
    const e = allEmployees.find((e: any) => e.id === empId);
    return e ? `${e.firstName} ${e.lastName}` : "—";
  };

  const filteredLoanRecords = loanRecords.filter(r => {
    if (loanTab === "all") return true;
    if (loanTab === "pending") return r.status === "pending";
    if (loanTab === "active") return r.status === "active";
    if (loanTab === "closed") return ["closed", "rejected", "cancelled"].includes(r.status);
    return true;
  });

  const filteredExpenses = expFilterStatus === "__all__"
    ? expenseRecords
    : expenseRecords.filter((e: any) => e.status === expFilterStatus);

  const loanStats = {
    total: loanRecords.length,
    pending: loanRecords.filter(r => r.status === "pending").length,
    active: loanRecords.filter(r => r.status === "active").length,
    totalActiveAmount: loanRecords.filter(r => r.status === "active").reduce((s, r) => s + (r.remainingBalance || 0), 0),
  };

  const expStats = {
    total: expenseRecords.length,
    pending: expenseRecords.filter((e: any) => e.status === "submitted").length,
    approved: expenseRecords.filter((e: any) => e.status === "approved").length,
    totalApproved: expenseRecords.filter((e: any) => e.status === "approved").reduce((s: number, e: any) => s + Number(e.amount || 0), 0),
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-primary" />
              Finance
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isAdmin ? "Manage employee loans, advances & expense claims" : "Apply for loans, advances and submit expense claims"}
            </p>
          </div>
        </div>

        {isEmployeeUnlinked && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">Account not linked to an employee profile</p>
              <p className="text-sm text-amber-700 mt-0.5">Your user account is not linked to any employee record. Please contact HR.</p>
            </div>
          </div>
        )}

        {/* ── Main Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-2">
            <TabsTrigger value="loans" className="gap-2">
              <CreditCard className="h-4 w-4" />Loan & Advance
            </TabsTrigger>
            <TabsTrigger value="expenses" className="gap-2">
              <Receipt className="h-4 w-4" />Expenses
            </TabsTrigger>
            {!isAdmin && (
              <TabsTrigger value="payslips" className="gap-2">
                <FileText className="h-4 w-4" />Payslips
              </TabsTrigger>
            )}
          </TabsList>

          {/* ══ LOAN & ADVANCE TAB ══════════════════════════════════════════ */}
          <TabsContent value="loans" className="space-y-4 mt-2">

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Applications", value: loanStats.total,             icon: <Wallet className="h-4 w-4 text-blue-600" />,   bg: "bg-blue-50",   text: "text-blue-700" },
                { label: "Pending Approval",   value: loanStats.pending,           icon: <Clock className="h-4 w-4 text-amber-600" />,  bg: "bg-amber-50",  text: "text-amber-700" },
                { label: "Active Deductions",  value: loanStats.active,            icon: <TrendingDown className="h-4 w-4 text-green-600" />, bg: "bg-green-50", text: "text-green-700" },
                { label: "Outstanding",        value: fmt(loanStats.totalActiveAmount), icon: <IndianRupee className="h-4 w-4 text-purple-600" />, bg: "bg-purple-50", text: "text-purple-700" },
              ].map(s => (
                <Card key={s.label} className={`border-0 ${s.bg}`}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full bg-white/70 p-2`}>{s.icon}</div>
                      <div>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className={`text-xl font-bold ${s.text}`}>{s.value}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Loan table */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <Tabs value={loanTab} onValueChange={setLoanTab}>
                    <TabsList>
                      <TabsTrigger value="all">All ({loanRecords.length})</TabsTrigger>
                      <TabsTrigger value="pending">Pending ({loanStats.pending})</TabsTrigger>
                      <TabsTrigger value="active">Active ({loanStats.active})</TabsTrigger>
                      <TabsTrigger value="closed">Closed/Rejected</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button onClick={() => setApplyOpen(true)} className="gap-2" disabled={isEmployeeUnlinked}>
                    <PlusCircle className="h-4 w-4" />Apply
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loanLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : filteredLoanRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Wallet className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground font-medium">No applications found</p>
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
                        {filteredLoanRecords.map((r, idx) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-center text-muted-foreground text-sm">{idx + 1}</TableCell>
                            {isAdmin && (
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="rounded-full bg-primary/10 p-1.5"><User className="h-3 w-3 text-primary" /></div>
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
                            <TableCell className="font-medium text-sm">{r.status === "active" ? fmt(r.remainingBalance) : "—"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="View" onClick={() => { setSelected(r); setViewOpen(true); }}><Eye className="h-3.5 w-3.5" /></Button>
                                {r.status === "pending" && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:bg-blue-50" title="Edit" onClick={() => { setSelected(r); setEditForm({ type: r.type, amount: String(r.amount), purpose: r.purpose || "" }); setEditOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                                )}
                                {isAdmin && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" title="Delete" onClick={() => { setSelected(r); setDeleteOpen(true); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                                )}
                                {isAdmin && r.status === "pending" && (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" title="Approve" onClick={() => openApprove(r)}><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-orange-500 hover:bg-orange-50" title="Reject" onClick={() => { setSelected(r); setRejectOpen(true); }}><XCircle className="h-3.5 w-3.5" /></Button>
                                  </>
                                )}
                                {isAdmin && r.status === "active" && (
                                  <>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" title="Change Schedule" onClick={() => openChangeSchedule(r)}><CalendarClock className="h-3.5 w-3.5" /></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-green-700 hover:bg-green-50" title="Sync Balance" onClick={() => recalcBalanceMutation.mutate(r.id)} disabled={recalcBalanceMutation.isPending}><RefreshCw className={`h-3.5 w-3.5 ${recalcBalanceMutation.isPending ? "animate-spin" : ""}`} /></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500 hover:bg-gray-100" title="Mark Closed" onClick={() => closeMutation.mutate(r.id)}><Ban className="h-3.5 w-3.5" /></Button>
                                  </>
                                )}
                                {!isAdmin && r.status === "pending" && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" title="Cancel" onClick={() => cancelMutation.mutate(r.id)}><XCircle className="h-3.5 w-3.5" /></Button>
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
          </TabsContent>

          {/* ══ EXPENSES TAB ════════════════════════════════════════════════ */}
          <TabsContent value="expenses" className="space-y-4 mt-2">

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Claims",      value: expStats.total,                               bg: "bg-slate-50",   text: "text-slate-700",   icon: <Receipt className="h-4 w-4 text-slate-500" /> },
                { label: "Pending Review",    value: expStats.pending,                             bg: "bg-amber-50",   text: "text-amber-700",   icon: <Clock className="h-4 w-4 text-amber-500" /> },
                { label: "Approved",          value: expStats.approved,                            bg: "bg-green-50",   text: "text-green-700",   icon: <Check className="h-4 w-4 text-green-500" /> },
                { label: "Total Reimbursed",  value: `₹${Number(expStats.totalApproved).toLocaleString("en-IN")}`, bg: "bg-emerald-50", text: "text-emerald-700", icon: <IndianRupee className="h-4 w-4 text-emerald-600" /> },
              ].map(s => (
                <Card key={s.label} className={`border-0 ${s.bg}`}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-white/70 p-2">{s.icon}</div>
                      <div>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className={`text-xl font-bold ${s.text}`}>{s.value}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Expense table */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">Expense Claims</CardTitle>
                    <Select value={expFilterStatus} onValueChange={setExpFilterStatus}>
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Status</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => setExpenseOpen(true)} className="gap-2" disabled={isEmployeeUnlinked}>
                    <PlusCircle className="h-4 w-4" />Add Expense
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {expLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : filteredExpenses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <div className="rounded-full bg-slate-100 p-4">
                      <Receipt className="h-8 w-8 text-slate-300" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-600">No expense claims</p>
                      <p className="text-sm text-slate-400 mt-1">Submit an expense to get reimbursed</p>
                    </div>
                    <Button size="sm" className="gap-2" onClick={() => setExpenseOpen(true)} disabled={isEmployeeUnlinked}>
                      <PlusCircle className="h-3.5 w-3.5" />Add Expense
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10 text-center">Sr.</TableHead>
                          {isAdmin && <TableHead>Employee</TableHead>}
                          <TableHead>Date</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredExpenses.map((exp: any, idx: number) => {
                          const cfg = EXP_STATUS_CFG[exp.status] || EXP_STATUS_CFG.draft;
                          const Icon = cfg.icon;
                          return (
                            <TableRow key={exp.id}>
                              <TableCell className="text-center text-muted-foreground text-sm">{idx + 1}</TableCell>
                              {isAdmin && (
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="rounded-full bg-primary/10 p-1.5"><User className="h-3 w-3 text-primary" /></div>
                                    <span className="text-sm font-medium">{getEmpName(exp.employeeId)}</span>
                                  </div>
                                </TableCell>
                              )}
                              <TableCell className="text-sm">{fmtDate(exp.date)}</TableCell>
                              <TableCell>
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                                  <span>{getCatIcon(exp.category)}</span>
                                  {getCatLabel(exp.category)}
                                </span>
                              </TableCell>
                              <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{exp.description}</TableCell>
                              <TableCell className="font-semibold text-sm">{fmt(Number(exp.amount))}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                  <Icon className="h-3 w-3" />{cfg.label}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {isAdmin && exp.status === "submitted" && (
                                    <>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" title="Approve" onClick={() => approveExpMutation.mutate(exp.id)}><CheckCircle2 className="h-3.5 w-3.5" /></Button>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" title="Reject" onClick={() => { setSelectedExp(exp); setExpRejectOpen(true); }}><XCircle className="h-3.5 w-3.5" /></Button>
                                    </>
                                  )}
                                  {(isAdmin || exp.status === "submitted") && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" title="Delete" onClick={() => deleteExpMutation.mutate(exp.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══ PAYSLIPS TAB ═════════════════════════════════════════════════ */}
          {!isAdmin && (
            <TabsContent value="payslips" className="space-y-4 mt-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    My Payslips
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">View your salary breakdown for each month</p>
                </CardHeader>
                <CardContent className="p-0">
                  {payslipLoading ? (
                    <div className="p-6 space-y-3">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
                  ) : payslipRecords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                      <div className="rounded-full bg-slate-100 p-4"><FileText className="h-8 w-8 text-slate-300" /></div>
                      <div>
                        <p className="font-medium text-slate-600">No payslips yet</p>
                        <p className="text-sm text-slate-400 mt-1">Your payslips will appear here once payroll is processed</p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {payslipRecords
                        .sort((a: any, b: any) => {
                          const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                          const ai = months.indexOf(a.month) + a.year * 12;
                          const bi = months.indexOf(b.month) + b.year * 12;
                          return bi - ai;
                        })
                        .map((slip: any) => {
                          const isExpanded = expandedPayslip === slip.id;
                          const gross = slip.totalEarnings || 0;
                          const net = slip.netSalary || 0;
                          const deductions = slip.totalDeductions || 0;
                          const statusCfg: Record<string, { bg: string; text: string; label: string }> = {
                            paid:      { bg: "bg-green-100",  text: "text-green-700",  label: "Paid" },
                            processed: { bg: "bg-blue-100",   text: "text-blue-700",   label: "Processed" },
                            draft:     { bg: "bg-slate-100",  text: "text-slate-700",  label: "Draft" },
                          };
                          const cfg = statusCfg[slip.status] || statusCfg.draft;
                          const earningsRows = [
                            { label: "Basic Salary",        value: slip.basicSalary },
                            { label: "HRA",                 value: slip.hra },
                            { label: "Conveyance",          value: slip.conveyance },
                            { label: "Medical Allowance",   value: slip.medicalAllowance },
                            { label: "Special Allowance",   value: slip.specialAllowance },
                            { label: "Other Allowances",    value: slip.otherAllowances },
                            { label: "Bonus",               value: slip.bonus },
                            ...(slip.otAmount > 0 ? [{ label: "OT Amount", value: slip.otAmount }] : []),
                          ].filter(r => r.value && r.value > 0);
                          const deductionRows = [
                            { label: "PF (Employee)",    value: slip.pfEmployee },
                            { label: "VPF",              value: slip.vpfAmount },
                            { label: "ESI",              value: slip.esi },
                            { label: "Professional Tax", value: slip.professionalTax },
                            { label: "LWF",              value: slip.lwfEmployee },
                            { label: "TDS",              value: slip.tds },
                            { label: "Loan Deduction",   value: slip.loanDeduction },
                            { label: "Other Deductions", value: slip.otherDeductions },
                          ].filter(r => r.value && r.value > 0);
                          return (
                            <div key={slip.id} className="p-5">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="font-semibold text-base text-slate-800">{slip.month} {slip.year}</p>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {slip.payDays || slip.presentDays} pay days &nbsp;·&nbsp;
                                    {slip.workingDays} working days
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <p className="text-xs text-slate-400">Net Salary</p>
                                    <p className="text-xl font-bold text-slate-800">₹{Number(net).toLocaleString("en-IN")}</p>
                                  </div>
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setExpandedPayslip(isExpanded ? null : slip.id)}>
                                    {isExpanded ? <X className="h-4 w-4" /> : <FileText className="h-4 w-4 text-primary" />}
                                  </Button>
                                </div>
                              </div>
                              {isExpanded && (
                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  {/* Earnings */}
                                  <div className="rounded-xl border border-green-200 bg-green-50/50 overflow-hidden">
                                    <div className="bg-green-100 px-4 py-2 flex items-center justify-between">
                                      <p className="text-xs font-bold text-green-800 uppercase tracking-wider">Earnings</p>
                                      <p className="text-sm font-bold text-green-700">₹{Number(gross).toLocaleString("en-IN")}</p>
                                    </div>
                                    <div className="p-3 space-y-1.5">
                                      {earningsRows.map(r => (
                                        <div key={r.label} className="flex justify-between text-xs">
                                          <span className="text-slate-600">{r.label}</span>
                                          <span className="font-medium text-slate-700">₹{Number(r.value).toLocaleString("en-IN")}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  {/* Deductions */}
                                  <div className="rounded-xl border border-red-200 bg-red-50/50 overflow-hidden">
                                    <div className="bg-red-100 px-4 py-2 flex items-center justify-between">
                                      <p className="text-xs font-bold text-red-800 uppercase tracking-wider">Deductions</p>
                                      <p className="text-sm font-bold text-red-700">₹{Number(deductions).toLocaleString("en-IN")}</p>
                                    </div>
                                    <div className="p-3 space-y-1.5">
                                      {deductionRows.length === 0 ? (
                                        <p className="text-xs text-slate-400 text-center py-2">No deductions</p>
                                      ) : deductionRows.map(r => (
                                        <div key={r.label} className="flex justify-between text-xs">
                                          <span className="text-slate-600">{r.label}</span>
                                          <span className="font-medium text-slate-700">₹{Number(r.value).toLocaleString("en-IN")}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  {/* Net */}
                                  <div className="sm:col-span-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between">
                                    <p className="font-semibold text-primary">Net Salary</p>
                                    <p className="text-xl font-bold text-primary">₹{Number(net).toLocaleString("en-IN")}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

        </Tabs>
      </div>

      {/* ── Loan Apply Dialog ── */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" />Apply for Loan / Advance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Employee <span className="text-red-500">*</span></Label>
                <SearchableEmployeeSelect employees={allEmployees} value={applyForm.employeeId} onValueChange={v => setApplyForm(f => ({ ...f, employeeId: v }))} placeholder="Select employee..." />
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
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₹) <span className="text-red-500">*</span></Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" type="number" min="1" placeholder="Enter amount" value={applyForm.amount} onChange={e => setApplyForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Purpose / Reason</Label>
              <Textarea placeholder="Briefly describe the reason..." rows={3} value={applyForm.purpose} onChange={e => setApplyForm(f => ({ ...f, purpose: e.target.value }))} />
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-sm text-amber-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>Your request will be reviewed by HR / Manager. Deductions will start after approval.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button
              disabled={!applyForm.amount || (isAdmin && !applyForm.employeeId) || applyMutation.isPending}
              onClick={() => {
                const selectedEmp = isAdmin ? allEmployees.find((e: any) => e.id === applyForm.employeeId) : null;
                applyMutation.mutate({ type: applyForm.type, amount: Number(applyForm.amount), purpose: applyForm.purpose, ...(isAdmin && applyForm.employeeId ? { employeeId: applyForm.employeeId, companyId: selectedEmp?.companyId } : {}) });
              }}
            >
              {applyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Expense Add Dialog ── */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" />Add Expense Claim</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Employee <span className="text-red-500">*</span></Label>
                <SearchableEmployeeSelect employees={allEmployees} value={expenseForm.employeeId} onValueChange={v => setExpenseForm(f => ({ ...f, employeeId: v }))} placeholder="Select employee..." />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Category <span className="text-red-500">*</span></Label>
                <Select value={expenseForm.category} onValueChange={v => setExpenseForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXP_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₹) <span className="text-red-500">*</span></Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" type="number" min="1" step="0.01" placeholder="0.00" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-red-500">*</span></Label>
              <Textarea placeholder="Describe what this expense was for..." rows={2} value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Receipt / Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input placeholder="Receipt no., vendor name, or any other reference..." value={expenseForm.receiptNote} onChange={e => setExpenseForm(f => ({ ...f, receiptNote: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)}>Cancel</Button>
            <Button
              disabled={!expenseForm.amount || !expenseForm.description || (isAdmin && !expenseForm.employeeId) || createExpMutation.isPending}
              onClick={() => {
                const selectedEmp = isAdmin ? allEmployees.find((e: any) => e.id === expenseForm.employeeId) : null;
                createExpMutation.mutate({
                  date: expenseForm.date,
                  category: expenseForm.category,
                  amount: expenseForm.amount,
                  description: expenseForm.description,
                  receiptNote: expenseForm.receiptNote || undefined,
                  ...(isAdmin && expenseForm.employeeId ? { employeeId: expenseForm.employeeId, companyId: selectedEmp?.companyId } : {}),
                });
              }}
            >
              {createExpMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Expense Reject Dialog ── */}
      <Dialog open={expRejectOpen} onOpenChange={setExpRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><XCircle className="h-5 w-5" />Reject Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {selectedExp && (
              <div className="rounded-lg bg-muted/50 border p-3 text-sm">
                <p><span className="text-muted-foreground">Description: </span><span className="font-medium">{selectedExp.description}</span></p>
                <p><span className="text-muted-foreground">Amount: </span><span className="font-medium">{fmt(Number(selectedExp.amount))}</span></p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Reason <span className="text-red-500">*</span></Label>
              <Textarea placeholder="Reason for rejection..." rows={3} value={expRejectReason} onChange={e => setExpRejectReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!expRejectReason.trim() || rejectExpMutation.isPending}
              onClick={() => selectedExp && rejectExpMutation.mutate({ id: selectedExp.id, reason: expRejectReason })}>
              {rejectExpMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Approve Dialog ── */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600" />Approve & Schedule Deductions</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg bg-muted/50 border p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Employee</span><span className="font-medium">{selected.employeeName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium capitalize">{selected.type}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Requested Amount</span><span className="font-bold text-primary">{fmt(selected.amount)}</span></div>
                {selected.purpose && <div className="flex justify-between"><span className="text-muted-foreground">Purpose</span><span className="font-medium max-w-[200px] text-right">{selected.purpose}</span></div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>No. of Installments <span className="text-red-500">*</span></Label>
                  <Select value={approveForm.totalInstallments} onValueChange={handleInstallmentChange}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <SelectItem key={n} value={String(n)}>{n} month{n > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Monthly Deduction (₹) <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="pl-8" type="number" min="1" value={approveForm.installmentAmount} onChange={e => setApproveForm(f => ({ ...f, installmentAmount: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Deduction Start Month <span className="text-red-500">*</span></Label>
                <Input type="month" value={approveForm.deductionStartMonth} onChange={e => setApproveForm(f => ({ ...f, deductionStartMonth: e.target.value }))} />
              </div>
              {approveForm.totalInstallments && approveForm.installmentAmount && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 space-y-0.5">
                  <p className="font-semibold">Deduction Summary</p>
                  <p>{approveForm.totalInstallments} × {fmt(Number(approveForm.installmentAmount))} = {fmt(Number(approveForm.totalInstallments) * Number(approveForm.installmentAmount))}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Internal Remarks (optional)</Label>
                <Textarea placeholder="Any remarks..." rows={2} value={approveForm.remarks} onChange={e => setApproveForm(f => ({ ...f, remarks: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700"
              disabled={!approveForm.totalInstallments || !approveForm.installmentAmount || !approveForm.deductionStartMonth || approveMutation.isPending}
              onClick={() => selected && approveMutation.mutate({ id: selected.id, data: { totalInstallments: Number(approveForm.totalInstallments), installmentAmount: Number(approveForm.installmentAmount), deductionStartMonth: approveForm.deductionStartMonth, remarks: approveForm.remarks || undefined } })}>
              {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Approve & Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Dialog ── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-red-500" />Reject Application</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {selected && (
              <div className="rounded-lg bg-muted/50 border p-3 text-sm">
                <p><span className="text-muted-foreground">Employee: </span><span className="font-medium">{selected.employeeName}</span></p>
                <p><span className="text-muted-foreground">Amount: </span><span className="font-medium">{fmt(selected.amount)}</span></p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Reason <span className="text-red-500">*</span></Label>
              <Textarea placeholder="Reason for rejecting..." rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => selected && rejectMutation.mutate({ id: selected.id, reason: rejectReason })}>
              {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Schedule Dialog ── */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-indigo-600" />Change Deduction Schedule</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg bg-muted/50 border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Employee</span><span className="font-medium">{selected.employeeName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Remaining Balance</span><span className="font-bold text-indigo-700">{fmt(selected.remainingBalance ?? selected.amount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Current Schedule</span><span className="font-medium">{fmt(selected.installmentAmount)}/mo × {selected.totalInstallments} instl.</span></div>
              </div>
              <div className="space-y-1.5">
                <Label>New Installments <span className="text-red-500">*</span></Label>
                <Input type="number" min="1" max="60" value={scheduleForm.totalInstallments} onChange={e => handleScheduleInstallmentChange(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Monthly Amount (₹) <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" type="number" min="1" value={scheduleForm.installmentAmount} onChange={e => setScheduleForm(f => ({ ...f, installmentAmount: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>New Start Month <span className="text-red-500">*</span></Label>
                <Input type="month" value={scheduleForm.deductionStartMonth} onChange={e => setScheduleForm(f => ({ ...f, deductionStartMonth: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Reason for Change</Label>
                <Textarea rows={2} value={scheduleForm.remarks} onChange={e => setScheduleForm(f => ({ ...f, remarks: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700"
              disabled={!scheduleForm.totalInstallments || !scheduleForm.installmentAmount || !scheduleForm.deductionStartMonth || rescheduleMutation.isPending}
              onClick={() => selected && rescheduleMutation.mutate({ id: selected.id, data: { totalInstallments: Number(scheduleForm.totalInstallments), installmentAmount: Number(scheduleForm.installmentAmount), deductionStartMonth: scheduleForm.deductionStartMonth, remarks: scheduleForm.remarks || undefined } })}>
              {rescheduleMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Update Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-blue-600" />Edit Application</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/50 border p-3 text-sm flex justify-between">
                <span className="text-muted-foreground">Employee</span>
                <span className="font-medium">{selected.employeeName}</span>
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={editForm.type} onValueChange={v => setEditForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advance">Salary Advance</SelectItem>
                    <SelectItem value="loan">Loan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount (₹) <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" type="number" min="1" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Purpose / Reason</Label>
                <Textarea rows={3} value={editForm.purpose} onChange={e => setEditForm(f => ({ ...f, purpose: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button disabled={!editForm.amount || editMutation.isPending}
              onClick={() => selected && editMutation.mutate({ id: selected.id, data: { type: editForm.type, amount: Number(editForm.amount), purpose: editForm.purpose } })}>
              {editMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="h-5 w-5" />Delete Application</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="py-2 space-y-3">
              <p className="text-sm text-muted-foreground">This will permanently delete the application. This cannot be undone.</p>
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Employee</span><span className="font-medium">{selected.employeeName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium capitalize">{selected.type}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold">{fmt(selected.amount)}</span></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => selected && deleteMutation.mutate(selected.id)}>
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Detail Dialog ── */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" />Application Details</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 py-1 text-sm">
              {[
                ["Employee",         selected.employeeName],
                ["Employee Code",    selected.employeeCode],
                ["Type",             selected.type === "loan" ? "Loan" : "Salary Advance"],
                ["Amount",           fmt(selected.amount)],
                ["Status",           selected.status],
                ["Request Date",     fmtDate(selected.requestDate)],
                ["Purpose",          selected.purpose || "—"],
                ...(selected.status === "active" ? [
                  ["Installment",    `${fmt(selected.installmentAmount)}/mo`],
                  ["Total Installments", String(selected.totalInstallments)],
                  ["Deduction From", selected.deductionStartMonth || "—"],
                  ["Remaining Balance", fmt(selected.remainingBalance)],
                ] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-muted last:border-0">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right max-w-[200px]">{value}</span>
                </div>
              ))}
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
