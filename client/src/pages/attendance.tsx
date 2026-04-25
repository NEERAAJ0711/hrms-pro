import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from "date-fns";
import { Calendar, Clock, Plus, CheckCircle, XCircle, AlertCircle, Users, Zap, Eye, Pencil, Trash2, Download, Search, Lock, FileClock, HardHat, Briefcase } from "lucide-react";
import * as XLSX from "xlsx";
import { SearchableEmployeeSelect } from "@/components/searchable-employee-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Attendance, Employee, Company, LeaveRequest, LeaveType, TimeOfficePolicy } from "@shared/schema";

const attendanceFormSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  companyId: z.string().min(1, "Company is required"),
  date: z.string().min(1, "Date is required"),
  clockIn: z.string().optional(),
  clockOut: z.string().optional(),
  status: z.string().min(1, "Status is required"),
  notes: z.string().optional(),
});

type AttendanceFormValues = z.infer<typeof attendanceFormSchema>;

const statusColors: Record<string, string> = {
  present: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  absent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  half_day: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  on_leave: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  holiday: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  weekend: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  miss_punch: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
};

const statusLabels: Record<string, string> = {
  present: "Present",
  absent: "Absent",
  half_day: "Half Day",
  on_leave: "On Leave",
  holiday: "Holiday",
  weekend: "Weekend/WO",
  miss_punch: "Miss Punch",
};

