import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { format, differenceInDays, parseISO, getYear } from "date-fns";
import {
  Calendar, Plus, Check, X, Clock, FileText, Pencil, Trash2,
  Umbrella, TrendingUp, CheckCircle2, XCircle, RotateCcw,
  Palmtree, Stethoscope, Baby, Briefcase, PlusCircle, Sliders, RefreshCw,
  History, ArrowUpCircle, ArrowDownCircle, Wallet,
} from "lucide-react";
import { SearchableEmployeeSelect } from "@/components/searchable-employee-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { LeaveRequest, LeaveType, Employee, Company } from "@shared/schema";

// ── Schemas ───────────────────────────────────────────────────────────────────
const leaveRequestSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  companyId: z.string().min(1, "Company is required"),
  leaveTypeId: z.string().min(1, "Leave type is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  days: z.coerce.number().min(0.5, "Days must be at least 0.5"),
  dayType: z.string().default("full_day"),
  reason: z.string().optional(),
  createdAt: z.string(),
});
type LeaveRequestFormValues = z.infer<typeof leaveRequestSchema>;

const leaveTypeSchema = z.object({
  companyId: z.string().optional().nullable(),
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  daysPerYear: z.coerce.number().min(0),
  carryForward: z.boolean().default(false),
  maxCarryForward: z.coerce.number().min(0).default(0),
  description: z.string().optional().nullable(),
  status: z.string().default("active"),
});
type LeaveTypeFormValues = z.infer<typeof leaveTypeSchema>;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  pending:   { label: "Pending",   color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200",  icon: <Clock className="h-3.5 w-3.5" /> },
  approved:  { label: "Approved",  color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200",  icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  rejected:  { label: "Rejected",  color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200",    icon: <XCircle className="h-3.5 w-3.5" /> },
  cancelled: { label: "Cancelled", color: "text-slate-500",  bg: "bg-slate-50",  border: "border-slate-200",  icon: <RotateCcw className="h-3.5 w-3.5" /> },
};

// Leave type card palettes — all light/pastel, no dark variants
const TYPE_PALETTES = [
  { bg: "bg-sky-50",     text: "text-sky-600",     bar: "bg-sky-400",     ring: "border-sky-200",    icon_bg: "bg-sky-100" },
  { bg: "bg-emerald-50", text: "text-emerald-600",  bar: "bg-emerald-400", ring: "border-emerald-200", icon_bg: "bg-emerald-100" },
  { bg: "bg-violet-50",  text: "text-violet-600",   bar: "bg-violet-400",  ring: "border-violet-200",  icon_bg: "bg-violet-100" },
  { bg: "bg-amber-50",   text: "text-amber-600",    bar: "bg-amber-400",   ring: "border-amber-200",   icon_bg: "bg-amber-100" },
  { bg: "bg-rose-50",    text: "text-rose-600",     bar: "bg-rose-400",    ring: "border-rose-200",    icon_bg: "bg-rose-100" },
  { bg: "bg-teal-50",    text: "text-teal-600",     bar: "bg-teal-400",    ring: "border-teal-200",    icon_bg: "bg-teal-100" },
];

const leaveTypeIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("sick") || n.includes("medical")) return <Stethoscope className="h-4 w-4" />;
  if (n.includes("casual")) return <Umbrella className="h-4 w-4" />;
  if (n.includes("earn") || n.includes("annual") || n.includes("privilege")) return <Palmtree className="h-4 w-4" />;
  if (n.includes("matern") || n.includes("patern") || n.includes("child")) return <Baby className="h-4 w-4" />;
  return <Briefcase className="h-4 w-4" />;
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-700",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function LeavePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = user?.role === "super_admin" || user?.role === "company_admin";
  const canApproveLeave = ["super_admin", "company_admin", "hr_admin", "manager"].includes(user?.role || "");
  const isEmployee = user?.role === "employee";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("__all__");
  const [isLeaveTypeOpen, setIsLeaveTypeOpen] = useState(false);
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null);
  // Comp-Off state
  const [compOffOpen, setCompOffOpen] = useState(false);
  const [compOffForm, setCompOffForm] = useState({ workedDate: format(new Date(), "yyyy-MM-dd"), workedType: "weekly_off", creditedDays: "1", purpose: "" });
  const [compOffRejectOpen, setCompOffRejectOpen] = useState(false);
  const [selectedCompOff, setSelectedCompOff] = useState<any>(null);
  const [compOffRejectReason, setCompOffRejectReason] = useState("");
  // Leave Adjustment state
  const [leaveAdjOpen, setLeaveAdjOpen] = useState(false);
  const [leaveAdjForm, setLeaveAdjForm] = useState({ employeeId: "", leaveTypeId: "", adjustmentType: "credit", days: "", reason: "" });
  // Leave Balance Card ledger state
  const [ledgerCard, setLedgerCard] = useState<{ id: string; name: string; code: string; total: number; isCompOff?: boolean } | null>(null);

  const { data: companies = [] } = useQuery<Company[]>({ queryKey: ["/api/companies"] });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"], enabled: !isEmployee });
  const { data: myEmployee } = useQuery<Employee>({
    queryKey: ["/api/my-employee"],
    enabled: isEmployee,
    queryFn: async () => {
      const res = await fetch("/api/my-employee", { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });
  const { data: leaveTypes = [] } = useQuery<LeaveType[]>({ queryKey: ["/api/leave-types"] });
  const { data: leaveRequests = [], isLoading } = useQuery<LeaveRequest[]>({ queryKey: ["/api/leave-requests"] });

  const filteredRequests = selectedStatus === "__all__"
    ? leaveRequests
    : leaveRequests.filter(r => r.status === selectedStatus);

  const form = useForm<LeaveRequestFormValues>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      employeeId: "",
      companyId: isSuperAdmin ? "" : (user?.companyId || ""),
      leaveTypeId: "",
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: format(new Date(), "yyyy-MM-dd"),
      days: 1,
      dayType: "full_day",
      reason: "",
      createdAt: new Date().toISOString(),
    },
  });

  useEffect(() => { if (!isSuperAdmin && user?.companyId) form.setValue("companyId", user.companyId); }, [isSuperAdmin, user?.companyId]);
  useEffect(() => {
    if (isEmployee && myEmployee) {
      form.setValue("employeeId", myEmployee.id);
      form.setValue("companyId", myEmployee.companyId);
    }
  }, [isEmployee, myEmployee]);

  const createMutation = useMutation({
    mutationFn: (data: LeaveRequestFormValues) => apiRequest("POST", "/api/leave-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      setIsCreateOpen(false);
      form.reset({ employeeId: myEmployee?.id || "", companyId: user?.companyId || "", leaveTypeId: "", startDate: format(new Date(), "yyyy-MM-dd"), endDate: format(new Date(), "yyyy-MM-dd"), days: 1, dayType: "full_day", reason: "", createdAt: new Date().toISOString() });
      toast({ title: "Leave Request Submitted", description: "Your request has been sent for approval." });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/leave-requests/${id}`, { status, approvedAt: new Date().toISOString() }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({ title: status === "approved" ? "Leave Approved" : "Leave Rejected" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const leaveTypeForm = useForm<LeaveTypeFormValues>({
    resolver: zodResolver(leaveTypeSchema),
    defaultValues: { companyId: isSuperAdmin ? "" : (user?.companyId || ""), name: "", code: "", daysPerYear: 12, carryForward: false, maxCarryForward: 0, description: "", status: "active" },
  });

  const openLeaveTypeDialog = (lt?: LeaveType) => {
    if (lt) {
      setEditingLeaveType(lt);
      leaveTypeForm.reset({ companyId: lt.companyId || "", name: lt.name, code: lt.code, daysPerYear: lt.daysPerYear, carryForward: lt.carryForward ?? false, maxCarryForward: lt.maxCarryForward ?? 0, description: lt.description || "", status: lt.status });
    } else {
      setEditingLeaveType(null);
      leaveTypeForm.reset({ companyId: isSuperAdmin ? "" : (user?.companyId || ""), name: "", code: "", daysPerYear: 12, carryForward: false, maxCarryForward: 0, description: "", status: "active" });
    }
    setIsLeaveTypeOpen(true);
  };

  const createLeaveTypeMutation = useMutation({
    mutationFn: (data: LeaveTypeFormValues) => apiRequest("POST", "/api/leave-types", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/leave-types"] }); setIsLeaveTypeOpen(false); toast({ title: "Leave Type Created" }); },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateLeaveTypeMutation = useMutation({
    mutationFn: (data: LeaveTypeFormValues & { id: string }) => { const { id, ...rest } = data; return apiRequest("PATCH", `/api/leave-types/${id}`, rest); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/leave-types"] }); setIsLeaveTypeOpen(false); setEditingLeaveType(null); toast({ title: "Leave Type Updated" }); },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  // ── Comp-Off queries & mutations ────────────────────────────────────────
  const { data: compOffRecords = [] } = useQuery<any[]>({ queryKey: ["/api/comp-off"], staleTime: 0 });
  const { data: qualifyingDates = [], isLoading: qualDatesLoading } = useQuery<any[]>({
    queryKey: ["/api/comp-off/qualifying-dates", compOffForm.workedType],
    enabled: compOffOpen,
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(`/api/comp-off/qualifying-dates?type=${compOffForm.workedType}`, { credentials: "include" });
      if (!res.ok) {
        console.error("[qualifying-dates] HTTP", res.status, await res.text().catch(() => ""));
        return [];
      }
      const data = await res.json();
      console.log("[qualifying-dates] returned", data.length, "dates for type", compOffForm.workedType);
      return data;
    },
  });
  const { data: leaveAdjRecords = [] } = useQuery<any[]>({ queryKey: ["/api/leave-adjustments"], staleTime: 0 });
  const invalidateCompOff = () => queryClient.invalidateQueries({ queryKey: ["/api/comp-off"] });
  const invalidateLeaveAdj = () => queryClient.invalidateQueries({ queryKey: ["/api/leave-adjustments"] });
  const createCompOffMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/comp-off", data),
    onSuccess: () => { invalidateCompOff(); setCompOffOpen(false); setCompOffForm({ workedDate: format(new Date(), "yyyy-MM-dd"), workedType: "weekly_off", creditedDays: "1", purpose: "" }); toast({ title: "Comp Off application submitted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const approveCompOffMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => apiRequest("PATCH", `/api/comp-off/${id}`, data),
    onSuccess: () => { invalidateCompOff(); setCompOffRejectOpen(false); setCompOffRejectReason(""); toast({ title: "Updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteCompOffMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/comp-off/${id}`),
    onSuccess: () => { invalidateCompOff(); toast({ title: "Deleted" }); },
  });
  const createLeaveAdjMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/leave-adjustments", data),
    onSuccess: () => { invalidateLeaveAdj(); setLeaveAdjOpen(false); setLeaveAdjForm({ employeeId: "", leaveTypeId: "", adjustmentType: "credit", days: "", reason: "" }); toast({ title: "Leave adjustment applied" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const deleteLeaveAdjMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/leave-adjustments/${id}`),
    onSuccess: () => { invalidateLeaveAdj(); toast({ title: "Deleted" }); },
  });

  const deleteLeaveTypeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/leave-types/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/leave-types"] }); toast({ title: "Leave Type Deleted" }); },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const onLeaveTypeSubmit = (data: LeaveTypeFormValues) => {
    editingLeaveType ? updateLeaveTypeMutation.mutate({ ...data, id: editingLeaveType.id }) : createLeaveTypeMutation.mutate(data);
  };

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 1;
    const diff = differenceInDays(parseISO(end), parseISO(start)) + 1;
    return diff > 0 ? diff : 1;
  };

  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId) || (myEmployee?.id === employeeId ? myEmployee : null);
    return employee ? `[${employee.employeeCode}] ${employee.firstName} ${employee.lastName}` : "Unknown";
  };

  const getLeaveTypeName = (id: string) => {
    if (id === "COMP_OFF") return "Comp Off";
    return leaveTypes.find(lt => lt.id === id)?.name || "Unknown";
  };

  const pendingCount  = leaveRequests.filter(r => r.status === "pending").length;
  const approvedCount = leaveRequests.filter(r => r.status === "approved").length;
  const rejectedCount = leaveRequests.filter(r => r.status === "rejected").length;

  const thisYear = getYear(new Date());
  const usedDays = (typeId: string) =>
    leaveRequests
      .filter(r => r.leaveTypeId === typeId && r.status === "approved" && getYear(parseISO(r.startDate)) === thisYear)
      .reduce((s, r) => s + Number(r.days || 0), 0);

  // ── Comp-off balance ─────────────────────────────────────────────────────
  const myCompOffCredited = (compOffRecords as any[])
    .filter((c: any) => c.employeeId === myEmployee?.id && c.status === "approved")
    .reduce((sum: number, c: any) => sum + Number(c.creditedDays || 1), 0);
  const myCompOffUsed = leaveRequests
    .filter(r => r.leaveTypeId === "COMP_OFF" && (r.status === "approved" || r.status === "pending"))
    .reduce((s, r) => s + Number(r.days || 0), 0);
  const availableCompOff = Math.max(0, myCompOffCredited - myCompOffUsed);

  // ── Apply Leave Dialog ─────────────────────────────────────────────────────
  const ApplyLeaveDialog = (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      {!isEmployee && (
        <DialogTrigger asChild>
          <Button data-testid="button-create-leave">
            <Plus className="h-4 w-4 mr-2" />Apply Leave
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Umbrella className="h-5 w-5 text-primary" />
            Apply for Leave
          </DialogTitle>
          <DialogDescription>Submit a new leave request for approval</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
            {isSuperAdmin ? (
              <FormField control={form.control} name="companyId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Company</FormLabel>
                  <Select value={field.value} onValueChange={(v) => { field.onChange(v); form.setValue("employeeId", ""); }}>
                    <FormControl><SelectTrigger data-testid="select-leave-company"><SelectValue placeholder="Select company" /></SelectTrigger></FormControl>
                    <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            ) : (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
                <span className="text-slate-500">Company: </span>
                <span className="font-medium text-slate-800">{companies.find(c => c.id === user?.companyId)?.companyName || "—"}</span>
              </div>
            )}
            {isEmployee ? (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
                <span className="text-slate-500">Employee: </span>
                <span className="font-medium text-slate-800">{myEmployee ? `[${myEmployee.employeeCode}] ${myEmployee.firstName} ${myEmployee.lastName}` : "Loading..."}</span>
              </div>
            ) : (
              <FormField control={form.control} name="employeeId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee</FormLabel>
                  <SearchableEmployeeSelect employees={employees.filter(e => e.companyId === form.watch("companyId"))} value={field.value} onValueChange={field.onChange} placeholder="Search by name or ID..." data-testid="select-leave-employee" />
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <FormField control={form.control} name="leaveTypeId" render={({ field }) => (
              <FormItem>
                <FormLabel>Leave Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger data-testid="select-leave-type"><SelectValue placeholder="Select leave type" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {leaveTypes.map(lt => <SelectItem key={lt.id} value={lt.id}>{lt.name} ({lt.code}) · {lt.daysPerYear} days/yr</SelectItem>)}
                    {myCompOffCredited > 0 && (
                      <SelectItem value="COMP_OFF">
                        <span className="flex items-center gap-2">
                          Comp Off · <span className="text-teal-600 font-semibold">{availableCompOff} day{availableCompOff !== 1 ? "s" : ""} available</span>
                        </span>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            {/* Day Type toggle */}
            <FormField control={form.control} name="dayType" render={({ field }) => (
              <FormItem>
                <FormLabel>Day Type</FormLabel>
                <FormControl>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    {[
                      { value: "full_day",     label: "Full Day" },
                      { value: "first_half",   label: "First Half" },
                      { value: "second_half",  label: "Second Half" },
                    ].map(opt => (
                      <button key={opt.value} type="button"
                        className={`flex-1 py-2 text-sm font-medium transition-colors ${field.value === opt.value ? "bg-primary text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                        onClick={() => {
                          field.onChange(opt.value);
                          if (opt.value !== "full_day") {
                            const sd = form.getValues("startDate");
                            form.setValue("endDate", sd);
                            form.setValue("days", 0.5);
                          } else {
                            const sd = form.getValues("startDate");
                            const ed = form.getValues("endDate");
                            form.setValue("days", calculateDays(sd, ed));
                          }
                        }}
                        data-testid={`btn-day-type-${opt.value}`}
                      >{opt.label}</button>
                    ))}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl><Input type="date" {...field} onChange={e => {
                    field.onChange(e);
                    const dt = form.getValues("dayType");
                    if (dt !== "full_day") { form.setValue("endDate", e.target.value); form.setValue("days", 0.5); }
                    else { form.setValue("days", calculateDays(e.target.value, form.getValues("endDate"))); }
                  }} data-testid="input-leave-start" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="endDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>End Date</FormLabel>
                  <FormControl><Input type="date" {...field}
                    disabled={form.watch("dayType") !== "full_day"}
                    onChange={e => { field.onChange(e); form.setValue("days", calculateDays(form.getValues("startDate"), e.target.value)); }}
                    data-testid="input-leave-end" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="days" render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Days</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-3">
                    <Input type="number" {...field} readOnly className="w-24" data-testid="input-leave-days" />
                    <span className="text-sm text-slate-500">working day{Number(field.value) !== 1 ? "s" : ""}</span>
                    {form.watch("dayType") !== "full_day" && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        {form.watch("dayType") === "first_half" ? "First Half" : "Second Half"}
                      </span>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="reason" render={({ field }) => (
              <FormItem>
                <FormLabel>Reason <span className="text-slate-400 font-normal">(optional)</span></FormLabel>
                <FormControl><Textarea placeholder="Briefly describe your reason for leave..." rows={3} {...field} data-testid="input-leave-reason" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-leave">
                {createMutation.isPending ? "Submitting…" : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // EMPLOYEE VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (isEmployee) {
    const employeeName = myEmployee ? `${myEmployee.firstName} ${myEmployee.lastName}` : user?.username || "Employee";
    const activeLeaveTypes = leaveTypes.filter(lt => lt.status === "active");
    const sortedRequests = [...leaveRequests].sort((a, b) =>
      new Date(b.createdAt || b.startDate).getTime() - new Date(a.createdAt || a.startDate).getTime()
    );
    const displayRequests = selectedStatus === "__all__" ? sortedRequests : sortedRequests.filter(r => r.status === selectedStatus);

    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6" data-testid="leave-page">
        {ApplyLeaveDialog}

        {/* ── Clean Light Header ── */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-primary via-primary/70 to-primary/30" />
          <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-primary/10 p-3">
                <Umbrella className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">My Leave</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {employeeName}
                  {myEmployee?.employeeCode && <span className="ml-1.5 text-slate-400">· {myEmployee.employeeCode}</span>}
                  {myEmployee?.department && <span className="ml-1.5 text-slate-400">· {myEmployee.department}</span>}
                </p>
              </div>
            </div>
            <Button className="gap-2 shrink-0" onClick={() => setIsCreateOpen(true)} data-testid="button-create-leave">
              <Plus className="h-4 w-4" />
              Apply for Leave
            </Button>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-3 divide-x border-t border-slate-100 bg-slate-50/60">
            {[
              { label: "Pending",  value: pendingCount,  color: "text-amber-600",  dot: "bg-amber-400" },
              { label: "Approved", value: approvedCount, color: "text-green-600",  dot: "bg-green-400" },
              { label: "Rejected", value: rejectedCount, color: "text-red-500",    dot: "bg-red-400" },
            ].map(s => (
              <div key={s.label} className="py-3 px-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-0.5">
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  <span className="text-xs text-slate-500 font-medium">{s.label}</span>
                </div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Leave Balance Cards ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        ) : activeLeaveTypes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Leave Balance — {thisYear}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {activeLeaveTypes.map((lt, i) => {
                const palette = TYPE_PALETTES[i % TYPE_PALETTES.length];
                const used   = usedDays(lt.id);
                const total  = lt.daysPerYear;
                const remain = Math.max(0, total - used);
                const pct    = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
                return (
                  <button
                    key={lt.id}
                    type="button"
                    onClick={() => setLedgerCard({ id: lt.id, name: lt.name, code: lt.code, total: lt.daysPerYear })}
                    className={`rounded-2xl border ${palette.ring} ${palette.bg} p-4 space-y-3 text-left w-full cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary`}
                    data-testid={`card-balance-${lt.code}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className={`rounded-lg p-2 ${palette.icon_bg}`}>
                        <span className={palette.text}>{leaveTypeIcon(lt.name)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <History className="h-3 w-3 text-slate-300" />
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${palette.bg} ${palette.text} border ${palette.ring}`}>{lt.code}</span>
                      </div>
                    </div>
                    <div>
                      <p className={`text-xs font-semibold truncate ${palette.text}`}>{lt.name}</p>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className={`text-2xl font-extrabold ${palette.text}`}>{remain}</span>
                        <span className="text-xs text-slate-400 font-medium">/ {total} days</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/70 border border-white">
                      <div className={`h-full rounded-full ${palette.bar} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400">{used} used · {pct}% consumed</p>
                  </button>
                );
              })}
              {/* Comp Off balance card — always shown for employees */}
              {(() => {
                const usedPct = myCompOffCredited > 0 ? Math.min(100, Math.round((myCompOffUsed / myCompOffCredited) * 100)) : 0;
                return (
                  <button
                    type="button"
                    onClick={() => setLedgerCard({ id: "COMP_OFF", name: "Comp Off", code: "CO", total: myCompOffCredited, isCompOff: true })}
                    className="rounded-2xl border border-teal-200 bg-teal-50 p-4 space-y-3 text-left w-full cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-400"
                    data-testid="card-balance-COMP_OFF"
                  >
                    <div className="flex items-start justify-between">
                      <div className="rounded-lg p-2 bg-teal-100">
                        <span className="text-teal-600"><RefreshCw className="h-4 w-4" /></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <History className="h-3 w-3 text-slate-300" />
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600 border border-teal-200">CO</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold truncate text-teal-600">Comp Off</p>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-2xl font-extrabold text-teal-600">{availableCompOff}</span>
                        <span className="text-xs text-slate-400 font-medium">/ {myCompOffCredited} days</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/70 border border-white">
                      <div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${usedPct}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-400">{myCompOffUsed} used · {usedPct}% consumed</p>
                  </button>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Leave History ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">My Leave History</p>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-36 h-8 text-xs border-slate-200" data-testid="select-filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
          ) : displayRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="rounded-full bg-white border border-slate-200 p-4 shadow-sm">
                <Umbrella className="h-8 w-8 text-slate-300" />
              </div>
              <div>
                <p className="font-semibold text-slate-600">No leave requests yet</p>
                <p className="text-sm text-slate-400 mt-1">Your submitted leave requests will appear here</p>
              </div>
              <Button size="sm" className="mt-1 gap-2" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />Apply for Leave
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayRequests.map(req => {
                const cfg   = STATUS_CFG[req.status as keyof typeof STATUS_CFG] || STATUS_CFG.pending;
                const ltName = getLeaveTypeName(req.leaveTypeId);
                const ltIdx  = leaveTypes.findIndex(lt => lt.id === req.leaveTypeId);
                const palette = TYPE_PALETTES[ltIdx >= 0 ? ltIdx % TYPE_PALETTES.length : 0];
                const startFmt = format(parseISO(req.startDate), "d MMM yyyy");
                const endFmt   = format(parseISO(req.endDate),   "d MMM yyyy");
                return (
                  <div key={req.id} className="rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow p-4" data-testid={`card-leave-${req.id}`}>
                    <div className="flex items-start gap-3">
                      <div className={`rounded-lg p-2.5 shrink-0 ${palette.icon_bg}`}>
                        <span className={palette.text}>{leaveTypeIcon(ltName)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-800">{ltName}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                            {cfg.icon}{cfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {req.startDate === req.endDate ? startFmt : `${startFmt} — ${endFmt}`}
                          <span className="ml-2 font-semibold text-slate-700">{req.days} day{Number(req.days) !== 1 ? "s" : ""}</span>
                          {(req as any).dayType && (req as any).dayType !== "full_day" && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                              {(req as any).dayType === "first_half" ? "First Half" : "Second Half"}
                            </span>
                          )}
                        </p>
                        {req.reason && <p className="text-xs text-slate-400 mt-1 truncate italic">"{req.reason}"</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-slate-400">Applied</p>
                        <p className="text-xs font-semibold text-slate-600">
                          {req.createdAt ? format(parseISO(req.createdAt), "d MMM") : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── My Comp Off Applications ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Comp Off Applications</p>
            <Button size="sm" variant="outline" className="gap-2 h-8 text-xs" onClick={() => setCompOffOpen(true)} data-testid="button-apply-compoff">
              <PlusCircle className="h-3.5 w-3.5" />Apply Comp Off
            </Button>
          </div>
          {compOffRecords.filter((c: any) => c.employeeId === myEmployee?.id).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center py-10 gap-2 text-center">
              <RefreshCw className="h-7 w-7 text-slate-300" />
              <p className="text-sm text-slate-500 font-medium">No comp-off applications yet</p>
              <p className="text-xs text-slate-400">Apply when you have worked on a holiday or weekend</p>
            </div>
          ) : (
            <div className="space-y-2">
              {compOffRecords.filter((c: any) => c.employeeId === myEmployee?.id).map((co: any) => {
                const scfg = co.status === "approved" ? { bg: "bg-green-100", text: "text-green-700", border: "border-green-200", label: "Approved" }
                  : co.status === "rejected" ? { bg: "bg-red-100", text: "text-red-700", border: "border-red-200", label: "Rejected" }
                  : { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200", label: "Pending" };
                return (
                  <div key={co.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex items-start gap-3" data-testid={`card-compoff-${co.id}`}>
                    <div className="rounded-lg bg-primary/10 p-2"><RefreshCw className="h-4 w-4 text-primary" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-800">{format(parseISO(co.workedDate), "d MMM yyyy")}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${scfg.bg} ${scfg.text} ${scfg.border}`}>{scfg.label}</span>
                        {co.workedType && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            {co.workedType === "weekly_off" ? "Weekly Off" : co.workedType === "holiday" ? "Holiday" : "Extra Shift"}
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                          {Number(co.creditedDays || 1) === 0.5 ? "½ Day" : "Full Day"} · {co.creditedDays || 1}
                        </span>
                      </div>
                      {co.purpose && <p className="text-xs text-slate-500 mt-1 truncate">{co.purpose}</p>}
                      {co.compensatoryDate && <p className="text-xs text-slate-400 mt-0.5">Comp day: {format(parseISO(co.compensatoryDate), "d MMM yyyy")}</p>}
                      {co.rejectionReason && <p className="text-xs text-red-400 mt-0.5">Reason: {co.rejectionReason}</p>}
                    </div>
                    {co.status === "pending" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:bg-red-50 shrink-0" onClick={() => deleteCompOffMutation.mutate(co.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Comp Off Apply Dialog */}
        <Dialog open={compOffOpen} onOpenChange={setCompOffOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-primary" />Apply for Comp Off</DialogTitle>
              <DialogDescription>Only valid for extra work on weekly off, holidays or beyond shift hours</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type of Extra Work <span className="text-red-500">*</span></label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  {[
                    { value: "weekly_off",  label: "Weekly Off" },
                    { value: "holiday",     label: "Holiday" },
                    { value: "extra_shift", label: "Extra Shift" },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${compOffForm.workedType === opt.value ? "bg-primary text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                      onClick={() => setCompOffForm(f => ({ ...f, workedType: opt.value, workedDate: "" }))}
                      data-testid={`btn-compoff-type-${opt.value}`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date Worked <span className="text-red-500">*</span></label>
                {qualDatesLoading ? (
                  <div className="h-10 rounded-md border border-slate-200 bg-slate-50 animate-pulse" />
                ) : qualifyingDates.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                    No qualifying dates found in the last 90 days for this type. Make sure attendance is marked for the day you worked.
                  </div>
                ) : (
                  <Select value={compOffForm.workedDate} onValueChange={v => setCompOffForm(f => ({ ...f, workedDate: v }))} data-testid="select-worked-date">
                    <SelectTrigger><SelectValue placeholder="Select date worked" /></SelectTrigger>
                    <SelectContent>
                      {qualifyingDates.map((rec: any) => (
                        <SelectItem key={rec.date} value={rec.date}>
                          {format(parseISO(rec.date), "EEE, d MMM yyyy")}
                          {rec.otHours && parseFloat(rec.otHours) > 0 && <span className="ml-2 text-teal-600 text-xs">+{rec.otHours}h OT</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Duration</label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  {[
                    { value: "1",   label: "Full Day (1)" },
                    { value: "0.5", label: "Half Day (0.5)" },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${compOffForm.creditedDays === opt.value ? "bg-primary text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                      onClick={() => setCompOffForm(f => ({ ...f, creditedDays: opt.value }))}
                      data-testid={`btn-compoff-duration-${opt.value}`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                <Textarea placeholder="e.g. Worked for year-end audit, client escalation…" value={compOffForm.purpose} onChange={e => setCompOffForm(f => ({ ...f, purpose: e.target.value }))} rows={2} data-testid="input-compoff-purpose" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCompOffOpen(false)}>Cancel</Button>
              <Button disabled={!compOffForm.workedDate || createCompOffMutation.isPending}
                onClick={() => createCompOffMutation.mutate({ workedDate: compOffForm.workedDate, workedType: compOffForm.workedType, creditedDays: compOffForm.creditedDays, purpose: compOffForm.purpose || `Worked on ${compOffForm.workedType === "weekly_off" ? "weekly off" : compOffForm.workedType === "holiday" ? "holiday" : "extra shift"}` })}
                data-testid="button-submit-compoff">
                {createCompOffMutation.isPending ? "Submitting…" : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Leave Ledger Dialog ── */}
        {ledgerCard && (() => {
          // Build ledger entries
          type LedgerEntry = { date: string; description: string; credit: number; debit: number; balance: number; };
          const entries: Omit<LedgerEntry, "balance">[] = [];

          if (ledgerCard.isCompOff) {
            // Credits: approved comp-off applications
            (compOffRecords as any[])
              .filter((c: any) => c.employeeId === myEmployee?.id && c.status === "approved")
              .forEach((c: any) => {
                entries.push({ date: c.workedDate, description: `Comp Off Earned (${c.workedType === "weekly_off" ? "Weekly Off" : c.workedType === "holiday" ? "Holiday" : "Extra Shift"})`, credit: Number(c.creditedDays || 1), debit: 0 });
              });
            // Debits: used comp-off leave requests
            leaveRequests
              .filter(r => r.leaveTypeId === "COMP_OFF" && (r.status === "approved" || r.status === "pending"))
              .forEach(r => {
                entries.push({ date: r.startDate, description: `Leave Used${r.reason ? ` — ${r.reason}` : ""}`, credit: 0, debit: Number(r.days || 0) });
              });
          } else {
            // Opening credit: annual allocation
            entries.push({ date: `${thisYear}-01-01`, description: `Annual Credit — ${thisYear}`, credit: ledgerCard.total, debit: 0 });
            // Manual adjustments
            (leaveAdjRecords as any[])
              .filter((a: any) => a.leaveTypeId === ledgerCard.id)
              .forEach((a: any) => {
                const d = Number(a.days || 0);
                entries.push({ date: a.createdAt ? a.createdAt.slice(0, 10) : `${thisYear}-01-01`, description: `Manual ${a.adjustmentType === "credit" ? "Credit" : "Debit"}${a.reason ? ` — ${a.reason}` : ""}`, credit: a.adjustmentType === "credit" ? d : 0, debit: a.adjustmentType === "debit" ? d : 0 });
              });
            // Leave requests as debits
            leaveRequests
              .filter(r => r.leaveTypeId === ledgerCard.id && r.status === "approved")
              .forEach(r => {
                entries.push({ date: r.startDate, description: `Leave Used${r.reason ? ` — ${r.reason}` : ""}`, credit: 0, debit: Number(r.days || 0) });
              });
          }

          // Sort by date ascending and compute running balance
          entries.sort((a, b) => a.date.localeCompare(b.date));
          let running = 0;
          const ledger: LedgerEntry[] = entries.map(e => {
            running += e.credit - e.debit;
            return { ...e, balance: running };
          });

          const totalCredit = ledger.reduce((s, e) => s + e.credit, 0);
          const totalDebit  = ledger.reduce((s, e) => s + e.debit, 0);
          const finalBal    = totalCredit - totalDebit;

          return (
            <Dialog open={!!ledgerCard} onOpenChange={open => { if (!open) setLedgerCard(null); }}>
              <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    {ledgerCard.name} — Leave Ledger
                  </DialogTitle>
                  <DialogDescription>Credits, debits and running balance for {ledgerCard.name} ({ledgerCard.code})</DialogDescription>
                </DialogHeader>

                {/* Summary pills */}
                <div className="grid grid-cols-3 gap-3 py-2">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <ArrowUpCircle className="h-4 w-4 text-green-600" />
                      <span className="text-xs font-semibold text-green-700">Total Credits</span>
                    </div>
                    <p className="text-2xl font-extrabold text-green-700">{totalCredit}</p>
                    <p className="text-[10px] text-green-500">days</p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <ArrowDownCircle className="h-4 w-4 text-red-500" />
                      <span className="text-xs font-semibold text-red-600">Total Debits</span>
                    </div>
                    <p className="text-2xl font-extrabold text-red-600">{totalDebit}</p>
                    <p className="text-[10px] text-red-400">days</p>
                  </div>
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Wallet className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-primary">Balance</span>
                    </div>
                    <p className="text-2xl font-extrabold text-primary">{finalBal}</p>
                    <p className="text-[10px] text-primary/60">days</p>
                  </div>
                </div>

                {/* Ledger table */}
                <div className="overflow-y-auto flex-1 rounded-xl border border-slate-200">
                  {ledger.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                      <History className="h-8 w-8 text-slate-300" />
                      <p className="font-semibold text-slate-500">No transactions yet</p>
                      <p className="text-xs text-slate-400">Leave activity will appear here once recorded</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Date</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Description</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-green-600">Credit</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-red-500">Debit</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-primary">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.map((entry, idx) => (
                          <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                              {format(parseISO(entry.date), "d MMM yyyy")}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700 max-w-[220px]">
                              <span className="truncate block">{entry.description}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {entry.credit > 0 ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-green-600">
                                  <ArrowUpCircle className="h-3.5 w-3.5" />{entry.credit}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {entry.debit > 0 ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-red-500">
                                  <ArrowDownCircle className="h-3.5 w-3.5" />{entry.debit}
                                </span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-bold text-sm ${entry.balance >= 0 ? "text-primary" : "text-red-600"}`}>
                                {entry.balance}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setLedgerCard(null)} data-testid="button-close-ledger">Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          );
        })()}

      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN / HR VIEW
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6" data-testid="leave-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Umbrella className="h-6 w-6 text-primary" />
            Leave Management
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage employee leave requests and approvals</p>
        </div>
        {ApplyLeaveDialog}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Requests", value: leaveRequests.length, color: "text-foreground", bg: "bg-slate-50 border-slate-200",  icon: <FileText className="h-5 w-5 text-slate-400" /> },
          { label: "Pending",        value: pendingCount,          color: "text-amber-600",  bg: "bg-amber-50 border-amber-200",  icon: <Clock className="h-5 w-5 text-amber-500" /> },
          { label: "Approved",       value: approvedCount,         color: "text-green-600",  bg: "bg-green-50 border-green-200",  icon: <Check className="h-5 w-5 text-green-500" /> },
          { label: "Rejected",       value: rejectedCount,         color: "text-red-600",    bg: "bg-red-50 border-red-200",      icon: <X className="h-5 w-5 text-red-500" /> },
        ].map(c => (
          <Card key={c.label} className={`border ${c.bg}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              {c.icon}
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="mb-4">
          <TabsTrigger value="requests" data-testid="tab-requests">Leave Requests</TabsTrigger>
          <TabsTrigger value="comp_off" data-testid="tab-comp-off">Comp Off</TabsTrigger>
          {isAdmin && <TabsTrigger value="leave_adjust" data-testid="tab-leave-adjust">Leave Adjust</TabsTrigger>}
          {isAdmin && <TabsTrigger value="types" data-testid="tab-types">Leave Types</TabsTrigger>}
        </TabsList>

        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Leave Requests</CardTitle>
                  <CardDescription>Review and manage leave applications</CardDescription>
                </div>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-40" data-testid="select-filter-status"><SelectValue placeholder="Filter by status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No leave requests found</h3>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">Sr.</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((request, idx) => (
                      <TableRow key={request.id} data-testid={`row-leave-${request.id}`}>
                        <TableCell className="text-center text-muted-foreground text-sm">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{getEmployeeName(request.employeeId)}</TableCell>
                        <TableCell>{getLeaveTypeName(request.leaveTypeId)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(parseISO(request.startDate), "d MMM")} – {format(parseISO(request.endDate), "d MMM yyyy")}
                        </TableCell>
                        <TableCell>{request.days}</TableCell>
                        <TableCell><Badge className={statusColors[request.status] || ""}>{request.status.charAt(0).toUpperCase() + request.status.slice(1)}</Badge></TableCell>
                        <TableCell>
                          {canApproveLeave && request.status === "pending" && (
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700" onClick={() => approveMutation.mutate({ id: request.id, status: "approved" })} disabled={approveMutation.isPending} data-testid={`button-approve-${request.id}`}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => approveMutation.mutate({ id: request.id, status: "rejected" })} disabled={approveMutation.isPending} data-testid={`button-reject-${request.id}`}><X className="h-4 w-4" /></Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ COMP OFF TAB ══════════════════════════════════════════════════ */}
        <TabsContent value="comp_off">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div><CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-primary" />Comp Off Applications</CardTitle>
                  <CardDescription>Manage compensatory off requests from employees</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {compOffRecords.length === 0 ? (
                <div className="text-center py-12">
                  <RefreshCw className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-30" />
                  <h3 className="text-lg font-medium mb-2">No comp-off applications</h3>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">Sr.</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Worked Date</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Comp Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compOffRecords.map((co: any, idx: number) => {
                      const emp = employees.find((e: any) => e.id === co.employeeId);
                      const empName = emp ? `${emp.firstName} ${emp.lastName}` : co.employeeId;
                      const scfg = co.status === "approved" ? "bg-green-100 text-green-700"
                        : co.status === "rejected" ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700";
                      return (
                        <TableRow key={co.id} data-testid={`row-compoff-${co.id}`}>
                          <TableCell className="text-center text-muted-foreground text-sm">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{empName}</TableCell>
                          <TableCell>{format(parseISO(co.workedDate), "d MMM yyyy")}</TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{co.purpose}</TableCell>
                          <TableCell>{co.compensatoryDate ? format(parseISO(co.compensatoryDate), "d MMM yyyy") : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell><Badge className={scfg}>{co.status.charAt(0).toUpperCase() + co.status.slice(1)}</Badge></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {co.status === "pending" && canApproveLeave && (
                                <>
                                  <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700 h-7 px-2" onClick={() => approveCompOffMutation.mutate({ id: co.id, data: { status: "approved", approvedAt: new Date().toISOString() } })} disabled={approveCompOffMutation.isPending} data-testid={`button-approve-co-${co.id}`}><Check className="h-3.5 w-3.5" /></Button>
                                  <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 h-7 px-2" onClick={() => { setSelectedCompOff(co); setCompOffRejectOpen(true); }} data-testid={`button-reject-co-${co.id}`}><X className="h-3.5 w-3.5" /></Button>
                                </>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => deleteCompOffMutation.mutate(co.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

        {/* ══ LEAVE ADJUSTMENT TAB ══════════════════════════════════════════ */}
        {isAdmin && (
          <TabsContent value="leave_adjust">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div><CardTitle className="flex items-center gap-2"><Sliders className="h-5 w-5 text-primary" />Leave Adjustments</CardTitle>
                    <CardDescription>Manually credit or debit employee leave balances</CardDescription>
                  </div>
                  <Button onClick={() => setLeaveAdjOpen(true)} className="gap-2" data-testid="button-add-leave-adj"><PlusCircle className="h-4 w-4" />Add Adjustment</Button>
                </div>
              </CardHeader>
              <CardContent>
                {leaveAdjRecords.length === 0 ? (
                  <div className="text-center py-12">
                    <Sliders className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-30" />
                    <h3 className="text-lg font-medium mb-2">No adjustments yet</h3>
                    <p className="text-muted-foreground text-sm">Use adjustments to credit or debit employee leave balances manually</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10 text-center">Sr.</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Leave Type</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaveAdjRecords.map((adj: any, idx: number) => {
                        const emp = employees.find((e: any) => e.id === adj.employeeId);
                        const empName = emp ? `${emp.firstName} ${emp.lastName}` : adj.employeeId;
                        const lt = leaveTypes.find(t => t.id === adj.leaveTypeId);
                        return (
                          <TableRow key={adj.id} data-testid={`row-adj-${adj.id}`}>
                            <TableCell className="text-center text-muted-foreground text-sm">{idx + 1}</TableCell>
                            <TableCell className="font-medium">{empName}</TableCell>
                            <TableCell>{lt?.name || adj.leaveTypeId}</TableCell>
                            <TableCell>
                              <Badge className={adj.adjustmentType === "credit" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                {adj.adjustmentType === "credit" ? "Credit" : "Debit"}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold">{adj.days} day{Number(adj.days) !== 1 ? "s" : ""}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{adj.reason}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{adj.createdAt ? format(parseISO(adj.createdAt), "d MMM yyyy") : "—"}</TableCell>
                            <TableCell>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => { if (confirm("Delete this adjustment?")) deleteLeaveAdjMutation.mutate(adj.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
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
        )}

        {isAdmin && (
          <TabsContent value="types">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div><CardTitle>Leave Types</CardTitle><CardDescription>Configure leave types and their policies</CardDescription></div>
                  <Button onClick={() => openLeaveTypeDialog()}><Plus className="h-4 w-4 mr-2" />Add Leave Type</Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Days/Year</TableHead>
                      <TableHead>Carry Forward</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveTypes.map(lt => (
                      <TableRow key={lt.id} data-testid={`row-type-${lt.id}`}>
                        <TableCell className="font-medium">{lt.name}</TableCell>
                        <TableCell><Badge variant="outline">{lt.code}</Badge></TableCell>
                        <TableCell>{lt.daysPerYear}</TableCell>
                        <TableCell>{lt.carryForward ? <span className="text-green-600 text-sm">Yes (Max: {lt.maxCarryForward})</span> : <span className="text-muted-foreground text-sm">No</span>}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{lt.description || "—"}</TableCell>
                        <TableCell><Badge className={lt.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>{lt.status}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => openLeaveTypeDialog(lt)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => { if (confirm("Delete this leave type?")) deleteLeaveTypeMutation.mutate(lt.id); }} disabled={deleteLeaveTypeMutation.isPending}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={isLeaveTypeOpen} onOpenChange={open => { setIsLeaveTypeOpen(open); if (!open) setEditingLeaveType(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLeaveType ? "Edit Leave Type" : "Add Leave Type"}</DialogTitle>
            <DialogDescription>{editingLeaveType ? "Update leave type policy" : "Create a new leave type and its policy"}</DialogDescription>
          </DialogHeader>
          <Form {...leaveTypeForm}>
            <form onSubmit={leaveTypeForm.handleSubmit(onLeaveTypeSubmit)} className="space-y-4">
              {isSuperAdmin && (
                <FormField control={leaveTypeForm.control} name="companyId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <Select value={field.value || ""} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger></FormControl>
                      <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={leaveTypeForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="e.g. Casual Leave" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={leaveTypeForm.control} name="code" render={({ field }) => (
                  <FormItem><FormLabel>Code</FormLabel><FormControl><Input placeholder="e.g. CL" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={leaveTypeForm.control} name="daysPerYear" render={({ field }) => (
                <FormItem><FormLabel>Days Per Year</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4 items-end">
                <FormField control={leaveTypeForm.control} name="carryForward" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Carry Forward</FormLabel>
                    <div className="flex items-center gap-3 pt-1">
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <span className="text-sm text-muted-foreground">{field.value ? "Enabled" : "Disabled"}</span>
                    </div>
                  </FormItem>
                )} />
                <FormField control={leaveTypeForm.control} name="maxCarryForward" render={({ field }) => (
                  <FormItem><FormLabel>Max Carry Forward</FormLabel><FormControl><Input type="number" {...field} disabled={!leaveTypeForm.watch("carryForward")} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={leaveTypeForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={leaveTypeForm.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsLeaveTypeOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createLeaveTypeMutation.isPending || updateLeaveTypeMutation.isPending}>
                  {editingLeaveType ? "Update" : "Create"} Leave Type
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Comp Off Reject Dialog */}
      <Dialog open={compOffRejectOpen} onOpenChange={open => { setCompOffRejectOpen(open); if (!open) setCompOffRejectReason(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Comp Off</DialogTitle>
            <DialogDescription>Provide a reason for rejection</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Reason for rejection" value={compOffRejectReason} onChange={e => setCompOffRejectReason(e.target.value)} rows={3} data-testid="input-compoff-reject-reason" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompOffRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!compOffRejectReason.trim() || approveCompOffMutation.isPending} onClick={() => { if (selectedCompOff) approveCompOffMutation.mutate({ id: selectedCompOff.id, data: { status: "rejected", rejectionReason: compOffRejectReason } }); }}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Adjustment Dialog */}
      <Dialog open={leaveAdjOpen} onOpenChange={setLeaveAdjOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sliders className="h-5 w-5 text-primary" />Leave Adjustment</DialogTitle>
            <DialogDescription>Manually credit or debit an employee's leave balance</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Employee <span className="text-red-500">*</span></label>
              <SearchableEmployeeSelect employees={employees as any[]} value={leaveAdjForm.employeeId} onValueChange={v => setLeaveAdjForm(f => ({ ...f, employeeId: v }))} placeholder="Select employee..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Leave Type <span className="text-red-500">*</span></label>
              <Select value={leaveAdjForm.leaveTypeId} onValueChange={v => setLeaveAdjForm(f => ({ ...f, leaveTypeId: v }))}>
                <SelectTrigger data-testid="select-leave-type-adj"><SelectValue placeholder="Select leave type" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.filter(lt => lt.status === "active").map(lt => (
                    <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Adjustment Type</label>
                <Select value={leaveAdjForm.adjustmentType} onValueChange={v => setLeaveAdjForm(f => ({ ...f, adjustmentType: v }))}>
                  <SelectTrigger data-testid="select-adj-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit (Add)</SelectItem>
                    <SelectItem value="debit">Debit (Deduct)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Days <span className="text-red-500">*</span></label>
                <Input type="number" min="0.5" step="0.5" placeholder="e.g. 1" value={leaveAdjForm.days} onChange={e => setLeaveAdjForm(f => ({ ...f, days: e.target.value }))} data-testid="input-adj-days" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason <span className="text-red-500">*</span></label>
              <Textarea placeholder="Reason for adjustment" value={leaveAdjForm.reason} onChange={e => setLeaveAdjForm(f => ({ ...f, reason: e.target.value }))} rows={2} data-testid="input-adj-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveAdjOpen(false)}>Cancel</Button>
            <Button disabled={!leaveAdjForm.employeeId || !leaveAdjForm.leaveTypeId || !leaveAdjForm.days || !leaveAdjForm.reason.trim() || createLeaveAdjMutation.isPending}
              onClick={() => createLeaveAdjMutation.mutate({ employeeId: leaveAdjForm.employeeId, leaveTypeId: leaveAdjForm.leaveTypeId, adjustmentType: leaveAdjForm.adjustmentType, days: leaveAdjForm.days, reason: leaveAdjForm.reason })} data-testid="button-submit-adj">
              {createLeaveAdjMutation.isPending ? "Applying…" : "Apply Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
