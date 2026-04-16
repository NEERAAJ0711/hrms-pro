import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { format, differenceInDays, parseISO } from "date-fns";
import { Calendar, Plus, Check, X, Clock, FileText, Users, Pencil, Trash2 } from "lucide-react";
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

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

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

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: !isEmployee,
  });

  const { data: myEmployee } = useQuery<Employee>({
    queryKey: ["/api/my-employee"],
    enabled: isEmployee,
    queryFn: async () => {
      const res = await fetch("/api/my-employee", { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: leaveTypes = [] } = useQuery<LeaveType[]>({
    queryKey: ["/api/leave-types"],
  });

  const { data: leaveRequests = [], isLoading } = useQuery<LeaveRequest[]>({
    queryKey: ["/api/leave-requests"],
  });

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

  useEffect(() => {
    if (!isSuperAdmin && user?.companyId) {
      form.setValue("companyId", user.companyId);
    }
  }, [isSuperAdmin, user?.companyId]);

  useEffect(() => {
    if (isEmployee && myEmployee) {
      form.setValue("employeeId", myEmployee.id);
      form.setValue("companyId", myEmployee.companyId);
    }
  }, [isEmployee, myEmployee]);

  const createMutation = useMutation({
    mutationFn: async (data: LeaveRequestFormValues) => {
      return apiRequest("POST", "/api/leave-requests", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      setIsCreateOpen(false);
      form.reset();
      toast({
        title: "Leave Request Created",
        description: "The leave request has been submitted for approval.",
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

  const approveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/leave-requests/${id}`, { status, approvedAt: new Date().toISOString() });
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-requests"] });
      toast({
        title: status === "approved" ? "Leave Approved" : "Leave Rejected",
        description: `The leave request has been ${status}.`,
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

  const leaveTypeForm = useForm<LeaveTypeFormValues>({
    resolver: zodResolver(leaveTypeSchema),
    defaultValues: {
      companyId: isSuperAdmin ? "" : (user?.companyId || ""),
      name: "",
      code: "",
      daysPerYear: 12,
      carryForward: false,
      maxCarryForward: 0,
      description: "",
      status: "active",
    },
  });

  const openLeaveTypeDialog = (lt?: LeaveType) => {
    if (lt) {
      setEditingLeaveType(lt);
      leaveTypeForm.reset({
        companyId: lt.companyId || "",
        name: lt.name,
        code: lt.code,
        daysPerYear: lt.daysPerYear,
        carryForward: lt.carryForward ?? false,
        maxCarryForward: lt.maxCarryForward ?? 0,
        description: lt.description || "",
        status: lt.status,
      });
    } else {
      setEditingLeaveType(null);
      leaveTypeForm.reset({
        companyId: isSuperAdmin ? "" : (user?.companyId || ""),
        name: "",
        code: "",
        daysPerYear: 12,
        carryForward: false,
        maxCarryForward: 0,
        description: "",
        status: "active",
      });
    }
    setIsLeaveTypeOpen(true);
  };

  const createLeaveTypeMutation = useMutation({
    mutationFn: async (data: LeaveTypeFormValues) => {
      return apiRequest("POST", "/api/leave-types", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-types"] });
      setIsLeaveTypeOpen(false);
      toast({ title: "Leave Type Created", description: "New leave type has been added." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateLeaveTypeMutation = useMutation({
    mutationFn: async (data: LeaveTypeFormValues & { id: string }) => {
      const { id, ...rest } = data;
      return apiRequest("PATCH", `/api/leave-types/${id}`, rest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-types"] });
      setIsLeaveTypeOpen(false);
      setEditingLeaveType(null);
      toast({ title: "Leave Type Updated", description: "Leave type has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteLeaveTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/leave-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-types"] });
      toast({ title: "Leave Type Deleted", description: "Leave type has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onLeaveTypeSubmit = (data: LeaveTypeFormValues) => {
    if (editingLeaveType) {
      updateLeaveTypeMutation.mutate({ ...data, id: editingLeaveType.id });
    } else {
      createLeaveTypeMutation.mutate(data);
    }
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

  const getLeaveTypeName = (leaveTypeId: string) => {
    const leaveType = leaveTypes.find(lt => lt.id === leaveTypeId);
    return leaveType?.name || "Unknown";
  };

  const pendingCount = leaveRequests.filter(r => r.status === "pending").length;
  const approvedCount = leaveRequests.filter(r => r.status === "approved").length;
  const rejectedCount = leaveRequests.filter(r => r.status === "rejected").length;

  return (
    <div className="p-6" data-testid="leave-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Leave Management</h1>
          <p className="text-muted-foreground">Manage employee leave requests and approvals</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-leave">
              <Plus className="h-4 w-4 mr-2" />
              Apply Leave
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apply for Leave</DialogTitle>
              <DialogDescription>Submit a new leave request</DialogDescription>
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
                            <SelectTrigger data-testid="select-leave-company">
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
                {isEmployee ? (
                  <div className="space-y-2">
                    <FormLabel>Employee</FormLabel>
                    <p className="text-sm font-medium">
                      {myEmployee ? `[${myEmployee.employeeCode}] ${myEmployee.firstName} ${myEmployee.lastName}` : "Loading..."}
                    </p>
                  </div>
                ) : (
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
                          data-testid="select-leave-employee"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="leaveTypeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Leave Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-leave-type">
                            <SelectValue placeholder="Select leave type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {leaveTypes.map((lt) => (
                            <SelectItem key={lt.id} value={lt.id}>
                              {lt.name} ({lt.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              const days = calculateDays(e.target.value, form.getValues("endDate"));
                              form.setValue("days", days);
                            }}
                            data-testid="input-leave-start" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              const days = calculateDays(form.getValues("startDate"), e.target.value);
                              form.setValue("days", days);
                            }}
                            data-testid="input-leave-end" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number of Days</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} readOnly data-testid="input-leave-days" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Reason for leave..." {...field} data-testid="input-leave-reason" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-leave">
                    {createMutation.isPending ? "Submitting..." : "Submit Request"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leaveRequests.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <Check className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <X className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="mb-4">
          <TabsTrigger value="requests" data-testid="tab-requests">Leave Requests</TabsTrigger>
          {isAdmin && <TabsTrigger value="types" data-testid="tab-types">Leave Types</TabsTrigger>}
        </TabsList>

        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
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
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No leave requests</h3>
                  <p className="text-muted-foreground">No leave requests found</p>
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
                        <TableCell>
                          {format(parseISO(request.startDate), "MMM d")} - {format(parseISO(request.endDate), "MMM d, yyyy")}
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
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 hover:text-green-700"
                                onClick={() => approveMutation.mutate({ id: request.id, status: "approved" })}
                                disabled={approveMutation.isPending}
                                data-testid={`button-approve-${request.id}`}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => approveMutation.mutate({ id: request.id, status: "rejected" })}
                                disabled={approveMutation.isPending}
                                data-testid={`button-reject-${request.id}`}
                              >
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

        {isAdmin && <TabsContent value="types">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Leave Types</CardTitle>
                  <CardDescription>Configure leave types and their policies</CardDescription>
                </div>
                <Button onClick={() => openLeaveTypeDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Leave Type
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
                  {leaveTypes.map((leaveType) => (
                    <TableRow key={leaveType.id} data-testid={`row-type-${leaveType.id}`}>
                      <TableCell className="font-medium">{leaveType.name}</TableCell>
                      <TableCell><Badge variant="outline">{leaveType.code}</Badge></TableCell>
                      <TableCell>{leaveType.daysPerYear}</TableCell>
                      <TableCell>
                        {leaveType.carryForward ? (
                          <span className="text-green-600">Yes (Max: {leaveType.maxCarryForward})</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                        {leaveType.description || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={leaveType.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {leaveType.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => openLeaveTypeDialog(leaveType)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this leave type?")) {
                                deleteLeaveTypeMutation.mutate(leaveType.id);
                              }
                            }}
                            disabled={deleteLeaveTypeMutation.isPending}
                          >
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
        </TabsContent>}
      </Tabs>

      <Dialog open={isLeaveTypeOpen} onOpenChange={(open) => { setIsLeaveTypeOpen(open); if (!open) setEditingLeaveType(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLeaveType ? "Edit Leave Type" : "Add Leave Type"}</DialogTitle>
            <DialogDescription>{editingLeaveType ? "Update leave type policy" : "Create a new leave type and its policy"}</DialogDescription>
          </DialogHeader>
          <Form {...leaveTypeForm}>
            <form onSubmit={leaveTypeForm.handleSubmit(onLeaveTypeSubmit)} className="space-y-4">
              {isSuperAdmin && (
                <FormField
                  control={leaveTypeForm.control}
                  name="companyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <Select value={field.value || ""} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select company (optional for global)" />
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
              )}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={leaveTypeForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Casual Leave" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={leaveTypeForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. CL" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={leaveTypeForm.control}
                name="daysPerYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Days Per Year</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4 items-end">
                <FormField
                  control={leaveTypeForm.control}
                  name="carryForward"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel>Allow Carry Forward</FormLabel>
                    </FormItem>
                  )}
                />
                {leaveTypeForm.watch("carryForward") && (
                  <FormField
                    control={leaveTypeForm.control}
                    name="maxCarryForward"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Carry Forward Days</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <FormField
                control={leaveTypeForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Leave type description..." {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={leaveTypeForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={createLeaveTypeMutation.isPending || updateLeaveTypeMutation.isPending}>
                  {(createLeaveTypeMutation.isPending || updateLeaveTypeMutation.isPending) ? "Saving..." : (editingLeaveType ? "Update" : "Create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
