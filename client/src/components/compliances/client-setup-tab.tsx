import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { jsPDF, autoTable } from "@/lib/jspdf-shim";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useSort, sortData } from "@/lib/use-sort";
import { SortableHead } from "@/components/sortable-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldCheck, Search, Save, RefreshCw, CheckCircle2,
  Download, Upload, AlertTriangle, Building2, Trash2, Settings2, Users, ArrowLeft, CheckCircle,
  Briefcase, Plus, UserPlus, UserMinus, CalendarDays, XCircle, FileBarChart2, ChevronDown, FileSpreadsheet,
  Lock, Pencil,
} from "lucide-react";

import {
  MONTHS, MONTHS_SHORT, COMPLIANCE_TYPES, CURRENT_YEAR, YEARS,
  REPORT_STATES, REPORT_ACTS, REPORT_TYPES, WEEKLY_OFF_OPTIONS, OT_TYPE_OPTIONS,
  PAYMENT_MODE_OPTIONS, DIFF_ADJ_OPTIONS, STATUTORY_OPTIONS, BONUS_OPTIONS,
  DEFAULT_CLIENT_FORM, fmt, diff,
} from "./types";
import type {
  EmployeeSetup, EmployeeRow, EditState, WorkmenEmployee, WorkmenRegisterData,
  ClientInfo, FormVIIIData, MusterEmp, MusterRollData, WagesEmp, WagesRegisterData,
  OTEmp, OTRegisterData, ClraPackageData, ComplianceClient, ClientAssignment,
} from "./types";

