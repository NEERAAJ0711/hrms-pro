import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Search,
  Building2,
  Edit,
  Trash2,
  MapPin,
  HardHat,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Upload,
  X,
  ImageIcon,
  PenLine,
  CreditCard,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Company, InsertCompany } from "@shared/schema";

function getTrialStatus(company: Company) {
  if (!company.trialStartDate) return null;
  const start = new Date(company.trialStartDate);
  const total = (company.trialDays ?? 3) + (company.trialExtendedDays ?? 0);
  const expiry = new Date(start);
  expiry.setDate(expiry.getDate() + total);
  expiry.setHours(23, 59, 59, 999);
  const now = new Date();
  const msLeft = expiry.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  return { total, daysLeft, expired: msLeft < 0, startDate: company.trialStartDate };
}

// ─── Company Form ─────────────────────────────────────────────────────────────
const companyFormSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  legalName: z.string().min(1, "Legal name is required"),
  cin: z.string().optional(),
  pan: z.string().optional(),
  gstin: z.string().optional(),
  pfCode: z.string().optional(),
  esiCode: z.string().optional(),
  ptState: z.string().optional(),
  lwfState: z.string().optional(),
  registeredAddress: z.string().optional(),
  financialYear: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

type CompanyFormValues = z.infer<typeof companyFormSchema>;

