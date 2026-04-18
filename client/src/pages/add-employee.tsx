import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save, User, Briefcase, FileText, Building2, MapPin, Upload, Trash2, Eye, Image, FileSignature, CreditCard, FolderOpen } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation, useParams, useSearch } from "wouter";
import type { Employee, Company, MasterDepartment, MasterDesignation, MasterLocation, TimeOfficePolicy, WageGrade, StatutorySettings } from "@shared/schema";

const employeeFormSchema = z.object({
  employeeCode: z.string().min(1, "Employee code is required"),
  companyId: z.string().min(1, "Company is required"),
  fullName: z.string().min(1, "Full name is required"),
  fatherHusbandName: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  mobileNumber: z.string()
    .optional()
    .refine((v) => !v || /^\d{10}$/.test(v), { message: "Mobile number must be exactly 10 digits" }),
  officialEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  dateOfJoining: z.string().min(1, "Date of joining is required"),
  department: z.string().optional(),
  designation: z.string().optional(),
  location: z.string().optional(),
  employmentType: z.string().default("permanent"),
  status: z.enum(["active", "inactive"]).default("active"),
  grossSalary: z.coerce.number().optional(),
  paymentMode: z.string().optional(),
  pfApplicable: z.boolean().default(false),
  uan: z.string().optional(),
  esiApplicable: z.boolean().default(false),
  esiNumber: z.string().optional(),
  lwfApplicable: z.boolean().default(false),
  bonusApplicable: z.boolean().default(false),
  bonusPaidMonthly: z.boolean().default(false),
  otApplicable: z.boolean().default(false),
  otRate: z.string().default("2x"),
  bankAccount: z.string().optional(),
  ifsc: z.string().optional(),
  pan: z.string().optional(),
  aadhaar: z.string().optional(),
  timeOfficePolicyId: z.string().optional(),
  biometricDeviceId: z.string().optional(),
  wageGradeId: z.string().optional(),
  presentAddress: z.string().optional(),
  presentState: z.string().optional(),
  presentDistrict: z.string().optional(),
  presentPincode: z.string().optional(),
  permanentAddress: z.string().optional(),
  permanentState: z.string().optional(),
  permanentDistrict: z.string().optional(),
  permanentPincode: z.string().optional(),
  sameAsPresentAddress: z.boolean().optional(),
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

const employmentTypesList = ["permanent", "contract", "intern", "consultant"];

const indianStates = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu & Kashmir", "Ladakh", "Puducherry",
  "Chandigarh", "Andaman & Nicobar", "Dadra & Nagar Haveli", "Lakshadweep"
];

// ─── Document Types ─────────────────────────────────────────────────────────
const DOC_TYPES = [
  { key: "profile_photo", label: "Profile Photo",    accept: "image/*",           icon: Image,         color: "blue" },
  { key: "signature",     label: "Signature",        accept: "image/*",           icon: FileSignature, color: "purple" },
  { key: "aadhaar",       label: "Aadhaar Card",     accept: "image/*,.pdf",      icon: CreditCard,    color: "orange" },
  { key: "pan",           label: "PAN Card",         accept: "image/*,.pdf",      icon: CreditCard,    color: "green" },
  { key: "resume",        label: "Resume",           accept: ".pdf,.doc,.docx",   icon: FileText,      color: "red" },
  { key: "other",         label: "Other Document",   accept: "*",                 icon: FolderOpen,    color: "gray" },
] as const;

function DocumentsTab({ employeeId }: { employeeId: string | undefined }) {
  const { toast } = useToast();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting,  setDeleting]  = useState<string | null>(null);

  const { data: docs = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/employees", employeeId, "documents"],
    queryFn: async () => {
      const r = await fetch(`/api/employees/${employeeId}/documents`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load documents");
      return r.json();
    },
    enabled: !!employeeId,
  });

  const docMap = docs.reduce((m: Record<string, any[]>, d: any) => {
    (m[d.doc_type] = m[d.doc_type] || []).push(d); return m;
  }, {});

  const handleUpload = async (docKey: string, file: File) => {
    if (!employeeId) return;
    setUploading(docKey);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("docType", docKey);
    try {
      const r = await fetch(`/api/employees/${employeeId}/documents`, { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Upload failed"); }
      toast({ title: "Uploaded", description: `${file.name} uploaded successfully.` });
      refetch();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally { setUploading(null); }
  };

  const handleDelete = async (docId: string) => {
    if (!employeeId) return;
    setDeleting(docId);
    try {
      const r = await fetch(`/api/employees/${employeeId}/documents/${docId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Delete failed");
      toast({ title: "Deleted", description: "Document removed." });
      refetch();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally { setDeleting(null); }
  };

  if (!employeeId) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-gray-500">
          <FolderOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Save the employee first</p>
          <p className="text-sm mt-1">Documents can be uploaded after the employee record is created.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {DOC_TYPES.map(({ key, label, accept, icon: Icon }) => {
        const existing = docMap[key] || [];
        const latest = existing[0];
        const isImg = latest && latest.mime_type?.startsWith("image/");
        return (
          <Card key={key} className="flex flex-col">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Icon className="h-4 w-4 text-gray-500" /> {label}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 px-4 pb-4 gap-3">
              {/* Preview */}
              <div className="flex-1 min-h-[100px] flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200 overflow-hidden">
                {latest ? (
                  isImg ? (
                    <img src={latest.file_path} alt={label} className="max-h-[120px] max-w-full object-contain rounded" />
                  ) : (
                    <div className="text-center px-2">
                      <FileText className="h-10 w-10 mx-auto text-gray-400 mb-1" />
                      <p className="text-xs text-gray-500 break-all">{latest.file_name}</p>
                    </div>
                  )
                ) : (
                  <div className="text-center">
                    <Upload className="h-8 w-8 mx-auto text-gray-300 mb-1" />
                    <p className="text-xs text-gray-400">No file uploaded</p>
                  </div>
                )}
              </div>
              {/* Actions */}
              <div className="flex gap-2">
                <input
                  ref={el => fileRefs.current[key] = el}
                  type="file" accept={accept} className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(key, f); e.target.value = ""; }}
                />
                <Button type="button" size="sm" variant="outline" className="flex-1 h-8 text-xs"
                  onClick={() => fileRefs.current[key]?.click()}
                  disabled={uploading === key}>
                  <Upload className="h-3 w-3 mr-1" />
                  {uploading === key ? "Uploading..." : latest ? "Replace" : "Upload"}
                </Button>
                {latest && (<>
                  <Button type="button" size="sm" variant="outline" className="h-8 px-2"
                    onClick={() => window.open(latest.file_path, "_blank")}>
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-red-500 border-red-200 hover:bg-red-50"
                    disabled={deleting === latest.id}
                    onClick={() => handleDelete(latest.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>)}
              </div>
              {existing.length > 1 && (
                <p className="text-xs text-gray-400">{existing.length - 1} older version{existing.length > 2 ? "s" : ""} stored</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function AddEmployee() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const employeeId = params.id;
  const isEditing = !!employeeId;
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: masterDepartments = [] } = useQuery<MasterDepartment[]>({
    queryKey: ["/api/master-departments"],
    queryFn: async () => {
      const res = await fetch("/api/master-departments", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch departments");
      return res.json();
    },
  });

  const { data: masterDesignations = [] } = useQuery<MasterDesignation[]>({
    queryKey: ["/api/master-designations"],
    queryFn: async () => {
      const res = await fetch("/api/master-designations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch designations");
      return res.json();
    },
  });

  const { data: masterLocations = [] } = useQuery<MasterLocation[]>({
    queryKey: ["/api/master-locations"],
    queryFn: async () => {
      const res = await fetch("/api/master-locations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch locations");
      return res.json();
    },
  });

  const { data: timeOfficePolicies = [] } = useQuery<TimeOfficePolicy[]>({
    queryKey: ["/api/time-office-policies"],
    queryFn: async () => {
      const res = await fetch("/api/time-office-policies", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time office policies");
      return res.json();
    },
  });

  const { data: wageGrades = [] } = useQuery<WageGrade[]>({
    queryKey: ["/api/wage-grades"],
    queryFn: async () => {
      const res = await fetch("/api/wage-grades", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch wage grades");
      return res.json();
    },
  });

  const { data: statutorySettingsList = [] } = useQuery<StatutorySettings[]>({
    queryKey: ["/api/statutory-settings"],
    queryFn: async () => {
      const res = await fetch("/api/statutory-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch statutory settings");
      const data = await res.json();
      return Array.isArray(data) ? data : [data];
    },
  });

  const { data: existingEmployee } = useQuery<Employee>({
    queryKey: ["/api/employees", employeeId],
    enabled: isEditing,
  });

  const prefillCompanyId = searchParams.get("companyId") || "";

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      employeeCode: "",
      companyId: isSuperAdmin ? prefillCompanyId : (user?.companyId || ""),
      fullName: [searchParams.get("firstName"), searchParams.get("lastName")].filter(Boolean).join(" ") || "",
      fatherHusbandName: "",
      gender: searchParams.get("gender") || "",
      dateOfBirth: searchParams.get("dateOfBirth") || "",
      mobileNumber: searchParams.get("mobileNumber") || "",
      officialEmail: searchParams.get("officialEmail") || "",
      dateOfJoining: "",
      department: "",
      designation: "",
      location: "",
      employmentType: "permanent",
      status: "active",
      wageGradeId: "",
      pfApplicable: false,
      esiApplicable: false,
      lwfApplicable: false,
      bonusApplicable: false,
      bonusPaidMonthly: false,
      otApplicable: false,
      otRate: "2x",
      aadhaar: searchParams.get("aadhaar") || "",
      pan: searchParams.get("pan") || "",
      bankAccount: searchParams.get("bankAccount") || "",
      ifsc: searchParams.get("ifsc") || "",
      presentAddress: "",
      presentState: "",
      presentDistrict: "",
      presentPincode: "",
      permanentAddress: "",
      permanentState: "",
      permanentDistrict: "",
      permanentPincode: "",
      sameAsPresentAddress: false,
    },
  });

  const selectedCompanyId = form.watch("companyId");

  const { data: nextCodeData } = useQuery<{ nextCode: string; lastCode?: string }>({
    queryKey: ["/api/employees/next-code", selectedCompanyId],
    queryFn: async () => {
      const res = await fetch(`/api/employees/next-code?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isEditing && !!selectedCompanyId,
    staleTime: 0,
  });

  useEffect(() => {
    if (!isSuperAdmin && user?.companyId && !isEditing) {
      form.setValue("companyId", user.companyId);
    }
  }, [isSuperAdmin, user?.companyId, isEditing]);

  useEffect(() => {
    if (!isEditing && nextCodeData?.nextCode && !form.getValues("employeeCode")) {
      form.setValue("employeeCode", nextCodeData.nextCode);
    }
  }, [nextCodeData, isEditing]);

  // Reset form when editing and employee data loads
  if (isEditing && existingEmployee && form.getValues("employeeCode") !== existingEmployee.employeeCode) {
    form.reset({
      employeeCode: existingEmployee.employeeCode,
      companyId: existingEmployee.companyId,
      fullName: [existingEmployee.firstName, existingEmployee.lastName].filter(Boolean).join(" "),
      fatherHusbandName: existingEmployee.fatherHusbandName || "",
      gender: existingEmployee.gender || "",
      dateOfBirth: existingEmployee.dateOfBirth || "",
      mobileNumber: existingEmployee.mobileNumber || "",
      officialEmail: existingEmployee.officialEmail || "",
      dateOfJoining: existingEmployee.dateOfJoining,
      department: existingEmployee.department || "",
      designation: existingEmployee.designation || "",
      location: existingEmployee.location || "",
      employmentType: existingEmployee.employmentType || "permanent",
      status: existingEmployee.status as "active" | "inactive",
      pfApplicable: existingEmployee.pfApplicable || false,
      uan: existingEmployee.uan || "",
      esiApplicable: existingEmployee.esiApplicable || false,
      esiNumber: existingEmployee.esiNumber || "",
      lwfApplicable: existingEmployee.lwfApplicable || false,
      bonusApplicable: existingEmployee.bonusApplicable || false,
      bonusPaidMonthly: existingEmployee.bonusPaidMonthly || false,
      otApplicable: (existingEmployee as any).otApplicable || false,
      otRate: (existingEmployee as any).otRate || "2x",
      bankAccount: existingEmployee.bankAccount || "",
      ifsc: existingEmployee.ifsc || "",
      pan: existingEmployee.pan || "",
      aadhaar: existingEmployee.aadhaar || "",
      timeOfficePolicyId: existingEmployee.timeOfficePolicyId || "",
      biometricDeviceId: existingEmployee.biometricDeviceId || "",
      wageGradeId: existingEmployee.wageGradeId || "",
      presentAddress: existingEmployee.presentAddress || "",
      presentState: existingEmployee.presentState || "",
      presentDistrict: existingEmployee.presentDistrict || "",
      presentPincode: existingEmployee.presentPincode || "",
      permanentAddress: existingEmployee.permanentAddress || "",
      permanentState: existingEmployee.permanentState || "",
      permanentDistrict: existingEmployee.permanentDistrict || "",
      permanentPincode: existingEmployee.permanentPincode || "",
      sameAsPresentAddress: false,
    });
  }

  // Filter master data by selected company — use existingEmployee.companyId as fallback during editing
  const effectiveCompanyId = selectedCompanyId || (isEditing ? existingEmployee?.companyId : "") || "";
  const filteredDepartments = masterDepartments.filter(d => d.companyId === effectiveCompanyId);
  const filteredDesignations = masterDesignations.filter(d => d.companyId === effectiveCompanyId);
  const filteredLocations = masterLocations.filter(l => l.companyId === effectiveCompanyId);
  const filteredPolicies = timeOfficePolicies.filter(p => p.companyId === effectiveCompanyId && p.status === "active");
  const filteredWageGrades = wageGrades.filter(g => g.companyId === effectiveCompanyId && g.status === "active");

  const autoCreateSalaryStructure = async (emp: any, gradeId: string) => {
    const grade = wageGrades.find(g => g.id === gradeId && g.status === "active");
    if (!grade) return;
    const settings = statutorySettingsList.find(s => s.companyId === emp.companyId);
    const basic = grade.minimumWage;
    const gross = basic;

    let pfEmployee = 0, pfEmployer = 0, esi = 0, pt = 0, lwfEmployee = 0;

    if (settings?.pfEnabled && emp.pfApplicable) {
      const pfBase = Math.min(basic, Number(settings.pfWageCeiling) || 15000);
      pfEmployee = Math.round(pfBase * (Number(settings.pfEmployeePercent) || 12) / 100);
      pfEmployer = Math.round(pfBase * (Number(settings.pfEmployerPercent) || 12) / 100);
    }

    if (settings?.esicEnabled && emp.esiApplicable) {
      const wageCeiling = Number(settings.esicWageCeiling) || 21000;
      const percent = Number(settings.esicEmployeePercent) || 75;
      if (gross <= wageCeiling) {
        const esicBase = settings.esicCalcOnGross
          ? Math.min(gross, wageCeiling)
          : Math.min(Math.max(basic, gross * 0.5), wageCeiling);
        esi = Math.round(esicBase * percent / 10000);
      }
    }

    if (settings?.ptEnabled) {
      pt = Math.min(Number(settings.ptMaxAmount) || 200, 200);
    }

    if (settings?.lwfEnabled && emp.lwfApplicable) {
      const lwfBase = settings.lwfCalculationBase === "basic" ? basic : gross;
      const empPercent = Number(settings.lwfEmployeePercent) || 20;
      const empCap = Number(settings.lwfEmployeeMaxCap) || 34;
      lwfEmployee = Math.min(Math.round(lwfBase * empPercent / 10000), empCap);
    }

    const totalDeductions = pfEmployee + esi + pt + lwfEmployee;
    const net = Math.max(0, gross - totalDeductions);

    const today = new Date().toISOString().slice(0, 10);
    try {
      await apiRequest("POST", "/api/salary-structures", {
        employeeId: emp.id,
        companyId: emp.companyId,
        basicSalary: basic,
        hra: 0,
        conveyance: 0,
        medicalAllowance: 0,
        specialAllowance: 0,
        otherAllowances: 0,
        grossSalary: gross,
        pfEmployee,
        pfEmployer,
        esi,
        professionalTax: pt,
        lwfEmployee,
        tds: 0,
        otherDeductions: 0,
        netSalary: net,
        effectiveFrom: today,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/salary-structures"] });
    } catch (_) {}
  };

  const createMutation = useMutation({
    mutationFn: async (data: EmployeeFormValues) => {
      const res = await apiRequest("POST", "/api/employees", data);
      return res.json();
    },
    onSuccess: async (createdEmployee: any) => {
      if (createdEmployee?.id && createdEmployee?.wageGradeId) {
        await autoCreateSalaryStructure(createdEmployee, createdEmployee.wageGradeId);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Employee Added",
        description: createdEmployee?.wageGradeId
          ? "Employee added and salary structure created from minimum wage."
          : "The employee has been successfully added.",
      });
      setLocation("/employees");
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
    mutationFn: async (data: EmployeeFormValues) => {
      const res = await apiRequest("PATCH", `/api/employees/${employeeId}`, data);
      return res.json();
    },
    onSuccess: async (updatedEmployee: any) => {
      const prevGradeId = existingEmployee?.wageGradeId;
      const newGradeId = updatedEmployee?.wageGradeId;
      if (updatedEmployee?.id && newGradeId && newGradeId !== prevGradeId) {
        await autoCreateSalaryStructure(updatedEmployee, newGradeId);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Employee Updated",
        description: (newGradeId && newGradeId !== prevGradeId)
          ? "Employee updated and new salary structure created from minimum wage."
          : "The employee has been successfully updated.",
      });
      setLocation("/employees");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EmployeeFormValues) => {
    const nameParts = data.fullName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    const { fullName, ...rest } = data;
    const submitData = {
      ...rest,
      firstName,
      lastName,
      timeOfficePolicyId: data.timeOfficePolicyId || null,
      biometricDeviceId: data.biometricDeviceId || null,
      wageGradeId: data.wageGradeId || null,
    };
    if (isEditing) {
      updateMutation.mutate(submitData as any);
    } else {
      createMutation.mutate(submitData as any);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto" data-testid="add-employee-page">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/employees")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{isEditing ? "Edit Employee" : "Add New Employee"}</h1>
          <p className="text-muted-foreground">
            {isEditing ? "Update employee information" : "Fill in the details to add a new employee"}
          </p>
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

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-6 mb-6">
              <TabsTrigger value="basic" className="flex items-center gap-2" data-testid="tab-basic">
                <User className="h-4 w-4" />
                Basic Info
              </TabsTrigger>
              <TabsTrigger value="job" className="flex items-center gap-2" data-testid="tab-job">
                <Briefcase className="h-4 w-4" />
                Job Details
              </TabsTrigger>
              <TabsTrigger value="statutory" className="flex items-center gap-2" data-testid="tab-statutory">
                <FileText className="h-4 w-4" />
                Statutory
              </TabsTrigger>
              <TabsTrigger value="bank" className="flex items-center gap-2" data-testid="tab-bank">
                <Building2 className="h-4 w-4" />
                Bank & KYC
              </TabsTrigger>
              <TabsTrigger value="address" className="flex items-center gap-2" data-testid="tab-address">
                <MapPin className="h-4 w-4" />
                Address
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-2" data-testid="tab-documents">
                <FolderOpen className="h-4 w-4" />
                Documents
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>Personal details of the employee</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="employeeCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Employee Code *</FormLabel>
                          <FormControl>
                            <Input placeholder={nextCodeData?.nextCode || "EMP001"} {...field} data-testid="input-employee-code" />
                          </FormControl>
                          {!isEditing && nextCodeData?.nextCode && (
                            <p className="text-xs text-muted-foreground">
                              Suggested: <button type="button" className="text-primary font-medium hover:underline" onClick={() => form.setValue("employeeCode", nextCodeData.nextCode)}>{nextCodeData.nextCode}</button>
                              {nextCodeData.lastCode && <span className="ml-1">(last: {nextCodeData.lastCode})</span>}
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {isSuperAdmin ? (
                      <FormField
                        control={form.control}
                        name="companyId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-company">
                                  <SelectValue placeholder="Select company" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
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
                    ) : (
                      <FormItem>
                        <FormLabel>Company *</FormLabel>
                        <p className="text-sm font-medium pt-2">{companies.find(c => c.id === user?.companyId)?.companyName || "—"}</p>
                      </FormItem>
                    )}
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Full Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="Full Name" {...field} data-testid="input-full-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="fatherHusbandName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Father/Husband Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Father or Husband Name" {...field} data-testid="input-father-husband-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-gender">
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dateOfBirth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Birth</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-dob" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dateOfJoining"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date of Joining *</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-doj" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="mobileNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mobile Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="9876543210"
                              {...field}
                              data-testid="input-mobile"
                              maxLength={10}
                              inputMode="numeric"
                              onChange={(e) => field.onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="officialEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Official Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john@company.com" {...field} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="job">
              <Card>
                <CardHeader>
                  <CardTitle>Job Details</CardTitle>
                  <CardDescription>Employment and position information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="employmentType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Employment Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-employment-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {employmentTypesList.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="department"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-department">
                                <SelectValue placeholder="Select department" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {filteredDepartments.length > 0 ? (
                                filteredDepartments.map((dept) => (
                                  <SelectItem key={dept.id} value={dept.name}>
                                    {dept.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="_none" disabled>
                                  No departments configured — add in Settings
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="designation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Designation</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-designation">
                                <SelectValue placeholder="Select designation" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {filteredDesignations.length > 0 ? (
                                filteredDesignations.map((desg) => (
                                  <SelectItem key={desg.id} value={desg.name}>
                                    {desg.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="_none" disabled>
                                  No designations configured — add in Settings
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-location">
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {filteredLocations.length > 0 ? (
                                filteredLocations.map((loc) => (
                                  <SelectItem key={loc.id} value={loc.name}>
                                    {loc.name}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="_none" disabled>
                                  No locations configured — add in Settings
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="timeOfficePolicyId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time Office Policy</FormLabel>
                          <Select onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)} value={field.value || "__none__"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-time-office-policy">
                                <SelectValue placeholder="Select time office policy" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">None (Use company default)</SelectItem>
                              {filteredPolicies.length > 0 ? (
                                filteredPolicies.map((policy) => (
                                  <SelectItem key={policy.id} value={policy.id}>
                                    {policy.policyName}{policy.isDefault ? " (Default)" : ""}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="_none" disabled>
                                  No policies configured — add in Settings
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="biometricDeviceId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Biometric Device ID</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 1001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="wageGradeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Wage Grade</FormLabel>
                          <Select onValueChange={(val) => field.onChange(val === "__none__" ? "" : val)} value={field.value || "__none__"}>
                            <FormControl>
                              <SelectTrigger data-testid="select-wage-grade">
                                <SelectValue placeholder="Select wage grade" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">None</SelectItem>
                              {filteredWageGrades.length > 0 ? (
                                filteredWageGrades.map((grade) => (
                                  <SelectItem key={grade.id} value={grade.id}>
                                    {grade.name}
                                    {grade.state ? ` (${grade.state})` : ""} — ₹{grade.minimumWage.toLocaleString("en-IN")}
                                    {grade.effectiveFrom ? ` from ${grade.effectiveFrom}` : ""}
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem value="_none_wg" disabled>
                                  No wage grades configured — add in Settings
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="statutory">
              <Card>
                <CardHeader>
                  <CardTitle>Statutory Information</CardTitle>
                  <CardDescription>PF, ESI and other compliance details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="pfApplicable"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-pf"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="font-medium">PF Applicable</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Employee is covered under Provident Fund
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />

                      {form.watch("pfApplicable") && (
                        <FormField
                          control={form.control}
                          name="uan"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>UAN Number</FormLabel>
                              <FormControl>
                                <Input placeholder="100000000000" {...field} data-testid="input-uan" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="esiApplicable"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-esi"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="font-medium">ESI Applicable</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Employee is covered under ESIC
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />

                      {form.watch("esiApplicable") && (
                        <FormField
                          control={form.control}
                          name="esiNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ESI Number</FormLabel>
                              <FormControl>
                                <Input placeholder="ESI number" {...field} data-testid="input-esi-number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="lwfApplicable"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-lwf"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="font-medium">LWF Applicable</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Employee is covered under Labour Welfare Fund
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="bonusApplicable"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-bonus"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="font-medium">Bonus Applicable</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Employee is eligible for statutory bonus
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />
                      {form.watch("bonusApplicable") && (
                        <FormField
                          control={form.control}
                          name="bonusPaidMonthly"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-4 ml-6">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-bonus-monthly"
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel className="font-medium">Bonus Paid Monthly</FormLabel>
                                <p className="text-sm text-muted-foreground">
                                  Bonus is included in monthly payroll instead of annual payout
                                </p>
                              </div>
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="otApplicable"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-ot"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="font-medium">OT Applicable</FormLabel>
                              <p className="text-sm text-muted-foreground">
                                Employee is eligible for overtime pay
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />
                      {form.watch("otApplicable") && (
                        <FormField
                          control={form.control}
                          name="otRate"
                          render={({ field }) => (
                            <FormItem className="ml-6">
                              <FormLabel>OT Rate</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-ot-rate">
                                    <SelectValue placeholder="Select OT rate" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="1x">1X — Single rate (basic hourly rate)</SelectItem>
                                  <SelectItem value="2x">2X — Double rate (overtime premium)</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground mt-1">
                                OT pay = (Gross ÷ Working days ÷ 8 hrs) × {field.value === "1x" ? "1" : "2"} × OT hours
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bank">
              <Card>
                <CardHeader>
                  <CardTitle>Bank & KYC Details</CardTitle>
                  <CardDescription>Bank account and identity information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <FormField
                      control={form.control}
                      name="pan"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PAN Number</FormLabel>
                          <FormControl>
                            <Input placeholder="ABCDE1234F" {...field} data-testid="input-pan" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="aadhaar"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Aadhaar Number</FormLabel>
                          <FormControl>
                            <Input placeholder="1234 5678 9012" maxLength={12} {...field} data-testid="input-aadhaar" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bankAccount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bank Account Number</FormLabel>
                          <FormControl>
                            <Input placeholder="Account number" {...field} data-testid="input-bank-account" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ifsc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IFSC Code</FormLabel>
                          <FormControl>
                            <Input placeholder="SBIN0001234" {...field} data-testid="input-ifsc" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="address">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Present Address</CardTitle>
                    <CardDescription>Current residential address of the employee</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="presentAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input placeholder="House No, Street, Area" {...field} data-testid="input-present-address" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="presentDistrict"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District/City</FormLabel>
                            <FormControl>
                              <Input placeholder="District or City" {...field} data-testid="input-present-district" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="presentState"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-present-state">
                                  <SelectValue placeholder="Select state" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {indianStates.map(state => (
                                  <SelectItem key={state} value={state}>{state}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="presentPincode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pincode</FormLabel>
                            <FormControl>
                              <Input placeholder="110001" maxLength={6} {...field} data-testid="input-present-pincode" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Permanent Address</CardTitle>
                        <CardDescription>Permanent residential address of the employee</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={form.watch("sameAsPresentAddress")}
                          onCheckedChange={(checked) => {
                            form.setValue("sameAsPresentAddress", checked);
                            if (checked) {
                              form.setValue("permanentAddress", form.getValues("presentAddress") || "");
                              form.setValue("permanentState", form.getValues("presentState") || "");
                              form.setValue("permanentDistrict", form.getValues("presentDistrict") || "");
                              form.setValue("permanentPincode", form.getValues("presentPincode") || "");
                            }
                          }}
                          data-testid="switch-same-address"
                        />
                        <Label className="text-sm">Same as Present Address</Label>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="permanentAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input placeholder="House No, Street, Area" {...field} disabled={form.watch("sameAsPresentAddress")} data-testid="input-permanent-address" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="permanentDistrict"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>District/City</FormLabel>
                            <FormControl>
                              <Input placeholder="District or City" {...field} disabled={form.watch("sameAsPresentAddress")} data-testid="input-permanent-district" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="permanentState"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={form.watch("sameAsPresentAddress")}>
                              <FormControl>
                                <SelectTrigger data-testid="select-permanent-state">
                                  <SelectValue placeholder="Select state" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {indianStates.map(state => (
                                  <SelectItem key={state} value={state}>{state}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="permanentPincode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pincode</FormLabel>
                            <FormControl>
                              <Input placeholder="110001" maxLength={6} {...field} disabled={form.watch("sameAsPresentAddress")} data-testid="input-permanent-pincode" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="documents">
              <DocumentsTab employeeId={employeeId} />
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-end gap-4 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/employees")}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || companies.length === 0} data-testid="button-submit-employee">
              <Save className="h-4 w-4 mr-2" />
              {isLoading ? "Saving..." : isEditing ? "Update Employee" : "Add Employee"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
