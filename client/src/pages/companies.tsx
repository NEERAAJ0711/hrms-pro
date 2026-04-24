import { useState } from "react";
import { useLocation } from "wouter";
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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Company, InsertCompany } from "@shared/schema";

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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Companies() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const { toast } = useToast();

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

  const filteredCompanies = companies.filter(
    (company) =>
      company.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.legalName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6" data-testid="companies-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-muted-foreground">Manage your organization entities</p>
        </div>
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
      </div>

      <Card>
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
                        <Badge variant={company.status === "active" ? "default" : "secondary"}>
                          {company.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingCompany(company)}
                            data-testid={`button-edit-company-${company.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
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
      <Dialog open={!!editingCompany} onOpenChange={(open) => !open && setEditingCompany(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Update the company information.</DialogDescription>
          </DialogHeader>
          {editingCompany && (
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
