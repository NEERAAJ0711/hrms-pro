import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import jsPDF from "jspdf";
import { FileText, Send, Eye, CheckCircle, XCircle, Clock, Calendar, MapPin, User, DollarSign, MessageSquare, ThumbsUp, ThumbsDown, Handshake, Briefcase, ArrowRight, Download, Phone, Mail, Award, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { JobPosting, JobApplication, Employee, Company } from "@shared/schema";

const statusColors: Record<string, string> = {
  applied: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  shortlisted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  interview_scheduled: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  interviewed: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
  offered: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  offer_accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  offer_negotiated: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  offer_rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  hired: "bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  withdrawn: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

const statusLabels: Record<string, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview_scheduled: "Interview Scheduled",
  interviewed: "Interviewed",
  offered: "Offer Made",
  offer_accepted: "Offer Accepted",
  offer_negotiated: "Negotiation",
  offer_rejected: "Offer Rejected",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const employmentTypeLabels: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  intern: "Intern",
};

export default function JobApplicationsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isEmployee = user?.role === "employee";

  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedPosting, setSelectedPosting] = useState<JobPosting | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [applicantPhone, setApplicantPhone] = useState("");

  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateRemarks, setUpdateRemarks] = useState("");

  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  const [interviewLocation, setInterviewLocation] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");

  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerSalary, setOfferSalary] = useState("");
  const [offerDesignation, setOfferDesignation] = useState("");
  const [offerTerms, setOfferTerms] = useState("");
  const [offerExpiryDate, setOfferExpiryDate] = useState("");

  const [respondDialogOpen, setRespondDialogOpen] = useState(false);
  const [respondAction, setRespondAction] = useState<string>("");
  const [negotiationNote, setNegotiationNote] = useState("");

  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileApplication, setProfileApplication] = useState<JobApplication | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("__all__");

  const { data: jobPostings = [] } = useQuery<JobPosting[]>({
    queryKey: ["/api/job-postings"],
  });

  const { data: applications = [] } = useQuery<JobApplication[]>({
    queryKey: ["/api/job-applications"],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: !isEmployee,
  });

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const openPostings = jobPostings.filter((jp) => jp.status === "open");

  const applyMutation = useMutation({
    mutationFn: async (data: { jobPostingId: string; coverLetter: string; applicantPhone?: string }) => {
      return apiRequest("POST", "/api/job-applications", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-applications"] });
      setApplyDialogOpen(false);
      setSelectedPosting(null);
      setCoverLetter("");
      setApplicantPhone("");
      toast({ title: "Application Submitted", description: "Your application has been submitted successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PUT", `/api/job-applications/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-applications"] });
      setViewDialogOpen(false);
      setInterviewDialogOpen(false);
      setOfferDialogOpen(false);
      setSelectedApplication(null);
      toast({ title: "Application Updated", description: "Application has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, action, negotiationNote }: { id: string; action: string; negotiationNote?: string }) => {
      return apiRequest("PUT", `/api/job-applications/${id}/respond`, { action, negotiationNote });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-applications"] });
      setRespondDialogOpen(false);
      setSelectedApplication(null);
      setRespondAction("");
      setNegotiationNote("");
      toast({ title: "Response Submitted", description: "Your response has been recorded." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenApply = (posting: JobPosting) => {
    setSelectedPosting(posting);
    setCoverLetter("");
    setApplicantPhone("");
    setApplyDialogOpen(true);
  };

  const handleSubmitApplication = () => {
    if (!selectedPosting) return;
    applyMutation.mutate({
      jobPostingId: selectedPosting.id,
      coverLetter,
      applicantPhone: applicantPhone || undefined,
    });
  };

  const handleViewApplication = (application: JobApplication) => {
    setSelectedApplication(application);
    setUpdateStatus(application.status);
    setUpdateRemarks(application.remarks || "");
    setViewDialogOpen(true);
  };

  const handleUpdateStatus = () => {
    if (!selectedApplication) return;
    updateMutation.mutate({
      id: selectedApplication.id,
      data: { status: updateStatus, remarks: updateRemarks },
    });
  };

  const handleOpenInterview = (application: JobApplication) => {
    setSelectedApplication(application);
    setInterviewDate(application.interviewDate || "");
    setInterviewTime(application.interviewTime || "");
    setInterviewLocation(application.interviewLocation || "");
    setInterviewerName(application.interviewerName || "");
    setInterviewNotes(application.interviewNotes || "");
    setInterviewDialogOpen(true);
  };

  const handleScheduleInterview = () => {
    if (!selectedApplication) return;
    updateMutation.mutate({
      id: selectedApplication.id,
      data: {
        status: "interview_scheduled",
        interviewDate,
        interviewTime,
        interviewLocation,
        interviewerName,
        interviewNotes,
        remarks: `Interview scheduled for ${interviewDate} at ${interviewTime}`,
      },
    });
  };

  const handleOpenOffer = (application: JobApplication) => {
    setSelectedApplication(application);
    setOfferSalary(application.offerSalary || "");
    setOfferDesignation(application.offerDesignation || "");
    setOfferTerms(application.offerTerms || "");
    setOfferExpiryDate(application.offerExpiryDate || "");
    setOfferDialogOpen(true);
  };

  const handleMakeOffer = () => {
    if (!selectedApplication) return;
    updateMutation.mutate({
      id: selectedApplication.id,
      data: {
        status: "offered",
        offerSalary,
        offerDesignation,
        offerTerms,
        offerExpiryDate,
        remarks: `Offer extended: ${offerDesignation} at ${offerSalary}`,
      },
    });
  };

  const handleOpenRespond = (application: JobApplication, action: string) => {
    setSelectedApplication(application);
    setRespondAction(action);
    setNegotiationNote("");
    setRespondDialogOpen(true);
  };

  const handleSubmitResponse = () => {
    if (!selectedApplication || !respondAction) return;
    respondMutation.mutate({
      id: selectedApplication.id,
      action: respondAction,
      negotiationNote: negotiationNote || undefined,
    });
  };

  const handleViewCandidateProfile = (application: JobApplication) => {
    setProfileApplication(application);
    setProfileDialogOpen(true);
  };

  const handleDownloadProfile = async () => {
    if (!profileApplication) return;
    setIsDownloading(true);
    try {
      const app = profileApplication;
      const name = getApplicantName(app);
      const jobTitle = getJobTitle(app.jobPostingId);
      const posting = jobPostings.find(jp => jp.id === app.jobPostingId);
      const emp = app.employeeId ? employees.find(e => e.id === app.employeeId) : null;
      const companyName = getCompanyName(app.companyId);
      const email = app.applicantEmail || emp?.officialEmail || "";
      const phone = app.applicantPhone || emp?.mobileNumber || "";

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw = doc.internal.pageSize.getWidth();
      const M = 15;           // left/right margin
      const CW = pw - M * 2;  // content width
      const PAGE_H = 287;
      let y = 0;

      // ─── Helpers ────────────────────────────────────────────────────────────
      const checkY = (need: number) => {
        if (y + need > PAGE_H - 12) { doc.addPage(); y = 20; }
      };

      // Auto-numbered sections
      let secNum = 0;
      const section = (title: string, r: number, g: number, b: number) => {
        secNum += 1;
        checkY(14);
        // Dark filled bar
        doc.setFillColor(r, g, b);
        doc.rect(M, y, CW, 9, "F");
        // Left accent strip (slightly darker)
        doc.setFillColor(Math.max(0, r - 30), Math.max(0, g - 30), Math.max(0, b - 30));
        doc.rect(M, y, 4, 9, "F");
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
        doc.text(`${secNum}.  ${title.toUpperCase()}`, M + 7, y + 6.2);
        y += 11;
      };

      // Two-column key/value grid (only ASCII)
      const grid = (rows: [string, string][], bgR = 247, bgG = 249, bgB = 252) => {
        const half = CW / 2;
        const pad = 3;
        doc.setFillColor(bgR, bgG, bgB);
        // Draw a background rect — we'll extend it row by row
        const startY = y;
        let rowMaxH = 0;
        rows.forEach(([label, val], i) => {
          const col = i % 2;
          if (col === 0 && i > 0) { y += rowMaxH + 4; rowMaxH = 0; }
          const x = M + col * half;
          doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(130, 130, 130);
          doc.text(label.toUpperCase(), x + pad, y + 3);
          doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 15, 15);
          const wrapped = doc.splitTextToSize(val || "—", half - pad * 2 - 2);
          doc.text(wrapped, x + pad, y + 8);
          const h = wrapped.length * 4.5 + 5;
          if (h > rowMaxH) rowMaxH = h;
        });
        y += rowMaxH + 4;
        // Fill background behind the whole block retroactively
        doc.setFillColor(bgR, bgG, bgB);
        doc.rect(M, startY, CW, y - startY, "F");
        // Redraw text on top of bg
        let rY = startY;
        let rMaxH = 0;
        rows.forEach(([label, val], i) => {
          const col = i % 2;
          if (col === 0 && i > 0) { rY += rMaxH + 4; rMaxH = 0; }
          const x = M + col * (CW / 2);
          doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(130, 130, 130);
          doc.text(label.toUpperCase(), x + pad, rY + 3);
          doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 15, 15);
          const wrapped = doc.splitTextToSize(val || "—", CW / 2 - pad * 2 - 2);
          doc.text(wrapped, x + pad, rY + 8);
          const h = wrapped.length * 4.5 + 5;
          if (h > rMaxH) rMaxH = h;
        });
        // Subtle bottom border
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.2);
        doc.line(M, y, M + CW, y);
        y += 5;
      };

      const paragraph = (text: string) => {
        doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
        const lines = doc.splitTextToSize(text.trim(), CW - 4);
        lines.forEach((line: string) => { checkY(5.5); doc.text(line, M + 2, y); y += 5.5; });
        y += 3;
      };

      const subLabel = (label: string) => {
        doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(100, 100, 100);
        doc.text(label, M + 2, y); y += 4;
      };

      // ─── HEADER ─────────────────────────────────────────────────────────────
      // Deep blue top band
      doc.setFillColor(17, 44, 114);
      doc.rect(0, 0, pw, 50, "F");
      // Lighter accent stripe at bottom of header
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 40, pw, 10, "F");

      // Initials circle
      const AVATAR_CX = M + 14;
      const AVATAR_CY = 25;
      doc.setFillColor(37, 99, 235);
      doc.circle(AVATAR_CX, AVATAR_CY, 14, "F");
      doc.setFillColor(255, 255, 255);
      doc.circle(AVATAR_CX, AVATAR_CY, 13, "F");
      const initials = name.split(" ").filter(Boolean).map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
      doc.setFontSize(15); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 44, 114);
      doc.text(initials, AVATAR_CX, AVATAR_CY + 5, { align: "center" });

      const TX = M + 32;
      // Candidate name
      doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
      doc.text(name, TX, 14);

      // Position + company
      doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 205, 255);
      const posLine = companyName ? `${jobTitle}   |   ${companyName}` : jobTitle;
      doc.text(posLine, TX, 22);

      // Contact details — plain ASCII only (NO emoji)
      const contactParts: string[] = [];
      if (email) contactParts.push(`Email: ${email}`);
      if (phone) contactParts.push(`Phone: ${phone}`);
      if (emp?.employeeCode) contactParts.push(`Emp#: ${emp.employeeCode}`);
      doc.setFontSize(8); doc.setTextColor(160, 195, 255);
      doc.text(contactParts.join("     "), TX, 30);

      // Applied date (left) and status badge (right)
      const appliedStr = `Applied: ${new Date(app.appliedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
      doc.setFontSize(8); doc.setTextColor(160, 195, 255);
      doc.text(appliedStr, TX, 37);

      // Status badge
      const statusLabel = (statusLabels[app.status] || app.status).toUpperCase();
      doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
      const bw = doc.getTextWidth(statusLabel) + 10;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(pw - M - bw, 9, bw, 8, 2, 2, "F");
      doc.setTextColor(17, 44, 114);
      doc.text(statusLabel, pw - M - bw / 2, 14.5, { align: "center" });

      y = 58;

      // ─── 1. APPLICATION DETAILS ──────────────────────────────────────────────
      section("Application Details", 30, 64, 175);
      const appRows: [string, string][] = [
        ["Position Applied", jobTitle],
        ["Department", posting?.department || emp?.department || "—"],
        ["Location", posting?.location || emp?.location || "—"],
        ["Employment Type", employmentTypeLabels[posting?.employmentType || ""] || posting?.employmentType || "—"],
        ["Date Applied", new Date(app.appliedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })],
        ["Current Status", statusLabels[app.status] || app.status],
      ];
      if (posting?.salaryRange) appRows.push(["Salary Range", posting.salaryRange]);
      if (posting?.closingDate) appRows.push(["Closing Date", posting.closingDate]);
      grid(appRows);

      // ─── 2. PERSONAL INFORMATION ─────────────────────────────────────────────
      section("Personal Information", 67, 56, 202);
      grid([
        ["Full Name", name],
        ["Email Address", email || "—"],
        ["Mobile Number", phone || "—"],
        ["Gender", emp?.gender ? emp.gender.charAt(0).toUpperCase() + emp.gender.slice(1) : "—"],
        ["Date of Birth", emp?.dateOfBirth || "—"],
        ["Father / Husband Name", emp?.fatherHusbandName || "—"],
      ], 248, 246, 255);

      // ─── 3. EMPLOYMENT DETAILS (only if registered employee) ─────────────────
      if (emp) {
        section("Employment Details", 5, 105, 120);
        grid([
          ["Employee Code", emp.employeeCode || "—"],
          ["Designation", emp.designation || "—"],
          ["Department", emp.department || "—"],
          ["Date of Joining", emp.dateOfJoining || "—"],
          ["Employment Type", emp.employmentType ? emp.employmentType.charAt(0).toUpperCase() + emp.employmentType.slice(1) : "—"],
          ["Work Location", emp.location || "—"],
          ["Official Email", emp.officialEmail || "—"],
          ["Employment Status", emp.status ? emp.status.charAt(0).toUpperCase() + emp.status.slice(1) : "—"],
        ], 240, 252, 250);
      }

      // ─── 4. ADDRESS DETAILS ───────────────────────────────────────────────────
      const presentAddr = [emp?.presentAddress, emp?.presentDistrict, emp?.presentState, emp?.presentPincode].filter(Boolean).join(", ");
      const permAddr = [emp?.permanentAddress, emp?.permanentDistrict, emp?.permanentState, emp?.permanentPincode].filter(Boolean).join(", ");
      if (presentAddr || permAddr) {
        section("Address Details", 154, 72, 6);
        doc.setFillColor(255, 250, 245);
        doc.rect(M, y, CW, (presentAddr && permAddr ? 22 : 12), "F");
        if (presentAddr) { subLabel("Present Address"); paragraph(presentAddr); }
        if (permAddr) { subLabel("Permanent Address"); paragraph(permAddr); }
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.2);
        doc.line(M, y, M + CW, y); y += 5;
      }

      // ─── COVER LETTER ─────────────────────────────────────────────────────────
      if (app.coverLetter) {
        section("Cover Letter", 124, 45, 218);
        doc.setFillColor(251, 248, 255);
        const clLines = doc.splitTextToSize(app.coverLetter.trim(), CW - 4);
        doc.rect(M, y, CW, clLines.length * 5.5 + 6, "F");
        paragraph(app.coverLetter);
      }

      // ─── INTERVIEW DETAILS ────────────────────────────────────────────────────
      if (app.interviewDate) {
        section("Interview Details", 91, 33, 182);
        grid([
          ["Interview Date", app.interviewDate],
          ["Interview Time", app.interviewTime || "—"],
          ["Location / Mode", app.interviewLocation || "—"],
          ["Interviewer Name", app.interviewerName || "—"],
        ], 249, 246, 255);
        if (app.interviewNotes) { subLabel("Interview Notes"); paragraph(app.interviewNotes); }
      }

      // ─── OFFER DETAILS ────────────────────────────────────────────────────────
      if (app.offerDesignation || app.offerSalary) {
        section("Offer Details", 3, 105, 72);
        grid([
          ["Designation Offered", app.offerDesignation || "—"],
          ["Offered Salary / CTC", app.offerSalary || "—"],
          ["Offer Expiry Date", app.offerExpiryDate || "—"],
          ["Candidate Response", statusLabels[app.status] || app.status],
        ], 240, 253, 244);
        if (app.offerTerms) { subLabel("Terms and Conditions"); paragraph(app.offerTerms); }
        if (app.negotiationNote) { subLabel("Negotiation Note"); paragraph(app.negotiationNote); }
        if (app.employeeResponse) { subLabel("Employee Response"); paragraph(app.employeeResponse); }
      }

      // ─── HR REMARKS ───────────────────────────────────────────────────────────
      if (app.remarks) {
        section("HR Remarks", 63, 75, 95);
        doc.setFillColor(248, 249, 251);
        const rmLines = doc.splitTextToSize(app.remarks.trim(), CW - 4);
        doc.rect(M, y, CW, rmLines.length * 5.5 + 6, "F");
        paragraph(app.remarks);
      }

      // ─── DECLARATION ─────────────────────────────────────────────────────────
      checkY(20);
      y += 4;
      doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
      doc.setFillColor(250, 250, 252);
      doc.roundedRect(M, y, CW, 16, 2, 2, "FD");
      doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(110, 110, 110);
      doc.text("This is a system-generated Candidate Profile Report from HRMS Pro.", M + 4, y + 6);
      doc.text("All information is sourced from the applicant submission and company records.", M + 4, y + 11);
      y += 20;

      // ─── FOOTER on all pages ──────────────────────────────────────────────────
      const totalPages = (doc.internal as any).getNumberOfPages();
      const genTime = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        // Footer background strip
        doc.setFillColor(17, 44, 114);
        doc.rect(0, 289, pw, 10, "F");
        doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 205, 255);
        doc.text(`HRMS Pro  |  Candidate: ${name}  |  Generated: ${genTime}`, M, 295);
        doc.text(`Page ${p} of ${totalPages}`, pw - M, 295, { align: "right" });
      }

      const safeFilename = name.replace(/[^a-zA-Z0-9]/g, "_");
      doc.save(`Candidate_Profile_${safeFilename}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      toast({ title: "Download Failed", description: "Could not generate PDF. Please try again.", variant: "destructive" });
    }
    setIsDownloading(false);
  };

  const hasApplied = (postingId: string) => {
    return applications.some((app) => app.jobPostingId === postingId);
  };

  const getApplicantName = (app: JobApplication) => {
    if (app.applicantName) return app.applicantName;
    if (app.employeeId) {
      const emp = employees.find((e) => e.id === app.employeeId);
      return emp ? `${emp.firstName} ${emp.lastName}` : "Unknown";
    }
    return "Unknown";
  };

  const getJobTitle = (jobPostingId: string) => {
    return jobPostings.find((jp) => jp.id === jobPostingId)?.title || "Unknown Position";
  };

  const getCompanyName = (companyId: string) => {
    return companies.find((c) => c.id === companyId)?.companyName || "";
  };

  const filteredApplications = statusFilter === "__all__"
    ? applications
    : applications.filter(a => a.status === statusFilter);

  if (isEmployee) {
    return (
      <div className="p-6" data-testid="job-applications-page">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Careers</h1>
            <p className="text-muted-foreground">Browse open positions and track your applications</p>
          </div>
        </div>

        <Tabs defaultValue="positions">
          <TabsList>
            <TabsTrigger value="positions">Open Positions</TabsTrigger>
            <TabsTrigger value="applications">My Applications ({applications.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="positions">
            {openPostings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No Open Positions</h3>
                <p>Check back later for new opportunities.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
                {openPostings.map((posting) => (
                  <Card key={posting.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{posting.title}</CardTitle>
                          <CardDescription>
                            {getCompanyName(posting.companyId)}
                            {posting.department ? ` - ${posting.department}` : ""}
                          </CardDescription>
                        </div>
                        {hasApplied(posting.id) && (
                          <Badge className={statusColors.applied} variant="secondary">
                            Applied
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm space-y-1">
                        {posting.location && (
                          <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {posting.location}</p>
                        )}
                        <p className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {employmentTypeLabels[posting.employmentType || "full_time"] || posting.employmentType}</p>
                        {posting.salaryRange && (
                          <p className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {posting.salaryRange}</p>
                        )}
                        {posting.vacancies && posting.vacancies > 1 && (
                          <p className="flex items-center gap-1"><User className="h-3 w-3" /> {posting.vacancies} vacancies</p>
                        )}
                        {posting.closingDate && (
                          <p className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Closes: {posting.closingDate}</p>
                        )}
                      </div>
                      {posting.description && (
                        <p className="text-sm text-muted-foreground line-clamp-3">{posting.description}</p>
                      )}
                      <Button
                        className="w-full"
                        onClick={() => handleOpenApply(posting)}
                        disabled={hasApplied(posting.id)}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {hasApplied(posting.id) ? "Already Applied" : "Apply Now"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="applications">
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  My Applications
                </CardTitle>
                <CardDescription>Track the status of your submitted applications</CardDescription>
              </CardHeader>
              <CardContent>
                {applications.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    You haven't submitted any applications yet. Browse open positions to get started.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {applications.map((app) => {
                      const posting = jobPostings.find(jp => jp.id === app.jobPostingId);
                      return (
                        <Card key={app.id} className="border">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h3 className="font-semibold">{getJobTitle(app.jobPostingId)}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {getCompanyName(app.companyId)}
                                  {posting?.department ? ` - ${posting.department}` : ""}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">Applied: {new Date(app.appliedAt).toLocaleDateString()}</p>
                              </div>
                              <Badge className={statusColors[app.status] || ""} variant="secondary">
                                {statusLabels[app.status] || app.status}
                              </Badge>
                            </div>

                            {app.status === "interview_scheduled" && app.interviewDate && (
                              <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-3 mb-3">
                                <p className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-1">Interview Scheduled</p>
                                <div className="text-sm text-purple-700 dark:text-purple-300 space-y-1">
                                  <p className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {app.interviewDate} {app.interviewTime && `at ${app.interviewTime}`}</p>
                                  {app.interviewLocation && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {app.interviewLocation}</p>}
                                  {app.interviewerName && <p className="flex items-center gap-1"><User className="h-3 w-3" /> Interviewer: {app.interviewerName}</p>}
                                  {app.interviewNotes && <p className="text-xs mt-1">{app.interviewNotes}</p>}
                                </div>
                              </div>
                            )}

                            {app.status === "offered" && (
                              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-3">
                                <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">Offer Details</p>
                                <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                                  {app.offerDesignation && <p className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {app.offerDesignation}</p>}
                                  {app.offerSalary && <p className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {app.offerSalary}</p>}
                                  {app.offerTerms && <p className="text-xs">{app.offerTerms}</p>}
                                  {app.offerExpiryDate && <p className="text-xs">Offer expires: {app.offerExpiryDate}</p>}
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <Button size="sm" onClick={() => handleOpenRespond(app, "accept")} className="bg-green-600 hover:bg-green-700">
                                    <ThumbsUp className="h-3 w-3 mr-1" /> Accept
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => handleOpenRespond(app, "negotiate")}>
                                    <Handshake className="h-3 w-3 mr-1" /> Negotiate
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleOpenRespond(app, "reject")}>
                                    <ThumbsDown className="h-3 w-3 mr-1" /> Decline
                                  </Button>
                                </div>
                              </div>
                            )}

                            {app.remarks && (
                              <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                                <span className="font-medium">Remarks:</span> {app.remarks}
                              </p>
                            )}

                            {app.status !== "withdrawn" && !["offer_accepted", "offer_rejected", "hired", "rejected"].includes(app.status) && (
                              <div className="flex justify-end mt-2">
                                <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => handleOpenRespond(app, "withdraw")}>
                                  Withdraw Application
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apply for {selectedPosting?.title}</DialogTitle>
              <DialogDescription>
                {selectedPosting && getCompanyName(selectedPosting.companyId)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Phone Number (optional)</Label>
                <Input
                  value={applicantPhone}
                  onChange={(e) => setApplicantPhone(e.target.value)}
                  placeholder="Your phone number"
                />
              </div>
              <div className="space-y-2">
                <Label>Cover Letter</Label>
                <Textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Tell the employer why you're a good fit for this role..."
                  rows={6}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitApplication} disabled={applyMutation.isPending}>
                <Send className="h-4 w-4 mr-2" />
                {applyMutation.isPending ? "Submitting..." : "Submit Application"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={respondDialogOpen} onOpenChange={setRespondDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {respondAction === "accept" && "Accept Offer"}
                {respondAction === "negotiate" && "Negotiate Offer"}
                {respondAction === "reject" && "Decline Offer"}
                {respondAction === "withdraw" && "Withdraw Application"}
              </DialogTitle>
              <DialogDescription>
                {respondAction === "accept" && "Confirm that you would like to accept this offer."}
                {respondAction === "negotiate" && "Provide your counter-offer or conditions."}
                {respondAction === "reject" && "Are you sure you want to decline this offer?"}
                {respondAction === "withdraw" && "Are you sure you want to withdraw your application?"}
              </DialogDescription>
            </DialogHeader>
            {(respondAction === "negotiate" || respondAction === "reject" || respondAction === "withdraw") && (
              <div className="space-y-2">
                <Label>{respondAction === "negotiate" ? "Your Counter-Offer / Conditions" : "Reason (optional)"}</Label>
                <Textarea
                  value={negotiationNote}
                  onChange={(e) => setNegotiationNote(e.target.value)}
                  placeholder={respondAction === "negotiate" ? "Describe your counter-offer..." : "Reason for your decision..."}
                  rows={4}
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setRespondDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSubmitResponse}
                disabled={respondMutation.isPending}
                variant={respondAction === "reject" || respondAction === "withdraw" ? "destructive" : "default"}
              >
                {respondMutation.isPending ? "Submitting..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-6" data-testid="job-applications-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Recruitment Management</h1>
          <p className="text-muted-foreground">Manage applications, schedule interviews, and make offers</p>
        </div>
        <div className="flex gap-2 items-center">
          <Label className="text-sm">Status:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="shortlisted">Shortlisted</SelectItem>
              <SelectItem value="interview_scheduled">Interview Scheduled</SelectItem>
              <SelectItem value="interviewed">Interviewed</SelectItem>
              <SelectItem value="offered">Offered</SelectItem>
              <SelectItem value="offer_accepted">Offer Accepted</SelectItem>
              <SelectItem value="offer_negotiated">Negotiation</SelectItem>
              <SelectItem value="offer_rejected">Offer Rejected</SelectItem>
              <SelectItem value="hired">Hired</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{applications.length}</p>
            <p className="text-xs text-muted-foreground">Total Applications</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{applications.filter(a => a.status === "interview_scheduled").length}</p>
            <p className="text-xs text-muted-foreground">Interviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{applications.filter(a => ["offered", "offer_accepted"].includes(a.status)).length}</p>
            <p className="text-xs text-muted-foreground">Offers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{applications.filter(a => a.status === "hired").length}</p>
            <p className="text-xs text-muted-foreground">Hired</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            All Applications ({filteredApplications.length})
          </CardTitle>
          <CardDescription>Review, schedule interviews, and manage offers</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredApplications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No applications {statusFilter !== "__all__" ? "with this status" : "received yet"}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">Sr.</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.map((app, idx) => (
                  <TableRow key={app.id}>
                    <TableCell className="text-center text-muted-foreground font-medium text-sm">{idx + 1}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{getApplicantName(app)}</p>
                        {app.applicantEmail && <p className="text-xs text-muted-foreground">{app.applicantEmail}</p>}
                        {app.applicantPhone && <p className="text-xs text-muted-foreground">{app.applicantPhone}</p>}
                      </div>
                    </TableCell>
                    <TableCell>{getJobTitle(app.jobPostingId)}</TableCell>
                    <TableCell className="text-sm">{new Date(app.appliedAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[app.status] || ""} variant="secondary">
                        {statusLabels[app.status] || app.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleViewCandidateProfile(app)} title="View Candidate Profile">
                          <User className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleViewApplication(app)} title="View / Update Status">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {["applied", "shortlisted"].includes(app.status) && (
                          <Button variant="ghost" size="sm" onClick={() => handleOpenInterview(app)} title="Schedule Interview">
                            <Calendar className="h-4 w-4 text-purple-600" />
                          </Button>
                        )}
                        {["interviewed", "shortlisted", "offer_negotiated"].includes(app.status) && (
                          <Button variant="ghost" size="sm" onClick={() => handleOpenOffer(app)} title="Make Offer">
                            <DollarSign className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        {app.status === "offer_accepted" && (
                          <Button variant="ghost" size="sm" onClick={() => {
                            updateMutation.mutate({ id: app.id, data: { status: "hired", remarks: "Candidate hired" } });
                          }} title="Mark as Hired">
                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Candidate Profile Dialog ── */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Candidate Profile
            </DialogTitle>
            <DialogDescription>Full application details for this candidate</DialogDescription>
          </DialogHeader>
          {profileApplication && (() => {
            const app = profileApplication;
            const name = getApplicantName(app);
            const jobTitle = getJobTitle(app.jobPostingId);
            const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
            const posting = jobPostings.find(jp => jp.id === app.jobPostingId);
            return (
              <div id="candidate-profile-print" className="space-y-5">
                {/* Header card */}
                <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
                  <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-foreground">{name}</h2>
                    <p className="text-sm text-muted-foreground font-medium">{jobTitle}</p>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {app.applicantEmail && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />{app.applicantEmail}
                        </span>
                      )}
                      {app.applicantPhone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />{app.applicantPhone}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge className={`${statusColors[app.status] || ""} shrink-0`} variant="secondary">
                    {statusLabels[app.status] || app.status}
                  </Badge>
                </div>

                {/* Application Info */}
                <div className="rounded-xl border overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/60 border-b">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Application Details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-0">
                    {[
                      { label: "Position", value: jobTitle },
                      { label: "Department", value: posting?.department || "—" },
                      { label: "Location", value: posting?.location || "—" },
                      { label: "Employment Type", value: employmentTypeLabels[posting?.employmentType || ""] || posting?.employmentType || "—" },
                      { label: "Applied On", value: new Date(app.appliedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) },
                      { label: "Application Status", value: statusLabels[app.status] || app.status },
                    ].map((row, i) => (
                      <div key={row.label} className={`px-4 py-2.5 text-sm ${i % 2 === 0 ? "border-r" : ""} ${i < 4 ? "border-b" : ""}`}>
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                        <p className="font-medium mt-0.5">{row.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cover Letter */}
                {app.coverLetter && (
                  <div className="rounded-xl border overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/60 border-b">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Cover Letter</span>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{app.coverLetter}</p>
                    </div>
                  </div>
                )}

                {/* Interview Details */}
                {app.interviewDate && (
                  <div className="rounded-xl border border-purple-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 dark:bg-purple-950 border-b border-purple-200">
                      <Calendar className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-semibold text-purple-800 dark:text-purple-200">Interview Details</span>
                    </div>
                    <div className="grid grid-cols-2 gap-0">
                      {[
                        { label: "Interview Date", value: app.interviewDate },
                        { label: "Interview Time", value: app.interviewTime || "—" },
                        { label: "Location / Mode", value: app.interviewLocation || "—" },
                        { label: "Interviewer", value: app.interviewerName || "—" },
                      ].map((row, i) => (
                        <div key={row.label} className={`px-4 py-2.5 text-sm ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b" : ""}`}>
                          <p className="text-xs text-muted-foreground">{row.label}</p>
                          <p className="font-medium mt-0.5">{row.value}</p>
                        </div>
                      ))}
                    </div>
                    {app.interviewNotes && (
                      <div className="px-4 py-3 border-t bg-muted/30">
                        <p className="text-xs text-muted-foreground mb-1">Interview Notes</p>
                        <p className="text-sm">{app.interviewNotes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Offer Details */}
                {(app.offerDesignation || app.offerSalary) && (
                  <div className="rounded-xl border border-green-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 dark:bg-green-950 border-b border-green-200">
                      <Award className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-semibold text-green-800 dark:text-green-200">Offer Details</span>
                    </div>
                    <div className="grid grid-cols-2 gap-0">
                      {[
                        { label: "Designation", value: app.offerDesignation || "—" },
                        { label: "Offered Salary", value: app.offerSalary || "—" },
                        { label: "Offer Expiry", value: app.offerExpiryDate || "—" },
                        { label: "Offer Status", value: statusLabels[app.status] || app.status },
                      ].map((row, i) => (
                        <div key={row.label} className={`px-4 py-2.5 text-sm ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b" : ""}`}>
                          <p className="text-xs text-muted-foreground">{row.label}</p>
                          <p className="font-medium mt-0.5">{row.value}</p>
                        </div>
                      ))}
                    </div>
                    {app.offerTerms && (
                      <div className="px-4 py-3 border-t bg-muted/30">
                        <p className="text-xs text-muted-foreground mb-1">Terms & Conditions</p>
                        <p className="text-sm">{app.offerTerms}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Remarks */}
                {app.remarks && (
                  <div className="rounded-xl border overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/60 border-b">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Remarks / Notes</span>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{app.remarks}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)} className="sm:mr-auto">
              Close
            </Button>
            <Button onClick={handleDownloadProfile} disabled={isDownloading} className="gap-2">
              <Download className="h-4 w-4" />
              {isDownloading ? "Generating PDF…" : "Download as PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
            <DialogDescription>Review and update this application</DialogDescription>
          </DialogHeader>
          {selectedApplication && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Applicant</p>
                  <p className="text-sm text-muted-foreground">{getApplicantName(selectedApplication)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Position</p>
                  <p className="text-sm text-muted-foreground">{getJobTitle(selectedApplication.jobPostingId)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">{selectedApplication.applicantEmail || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Phone</p>
                  <p className="text-sm text-muted-foreground">{selectedApplication.applicantPhone || "—"}</p>
                </div>
              </div>
              {selectedApplication.coverLetter && (
                <div>
                  <p className="text-sm font-medium">Cover Letter</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded-md">{selectedApplication.coverLetter}</p>
                </div>
              )}
              {selectedApplication.interviewDate && (
                <div className="bg-purple-50 dark:bg-purple-950 rounded-md p-3">
                  <p className="text-sm font-medium text-purple-800 dark:text-purple-200">Interview</p>
                  <p className="text-sm">{selectedApplication.interviewDate} {selectedApplication.interviewTime && `at ${selectedApplication.interviewTime}`}</p>
                  {selectedApplication.interviewLocation && <p className="text-sm">{selectedApplication.interviewLocation}</p>}
                  {selectedApplication.interviewerName && <p className="text-sm">Interviewer: {selectedApplication.interviewerName}</p>}
                </div>
              )}
              {selectedApplication.offerSalary && (
                <div className="bg-green-50 dark:bg-green-950 rounded-md p-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">Offer</p>
                  {selectedApplication.offerDesignation && <p className="text-sm">{selectedApplication.offerDesignation}</p>}
                  <p className="text-sm">Salary: {selectedApplication.offerSalary}</p>
                  {selectedApplication.offerTerms && <p className="text-sm">{selectedApplication.offerTerms}</p>}
                </div>
              )}
              {selectedApplication.negotiationNote && (
                <div className="bg-orange-50 dark:bg-orange-950 rounded-md p-3">
                  <p className="text-sm font-medium text-orange-800 dark:text-orange-200">Candidate's Response</p>
                  <p className="text-sm">{selectedApplication.negotiationNote}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={updateStatus} onValueChange={setUpdateStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="applied">Applied</SelectItem>
                    <SelectItem value="shortlisted">Shortlisted</SelectItem>
                    <SelectItem value="interview_scheduled">Interview Scheduled</SelectItem>
                    <SelectItem value="interviewed">Interviewed</SelectItem>
                    <SelectItem value="offered">Offered</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Remarks</Label>
                <Textarea
                  value={updateRemarks}
                  onChange={(e) => setUpdateRemarks(e.target.value)}
                  placeholder="Add remarks..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStatus} disabled={updateMutation.isPending}>
              <CheckCircle className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={interviewDialogOpen} onOpenChange={setInterviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Interview</DialogTitle>
            <DialogDescription>
              Schedule an interview for {selectedApplication && getApplicantName(selectedApplication)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Interview Date</Label>
                <Input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Interview Time</Label>
                <Input type="time" value={interviewTime} onChange={(e) => setInterviewTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location / Meeting Link</Label>
              <Input value={interviewLocation} onChange={(e) => setInterviewLocation(e.target.value)} placeholder="Office / Zoom link / etc." />
            </div>
            <div className="space-y-2">
              <Label>Interviewer Name</Label>
              <Input value={interviewerName} onChange={(e) => setInterviewerName(e.target.value)} placeholder="Who will conduct the interview" />
            </div>
            <div className="space-y-2">
              <Label>Notes for Candidate</Label>
              <Textarea value={interviewNotes} onChange={(e) => setInterviewNotes(e.target.value)} placeholder="Instructions or preparation tips..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInterviewDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleScheduleInterview} disabled={!interviewDate || updateMutation.isPending}>
              <Calendar className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? "Scheduling..." : "Schedule Interview"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make Offer</DialogTitle>
            <DialogDescription>
              Extend an offer to {selectedApplication && getApplicantName(selectedApplication)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Designation / Role</Label>
              <Input value={offerDesignation} onChange={(e) => setOfferDesignation(e.target.value)} placeholder="e.g. Senior Software Engineer" />
            </div>
            <div className="space-y-2">
              <Label>Salary Package</Label>
              <Input value={offerSalary} onChange={(e) => setOfferSalary(e.target.value)} placeholder="e.g. 12,00,000 per annum" />
            </div>
            <div className="space-y-2">
              <Label>Terms & Conditions</Label>
              <Textarea value={offerTerms} onChange={(e) => setOfferTerms(e.target.value)} placeholder="Notice period, benefits, joining date, etc." rows={4} />
            </div>
            <div className="space-y-2">
              <Label>Offer Expiry Date</Label>
              <Input type="date" value={offerExpiryDate} onChange={(e) => setOfferExpiryDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMakeOffer} disabled={!offerSalary || updateMutation.isPending}>
              <DollarSign className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? "Sending..." : "Send Offer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
