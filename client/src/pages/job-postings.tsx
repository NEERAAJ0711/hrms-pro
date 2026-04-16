import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Briefcase, Plus, Pencil, Trash2, Users } from "lucide-react";
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
import type { JobPosting, Company } from "@shared/schema";

interface CompanyOption { id: string; name: string; }

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  open: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  closed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  on_hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
};

const employmentTypeLabels: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  intern: "Intern",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  on_hold: "On Hold",
};

interface JobPostingFormData {
  title: string;
  department: string;
  location: string;
  employmentType: string;
  description: string;
  requirements: string;
  salaryRange: string;
  vacancies: number;
  status: string;
  closingDate: string;
  companyId?: string;
}

const emptyForm: JobPostingFormData = {
  title: "",
  department: "",
  location: "",
  employmentType: "full_time",
  description: "",
  requirements: "",
  salaryRange: "",
  vacancies: 1,
  status: "draft",
  closingDate: "",
  companyId: "",
};

interface JobApplication {
  id: string;
  jobPostingId: string;
}

export default function JobPostingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingPosting, setEditingPosting] = useState<JobPosting | null>(null);
  const [deletingPosting, setDeletingPosting] = useState<JobPosting | null>(null);
  const [formData, setFormData] = useState<JobPostingFormData>(emptyForm);

  const { data: companies = [] } = useQuery<CompanyOption[]>({
    queryKey: ["/api/companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: user?.role === "super_admin",
  });

  const { data: postings = [], isLoading } = useQuery<JobPosting[]>({
    queryKey: ["/api/job-postings"],
  });

  const { data: applications = [] } = useQuery<JobApplication[]>({
    queryKey: ["/api/job-applications"],
    queryFn: async () => {
      const res = await fetch("/api/job-applications", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const getApplicationCount = (postingId: string) => {
    return applications.filter((a) => a.jobPostingId === postingId).length;
  };

  const filteredPostings = statusFilter === "__all__"
    ? postings
    : postings.filter((p) => p.status === statusFilter);

  const createMutation = useMutation({
    mutationFn: async (data: JobPostingFormData) => {
      return apiRequest("POST", "/api/job-postings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-postings"] });
      setDialogOpen(false);
      setFormData(emptyForm);
      toast({ title: "Job Posting Created", description: "Job posting has been created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<JobPostingFormData> }) => {
      return apiRequest("PUT", `/api/job-postings/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-postings"] });
      setDialogOpen(false);
      setEditingPosting(null);
      setFormData(emptyForm);
      toast({ title: "Job Posting Updated", description: "Job posting has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/job-postings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-postings"] });
      setDeleteDialogOpen(false);
      setDeletingPosting(null);
      toast({ title: "Job Posting Deleted", description: "Job posting has been deleted successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingPosting(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (posting: JobPosting) => {
    setEditingPosting(posting);
    setFormData({
      title: posting.title,
      department: posting.department || "",
      location: posting.location || "",
      employmentType: posting.employmentType || "full_time",
      description: posting.description || "",
      requirements: posting.requirements || "",
      salaryRange: posting.salaryRange || "",
      vacancies: posting.vacancies || 1,
      status: posting.status,
      closingDate: posting.closingDate || "",
    });
    setDialogOpen(true);
  };

  const handleOpenDelete = (posting: JobPosting) => {
    setDeletingPosting(posting);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.description) {
      toast({ title: "Validation Error", description: "Title and Description are required.", variant: "destructive" });
      return;
    }
    if (user?.role === "super_admin" && !editingPosting && !formData.companyId) {
      toast({ title: "Validation Error", description: "Please select a company for this job posting.", variant: "destructive" });
      return;
    }
    if (editingPosting) {
      updateMutation.mutate({ id: editingPosting.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="p-6" data-testid="job-postings-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Job Postings</h1>
          <p className="text-muted-foreground">Manage job postings and recruitment</p>
        </div>
        <Button onClick={handleOpenCreate} data-testid="button-add-job-posting">
          <Plus className="h-4 w-4 mr-2" />
          Add Job Posting
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Job Postings
              </CardTitle>
              <CardDescription>View and manage all job postings</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading job postings...</div>
          ) : filteredPostings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No job postings found. Click "Add Job Posting" to create one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">Sr.</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Employment Type</TableHead>
                  <TableHead>Vacancies</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Posted Date</TableHead>
                  <TableHead>Closing Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPostings
                  .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
                  .map((posting, idx) => {
                    const appCount = getApplicationCount(posting.id);
                    return (
                      <TableRow key={posting.id}>
                        <TableCell className="text-center text-muted-foreground font-medium text-sm">{idx + 1}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {posting.title}
                            {appCount > 0 && (
                              <Badge variant="secondary" className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {appCount}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{posting.department || "—"}</TableCell>
                        <TableCell>{posting.location || "—"}</TableCell>
                        <TableCell>{employmentTypeLabels[posting.employmentType || "full_time"] || posting.employmentType}</TableCell>
                        <TableCell>{posting.vacancies || 1}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[posting.status] || ""} variant="secondary">
                            {statusLabels[posting.status] || posting.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{posting.postedAt || posting.createdAt || "—"}</TableCell>
                        <TableCell>{posting.closingDate || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(posting)} data-testid={`button-edit-posting-${posting.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenDelete(posting)} data-testid={`button-delete-posting-${posting.id}`}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPosting ? "Edit Job Posting" : "Add Job Posting"}</DialogTitle>
            <DialogDescription>
              {editingPosting ? "Update the job posting details below." : "Fill in the details to create a new job posting."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {user?.role === "super_admin" && !editingPosting && (
              <div className="space-y-2">
                <Label>Company *</Label>
                <Select
                  value={formData.companyId || ""}
                  onValueChange={(v) => setFormData({ ...formData, companyId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select company for this posting" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Senior Software Engineer"
                data-testid="input-posting-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="e.g. Engineering"
                  data-testid="input-posting-department"
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. Mumbai, India"
                  data-testid="input-posting-location"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Employment Type</Label>
                <Select value={formData.employmentType} onValueChange={(v) => setFormData({ ...formData, employmentType: v })}>
                  <SelectTrigger data-testid="select-posting-employment-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger data-testid="select-posting-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Job description..."
                rows={4}
                data-testid="input-posting-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Requirements</Label>
              <Textarea
                value={formData.requirements}
                onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                placeholder="Job requirements..."
                rows={4}
                data-testid="input-posting-requirements"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Salary Range</Label>
                <Input
                  value={formData.salaryRange}
                  onChange={(e) => setFormData({ ...formData, salaryRange: e.target.value })}
                  placeholder="e.g. 10-15 LPA"
                  data-testid="input-posting-salary"
                />
              </div>
              <div className="space-y-2">
                <Label>Vacancies</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.vacancies}
                  onChange={(e) => setFormData({ ...formData, vacancies: parseInt(e.target.value) || 1 })}
                  data-testid="input-posting-vacancies"
                />
              </div>
              <div className="space-y-2">
                <Label>Closing Date</Label>
                <Input
                  type="date"
                  value={formData.closingDate}
                  onChange={(e) => setFormData({ ...formData, closingDate: e.target.value })}
                  data-testid="input-posting-closing-date"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-posting"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingPosting ? "Update Posting" : "Add Posting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Job Posting</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingPosting?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletingPosting && deleteMutation.mutate(deletingPosting.id)}
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
