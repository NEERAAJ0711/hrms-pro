import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, HardHat, Plus, Trash2, Search, Building2,
  X, Users, UserPlus, ChevronDown, ChevronUp, Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Company, Employee, CompanyContractor } from "@shared/schema";

type ContractorRow = {
  id: string; companyId: string; contractorId: string;
  startDate: string; contractorName: string;
};
type PrincipalEmployerRow = CompanyContractor & { companyName: string };
type TaggedEmployee = Employee & { contractorEmployeeId: string; taggedDate: string | null };

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Company Search Dropdown ───────────────────────────────────────────────────
function CompanyPicker({ companies, excludeIds, value, onChange }: {
  companies: Company[]; excludeIds: Set<string>;
  value: Company | null; onChange: (c: Company | null) => void;
}) {
  const [text, setText] = useState(value?.companyName ?? "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setText(value?.companyName ?? ""); }, [value]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const list = companies.filter(c => !excludeIds.has(c.id) && c.companyName.toLowerCase().includes(text.toLowerCase())).slice(0, 10);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input placeholder="Search company…" value={text}
          onChange={e => { setText(e.target.value); onChange(null); setOpen(e.target.value.length > 0); }}
          onFocus={() => text.length > 0 && !value && setOpen(true)}
          className="pl-9 pr-8" data-testid="input-contractor-search" />
        {text && (
          <button type="button" onClick={() => { setText(""); onChange(null); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-52 overflow-y-auto">
          {list.length === 0
            ? <p className="px-3 py-3 text-sm text-muted-foreground">No companies found</p>
            : list.map(c => (
              <button key={c.id} type="button"
                onClick={() => { onChange(c); setText(c.companyName); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
                data-testid={`contractor-option-${c.id}`}>
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium">{c.companyName}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Employee Search Dropdown ──────────────────────────────────────────────────
function EmployeePicker({ employees, excludeIds, value, onChange }: {
  employees: Employee[]; excludeIds: Set<string>;
  value: Employee | null; onChange: (e: Employee | null) => void;
}) {
  const [text, setText] = useState(value ? `${value.firstName} ${value.lastName}` : "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setText(value ? `${value.firstName} ${value.lastName}` : ""); }, [value]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const list = employees.filter(e => {
    const name = `${e.firstName} ${e.lastName}`.toLowerCase();
    const code = (e.employeeCode || "").toLowerCase();
    const q = text.toLowerCase();
    return !excludeIds.has(e.id) && (name.includes(q) || code.includes(q));
  }).slice(0, 10);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input placeholder="Search by name or code…" value={text}
          onChange={e => { setText(e.target.value); onChange(null); setOpen(e.target.value.length > 0); }}
          onFocus={() => text.length > 0 && !value && setOpen(true)}
          className="pl-9 pr-8" data-testid="input-employee-tag-search" />
        {text && (
          <button type="button" onClick={() => { setText(""); onChange(null); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-52 overflow-y-auto">
          {list.length === 0
            ? <p className="px-3 py-3 text-sm text-muted-foreground">
                {employees.length === 0 ? "No employees in this company" : "No match found"}
              </p>
            : list.map(e => (
              <button key={e.id} type="button"
                onClick={() => { onChange(e); setText(`${e.firstName} ${e.lastName}`); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
                data-testid={`employee-option-${e.id}`}>
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
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

// ── Tagged Employees Panel ────────────────────────────────────────────────────
function EmployeesPanel({ companyId, contractor }: { companyId: string; contractor: ContractorRow }) {
  const { toast } = useToast();
  const [selEmp, setSelEmp] = useState<Employee | null>(null);
  const [tagDate, setTagDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: tagged = [], isLoading } = useQuery<TaggedEmployee[]>({
    queryKey: ["/api/companies", companyId, "contractors", contractor.contractorId, "employees"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${companyId}/contractors/${contractor.contractorId}/employees`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: contractorEmps = [] } = useQuery<Employee[]>({
    queryKey: ["/api/companies", contractor.contractorId, "employees"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${contractor.contractorId}/employees`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const tagMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/contractors/${contractor.contractorId}/employees`, { employeeId: selEmp!.id, taggedDate: tagDate });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "contractors", contractor.contractorId, "employees"] });
      setSelEmp(null);
      toast({ title: "Employee tagged successfully" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const untagMut = useMutation({
    mutationFn: async (empId: string) => {
      const res = await apiRequest("DELETE", `/api/companies/${companyId}/contractors/${contractor.contractorId}/employees/${empId}`);
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "contractors", contractor.contractorId, "employees"] });
      toast({ title: "Employee removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove employee", variant: "destructive" }),
  });

  const taggedIds = new Set(tagged.map(e => e.id));

  return (
    <div className="border-t bg-muted/20">

      {/* ── Tag New Employee Form ── */}
      <div className="px-6 py-4 border-b bg-background">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Tag Employee from {contractor.contractorName}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-muted-foreground mb-1">Select Employee</label>
            <EmployeePicker employees={contractorEmps} excludeIds={taggedIds} value={selEmp} onChange={setSelEmp} />
          </div>
          <div className="w-40 shrink-0">
            <label className="block text-xs text-muted-foreground mb-1">Tagging Date</label>
            <Input type="date" value={tagDate} onChange={e => setTagDate(e.target.value)} data-testid="input-tag-date" />
          </div>
          <Button onClick={() => tagMut.mutate()} disabled={!selEmp || !tagDate || tagMut.isPending}
            className="shrink-0" data-testid="button-tag-employee">
            <UserPlus className="h-4 w-4 mr-2" />
            {tagMut.isPending ? "Tagging…" : "Tag Employee"}
          </Button>
        </div>
      </div>

      {/* ── Tagged Employees List ── */}
      <div className="px-6 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Tagged Employees</span>
          <Badge variant="secondary" className="text-xs">{tagged.length}</Badge>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 py-2">
                <Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        ) : tagged.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No employees tagged yet.</p>
            <p className="text-xs mt-1">Use the form above to tag employees from this contractor.</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-10">#</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Emp Code</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Designation</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Tagged On</th>
                  <th className="px-4 py-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {tagged.map((emp, i) => (
                  <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                    data-testid={`tagged-employee-row-${emp.id}`}>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-primary">{emp.employeeCode || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                          {emp.firstName?.[0]}{emp.lastName?.[0]}
                        </div>
                        <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                      {emp.designation || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                      {fmt(emp.taggedDate)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button"
                        onClick={() => { if (confirm(`Remove ${emp.firstName} ${emp.lastName} from this contractor?`)) untagMut.mutate(emp.id); }}
                        disabled={untagMut.isPending}
                        className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        data-testid={`untag-employee-${emp.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Contractors Tab ───────────────────────────────────────────────────────────
function ContractorsTab({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [selCompany, setSelCompany] = useState<Company | null>(null);
  const [startDate, setStartDate] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: allCompanies = [] } = useQuery<Company[]>({ queryKey: ["/api/companies"] });
  const { data: contractors = [], isLoading } = useQuery<ContractorRow[]>({
    queryKey: ["/api/companies", companyId, "contractors"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${companyId}/contractors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/contractors`, { contractorId: selCompany!.id, startDate });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "contractors"] });
      setSelCompany(null); setStartDate(""); setShowForm(false);
      toast({ title: "Contractor added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeMut = useMutation({
    mutationFn: async (contractorId: string) => {
      const res = await apiRequest("DELETE", `/api/companies/${companyId}/contractors/${contractorId}`);
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "contractors"] });
      toast({ title: "Contractor removed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove", variant: "destructive" }),
  });

  const existing = new Set(contractors.map(c => c.contractorId));

  return (
    <div className="space-y-4">

      {/* ── Add Contractor Form ── */}
      {showForm && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Add Contractor Company
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Contractor Company <span className="text-destructive">*</span></label>
              <CompanyPicker companies={allCompanies.filter(c => c.id !== companyId)} excludeIds={existing}
                value={selCompany} onChange={setSelCompany} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Contract Start Date <span className="text-destructive">*</span></label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                data-testid="input-contractor-start-date" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => { setShowForm(false); setSelCompany(null); setStartDate(""); }}>
              Cancel
            </Button>
            <Button onClick={() => addMut.mutate()} disabled={!selCompany || !startDate || addMut.isPending}
              data-testid="button-submit-add-contractor">
              {addMut.isPending ? "Adding…" : "Add Contractor"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Contractor List Card ── */}
      <div className="rounded-lg border bg-card overflow-hidden">

        {/* List Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Contractor Companies</span>
            <Badge variant="secondary">{contractors.length}</Badge>
          </div>
          <Button size="sm" onClick={() => setShowForm(v => !v)} data-testid="button-add-contractor-inline">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Contractor
          </Button>
        </div>

        {/* Table Head */}
        {contractors.length > 0 && (
          <div className="grid grid-cols-[2rem_1fr_auto_auto_auto] items-center gap-4 px-5 py-2.5 bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span>#</span>
            <span>Company Name</span>
            <span className="hidden sm:block">Start Date</span>
            <span className="hidden sm:block">Status</span>
            <span>Actions</span>
          </div>
        )}

        {/* Rows */}
        {isLoading ? (
          <div className="divide-y">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 flex-1 max-w-xs" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-8 w-24 rounded" />
              </div>
            ))}
          </div>
        ) : contractors.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground">
            <HardHat className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">No contractors added yet</p>
            <p className="text-sm mb-4">Click "Add Contractor" to link a contractor company.</p>
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add First Contractor
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {contractors.map((c, i) => {
              const isOpen = expanded === c.contractorId;
              return (
                <div key={c.contractorId} data-testid={`contractor-row-${c.contractorId}`}>
                  {/* Row */}
                  <div className={`grid grid-cols-[2rem_1fr_auto_auto_auto] items-center gap-4 px-5 py-4 transition-colors ${isOpen ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                    <span className="text-sm text-muted-foreground font-medium">{i + 1}</span>

                    <div>
                      <p className="font-semibold text-sm">{c.contractorName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                        ID: {c.contractorId.slice(0, 8)}…
                      </p>
                    </div>

                    <span className="hidden sm:block text-sm text-muted-foreground">{fmt(c.startDate)}</span>

                    <Badge className="hidden sm:inline-flex text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
                      Active
                    </Badge>

                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm"
                        onClick={() => setExpanded(p => p === c.contractorId ? null : c.contractorId)}
                        className={`h-8 gap-1.5 text-xs ${isOpen ? "border-primary text-primary" : ""}`}
                        data-testid={`button-view-employees-${c.contractorId}`}>
                        <Users className="h-3.5 w-3.5" />
                        Employees
                        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="icon"
                        onClick={() => { if (confirm(`Remove "${c.contractorName}" as a contractor?`)) removeMut.mutate(c.contractorId); }}
                        disabled={removeMut.isPending}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        data-testid={`button-remove-contractor-${c.contractorId}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Expandable Employee Panel */}
                  {isOpen && (
                    <EmployeesPanel companyId={companyId} contractor={c} />
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

// ── Principal Employer Tab ────────────────────────────────────────────────────
function PrincipalTab({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: employers = [], isLoading } = useQuery<PrincipalEmployerRow[]>({
    queryKey: ["/api/companies", companyId, "principal-employers"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${companyId}/principal-employers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b">
        <span className="font-semibold text-sm">Principal Employer Companies</span>
        <Badge variant="secondary">{employers.length}</Badge>
      </div>

      {employers.length > 0 && (
        <div className="grid grid-cols-[2rem_1fr_auto_auto_auto] items-center gap-4 px-5 py-2.5 bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <span>#</span><span>Company Name</span>
          <span className="hidden sm:block">Since</span>
          <span className="hidden sm:block">Status</span>
          <span>Actions</span>
        </div>
      )}

      {isLoading ? (
        <div className="divide-y">
          {[1, 2].map(i => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-4 w-4" /><Skeleton className="h-4 flex-1 max-w-xs" />
              <Skeleton className="h-4 w-24" /><Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : employers.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground">
          <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium mb-1">No principal employers</p>
          <p className="text-sm">This company hasn't been tagged as a contractor by another company yet.</p>
        </div>
      ) : (
        <div className="divide-y">
          {employers.map((emp, i) => {
            const isOpen = expanded === emp.id;
            const contractorRow: ContractorRow = {
              id: emp.id, companyId: emp.companyId,
              contractorId: companyId, startDate: emp.startDate, contractorName: companyName,
            };
            return (
              <div key={emp.id} data-testid={`principal-employer-row-${emp.id}`}>
                <div className={`grid grid-cols-[2rem_1fr_auto_auto_auto] items-center gap-4 px-5 py-4 transition-colors ${isOpen ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                  <span className="text-sm text-muted-foreground font-medium">{i + 1}</span>
                  <div>
                    <p className="font-semibold text-sm">{emp.companyName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">ID: {emp.companyId.slice(0, 8)}…</p>
                  </div>
                  <span className="hidden sm:block text-sm text-muted-foreground">{fmt(emp.startDate)}</span>
                  <Badge className="hidden sm:inline-flex text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
                    Active
                  </Badge>
                  <Button variant="outline" size="sm"
                    onClick={() => setExpanded(p => p === emp.id ? null : emp.id)}
                    className={`h-8 gap-1.5 text-xs ${isOpen ? "border-primary text-primary" : ""}`}
                    data-testid={`button-view-employees-pe-${emp.id}`}>
                    <Users className="h-3.5 w-3.5" />
                    Employees
                    {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </div>
                {isOpen && <EmployeesPanel companyId={emp.companyId} contractor={contractorRow} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CompanyContractorsPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"contractors" | "principal">("contractors");

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
    <div className="p-6 space-y-5 max-w-5xl mx-auto" data-testid="company-contractors-page">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/companies")}
          data-testid="button-back-companies">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Contractor Management</h1>
          {company && (
            <p className="text-sm text-muted-foreground">
              Company: <span className="font-medium text-foreground">{company.companyName}</span>
            </p>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("contractors")}
          data-testid="tab-contractors"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
            ${tab === "contractors"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <HardHat className="h-4 w-4" />
          Contractors
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
            ${tab === "contractors" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            {contractors.length}
          </span>
        </button>
        <button
          onClick={() => setTab("principal")}
          data-testid="tab-principal-employer"
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
            ${tab === "principal"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <Briefcase className="h-4 w-4" />
          Principal Employer
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold
            ${tab === "principal" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            {employers.length}
          </span>
        </button>
      </div>

      {/* ── Content ── */}
      {tab === "contractors"
        ? <ContractorsTab companyId={id!} />
        : <PrincipalTab companyId={id!} companyName={company?.companyName ?? ""} />
      }
    </div>
  );
}