export default function AttendancePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = ["super_admin", "company_admin", "hr_admin"].includes(user?.role || "");
  const isEmployee = user?.role === "employee";
  const [selectedCompany, setSelectedCompany] = useState<string>(isSuperAdmin ? "__all__" : (user?.companyId || ""));
  const [contractorFilter, setContractorFilter] = useState("own");
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<Attendance | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteRecord, setDeleteRecord] = useState<Attendance | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedDetailIds, setSelectedDetailIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [missedLogRecord, setMissedLogRecord] = useState<Attendance | null>(null);
  const [isMissedLogOpen, setIsMissedLogOpen] = useState(false);
  const [missedLogTime, setMissedLogTime] = useState("");
  const [missedLogNotes, setMissedLogNotes] = useState("");
  const [quickEntryData, setQuickEntryData] = useState({
    employeeId: "",
    companyId: isSuperAdmin ? "" : (user?.companyId || ""),
    payDays: "",
    halfDays: "0",
    otHours: "0",
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: !isEmployee,
  });

  type ContractorRow = { id: string; companyId: string; contractorId: string; startDate: string; contractorName: string };
  type PERow = { id: string; companyId: string; contractorId: string; startDate: string; companyName: string };

  const { data: myContractors = [] } = useQuery<ContractorRow[]>({
    queryKey: ["/api/companies", user?.companyId, "contractors"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${user?.companyId}/contractors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isSuperAdmin && !!user?.companyId,
  });

  const { data: myPrincipalEmployers = [] } = useQuery<PERow[]>({
    queryKey: ["/api/companies", user?.companyId, "principal-employers"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${user?.companyId}/principal-employers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isSuperAdmin && !!user?.companyId,
  });

  useEffect(() => {
    if (isSuperAdmin) return;
    const parts = contractorFilter.split(":");
    const type = parts[0];
    if (type === "own") {
      setSelectedCompany(user?.companyId || "");
    } else if (type === "c") {
      setSelectedCompany(parts[2] || user?.companyId || "");
    } else if (type === "pe") {
      setSelectedCompany(parts[1] || user?.companyId || "");
    }
  }, [contractorFilter]);

  const { data: myEmployee } = useQuery<Employee>({
    queryKey: ["/api/my-employee"],
    enabled: isEmployee,
    queryFn: async () => {
      const res = await fetch("/api/my-employee", { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: attendance = [], isLoading } = useQuery<Attendance[]>({
    queryKey: ["/api/attendance"],
  });

  const { data: leaveRequests = [] } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave-requests"],
  });

  const { data: leaveTypes = [] } = useQuery<LeaveType[]>({
    queryKey: ["/api/leave-types"],
  });

  const { data: allTimeOfficePolicies = [] } = useQuery<TimeOfficePolicy[]>({
    queryKey: ["/api/time-office-policies"],
    queryFn: async () => {
      const res = await fetch(`/api/time-office-policies`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const dayNameMap: Record<number, string> = { 0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday" };

  const getEmployeePolicy = (employee: Employee): TimeOfficePolicy | undefined => {
    if (employee.timeOfficePolicyId) {
      const assigned = allTimeOfficePolicies.find(p => p.id === employee.timeOfficePolicyId && p.status === "active");
      if (assigned) return assigned;
    }
    const companyPolicies = allTimeOfficePolicies.filter(p => p.companyId === employee.companyId && p.status === "active");
    return companyPolicies.find(p => p.isDefault) || companyPolicies[0];
  };

  const isWeeklyOffForEmployee = (employee: Employee, date: Date): boolean => {
    const dayName = dayNameMap[date.getDay()];
    const policy = getEmployeePolicy(employee);
    if (policy) {
      return policy.weeklyOff1 === dayName || (policy.weeklyOff2 || "") === dayName;
    }
    return date.getDay() === 0 || date.getDay() === 6;
  };

  const approvedLeaves = leaveRequests.filter(lr => lr.status === "approved");

  const isOnApprovedLeave = (employeeId: string, date: Date): boolean => {
    const dateStr = format(date, "yyyy-MM-dd");
    return approvedLeaves.some(lr => {
      if (lr.employeeId !== employeeId) return false;
      return dateStr >= lr.startDate && dateStr <= lr.endDate;
    });
  };

  const getLeaveTypeCode = (employeeId: string, date: Date): string => {
    const dateStr = format(date, "yyyy-MM-dd");
    const lr = approvedLeaves.find(lr => lr.employeeId === employeeId && dateStr >= lr.startDate && dateStr <= lr.endDate);
    if (lr) {
      const lt = leaveTypes.find(t => t.id === lr.leaveTypeId);
      return lt?.code || "L";
    }
    return "L";
  };

  const monthStartStr = `${selectedMonth}-01`;
  const monthEndDate = endOfMonth(parseISO(monthStartStr));
  const monthEndStr = format(monthEndDate, "yyyy-MM-dd");

  const filteredEmployees = (selectedCompany === "__all__" 
    ? employees 
    : employees.filter(e => e.companyId === selectedCompany)
  ).filter(e => {
    const joined = (e as any).dateOfJoining;
    const exited = (e as any).exitDate;
    if (joined && joined > monthEndStr) return false;
    if (exited && exited < monthStartStr) return false;
    return true;
  });

  const monthStart = startOfMonth(parseISO(`${selectedMonth}-01`));
  const monthEnd = endOfMonth(monthStart);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const form = useForm<AttendanceFormValues>({
    resolver: zodResolver(attendanceFormSchema),
    defaultValues: {
      employeeId: "",
      companyId: isSuperAdmin ? "" : (user?.companyId || ""),
      date: format(new Date(), "yyyy-MM-dd"),
      clockIn: "09:00",
      clockOut: "18:00",
      status: "present",
      notes: "",
    },
  });

  const editForm = useForm<AttendanceFormValues>({
    resolver: zodResolver(attendanceFormSchema),
    defaultValues: {
      employeeId: "",
      companyId: "",
      date: "",
      clockIn: "",
      clockOut: "",
      status: "present",
      notes: "",
    },
  });

  useEffect(() => {
    if (!isSuperAdmin && user?.companyId) {
      form.setValue("companyId", user.companyId);
    }
  }, [isSuperAdmin, user?.companyId]);

  const createMutation = useMutation({
    mutationFn: async (data: AttendanceFormValues) => {
      return apiRequest("POST", "/api/attendance", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      setIsCreateOpen(false);
      form.reset();
      toast({
        title: "Attendance Recorded",
        description: "Attendance has been recorded successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AttendanceFormValues> }) => {
      return apiRequest("PATCH", `/api/attendance/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      setIsEditOpen(false);
      setEditingRecord(null);
      toast({
        title: "Attendance Updated",
        description: "Attendance record has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/attendance/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      setIsDeleteOpen(false);
      setDeleteRecord(null);
      toast({
        title: "Attendance Deleted",
        description: "Attendance record has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => apiRequest("DELETE", `/api/attendance/${id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      setIsBulkDeleteOpen(false);
      setSelectedDetailIds(new Set());
      toast({
        title: "Records Deleted",
        description: "Selected attendance records have been deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const quickEntryMutation = useMutation({
    mutationFn: async (data: { employeeId: string; companyId: string; month: string; year: string; payDays: string; halfDays: string; otHours: string }) => {
      return apiRequest("POST", "/api/attendance/quick-entry", data);
    },
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      setIsQuickEntryOpen(false);
      setQuickEntryData({ employeeId: "", companyId: isSuperAdmin ? "" : (user?.companyId || ""), payDays: "", halfDays: "0", otHours: "0" });
      toast({
        title: "Quick Entry Complete",
        description: result.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleQuickEntrySubmit = () => {
    const [yearStr, monthStr] = selectedMonth.split("-");
    quickEntryMutation.mutate({
      employeeId: quickEntryData.employeeId,
      companyId: quickEntryData.companyId,
      month: monthStr,
      year: yearStr,
      payDays: quickEntryData.payDays,
      halfDays: quickEntryData.halfDays || "0",
      otHours: quickEntryData.otHours,
    });
  };

  const handleEditRecord = (record: Attendance) => {
    setEditingRecord(record);
    editForm.reset({
      employeeId: record.employeeId,
      companyId: record.companyId,
      date: record.date,
      clockIn: record.clockIn || "",
      clockOut: record.clockOut || "",
      status: record.status,
      notes: record.notes || "",
    });
    setIsEditOpen(true);
  };

  const handleDeleteRecord = (record: Attendance) => {
    setDeleteRecord(record);
    setIsDeleteOpen(true);
  };

  const handleOpenMissedLog = (record: Attendance) => {
    setMissedLogRecord(record);
    setMissedLogTime("");
    setMissedLogNotes("");
    setIsMissedLogOpen(true);
  };

  const missedLogMutation = useMutation({
    mutationFn: async ({ id, time, notes }: { id: string; time: string; notes: string }) => {
      return apiRequest("POST", `/api/attendance/${id}/missed-log`, { time, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
      setIsMissedLogOpen(false);
      setMissedLogRecord(null);
      toast({ title: "Missed log added", description: "Attendance updated and marked as Present." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add missed log.", variant: "destructive" });
    },
  });

  const getAttendanceForDay = (employeeId: string, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return attendance.find(a => a.employeeId === employeeId && a.date === dateStr);
  };

  const getEmployeeSummary = (employee: Employee) => {
    const monthDays = daysInMonth.length;
    let presentDays = 0;
    let halfDays = 0;
    let leaveDays = 0;
    let weeklyOff = 0;
    let holidays = 0;

    // ── Weekly-off logic (continuation rule) ────────────────────────────────
    // Rule: if total present days ≥ 3, every weekly-off day that falls between
    // the 1st of the month and the LAST present date is granted automatically.
    // Future dates (> today) are never counted as computed weekly offs.
    // Stored "weekend" records (Quick Entry) are always counted regardless.

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // ── Phase 1: tally actual attendance records ─────────────────────────────
    for (const day of daysInMonth) {
      const record = getAttendanceForDay(employee.id, day);
      const isWeekend = isWeeklyOffForEmployee(employee, day);
      const onLeave = !record && isOnApprovedLeave(employee.id, day);

      if (record) {
        if (record.status === "present") presentDays++;
        else if (record.status === "half_day") halfDays++;
        else if (record.status === "on_leave") leaveDays++;
        else if (record.status === "weekend") weeklyOff++; // stored — always count
        else if (record.status === "holiday") holidays++;
      } else if (!isWeekend && onLeave) {
        leaveDays++;
      }
    }

    const presentTotal = presentDays + halfDays * 0.5;

    // ── Phase 2: computed WOs proportional to present days ───────────────────
    // Formula: earnedWOs = round(presentTotal × wosPerWeek / workingDaysPerWeek)
    // Applies only to WO days with NO stored record (manual day-by-day entry).
    // Any WO day already stored (as "weekend" or "absent") is not re-evaluated.
    const empPolicy = getEmployeePolicy(employee);
    if (empPolicy) {
      const wosPerWeek = (empPolicy.weeklyOff1 ? 1 : 0) + ((empPolicy.weeklyOff2 || "") ? 1 : 0);
      const workingDaysPerWeek = Math.max(1, 7 - wosPerWeek);

      let unrecordedWoDays = 0;
      for (const day of daysInMonth) {
        if (day > today) break;
        const record = getAttendanceForDay(employee.id, day);
        if (!record && isWeeklyOffForEmployee(employee, day)) unrecordedWoDays++;
      }

      if (unrecordedWoDays > 0) {
        const totalEarned = Math.round(presentTotal * wosPerWeek / workingDaysPerWeek);
        const additionalWOs = Math.min(Math.max(0, totalEarned - weeklyOff), unrecordedWoDays);
        weeklyOff += additionalWOs;
      }
    }

    // Pay Days = Present + Leave + Holidays + earned Weekly Offs (Indian payroll standard)
    const payDays = presentTotal + leaveDays + holidays + weeklyOff;

    // Sum OT hours from all attendance records for this employee this month
    const parseOtH = (val: string | null | undefined): number => {
      if (!val || val === "0") return 0;
      if (String(val).includes(":")) {
        const [h, m] = String(val).split(":").map(Number);
        return (h || 0) + (m || 0) / 60;
      }
      return parseFloat(String(val)) || 0;
    };
    const totalOtHours = parseFloat(
      daysInMonth.reduce((sum, day) => {
        const rec = getAttendanceForDay(employee.id, day);
        return sum + (rec ? parseOtH(rec.otHours as any) : 0);
      }, 0).toFixed(2)
    );

    return { monthDays, presentDays: presentTotal, leaveDays, weeklyOff, holidays, payDays, totalOtHours };
  };

  const getCompanyName = (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    return company?.companyName || "Unknown";
  };

  const searchedEmployees = attendanceSearch.trim()
    ? filteredEmployees.filter(e => {
        const q = attendanceSearch.toLowerCase();
        return (
          `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
          (e.employeeCode || "").toLowerCase().includes(q) ||
          (e.department || "").toLowerCase().includes(q) ||
          (e.designation || "").toLowerCase().includes(q)
        );
      })
    : filteredEmployees;

  const downloadAttendanceSummary = () => {
    const monthLabel = format(parseISO(`${selectedMonth}-01`), "MMMM yyyy");
    const rows = searchedEmployees.map((emp, idx) => {
      const s = getEmployeeSummary(emp);
      const fmt = (n: number) => n % 1 === 0 ? n : parseFloat(n.toFixed(1));
      return {
        "Sr No.": idx + 1,
        "Emp Code": emp.employeeCode || "",
        "Employee Name": `${emp.firstName} ${emp.lastName}`,
        "Department": emp.department || "",
        "Designation": emp.designation || "",
        "Month Days": s.monthDays,
        "Present Days": fmt(s.presentDays),
        "Leave Days": s.leaveDays,
        "Weekly Off": s.weeklyOff,
        "Holidays": s.holidays,
        "Pay Days": fmt(s.payDays),
        "OT Hrs": s.totalOtHours > 0 ? parseFloat(s.totalOtHours.toFixed(2)) : 0,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 6 }, { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 18 },
      { wch: 11 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance Summary");
    XLSX.writeFile(wb, `Attendance_Summary_${selectedMonth}.xlsx`);
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const filteredEmployeeIds = new Set(filteredEmployees.map(e => e.id));
  const presentCount = attendance.filter(a => filteredEmployeeIds.has(a.employeeId) && a.status === "present" && a.date === todayStr).length;
  const absentCount = attendance.filter(a => filteredEmployeeIds.has(a.employeeId) && a.status === "absent" && a.date === todayStr).length;
  const leaveCount = attendance.filter(a => filteredEmployeeIds.has(a.employeeId) && a.status === "on_leave" && a.date === todayStr).length
    + approvedLeaves.filter(lr => filteredEmployeeIds.has(lr.employeeId) && todayStr >= lr.startDate && todayStr <= lr.endDate).length;

  const selectedEmpObj = selectedEmployee ? employees.find(e => e.id === selectedEmployee) : null;
  const employeeAttendance = selectedEmployee
    ? attendance.filter(a => a.employeeId === selectedEmployee && a.date.startsWith(selectedMonth))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  // Build detail log: show stored records + computed WO rows for weeks that
  // meet the ≥ 3 present threshold (same rule used in the summary calculation).
  const detailLogRows: Array<
    | { kind: "record"; record: typeof employeeAttendance[0] }
    | { kind: "wo"; dateStr: string }
    | { kind: "absent"; dateStr: string; isWO: boolean }
  > = (() => {
    if (!selectedEmpObj || employeeAttendance.length === 0) return [];

    // Determine which WO days are earned using proportional formula
    const earnedWoDates = new Set<string>();
    const today2 = new Date();
    today2.setHours(23, 59, 59, 999);

    const detailPolicy = getEmployeePolicy(selectedEmpObj);
    const detailWosPerWeek = detailPolicy
      ? (detailPolicy.weeklyOff1 ? 1 : 0) + ((detailPolicy.weeklyOff2 || "") ? 1 : 0)
      : 2;
    const detailWorkingDaysPerWeek = Math.max(1, 7 - detailWosPerWeek);

    // Collect unrecorded WO days (no stored record, past only)
    const unrecordedWoDays: Date[] = [];
    for (const day of daysInMonth) {
      if (day > today2) break;
      const stored = employeeAttendance.find(r => r.date === format(day, "yyyy-MM-dd"));
      if (!stored && isWeeklyOffForEmployee(selectedEmpObj, day)) unrecordedWoDays.push(day);
    }

    if (unrecordedWoDays.length > 0) {
      const storedPresents = employeeAttendance.filter(r => r.status === "present").length;
      const storedHalfDays = employeeAttendance.filter(r => r.status === "half_day").length;
      const presentTotal = storedPresents + storedHalfDays * 0.5;
      const storedWOs = employeeAttendance.filter(r => r.status === "weekend").length;

      const totalEarned = Math.round(presentTotal * detailWosPerWeek / detailWorkingDaysPerWeek);
      const additionalWOs = Math.min(Math.max(0, totalEarned - storedWOs), unrecordedWoDays.length);
      // Mark the first N chronological unrecorded WO days as earned
      for (let i = 0; i < additionalWOs; i++) {
        earnedWoDates.add(format(unrecordedWoDays[i], "yyyy-MM-dd"));
      }
    }

    // Find last present/half-day date
    const lastPresentStr = employeeAttendance
      .filter(r => r.status === "present" || r.status === "half_day")
      .at(-1)?.date ?? null;
    if (!lastPresentStr) {
      return employeeAttendance.map(r => ({ kind: "record" as const, record: r }));
    }

    // Show ALL days from day 1 to last-present-date:
    // - stored record  → "record" row
    // - earned WO (no stored record) → "wo" row
    // - anything else with no record → "absent" row
    const rows: typeof detailLogRows = [];
    for (const day of daysInMonth) {
      const dateStr = format(day, "yyyy-MM-dd");
      if (dateStr > lastPresentStr) break;
      const stored = employeeAttendance.find(r => r.date === dateStr);
      if (stored) {
        rows.push({ kind: "record", record: stored });
      } else if (earnedWoDates.has(dateStr)) {
        rows.push({ kind: "wo", dateStr });
      } else {
        rows.push({ kind: "absent", dateStr, isWO: isWeeklyOffForEmployee(selectedEmpObj, day) });
      }
    }
    return rows;
  })();

  // ===== Personal view for employee role =====
  if (isEmployee) {
    const myRecords = attendance
      .filter(a => a.date.startsWith(selectedMonth))
      .sort((a, b) => a.date.localeCompare(b.date));

    const presentDays = myRecords.filter(a => a.status === "present").length;
    const halfDays = myRecords.filter(a => a.status === "half_day").length;
    const absentDaysCount = myRecords.filter(a => a.status === "absent").length;
    const leaveDaysCount = myRecords.filter(a => a.status === "on_leave").length;
    const weekendCount = myRecords.filter(a => a.status === "weekend").length;
    const holidayCount = myRecords.filter(a => a.status === "holiday").length;
    const totalWorkHours = myRecords.reduce((sum, a) => {
      if (!a.workHours) return sum;
      const parts = String(a.workHours).split(":").map(Number);
      return sum + (parts[0] || 0) + (parts[1] || 0) / 60;
    }, 0);

    return (
      <div className="p-6" data-testid="attendance-page">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">My Attendance</h1>
            <p className="text-muted-foreground">
              {myEmployee ? `${myEmployee.firstName} ${myEmployee.lastName} · ${myEmployee.employeeCode}` : "Your attendance records"}
            </p>
          </div>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{presentDays + halfDays * 0.5}</div>
              <div className="text-xs text-muted-foreground mt-1">Present Days</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{absentDaysCount}</div>
              <div className="text-xs text-muted-foreground mt-1">Absent Days</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">{leaveDaysCount}</div>
              <div className="text-xs text-muted-foreground mt-1">Leave Days</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-gray-600">{weekendCount}</div>
              <div className="text-xs text-muted-foreground mt-1">Weekly Offs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-purple-600">{holidayCount}</div>
              <div className="text-xs text-muted-foreground mt-1">Holidays</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-orange-600">{totalWorkHours.toFixed(1)}h</div>
              <div className="text-xs text-muted-foreground mt-1">Work Hours</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Records — {format(parseISO(`${selectedMonth}-01`), "MMMM yyyy")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : myRecords.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">No attendance records for this month</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>Work Hours</TableHead>
                    <TableHead>OT Hours</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        {format(parseISO(record.date), "dd MMM yyyy (EEE)")}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[record.status] || "bg-gray-100 text-gray-800"}>
                          {statusLabels[record.status] || record.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{record.clockIn || "—"}</TableCell>
                      <TableCell>{record.clockOut || "—"}</TableCell>
                      <TableCell>{record.workHours || "—"}</TableCell>
                      <TableCell>{record.otHours || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{record.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6" data-testid="attendance-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Attendance Management</h1>
          <p className="text-muted-foreground">Track employee attendance and work hours</p>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setIsQuickEntryOpen(true)} data-testid="button-quick-entry">
          <Zap className="h-4 w-4 mr-2" />
          Quick Entry
        </Button>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-record-attendance">
              <Plus className="h-4 w-4 mr-2" />
              Record Attendance
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Attendance</DialogTitle>
              <DialogDescription>Record attendance for an employee</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                {isSuperAdmin ? (
                  <FormField
                    control={form.control}
                    name="companyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company</FormLabel>
                        <Select 
                          value={field.value} 
                          onValueChange={(value) => {
                            field.onChange(value);
                            form.setValue("employeeId", "");
                          }}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-attendance-company">
                              <SelectValue placeholder="Select company" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {companies.map((company) => (
                              <SelectItem key={company.id} value={company.id}>{company.companyName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="space-y-2">
                    <FormLabel>Company</FormLabel>
                    <p className="text-sm font-medium">{companies.find(c => c.id === user?.companyId)?.companyName || "—"}</p>
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="employeeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employee</FormLabel>
                      <SearchableEmployeeSelect
                        employees={employees.filter(e => e.companyId === form.watch("companyId"))}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="Search by name or ID..."
                        data-testid="select-attendance-employee"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-attendance-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="clockIn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clock In</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} data-testid="input-clock-in" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="clockOut"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clock Out</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} data-testid="input-clock-out" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-attendance-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="present">Present</SelectItem>
                          <SelectItem value="absent">Absent</SelectItem>
                          <SelectItem value="half_day">Half Day</SelectItem>
                          <SelectItem value="on_leave">On Leave</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Optional notes..." {...field} data-testid="input-attendance-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-attendance">
                    {createMutation.isPending ? "Recording..." : "Record Attendance"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Dialog open={isQuickEntryOpen} onOpenChange={setIsQuickEntryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Entry</DialogTitle>
            <DialogDescription>Enter total pay days and OT hours for the selected month. Weekly offs and holidays will be auto-marked per policy.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isSuperAdmin && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Company</label>
                <Select
                  value={quickEntryData.companyId}
                  onValueChange={(v) => setQuickEntryData({ ...quickEntryData, companyId: v, employeeId: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Employee</label>
              <SearchableEmployeeSelect
                employees={employees.filter(e => {
                  if (e.companyId !== quickEntryData.companyId) return false;
                  const joined = (e as any).dateOfJoining;
                  const exited = (e as any).exitDate;
                  if (joined && joined > monthEndStr) return false;
                  if (exited && exited < monthStartStr) return false;
                  return true;
                })}
                value={quickEntryData.employeeId}
                onValueChange={(v) => setQuickEntryData({ ...quickEntryData, employeeId: v })}
                placeholder="Search by name or ID..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Month</label>
              <Input type="month" value={selectedMonth} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Uses the currently selected month from the attendance view</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Pay Days</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 26"
                  data-testid="input-quick-paydays"
                  value={quickEntryData.payDays}
                  onChange={(e) => setQuickEntryData({ ...quickEntryData, payDays: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Full present days</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Half Days</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 1"
                  data-testid="input-quick-halfdays"
                  value={quickEntryData.halfDays}
                  onChange={(e) => setQuickEntryData({ ...quickEntryData, halfDays: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Half-day occurrences</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">OT Hours</label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="e.g. 10"
                  data-testid="input-quick-othours"
                  value={quickEntryData.otHours}
                  onChange={(e) => setQuickEntryData({ ...quickEntryData, otHours: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Total overtime hours</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuickEntryOpen(false)}>Cancel</Button>
            <Button
              onClick={handleQuickEntrySubmit}
              disabled={quickEntryMutation.isPending || !quickEntryData.employeeId || !quickEntryData.payDays}
            >
              {quickEntryMutation.isPending ? "Processing..." : "Apply Quick Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredEmployees.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Present Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{presentCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Absent Today</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{absentCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Leave</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{leaveCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Attendance Overview
              </CardTitle>
              <CardDescription>View and manage employee attendance</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isSuperAdmin ? (
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger className="w-44" data-testid="select-filter-company">
                    <SelectValue placeholder="All Companies" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Companies</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>{company.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (myContractors.length > 0 || myPrincipalEmployers.length > 0) ? (
                <Select value={contractorFilter} onValueChange={setContractorFilter}>
                  <SelectTrigger className="w-52" data-testid="select-attendance-contractor-filter">
                    <SelectValue placeholder="Own Company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="own">Own Company</SelectItem>
                    {myContractors.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-1.5 text-amber-600">
                          <HardHat className="h-3.5 w-3.5" /> Contractors
                        </SelectLabel>
                        {myContractors.map((c) => (
                          <SelectItem key={c.id} value={`c:${c.companyId}:${c.contractorId}`}>
                            {c.contractorName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {myPrincipalEmployers.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-1.5 text-blue-600">
                          <Briefcase className="h-3.5 w-3.5" /> Principal Employers
                        </SelectLabel>
                        {myPrincipalEmployers.map((pe) => (
                          <SelectItem key={pe.id} value={`pe:${pe.companyId}:${pe.contractorId}`}>
                            {pe.companyName}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm font-medium">{companies.find(c => c.id === user?.companyId)?.companyName || ""}</span>
              )}
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-40"
                data-testid="input-filter-month"
              />
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search employee..."
                  value={attendanceSearch}
                  onChange={(e) => setAttendanceSearch(e.target.value)}
                  className="pl-8 w-48"
                />
              </div>
              <Button variant="outline" size="sm" onClick={downloadAttendanceSummary} className="gap-2 whitespace-nowrap">
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No employees found</h3>
              <p className="text-muted-foreground">Add employees to start tracking attendance</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {searchedEmployees.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No employees match your search.</div>
              )}
              {searchedEmployees.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-center py-3 px-3 font-medium w-12">Sr No.</th>
                    <th className="text-left py-3 px-4 font-medium sticky left-0 bg-muted/30 z-10 min-w-[220px]">Employee</th>
                    <th className="text-center py-3 px-3 font-medium whitespace-nowrap">Month Days</th>
                    <th className="text-center py-3 px-3 font-medium whitespace-nowrap text-green-700">Present Days</th>
                    <th className="text-center py-3 px-3 font-medium whitespace-nowrap text-blue-600">Leave Days</th>
                    <th className="text-center py-3 px-3 font-medium whitespace-nowrap text-gray-500">Weekly Off</th>
                    <th className="text-center py-3 px-3 font-medium whitespace-nowrap text-purple-600">Holidays</th>
                    <th className="text-center py-3 px-3 font-medium whitespace-nowrap text-emerald-700">Pay Days</th>
                    <th className="text-center py-3 px-3 font-medium whitespace-nowrap text-orange-600">OT Hrs</th>
                    <th className="text-center py-3 px-2 font-medium min-w-[50px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {searchedEmployees.map((employee, idx) => {
                    const s = getEmployeeSummary(employee);
                    const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(1);
                    return (
                      <tr key={employee.id} className="border-b hover:bg-muted/50">
                        <td className="text-center py-3 px-3 text-muted-foreground font-medium w-12">{idx + 1}</td>
                        <td className="py-3 px-4 sticky left-0 bg-background z-10 min-w-[220px]">
                          <div className="font-medium truncate" title={`[${employee.employeeCode}] ${employee.firstName} ${employee.lastName}`}>
                            <span className="text-primary font-semibold text-xs">[{employee.employeeCode}]</span>{" "}
                            <span className="text-xs">{employee.firstName} {employee.lastName}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">{employee.department || ""}{employee.department && employee.designation ? " · " : ""}{employee.designation || ""}</div>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="font-medium">{s.monthDays}</span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="font-semibold text-green-700">{fmt(s.presentDays)}</span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="font-semibold text-blue-600">{s.leaveDays}</span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="font-semibold text-gray-500">{s.weeklyOff}</span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="font-semibold text-purple-600">{s.holidays}</span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">{fmt(s.payDays)}</span>
                        </td>
                        <td className="text-center py-3 px-3">
                          <span className={s.totalOtHours > 0 ? "font-semibold text-orange-600" : "text-muted-foreground"}>
                            {s.totalOtHours > 0 ? s.totalOtHours.toFixed(2) : "—"}
                          </span>
                        </td>
                        <td className="text-center py-3 px-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setSelectedEmployee(employee.id)}
                            title="View attendance details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedEmployee} onOpenChange={(open) => { if (!open) { setSelectedEmployee(null); setSelectedDetailIds(new Set()); } }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>
                  {selectedEmpObj && (
                    <span>
                      <span className="text-primary">[{selectedEmpObj.employeeCode}]</span>{" "}
                      {selectedEmpObj.firstName} {selectedEmpObj.lastName} — Attendance for {format(monthStart, "MMMM yyyy")}
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription>View, edit, or delete attendance records for this employee</DialogDescription>
              </div>
              {isAdmin && selectedDetailIds.size > 0 && (
                <Button variant="destructive" size="sm" className="shrink-0 mt-1" onClick={() => setIsBulkDeleteOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Selected ({selectedDetailIds.size})
                </Button>
              )}
            </div>
          </DialogHeader>
          {detailLogRows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No attendance records found for this month.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedDetailIds.size === employeeAttendance.length && employeeAttendance.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedDetailIds(new Set(employeeAttendance.map(r => r.id)));
                          } else {
                            setSelectedDetailIds(new Set());
                          }
                        }}
                      />
                    </TableHead>
                  )}
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Work Hrs</TableHead>
                  <TableHead>OT Hrs</TableHead>
                  <TableHead>Notes</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailLogRows.map((row, idx) => {
                  if (row.kind === "wo") {
                    const d = parseISO(row.dateStr);
                    return (
                      <TableRow key={`wo-${row.dateStr}`} className="bg-blue-50/40 dark:bg-blue-950/20">
                        {isAdmin && <TableCell />}
                        <TableCell className="font-medium text-muted-foreground">{row.dateStr}</TableCell>
                        <TableCell className="text-muted-foreground">{format(d, "EEE")}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700">Weekly Off</Badge>
                        </TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>—</TableCell>
                        {isAdmin && <TableCell />}
                      </TableRow>
                    );
                  }
                  if (row.kind === "absent") {
                    const d = parseISO(row.dateStr);
                    return (
                      <TableRow key={`absent-${row.dateStr}`}>
                        {isAdmin && (
                          <TableCell>
                            <Checkbox disabled checked={false} />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{row.dateStr}</TableCell>
                        <TableCell>{format(d, "EEE")}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-red-100 text-red-700">Absent</Badge>
                        </TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>0</TableCell>
                        <TableCell>0</TableCell>
                        <TableCell>{row.isWO ? "Weekly Off" : "—"}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => {
                                  form.reset({
                                    employeeId: selectedEmployee || "",
                                    companyId: selectedEmpObj?.companyId || (isSuperAdmin ? "" : (user?.companyId || "")),
                                    date: row.dateStr,
                                    clockIn: "",
                                    clockOut: "",
                                    status: "absent",
                                    notes: row.isWO ? "Weekly Off" : "",
                                  });
                                  setIsCreateOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  }
                  const record = row.record;
                  const d = parseISO(record.date);
                  const isChecked = selectedDetailIds.has(record.id);
                  return (
                    <TableRow key={record.id} className={isChecked ? "bg-muted/50" : ""}>
                      {isAdmin && (
                        <TableCell>
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedDetailIds);
                              if (checked) next.add(record.id);
                              else next.delete(record.id);
                              setSelectedDetailIds(next);
                            }}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{record.date}</TableCell>
                      <TableCell>{format(d, "EEE")}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusColors[record.status] || ""}>
                          {record.status === "on_leave" ? ((record as any).leaveTypeCode || statusLabels[record.status] || record.status) : (statusLabels[record.status] || record.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{record.clockIn || "—"}</TableCell>
                      <TableCell>{record.clockOut || "—"}</TableCell>
                      <TableCell>{record.workHours || "0"}</TableCell>
                      <TableCell>{record.otHours || "0"}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{record.notes || "—"}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          {record.clockInMethod === "biometric" && !isSuperAdmin ? (
                            <div className="flex justify-end gap-1">
                              {record.status === "miss_punch" ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-orange-600 hover:text-orange-700"
                                  title="Add missed punch log"
                                  onClick={() => handleOpenMissedLog(record)}
                                  data-testid={`btn-add-missed-log-${record.id}`}
                                >
                                  <FileClock className="h-3.5 w-3.5" />
                                </Button>
                              ) : (
                                <span title="From biometric device — only Super Admin can edit">
                                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditRecord(record)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteRecord(record)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Selected Records</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedDetailIds.size} selected attendance record{selectedDetailIds.size !== 1 ? "s" : ""}?{!isSuperAdmin && " Biometric (machine) records in the selection will be skipped."} This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => {
                const ids = Array.from(selectedDetailIds);
                const deletable = isSuperAdmin
                  ? ids
                  : ids.filter(id => {
                      const rec = attendance.find(a => a.id === id);
                      return rec?.clockInMethod !== "biometric";
                    });
                bulkDeleteMutation.mutate(deletable);
              }}
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedDetailIds.size} Record${selectedDetailIds.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Attendance</DialogTitle>
            <DialogDescription>Update attendance record for {editingRecord?.date}</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => editingRecord && updateMutation.mutate({ id: editingRecord.id, data }))} className="space-y-4">
              <FormField
                control={editForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="half_day">Half Day</SelectItem>
                        <SelectItem value="on_leave">On Leave</SelectItem>
                        <SelectItem value="holiday">Holiday</SelectItem>
                        <SelectItem value="weekend">Weekend/WO</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="clockIn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Clock In</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="clockOut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Clock Out</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional notes..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Updating..." : "Update"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Attendance Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the attendance record for {deleteRecord?.date}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteRecord && deleteMutation.mutate(deleteRecord.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Missed Punch Log Dialog */}
      <Dialog open={isMissedLogOpen} onOpenChange={setIsMissedLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Missed Punch Log</DialogTitle>
            <DialogDescription>
              {missedLogRecord && (
                <>
                  Punch recorded at{" "}
                  <strong>{missedLogRecord.clockIn || missedLogRecord.clockOut}</strong>.{" "}
                  Enter the other punch time. The system will automatically assign clock-in / clock-out based on which time is earlier (as per shift).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Other Punch Time</label>
              <Input
                type="time"
                value={missedLogTime}
                onChange={e => setMissedLogTime(e.target.value)}
                data-testid="input-missed-log-time"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                placeholder="Reason for manual entry..."
                value={missedLogNotes}
                onChange={e => setMissedLogNotes(e.target.value)}
                data-testid="input-missed-log-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMissedLogOpen(false)}>Cancel</Button>
            <Button
              disabled={!missedLogTime || missedLogMutation.isPending}
              onClick={() => {
                if (missedLogRecord && missedLogTime) {
                  missedLogMutation.mutate({ id: missedLogRecord.id, time: missedLogTime, notes: missedLogNotes });
                }
              }}
              data-testid="btn-submit-missed-log"
            >
              {missedLogMutation.isPending ? "Saving..." : "Save Log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
