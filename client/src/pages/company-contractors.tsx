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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Company } from "@shared/schema";

type ContractorRow = {
  id: string;
  companyId: string;
  contractorId: string;
  startDate: string;
  contractorName: string;
};

// ─── Searchable company picker ─────────────────────────────────────────────
function CompanySearchPicker({
  companies,
  excludeIds,
  value,
  onChange,
}: {
  companies: Company[];
  excludeIds: Set<string>;
  value: Company | null;
  onChange: (c: Company | null) => void;
}) {
  const [text, setText] = useState(value?.companyName ?? "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(value?.companyName ?? "");
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = companies
    .filter(
      (c) =>
        !excludeIds.has(c.id) &&
        c.companyName.toLowerCase().includes(text.toLowerCase())
    )
    .slice(0, 10);

  function handleInput(val: string) {
    setText(val);
    onChange(null);
    setOpen(val.length > 0);
  }

  function handlePick(c: Company) {
    onChange(c);
    setText(c.companyName);
    setOpen(false);
  }

  function handleClear() {
    setText("");
    onChange(null);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Type company name to search..."
          value={text}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => text.length > 0 && !value && setOpen(true)}
          className="pl-9 pr-8"
          data-testid="input-contractor-search"
        />
        {text && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">No companies found</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handlePick(c)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                data-testid={`contractor-option-${c.id}`}
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">{c.companyName}</p>
                  {c.legalName !== c.companyName && (
                    <p className="text-xs text-muted-foreground">{c.legalName}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function CompanyContractorsPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [startDate, setStartDate] = useState("");

  // Fetch the parent company
  const { data: company } = useQuery<Company>({
    queryKey: ["/api/companies", id],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  // Fetch all companies for the picker
  const { data: allCompanies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  // Fetch existing contractors
  const { data: contractors = [], isLoading } = useQuery<ContractorRow[]>({
    queryKey: ["/api/companies", id, "contractors"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${id}/contractors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch contractors");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${id}/contractors`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/companies", id, "contractors"] });
      setSelectedCompany(null);
      setStartDate("");
      setShowAddForm(false);
      toast({ title: "Contractor added successfully" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (contractorId: string) => {
      const res = await apiRequest("DELETE", `/api/companies/${id}/contractors/${contractorId}`);
      if (!res.ok) throw new Error("Failed to remove");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", id, "contractors"] });
      toast({ title: "Contractor removed" });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to remove contractor", variant: "destructive" }),
  });

  const existingIds = new Set(contractors.map((c) => c.contractorId));
  const canAdd = selectedCompany && startDate;

  function handleCancel() {
    setShowAddForm(false);
    setSelectedCompany(null);
    setStartDate("");
  }

  return (
    <div className="p-6 space-y-6" data-testid="company-contractors-page">
      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/companies")}
          data-testid="button-back-companies"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <HardHat className="h-6 w-6 text-amber-600" />
            <h1 className="text-2xl font-bold">Contractors</h1>
          </div>
          {company && (
            <p className="text-muted-foreground text-sm mt-0.5">
              Managing contractors for{" "}
              <span className="font-medium text-foreground">{company.companyName}</span>
            </p>
          )}
        </div>
        <Button
          onClick={() => setShowAddForm(true)}
          disabled={showAddForm}
          data-testid="button-add-contractor"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Contractor
        </Button>
      </div>

      {/* ── Stat card ── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <Users className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-xl font-bold text-amber-800 dark:text-amber-300 leading-none">
              {contractors.length}
            </p>
            <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
              Total Contractors
            </p>
          </div>
        </div>
      </div>

      {/* ── Add Contractor Form (inline panel) ── */}
      {showAddForm && (
        <Card className="border-amber-200 dark:border-amber-800 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-amber-600" />
              Add New Contractor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Company <span className="text-destructive">*</span>
                </label>
                <CompanySearchPicker
                  companies={allCompanies.filter((c) => c.id !== id)}
                  excludeIds={existingIds}
                  value={selectedCompany}
                  onChange={setSelectedCompany}
                />
                {selectedCompany && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {selectedCompany.legalName}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Start Date <span className="text-destructive">*</span>
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-contractor-start-date"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={!canAdd || addMutation.isPending}
                data-testid="button-submit-add-contractor"
              >
                {addMutation.isPending ? "Adding..." : "Add Contractor"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Contractors Table ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Contractor List</CardTitle>
            <Badge variant="secondary">{contractors.length} contractor{contractors.length !== 1 ? "s" : ""}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-8 w-8" />
                </div>
              ))}
            </div>
          ) : contractors.length === 0 ? (
            <div className="text-center py-14">
              <HardHat className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-40" />
              <h3 className="text-lg font-medium mb-1">No contractors yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Click "Add Contractor" to associate a company as a contractor.
              </p>
              <Button onClick={() => setShowAddForm(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Contractor
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-14 text-center pl-6">Sr.</TableHead>
                  <TableHead>Contractor Company</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractors.map((contractor, idx) => (
                  <TableRow
                    key={contractor.contractorId}
                    data-testid={`contractor-row-${contractor.contractorId}`}
                    className="hover:bg-muted/30"
                  >
                    <TableCell className="text-center pl-6 text-muted-foreground font-medium text-sm">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-md bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                          <HardHat className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="font-medium">{contractor.contractorName}</p>
                          <p className="text-xs text-muted-foreground">
                            Contractor ID: {contractor.contractorId.slice(0, 8)}…
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{contractor.startDate}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-xs text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:bg-amber-950/30"
                      >
                        Active
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Remove ${contractor.contractorName} as a contractor?`)) {
                            removeMutation.mutate(contractor.contractorId);
                          }
                        }}
                        disabled={removeMutation.isPending}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        data-testid={`button-remove-contractor-${contractor.contractorId}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
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
