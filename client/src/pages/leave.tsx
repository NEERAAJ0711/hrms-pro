import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { format, differenceInDays, parseISO, getYear } from "date-fns";
import {
  Calendar, Plus, Check, X, Clock, FileText, Pencil, Trash2,
  Umbrella, ChevronRight, TrendingUp, AlertCircle, CheckCircle2,
  XCircle, RotateCcw, Palmtree, Stethoscope, Baby, Briefcase,
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
  days: z.coerce.number().min(1, "Days must be at least 1"),
  reason: z.string().optional(),
  createdAt: z.string(),
});
type LeaveRequestFormValues = z.infer<typeof leaveRequestSchema>;

const leaveTypeSchema = z.object({
  companyId: z.string().optional().nullable(),
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  daysPerYear: z.coerce.number().min(0, "Must be 0 or more"),
  carryForward: z.boolean().default(false),
  maxCarryForward: z.coerce.number().min(0).default(0),
  description: z.string().optional().nullable(),
  status: z.string().default("active"),
});
type LeaveTypeFormValues = z.infer<typeof leaveTypeSchema>;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  pending:   { label: "Pending",   color: "text-amber-700 dark:text-amber-300",   bg: "bg-amber-50 dark:bg-amber-950/40",   border: "border-amber-200 dark:border-amber-800",   icon: <Clock className="h-3.5 w-3.5" /> },
  approved:  { label: "Approved",  color: "text-green-700 dark:text-green-300",   bg: "bg-green-50 dark:bg-green-950/40",   border: "border-green-200 dark:border-green-800",   icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  rejected:  { label: "Rejected",  color: "text-red-700 dark:text-red-300",       bg: "bg-red-50 dark:bg-red-950/40",       border: "border-red-200 dark:border-red-800",       icon: <XCircle className="h-3.5 w-3.5" /> },
  cancelled: { label: "Cancelled", color: "text-gray-600 dark:text-gray-400",     bg: "bg-gray-50 dark:bg-gray-900/40",     border: "border-gray-200 dark:border-gray-700",     icon: <RotateCcw className="h-3.5 w-3.5" /> },
};

