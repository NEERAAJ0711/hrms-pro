import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bot,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Bell,
  TrendingUp,
  CircleDot,
  Loader2,
  X,
  Eye,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface DashboardStats {
  pendingKyc: number;
  partialKyc: number;
  completedKyc: number;
  activeTasks: number;
  escalatedTasks: number;
  activeConversations: number;
}

interface KycRecord {
  kycId: string;
  employeeId: string;
  overallStatus: string;
  aadhaarSubmitted: boolean;
  panSubmitted: boolean;
  bankDetailsSubmitted: boolean;
  cancelledChequeSubmitted: boolean;
  addressProofSubmitted: boolean;
  photographSubmitted: boolean;
  aadhaarVerified: boolean;
  panVerified: boolean;
  bankVerified: boolean;
  completedAt: string | null;
  updatedAt: string;
  employeeCode: string | null;
  firstName: string | null;
  lastName: string | null;
  department: string | null;
  designation: string | null;
}

interface FollowUpTask {
  task: {
    id: string;
    employeeId: string;
    taskType: string;
    status: string;
    dayNumber: number;
    remindersSent: number;
    nextReminderAt: string;
    escalatedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  firstName: string | null;
  lastName: string | null;
  employeeCode: string | null;
  department: string | null;
}

const TASK_LABELS: Record<string, string> = {
  kyc_pending: "KYC Submission",
  pf_kyc: "PF KYC Update",
  esic_pending: "ESIC Registration",
  bank_details: "Bank Details",
  onboarding: "Onboarding Tasks",
  exit: "Exit Formalities",
};

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  sub,
}: {
  title: string;
  value: number;
  icon: any;
  color: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", color)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DocStatus({ submitted, verified }: { submitted: boolean; verified?: boolean }) {
  if (!submitted) return <span className="text-muted-foreground/40 text-base">○</span>;
  if (verified) return <CheckCircle2 className="h-4 w-4 text-green-600 inline" />;
  return <CheckCircle2 className="h-4 w-4 text-yellow-500 inline" />;
}

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-red-100 text-red-700 border-red-200" },
    partial: { label: "Partial", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    complete: { label: "Complete", className: "bg-green-100 text-green-700 border-green-200" },
    escalated: { label: "Escalated", className: "bg-orange-100 text-orange-700 border-orange-200" },
    completed: { label: "Done", className: "bg-green-100 text-green-700 border-green-200" },
    dismissed: { label: "Dismissed", className: "bg-muted text-muted-foreground" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={cn("text-xs", s.className)}>
      {s.label}
    </Badge>
  );
}

function getDayBadge(day: number) {
  const map: Record<number, string> = {
    1: "bg-blue-100 text-blue-700",
    3: "bg-yellow-100 text-yellow-700",
    5: "bg-orange-100 text-orange-700",
    7: "bg-red-100 text-red-700",
    10: "bg-red-200 text-red-900",
  };
  return (
    <Badge variant="outline" className={cn("text-xs", map[day] ?? "bg-muted")}>
      Day {day}
    </Badge>
  );
}

