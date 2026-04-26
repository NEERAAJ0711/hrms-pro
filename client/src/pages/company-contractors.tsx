import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  HardHat,
  Plus,
  Trash2,
  Search,
  Building2,
  CalendarDays,
  X,
  Users,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Briefcase,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Company, Employee, CompanyContractor } from "@shared/schema";

// ─── Types ──────────────────────────────────────────────────────────────────
type ContractorRow = {
  id: string;
  companyId: string;
  contractorId: string;
  startDate: string;
  contractorName: string;
};

type PrincipalEmployerRow = CompanyContractor & { companyName: string };

type TaggedEmployee = Employee & { contractorEmployeeId: string; taggedDate: string | null };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Searchable Company Picker ───────────────────────────────────────────────
function CompanySearchPicker({
  companies, excludeIds, value, onChange,
}: {
  companies: Company[];
  excludeIds: Set<string>;
  value: Company | null;
  onChange: (c: Company | null) => void;
}) {
  const [text, setText] = useState(value?.companyName ?? "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setText(value?.companyName ?? ""); }, [value]);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = companies
    .filter(c => !excludeIds.has(c.id) && c.companyName.toLowerCase().includes(text.toLowerCase()))
    .slice(0, 10);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Type company name to search..."
          value={text}
          onChange={(e) => { setText(e.target.value); onChange(null); setOpen(e.target.value.length > 0); }}
          onFocus={() => text.length > 0 && !value && setOpen(true)}
          className="pl-9 pr-8"
          data-testid="input-contractor-search"
        />
        {text && (
          <button type="button" onClick={() => { setText(""); onChange(null); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-xl max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">No companies found</p>
          ) : filtered.map(c => (
            <button key={c.id} type="button"
              onClick={() => { onChange(c); setText(c.companyName); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
              data-testid={`contractor-option-${c.id}`}>
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                {initials(c.companyName)}
              </div>
              <div>
                <p className="font-medium">{c.companyName}</p>
                {c.legalName !== c.companyName && <p className="text-xs text-muted-foreground">{c.legalName}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Employee Search Picker ──────────────────────────────────────────────────
function EmployeeSearchPicker({
  employees, excludeIds, value, onChange,
}: {
  employees: Employee[];
  excludeIds: Set<string>;
  value: Employee | null;
  onChange: (e: Employee | null) => void;
}) {
  const [text, setText] = useState(value ? `${value.firstName} ${value.lastName}` : "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setText(value ? `${value.firstName} ${value.lastName}` : ""); }, [value]);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = employees
    .filter(e => {
      const name = `${e.firstName} ${e.lastName}`.toLowerCase();
      const code = (e.employeeCode || "").toLowerCase();
      const q = text.toLowerCase();
      return !excludeIds.has(e.id) && (name.includes(q) || code.includes(q));
    })
    .slice(0, 10);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by name or code..."
          value={text}
          onChange={(e) => { setText(e.target.value); onChange(null); setOpen(e.target.value.length > 0); }}
          onFocus={() => text.length > 0 && !value && setOpen(true)}
          className="pl-9 pr-8"
          data-testid="input-employee-tag-search"
        />
        {text && (
          <button type="button" onClick={() => { setText(""); onChange(null); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-xl max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {employees.length === 0 ? "No employees in this company" : "No matching employees"}
            </p>
          ) : filtered.map(e => (
            <button key={e.id} type="button"
              onClick={() => { onChange(e); setText(`${e.firstName} ${e.lastName}`); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
              data-testid={`employee-option-${e.id}`}>
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                {e.firstName?.[0]}{e.lastName?.[0]}
              </div>
              <div>
                <p className="font-medium">{e.firstName} {e.lastName}</p>
                <p className="text-xs text-muted-foreground">{e.employeeCode}{e.designation ? ` · ${e.designation}` : ""}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tagged Employees Panel ──────────────────────────────────────────────────
function ContractorEmployeesPanel({
  companyId,
  contractor,
}: {
  companyId: string;
  contractor: ContractorRow;
}) {
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [taggedDate, setTaggedDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: contractorEmployeeList = [], isLoading } = useQuery<TaggedEmployee[]>({
    queryKey: ["/api/companies", companyId, "contractors", contractor.contractorId, "employees"],
    queryFn: async () => {
      const res = await fetch(
        `/api/companies/${companyId}/contractors/${contractor.contractorId}/employees`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: contractorCompanyEmployees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/companies", contractor.contractorId, "employees"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${contractor.contractorId}/employees`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const tagMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/companies/${companyId}/contractors/${contractor.contractorId}/employees`,
        { employeeId: selectedEmployee!.id, taggedDate }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to tag employee");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", companyId, "contractors", contractor.contractorId, "employees"],
      });
      setSelectedEmployee(null);
      toast({ title: "Employee tagged successfully" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const untagMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await apiRequest(
        "DELETE",
        `/api/companies/${companyId}/contractors/${contractor.contractorId}/employees/${employeeId}`
      );
      if (!res.ok) throw new Error("Failed to remove");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/companies", companyId, "contractors", contractor.contractorId, "employees"],
      });
      toast({ title: "Employee untagged" });
    },
    onError: () => toast({ title: "Error", description: "Failed to untag employee", variant: "destructive" }),
  });

  const taggedIds = new Set(contractorEmployeeList.map(e => e.id));
  const canTag = selectedEmployee && taggedDate;

  return (
    <div className="border-t bg-muted/10">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Tagged Employees</span>
          <Badge className="text-xs h-5 px-1.5 rounded-full bg-primary/10 text-primary border-0 font-semibold">
            {contractorEmployeeList.length}
          </Badge>
          <span className="text-xs text-muted-foreground">
            from <span className="font-medium text-foreground">{contractor.contractorName}</span>
          </span>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* Employee List */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="flex items-center gap-4 py-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3.5 w-24 ml-auto" />
              </div>
            ))}
          </div>
        ) : contractorEmployeeList.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No employees tagged yet</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-background overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-10">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Code</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tagged On</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {contractorEmployeeList.map((emp, idx) => (
                  <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                    data-testid={`tagged-employee-row-${emp.id}`}>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-medium">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-primary bg-primary/8 px-1.5 py-0.5 rounded">
                        {emp.employeeCode}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                          {emp.firstName?.[0]}{emp.lastName?.[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm leading-tight">{emp.firstName} {emp.lastName}</p>
                          {emp.designation && <p className="text-xs text-muted-foreground">{emp.designation}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                        <span>{formatDate(emp.taggedDate)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button"
                        onClick={() => { if (confirm(`Untag ${emp.firstName} ${emp.lastName}?`)) untagMutation.mutate(emp.id); }}
                        disabled={untagMutation.isPending}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-destructive/10 transition-colors"
                        data-testid={`untag-employee-${emp.id}`}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tag Employee Form */}
        <div className="rounded-lg border border-dashed bg-background p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2.5 uppercase tracking-wide">Tag New Employee</p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <EmployeeSearchPicker
                employees={contractorCompanyEmployees}
                excludeIds={taggedIds}
                value={selectedEmployee}
                onChange={setSelectedEmployee}
              />
            </div>
            <div className="w-40 shrink-0">
              <Input type="date" value={taggedDate} onChange={(e) => setTaggedDate(e.target.value)}
                data-testid="input-tag-date" />
            </div>
            <Button size="sm" onClick={() => tagMutation.mutate()} disabled={!canTag || tagMutation.isPending}
              className="shrink-0" data-testid="button-tag-employee">
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              {tagMutation.isPending ? "Tagging..." : "Tag"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Contractors Tab ─────────────────────────────────────────────────────────
function ContractorsTab({ companyId, company }: { companyId: string; company: Company | undefined }) {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [startDate, setStartDate] = useState("");
  const [expandedContractorId, setExpandedContractorId] = useState<string | null>(null);

  const { data: allCompanies = [] } = useQuery<Company[]>({ queryKey: ["/api/companies"] });

  const { data: contractors = [], isLoading } = useQuery<ContractorRow[]>({
    queryKey: ["/api/companies", companyId, "contractors"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${companyId}/contractors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch contractors");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/contractors`, {
        contractorId: selectedCompany!.id,
        startDate,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add contractor");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "contractors"] });
      setSelectedCompany(null);
      setStartDate("");
      setShowAddForm(false);
      toast({ title: "Contractor added successfully" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (contractorId: string) => {
      const res = await apiRequest("DELETE", `/api/companies/${companyId}/contractors/${contractorId}`);
      if (!res.ok) throw new Error("Failed to remove");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "contractors"] });
      toast({ title: "Contractor removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove contractor", variant: "destructive" }),
  });

  const existingIds = new Set(contractors.map(c => c.contractorId));
  const canAdd = selectedCompany && startDate;

  return (
    <div className="space-y-4">
      {/* Add Contractor Form */}
      {showAddForm && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <Plus className="h-4 w-4 text-amber-600" />
            </div>
            <h3 className="font-semibold text-sm">Add New Contractor</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Contractor Company <span className="text-destructive">*</span>
              </label>
              <CompanySearchPicker
                companies={allCompanies.filter(c => c.id !== companyId)}
                excludeIds={existingIds}
                value={selectedCompany}
                onChange={setSelectedCompany}
              />
              {selectedCompany && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Building2 className="h-3 w-3" />{selectedCompany.legalName}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Contract Start Date <span className="text-destructive">*</span>
              </label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                data-testid="input-contractor-start-date" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm"
              onClick={() => { setShowAddForm(false); setSelectedCompany(null); setStartDate(""); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => addMutation.mutate()} disabled={!canAdd || addMutation.isPending}
              data-testid="button-submit-add-contractor">
              {addMutation.isPending ? "Adding..." : "Add Contractor"}
            </Button>
          </div>
        </div>
      )}

      {/* Contractor List */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/20">
          <div className="flex items-center gap-2">
            <HardHat className="h-4 w-4 text-amber-600" />
            <span className="font-semibold text-sm">Contractor List</span>
            <Badge variant="secondary" className="text-xs h-5 px-1.5 rounded-full">{contractors.length}</Badge>
          </div>
          <Button size="sm" variant="default" onClick={() => setShowAddForm(true)} disabled={showAddForm}
            data-testid="button-add-contractor-inline">
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Contractor
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-0 divide-y">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            ))}
          </div>
        ) : contractors.length === 0 ? (
          <div className="text-center py-16">
            <div className="h-14 w-14 rounded-2xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mx-auto mb-4">
              <HardHat className="h-7 w-7 text-amber-400" />
            </div>
            <h3 className="font-semibold text-base mb-1">No contractors yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
              Associate another company as a contractor to manage their employees and compliances.
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add First Contractor
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {contractors.map((contractor, idx) => {
              const isExpanded = expandedContractorId === contractor.contractorId;
              return (
                <div key={contractor.contractorId} data-testid={`contractor-row-${contractor.contractorId}`}>
                  {/* Main Row */}
                  <div className={`flex items-center gap-4 px-5 py-4 transition-colors ${isExpanded ? "bg-primary/3" : "hover:bg-muted/30"}`}>
                    {/* Sr */}
                    <span className="text-xs text-muted-foreground font-medium w-5 shrink-0 text-center">{idx + 1}</span>

                    {/* Avatar */}
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/30 flex items-center justify-center text-sm font-bold text-amber-700 dark:text-amber-400 shrink-0">
                      {initials(contractor.contractorName)}
                    </div>

                    {/* Name & ID */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{contractor.contractorName}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        ID: {contractor.contractorId.slice(0, 8)}…
                      </p>
                    </div>

                    {/* Start Date */}
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatDate(contractor.startDate)}</span>
                    </div>

                    {/* Status */}
                    <Badge className="hidden sm:inline-flex text-xs font-medium bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                      Active
                    </Badge>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => setExpandedContractorId(p => p === contractor.contractorId ? null : contractor.contractorId)}
                        className={`h-8 gap-1.5 text-xs font-medium ${isExpanded ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                        data-testid={`button-tag-employees-${contractor.contractorId}`}
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span className="hidden md:inline">Employees</span>
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon"
                        onClick={() => { if (confirm(`Remove ${contractor.contractorName} as a contractor?`)) removeMutation.mutate(contractor.contractorId); }}
                        disabled={removeMutation.isPending}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        data-testid={`button-remove-contractor-${contractor.contractorId}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Employees Panel */}
                  {isExpanded && (
                    <ContractorEmployeesPanel companyId={companyId} contractor={contractor} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Principal Employer Tab ──────────────────────────────────────────────────
function PrincipalEmployerTab({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [expandedEmployerId, setExpandedEmployerId] = useState<string | null>(null);

  const { data: employers = [], isLoading } = useQuery<PrincipalEmployerRow[]>({
    queryKey: ["/api/companies", companyId, "principal-employers"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${companyId}/principal-employers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b bg-muted/20">
        <ShieldCheck className="h-4 w-4 text-blue-600" />
        <span className="font-semibold text-sm">Principal Employer List</span>
        <Badge variant="secondary" className="text-xs h-5 px-1.5 rounded-full">{employers.length}</Badge>
      </div>

      {isLoading ? (
        <div className="divide-y">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : employers.length === 0 ? (
        <div className="text-center py-16">
          <div className="h-14 w-14 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mx-auto mb-4">
            <Briefcase className="h-7 w-7 text-blue-400" />
          </div>
          <h3 className="font-semibold text-base mb-1">No principal employers</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            This company hasn't been tagged as a contractor by any other company yet.
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {employers.map((emp, idx) => {
            const isExpanded = expandedEmployerId === emp.id;
            const contractorRow: ContractorRow = {
              id: emp.id,
              companyId: emp.companyId,
              contractorId: companyId,
              startDate: emp.startDate,
              contractorName: companyName,
            };
            return (
              <div key={emp.id} data-testid={`principal-employer-row-${emp.id}`}>
                <div className={`flex items-center gap-4 px-5 py-4 transition-colors ${isExpanded ? "bg-primary/3" : "hover:bg-muted/30"}`}>
                  <span className="text-xs text-muted-foreground font-medium w-5 shrink-0 text-center">{idx + 1}</span>

                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/30 flex items-center justify-center text-sm font-bold text-blue-700 dark:text-blue-400 shrink-0">
                    {initials(emp.companyName)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{emp.companyName}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      ID: {emp.companyId.slice(0, 8)}…
                    </p>
                  </div>

                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    <span>Since {formatDate(emp.startDate)}</span>
                  </div>

                  <Badge className="hidden sm:inline-flex text-xs font-medium bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                    Active
                  </Badge>

                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setExpandedEmployerId(p => p === emp.id ? null : emp.id)}
                    className={`h-8 gap-1.5 text-xs font-medium shrink-0 ${isExpanded ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                    data-testid={`button-tag-employees-pe-${emp.id}`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Employees</span>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                </div>

                {isExpanded && (
                  <ContractorEmployeesPanel companyId={emp.companyId} contractor={contractorRow} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function CompanyContractorsPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"contractors" | "principal-employer">("contractors");

  const { data: company } = useQuery<Company>({
    queryKey: ["/api/companies", id],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: contractors = [] } = useQuery<ContractorRow[]>({
    queryKey: ["/api/companies", id, "contractors"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${id}/contractors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: employers = [] } = useQuery<PrincipalEmployerRow[]>({
    queryKey: ["/api/companies", id, "principal-employers"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${id}/principal-employers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="company-contractors-page">

      {/* ── Page Header ── */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/companies")}
          className="mt-0.5 shrink-0" data-testid="button-back-companies">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-0.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/30 flex items-center justify-center shrink-0">
              <HardHat className="h-5 w-5 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold truncate">Contractor Management</h1>
          </div>
          {company && (
            <p className="text-sm text-muted-foreground ml-11">
              Managing for{" "}
              <span className="font-semibold text-foreground">{company.companyName}</span>
            </p>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted/40 border w-fit">
        {([
          { key: "contractors", label: "Contractors", icon: HardHat, count: contractors.length, color: "amber" },
          { key: "principal-employer", label: "Principal Employer", icon: ShieldCheck, count: employers.length, color: "blue" },
        ] as const).map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              data-testid={`tab-${tab.key}`}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? (tab.color === "amber" ? "text-amber-600" : "text-blue-600") : ""}`} />
              {tab.label}
              <span className={`inline-flex items-center justify-center rounded-full min-w-[18px] h-4.5 px-1.5 text-[11px] font-semibold transition-colors ${
                isActive
                  ? tab.color === "amber"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  : "bg-muted text-muted-foreground"
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <Separator />

      {/* ── Tab Content ── */}
      {activeTab === "contractors" ? (
        <ContractorsTab companyId={id!} company={company} />
      ) : (
        <PrincipalEmployerTab companyId={id!} companyName={company?.companyName ?? ""} />
      )}
    </div>
  );
}