export function ClientSetupTab({ companyId, isSuperAdmin, toast }: {
  companyId: string; isSuperAdmin: boolean; toast: any;
}) {
  const [clients, setClients] = useState<ComplianceClient[]>([]);
  const [loading, setLoading] = useState(false);

  // Add client dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ ...DEFAULT_CLIENT_FORM });
  const [addSaving, setAddSaving] = useState(false);

  // End project dialog
  const [endClientId, setEndClientId] = useState<string | null>(null);
  const [endDate, setEndDate] = useState("");
  const [endSaving, setEndSaving] = useState(false);

  // Edit client dialog
  const [editClientId, setEditClientId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...DEFAULT_CLIENT_FORM });
  const [editClientSaving, setEditClientSaving] = useState(false);

  // Delete client dialog
  const [deleteClient, setDeleteClient] = useState<ComplianceClient | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // View Assignments dialog
  const [assignClientId, setAssignClientId] = useState<string | null>(null);
  const [assignClientName, setAssignClientName] = useState("");
  const [assignments, setAssignments] = useState<ClientAssignment[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  // Assign new employee within the assignments dialog
  const [assignEmpId, setAssignEmpId] = useState("");
  const [assignDate, setAssignDate] = useState("");
  const [assignDesignation, setAssignDesignation] = useState("");
  const [assignPresentAddress, setAssignPresentAddress] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  // De-assign
  const [deassignId, setDeassignId] = useState<string | null>(null);
  const [deassignDate, setDeassignDate] = useState("");
  const [deassignSaving, setDeassignSaving] = useState(false);

  // Edit assignment (designation + present address + assigned date)
  const [editAssignId, setEditAssignId] = useState<string | null>(null);
  const [editDesignation, setEditDesignation] = useState("");
  const [editPresentAddress, setEditPresentAddress] = useState("");
  const [editAssignDate, setEditAssignDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete assignment
  const [deleteAssignId, setDeleteAssignId] = useState<string | null>(null);
  const [deleteAssignSaving, setDeleteAssignSaving] = useState(false);

  // Assignment list search
  const [assignSearch, setAssignSearch] = useState("");

  // All employees for assignment dropdown
  const [allEmployees, setAllEmployees] = useState<{ id: string; name: string; code: string; designation: string; presentAddress: string }[]>([]);

  const loadClients = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const url = isSuperAdmin
        ? `/api/compliance/clients?companyId=${companyId}`
        : "/api/compliance/clients";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load clients");
      setClients(await res.json());
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }, [companyId, isSuperAdmin, toast]);

  const loadEmployees = useCallback(async () => {
    if (!companyId) return;
    try {
      const url = `/api/compliance/employee-list${companyId ? `?companyId=${companyId}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setAllEmployees(Array.isArray(data) ? data : []);
    } catch (_) {}
  }, [companyId]);

  useEffect(() => { loadClients(); loadEmployees(); }, [loadClients, loadEmployees]);

  const submitAddClient = async () => {
    if (!addForm.projectName.trim()) {
      toast({ title: "Required", description: "Project name is required", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    try {
      const res = await fetch("/api/compliance/clients", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...addForm }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "Failed"); }
      toast({ title: "Client added", description: `${addForm.projectName} created successfully` });
      setAddOpen(false);
      setAddForm({ ...DEFAULT_CLIENT_FORM });
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setAddSaving(false);
  };

  const submitEndProject = async () => {
    if (!endDate) { toast({ title: "Required", description: "Select an end date", variant: "destructive" }); return; }
    setEndSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/${endClientId}/end`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate }),
      });
      if (!res.ok) throw new Error("Failed to end project");
      toast({ title: "Project ended", description: "Project end date saved" });
      setEndClientId(null); setEndDate("");
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setEndSaving(false);
  };

  const openEditClient = (client: ComplianceClient) => {
    setEditClientId(client.id);
    setEditForm({
      projectName: client.project_name || "",
      clientName: client.client_name || "",
      clientAddress: client.client_address || "",
      principalEmployerName: client.principal_employer_name || "",
      principalEmployerAddress: client.principal_employer_address || "",
      natureOfWork: client.nature_of_work || "",
      locationOfWork: client.location_of_work || "",
      projectStartDate: client.project_start_date ? String(client.project_start_date).slice(0, 10) : "",
    });
  };

  const submitEditClient = async () => {
    if (!editForm.projectName.trim()) {
      toast({ title: "Required", description: "Project name is required", variant: "destructive" });
      return;
    }
    setEditClientSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/${editClientId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Failed to update"); }
      toast({ title: "Project updated", description: `${editForm.projectName} saved successfully` });
      setEditClientId(null);
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setEditClientSaving(false);
  };

  const submitDeleteClient = async () => {
    if (!deleteClient) return;
    setDeleteSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/${deleteClient.id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Failed to delete"); }
      toast({ title: "Project deleted", description: `${deleteClient.project_name} removed` });
      setDeleteClient(null);
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeleteSaving(false);
  };

  const openAssignments = async (client: ComplianceClient) => {
    setAssignClientId(client.id);
    setAssignClientName(client.project_name);
    setAssignLoading(true);
    try {
      const res = await fetch(`/api/compliance/clients/${client.id}/employees`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      setAssignments(await res.json());
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setAssignLoading(false);
  };

  const submitAssign = async () => {
    if (!assignEmpId || !assignDate) {
      toast({ title: "Required", description: "Select employee and date", variant: "destructive" }); return;
    }
    setAssignSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/${assignClientId}/assign`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: assignEmpId, assignedDate: assignDate, designation: assignDesignation || undefined, presentAddress: assignPresentAddress || undefined }),
      });
      if (!res.ok) throw new Error("Failed to assign");
      toast({ title: "Assigned", description: "Employee assigned to project" });
      setAssignEmpId(""); setAssignDate(""); setAssignDesignation(""); setAssignPresentAddress("");
      const res2 = await fetch(`/api/compliance/clients/${assignClientId}/employees`, { credentials: "include" });
      setAssignments(await res2.json());
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setAssignSaving(false);
  };

  const submitDeassign = async () => {
    if (!deassignDate) {
      toast({ title: "Required", description: "Select de-assign date", variant: "destructive" }); return;
    }
    setDeassignSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/assignments/${deassignId}/deassign`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deassignedDate: deassignDate }),
      });
      if (!res.ok) throw new Error("Failed to de-assign");
      toast({ title: "De-assigned", description: "Employee de-assigned from project" });
      setDeassignId(null); setDeassignDate("");
      const res2 = await fetch(`/api/compliance/clients/${assignClientId}/employees`, { credentials: "include" });
      setAssignments(await res2.json());
      loadClients();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeassignSaving(false);
  };

  const submitEditAssignment = async () => {
    if (!editAssignId) return;
    if (!editAssignDate) {
      toast({ title: "Date required", description: "Please select the assigned date", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/assignments/${editAssignId}/update`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designation: editDesignation || null, presentAddress: editPresentAddress || null, assignedDate: editAssignDate || null }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "Updated", description: "Assignment details updated successfully" });
      setEditAssignId(null);
      const res2 = await fetch(`/api/compliance/clients/${assignClientId}/employees`, { credentials: "include" });
      setAssignments(await res2.json());
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setEditSaving(false);
  };

  const submitDeleteAssignment = async () => {
    if (!deleteAssignId) return;
    setDeleteAssignSaving(true);
    try {
      const res = await fetch(`/api/compliance/clients/assignments/${deleteAssignId}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Deleted", description: "Assignment removed successfully" });
      setDeleteAssignId(null);
      const res2 = await fetch(`/api/compliance/clients/${assignClientId}/employees`, { credentials: "include" });
      setAssignments(await res2.json());
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setDeleteAssignSaving(false);
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-IN") : "—";
  const toDateInput = (d: string | null) => {
    if (!d) return "";
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0].slice(0, 10) : "";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Client Projects</h2>
          <p className="text-xs text-gray-500">{clients.length} project(s) registered</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1" /> Add Client
        </Button>
      </div>

      {/* Client List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No clients added yet. Click "Add Client" to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs">Project Name</TableHead>
                <TableHead className="text-xs">Client</TableHead>
                <TableHead className="text-xs">Nature / Location</TableHead>
                <TableHead className="text-xs text-center">Start Date</TableHead>
                <TableHead className="text-xs text-center">End Date</TableHead>
                <TableHead className="text-xs text-center">Employees</TableHead>
                <TableHead className="text-xs text-center">Status</TableHead>
                <TableHead className="text-xs text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map(client => (
                <TableRow key={client.id} className="text-sm">
                  <TableCell className="font-medium text-gray-800">{client.project_name}</TableCell>
                  <TableCell className="text-gray-600 text-xs max-w-[150px]">
                    <div className="truncate">{client.client_name || "—"}</div>
                    {client.client_address && <div className="text-gray-400 truncate">{client.client_address}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 max-w-[130px]">
                    <div className="truncate">{client.nature_of_work || "—"}</div>
                    <div className="text-gray-400 truncate">{client.location_of_work || ""}</div>
                  </TableCell>
                  <TableCell className="text-center text-xs text-gray-600">{fmt(client.project_start_date)}</TableCell>
                  <TableCell className="text-center text-xs text-gray-600">{fmt(client.project_end_date)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">{client.active_employees}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={client.status === "active"
                      ? "bg-green-100 text-green-700 text-xs"
                      : "bg-gray-100 text-gray-600 text-xs"}>
                      {client.status === "active" ? "Active" : "Ended"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-center flex-wrap">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                        onClick={() => openAssignments(client)} data-testid={`button-employees-client-${client.id}`}>
                        <Users className="h-3 w-3 mr-1" /> Employees
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                        onClick={() => openEditClient(client)} data-testid={`button-edit-client-${client.id}`}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      {client.status === "active" && (
                        <Button size="sm" variant="outline"
                          className="h-7 px-2 text-xs border-amber-200 text-amber-600 hover:bg-amber-50"
                          onClick={() => { setEndClientId(client.id); setEndDate(""); }}
                          data-testid={`button-end-client-${client.id}`}>
                          <XCircle className="h-3 w-3 mr-1" /> End
                        </Button>
                      )}
                      <Button size="sm" variant="outline"
                        className="h-7 px-2 text-xs border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => setDeleteClient(client)} data-testid={`button-delete-client-${client.id}`}>
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── Add Client Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-blue-600" /> Add New Client Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Project Name <span className="text-red-500">*</span></Label>
              <Input value={addForm.projectName} onChange={e => setAddForm(f => ({ ...f, projectName: e.target.value }))}
                placeholder="e.g. Highway Construction Phase 1" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Project Start Date</Label>
              <Input type="date" value={addForm.projectStartDate}
                onChange={e => setAddForm(f => ({ ...f, projectStartDate: e.target.value }))} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Name of Client</Label>
                <Input value={addForm.clientName} onChange={e => setAddForm(f => ({ ...f, clientName: e.target.value }))}
                  placeholder="Client company name" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Address of Client</Label>
                <Input value={addForm.clientAddress} onChange={e => setAddForm(f => ({ ...f, clientAddress: e.target.value }))}
                  placeholder="Client address" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Name of Principal Employer</Label>
                <Input value={addForm.principalEmployerName}
                  onChange={e => setAddForm(f => ({ ...f, principalEmployerName: e.target.value }))}
                  placeholder="Principal employer name" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Address of Principal Employer</Label>
                <Input value={addForm.principalEmployerAddress}
                  onChange={e => setAddForm(f => ({ ...f, principalEmployerAddress: e.target.value }))}
                  placeholder="Principal employer address" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Nature of Work</Label>
                <Input value={addForm.natureOfWork} onChange={e => setAddForm(f => ({ ...f, natureOfWork: e.target.value }))}
                  placeholder="e.g. Civil Construction" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Location of Work</Label>
                <Input value={addForm.locationOfWork} onChange={e => setAddForm(f => ({ ...f, locationOfWork: e.target.value }))}
                  placeholder="e.g. NH-48, Gurugram" className="h-10" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={submitAddClient} disabled={addSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {addSaving ? "Saving..." : "Add Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── End Project Dialog */}
      <Dialog open={!!endClientId} onOpenChange={() => { setEndClientId(null); setEndDate(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" /> End Project
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-600">Select the project end date. This will mark the project as ended.</p>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">End Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEndClientId(null); setEndDate(""); }}>Cancel</Button>
            <Button onClick={submitEndProject} disabled={endSaving}
              className="bg-red-600 hover:bg-red-700 text-white">
              {endSaving ? "Saving..." : "Confirm End"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Client Dialog */}
      <Dialog open={!!editClientId} onOpenChange={(o) => { if (!o) setEditClientId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" /> Edit Client Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Project Name <span className="text-red-500">*</span></Label>
              <Input value={editForm.projectName} onChange={e => setEditForm(f => ({ ...f, projectName: e.target.value }))}
                placeholder="e.g. Highway Construction Phase 1" className="h-10" data-testid="input-edit-project-name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Project Start Date</Label>
              <Input type="date" value={editForm.projectStartDate}
                onChange={e => setEditForm(f => ({ ...f, projectStartDate: e.target.value }))} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Name of Client</Label>
                <Input value={editForm.clientName} onChange={e => setEditForm(f => ({ ...f, clientName: e.target.value }))}
                  placeholder="Client company name" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Address of Client</Label>
                <Input value={editForm.clientAddress} onChange={e => setEditForm(f => ({ ...f, clientAddress: e.target.value }))}
                  placeholder="Client address" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Name of Principal Employer</Label>
                <Input value={editForm.principalEmployerName}
                  onChange={e => setEditForm(f => ({ ...f, principalEmployerName: e.target.value }))}
                  placeholder="Principal employer name" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Address of Principal Employer</Label>
                <Input value={editForm.principalEmployerAddress}
                  onChange={e => setEditForm(f => ({ ...f, principalEmployerAddress: e.target.value }))}
                  placeholder="Principal employer address" className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Nature of Work</Label>
                <Input value={editForm.natureOfWork} onChange={e => setEditForm(f => ({ ...f, natureOfWork: e.target.value }))}
                  placeholder="e.g. Civil Construction" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Location of Work</Label>
                <Input value={editForm.locationOfWork} onChange={e => setEditForm(f => ({ ...f, locationOfWork: e.target.value }))}
                  placeholder="e.g. NH-48, Gurugram" className="h-10" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClientId(null)}>Cancel</Button>
            <Button onClick={submitEditClient} disabled={editClientSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-save-edit-client">
              {editClientSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Client Dialog */}
      <Dialog open={!!deleteClient} onOpenChange={(o) => { if (!o) setDeleteClient(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" /> Delete Client Project
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <span className="font-semibold">{deleteClient?.project_name}</span>?
              This permanently removes the project and all its employee assignments. This cannot be undone.
            </p>
            {!!deleteClient && deleteClient.active_employees > 0 && (
              <p className="text-xs text-amber-600">
                This project has {deleteClient.active_employees} assigned employee(s); their assignment records will also be removed.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteClient(null)}>Cancel</Button>
            <Button onClick={submitDeleteClient} disabled={deleteSaving}
              className="bg-red-600 hover:bg-red-700 text-white" data-testid="button-confirm-delete-client">
              {deleteSaving ? "Deleting..." : "Delete Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assignments Dialog */}
      <Dialog open={!!assignClientId} onOpenChange={() => { setAssignClientId(null); setAssignments([]); }}>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" /> Employees — {assignClientName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* Assign new employee */}
            <div className="p-3 bg-blue-50 rounded-lg space-y-2">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-600">Assign Employee</Label>
                  <Select value={assignEmpId} onValueChange={v => {
                    setAssignEmpId(v);
                    const emp = allEmployees.find(e => e.id === v);
                    if (emp) {
                      if (!assignDesignation) setAssignDesignation(emp.designation);
                      if (!assignPresentAddress) setAssignPresentAddress(emp.presentAddress);
                    }
                  }}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                    <SelectContent>
                      {allEmployees
                        .filter(e => !assignments.some(a => a.employee_id === e.id && a.status === "active"))
                        .map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-600">Assign Date</Label>
                  <Input type="date" value={assignDate} onChange={e => setAssignDate(e.target.value)} className="h-9 w-40 bg-white" />
                </div>
                <Button size="sm" onClick={submitAssign} disabled={assignSaving}
                  className="h-9 bg-blue-600 hover:bg-blue-700 text-white">
                  <UserPlus className="h-4 w-4 mr-1" /> {assignSaving ? "..." : "Assign"}
                </Button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-600">Designation</Label>
                  <Select value={assignDesignation} onValueChange={setAssignDesignation}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Select designation..." /></SelectTrigger>
                    <SelectContent>
                      {["LABOUR","HELPER","SUPERVISOR","MANAGER","EXECUTIVE","OFFICER","ENGINEER","TECHNICIAN","DRIVER","SECURITY GUARD","HOUSE KEEPING","ACCOUNTANT","CLERK","PEON","SWEEPER","ELECTRICIAN","PLUMBER","MECHANIC","OPERATOR"].map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-gray-600">Present Address</Label>
                  <Input
                    className="h-9 bg-white"
                    placeholder="Enter present address..."
                    value={assignPresentAddress}
                    onChange={e => setAssignPresentAddress(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Assignment list */}
            {assignments.length > 0 && (
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-gray-400 shrink-0" />
                <Input
                  placeholder="Search by name or employee code..."
                  value={assignSearch}
                  onChange={e => setAssignSearch(e.target.value)}
                  className="h-8 text-sm"
                />
                {assignSearch && (
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setAssignSearch("")}>
                    <XCircle className="h-4 w-4 text-gray-400" />
                  </Button>
                )}
              </div>
            )}
            {assignLoading ? (
              <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
            ) : assignments.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">No employees assigned yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs">Employee</TableHead>
                    <TableHead className="text-xs">Designation</TableHead>
                    <TableHead className="text-xs text-center">Assigned Date</TableHead>
                    <TableHead className="text-xs text-center">De-assigned Date</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="text-xs text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.filter(a => {
                    if (!assignSearch.trim()) return true;
                    const q = assignSearch.toLowerCase();
                    return (
                      `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) ||
                      a.employee_code.toLowerCase().includes(q)
                    );
                  }).map(a => (
                    <TableRow key={a.id} className="text-sm">
                      <TableCell>
                        <div className="font-medium text-gray-800">{a.first_name} {a.last_name}</div>
                        <div className="text-xs text-gray-500">{a.employee_code}</div>
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">{a.designation || <span className="text-gray-400 italic">—</span>}</TableCell>
                      <TableCell className="text-center text-xs">{fmt(a.assigned_date)}</TableCell>
                      <TableCell className="text-center text-xs text-gray-500">{fmt(a.deassigned_date)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={a.status === "active"
                          ? "bg-green-100 text-green-700 text-xs"
                          : "bg-gray-100 text-gray-500 text-xs"}>
                          {a.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {a.status === "active" && (
                            <Button size="sm" variant="outline"
                              className="h-7 px-2 text-xs border-blue-200 text-blue-600 hover:bg-blue-50"
                              onClick={() => {
                                setEditAssignId(a.id);
                                setEditDesignation(a.designation || "");
                                setEditPresentAddress(a.present_address || "");
                                setEditAssignDate(toDateInput(a.assigned_date));
                              }}>
                              <Pencil className="h-3 w-3 mr-1" /> Edit
                            </Button>
                          )}
                          {a.status === "active" && (
                            <Button size="sm" variant="outline"
                              className="h-7 px-2 text-xs border-orange-200 text-orange-600 hover:bg-orange-50"
                              onClick={() => { setDeassignId(a.id); setDeassignDate(""); }}>
                              <UserMinus className="h-3 w-3 mr-1" /> De-assign
                            </Button>
                          )}
                          <Button size="sm" variant="outline"
                            className="h-7 px-2 text-xs border-red-200 text-red-600 hover:bg-red-50"
                            onClick={() => setDeleteAssignId(a.id)}>
                            <Trash2 className="h-3 w-3 mr-1" /> Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── De-assign Confirm Dialog */}
      <Dialog open={!!deassignId} onOpenChange={() => { setDeassignId(null); setDeassignDate(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus className="h-5 w-5 text-orange-500" /> De-assign Employee
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-600">Select the date on which this employee is de-assigned from the project.</p>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">De-assign Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={deassignDate} onChange={e => setDeassignDate(e.target.value)} className="h-10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeassignId(null); setDeassignDate(""); }}>Cancel</Button>
            <Button onClick={submitDeassign} disabled={deassignSaving}
              className="bg-orange-600 hover:bg-orange-700 text-white">
              {deassignSaving ? "Saving..." : "Confirm De-assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Assignment Dialog */}
      <Dialog open={!!editAssignId} onOpenChange={() => setEditAssignId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-500" /> Edit Assignment Details
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Designation on this Project</Label>
              <Select value={editDesignation} onValueChange={setEditDesignation}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select designation..." /></SelectTrigger>
                <SelectContent>
                  {["LABOUR","HELPER","SUPERVISOR","MANAGER","EXECUTIVE","OFFICER","ENGINEER","TECHNICIAN","DRIVER","SECURITY GUARD","HOUSE KEEPING","ACCOUNTANT","CLERK","PEON","SWEEPER","ELECTRICIAN","PLUMBER","MECHANIC","OPERATOR"].map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">This overrides the employee's profile designation in all CLRA forms.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Assigned Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={editAssignDate}
                onChange={e => setEditAssignDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Present Address</Label>
              <Input
                value={editPresentAddress}
                onChange={e => setEditPresentAddress(e.target.value)}
                placeholder="Address at project site"
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAssignId(null)}>Cancel</Button>
            <Button onClick={submitEditAssignment} disabled={editSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white">
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Assignment Confirm Dialog */}
      <Dialog open={!!deleteAssignId} onOpenChange={() => setDeleteAssignId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" /> Delete Assignment
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-gray-600">This permanently removes the assignment record from the project. This cannot be undone. To keep history instead, use De-assign.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAssignId(null)}>Cancel</Button>
            <Button onClick={submitDeleteAssignment} disabled={deleteAssignSaving}
              className="bg-red-600 hover:bg-red-700 text-white">
              {deleteAssignSaving ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
