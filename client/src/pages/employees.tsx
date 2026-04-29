import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSort, sortData } from "@/lib/use-sort";
import { SortableHead } from "@/components/sortable-head";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Search, 
  Users, 
  Edit, 
  Trash2,
  LogOut,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  Loader2,
  Upload,
  Download,
  FileSpreadsheet,
  KeyRound,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Checkbox } from "@/components/ui/checkbox";
import type { Employee, Company, TimeOfficePolicy, ContractorEmployee, ContractorMaster } from "@shared/schema";

// ─── Bulk-update field definitions ────────────────────────────────────────────
const BULK_UPDATE_GROUPS: { group: string; fields: { label: string; hint?: string }[] }[] = [
  {
    group: "Personal",
    fields: [
      { label: "Father / Husband Name" },
      { label: "Gender", hint: "Male / Female / Other" },
      { label: "Date of Birth", hint: "YYYY-MM-DD" },
      { label: "Mobile Number" },
    ],
  },
  {
    group: "Job Info",
    fields: [
      { label: "Date of Joining", hint: "YYYY-MM-DD" },
      { label: "Department" },
      { label: "Designation" },
      { label: "Employment Type", hint: "permanent / contractual / daily_wage" },
      { label: "Payment Mode", hint: "bank / cash / cheque" },
    ],
  },
  {
    group: "Compliance",
    fields: [
      { label: "UAN" },
      { label: "ESI Number" },
      { label: "PT State" },
      { label: "PF Applicable", hint: "Yes / No" },
      { label: "ESI Applicable", hint: "Yes / No" },
      { label: "LWF Applicable", hint: "Yes / No" },
    ],
  },
  {
    group: "Banking & ID",
    fields: [
      { label: "Bank Account" },
      { label: "IFSC Code" },
      { label: "PAN" },
      { label: "Aadhaar" },
    ],
  },
];

function EmployeesTableSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

const EXIT_TYPES = [
  { value: "resignation", label: "Resignation" },
  { value: "termination", label: "Termination" },
  { value: "retirement", label: "Retirement" },
  { value: "absconding", label: "Absconding" },
  { value: "end_of_contract", label: "End of Contract" },
  { value: "death", label: "Death" },
  { value: "other", label: "Other" },
];

type AadhaarVerifyResult = {
  status: "not_found" | "active_same_company" | "exited_same_company" | "other_company";
  message: string;
  employee?: Employee;
  employeeInfo?: Record<string, any>;
};