function CompanyForm({
  onSubmit,
  defaultValues,
  isLoading,
  submitLabel = "Create Company",
}: {
  onSubmit: (data: CompanyFormValues) => void;
  defaultValues?: Partial<CompanyFormValues>;
  isLoading: boolean;
  submitLabel?: string;
}) {
  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      companyName: "",
      legalName: "",
      cin: "",
      pan: "",
      gstin: "",
      pfCode: "",
      esiCode: "",
      ptState: "",
      lwfState: "",
      registeredAddress: "",
      financialYear: "",
      status: "active",
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="companyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Enter company name" {...field} data-testid="input-company-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="legalName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Legal Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Enter legal name" {...field} data-testid="input-legal-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="cin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CIN / LLPIN</FormLabel>
                <FormControl>
                  <Input placeholder="Enter CIN" {...field} data-testid="input-cin" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="pan"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PAN</FormLabel>
                <FormControl>
                  <Input placeholder="Enter PAN" {...field} data-testid="input-pan" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="gstin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>GSTIN</FormLabel>
                <FormControl>
                  <Input placeholder="Enter GSTIN" {...field} data-testid="input-gstin" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="financialYear"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Financial Year</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Apr-Mar" {...field} data-testid="input-financial-year" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="pfCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PF Establishment Code</FormLabel>
                <FormControl>
                  <Input placeholder="PF Code" {...field} data-testid="input-pf-code" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="esiCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ESI Code</FormLabel>
                <FormControl>
                  <Input placeholder="ESI Code" {...field} data-testid="input-esi-code" />
                </FormControl>
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
                <Select onValueChange={field.onChange} defaultValue={field.value}>
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

        <FormField
          control={form.control}
          name="registeredAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Registered Address</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Enter registered address"
                  className="resize-none"
                  {...field}
                  data-testid="textarea-address"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="submit" disabled={isLoading} data-testid="button-submit-company">
            {isLoading ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function CompaniesTableSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-12 w-12 rounded-md" />
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

// ─── Company Assets Panel (Logo & Signature) ──────────────────────────────────
function AssetUploadZone({
  label,
  hint,
  current,
  assetType,
  companyId,
  icon: Icon,
  onDone,
}: {
  label: string;
  hint: string;
  current: string | null | undefined;
  assetType: "logo" | "signature";
  companyId: string;
  icon: React.ElementType;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/companies/${companyId}/assets/${assetType}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: `${label} uploaded`, description: "Successfully updated." });
      onDone();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await apiRequest("DELETE", `/api/companies/${companyId}/assets/${assetType}`);
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: `${label} removed` });
      onDone();
    } catch {
      toast({ title: "Remove failed", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>

      {current ? (
        <div className="relative border rounded-lg p-3 bg-muted/30 flex items-center justify-center min-h-[100px]">
          <img
            src={current}
            alt={label}
            className="max-h-24 max-w-full object-contain"
            data-testid={`img-company-${assetType}`}
          />
          <button
            className="absolute top-1.5 right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:opacity-80"
            onClick={handleRemove}
            disabled={removing}
            title={`Remove ${label}`}
            data-testid={`button-remove-${assetType}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer disabled:opacity-50"
          data-testid={`button-upload-${assetType}`}
        >
          <Upload className="h-6 w-6" />
          <span className="text-sm font-medium">{uploading ? "Uploading…" : `Click to upload ${label}`}</span>
          <span className="text-xs">PNG, JPG, WebP — max 5 MB</span>
        </button>
      )}

      {current && (
        <Button
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          data-testid={`button-replace-${assetType}`}
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          {uploading ? "Uploading…" : `Replace ${label}`}
        </Button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Companies() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [trialCompany, setTrialCompany] = useState<Company | null>(null);
  const [extendDays, setExtendDays] = useState("7");
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const isCompanyAdmin = user?.role === "company_admin";

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertCompany) => {
      const res = await apiRequest("POST", "/api/companies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsCreateOpen(false);
      toast({ title: "Company Created", description: "The company has been successfully created." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertCompany }) => {
      const res = await apiRequest("PATCH", `/api/companies/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setEditingCompany(null);
      toast({ title: "Company Updated", description: "The company has been successfully updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Company Deleted", description: "The company has been successfully deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const trialMutation = useMutation({
    mutationFn: async ({ id, trialDays, trialExtendedDays }: { id: string; trialDays: number; trialExtendedDays: number }) => {
      const res = await apiRequest("PATCH", `/api/companies/${id}/trial`, { trialDays, trialExtendedDays });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setTrialCompany(null);
      const msg = vars.trialDays === 0
        ? "Trial has been expired for this company."
        : "Service access has been updated successfully.";
      toast({ title: "Trial Updated", description: msg });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredCompanies = companies.filter(
    (company) =>
      company.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.legalName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6" data-testid="companies-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{isCompanyAdmin ? "My Company" : "Companies"}</h1>
          <p className="text-muted-foreground">
            {isCompanyAdmin ? "View and edit your company details" : "Manage your organization entities"}
          </p>
        </div>
        {isSuperAdmin && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-company">
                <Plus className="h-4 w-4 mr-2" />
                Add Company
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Create Company</DialogTitle>
                <DialogDescription>Add a new company to your HRMS.</DialogDescription>
              </DialogHeader>
              <CompanyForm
                onSubmit={(data) => createMutation.mutate(data)}
                isLoading={createMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        {isSuperAdmin && (
          <CardHeader className="pb-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search companies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-companies"
                />
              </div>
              <Badge variant="secondary" className="text-xs">
                {filteredCompanies.length} companies
              </Badge>
            </div>
          </CardHeader>
        )}
        <CardContent>
          {isLoading ? (
            <CompaniesTableSkeleton />
          ) : filteredCompanies.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No companies found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "Try adjusting your search" : "Get started by adding your first company"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsCreateOpen(true)} data-testid="button-add-first-company">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Company
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">Sr.</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Legal Name</TableHead>
                    <TableHead>PAN</TableHead>
                    <TableHead>GSTIN</TableHead>
                    <TableHead>Trial</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map((company, idx) => (
                    <TableRow key={company.id} data-testid={`company-row-${company.id}`}>
                      <TableCell className="text-center text-muted-foreground font-medium text-sm">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium">{company.companyName}</div>
                            {company.registeredAddress && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate max-w-[200px]">{company.registeredAddress}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{company.legalName}</TableCell>
                      <TableCell>
                        {company.pan || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {company.gstin || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const ts = getTrialStatus(company);
                          if (!ts) return (
                            <Badge variant="outline" className="gap-1 text-xs text-green-600 border-green-400">
                              <CreditCard className="h-3 w-3" /> Billing Active
                            </Badge>
                          );
                          if (ts.expired) return (
                            <Badge variant="destructive" className="gap-1 text-xs">
                              <AlertTriangle className="h-3 w-3" /> Trial Expired
                            </Badge>
                          );
                          return (
                            <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-400">
                              <Clock className="h-3 w-3" /> Trial: {ts.daysLeft}d left
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={company.status === "active" ? "default" : "secondary"}>
                          {company.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isSuperAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Manage Trial"
                              onClick={() => {
                                const ts = getTrialStatus(company);
                                setTrialCompany(company);
                                setExtendDays(String(ts?.total ?? 3));
                              }}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                              data-testid={`button-trial-${company.id}`}
                            >
                              <Clock className="h-4 w-4" />
                            </Button>
                          )}
                          {isSuperAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Manage Contractors"
                              onClick={() => setLocation(`/companies/${company.id}/contractors`)}
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                              data-testid={`button-contractors-${company.id}`}
                            >
                              <HardHat className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit Company"
                            onClick={() => setEditingCompany(company)}
                            data-testid={`button-edit-company-${company.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {isSuperAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this company?")) {
                                  deleteMutation.mutate(company.id);
                                }
                              }}
                              data-testid={`button-delete-company-${company.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
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

      {/* Trial Management Dialog */}
      <Dialog open={!!trialCompany} onOpenChange={(open) => !open && setTrialCompany(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" /> Manage Trial Access
            </DialogTitle>
            <DialogDescription>
              Set total trial days for <strong>{trialCompany?.companyName}</strong>. Set to 0 to expire immediately.
            </DialogDescription>
          </DialogHeader>
          {trialCompany && (() => {
            const ts = getTrialStatus(trialCompany);
            const newTotal = extendDays === "" ? 0 : Number(extendDays);
            const willExpire = newTotal === 0;
            const willReactivate = (ts?.expired) && newTotal > 0;
            return (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Started</p>
                    <p className="font-semibold text-sm">{ts?.startDate || "—"}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Current Total</p>
                    <p className="font-semibold text-sm">{ts?.total ?? 0}d</p>
                  </div>
                  <div className={`rounded-lg border p-3 ${ts?.expired ? "bg-red-50 border-red-200 dark:bg-red-950/30" : "bg-green-50 border-green-200 dark:bg-green-950/30"}`}>
                    <p className="text-xs text-muted-foreground mb-1">Days Left</p>
                    <p className={`font-bold text-sm ${ts?.expired ? "text-red-600" : "text-green-600"}`}>
                      {ts?.expired ? "Expired" : `${ts?.daysLeft}d`}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Set Total Trial Days</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setExtendDays("0")}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${extendDays === "0" ? "bg-destructive text-destructive-foreground border-destructive" : "border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"}`}
                      data-testid="button-trial-expire"
                    >
                      Expire (0)
                    </button>
                    {[3, 7, 14, 30, 90].map(d => (
                      <button
                        key={d}
                        onClick={() => setExtendDays(String(d))}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${extendDays === String(d) ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted"}`}
                        data-testid={`button-trial-preset-${d}`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={extendDays}
                    onChange={e => setExtendDays(e.target.value)}
                    placeholder="Enter total days (0 = expired)"
                    className="mt-2"
                    data-testid="input-trial-extend-days"
                  />
                </div>

                {willExpire ? (
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Trial will be set to <strong>0 days</strong> — this company's access will be expired immediately.</span>
                  </div>
                ) : (
                  <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${willReactivate ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300" : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"}`}>
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      New total: <strong>{newTotal} days</strong>
                      {willReactivate ? " — account will be reactivated." : "."}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrialCompany(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!trialCompany) return;
                const newTotal = extendDays === "" ? 0 : Math.max(0, Number(extendDays));
                trialMutation.mutate({ id: trialCompany.id, trialDays: newTotal, trialExtendedDays: 0 });
              }}
              disabled={trialMutation.isPending || extendDays === "" || isNaN(Number(extendDays)) || Number(extendDays) < 0}
              variant={extendDays === "0" ? "destructive" : "default"}
              data-testid="button-confirm-trial-extend"
            >
              {trialMutation.isPending ? "Saving…" : extendDays === "0" ? "Expire Trial" : "Update Trial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingCompany} onOpenChange={(open) => !open && setEditingCompany(null)}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Update company information, logo, and authorized signature.</DialogDescription>
          </DialogHeader>
          {editingCompany && (
            <Tabs defaultValue="details">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1" data-testid="tab-company-details">
                  Company Details
                </TabsTrigger>
                <TabsTrigger value="assets" className="flex-1" data-testid="tab-company-assets">
                  Logo & Signature
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-4">
                <CompanyForm
                  onSubmit={(data) => updateMutation.mutate({ id: editingCompany.id, data })}
                  defaultValues={{
                    companyName: editingCompany.companyName,
                    legalName: editingCompany.legalName,
                    cin: editingCompany.cin || "",
                    pan: editingCompany.pan || "",
                    gstin: editingCompany.gstin || "",
                    pfCode: editingCompany.pfCode || "",
                    esiCode: editingCompany.esiCode || "",
                    ptState: editingCompany.ptState || "",
                    lwfState: editingCompany.lwfState || "",
                    registeredAddress: editingCompany.registeredAddress || "",
                    financialYear: editingCompany.financialYear || "",
                    status: editingCompany.status as "active" | "inactive",
                  }}
                  isLoading={updateMutation.isPending}
                  submitLabel="Update Company"
                />
              </TabsContent>

              <TabsContent value="assets" className="mt-4 space-y-6">
                <AssetUploadZone
                  label="Company Logo"
                  hint="Appears on PDF reports, salary slips, and dashboards. Recommended: transparent PNG, at least 200×100 px."
                  current={
                    (companies.find(c => c.id === editingCompany.id) as any)?.logo ||
                    editingCompany.logo
                  }
                  assetType="logo"
                  companyId={editingCompany.id}
                  icon={ImageIcon}
                  onDone={() => {
                    const fresh = companies.find(c => c.id === editingCompany.id);
                    if (fresh) setEditingCompany({ ...fresh });
                  }}
                />
                <Separator />
                <AssetUploadZone
                  label="Authorized Signature"
                  hint="Appears at the bottom of salary slips, appointment letters, and formal reports. Recommended: transparent PNG on white background."
                  current={
                    (companies.find(c => c.id === editingCompany.id) as any)?.signature ||
                    editingCompany.signature
                  }
                  assetType="signature"
                  companyId={editingCompany.id}
                  icon={PenLine}
                  onDone={() => {
                    const fresh = companies.find(c => c.id === editingCompany.id);
                    if (fresh) setEditingCompany({ ...fresh });
                  }}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
