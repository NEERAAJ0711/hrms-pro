import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2,
  Clock, FileText, Loader2, RefreshCw,
} from "lucide-react";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface CalendarEvent {
  id: string;
  companyId: string;
  eventType: string;
  title: string;
  description?: string | null;
  dueDate: string;
  periodMonth?: string | null;
  periodYear?: number | null;
  status: string;
  createdAt: string;
}

interface HistoryRecord {
  period: string;
  month: string;
  year: number;
  status: string;
  type: string;
  filedAt?: string | null;
  dueDate: string;
  totalAmount?: number | null;
  challanNo?: string | null;
  errorMessage?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function urgencyClass(dueDate: string, status: string): string {
  if (status === "completed") return "bg-green-100 border-green-300 text-green-800";
  const due = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return "bg-red-100 border-red-300 text-red-800";
  if (diffDays <= 3) return "bg-orange-100 border-orange-300 text-orange-800";
  if (diffDays <= 7) return "bg-yellow-100 border-yellow-300 text-yellow-800";
  return "bg-blue-50 border-blue-200 text-blue-800";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    upcoming: "bg-blue-50 text-blue-700 border-blue-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    overdue: "bg-red-50 text-red-700 border-red-200",
    waived: "bg-gray-50 text-gray-600 border-gray-200",
  };
  return (
    <Badge variant="outline" className={`text-xs ${map[status] ?? "bg-gray-50 text-gray-600"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(n: number | null | undefined) {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────
function CalendarGrid({
  year, month, events, onTrigger,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
  onTrigger: (event: CalendarEvent) => void;
}) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().getDate();
  const todayMonth = new Date().getMonth();
  const todayYear = new Date().getFullYear();

  // Map dueDate day → events for this month
  const eventsByDay: Record<number, CalendarEvent[]> = {};
  for (const ev of events) {
    const evDate = new Date(ev.dueDate);
    if (evDate.getFullYear() === year && evDate.getMonth() === month) {
      const d = evDate.getDate();
      if (!eventsByDay[d]) eventsByDay[d] = [];
      eventsByDay[d].push(ev);
    }
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 bg-muted text-xs font-medium text-muted-foreground">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="py-2 text-center border-r last:border-r-0">{d}</div>
        ))}
      </div>
      {/* Calendar cells */}
      <div className="grid grid-cols-7 bg-background">
        {cells.map((day, i) => {
          const isToday = day !== null && day === today && month === todayMonth && year === todayYear;
          const evs = day ? (eventsByDay[day] ?? []) : [];
          return (
            <div
              key={i}
              className={`min-h-[80px] border-r border-b last-of-type:border-r-0 p-1.5 ${!day ? "bg-muted/30" : ""} ${isToday ? "ring-2 ring-inset ring-primary/40" : ""}`}
            >
              {day && (
                <>
                  <span className={`text-xs font-medium ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{day}</span>
                  <div className="mt-1 space-y-0.5">
                    {evs.map(ev => (
                      <button
                        key={ev.id}
                        onClick={() => ev.status !== "completed" && onTrigger(ev)}
                        className={`w-full text-left text-xs px-1.5 py-0.5 rounded border truncate leading-tight transition-opacity ${urgencyClass(ev.dueDate, ev.status)} ${ev.status !== "completed" ? "hover:opacity-80 cursor-pointer" : "cursor-default"}`}
                        data-testid={`calendar-event-${ev.id}`}
                        title={`${ev.title} — ${ev.status}`}
                      >
                        {ev.title.replace(/EPFO|ESIC/g, m => m).slice(0, 20)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── History Tab ─────────────────────────────────────────────────────────────
function HistoryTab({ companyId }: { companyId: string }) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ data: HistoryRecord[]; total: number; page: number }>({
    queryKey: ["/api/compliance-calendar/history", companyId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "30", companyId });
      const res = await fetch(`/api/compliance-calendar/history?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  const records = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Filed At</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Challan No</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : records.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No filing history yet</TableCell></TableRow>
            ) : records.map((r, i) => (
              <TableRow key={i} data-testid={`row-history-${i}`}>
                <TableCell className="font-medium text-sm">{r.period}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={r.type === "epfo_ecr" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}>
                    {r.type === "epfo_ecr" ? "EPFO ECR" : "ESIC Monthly"}
                  </Badge>
                </TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
                <TableCell className="text-sm">{formatDate(r.dueDate)}</TableCell>
                <TableCell className="text-sm">{formatDate(r.filedAt)}</TableCell>
                <TableCell className="text-sm">{fmtAmount(r.totalAmount)}</TableCell>
                <TableCell className="text-sm font-mono">{r.challanNo ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{data?.total ?? 0} total records</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={records.length < 30} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ComplianceCalendarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const companyId = user?.companyId ?? "";

  const { data: events = [], isLoading, refetch } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/compliance-calendar", companyId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (companyId) params.set("companyId", companyId);
      const res = await fetch(`/api/compliance-calendar?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch calendar");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const triggerMutation = useMutation({
    mutationFn: async (event: CalendarEvent) => {
      const isEpfo = event.eventType === "epfo_ecr_due";
      const endpoint = isEpfo ? "/api/epfo/file-ecr" : "/api/esic/file-monthly";
      const res = await apiRequest("POST", endpoint, {
        month: event.periodMonth,
        year: event.periodYear,
        companyId,
      });
      return res.json();
    },
    onSuccess: (data, event) => {
      toast({
        title: "Filing job queued",
        description: `Job #${data.jobId?.slice(0, 8)} queued for ${event.title}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/compliance-calendar"] });
    },
    onError: (err: any) => toast({ title: "Failed to trigger filing", description: err.message, variant: "destructive" }),
  });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // Summary counts
  const upcoming = events.filter(e => e.status === "upcoming").length;
  const overdue = events.filter(e => e.status === "overdue").length;
  const completed = events.filter(e => e.status === "completed").length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-teal-600 rounded-lg">
          <CalendarDays className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Compliance Calendar</h1>
          <p className="text-sm text-muted-foreground">ECR due 15th, ESIC due 21st of each month — click any event to trigger filing</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => refetch()} data-testid="button-refresh-calendar">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Summary pills */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: `${upcoming} Upcoming`, icon: Clock, className: "bg-blue-50 text-blue-700 border-blue-200" },
          { label: `${overdue} Overdue`, icon: AlertTriangle, className: "bg-red-50 text-red-700 border-red-200" },
          { label: `${completed} Completed`, icon: CheckCircle2, className: "bg-green-50 text-green-700 border-green-200" },
        ].map(({ label, icon: Icon, className }) => (
          <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${className}`}>
            <Icon className="h-4 w-4" />{label}
          </div>
        ))}
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar"><CalendarDays className="h-4 w-4 mr-1.5" />Calendar View</TabsTrigger>
          <TabsTrigger value="history"><FileText className="h-4 w-4 mr-1.5" />Filing History</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{MONTH_NAMES[viewMonth]} {viewYear}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" onClick={prevMonth} data-testid="button-prev-month">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); }}>
                    Today
                  </Button>
                  <Button variant="outline" size="icon" onClick={nextMonth} data-testid="button-next-month">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin" /></div>
              ) : (
                <CalendarGrid
                  year={viewYear}
                  month={viewMonth}
                  events={events}
                  onTrigger={ev => triggerMutation.mutate(ev)}
                />
              )}
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-200 inline-block" />Upcoming</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-200 inline-block" />Due within 7 days</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-300 inline-block" />Due within 3 days</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-300 inline-block" />Overdue</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-300 inline-block" />Completed</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
