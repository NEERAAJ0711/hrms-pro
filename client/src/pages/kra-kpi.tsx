import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Target,
  Plus,
  Pencil,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Star,
  TrendingUp,
  Users,
  LayoutTemplate,
  ClipboardList,
  BarChart2,
  Award,
  TrendingDown,
  Building2,
  Bell,
  BellRing,
  CalendarClock,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  LineChart,
  Line,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────
interface KpiRow {
  id?: string;
  kpiName: string;
  description?: string;
  weightage: number;
  measurementUnit: string;
  targetValue: number;
  actualValue?: number | null;
  selfScore?: number | null;
  managerScore?: number | null;
  computedScore?: number | null;
  sortOrder?: number;
}

interface KraTemplate {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  department?: string;
  reviewPeriodType: string;
  status: string;
  kpis?: KpiRow[];
}

interface KraAssignment {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  title: string;
  reviewPeriod: string;
  periodYear: number;
  startDate: string;
  endDate: string;
  status: string;
  selfScore?: number | null;
  managerScore?: number | null;
  totalScore?: number | null;
  feedback?: string | null;
  kpis?: KpiRow[];
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  department?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntilDeadline(endDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function DeadlineBadge({ endDate, status }: { endDate: string; status: string }) {
  if (status === "completed") return null;
  const days = daysUntilDeadline(endDate);
  if (days > 3) return null;
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
        <CalendarClock className="h-3 w-3" /> Overdue
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 animate-pulse">
        <BellRing className="h-3 w-3" /> Due today
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 border ${days <= 1 ? "text-red-600 bg-red-50 border-red-200" : "text-yellow-700 bg-yellow-50 border-yellow-200"}`}>
      <Bell className="h-3 w-3" /> Due in {days}d
    </span>
  );
}

const statusColor: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
};

const statusLabel: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  under_review: "Under Review",
  completed: "Completed",
};

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={`bg-muted rounded-full overflow-hidden ${className || "h-1.5 w-full"}`}>
      <div
        className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ScoreGauge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-muted-foreground text-sm">—</span>;
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? "text-green-600" : pct >= 60 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <span className={`font-bold text-sm ${color}`}>{pct.toFixed(1)}%</span>
      <ProgressBar value={pct} className="h-1.5 w-full" />
    </div>
  );
}

const PERIOD_OPTIONS = ["Q1", "Q2", "Q3", "Q4", "H1", "H2", "Annual", "Custom"];
const UNIT_OPTIONS = ["number", "percentage", "currency", "boolean"];
const REVIEW_TYPE_OPTIONS = ["quarterly", "half_yearly", "annual", "custom"];

function emptyKpi(): KpiRow {
  return { kpiName: "", weightage: 0, measurementUnit: "number", targetValue: 100 };
}

// ─── Template Dialog ─────────────────────────────────────────────────────────
function TemplateDialog({
  open,
  onClose,
  template,
  companyId,
}: {
  open: boolean;
  onClose: () => void;
  template?: KraTemplate | null;
  companyId?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!template;

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [department, setDepartment] = useState(template?.department ?? "");
  const [reviewPeriodType, setReviewPeriodType] = useState(template?.reviewPeriodType ?? "annual");
  const [kpis, setKpis] = useState<KpiRow[]>(
    template?.kpis?.length ? template.kpis : [emptyKpi()]
  );

  const totalWeightage = kpis.reduce((s, k) => s + (Number(k.weightage) || 0), 0);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit
        ? apiRequest("PATCH", `/api/kra/templates/${template!.id}`, data)
        : apiRequest("POST", "/api/kra/templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kra/templates"] });
      toast({ title: isEdit ? "Template updated" : "Template created" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function save() {
    if (!name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    if (Math.abs(totalWeightage - 100) > 0.1)
      return toast({ title: `Weightage must total 100% (currently ${totalWeightage}%)`, variant: "destructive" });
    mutation.mutate({ name, description, department, reviewPeriodType, companyId, kpis });
  }

  function addKpi() {
    setKpis([...kpis, emptyKpi()]);
  }

  function removeKpi(i: number) {
    setKpis(kpis.filter((_, idx) => idx !== i));
  }

  function updateKpi(i: number, field: keyof KpiRow, value: any) {
    setKpis(kpis.map((k, idx) => (idx === i ? { ...k, [field]: value } : k)));
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit KRA Template" : "New KRA Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Template Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sales KRA 2026" />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Sales" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Review Period Type</Label>
              <Select value={reviewPeriodType} onValueChange={setReviewPeriodType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REVIEW_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>{o.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-base font-semibold">KPI Metrics</Label>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${Math.abs(totalWeightage - 100) < 0.1 ? "text-green-600" : "text-red-500"}`}>
                  Total: {totalWeightage}%
                </span>
                <Button size="sm" variant="outline" onClick={addKpi} data-testid="button-add-kpi">
                  <Plus className="h-4 w-4 mr-1" /> Add KPI
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {kpis.map((kpi, i) => (
                <div key={i} className="border rounded-lg p-3 bg-muted/30">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <Label className="text-xs">KPI Name *</Label>
                      <Input
                        value={kpi.kpiName}
                        onChange={e => updateKpi(i, "kpiName", e.target.value)}
                        placeholder="e.g. Revenue Target"
                        className="h-8 text-sm"
                        data-testid={`input-kpi-name-${i}`}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Weightage %</Label>
                      <Input
                        type="number"
                        value={kpi.weightage}
                        onChange={e => updateKpi(i, "weightage", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                        data-testid={`input-kpi-weightage-${i}`}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Target Value</Label>
                      <Input
                        type="number"
                        value={kpi.targetValue}
                        onChange={e => updateKpi(i, "targetValue", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Unit</Label>
                      <Select value={kpi.measurementUnit || "number"} onValueChange={v => updateKpi(i, "measurementUnit", v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button size="icon" variant="ghost" onClick={() => removeKpi(i)} className="h-8 w-8 text-destructive" data-testid={`button-remove-kpi-${i}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Input
                      value={kpi.description || ""}
                      onChange={e => updateKpi(i, "description", e.target.value)}
                      placeholder="Description (optional)"
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={mutation.isPending} data-testid="button-save-template">
            {mutation.isPending ? "Saving..." : isEdit ? "Update Template" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assign KRA Dialog ───────────────────────────────────────────────────────
function AssignDialog({
  open,
  onClose,
  templates,
  employees,
  companyId,
  assignment,
}: {
  open: boolean;
  onClose: () => void;
  templates: KraTemplate[];
  employees: Employee[];
  companyId?: string;
  assignment?: KraAssignment | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!assignment;

  const [employeeId, setEmployeeId] = useState(assignment?.employeeId ?? "");
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState(assignment?.title ?? "");
  const [reviewPeriod, setReviewPeriod] = useState(assignment?.reviewPeriod ?? "Annual");
  const [periodYear, setPeriodYear] = useState(String(assignment?.periodYear ?? new Date().getFullYear()));
  const [startDate, setStartDate] = useState(assignment?.startDate ?? "");
  const [endDate, setEndDate] = useState(assignment?.endDate ?? "");
  const [kpis, setKpis] = useState<KpiRow[]>([emptyKpi()]);

  const selectedTemplate = templates.find(t => t.id === templateId);

  function handleTemplateChange(tid: string) {
    setTemplateId(tid);
    const tpl = templates.find(t => t.id === tid);
    if (tpl) {
      setTitle(tpl.name);
      if (tpl.kpis?.length) setKpis(tpl.kpis.map(k => ({ ...k, id: undefined })));
    }
  }

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit
        ? apiRequest("PATCH", `/api/kra/assignments/${assignment!.id}`, data)
        : apiRequest("POST", "/api/kra/assignments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kra/assignments"] });
      toast({ title: isEdit ? "Assignment updated" : "KRA assigned successfully" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function save() {
    if (!employeeId) return toast({ title: "Select an employee", variant: "destructive" });
    if (!title.trim()) return toast({ title: "Title is required", variant: "destructive" });
    if (!startDate || !endDate) return toast({ title: "Dates are required", variant: "destructive" });
    mutation.mutate({
      employeeId,
      companyId,
      templateId: templateId || null,
      title,
      reviewPeriod,
      periodYear: parseInt(periodYear),
      startDate,
      endDate,
      status: "active",
      kpis: templateId ? [] : kpis,
    });
  }

  function addKpi() { setKpis([...kpis, emptyKpi()]); }
  function removeKpi(i: number) { setKpis(kpis.filter((_, idx) => idx !== i)); }
  function updateKpi(i: number, field: keyof KpiRow, value: any) {
    setKpis(kpis.map((k, idx) => (idx === i ? { ...k, [field]: value } : k)));
  }

  const totalWeightage = (templateId ? (selectedTemplate?.kpis || []) : kpis)
    .reduce((s, k) => s + (Number(k.weightage) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Assignment" : "Assign KRA to Employee"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Employee *</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger data-testid="select-employee"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName} ({e.employeeCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>KRA Template (optional)</Label>
              <Select value={templateId} onValueChange={handleTemplateChange}>
                <SelectTrigger><SelectValue placeholder="Choose template or define custom" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom_none">— Custom (no template) —</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Assignment Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Sales KRA Q1 2026" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Review Period</Label>
              <Select value={reviewPeriod} onValueChange={setReviewPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Input value={periodYear} onChange={e => setPeriodYear(e.target.value)} type="number" />
            </div>
            <div />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date *</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>End Date *</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {!templateId && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-semibold">KPI Metrics</Label>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${Math.abs(totalWeightage - 100) < 0.1 ? "text-green-600" : "text-red-500"}`}>
                    Total: {totalWeightage}%
                  </span>
                  <Button size="sm" variant="outline" onClick={addKpi}>
                    <Plus className="h-4 w-4 mr-1" /> Add KPI
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {kpis.map((kpi, i) => (
                  <div key={i} className="border rounded-lg p-3 bg-muted/30">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <Label className="text-xs">KPI Name *</Label>
                        <Input value={kpi.kpiName} onChange={e => updateKpi(i, "kpiName", e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Weight %</Label>
                        <Input type="number" value={kpi.weightage} onChange={e => updateKpi(i, "weightage", parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Target</Label>
                        <Input type="number" value={kpi.targetValue} onChange={e => updateKpi(i, "targetValue", parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-xs">Unit</Label>
                        <Select value={kpi.measurementUnit || "number"} onValueChange={v => updateKpi(i, "measurementUnit", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button size="icon" variant="ghost" onClick={() => removeKpi(i)} className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {templateId && selectedTemplate?.kpis && (
            <div>
              <Label className="text-base font-semibold">KPIs from Template</Label>
              <div className="mt-2 border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>KPI Name</TableHead>
                      <TableHead>Weight</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedTemplate.kpis.map((k, i) => (
                      <TableRow key={i}>
                        <TableCell>{k.kpiName}</TableCell>
                        <TableCell>{k.weightage}%</TableCell>
                        <TableCell>{k.targetValue}</TableCell>
                        <TableCell>{k.measurementUnit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={mutation.isPending} data-testid="button-save-assignment">
            {mutation.isPending ? "Saving..." : isEdit ? "Update Assignment" : "Assign KRA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Score / Review Dialog ────────────────────────────────────────────────────
function ScoreDialog({
  open,
  onClose,
  assignment,
  isEmployee,
}: {
  open: boolean;
  onClose: () => void;
  assignment: KraAssignment;
  isEmployee: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [kpis, setKpis] = useState<KpiRow[]>(assignment.kpis || []);
  const [feedback, setFeedback] = useState(assignment.feedback || "");
  const [markComplete, setMarkComplete] = useState(false);

  function updateKpi(i: number, field: string, value: any) {
    setKpis(kpis.map((k, idx) => (idx === i ? { ...k, [field]: value } : k)));
  }

  // Live auto-score preview
  function autoScore(kpi: KpiRow): number | null {
    if (!isEmployee && kpi.managerScore != null) return kpi.managerScore;
    if (kpi.actualValue != null && kpi.targetValue && kpi.targetValue > 0) {
      return Math.min(100, Math.round((kpi.actualValue / kpi.targetValue) * 1000) / 10);
    }
    if (isEmployee && kpi.selfScore != null) return kpi.selfScore;
    return null;
  }

  function weightedTotal(): number | null {
    const totalW = kpis.reduce((s, k) => s + (k.weightage || 0), 0);
    if (totalW === 0) return null;
    const scored = kpis.filter(k => autoScore(k) != null);
    if (scored.length === 0) return null;
    const ws = scored.reduce((s, k) => s + (autoScore(k)! * (k.weightage || 0)) / 100, 0);
    return Math.round((ws / totalW) * 100 * 10) / 10;
  }

  const mutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", `/api/kra/assignments/${assignment.id}/score`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kra/assignments"] });
      toast({ title: "Scores saved" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function save() {
    mutation.mutate({
      kpis: kpis.map(k => ({
        id: k.id,
        actualValue: k.actualValue,
        selfScore: k.selfScore,
        managerScore: k.managerScore,
      })),
      reviewType: isEmployee ? "self" : "manager",
      feedback,
      complete: markComplete,
    });
  }

  const total = weightedTotal();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEmployee ? "Self Review" : "Manager Review"} — {assignment.title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {assignment.employeeName} · {assignment.reviewPeriod} {assignment.periodYear}
          </p>
        </DialogHeader>

        <div className="space-y-1 mb-4">
          {total != null && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-medium">Projected Score:</span>
              <span className={`font-bold text-lg ${total >= 80 ? "text-green-600" : total >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                {total}%
              </span>
              <ProgressBar value={total} className="h-2 flex-1" />
            </div>
          )}
        </div>

        <div className="space-y-3">
          {kpis.map((kpi, i) => {
            const auto = autoScore(kpi);
            return (
              <div key={i} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{kpi.kpiName}</p>
                    {kpi.description && <p className="text-xs text-muted-foreground">{kpi.description}</p>}
                    <span className="text-xs text-muted-foreground">Weight: {kpi.weightage}% · Target: {kpi.targetValue} {kpi.measurementUnit}</span>
                  </div>
                  <div className="text-right">
                    {auto != null ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className={`font-bold ${auto >= 80 ? "text-green-600" : auto >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                          {auto.toFixed(1)}%
                        </span>
                        <ProgressBar value={auto} className="w-24 h-1.5" />
                      </div>
                    ) : <span className="text-xs text-muted-foreground">Not scored</span>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Actual Value</Label>
                    <Input
                      type="number"
                      value={kpi.actualValue ?? ""}
                      onChange={e => updateKpi(i, "actualValue", e.target.value ? parseFloat(e.target.value) : null)}
                      className="h-8 text-sm"
                      placeholder={`Target: ${kpi.targetValue}`}
                      data-testid={`input-actual-${i}`}
                    />
                  </div>
                  {isEmployee ? (
                    <div>
                      <Label className="text-xs">Self Score (0–100)</Label>
                      <Input
                        type="number"
                        min={0} max={100}
                        value={kpi.selfScore ?? ""}
                        onChange={e => updateKpi(i, "selfScore", e.target.value ? parseFloat(e.target.value) : null)}
                        className="h-8 text-sm"
                        placeholder="Optional"
                        data-testid={`input-self-score-${i}`}
                      />
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs">Manager Score (0–100)</Label>
                      <Input
                        type="number"
                        min={0} max={100}
                        value={kpi.managerScore ?? ""}
                        onChange={e => updateKpi(i, "managerScore", e.target.value ? parseFloat(e.target.value) : null)}
                        className="h-8 text-sm"
                        placeholder="Override score"
                        data-testid={`input-manager-score-${i}`}
                      />
                    </div>
                  )}
                  <div className="flex items-end">
                    <div className="text-xs text-muted-foreground">
                      Auto score uses Actual ÷ Target × 100
                      {!isEmployee && <><br />Manager score overrides auto</>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!isEmployee && (
          <div className="space-y-2 mt-4">
            <Label>Feedback / Comments</Label>
            <Textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Add review feedback for the employee..."
              rows={3}
            />
            <label className="flex items-center gap-2 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={markComplete}
                onChange={e => setMarkComplete(e.target.checked)}
                className="rounded"
                data-testid="checkbox-complete"
              />
              <span className="text-sm">Mark review as Completed</span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={mutation.isPending} data-testid="button-save-scores">
            {mutation.isPending ? "Saving..." : "Save Scores"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KraKpiPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEmployee = user?.role === "employee";
  const isAdmin = ["super_admin", "company_admin", "hr_admin"].includes(user?.role || "");
  const canManage = isAdmin || user?.role === "manager";

  // Dialogs
  const [templateDialog, setTemplateDialog] = useState<{ open: boolean; template?: KraTemplate | null }>({ open: false });
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; assignment?: KraAssignment | null }>({ open: false });
  const [scoreDialog, setScoreDialog] = useState<{ open: boolean; assignment?: KraAssignment }>({ open: false });
  const [viewAssignment, setViewAssignment] = useState<KraAssignment | null>(null);

  // Queries
  const { data: templates = [], isLoading: tplLoading } = useQuery<KraTemplate[]>({
    queryKey: ["/api/kra/templates"],
  });

  const { data: assignments = [], isLoading: asgLoading } = useQuery<KraAssignment[]>({
    queryKey: ["/api/kra/assignments"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: canManage,
  });

  // Load full assignment with KPIs when viewing
  const { data: fullAssignment } = useQuery<KraAssignment>({
    queryKey: ["/api/kra/assignments", viewAssignment?.id],
    queryFn: async () => {
      const res = await fetch(`/api/kra/assignments/${viewAssignment!.id}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!viewAssignment?.id,
  });

  // Load full assignment KPIs for score dialog
  const { data: fullScoreAssignment } = useQuery<KraAssignment>({
    queryKey: ["/api/kra/assignments", scoreDialog.assignment?.id, "score"],
    queryFn: async () => {
      const res = await fetch(`/api/kra/assignments/${scoreDialog.assignment!.id}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!scoreDialog.assignment?.id && scoreDialog.open,
  });

  // Analytics query
  const { data: analytics, isLoading: analyticsLoading } = useQuery<any>({
    queryKey: ["/api/kra/analytics"],
    enabled: canManage,
  });

  // Trends query
  const { data: trends, isLoading: trendsLoading } = useQuery<any>({
    queryKey: ["/api/kra/analytics/trends"],
    enabled: canManage,
  });

  // Trend view toggle state
  const [trendView, setTrendView] = useState<"dept" | "employee">("dept");

  // Colour palette for line chart lines
  const LINE_COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#ec4899","#8b5cf6","#14b8a6"];

  // Delete template
  const deleteTemplate = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/kra/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kra/templates"] });
      toast({ title: "Template deleted" });
    },
    onError: () => toast({ title: "Failed to delete template", variant: "destructive" }),
  });

  // Delete assignment
  const deleteAssignment = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/kra/assignments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kra/assignments"] });
      toast({ title: "Assignment deleted" });
    },
    onError: () => toast({ title: "Failed to delete assignment", variant: "destructive" }),
  });

  // Send deadline reminders
  const sendReminders = useMutation({
    mutationFn: (days: number) => apiRequest("POST", `/api/kra/send-reminders?days=${days}`),
    onSuccess: (data: any) => {
      toast({ title: "Reminders sent", description: data?.message || "Deadline reminders dispatched." });
    },
    onError: () => toast({ title: "Failed to send reminders", variant: "destructive" }),
  });

  // Count assignments with upcoming deadlines (≤3 days, not completed)
  const urgentCount = assignments.filter(a =>
    a.status !== "completed" && daysUntilDeadline(a.endDate) <= 3
  ).length;

  // Stats
  const totalAssignments = assignments.length;
  const completedCount = assignments.filter(a => a.status === "completed").length;
  const avgScore = assignments.filter(a => a.totalScore != null).reduce((s, a, _, arr) => s + (a.totalScore! / arr.length), 0);
  const activeCount = assignments.filter(a => a.status === "active").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">KRA & KPIs</h1>
            <p className="text-sm text-muted-foreground">Key Result Areas & Performance Indicators</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => setTemplateDialog({ open: true, template: null })}
              data-testid="button-new-template"
            >
              <LayoutTemplate className="h-4 w-4 mr-2" /> New Template
            </Button>
          )}
          {canManage && (
            <Button
              onClick={() => setAssignDialog({ open: true, assignment: null })}
              data-testid="button-assign-kra"
            >
              <Plus className="h-4 w-4 mr-2" /> Assign KRA
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Assignments</p>
                <p className="text-2xl font-bold" data-testid="text-total-assignments">{totalAssignments}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-2xl font-bold" data-testid="text-active-assignments">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{completedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Star className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">Avg Score</p>
                <p className="text-2xl font-bold">{avgScore > 0 ? `${avgScore.toFixed(1)}%` : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={isEmployee ? "my-kra" : "assignments"}>
        <TabsList>
          {isEmployee && <TabsTrigger value="my-kra">My KRAs</TabsTrigger>}
          {canManage && <TabsTrigger value="assignments">All Assignments</TabsTrigger>}
          {isAdmin && <TabsTrigger value="templates">Templates</TabsTrigger>}
          {canManage && (
            <TabsTrigger value="analytics" data-testid="tab-analytics">
              <BarChart2 className="h-4 w-4 mr-1.5" />Analytics
            </TabsTrigger>
          )}
        </TabsList>

        {/* My KRA Tab (Employee) */}
        {isEmployee && (
          <TabsContent value="my-kra">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">My KRA Assignments</CardTitle>
              </CardHeader>
              <CardContent>
                {asgLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Loading...</div>
                ) : assignments.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No KRA assignments yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assignments.map(a => (
                      <div key={a.id} className="border rounded-lg p-4 flex items-center justify-between" data-testid={`card-assignment-${a.id}`}>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{a.title}</p>
                            <Badge className={statusColor[a.status] || ""}>{statusLabel[a.status] || a.status}</Badge>
                            <DeadlineBadge endDate={a.endDate} status={a.status} />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {a.reviewPeriod} {a.periodYear} · {a.startDate} to {a.endDate}
                          </p>
                          {a.selfScore != null && (
                            <p className="text-xs text-muted-foreground">Self Score: <strong>{a.selfScore.toFixed(1)}%</strong></p>
                          )}
                          {a.totalScore != null && (
                            <p className="text-xs text-green-600">Final Score: <strong>{a.totalScore.toFixed(1)}%</strong></p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <ScoreGauge score={a.totalScore ?? a.selfScore} />
                          {a.status !== "completed" && (
                            <Button
                              size="sm"
                              onClick={() => setScoreDialog({ open: true, assignment: a })}
                              data-testid={`button-self-review-${a.id}`}
                            >
                              Self Review
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setViewAssignment(a)}
                            data-testid={`button-view-${a.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* All Assignments Tab (Admin/Manager) */}
        {canManage && (
          <TabsContent value="assignments">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">KRA Assignments</CardTitle>
                    {urgentCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5" data-testid="badge-urgent-count">
                        <BellRing className="h-3 w-3" /> {urgentCount} urgent
                      </span>
                    )}
                  </div>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-yellow-700 border-yellow-300 hover:bg-yellow-50"
                      onClick={() => sendReminders.mutate(3)}
                      disabled={sendReminders.isPending}
                      data-testid="button-send-reminders"
                    >
                      <Bell className="h-4 w-4 mr-1.5" />
                      {sendReminders.isPending ? "Sending..." : "Send Deadline Reminders"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {asgLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Loading...</div>
                ) : assignments.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No KRA assignments yet. Assign a KRA to get started.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Period / Deadline</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Self Score</TableHead>
                          <TableHead>Final Score</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assignments.map(a => (
                          <TableRow key={a.id} data-testid={`row-assignment-${a.id}`}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{a.employeeName}</p>
                                <p className="text-xs text-muted-foreground">{a.employeeCode} · {a.department}</p>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium text-sm">{a.title}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="text-sm">{a.reviewPeriod} {a.periodYear}</p>
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-xs text-muted-foreground">Due {a.endDate}</span>
                                  <DeadlineBadge endDate={a.endDate} status={a.status} />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={statusColor[a.status] || ""}>{statusLabel[a.status] || a.status}</Badge>
                            </TableCell>
                            <TableCell><ScoreGauge score={a.selfScore} /></TableCell>
                            <TableCell><ScoreGauge score={a.totalScore} /></TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setScoreDialog({ open: true, assignment: a })}
                                  disabled={a.status === "completed"}
                                  data-testid={`button-review-${a.id}`}
                                >
                                  <Star className="h-3.5 w-3.5 mr-1" /> Review
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setViewAssignment(a)}
                                  data-testid={`button-view-assignment-${a.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => {
                                    if (confirm("Delete this assignment?")) deleteAssignment.mutate(a.id);
                                  }}
                                  data-testid={`button-delete-assignment-${a.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
        )}

        {/* Templates Tab (Admin) */}
        {isAdmin && (
          <TabsContent value="templates">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">KRA Templates</CardTitle>
              </CardHeader>
              <CardContent>
                {tplLoading ? (
                  <div className="py-8 text-center text-muted-foreground">Loading...</div>
                ) : templates.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <LayoutTemplate className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No templates yet. Create one to reuse across employees.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map(t => (
                      <Card key={t.id} className="border" data-testid={`card-template-${t.id}`}>
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-semibold">{t.name}</p>
                              {t.department && <p className="text-xs text-muted-foreground">{t.department}</p>}
                            </div>
                            <Badge variant="outline" className="text-xs capitalize">
                              {t.reviewPeriodType.replace("_", " ")}
                            </Badge>
                          </div>
                          {t.description && <p className="text-xs text-muted-foreground mb-3">{t.description}</p>}
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs text-muted-foreground">
                              {t.status === "active" ? (
                                <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Active</span>
                              ) : (
                                <span className="text-gray-400 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Inactive</span>
                              )}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setTemplateDialog({ open: true, template: t })}
                                data-testid={`button-edit-template-${t.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm("Delete this template?")) deleteTemplate.mutate(t.id);
                                }}
                                data-testid={`button-delete-template-${t.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Analytics Tab */}
        {canManage && (
          <TabsContent value="analytics">
            {analyticsLoading ? (
              <div className="py-16 text-center text-muted-foreground">Loading analytics...</div>
            ) : !analytics ? (
              <div className="py-16 text-center text-muted-foreground">No data available.</div>
            ) : (
              <div className="space-y-6">

                {/* Summary Row */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  {[
                    { label: "Total", value: analytics.summary.total, color: "text-blue-600", icon: <ClipboardList className="h-5 w-5 text-blue-500" /> },
                    { label: "Active", value: analytics.summary.active, color: "text-yellow-600", icon: <Clock className="h-5 w-5 text-yellow-500" /> },
                    { label: "Under Review", value: analytics.summary.underReview, color: "text-purple-600", icon: <Eye className="h-5 w-5 text-purple-500" /> },
                    { label: "Completed", value: analytics.summary.completed, color: "text-green-600", icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> },
                    { label: "Avg Score", value: analytics.summary.avgScore != null ? `${analytics.summary.avgScore}%` : "—", color: "text-orange-600", icon: <Star className="h-5 w-5 text-orange-500" /> },
                  ].map((s, i) => (
                    <Card key={i}>
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-center gap-2">
                          {s.icon}
                          <div>
                            <p className="text-xs text-muted-foreground">{s.label}</p>
                            <p className={`text-xl font-bold ${s.color}`} data-testid={`analytics-stat-${s.label.toLowerCase().replace(" ", "-")}`}>{s.value}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Charts Row: Score Distribution + Status Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* Score Distribution Bar Chart */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-primary" />
                        Score Distribution
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Number of assignments in each score band</p>
                    </CardHeader>
                    <CardContent>
                      {analytics.scoreDistribution?.every((b: any) => b.count === 0) ? (
                        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No scored assignments yet</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={analytics.scoreDistribution} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                              formatter={(v: any) => [`${v} assignment${v !== 1 ? "s" : ""}`, "Count"]}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                              {analytics.scoreDistribution.map((_: any, i: number) => {
                                const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e"];
                                return <Cell key={i} fill={colors[i % colors.length]} />;
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  {/* Status Breakdown Pie */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Assignment Status Breakdown
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Current state of all KRA assignments</p>
                    </CardHeader>
                    <CardContent>
                      {!analytics.statusBreakdown?.length ? (
                        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No assignments yet</div>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={analytics.statusBreakdown}
                              dataKey="count"
                              nameKey="status"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              innerRadius={45}
                              paddingAngle={3}
                              label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
                              labelLine={false}
                            >
                              {analytics.statusBreakdown.map((_: any, i: number) => {
                                const colors = ["#3b82f6", "#a855f7", "#22c55e", "#94a3b8"];
                                return <Cell key={i} fill={colors[i % colors.length]} />;
                              })}
                            </Pie>
                            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Department Performance */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      Department Performance
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">KRA completion and average scores by department</p>
                  </CardHeader>
                  <CardContent>
                    {!analytics.departmentStats?.length ? (
                      <div className="py-8 text-center text-muted-foreground text-sm">No department data available</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Department</TableHead>
                              <TableHead className="text-center">Total KRAs</TableHead>
                              <TableHead className="text-center">Completed</TableHead>
                              <TableHead>Completion Rate</TableHead>
                              <TableHead>KPI Fill Rate</TableHead>
                              <TableHead>Avg Score</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {analytics.departmentStats.map((d: any, i: number) => {
                              const kpiRow = analytics.deptKpiCompletion?.find((k: any) => k.department === d.department);
                              return (
                                <TableRow key={i} data-testid={`row-dept-${d.department}`}>
                                  <TableCell className="font-medium">{d.department}</TableCell>
                                  <TableCell className="text-center">{d.total}</TableCell>
                                  <TableCell className="text-center">{d.completed}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2 min-w-[120px]">
                                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${d.completionRate >= 80 ? "bg-green-500" : d.completionRate >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                                          style={{ width: `${d.completionRate}%` }}
                                        />
                                      </div>
                                      <span className="text-sm font-medium w-10 text-right">{d.completionRate}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {kpiRow ? (
                                      <div className="flex items-center gap-2 min-w-[120px]">
                                        <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                          <div
                                            className={`h-full rounded-full ${kpiRow.kpiCompletionRate >= 80 ? "bg-green-500" : kpiRow.kpiCompletionRate >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                                            style={{ width: `${kpiRow.kpiCompletionRate}%` }}
                                          />
                                        </div>
                                        <span className="text-sm font-medium w-10 text-right">{kpiRow.kpiCompletionRate}%</span>
                                      </div>
                                    ) : <span className="text-muted-foreground">—</span>}
                                  </TableCell>
                                  <TableCell>
                                    {d.avgScore != null ? (
                                      <span className={`font-semibold ${d.avgScore >= 80 ? "text-green-600" : d.avgScore >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                                        {d.avgScore}%
                                      </span>
                                    ) : <span className="text-muted-foreground">—</span>}
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

                {/* Top & Bottom Performers */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* Top Performers */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Award className="h-4 w-4 text-yellow-500" />
                        Top Performers
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Highest scoring completed KRAs</p>
                    </CardHeader>
                    <CardContent>
                      {!analytics.topPerformers?.length ? (
                        <div className="py-6 text-center text-muted-foreground text-sm">No scored assignments yet</div>
                      ) : (
                        <div className="space-y-3">
                          {analytics.topPerformers.map((p: any, i: number) => (
                            <div key={i} className="flex items-center gap-3" data-testid={`row-top-performer-${i}`}>
                              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${i === 0 ? "bg-yellow-400" : i === 1 ? "bg-gray-400" : i === 2 ? "bg-amber-600" : "bg-muted text-muted-foreground"}`}>
                                {i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{p.employeeName}</p>
                                <p className="text-xs text-muted-foreground truncate">{p.department} · {p.title}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-bold text-sm text-green-600">{p.totalScore?.toFixed(1)}%</p>
                                <div className="w-20 bg-muted rounded-full h-1.5 overflow-hidden mt-1">
                                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${p.totalScore}%` }} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Bottom Performers */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-red-500" />
                        Needs Improvement
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">Lowest scoring completed KRAs</p>
                    </CardHeader>
                    <CardContent>
                      {!analytics.bottomPerformers?.length ? (
                        <div className="py-6 text-center text-muted-foreground text-sm">No scored assignments yet</div>
                      ) : (
                        <div className="space-y-3">
                          {analytics.bottomPerformers.map((p: any, i: number) => (
                            <div key={i} className="flex items-center gap-3" data-testid={`row-bottom-performer-${i}`}>
                              <div className="h-7 w-7 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-600 flex-shrink-0">
                                {i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{p.employeeName}</p>
                                <p className="text-xs text-muted-foreground truncate">{p.department} · {p.title}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className={`font-bold text-sm ${(p.totalScore ?? 0) < 60 ? "text-red-600" : "text-yellow-600"}`}>
                                  {p.totalScore?.toFixed(1)}%
                                </p>
                                <div className="w-20 bg-muted rounded-full h-1.5 overflow-hidden mt-1">
                                  <div
                                    className={`h-full rounded-full ${(p.totalScore ?? 0) < 60 ? "bg-red-500" : "bg-yellow-500"}`}
                                    style={{ width: `${p.totalScore}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* ── Period-over-period Trends ──────────────────────────── */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-primary" />
                          Period-over-Period Trends
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          How scores have changed across review cycles
                        </p>
                      </div>
                      <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                        <button
                          onClick={() => setTrendView("dept")}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${trendView === "dept" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid="toggle-trend-dept"
                        >
                          By Department
                        </button>
                        <button
                          onClick={() => setTrendView("employee")}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${trendView === "employee" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          data-testid="toggle-trend-employee"
                        >
                          By Employee
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {trendsLoading ? (
                      <div className="py-10 text-center text-muted-foreground text-sm">Loading trends...</div>
                    ) : !trends?.periods?.length ? (
                      <div className="py-10 text-center text-muted-foreground text-sm">
                        <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-25" />
                        No scored assignments across multiple periods yet.
                        <br />Score KRAs in at least two different review periods to see trends.
                      </div>
                    ) : trendView === "dept" ? (
                      <div className="space-y-6">
                        {/* Line Chart */}
                        <ResponsiveContainer width="100%" height={280}>
                          <LineChart data={trends.deptChartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                            <Tooltip
                              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                              formatter={(v: any, name: string) => [`${v}%`, name]}
                            />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                            {(trends.deptNames as string[]).map((dept, i) => (
                              <Line
                                key={dept}
                                type="monotone"
                                dataKey={dept}
                                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                strokeWidth={2}
                                dot={{ r: 4 }}
                                activeDot={{ r: 6 }}
                                connectNulls
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>

                        {/* Department delta table */}
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Department</TableHead>
                                {(trends.periods as string[]).map((p: string) => (
                                  <TableHead key={p} className="text-center">{p}</TableHead>
                                ))}
                                <TableHead className="text-center">Change</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {trends.deptDeltaTable.map((row: any, i: number) => (
                                <TableRow key={i} data-testid={`row-trend-dept-${row.department}`}>
                                  <TableCell className="font-medium">{row.department}</TableCell>
                                  {row.periodScores.map((ps: any, j: number) => (
                                    <TableCell key={j} className="text-center">
                                      {ps.score != null ? (
                                        <span className={`font-medium text-sm ${ps.score >= 80 ? "text-green-600" : ps.score >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                                          {ps.score}%
                                        </span>
                                      ) : <span className="text-muted-foreground text-sm">—</span>}
                                    </TableCell>
                                  ))}
                                  <TableCell className="text-center">
                                    {row.delta != null ? (
                                      <span className={`inline-flex items-center gap-0.5 font-semibold text-sm ${row.delta > 0 ? "text-green-600" : row.delta < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                        {row.delta > 0 ? "▲" : row.delta < 0 ? "▼" : "●"}
                                        {Math.abs(row.delta)}%
                                      </span>
                                    ) : <span className="text-muted-foreground text-sm">—</span>}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      /* Employee trend table */
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead>Dept</TableHead>
                              {(trends.periods as string[]).map((p: string) => (
                                <TableHead key={p} className="text-center">{p}</TableHead>
                              ))}
                              <TableHead className="text-center">Change</TableHead>
                              <TableHead className="text-right">Latest</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(trends.employeeTrends as any[]).map((emp, i) => (
                              <TableRow key={i} data-testid={`row-trend-emp-${i}`}>
                                <TableCell>
                                  <p className="font-medium text-sm">{emp.employeeName}</p>
                                  <p className="text-xs text-muted-foreground">{emp.employeeCode}</p>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">{emp.department}</TableCell>
                                {emp.periodScores.map((ps: any, j: number) => (
                                  <TableCell key={j} className="text-center">
                                    {ps.score != null ? (
                                      <span className={`font-medium text-sm ${ps.score >= 80 ? "text-green-600" : ps.score >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                                        {ps.score}%
                                      </span>
                                    ) : <span className="text-muted-foreground text-sm">—</span>}
                                  </TableCell>
                                ))}
                                <TableCell className="text-center">
                                  {emp.delta != null ? (
                                    <span className={`inline-flex items-center gap-0.5 font-semibold text-sm ${emp.delta > 0 ? "text-green-600" : emp.delta < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                      {emp.delta > 0 ? "▲" : emp.delta < 0 ? "▼" : "●"}
                                      {Math.abs(emp.delta)}%
                                    </span>
                                  ) : <span className="text-muted-foreground text-sm">—</span>}
                                </TableCell>
                                <TableCell className="text-right">
                                  {emp.latestScore != null ? (
                                    <span className={`font-bold text-sm ${emp.latestScore >= 80 ? "text-green-600" : emp.latestScore >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                                      {emp.latestScore}%
                                    </span>
                                  ) : <span className="text-muted-foreground">—</span>}
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
            )}
          </TabsContent>
        )}

      </Tabs>

      {/* View Assignment Detail Dialog */}
      {viewAssignment && (
        <Dialog open={!!viewAssignment} onOpenChange={() => setViewAssignment(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{fullAssignment?.title || viewAssignment.title}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {fullAssignment?.employeeName || viewAssignment.employeeName} · {viewAssignment.reviewPeriod} {viewAssignment.periodYear}
              </p>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-muted/40 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Self Score</p>
                  <p className="text-xl font-bold">{fullAssignment?.selfScore != null ? `${fullAssignment.selfScore.toFixed(1)}%` : "—"}</p>
                </div>
                <div className="text-center p-3 bg-muted/40 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Manager Score</p>
                  <p className="text-xl font-bold">{fullAssignment?.managerScore != null ? `${fullAssignment.managerScore.toFixed(1)}%` : "—"}</p>
                </div>
                <div className="text-center p-3 bg-primary/10 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Final Score</p>
                  <p className={`text-xl font-bold ${(fullAssignment?.totalScore ?? 0) >= 80 ? "text-green-600" : (fullAssignment?.totalScore ?? 0) >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                    {fullAssignment?.totalScore != null ? `${fullAssignment.totalScore.toFixed(1)}%` : "—"}
                  </p>
                </div>
              </div>
              {fullAssignment?.feedback && (
                <div className="p-3 bg-muted/40 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Manager Feedback</p>
                  <p className="text-sm">{fullAssignment.feedback}</p>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>KPI</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(fullAssignment?.kpis || []).map((k, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <p className="font-medium text-sm">{k.kpiName}</p>
                        {k.description && <p className="text-xs text-muted-foreground">{k.description}</p>}
                      </TableCell>
                      <TableCell>{k.weightage}%</TableCell>
                      <TableCell>{k.targetValue} <span className="text-xs text-muted-foreground">{k.measurementUnit}</span></TableCell>
                      <TableCell>{k.actualValue ?? "—"}</TableCell>
                      <TableCell><ScoreGauge score={k.computedScore} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewAssignment(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Template Dialog */}
      {templateDialog.open && (
        <TemplateDialog
          open={templateDialog.open}
          onClose={() => setTemplateDialog({ open: false })}
          template={templateDialog.template}
          companyId={user?.companyId || undefined}
        />
      )}

      {/* Assign Dialog */}
      {assignDialog.open && (
        <AssignDialog
          open={assignDialog.open}
          onClose={() => setAssignDialog({ open: false })}
          templates={templates}
          employees={employees}
          companyId={user?.companyId || undefined}
          assignment={assignDialog.assignment}
        />
      )}

      {/* Score Dialog */}
      {scoreDialog.open && scoreDialog.assignment && fullScoreAssignment && (
        <ScoreDialog
          open={scoreDialog.open}
          onClose={() => setScoreDialog({ open: false })}
          assignment={fullScoreAssignment}
          isEmployee={isEmployee}
        />
      )}
    </div>
  );
}
