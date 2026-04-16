import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CalendarDays, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Holiday, Company } from "@shared/schema";

const holidayTypeColors: Record<string, string> = {
  public: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  restricted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  optional: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
};

interface HolidayFormData {
  date: string;
  name: string;
  description: string;
  type: string;
  companyId: string;
}

const emptyForm: HolidayFormData = {
  date: "",
  name: "",
  description: "",
  type: "public",
  companyId: "",
};

export default function HolidaysPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const [selectedCompany, setSelectedCompany] = useState<string>(isSuperAdmin ? "__all__" : (user?.companyId || ""));
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [deletingHoliday, setDeletingHoliday] = useState<Holiday | null>(null);
  const [formData, setFormData] = useState<HolidayFormData>(emptyForm);

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const queryKey = isSuperAdmin && selectedCompany !== "__all__"
    ? ["/api/holidays", `?companyId=${selectedCompany}`]
    : ["/api/holidays"];

  const { data: holidays = [], isLoading } = useQuery<Holiday[]>({
    queryKey,
    queryFn: async () => {
      const url = isSuperAdmin && selectedCompany !== "__all__"
        ? `/api/holidays?companyId=${selectedCompany}`
        : "/api/holidays";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch holidays");
      return res.json();
    },
  });

  const filteredHolidays = holidays.filter((h) => h.date.startsWith(selectedYear));

  const createMutation = useMutation({
    mutationFn: async (data: HolidayFormData) => {
      return apiRequest("POST", "/api/holidays", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      setDialogOpen(false);
      setFormData(emptyForm);
      toast({ title: "Holiday Created", description: "Holiday has been added successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<HolidayFormData> }) => {
      return apiRequest("PATCH", `/api/holidays/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      setDialogOpen(false);
      setEditingHoliday(null);
      setFormData(emptyForm);
      toast({ title: "Holiday Updated", description: "Holiday has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/holidays/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holidays"] });
      setDeleteDialogOpen(false);
      setDeletingHoliday(null);
      toast({ title: "Holiday Deleted", description: "Holiday has been deleted successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingHoliday(null);
    setFormData({
      ...emptyForm,
      companyId: isSuperAdmin ? "" : (user?.companyId || ""),
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setFormData({
      date: holiday.date,
      name: holiday.name,
      description: holiday.description || "",
      type: holiday.type,
      companyId: holiday.companyId,
    });
    setDialogOpen(true);
  };

  const handleOpenDelete = (holiday: Holiday) => {
    setDeletingHoliday(holiday);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.date || !formData.companyId) {
      toast({ title: "Validation Error", description: "Name, Date and Company are required.", variant: "destructive" });
      return;
    }
    if (editingHoliday) {
      updateMutation.mutate({ id: editingHoliday.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getCompanyName = (companyId: string) => {
    return companies.find((c) => c.id === companyId)?.companyName || "Unknown";
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => (currentYear - 1 + i).toString());

  return (
    <div className="p-6" data-testid="holidays-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Holiday Calendar</h1>
          <p className="text-muted-foreground">Manage company holidays and observances</p>
        </div>
        <Button onClick={handleOpenCreate} data-testid="button-add-holiday">
          <Plus className="h-4 w-4 mr-2" />
          Add Holiday
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Holidays
              </CardTitle>
              <CardDescription>View and manage holidays for the year</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              {isSuperAdmin && (
                <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                  <SelectTrigger className="w-48" data-testid="select-holiday-company">
                    <SelectValue placeholder="All Companies" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Companies</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>{company.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-32" data-testid="select-holiday-year">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading holidays...</div>
          ) : filteredHolidays.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No holidays found for {selectedYear}. Click "Add Holiday" to create one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">Sr.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  {isSuperAdmin && <TableHead>Company</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHolidays
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((holiday, idx) => (
                    <TableRow key={holiday.id}>
                      <TableCell className="text-center text-muted-foreground font-medium text-sm">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{holiday.date}</TableCell>
                      <TableCell>{holiday.name}</TableCell>
                      <TableCell>
                        <Badge className={holidayTypeColors[holiday.type] || ""} variant="secondary">
                          {holiday.type.charAt(0).toUpperCase() + holiday.type.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{holiday.description || "—"}</TableCell>
                      {isSuperAdmin && <TableCell>{getCompanyName(holiday.companyId)}</TableCell>}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(holiday)} data-testid={`button-edit-holiday-${holiday.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenDelete(holiday)} data-testid={`button-delete-holiday-${holiday.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingHoliday ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
            <DialogDescription>
              {editingHoliday ? "Update the holiday details below." : "Fill in the details to add a new holiday."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isSuperAdmin && (
              <div className="space-y-2">
                <Label>Company</Label>
                <Select value={formData.companyId} onValueChange={(v) => setFormData({ ...formData, companyId: v })}>
                  <SelectTrigger data-testid="select-form-company">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>{company.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                data-testid="input-holiday-date"
              />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Republic Day"
                data-testid="input-holiday-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger data-testid="select-holiday-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                data-testid="input-holiday-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-holiday"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingHoliday ? "Update Holiday" : "Add Holiday"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Holiday</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingHoliday?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletingHoliday && deleteMutation.mutate(deletingHoliday.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
