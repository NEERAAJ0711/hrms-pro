import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Plus, 
  Search, 
  UserCircle, 
  Edit, 
  Trash2,
  ShieldCheck,
  Mail,
  Loader2,
  ClipboardList,
  CalendarDays,
  Wallet,
  Users2,
  FileBarChart2,
  BriefcaseBusiness,
  UserCog,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User, Company, UserPermission, MasterDepartment, MasterLocation, ContractorMaster } from "@shared/schema";

const MODULE_DEFINITIONS = [
  { key: "attendance",   label: "Attendance",     description: "Mark attendance, view attendance history", icon: ClipboardList,    color: "text-blue-600" },
  { key: "leave",        label: "Leave",           description: "Apply for leave, view & manage leave requests", icon: CalendarDays,     color: "text-green-600" },
  { key: "payroll",      label: "Payroll",         description: "View payslips and salary information", icon: Wallet,           color: "text-amber-600" },
  { key: "employees",    label: "Employees",       description: "View and manage the employee directory", icon: Users2,           color: "text-violet-600" },
  { key: "reports",      label: "Reports",         description: "Generate and download HR reports", icon: FileBarChart2,    color: "text-rose-600" },
  { key: "recruitment",  label: "Recruitment",     description: "Job postings and application tracking", icon: BriefcaseBusiness, color: "text-cyan-600" },
  { key: "profile",      label: "Profile",         description: "Edit personal profile and settings", icon: UserCog,          color: "text-slate-600" },
];

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  hr_admin: "HR Admin",
  recruiter: "Recruiter",
  manager: "Manager",
  employee: "Employee",
};

const roleColors: Record<string, string> = {
  super_admin: "bg-violet-500",
  company_admin: "bg-blue-500",
  hr_admin: "bg-emerald-500",
  recruiter: "bg-amber-500",
  manager: "bg-cyan-500",
  employee: "bg-slate-500",
};

const ACCESS_ROLES = ["company_admin", "hr_admin", "manager"];

const userFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["super_admin", "company_admin", "hr_admin", "recruiter", "manager", "employee"]),
  companyId: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  accessDepartments: z.array(z.string()).nullable().optional(),
  accessLocations: z.array(z.string()).nullable().optional(),
  accessContractors: z.array(z.string()).nullable().optional(),
});

const userUpdateSchema = userFormSchema.omit({ password: true }).extend({
  password: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
});

type UserFormValues = z.infer<typeof userFormSchema>;
type UserUpdateValues = z.infer<typeof userUpdateSchema>;