// leave type colour palette (cycles)
const TYPE_PALETTES = [
  { bg: "bg-blue-100 dark:bg-blue-900/50",   text: "text-blue-700 dark:text-blue-300",   bar: "bg-blue-500",   ring: "ring-blue-200" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/50", text: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500", ring: "ring-emerald-200" },
  { bg: "bg-violet-100 dark:bg-violet-900/50", text: "text-violet-700 dark:text-violet-300", bar: "bg-violet-500", ring: "ring-violet-200" },
  { bg: "bg-amber-100 dark:bg-amber-900/50",  text: "text-amber-700 dark:text-amber-300",  bar: "bg-amber-500",  ring: "ring-amber-200" },
  { bg: "bg-rose-100 dark:bg-rose-900/50",    text: "text-rose-700 dark:text-rose-300",    bar: "bg-rose-500",   ring: "ring-rose-200" },
  { bg: "bg-sky-100 dark:bg-sky-900/50",      text: "text-sky-700 dark:text-sky-300",      bar: "bg-sky-500",    ring: "ring-sky-200" },
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
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function LeavePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = user?.role === "super_admin" || user?.role === "company_admin";
  const isEmployee = user?.role === "employee";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("__all__");
  const [isLeaveTypeOpen, setIsLeaveTypeOpen] = useState(false);
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null);

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
      form.reset({ employeeId: myEmployee?.id || "", companyId: user?.companyId || "", leaveTypeId: "", startDate: format(new Date(), "yyyy-MM-dd"), endDate: format(new Date(), "yyyy-MM-dd"), days: 1, reason: "", createdAt: new Date().toISOString() });
      toast({ title: "Leave Request Submitted", description: "Your request has been sent for approval." });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/leave-requests/${id}`, { status, approvedAt: new Date().toISOString() }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({ title: status === "approved" ? "Leave Approved" : "Leave Rejected", description: `The leave request has been ${status}.` });
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

  const getLeaveTypeName = (id: string) => leaveTypes.find(lt => lt.id === id)?.name || "Unknown";

  const pendingCount  = leaveRequests.filter(r => r.status === "pending").length;
  const approvedCount = leaveRequests.filter(r => r.status === "approved").length;
  const rejectedCount = leaveRequests.filter(r => r.status === "rejected").length;

  // ── Leave balance (for employee view) ──────────────────────────────────────
  const thisYear = getYear(new Date());
  const usedDays = (typeId: string) =>
    leaveRequests
      .filter(r => r.leaveTypeId === typeId && r.status === "approved" && getYear(parseISO(r.startDate)) === thisYear)
      .reduce((s, r) => s + (r.days || 0), 0);

  // ── Apply Leave Dialog (shared) ────────────────────────────────────────────
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
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Company: </span>
                <span className="font-medium">{companies.find(c => c.id === user?.companyId)?.companyName || "—"}</span>
              </div>
            )}
            {isEmployee ? (
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Employee: </span>
                <span className="font-medium">{myEmployee ? `[${myEmployee.employeeCode}] ${myEmployee.firstName} ${myEmployee.lastName}` : "Loading..."}</span>
              </div>
            ) : (
              <FormField control={form.control} name="employeeId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Employee</FormLabel>
                  <SearchableEmployeeSelect
                    employees={employees.filter(e => e.companyId === form.watch("companyId"))}
                    value={field.value} onValueChange={field.onChange}
                    placeholder="Search by name or ID..." data-testid="select-leave-employee"
                  />
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
                    {leaveTypes.map(lt => (
                      <SelectItem key={lt.id} value={lt.id}>
                        {lt.name} ({lt.code}) · {lt.daysPerYear} days/yr
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} onChange={e => { field.onChange(e); form.setValue("days", calculateDays(e.target.value, form.getValues("endDate"))); }} data-testid="input-leave-start" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="endDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>End Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} onChange={e => { field.onChange(e); form.setValue("days", calculateDays(form.getValues("startDate"), e.target.value)); }} data-testid="input-leave-end" />
                  </FormControl>
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
                    <span className="text-sm text-muted-foreground">working day{field.value !== 1 ? "s" : ""}</span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="reason" render={({ field }) => (
              <FormItem>
                <FormLabel>Reason <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl>
                  <Textarea placeholder="Briefly describe your reason for leave..." rows={3} {...field} data-testid="input-leave-reason" />
                </FormControl>
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

        {/* ── Hero Header ── */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-6 text-white shadow-lg">
          <div className="absolute inset-0 opacity-10" style={{backgroundImage:"radial-gradient(circle at 80% 20%, white 0%, transparent 60%)"}} />
          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-primary-foreground/70 text-sm font-medium">Leave Management</p>
              <h1 className="text-2xl font-bold mt-0.5">{employeeName}</h1>
              {myEmployee && (
                <p className="text-primary-foreground/80 text-sm mt-1">
                  {myEmployee.employeeCode && <span className="mr-2">{myEmployee.employeeCode}</span>}
                  {myEmployee.department && <span className="opacity-80">· {myEmployee.department}</span>}
                </p>
              )}
            </div>
            <Button
              size="lg"
              className="bg-white text-primary hover:bg-white/90 font-semibold shadow-md gap-2 shrink-0"
              onClick={() => setIsCreateOpen(true)}
              data-testid="button-create-leave"
            >
              <Plus className="h-4 w-4" />
              Apply for Leave
            </Button>
          </div>

          {/* Mini stats in header */}
          <div className="relative mt-5 grid grid-cols-3 gap-3">
            {[
              { label: "Pending",  value: pendingCount,  color: "bg-amber-400/20 text-amber-100" },
              { label: "Approved", value: approvedCount, color: "bg-green-400/20 text-green-100" },
              { label: "Rejected", value: rejectedCount, color: "bg-red-400/20 text-red-100" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl px-3 py-2 text-center ${s.color}`}>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs opacity-90">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Leave Balance Cards ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : activeLeaveTypes.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Leave Balance — {thisYear}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {activeLeaveTypes.map((lt, i) => {
                const palette = TYPE_PALETTES[i % TYPE_PALETTES.length];
                const used    = usedDays(lt.id);
                const total   = lt.daysPerYear;
                const remain  = Math.max(0, total - used);
                const pct     = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
                return (
                  <div
                    key={lt.id}
                    className={`rounded-xl border p-4 space-y-3 ${palette.bg} border-transparent ring-1 ${palette.ring}`}
                    data-testid={`card-balance-${lt.code}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className={`${palette.text}`}>{leaveTypeIcon(lt.name)}</div>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-bold ${palette.text} border-current`}>
                        {lt.code}
                      </Badge>
                    </div>
                    <div>
                      <p className={`text-xs font-medium truncate ${palette.text}`}>{lt.name}</p>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className={`text-2xl font-bold ${palette.text}`}>{remain}</span>
                        <span className={`text-xs opacity-70 ${palette.text}`}>/ {total} days left</span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 rounded-full bg-black/10">
                      <div
                        className={`h-full rounded-full ${palette.bar} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className={`text-[10px] ${palette.text} opacity-70`}>{used} used · {pct}% consumed</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Leave History ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">My Leave History</h2>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-filter-status">
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
            <div className="space-y-3">
              {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : displayRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="rounded-full bg-muted p-4">
                <Umbrella className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">No leave requests found</p>
                <p className="text-sm text-muted-foreground mt-1">Your submitted leave requests will appear here</p>
              </div>
              <Button size="sm" className="mt-2 gap-2" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />Apply for Leave
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {displayRequests.map(req => {
                const cfg = STATUS_CFG[req.status as keyof typeof STATUS_CFG] || STATUS_CFG.pending;
                const ltName = getLeaveTypeName(req.leaveTypeId);
                const ltIdx  = leaveTypes.findIndex(lt => lt.id === req.leaveTypeId);
                const palette = TYPE_PALETTES[ltIdx >= 0 ? ltIdx % TYPE_PALETTES.length : 0];
                const startFmt = format(parseISO(req.startDate), "d MMM yyyy");
                const endFmt   = format(parseISO(req.endDate),   "d MMM yyyy");
                const sameDay  = req.startDate === req.endDate;

                return (
                  <div
                    key={req.id}
                    className="rounded-xl border bg-card hover:shadow-sm transition-shadow p-4"
                    data-testid={`card-leave-${req.id}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Left: type badge */}
                      <div className={`rounded-lg p-2.5 shrink-0 ${palette.bg}`}>
                        <span className={palette.text}>{leaveTypeIcon(ltName)}</span>
                      </div>

                      {/* Middle: details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">{ltName}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {sameDay ? startFmt : `${startFmt} — ${endFmt}`}
                          <span className="ml-2 font-medium text-foreground">{req.days} day{req.days !== 1 ? "s" : ""}</span>
                        </p>
                        {req.reason && (
                          <p className="text-xs text-muted-foreground mt-1 truncate max-w-xs italic">"{req.reason}"</p>
                        )}
                      </div>

                      {/* Right: date applied */}
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground">Applied</p>
                        <p className="text-xs font-medium text-foreground">
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
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN / HR VIEW  (existing functional view, visually polished)
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Requests", value: leaveRequests.length, color: "text-foreground",            bg: "bg-muted/40",              icon: <FileText className="h-5 w-5 text-muted-foreground" /> },
          { label: "Pending",        value: pendingCount,          color: "text-amber-600 dark:text-amber-400",  bg: "bg-amber-50 dark:bg-amber-950/30",  icon: <Clock className="h-5 w-5 text-amber-500" /> },
          { label: "Approved",       value: approvedCount,         color: "text-green-600 dark:text-green-400",  bg: "bg-green-50 dark:bg-green-950/30",  icon: <Check className="h-5 w-5 text-green-500" /> },
          { label: "Rejected",       value: rejectedCount,         color: "text-red-600 dark:text-red-400",      bg: "bg-red-50 dark:bg-red-950/30",      icon: <X className="h-5 w-5 text-red-500" /> },
        ].map(c => (
          <Card key={c.label} className={`${c.bg} border-transparent`}>
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
                  <SelectTrigger className="w-40" data-testid="select-filter-status">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
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
                  <h3 className="text-lg font-medium mb-2">No leave requests</h3>
                  <p className="text-muted-foreground">No leave requests found for the selected filter</p>
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
                        <TableCell className="text-center text-muted-foreground font-medium text-sm">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{getEmployeeName(request.employeeId)}</TableCell>
                        <TableCell>{getLeaveTypeName(request.leaveTypeId)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(parseISO(request.startDate), "d MMM")} – {format(parseISO(request.endDate), "d MMM yyyy")}
                        </TableCell>
                        <TableCell>{request.days}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[request.status] || ""}>
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isAdmin && request.status === "pending" && (
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700"
                                onClick={() => approveMutation.mutate({ id: request.id, status: "approved" })}
                                disabled={approveMutation.isPending} data-testid={`button-approve-${request.id}`}>
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700"
                                onClick={() => approveMutation.mutate({ id: request.id, status: "rejected" })}
                                disabled={approveMutation.isPending} data-testid={`button-reject-${request.id}`}>
                                <X className="h-4 w-4" />
                              </Button>
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

        {isAdmin && (
          <TabsContent value="types">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Leave Types</CardTitle>
                    <CardDescription>Configure leave types and their policies</CardDescription>
                  </div>
                  <Button onClick={() => openLeaveTypeDialog()}>
                    <Plus className="h-4 w-4 mr-2" />Add Leave Type
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Days/Year</TableHead>
                      <TableHead>Carry Forward</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveTypes.map(lt => (
                      <TableRow key={lt.id} data-testid={`row-type-${lt.id}`}>
                        <TableCell className="font-medium">{lt.name}</TableCell>
                        <TableCell><Badge variant="outline">{lt.code}</Badge></TableCell>
                        <TableCell>{lt.daysPerYear}</TableCell>
                        <TableCell>
                          {lt.carryForward
                            ? <span className="text-green-600 text-sm">Yes (Max: {lt.maxCarryForward})</span>
                            : <span className="text-muted-foreground text-sm">No</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{lt.description || "—"}</TableCell>
                        <TableCell>
                          <Badge className={lt.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>{lt.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => openLeaveTypeDialog(lt)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700"
                              onClick={() => { if (confirm("Delete this leave type?")) deleteLeaveTypeMutation.mutate(lt.id); }}
                              disabled={deleteLeaveTypeMutation.isPending}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

      {/* Leave Type Dialog */}
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
                      <FormControl><SelectTrigger><SelectValue placeholder="Select company (optional for global)" /></SelectTrigger></FormControl>
                      <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={leaveTypeForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input placeholder="e.g. Casual Leave" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={leaveTypeForm.control} name="code" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl><Input placeholder="e.g. CL" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={leaveTypeForm.control} name="daysPerYear" render={({ field }) => (
                <FormItem>
                  <FormLabel>Days Per Year</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4 items-end">
                <FormField control={leaveTypeForm.control} name="carryForward" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Carry Forward</FormLabel>
                    <div className="flex items-center gap-3 pt-1">
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <span className="text-sm text-muted-foreground">{field.value ? "Enabled" : "Disabled"}</span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={leaveTypeForm.control} name="maxCarryForward" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Carry Forward</FormLabel>
                    <FormControl><Input type="number" {...field} disabled={!leaveTypeForm.watch("carryForward")} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={leaveTypeForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Textarea {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={leaveTypeForm.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
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
    </div>
  );
}