export default function AiHrDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [searchKyc, setSearchKyc] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("pending");
  const [addTaskDialog, setAddTaskDialog] = useState(false);
  const [addTaskEmpId, setAddTaskEmpId] = useState("");
  const [addTaskType, setAddTaskType] = useState("kyc_pending");
  const [verifyDialog, setVerifyDialog] = useState<KycRecord | null>(null);
  const [kycVerifyUpdates, setKycVerifyUpdates] = useState<Record<string, boolean>>({});
  const [initConfirm, setInitConfirm] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/ai-hr/dashboard"],
  });

  const { data: pendingKyc = [], isLoading: kycLoading } = useQuery<KycRecord[]>({
    queryKey: ["/api/ai-hr/all-kyc"],
  });

  const { data: followUpTasks = [], isLoading: tasksLoading } = useQuery<FollowUpTask[]>({
    queryKey: ["/api/ai-hr/follow-up-tasks", taskStatusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/ai-hr/follow-up-tasks?status=${taskStatusFilter}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai-hr/follow-up-tasks", {
        employeeId: addTaskEmpId,
        taskType: addTaskType,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Follow-up task created" });
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/follow-up-tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/dashboard"] });
      setAddTaskDialog(false);
      setAddTaskEmpId("");
    },
    onError: () => toast({ title: "Failed to create task", variant: "destructive" }),
  });

  const dismissTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("PATCH", `/api/ai-hr/follow-up-tasks/${taskId}`, {
        status: "dismissed",
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/follow-up-tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/dashboard"] });
    },
  });

  const verifyKycMutation = useMutation({
    mutationFn: async ({ employeeId, updates }: { employeeId: string; updates: Record<string, boolean> }) => {
      const res = await apiRequest("PATCH", `/api/ai-hr/kyc-status/${employeeId}`, updates);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "KYC verification updated" });
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/all-kyc"] });
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/pending-kyc"] });
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/dashboard"] });
      setVerifyDialog(null);
      setKycVerifyUpdates({});
    },
    onError: () => toast({ title: "Verification update failed", variant: "destructive" }),
  });

  const initKycMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai-hr/initialize-kyc-for-all", {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `KYC initialized for ${data.initialized} employees` });
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/all-kyc"] });
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/dashboard"] });
      setInitConfirm(false);
    },
    onError: () => toast({ title: "Initialization failed", variant: "destructive" }),
  });

  const filteredKyc = pendingKyc.filter((r) => {
    if (!searchKyc) return true;
    const q = searchKyc.toLowerCase();
    return (
      `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
      (r.employeeCode ?? "").toLowerCase().includes(q) ||
      (r.department ?? "").toLowerCase().includes(q)
    );
  });

  const openVerifyDialog = (record: KycRecord) => {
    setVerifyDialog(record);
    setKycVerifyUpdates({
      aadhaarVerified: record.aadhaarVerified,
      panVerified: record.panVerified,
      bankVerified: record.bankVerified,
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            AI HR Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Monitor KYC collection, follow-ups, and AI assistant activity
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setInitConfirm(true)}
            data-testid="button-init-kyc"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Initialize KYC for All
          </Button>
          <Button
            size="sm"
            onClick={() => setAddTaskDialog(true)}
            data-testid="button-add-task"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Follow-up Task
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {statsLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            title="KYC Pending"
            value={stats?.pendingKyc ?? 0}
            icon={ShieldAlert}
            color="bg-red-100 text-red-600"
            sub="Not started"
          />
          <StatCard
            title="KYC Partial"
            value={stats?.partialKyc ?? 0}
            icon={CircleDot}
            color="bg-yellow-100 text-yellow-600"
            sub="In progress"
          />
          <StatCard
            title="KYC Complete"
            value={stats?.completedKyc ?? 0}
            icon={ShieldCheck}
            color="bg-green-100 text-green-600"
            sub="All submitted"
          />
          <StatCard
            title="Active Follow-ups"
            value={stats?.activeTasks ?? 0}
            icon={Bell}
            color="bg-blue-100 text-blue-600"
            sub="Pending tasks"
          />
          <StatCard
            title="Escalations"
            value={stats?.escalatedTasks ?? 0}
            icon={AlertTriangle}
            color="bg-orange-100 text-orange-600"
            sub="Need attention"
          />
          <StatCard
            title="AI Conversations"
            value={stats?.activeConversations ?? 0}
            icon={Bot}
            color="bg-purple-100 text-purple-600"
            sub="Active chats"
          />
        </div>
      )}

      {/* Main content tabs */}
      <Tabs defaultValue="kyc">
        <TabsList>
          <TabsTrigger value="kyc" data-testid="tab-kyc">
            KYC Status
          </TabsTrigger>
          <TabsTrigger value="followup" data-testid="tab-followup">
            Follow-up Tasks
          </TabsTrigger>
          <TabsTrigger value="escalations" data-testid="tab-escalations">
            Escalations
          </TabsTrigger>
        </TabsList>

        {/* KYC Tab */}
        <TabsContent value="kyc" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Employee KYC Status</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchKyc}
                    onChange={(e) => setSearchKyc(e.target.value)}
                    placeholder="Search employees..."
                    className="pl-8 h-8 text-sm"
                    data-testid="input-search-kyc"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {kycLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredKyc.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <UserCheck className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No KYC records found</p>
                  <p className="text-xs mt-1">Click "Initialize KYC for All" to create records for all active employees</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-center text-xs">Aadhaar</TableHead>
                        <TableHead className="text-center text-xs">PAN</TableHead>
                        <TableHead className="text-center text-xs">Bank</TableHead>
                        <TableHead className="text-center text-xs">Cheque</TableHead>
                        <TableHead className="text-center text-xs">Address</TableHead>
                        <TableHead className="text-center text-xs">Photo</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredKyc.map((rec) => (
                        <TableRow key={rec.kycId} data-testid={`row-kyc-${rec.employeeId}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">
                                {rec.firstName} {rec.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {rec.employeeCode} · {rec.department ?? "—"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(rec.overallStatus)}</TableCell>
                          <TableCell className="text-center">
                            <DocStatus submitted={rec.aadhaarSubmitted} verified={rec.aadhaarVerified} />
                          </TableCell>
                          <TableCell className="text-center">
                            <DocStatus submitted={rec.panSubmitted} verified={rec.panVerified} />
                          </TableCell>
                          <TableCell className="text-center">
                            <DocStatus submitted={rec.bankDetailsSubmitted} verified={rec.bankVerified} />
                          </TableCell>
                          <TableCell className="text-center">
                            <DocStatus submitted={rec.cancelledChequeSubmitted} />
                          </TableCell>
                          <TableCell className="text-center">
                            <DocStatus submitted={rec.addressProofSubmitted} />
                          </TableCell>
                          <TableCell className="text-center">
                            <DocStatus submitted={rec.photographSubmitted} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(rec.updatedAt).toLocaleDateString("en-IN")}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => openVerifyDialog(rec)}
                              data-testid={`button-verify-${rec.employeeId}`}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Verify
                            </Button>
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

        {/* Follow-up Tasks Tab */}
        <TabsContent value="followup" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Follow-up Tasks</CardTitle>
                <Select value={taskStatusFilter} onValueChange={setTaskStatusFilter}>
                  <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-task-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {tasksLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : followUpTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No follow-up tasks</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Day</TableHead>
                        <TableHead>Reminders Sent</TableHead>
                        <TableHead>Next Reminder</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {followUpTasks.map((ft) => (
                        <TableRow key={ft.task.id} data-testid={`row-task-${ft.task.id}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">
                                {ft.firstName} {ft.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {ft.employeeCode} · {ft.department ?? "—"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {TASK_LABELS[ft.task.taskType] ?? ft.task.taskType}
                          </TableCell>
                          <TableCell>{getStatusBadge(ft.task.status)}</TableCell>
                          <TableCell>{getDayBadge(ft.task.dayNumber)}</TableCell>
                          <TableCell className="text-center text-sm">{ft.task.remindersSent}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {ft.task.nextReminderAt
                              ? new Date(ft.task.nextReminderAt).toLocaleDateString("en-IN")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {ft.task.status === "pending" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground"
                                onClick={() => dismissTaskMutation.mutate(ft.task.id)}
                                data-testid={`button-dismiss-${ft.task.id}`}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Dismiss
                              </Button>
                            )}
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

        {/* Escalations Tab */}
        <TabsContent value="escalations" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Escalated Cases
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(() => {
                const escalated = followUpTasks.filter(
                  (ft) => ft.task.status === "escalated" || ft.task.dayNumber >= 7,
                );
                if (tasksLoading) {
                  return (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  );
                }
                if (escalated.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-40 text-green-500" />
                      <p className="text-sm">No escalations — great job!</p>
                    </div>
                  );
                }
                return (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Task</TableHead>
                          <TableHead>Day</TableHead>
                          <TableHead>Escalated On</TableHead>
                          <TableHead>Reminders</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {escalated.map((ft) => (
                          <TableRow key={ft.task.id} className="bg-orange-50/50 dark:bg-orange-950/20">
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">
                                  {ft.firstName} {ft.lastName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {ft.employeeCode} · {ft.department ?? "—"}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm font-medium text-orange-700 dark:text-orange-400">
                              {TASK_LABELS[ft.task.taskType] ?? ft.task.taskType}
                            </TableCell>
                            <TableCell>{getDayBadge(ft.task.dayNumber)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {ft.task.escalatedAt
                                ? new Date(ft.task.escalatedAt).toLocaleDateString("en-IN")
                                : "—"}
                            </TableCell>
                            <TableCell className="text-center text-sm font-medium text-orange-600">
                              {ft.task.remindersSent}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => dismissTaskMutation.mutate(ft.task.id)}
                              >
                                Resolve
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add Follow-up Task Dialog ── */}
      <Dialog open={addTaskDialog} onOpenChange={setAddTaskDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Follow-up Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Employee ID</label>
              <Input
                value={addTaskEmpId}
                onChange={(e) => setAddTaskEmpId(e.target.value)}
                placeholder="Enter employee ID"
                data-testid="input-task-employee-id"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Task Type</label>
              <Select value={addTaskType} onValueChange={setAddTaskType}>
                <SelectTrigger data-testid="select-task-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTaskDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addTaskMutation.mutate()}
              disabled={!addTaskEmpId.trim() || addTaskMutation.isPending}
              data-testid="button-confirm-add-task"
            >
              {addTaskMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── KYC Verify Dialog ── */}
      {verifyDialog && (
        <Dialog open={!!verifyDialog} onOpenChange={() => setVerifyDialog(null)}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>
                Verify KYC — {verifyDialog.firstName} {verifyDialog.lastName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                Mark documents as verified after reviewing the uploaded files.
                Green checkmarks (✅) = submitted by employee. Verification = HR review complete.
              </p>
              {[
                { key: "aadhaarVerified", label: "Aadhaar Verified", submitted: verifyDialog.aadhaarSubmitted },
                { key: "panVerified", label: "PAN Verified", submitted: verifyDialog.panSubmitted },
                { key: "bankVerified", label: "Bank Details Verified", submitted: verifyDialog.bankDetailsSubmitted },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2">
                    {item.submitted ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    <span className="text-sm">{item.label}</span>
                    {!item.submitted && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Not submitted
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant={kycVerifyUpdates[item.key] ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!item.submitted}
                    onClick={() =>
                      setKycVerifyUpdates((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                    }
                    data-testid={`button-toggle-${item.key}`}
                  >
                    {kycVerifyUpdates[item.key] ? "✓ Verified" : "Mark Verified"}
                  </Button>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVerifyDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  verifyKycMutation.mutate({
                    employeeId: verifyDialog.employeeId,
                    updates: kycVerifyUpdates,
                  })
                }
                disabled={verifyKycMutation.isPending}
                data-testid="button-save-verification"
              >
                {verifyKycMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Verification
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Initialize KYC Confirm ── */}
      <Dialog open={initConfirm} onOpenChange={setInitConfirm}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Initialize KYC Records</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will create KYC tracking records for all active employees who don't have one yet.
            Existing records will not be affected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInitConfirm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => initKycMutation.mutate()}
              disabled={initKycMutation.isPending}
              data-testid="button-confirm-init-kyc"
            >
              {initKycMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Initialize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