function AccessPicker({
  label,
  items,
  selected,
  onChange,
  testId,
}: {
  label: string;
  items: { id: string; name: string }[];
  selected: string[] | null | undefined;
  onChange: (val: string[] | null) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const isAll = !selected || selected.length === 0;

  const toggle = (id: string) => {
    const cur = selected ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onChange(next.length === 0 ? null : next);
  };

  const summary = isAll
    ? `All ${label}s`
    : selected!.length === 1
    ? items.find((i) => i.id === selected![0])?.name ?? "1 selected"
    : `${selected!.length} ${label}s selected`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent/40 transition-colors"
        data-testid={testId}
      >
        <span className={isAll ? "text-muted-foreground" : ""}>{summary}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-input bg-background p-2 max-h-44 overflow-y-auto space-y-1">
          <label className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent/40 cursor-pointer text-sm">
            <Checkbox
              checked={isAll}
              onCheckedChange={(checked) => onChange(checked ? null : [])}
              data-testid={`${testId}-all`}
            />
            <span className="font-medium">All {label}s</span>
          </label>
          <div className="border-t my-1" />
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent/40 cursor-pointer text-sm">
              <Checkbox
                checked={!isAll && (selected ?? []).includes(item.id)}
                onCheckedChange={() => toggle(item.id)}
                data-testid={`${testId}-${item.id}`}
              />
              <span>{item.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function UserForm({ 
  onSubmit, 
  defaultValues, 
  isLoading,
  companies,
  departments = [],
  locations = [],
  contractors = [],
  isEdit = false,
  submitLabel = "Create User",
  currentUserRole = ""
}: { 
  onSubmit: (data: UserFormValues | UserUpdateValues) => void; 
  defaultValues?: Partial<UserFormValues>;
  isLoading: boolean;
  companies: Company[];
  departments?: MasterDepartment[];
  locations?: MasterLocation[];
  contractors?: ContractorMaster[];
  isEdit?: boolean;
  submitLabel?: string;
  currentUserRole?: string;
}) {
  const form = useForm<UserFormValues>({
    resolver: zodResolver(isEdit ? userUpdateSchema : userFormSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      role: "employee",
      companyId: "__none__",
      status: "active",
      accessDepartments: null,
      accessLocations: null,
      accessContractors: null,
      ...defaultValues,
    },
  });

  const selectedRole = form.watch("role");
  const showAccess = ACCESS_ROLES.includes(selectedRole);

  const deptItems = departments.map((d) => ({ id: d.id, name: d.name }));
  const locItems = locations.map((l) => ({ id: l.id, name: l.name }));
  const ctItems = contractors.map((c) => ({ id: c.id, name: c.contractorName }));

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username *</FormLabel>
                <FormControl>
                  <Input placeholder="johndoe" {...field} data-testid="input-username" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email *</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="john@example.com" {...field} data-testid="input-email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isEdit ? "New Password (leave empty to keep current)" : "Password *"}</FormLabel>
              <FormControl>
                <Input 
                  type="password" 
                  placeholder={isEdit ? "Enter new password" : "Enter password"} 
                  {...field} 
                  data-testid="input-password"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {currentUserRole === "super_admin" && (
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    )}
                    <SelectItem value="company_admin">Company Admin</SelectItem>
                    <SelectItem value="hr_admin">HR Admin</SelectItem>
                    <SelectItem value="recruiter">Recruiter</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue placeholder="Select status" />
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
        </div>

        {selectedRole !== "super_admin" && (
          <FormField
            control={form.control}
            name="companyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-company">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">No company (Global access)</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {showAccess && (deptItems.length > 0 || locItems.length > 0 || ctItems.length > 0) && (
          <div className="rounded-lg border border-dashed p-4 space-y-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Data Access Scope</p>
            <p className="text-xs text-muted-foreground -mt-1">Leave as "All" to grant unrestricted access, or pick specific items.</p>

            {deptItems.length > 0 && (
              <FormField
                control={form.control}
                name="accessDepartments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Department Access</FormLabel>
                    <AccessPicker
                      label="Department"
                      items={deptItems}
                      selected={field.value}
                      onChange={field.onChange}
                      testId="access-departments"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {locItems.length > 0 && (
              <FormField
                control={form.control}
                name="accessLocations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Location Access</FormLabel>
                    <AccessPicker
                      label="Location"
                      items={locItems}
                      selected={field.value}
                      onChange={field.onChange}
                      testId="access-locations"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="accessContractors"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Contractor Access</FormLabel>
                  <AccessPicker
                    label="Contractor"
                    items={ctItems}
                    selected={field.value}
                    onChange={field.onChange}
                    testId="access-contractors"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="submit" disabled={isLoading} data-testid="button-submit-user">
            {isLoading ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function UsersTableSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null);
  const [localPerms, setLocalPerms] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    staleTime: 0,
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const companyId = currentUser?.companyId;

  const { data: departments = [] } = useQuery<MasterDepartment[]>({
    queryKey: ["/api/lookup/departments", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/lookup/departments`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: locations = [] } = useQuery<MasterLocation[]>({
    queryKey: ["/api/lookup/locations", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/lookup/locations`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: contractors = [] } = useQuery<ContractorMaster[]>({
    queryKey: ["/api/lookup/contractors", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/lookup/contractors`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: UserFormValues) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsCreateOpen(false);
      toast({
        title: "User Created",
        description: "The user has been successfully created.",
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
    mutationFn: async ({ id, data }: { id: string; data: UserUpdateValues }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingUser(null);
      toast({
        title: "User Updated",
        description: "The user has been successfully updated.",
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
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "User Deleted",
        description: "The user has been successfully deleted.",
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

  const { data: fetchedPermissions = [], isLoading: permsLoading } = useQuery<UserPermission[]>({
    queryKey: ["/api/users", permissionsUser?.id, "permissions"],
    queryFn: async () => {
      if (!permissionsUser) return [];
      const res = await apiRequest("GET", `/api/users/${permissionsUser.id}/permissions`);
      return res.json();
    },
    enabled: !!permissionsUser,
  });

  useEffect(() => {
    if (!permissionsUser) return;
    const map: Record<string, boolean> = {};
    MODULE_DEFINITIONS.forEach(m => { map[m.key] = true; });
    fetchedPermissions.forEach((p: UserPermission) => { map[p.module] = p.canAccess; });
    setLocalPerms(map);
  }, [fetchedPermissions, permissionsUser?.id]);

  const savePermsMutation = useMutation({
    mutationFn: async ({ userId, permissions }: { userId: string; permissions: { module: string; canAccess: boolean }[] }) => {
      const res = await apiRequest("PUT", `/api/users/${userId}/permissions`, { permissions });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", permissionsUser?.id, "permissions"] });
      toast({ title: "Permissions Saved", description: "User access settings have been updated." });
      setPermissionsUser(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openPermissions = (user: User) => {
    const map: Record<string, boolean> = {};
    MODULE_DEFINITIONS.forEach(m => { map[m.key] = true; });
    setLocalPerms(map);
    setPermissionsUser(user);
  };

  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCompanyName = (companyId: string | null) => {
    if (!companyId) return "Global";
    const company = companies.find((c) => c.id === companyId);
    return company?.companyName || "Unknown";
  };

  return (
    <div className="p-6" data-testid="users-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground">Manage system access and roles</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-user">
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>
                Add a new user to the system with appropriate role and permissions.
              </DialogDescription>
            </DialogHeader>
            <UserForm
              onSubmit={(data) => {
                const formData = { ...data, companyId: data.companyId === "__none__" ? null : data.companyId };
                createMutation.mutate(formData as UserFormValues);
              }}
              isLoading={createMutation.isPending}
              companies={companies}
              departments={departments}
              locations={locations}
              contractors={contractors}
              currentUserRole={currentUser?.role || ""}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-users"
              />
            </div>
            <Badge variant="secondary" className="text-xs">
              {filteredUsers.length} users
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <UsersTableSkeleton />
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <UserCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No users found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "Try adjusting your search" : "Get started by adding your first user"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsCreateOpen(true)} data-testid="button-add-first-user">
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">Sr.</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user, idx) => (
                    <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                      <TableCell className="text-center text-muted-foreground font-medium text-sm">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {(user as any).employeeName
                                ? (user as any).employeeName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
                                : user.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            {(user as any).employeeName && (
                              <div className="font-semibold text-sm">{(user as any).employeeName}</div>
                            )}
                            <div className={`font-medium ${(user as any).employeeName ? "text-xs text-muted-foreground" : ""}`}>{user.username}</div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span>{user.email}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${roleColors[user.role] || "bg-slate-500"}`} />
                          <span className="text-sm">{roleLabels[user.role] || user.role}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getCompanyName(user.companyId)}</TableCell>
                      <TableCell>
                        <Badge variant={user.status === "active" ? "default" : "secondary"}>
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingUser(user)}
                            data-testid={`button-edit-user-${user.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {user.role !== "super_admin" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Manage module access"
                              onClick={() => openPermissions(user)}
                            >
                              <ShieldCheck className="h-4 w-4 text-blue-500" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this user?")) {
                                deleteMutation.mutate(user.id);
                              }
                            }}
                            data-testid={`button-delete-user-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
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

      {/* Edit Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update the user information and permissions.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <UserForm
              onSubmit={(data) => {
                const formData = { ...data, companyId: data.companyId === "__none__" ? null : data.companyId };
                updateMutation.mutate({ id: editingUser.id, data: formData as UserUpdateValues });
              }}
              defaultValues={{
                username: editingUser.username,
                email: editingUser.email,
                password: "",
                role: editingUser.role as any,
                companyId: editingUser.companyId || "__none__",
                status: editingUser.status as "active" | "inactive",
                accessDepartments: (editingUser as any).accessDepartments ?? null,
                accessLocations: (editingUser as any).accessLocations ?? null,
                accessContractors: (editingUser as any).accessContractors ?? null,
              }}
              isLoading={updateMutation.isPending}
              companies={companies}
              departments={departments}
              locations={locations}
              contractors={contractors}
              isEdit
              submitLabel="Update User"
              currentUserRole={currentUser?.role || ""}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={!!permissionsUser} onOpenChange={(open) => { if (!open) setPermissionsUser(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-500" />
              Module Access — {permissionsUser?.username}
            </DialogTitle>
            <DialogDescription>
              Toggle which modules this user can access. Turning a module off removes access even if their role normally allows it. Turning it on grants access even if their role does not.
            </DialogDescription>
          </DialogHeader>

          {permsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1 py-2">
              {MODULE_DEFINITIONS.map((mod) => {
                const Icon = mod.icon;
                const isOn = localPerms[mod.key] !== false;
                return (
                  <div
                    key={mod.key}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-5 w-5 ${mod.color}`} />
                      <div>
                        <div className="font-medium text-sm">{mod.label}</div>
                        <div className="text-xs text-muted-foreground">{mod.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${isOn ? "text-green-600" : "text-red-500"}`}>
                        {isOn ? "Allowed" : "Revoked"}
                      </span>
                      <Switch
                        checked={isOn}
                        onCheckedChange={(checked) =>
                          setLocalPerms(prev => ({ ...prev, [mod.key]: checked }))
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsUser(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!permissionsUser) return;
                const permissions = MODULE_DEFINITIONS.map(m => ({
                  module: m.key,
                  canAccess: localPerms[m.key] !== false,
                }));
                savePermsMutation.mutate({ userId: permissionsUser.id, permissions });
              }}
              disabled={savePermsMutation.isPending}
            >
              {savePermsMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Permissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
