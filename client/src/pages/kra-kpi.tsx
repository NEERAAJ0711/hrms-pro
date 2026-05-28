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
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{a.title}</p>
                            <Badge className={statusColor[a.status] || ""}>{statusLabel[a.status] || a.status}</Badge>
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
                <CardTitle className="text-base">KRA Assignments</CardTitle>
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
                          <TableHead>Period</TableHead>
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
                            <TableCell className="text-sm">{a.reviewPeriod} {a.periodYear}</TableCell>
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