export default function Employees() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [selectedCompany, setSelectedCompany] = useState<string>(
    isSuperAdmin ? "__all__" : (user?.companyId || "")
  );
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [exitDate, setExitDate] = useState("");
  const [exitType, setExitType] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Bulk Update state
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkUpdateFields, setBulkUpdateFields] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkUpdateResult, setBulkUpdateResult] = useState<{ updated: number; skipped: number; errors: string[] } | null>(null);
  const bulkUpdateFileRef = useRef<HTMLInputElement | null>(null);

  const [aadhaarDialogOpen, setAadhaarDialogOpen] = useState(false);
  const [aadhaarInput, setAadhaarInput] = useState("");
  const [aadhaarCompanyId, setAadhaarCompanyId] = useState("");
  const [aadhaarVerifying, setAadhaarVerifying] = useState(false);
  const [aadhaarResult, setAadhaarResult] = useState<AadhaarVerifyResult | null>(null);

  const [createLoginOpen, setCreateLoginOpen] = useState(false);
  const [createLoginEmployee, setCreateLoginEmployee] = useState<Employee | null>(null);
  const [createLoginUsername, setCreateLoginUsername] = useState("");
  const [createLoginPassword, setCreateLoginPassword] = useState("");

  const [linkedAccountOpen, setLinkedAccountOpen] = useState(false);
  const [linkedAccountEmployee, setLinkedAccountEmployee] = useState<Employee | null>(null);

  // Contractor company filter: "own" | "c:<companyId>:<contractorId>" | "pe:<peCompanyId>:<currentCompanyId>"
  const [contractorFilter, setContractorFilter] = useState("own");

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: contractorMasterList = [] } = useQuery<ContractorMaster[]>({
    queryKey: ["/api/contractor-masters"],
  });

  // Contractors and principal employers for company admin filter dropdown
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

  // Parse filter value to determine tagged employee API params
  const filterParts = contractorFilter.split(":");
  const filterType = filterParts[0]; // "own" | "c" | "pe"
  const filterCompanyId = filterParts[1] || "";
  const filterContractorId = filterParts[2] || "";
  const isContractorView = filterType !== "own";

  const { data: taggedEmployeeRecords = [] } = useQuery<ContractorEmployee[]>({
    queryKey: ["/api/companies", filterCompanyId, "contractors", filterContractorId, "employees"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${filterCompanyId}/contractors/${filterContractorId}/employees`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isContractorView && !!filterCompanyId && !!filterContractorId,
  });

  // The API returns merged Employee objects (id = employee UUID, employeeId is not in the response).
  const taggedEmployeeIds = new Set(taggedEmployeeRecords.map((r) => (r as any).id ?? r.employeeId));

  // When a CONTRACTOR is selected, tagged employees belong to the contractor company —
  // they won't be in the current company's employee list, so fetch them separately.
  const contractorCompanyId = filterType === "c" ? filterContractorId : "";
  const { data: contractorCompanyEmployees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/companies", contractorCompanyId, "employees"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${contractorCompanyId}/employees`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: filterType === "c" && !!contractorCompanyId,
  });

  const { data: timeOfficePolicies = [] } = useQuery<TimeOfficePolicy[]>({
    queryKey: ["/api/time-office-policies"],
    queryFn: async () => {
      const res = await fetch("/api/time-office-policies", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch policies");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/employees/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Employee Deleted",
        description: "The employee has been successfully deleted.",
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

  const exitMutation = useMutation({
    mutationFn: async ({ id, exitDate, exitType, exitReason }: { id: string; exitDate: string; exitType: string; exitReason: string }) => {
      const res = await apiRequest("POST", `/api/employees/${id}/exit`, { exitDate, exitType, exitReason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Employee Exited",
        description: "The employee has been marked as exited successfully.",
      });
      setExitDialogOpen(false);
      resetExitForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createLoginMutation = useMutation({
    mutationFn: async ({ id, username, password }: { id: string; username: string; password: string }) => {
      const res = await apiRequest("POST", `/api/employees/${id}/create-login`, { username, password });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Login Created", description: `Account "${data.username}" created and linked to the employee.` });
      setCreateLoginOpen(false);
      setCreateLoginEmployee(null);
      setCreateLoginUsername("");
      setCreateLoginPassword("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const unlinkLoginMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/employees/${id}/unlink-login`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Account Unlinked", description: "The login account has been unlinked from this employee." });
      setLinkedAccountOpen(false);
      setLinkedAccountEmployee(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const reinstateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/employees/${id}/reinstate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Employee Reinstated",
        description: "The employee has been reinstated successfully.",
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

  const resetExitForm = () => {
    setSelectedEmployee(null);
    setExitDate("");
    setExitType("");
    setExitReason("");
  };

  const openExitDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setExitDate(new Date().toISOString().split("T")[0]);
    setExitDialogOpen(true);
  };

  const handleExitSubmit = () => {
    if (!selectedEmployee || !exitDate || !exitType) return;
    exitMutation.mutate({
      id: selectedEmployee.id,
      exitDate,
      exitType,
      exitReason,
    });
  };

  // Pick the right employee pool depending on the active filter
  // - Contractor view: employees belong to the contractor company (separate fetch)
  // - PE view: tagged employees are from the current company (main list)
  // - Own / super-admin: normal main list
  const baseEmployeeList: Employee[] =
    filterType === "c" ? contractorCompanyEmployees : employees;

  const filteredEmployees = baseEmployeeList.filter((employee) => {
    let matchesCompany: boolean;
    if (isContractorView) {
      // Show only employees that are tagged for this contractor/PE relationship
      matchesCompany = taggedEmployeeIds.has(employee.id);
    } else if (isSuperAdmin) {
      matchesCompany = selectedCompany === "__all__" || employee.companyId === selectedCompany;
    } else {
      matchesCompany = employee.companyId === (user?.companyId || "");
    }
    const matchesSearch =
      `${employee.firstName} ${employee.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      employee.employeeCode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || employee.status === statusFilter;
    return matchesCompany && matchesSearch && matchesStatus;
  });

  const getContractorName = (contractorMasterId: string | null) => {
    if (!contractorMasterId) return null;
    return contractorMasterList.find(c => c.id === contractorMasterId)?.contractorName || null;
  };

  const { sort: empSort, toggle: toggleEmpSort } = useSort("name");
  const sortedEmployees = sortData(filteredEmployees, empSort, (e, col) => {
    if (col === "name") return `${e.firstName} ${e.lastName}`;
    if (col === "company") return getCompanyName(e.companyId);
    if (col === "department") return e.department || "";
    if (col === "designation") return e.designation || "";
    if (col === "contractor") return getContractorName(e.contractorMasterId) || "On Roll";
    if (col === "status") return e.status;
    return "";
  });

  const getCompanyName = (companyId: string) => {
    const company = companies.find((c) => c.id === companyId);
    return company?.companyName || "Unknown";
  };

  const getPolicyName = (policyId: string | null) => {
    if (!policyId) return null;
    const policy = timeOfficePolicies.find((p) => p.id === policyId);
    return policy?.policyName || null;
  };

  const getExitTypeLabel = (exitType: string | null) => {
    if (!exitType) return "";
    const found = EXIT_TYPES.find((t) => t.value === exitType);
    return found?.label || exitType;
  };

  const handleDownloadTemplate = () => {
    window.open("/api/employees/bulk-template", "_blank");
  };

  const handleBulkUpload = async (file: File) => {
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const effectiveCompanyId = isSuperAdmin
        ? (selectedCompany === "__all__" ? "" : selectedCompany)
        : user?.companyId || "";
      if (!effectiveCompanyId) {
        toast({ title: "Select a Company", description: "Please select a company before uploading.", variant: "destructive" });
        setBulkUploading(false);
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", effectiveCompanyId);
      const res = await fetch("/api/employees/bulk-upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Upload Failed", description: result.error || "Failed to process file", variant: "destructive" });
        setBulkUploading(false);
        return;
      }
      setBulkResult(result);
      if (result.created > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      }
      toast({
        title: "Upload Complete",
        description: `${result.created} employees created, ${result.skipped} skipped`,
        variant: result.created > 0 ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Upload failed", variant: "destructive" });
    }
    setBulkUploading(false);
  };

  // ── Bulk-Update handlers ────────────────────────────────────────────────────
  const toggleBulkUpdateField = (label: string) => {
    setBulkUpdateFields(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const toggleBulkUpdateGroup = (labels: string[]) => {
    const allSelected = labels.every(l => bulkUpdateFields.has(l));
    setBulkUpdateFields(prev => {
      const next = new Set(prev);
      if (allSelected) { labels.forEach(l => next.delete(l)); }
      else { labels.forEach(l => next.add(l)); }
      return next;
    });
  };

  const handleDownloadUpdateTemplate = async () => {
    if (bulkUpdateFields.size === 0) {
      toast({ title: "No fields selected", description: "Select at least one field to include in the template.", variant: "destructive" });
      return;
    }
    const effectiveCompanyId = isSuperAdmin
      ? (selectedCompany === "__all__" ? "" : selectedCompany)
      : user?.companyId || "";
    if (!effectiveCompanyId) {
      toast({ title: "Select a Company", description: "Choose a specific company before downloading the update template.", variant: "destructive" });
      return;
    }
    const fieldsParam = encodeURIComponent(Array.from(bulkUpdateFields).join(","));
    window.open(`/api/employees/bulk-update-template?fields=${fieldsParam}&companyId=${effectiveCompanyId}`, "_blank");
  };

  const handleBulkUpdate = async (file: File) => {
    setBulkUpdating(true);
    setBulkUpdateResult(null);
    try {
      const effectiveCompanyId = isSuperAdmin
        ? (selectedCompany === "__all__" ? "" : selectedCompany)
        : user?.companyId || "";
      if (!effectiveCompanyId) {
        toast({ title: "Select a Company", description: "Choose a specific company before uploading.", variant: "destructive" });
        setBulkUpdating(false);
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", effectiveCompanyId);
      const res = await fetch("/api/employees/bulk-update", { method: "POST", body: formData, credentials: "include" });
      const result = await res.json();
      if (!res.ok) {
        toast({ title: "Update Failed", description: result.error || "Failed to process file", variant: "destructive" });
        setBulkUpdating(false);
        return;
      }
      setBulkUpdateResult(result);
      if (result.updated > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      }
      toast({
        title: "Bulk Update Complete",
        description: `${result.updated} employees updated, ${result.skipped} skipped`,
        variant: result.updated > 0 ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Upload failed", variant: "destructive" });
    }
    setBulkUpdating(false);
  };
  // ────────────────────────────────────────────────────────────────────────────

  const openAadhaarDialog = () => {
    setAadhaarInput("");
    setAadhaarCompanyId(isSuperAdmin ? "" : (user?.companyId || ""));
    setAadhaarResult(null);
    setAadhaarVerifying(false);
    setAadhaarDialogOpen(true);
  };

  const handleAadhaarVerify = async () => {
    const clean = aadhaarInput.replace(/\s/g, "");
    if (clean.length !== 12 || !/^\d{12}$/.test(clean)) {
      toast({ title: "Invalid Aadhaar", description: "Please enter a valid 12-digit Aadhaar number.", variant: "destructive" });
      return;
    }

    const targetCompany = isSuperAdmin ? aadhaarCompanyId : user?.companyId;
    if (!targetCompany) {
      toast({ title: "Company Required", description: "Please select a company first.", variant: "destructive" });
      return;
    }

    setAadhaarVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/employees/verify-aadhaar", { aadhaar: clean, companyId: targetCompany });
      const data: AadhaarVerifyResult = await res.json();
      setAadhaarResult(data);

      if (data.status === "not_found") {
        setAadhaarDialogOpen(false);
        setLocation(`/employees/new?aadhaar=${clean}${isSuperAdmin ? `&companyId=${targetCompany}` : ""}`);
      }
    } catch (error: any) {
      toast({ title: "Verification Failed", description: error.message || "Could not verify Aadhaar", variant: "destructive" });
    } finally {
      setAadhaarVerifying(false);
    }
  };

  const handleRejoin = async () => {
    if (!aadhaarResult?.employee) return;
    const emp = aadhaarResult.employee;
    try {
      await apiRequest("POST", `/api/employees/${emp.id}/reinstate`);
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Employee Reinstated", description: `${[emp.firstName, emp.lastName].filter(Boolean).join(" ").trim()} has been reinstated.` });
      setAadhaarDialogOpen(false);
      setLocation(`/employees/${emp.id}/edit`);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to reinstate employee", variant: "destructive" });
    }
  };

  const handleProceedWithOtherCompanyInfo = () => {
    if (!aadhaarResult?.employeeInfo) return;
    const info = aadhaarResult.employeeInfo;
    const clean = aadhaarInput.replace(/\s/g, "");
    const targetCompany = isSuperAdmin ? aadhaarCompanyId : user?.companyId;
    const params = new URLSearchParams();
    params.set("aadhaar", clean);
    if (targetCompany) params.set("companyId", targetCompany);
    if (info.firstName) params.set("firstName", info.firstName);
    if (info.lastName) params.set("lastName", info.lastName);
    if (info.gender) params.set("gender", info.gender);
    if (info.dateOfBirth) params.set("dateOfBirth", info.dateOfBirth);
    if (info.mobileNumber) params.set("mobileNumber", info.mobileNumber);
    if (info.officialEmail) params.set("officialEmail", info.officialEmail);
    if (info.pan) params.set("pan", info.pan);
    if (info.bankAccount) params.set("bankAccount", info.bankAccount);
    if (info.ifsc) params.set("ifsc", info.ifsc);
    setAadhaarDialogOpen(false);
    setLocation(`/employees/new?${params.toString()}`);
  };

  return (
    <div className="p-6" data-testid="employees-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-muted-foreground">Manage your workforce</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => { setBulkUploadOpen(true); setBulkResult(null); }}
            disabled={companies.length === 0 || (isSuperAdmin && selectedCompany === "__all__")}
            title={isSuperAdmin && selectedCompany === "__all__" ? "Select a company first to bulk upload" : undefined}
          >
            <Upload className="h-4 w-4 mr-2" />
            Bulk Upload
          </Button>
          <Button
            variant="outline"
            onClick={() => { setBulkUpdateOpen(true); setBulkUpdateResult(null); setBulkUpdateFields(new Set()); }}
            disabled={companies.length === 0 || (isSuperAdmin && selectedCompany === "__all__")}
            title={isSuperAdmin && selectedCompany === "__all__" ? "Select a company first to bulk update" : undefined}
            data-testid="button-bulk-update"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Bulk Update
          </Button>
          <Button 
            onClick={openAadhaarDialog}
            data-testid="button-add-employee" 
            disabled={companies.length === 0}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Employee
          </Button>
        </div>
      </div>

      {companies.length === 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardContent className="p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              You need to create a company first before adding employees.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            {isSuperAdmin && (
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="w-52" data-testid="select-company-filter">
                  <SelectValue placeholder="All Companies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Companies</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {!isSuperAdmin && (myContractors.length > 0 || myPrincipalEmployers.length > 0) && (
              <Select value={contractorFilter} onValueChange={setContractorFilter}>
                <SelectTrigger className="w-56" data-testid="select-contractor-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">Own Employees</SelectItem>
                  {myContractors.map((c) => (
                    <SelectItem key={c.id} value={`c:${c.companyId}:${c.contractorId}`}>
                      Contractor: {c.contractorName}
                    </SelectItem>
                  ))}
                  {myPrincipalEmployers.map((pe) => (
                    <SelectItem key={pe.id} value={`pe:${pe.companyId}:${pe.contractorId}`}>
                      PE: {pe.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employees..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-employees"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Exited</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="text-xs whitespace-nowrap">
              {filteredEmployees.length} employees
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <EmployeesTableSkeleton />
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No employees found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "Try adjusting your search" : "Get started by adding your first employee"}
              </p>
              {!searchQuery && companies.length > 0 && (
                <Button onClick={openAadhaarDialog} data-testid="button-add-first-employee">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Employee
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">Sr.</TableHead>
                    <TableHead className="w-24">Emp. ID</TableHead>
                    <SortableHead col="name" sort={empSort} onToggle={toggleEmpSort}>Name</SortableHead>
                    <SortableHead col="contractor" sort={empSort} onToggle={toggleEmpSort}>Contractor</SortableHead>
                    <SortableHead col="department" sort={empSort} onToggle={toggleEmpSort}>Department</SortableHead>
                    <SortableHead col="designation" sort={empSort} onToggle={toggleEmpSort}>Designation</SortableHead>
                    <TableHead>Time Policy</TableHead>
                    <SortableHead col="status" sort={empSort} onToggle={toggleEmpSort}>Status</SortableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEmployees.map((employee, idx) => (
                    <TableRow key={employee.id} data-testid={`employee-row-${employee.id}`} className={employee.status === "inactive" ? "opacity-75" : ""}>
                      <TableCell className="text-center text-muted-foreground font-medium text-sm">{idx + 1}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-semibold text-primary">{employee.employeeCode}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className={employee.status === "inactive" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}>
                              {[employee.firstName, employee.lastName].filter(Boolean).join(" ").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">
                              {[employee.firstName, employee.lastName].filter(Boolean).join(" ").trim()}
                            </div>
                            {employee.exitDate && (
                              <div className="text-xs text-red-500">
                                Exit: {employee.exitDate} ({getExitTypeLabel(employee.exitType)})
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getContractorName(employee.contractorMasterId)
                          ? <span className="text-xs font-medium">{getContractorName(employee.contractorMasterId)}</span>
                          : <span className="text-xs text-muted-foreground">On Roll</span>}
                      </TableCell>
                      <TableCell>
                        {employee.department || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {employee.designation || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {getPolicyName(employee.timeOfficePolicyId) || <span className="text-muted-foreground text-xs">Default</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={employee.status === "active" ? "default" : "destructive"}>
                          {employee.status === "inactive" ? "Exited" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setLocation(`/employees/${employee.id}/edit`)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {employee.status === "active" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openExitDialog(employee)}
                              title="Mark Exit"
                              className="text-orange-600 hover:text-orange-700"
                            >
                              <LogOut className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Are you sure you want to reinstate this employee?")) {
                                  reinstateMutation.mutate(employee.id);
                                }
                              }}
                              title="Reinstate"
                              className="text-green-600 hover:text-green-700"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title={(employee as any).userId ? "View / unlink login account" : "Create login account"}
                            className={(employee as any).userId ? "text-green-600 hover:text-green-700" : "text-blue-600 hover:text-blue-700"}
                            onClick={() => {
                              if ((employee as any).userId) {
                                setLinkedAccountEmployee(employee);
                                setLinkedAccountOpen(true);
                              } else {
                                setCreateLoginEmployee(employee);
                                setCreateLoginUsername((employee as any).mobileNumber || "");
                                const dob = (employee as any).dateOfBirth;
                                if (dob) {
                                  const [y, m, d] = dob.split("-");
                                  setCreateLoginPassword(`${d}${m}${y}`);
                                } else {
                                  setCreateLoginPassword("");
                                }
                                setCreateLoginOpen(true);
                              }
                            }}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this employee?")) {
                                deleteMutation.mutate(employee.id);
                              }
                            }}
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

      <Dialog open={exitDialogOpen} onOpenChange={(open) => { setExitDialogOpen(open); if (!open) resetExitForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Employee Exit</DialogTitle>
            <DialogDescription>
              {selectedEmployee && `Mark ${[selectedEmployee.firstName, selectedEmployee.lastName].filter(Boolean).join(" ").trim()} (${selectedEmployee.employeeCode}) as exited.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="exitType">Exit Type *</Label>
              <Select value={exitType} onValueChange={setExitType}>
                <SelectTrigger id="exitType">
                  <SelectValue placeholder="Select exit type" />
                </SelectTrigger>
                <SelectContent>
                  {EXIT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exitDate">Date of Leaving *</Label>
              <Input
                id="exitDate"
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exitReason">Reason / Remarks</Label>
              <Textarea
                id="exitReason"
                value={exitReason}
                onChange={(e) => setExitReason(e.target.value)}
                placeholder="Enter reason for exit..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setExitDialogOpen(false); resetExitForm(); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleExitSubmit}
              disabled={!exitDate || !exitType || exitMutation.isPending}
            >
              {exitMutation.isPending ? "Processing..." : "Confirm Exit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aadhaarDialogOpen} onOpenChange={(open) => { if (!open) { setAadhaarDialogOpen(false); setAadhaarResult(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Aadhaar Verification
            </DialogTitle>
            <DialogDescription>
              Enter the Aadhaar number to verify before adding a new employee.
            </DialogDescription>
          </DialogHeader>

          {!aadhaarResult && (
            <div className="space-y-4 py-4">
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label>Company *</Label>
                  <Select value={aadhaarCompanyId} onValueChange={setAadhaarCompanyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Aadhaar Number *</Label>
                <Input
                  placeholder="Enter 12-digit Aadhaar number"
                  value={aadhaarInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^\d]/g, "").slice(0, 12);
                    setAadhaarInput(val);
                  }}
                  maxLength={12}
                  data-testid="input-aadhaar-verify"
                />
                <p className="text-xs text-muted-foreground">
                  {aadhaarInput.replace(/\s/g, "").length}/12 digits
                </p>
              </div>
            </div>
          )}

          {aadhaarResult && aadhaarResult.status === "active_same_company" && (
            <div className="py-4 space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-200">Employee Already Added</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{aadhaarResult.message}</p>
                </div>
              </div>
            </div>
          )}

          {aadhaarResult && aadhaarResult.status === "exited_same_company" && (
            <div className="py-4 space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                <UserCheck className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">Previous Employee Found</p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">{aadhaarResult.message}</p>
                </div>
              </div>
            </div>
          )}

          {aadhaarResult && aadhaarResult.status === "other_company" && (
            <div className="py-4 space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                <UserCheck className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-blue-800 dark:text-blue-200">Employee Found in Another Company</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">{aadhaarResult.message}</p>
                  {aadhaarResult.employeeInfo && (
                    <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                      <p>Name: {[aadhaarResult.employeeInfo.firstName, aadhaarResult.employeeInfo.lastName].filter(Boolean).join(" ").trim()}</p>
                      {aadhaarResult.employeeInfo.mobileNumber && <p>Mobile: {aadhaarResult.employeeInfo.mobileNumber}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {!aadhaarResult && (
              <>
                <Button variant="outline" onClick={() => setAadhaarDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAadhaarVerify}
                  disabled={aadhaarVerifying || aadhaarInput.length !== 12 || (isSuperAdmin && !aadhaarCompanyId)}
                >
                  {aadhaarVerifying ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Verify & Proceed
                    </>
                  )}
                </Button>
              </>
            )}

            {aadhaarResult && aadhaarResult.status === "active_same_company" && (
              <Button variant="outline" onClick={() => { setAadhaarDialogOpen(false); setAadhaarResult(null); }}>
                Close
              </Button>
            )}

            {aadhaarResult && aadhaarResult.status === "exited_same_company" && (
              <>
                <Button variant="outline" onClick={() => { setAadhaarDialogOpen(false); setAadhaarResult(null); }}>
                  No
                </Button>
                <Button onClick={handleRejoin}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Yes, Rejoin
                </Button>
              </>
            )}

            {aadhaarResult && aadhaarResult.status === "other_company" && (
              <>
                <Button variant="outline" onClick={() => { setAadhaarDialogOpen(false); setAadhaarResult(null); }}>
                  Cancel
                </Button>
                <Button onClick={handleProceedWithOtherCompanyInfo}>
                  <Plus className="h-4 w-4 mr-2" />
                  Proceed with Info
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkUploadOpen} onOpenChange={setBulkUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Bulk Employee Upload
            </DialogTitle>
            <DialogDescription>
              Upload an Excel file to register multiple employees at once.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Required / optional column guide */}
            <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground mb-1">Required columns (marked * in template)</p>
              <div className="flex flex-wrap gap-1">
                {["Employee Code *", "Full Name *", "Date of Joining *"].map(c => (
                  <span key={c} className="bg-primary/10 text-primary rounded px-2 py-0.5 font-mono">{c}</span>
                ))}
              </div>
              <p className="font-semibold text-foreground mt-2 mb-1">Optional columns</p>
              <div className="flex flex-wrap gap-1 text-muted-foreground">
                {["Father / Husband Name","Gender","Date of Birth","Mobile Number","UAN","ESI Number","Bank Account","IFSC","PAN","Aadhaar"].map(c => (
                  <span key={c} className="bg-muted rounded px-1.5 py-0.5 font-mono">{c}</span>
                ))}
              </div>
              <p className="text-muted-foreground mt-1">PF, ESIC & LWF are set automatically. Date format: <span className="font-mono">DD-MM-YYYY</span>.</p>
            </div>

            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
              <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">
                Download the template, fill in employee data, then upload
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBulkUpload(file);
                  e.target.value = "";
                }}
              />
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={bulkUploading}
                >
                  {bulkUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Select File
                    </>
                  )}
                </Button>
              </div>
            </div>

            {bulkResult && (
              <div className="space-y-3">
                <div className="flex gap-4">
                  <div className="flex-1 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">{bulkResult.created}</p>
                    <p className="text-xs text-green-600 dark:text-green-500">Created</p>
                  </div>
                  <div className="flex-1 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{bulkResult.skipped}</p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-500">Skipped</p>
                  </div>
                </div>
                {bulkResult.errors.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">Issues Found:</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {bulkResult.errors.map((err, i) => (
                        <p key={i} className="text-xs text-red-700 dark:text-red-400">{err}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkUploadOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Update Dialog ──────────────────────────────────────────────── */}
      <Dialog open={bulkUpdateOpen} onOpenChange={(open) => { setBulkUpdateOpen(open); if (!open) setBulkUpdateResult(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              Bulk Update Employee Details
            </DialogTitle>
            <DialogDescription>
              Select which fields to update, download the pre-filled template, edit values, then upload.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Step 1: Field selector */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                Select fields to include in the template
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {BULK_UPDATE_GROUPS.map(({ group, fields }) => {
                  const labels = fields.map(f => f.label);
                  const allChecked = labels.every(l => bulkUpdateFields.has(l));
                  const someChecked = labels.some(l => bulkUpdateFields.has(l));
                  return (
                    <div key={group} className="space-y-2">
                      <div className="flex items-center gap-2 pb-1 border-b">
                        <Checkbox
                          id={`group-${group}`}
                          checked={allChecked}
                          data-state={someChecked && !allChecked ? "indeterminate" : undefined}
                          onCheckedChange={() => toggleBulkUpdateGroup(labels)}
                        />
                        <label htmlFor={`group-${group}`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none">
                          {group}
                        </label>
                      </div>
                      {fields.map(({ label, hint }) => (
                        <div key={label} className="flex items-start gap-2 pl-1">
                          <Checkbox
                            id={`field-${label}`}
                            checked={bulkUpdateFields.has(label)}
                            onCheckedChange={() => toggleBulkUpdateField(label)}
                          />
                          <div>
                            <label htmlFor={`field-${label}`} className="text-sm cursor-pointer select-none leading-tight">{label}</label>
                            {hint && <p className="text-[10px] text-muted-foreground font-mono">{hint}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {bulkUpdateFields.size > 0
                  ? <span className="text-primary font-medium">{bulkUpdateFields.size} field{bulkUpdateFields.size !== 1 ? "s" : ""} selected</span>
                  : "No fields selected yet"}
              </p>
            </div>

            {/* Step 2: Download template */}
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                Download pre-filled template
              </p>
              <p className="text-xs text-muted-foreground">
                The file will contain <span className="font-semibold">Employee Code</span> and <span className="font-semibold">Employee Name</span> pre-filled for all employees in the selected company, plus blank columns for each field you chose above (current values shown for reference).
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadUpdateTemplate}
                disabled={bulkUpdateFields.size === 0}
                data-testid="button-download-update-template"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Template ({bulkUpdateFields.size} {bulkUpdateFields.size === 1 ? "field" : "fields"})
              </Button>
            </div>

            {/* Step 3: Upload filled file */}
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-5 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                Upload the filled template
              </p>
              <p className="text-xs text-muted-foreground">
                Blank cells are skipped — only non-empty cells will overwrite existing values.
              </p>
              <input
                ref={bulkUpdateFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBulkUpdate(file);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                onClick={() => bulkUpdateFileRef.current?.click()}
                disabled={bulkUpdating}
                data-testid="button-upload-bulk-update"
              >
                {bulkUpdating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />Select & Upload File</>
                )}
              </Button>
            </div>

            {/* Results */}
            {bulkUpdateResult && (
              <div className="space-y-3">
                <div className="flex gap-4">
                  <div className="flex-1 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{bulkUpdateResult.updated}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500">Updated</p>
                  </div>
                  <div className="flex-1 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{bulkUpdateResult.skipped}</p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-500">Skipped</p>
                  </div>
                </div>
                {bulkUpdateResult.errors.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">Issues:</p>
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {bulkUpdateResult.errors.map((err, i) => (
                        <p key={i} className="text-xs text-red-700 dark:text-red-400">{err}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkUpdateOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─────────────────────────────────────────────────────────────────────── */}

      <Dialog open={linkedAccountOpen} onOpenChange={(open) => { setLinkedAccountOpen(open); if (!open) setLinkedAccountEmployee(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-green-600" />
              Login Account Linked
            </DialogTitle>
            <DialogDescription>
              <strong>{[linkedAccountEmployee?.firstName, linkedAccountEmployee?.lastName].filter(Boolean).join(" ").trim()}</strong> ({linkedAccountEmployee?.employeeCode}) already has a login account linked to their profile.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-3">
              <UserCheck className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-green-800">Account is active and linked</div>
                <div className="text-xs text-green-600 mt-0.5">User ID: {(linkedAccountEmployee as any)?.userId}</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              If you need to change the login credentials, go to the <strong>Users</strong> page and edit that user account directly. Use <em>Unlink</em> below only if you need to reassign this employee to a different account.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                if (linkedAccountEmployee && confirm(`Unlink the login account from ${[linkedAccountEmployee.firstName, linkedAccountEmployee.lastName].filter(Boolean).join(" ").trim()}? The user account itself will NOT be deleted.`)) {
                  unlinkLoginMutation.mutate(linkedAccountEmployee.id);
                }
              }}
              disabled={unlinkLoginMutation.isPending}
              className="sm:mr-auto"
            >
              {unlinkLoginMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Unlinking...</> : "Unlink Account"}
            </Button>
            <Button variant="outline" onClick={() => setLinkedAccountOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createLoginOpen} onOpenChange={(open) => { setCreateLoginOpen(open); if (!open) { setCreateLoginEmployee(null); setCreateLoginUsername(""); setCreateLoginPassword(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-600" />
              Create Login Account
            </DialogTitle>
            <DialogDescription>
              Create a mobile/web login for <strong>{[createLoginEmployee?.firstName, createLoginEmployee?.lastName].filter(Boolean).join(" ").trim()}</strong> ({createLoginEmployee?.employeeCode}). They can use these credentials to sign in and access attendance, payslips and leave.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Username <span className="text-muted-foreground font-normal">(Mobile Number)</span></Label>
              <Input
                value={createLoginUsername}
                onChange={(e) => setCreateLoginUsername(e.target.value)}
                placeholder="Employee mobile number"
              />
              {!(createLoginEmployee as any)?.mobileNumber && (
                <p className="text-xs text-amber-600">No mobile number on record — enter manually.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Password <span className="text-muted-foreground font-normal">(Date of Birth — ddmmyyyy)</span></Label>
              <Input
                type="text"
                value={createLoginPassword}
                onChange={(e) => setCreateLoginPassword(e.target.value)}
                placeholder="ddmmyyyy (e.g. 15011990)"
              />
              {!(createLoginEmployee as any)?.dateOfBirth && (
                <p className="text-xs text-amber-600">No date of birth on record — enter manually in ddmmyyyy format.</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Username is the employee's mobile number. Password is their date of birth in <strong>ddmmyyyy</strong> format. Share these credentials with the employee.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateLoginOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!createLoginEmployee) return;
                if (!createLoginUsername.trim()) { toast({ title: "Username required", description: "Enter the employee's mobile number.", variant: "destructive" }); return; }
                if (!createLoginPassword.trim() || createLoginPassword.trim().length < 6) { toast({ title: "Password too short", description: "Password must be at least 6 characters (ddmmyyyy = 8).", variant: "destructive" }); return; }
                createLoginMutation.mutate({ id: createLoginEmployee.id, username: createLoginUsername.trim(), password: createLoginPassword.trim() });
              }}
              disabled={createLoginMutation.isPending}
            >
              {createLoginMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : "Create Login"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
