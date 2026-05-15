import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  parseISO, subMonths, addMonths, isToday, isSameMonth,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Clock, Calendar,
  CheckCircle2, XCircle, AlertCircle, Umbrella,
  Coffee, TrendingUp, Download, LogIn, LogOut, Timer, StickyNote,
  MapPin, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import * as XLSX from "xlsx";
import type { Attendance, Employee, LeaveRequest, LeaveType, TimeOfficePolicy } from "@shared/schema";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  present:    { label: "Present",     color: "text-green-700 dark:text-green-300",  bg: "bg-green-100 dark:bg-green-900/50",  icon: <CheckCircle2 className="h-3 w-3" /> },
  absent:     { label: "Absent",      color: "text-red-700 dark:text-red-300",     bg: "bg-red-100 dark:bg-red-900/50",     icon: <XCircle className="h-3 w-3" /> },
  half_day:   { label: "Half Day",    color: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-100 dark:bg-yellow-900/50", icon: <AlertCircle className="h-3 w-3" /> },
  on_leave:   { label: "On Leave",    color: "text-blue-700 dark:text-blue-300",   bg: "bg-blue-100 dark:bg-blue-900/50",   icon: <Umbrella className="h-3 w-3" /> },
  holiday:    { label: "Holiday",     color: "text-purple-700 dark:text-purple-300", bg: "bg-purple-100 dark:bg-purple-900/50", icon: <Calendar className="h-3 w-3" /> },
  weekend:    { label: "Week Off",    color: "text-gray-600 dark:text-gray-400",   bg: "bg-gray-100 dark:bg-gray-800/50",   icon: <Coffee className="h-3 w-3" /> },
  miss_punch: { label: "Miss Punch",  color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-100 dark:bg-orange-900/50", icon: <AlertCircle className="h-3 w-3" /> },
};

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Calculate working hours from HH:MM strings
function calcWorkingHrs(clockIn?: string | null, clockOut?: string | null): string | null {
  if (!clockIn || !clockOut) return null;
  const parseMin = (t: string) => {
    const parts = t.replace(/[AP]M/i, "").trim().split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1] || "0");
  };
  const diff = parseMin(clockOut) - parseMin(clockIn);
  if (diff <= 0) return null;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function MyAttendancePage() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<{ date: Date; rec: Attendance | undefined } | null>(null);

  const selectedYear  = currentDate.getFullYear();
  const selectedMonth = currentDate.getMonth();
  const monthStart    = startOfMonth(currentDate);
  const monthEnd      = endOfMonth(currentDate);
  const daysInMonth   = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const monthStr      = format(currentDate, "yyyy-MM");

  const { data: myEmployee, isLoading: empLoading } = useQuery<Employee>({
    queryKey: ["/api/my-employee"],
    queryFn: async () => {
      const res = await fetch("/api/my-employee", { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: user?.role === "employee",
  });

  const { data: attendance = [], isLoading: attLoading } = useQuery<Attendance[]>({
    queryKey: ["/api/attendance"],
  });

  const { data: leaveRequests = [] } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave-requests"],
  });

  const { data: leaveTypes = [] } = useQuery<LeaveType[]>({
    queryKey: ["/api/leave-types"],
  });

  const { data: policies = [] } = useQuery<TimeOfficePolicy[]>({
    queryKey: ["/api/time-office-policies"],
    queryFn: async () => {
      const res = await fetch("/api/time-office-policies", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const isLoading = empLoading || attLoading;

  // ── Outdoor Entry state ───────────────────────────────────────────────────
  const qc = useQueryClient();
  const { toast } = useToast();
  const [outdoorOpen, setOutdoorOpen] = useState(false);
  const [outdoorForm, setOutdoorForm] = useState({ date: format(new Date(), "yyyy-MM-dd"), purpose: "", location: "", checkOutTime: "", checkInTime: "" });

  const { data: outdoorEntries = [] } = useQuery<any[]>({
    queryKey: ["/api/outdoor-entries"],
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch("/api/outdoor-entries", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createOutdoorMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/outdoor-entries", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/outdoor-entries"] });
      setOutdoorOpen(false);
      setOutdoorForm({ date: format(new Date(), "yyyy-MM-dd"), purpose: "", location: "", checkOutTime: "", checkInTime: "" });
      toast({ title: "Outdoor duty entry submitted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteOutdoorMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/outdoor-entries/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/outdoor-entries"] }); toast({ title: "Deleted" }); },
  });

  const monthOutdoorEntries = outdoorEntries.filter((e: any) => e.date.startsWith(monthStr));

  const dayNameMap: Record<number, string> = {
    0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
    4: "thursday", 5: "friday", 6: "saturday",
  };

  const employeePolicy: TimeOfficePolicy | undefined = myEmployee
    ? (myEmployee.timeOfficePolicyId
        ? policies.find(p => p.id === myEmployee.timeOfficePolicyId && p.status === "active")
          || policies.find(p => p.companyId === myEmployee.companyId && p.status === "active" && p.isDefault)
          || policies.find(p => p.companyId === myEmployee.companyId && p.status === "active")
        : policies.find(p => p.companyId === myEmployee.companyId && p.status === "active" && p.isDefault)
          || policies.find(p => p.companyId === myEmployee.companyId && p.status === "active")
      )
    : undefined;

  const isWeeklyOff = (date: Date): boolean => {
    const day = dayNameMap[date.getDay()];
    if (employeePolicy) {
      return employeePolicy.weeklyOff1 === day || (employeePolicy.weeklyOff2 || "") === day;
    }
    return date.getDay() === 0 || date.getDay() === 6;
  };

  const approvedLeaves = leaveRequests.filter(lr => lr.status === "approved");

  const isOnLeave = (date: Date): boolean => {
    const ds = format(date, "yyyy-MM-dd");
    return approvedLeaves.some(lr => ds >= lr.startDate && ds <= lr.endDate);
  };

  const getLeaveLabel = (date: Date): string => {
    const ds = format(date, "yyyy-MM-dd");
    const lr = approvedLeaves.find(lr => ds >= lr.startDate && ds <= lr.endDate);
    if (lr) {
      const lt = leaveTypes.find(t => t.id === lr.leaveTypeId);
      return lt?.name || "Leave";
    }
    return "Leave";
  };

  const monthAttendance = attendance
    .filter(a => a.date.startsWith(monthStr))
    .sort((a, b) => a.date.localeCompare(b.date));

  const getRecord = (date: Date) =>
    monthAttendance.find(a => a.date === format(date, "yyyy-MM-dd"));

  const getDayStatus = (date: Date) => {
    const rec = getRecord(date);
    if (rec) return rec.status;
    if (isWeeklyOff(date)) return "weekend";
    if (isOnLeave(date)) return "on_leave";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (date < today) return "absent";
    return null;
  };

  const getDayLeaveLabel = (date: Date): string | null => {
    const rec = getRecord(date);
    if (rec) return null;
    if (isOnLeave(date)) return getLeaveLabel(date);
    return null;
  };

  // Summary calculation
  const today = new Date(); today.setHours(23, 59, 59, 999);
  let presentDays = 0, halfDays = 0, leaveDays = 0, weeklyOff = 0, holidays = 0, absentDays = 0;

  for (const day of daysInMonth) {
    const rec = getRecord(day);
    const wo = isWeeklyOff(day);
    const onLeave = !rec && isOnLeave(day);
    if (rec) {
      if (rec.status === "present" || rec.status === "miss_punch") presentDays++;
      else if (rec.status === "half_day") halfDays++;
      else if (rec.status === "on_leave") leaveDays++;
      else if (rec.status === "weekend") weeklyOff++;
      else if (rec.status === "holiday") holidays++;
      else if (rec.status === "absent" && !wo) absentDays++;
    } else if (!wo && onLeave) {
      leaveDays++;
    } else if (!wo && !onLeave && day <= today && isSameMonth(day, currentDate)) {
      absentDays++;
    }
  }

  const presentTotal = presentDays + halfDays * 0.5;

  // Computed weekly offs (proportional)
  if (employeePolicy) {
    const wosPerWeek = (employeePolicy.weeklyOff1 ? 1 : 0) + ((employeePolicy.weeklyOff2 || "") ? 1 : 0);
    const workingDaysPerWeek = Math.max(1, 7 - wosPerWeek);
    const unrecorded = daysInMonth.filter(day => {
      if (day > today) return false;
      const stored = monthAttendance.find(r => r.date === format(day, "yyyy-MM-dd"));
      return !stored && isWeeklyOff(day);
    });
    if (unrecorded.length > 0 && presentTotal >= 3) {
      const earned = Math.round(presentTotal * wosPerWeek / workingDaysPerWeek);
      weeklyOff += Math.min(earned, unrecorded.length);
    }
  }

  const payDays = presentTotal + leaveDays + holidays + weeklyOff;

  // OT hours
  const parseOt = (val: string | null | undefined) => {
    if (!val || val === "0") return 0;
    if (String(val).includes(":")) {
      const [h, m] = String(val).split(":").map(Number);
      return (h || 0) + (m || 0) / 60;
    }
    return parseFloat(String(val)) || 0;
  };
  const totalOt = monthAttendance.reduce((s, r) => s + parseOt((r as any).otHours), 0);

  const fmt = (n: number) => n % 1 === 0 ? `${n}` : n.toFixed(1);

  const summaryCards = [
    { label: "Present", value: fmt(presentTotal),    color: "text-green-600 dark:text-green-400",   bg: "bg-green-50 dark:bg-green-950/30",   icon: <CheckCircle2 className="h-5 w-5" /> },
    { label: "Absent",  value: `${absentDays}`,       color: "text-red-600 dark:text-red-400",       bg: "bg-red-50 dark:bg-red-950/30",       icon: <XCircle className="h-5 w-5" /> },
    { label: "Half Day",value: `${halfDays}`,          color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950/30", icon: <AlertCircle className="h-5 w-5" /> },
    { label: "On Leave",value: `${leaveDays}`,         color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-50 dark:bg-blue-950/30",     icon: <Umbrella className="h-5 w-5" /> },
    { label: "Week Off", value: `${weeklyOff}`,        color: "text-gray-600 dark:text-gray-400",     bg: "bg-gray-50 dark:bg-gray-950/30",     icon: <Coffee className="h-5 w-5" /> },
    { label: "Holidays",value: `${holidays}`,          color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30", icon: <Calendar className="h-5 w-5" /> },
    { label: "Pay Days", value: fmt(payDays),          color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: <TrendingUp className="h-5 w-5" /> },
    { label: "OT Hours", value: totalOt > 0 ? totalOt.toFixed(1) : "0", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30", icon: <Clock className="h-5 w-5" /> },
  ];

  // Calendar grid: pad start
  const startPad = monthStart.getDay();
  const calendarCells: (Date | null)[] = [
    ...Array(startPad).fill(null),
    ...daysInMonth,
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const handleDownload = () => {
    const rows = daysInMonth
      .filter(day => {
        const rec = getRecord(day);
        return rec || day <= today;
      })
      .map(day => {
        const rec = getRecord(day);
        const status = getDayStatus(day);
        const cfg = status ? STATUS_CONFIG[status] : null;
        return {
          "Date":       format(day, "dd MMM yyyy"),
          "Day":        format(day, "EEEE"),
          "Status":     cfg?.label || "-",
          "Clock In":   rec?.clockIn || "-",
          "Clock Out":  rec?.clockOut || "-",
          "OT Hours":   rec ? (parseOt((rec as any).otHours).toFixed(1)) : "-",
          "Notes":      rec?.notes || "-",
        };
      });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "My Attendance");
    XLSX.writeFile(wb, `My_Attendance_${monthStr}.xlsx`);
  };

  const employeeName = myEmployee
    ? `${myEmployee.firstName} ${myEmployee.lastName}`.trim()
    : user?.username || "Employee";

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            My Attendance
          </h1>
          {isLoading ? (
            <Skeleton className="h-4 w-48 mt-1" />
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">
              {employeeName}
              {myEmployee?.employeeCode ? ` · ${myEmployee.employeeCode}` : ""}
              {myEmployee?.department ? ` · ${myEmployee.department}` : ""}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Month Navigator */}
          <div className="flex items-center gap-1 border rounded-lg px-2 py-1 bg-background">
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              data-testid="button-prev-month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[120px] text-center" data-testid="text-selected-month">
              {monthNames[selectedMonth]} {selectedYear}
            </span>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              disabled={isSameMonth(currentDate, new Date())}
              data-testid="button-next-month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download-attendance">
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setOutdoorOpen(true)} data-testid="button-outdoor-duty">
            <MapPin className="h-4 w-4" />
            Outdoor Duty
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {summaryCards.map(card => (
            <div
              key={card.label}
              className={`rounded-xl border p-4 flex items-center gap-3 ${card.bg}`}
              data-testid={`card-summary-${card.label.toLowerCase().replace(" ", "-")}`}
            >
              <div className={card.color}>{card.icon}</div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">{card.label}</p>
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Calendar */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Attendance Calendar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Day labels */}
            <div className="grid grid-cols-7 mb-1">
              {dayNames.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            {/* Calendar cells */}
            {isLoading ? (
              <div className="grid grid-cols-7 gap-1">
                {Array(35).fill(0).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((day, idx) => {
                  if (!day) return <div key={idx} />;
                  const status = getDayStatus(day);
                  const cfg = status ? STATUS_CONFIG[status] : null;
                  const rec = getRecord(day);
                  const todayMark = isToday(day);
                  const workHrs = rec ? calcWorkingHrs(rec.clockIn, rec.clockOut) : null;
                  const clickable = !!cfg;

                  return (
                    <div
                      key={idx}
                      onClick={() => clickable && setSelectedDay({ date: day, rec })}
                      className={`
                        relative rounded-md p-1 min-h-[44px] flex flex-col items-center justify-center gap-0.5 border transition-all
                        ${cfg ? `${cfg.bg} border-transparent` : "border-border bg-background"}
                        ${todayMark ? "ring-2 ring-primary ring-offset-1" : ""}
                        ${clickable ? "cursor-pointer hover:brightness-95 hover:shadow-sm" : ""}
                      `}
                      data-testid={`cal-day-${format(day, "dd")}`}
                    >
                      <span className={`text-xs font-semibold ${todayMark ? "text-primary" : cfg ? cfg.color : "text-muted-foreground"}`}>
                        {format(day, "d")}
                      </span>
                      {cfg && (
                        <span className={`text-[9px] font-medium leading-tight text-center ${cfg.color}`}>
                          {cfg.label === "Miss Punch" ? "Miss" : cfg.label.split(" ")[0]}
                        </span>
                      )}
                      {workHrs ? (
                        <span className="text-[8px] text-muted-foreground leading-tight font-mono">{workHrs}</span>
                      ) : rec?.clockIn ? (
                        <span className="text-[8px] text-muted-foreground leading-tight">{rec.clockIn}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1">
                  <div className={`w-2.5 h-2.5 rounded-sm ${cfg.bg}`} />
                  <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detail Log */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Daily Log
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : monthAttendance.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">No records yet</p>
                <p className="text-xs">Attendance will appear here once recorded</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[420px]">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="py-2 pl-4">Date</TableHead>
                      <TableHead className="py-2">Status</TableHead>
                      <TableHead className="py-2">In</TableHead>
                      <TableHead className="py-2 pr-4">Out</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthAttendance.map(rec => {
                      const cfg = STATUS_CONFIG[rec.status] || STATUS_CONFIG["absent"];
                      return (
                        <TableRow key={rec.id} className="text-xs" data-testid={`row-attendance-${rec.date}`}>
                          <TableCell className="py-2 pl-4 font-medium">
                            <div>{format(parseISO(rec.date), "d MMM")}</div>
                            <div className="text-[10px] text-muted-foreground">{format(parseISO(rec.date), "EEE")}</div>
                          </TableCell>
                          <TableCell className="py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
                              {cfg.icon}
                              {cfg.label}
                            </span>
                          </TableCell>
                          <TableCell className="py-2">
                            {rec.clockIn ? (
                              <span className="font-mono text-[11px] text-green-700 dark:text-green-400">{rec.clockIn}</span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="py-2 pr-4">
                            {rec.clockOut ? (
                              <span className="font-mono text-[11px] text-red-600 dark:text-red-400">{rec.clockOut}</span>
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
      </div>

      {/* Full detail table (only if records exist) */}
      {monthAttendance.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Detailed Attendance — {monthNames[selectedMonth]} {selectedYear}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>OT Hours</TableHead>
                    <TableHead className="pr-4">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daysInMonth.map(day => {
                    const rec = getRecord(day);
                    const status = getDayStatus(day);
                    const leaveLabel = getDayLeaveLabel(day);
                    if (!rec && (!status || status === null)) return null;
                    const cfg = status ? STATUS_CONFIG[status] : null;
                    const otVal = rec ? parseOt((rec as any).otHours) : 0;
                    const todayMark = isToday(day);

                    return (
                      <TableRow
                        key={format(day, "yyyy-MM-dd")}
                        className={todayMark ? "bg-primary/5" : ""}
                        data-testid={`detail-row-${format(day, "dd")}`}
                      >
                        <TableCell className="pl-4 font-medium text-sm">
                          {format(day, "dd MMM yyyy")}
                          {todayMark && <Badge variant="outline" className="ml-1.5 text-[10px] py-0 px-1.5 text-primary border-primary">Today</Badge>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(day, "EEE")}</TableCell>
                        <TableCell>
                          {cfg ? (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                              {cfg.icon}
                              {leaveLabel || cfg.label}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          {rec?.clockIn ? (
                            <span className="font-mono text-sm text-green-700 dark:text-green-400 font-semibold">{rec.clockIn}</span>
                          ) : <span className="text-muted-foreground text-sm">—</span>}
                        </TableCell>
                        <TableCell>
                          {rec?.clockOut ? (
                            <span className="font-mono text-sm text-red-600 dark:text-red-400 font-semibold">{rec.clockOut}</span>
                          ) : <span className="text-muted-foreground text-sm">—</span>}
                        </TableCell>
                        <TableCell>
                          {otVal > 0 ? (
                            <span className="text-orange-600 dark:text-orange-400 font-semibold text-sm">{otVal.toFixed(1)} h</span>
                          ) : <span className="text-muted-foreground text-sm">—</span>}
                        </TableCell>
                        <TableCell className="pr-4 text-sm text-muted-foreground max-w-[200px] truncate">
                          {rec?.notes || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      {/* ── Outdoor Duty Section ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Outdoor Duty — {monthNames[selectedMonth]} {selectedYear}
            <span className="ml-auto text-xs font-normal text-muted-foreground">{monthOutdoorEntries.length} {monthOutdoorEntries.length === 1 ? "entry" : "entries"}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {monthOutdoorEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <MapPin className="h-9 w-9 text-muted-foreground opacity-25" />
              <p className="text-sm font-medium text-muted-foreground">No outdoor entries this month</p>
              <p className="text-xs text-muted-foreground opacity-70">Tap "Outdoor Duty" to log a field visit or client meeting</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Out Time</TableHead>
                    <TableHead>In Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthOutdoorEntries.map((entry: any) => {
                    const scfg = entry.status === "approved"
                      ? { bg: "bg-green-100", text: "text-green-700", label: "Approved" }
                      : entry.status === "rejected"
                      ? { bg: "bg-red-100", text: "text-red-700", label: "Rejected" }
                      : { bg: "bg-amber-100", text: "text-amber-700", label: "Pending" };
                    return (
                      <TableRow key={entry.id} data-testid={`row-outdoor-${entry.id}`}>
                        <TableCell className="pl-4 font-medium text-sm">{format(parseISO(entry.date), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate">{entry.purpose}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.location || "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{entry.checkOutTime || "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{entry.checkInTime || "—"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${scfg.bg} ${scfg.text}`}>
                            {scfg.label}
                          </span>
                        </TableCell>
                        <TableCell className="pr-4">
                          {entry.status === "pending" && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:bg-red-50" onClick={() => deleteOutdoorMutation.mutate(entry.id)} data-testid={`button-del-outdoor-${entry.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
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

      {/* Outdoor Duty Dialog */}
      <Dialog open={outdoorOpen} onOpenChange={setOutdoorOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Log Outdoor Duty</DialogTitle>
            <DialogDescription>Submit a field visit, client meeting, or any outdoor duty for approval</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Date <span className="text-red-500">*</span></label>
              <Input type="date" value={outdoorForm.date} max={format(new Date(), "yyyy-MM-dd")} onChange={e => setOutdoorForm(f => ({ ...f, date: e.target.value }))} data-testid="input-outdoor-date" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Purpose <span className="text-red-500">*</span></label>
              <Textarea placeholder="e.g. Client meeting at ABC Corp" value={outdoorForm.purpose} onChange={e => setOutdoorForm(f => ({ ...f, purpose: e.target.value }))} rows={2} data-testid="input-outdoor-purpose" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Location</label>
              <Input placeholder="e.g. Mumbai, Client office" value={outdoorForm.location} onChange={e => setOutdoorForm(f => ({ ...f, location: e.target.value }))} data-testid="input-outdoor-location" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Check-out Time</label>
                <Input type="time" value={outdoorForm.checkOutTime} onChange={e => setOutdoorForm(f => ({ ...f, checkOutTime: e.target.value }))} data-testid="input-outdoor-checkout" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Check-in Time</label>
                <Input type="time" value={outdoorForm.checkInTime} onChange={e => setOutdoorForm(f => ({ ...f, checkInTime: e.target.value }))} data-testid="input-outdoor-checkin" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutdoorOpen(false)}>Cancel</Button>
            <Button disabled={!outdoorForm.date || !outdoorForm.purpose.trim() || createOutdoorMutation.isPending} onClick={() => createOutdoorMutation.mutate({ date: outdoorForm.date, purpose: outdoorForm.purpose, location: outdoorForm.location || undefined, checkOutTime: outdoorForm.checkOutTime || undefined, checkInTime: outdoorForm.checkInTime || undefined })} data-testid="button-submit-outdoor">
              {createOutdoorMutation.isPending ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Day Detail Dialog ──────────────────────────────────────── */}
      {selectedDay && (() => {
        const { date, rec } = selectedDay;
        const status = getDayStatus(date);
        const cfg = status ? STATUS_CONFIG[status] : null;
        const leaveLabel = getDayLeaveLabel(date);
        const workHrs = calcWorkingHrs(rec?.clockIn, rec?.clockOut);
        const otVal = rec ? parseOt((rec as any).otHours) : 0;
        return (
          <Dialog open onOpenChange={() => setSelectedDay(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-4 w-4 text-primary" />
                  {format(date, "EEEE, dd MMMM yyyy")}
                  {isToday(date) && <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-primary border-primary ml-1">Today</Badge>}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-1">
                {/* Status */}
                {cfg && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${cfg.bg}`}>
                    <span className={cfg.color}>{cfg.icon}</span>
                    <span className={`font-semibold text-sm ${cfg.color}`}>{leaveLabel || cfg.label}</span>
                  </div>
                )}

                {/* Times grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <LogIn className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-xs">Clock In</span>
                    </div>
                    <p className="text-sm font-semibold font-mono">{rec?.clockIn || "—"}</p>
                  </div>
                  <div className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <LogOut className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-xs">Clock Out</span>
                    </div>
                    <p className="text-sm font-semibold font-mono">{rec?.clockOut || "—"}</p>
                  </div>
                </div>

                {/* Working hrs + OT */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Timer className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs">Working Hrs</span>
                    </div>
                    <p className="text-sm font-semibold">{workHrs || "—"}</p>
                  </div>
                  <div className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 text-orange-500" />
                      <span className="text-xs">OT Hours</span>
                    </div>
                    <p className="text-sm font-semibold">{otVal > 0 ? `${otVal.toFixed(1)} h` : "—"}</p>
                  </div>
                </div>

                {/* Notes */}
                {rec?.notes && (
                  <div className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <StickyNote className="h-3.5 w-3.5" />
                      <span className="text-xs">Notes</span>
                    </div>
                    <p className="text-sm text-foreground">{rec.notes}</p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
