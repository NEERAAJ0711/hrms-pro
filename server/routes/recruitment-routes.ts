// HRMS Pro — API Routes (modularized)
import type { Express, Request, Response, NextFunction } from "express";
import { employeeService, recruitmentService, sendOfferLetterEmail } from "../services";
import { storage } from "../storage";
import { db } from "../db";
import {
  notifications, profileUpdateRequests, users as usersTable,
  contractorEmployees as contractorEmployeesTable, employees,
  insertUserSchema, insertCompanySchema, insertEmployeeSchema, insertAttendanceSchema,
  insertLeaveTypeSchema, insertLeaveRequestSchema, insertSalaryStructureSchema, insertPayrollSchema,
  insertSettingSchema, insertMasterDepartmentSchema, insertMasterDesignationSchema, insertMasterLocationSchema,
  insertEarningHeadSchema, insertDeductionHeadSchema, insertStatutorySettingsSchema, insertTimeOfficePolicySchema,
  insertFnfSettlementSchema, insertHolidaySchema, insertBiometricDeviceSchema, insertJobPostingSchema,
  insertJobApplicationSchema, insertWageGradeSchema, insertContractorMasterSchema
} from "@shared/schema";
import { eq, and, desc, sql, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { createNotification, createNotificationForMany } from "../notifications";
import { addSSEClient, removeSSEClient } from "../sse";
import { setOpenAIKeyOverride, setGeminiKeyOverride, loadAllApiKeysFromDB } from "../ai-service";
import { getAdmsActivityLog, getAdmsActivityLogFromDB, getAdmsServerStatus, processAttlog, processUserRecords } from "../adms";
import * as dnsPromises from "dns/promises";
import multer from "multer";
import { makeFileFilter, DOCUMENT_EXTENSIONS, DATA_EXTENSIONS, APK_EXTENSIONS } from "../upload-security";
import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import {
  requireAuth, requireRole, requireModuleAccess, requireAction,
  userHasAccess, MODULE_ACCESS, formatAge, resolveEmployeeUserId, getHrAdminIds,
  resolveAllowedLocationNames, getAllowedEmployeeIdsForUser,
  validateBiometricDeviceAuth, validateBiometricNetwork,
  upload, docUpload, companyAssetUpload, safeUnlinkCompanyAsset,
  COMPANY_ASSETS_DIR, DOC_UPLOAD_DIR, daysInMonth,
} from "./shared";

export async function registerRecruitmentRoutes(app: Express): Promise<void> {
  app.get("/api/job-postings", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      let postings;
      if (user.role === "super_admin") {
        postings = await recruitmentService.getAllJobPostings();
      } else if (user.role === "employee") {
        if (user.companyId) {
          postings = (await recruitmentService.getJobPostingsByCompany(user.companyId)).filter(p => p.status === "open");
        } else {
          postings = (await recruitmentService.getAllJobPostings()).filter(p => p.status === "open");
        }
      } else if (user.companyId) {
        postings = await recruitmentService.getJobPostingsByCompany(user.companyId);
      } else {
        postings = [];
      }
      res.json(postings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job postings" });
    }
  });

  app.get("/api/job-postings/:id", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const posting = await recruitmentService.getJobPosting(req.params.id);
      if (!posting) return res.status(404).json({ error: "Job posting not found" });
      if (user.role !== "super_admin" && posting.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(posting);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job posting" });
    }
  });

  app.post("/api/job-postings", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "recruiter"), async (req, res) => {
    try {
      const user = (req as any).user;
      const companyId = user.role === "super_admin" ? (req.body.companyId || user.companyId) : user.companyId;
      if (!companyId) return res.status(400).json({ error: "No company assigned. Please assign a company to your account first." });
      const { title, department, location, employmentType, description, requirements, salaryRange, vacancies, status, closingDate } = req.body;
      if (!title || !description) return res.status(400).json({ error: "Title and Description are required." });
      const posting = await recruitmentService.createJobPosting({
        companyId,
        title: String(title),
        department: department ? String(department) : null,
        location: location ? String(location) : null,
        employmentType: employmentType ? String(employmentType) : "full_time",
        description: String(description),
        requirements: requirements ? String(requirements) : null,
        salaryRange: salaryRange ? String(salaryRange) : null,
        vacancies: vacancies ? Number(vacancies) : 1,
        status: status ? String(status) : "draft",
        postedBy: user.id,
        postedAt: new Date().toISOString(),
        closingDate: closingDate ? String(closingDate) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      res.status(201).json(posting);
    } catch (error) {
      console.error("Create job posting error:", error);
      res.status(500).json({ error: "Failed to create job posting" });
    }
  });

  app.put("/api/job-postings/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "recruiter"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await recruitmentService.getJobPosting(req.params.id);
      if (!existing) return res.status(404).json({ error: "Job posting not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const posting = await recruitmentService.updateJobPosting(req.params.id, req.body);
      res.json(posting);
    } catch (error) {
      res.status(500).json({ error: "Failed to update job posting" });
    }
  });

  app.delete("/api/job-postings/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await recruitmentService.getJobPosting(req.params.id);
      if (!existing) return res.status(404).json({ error: "Job posting not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const success = await recruitmentService.deleteJobPosting(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete job posting" });
    }
  });

  // ===== Job Application Routes =====
  app.get("/api/job-applications", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { jobPostingId } = req.query;
      let applications;

      if (user.role === "employee") {
        const byUser = await recruitmentService.getJobApplicationsByUserId(user.id);
        if (user.companyId) {
          const employees = await employeeService.getEmployeesByCompany(user.companyId);
          const myEmployee = employees.find(e => e.userId === user.id);
          if (myEmployee) {
            const byEmployee = await recruitmentService.getJobApplicationsByEmployee(myEmployee.id);
            const ids = new Set(byUser.map(a => a.id));
            applications = [...byUser, ...byEmployee.filter(a => !ids.has(a.id))];
          } else {
            applications = byUser;
          }
        } else {
          applications = byUser;
        }
      } else if (user.role === "super_admin") {
        if (jobPostingId) {
          applications = await recruitmentService.getJobApplicationsByPosting(jobPostingId as string);
        } else {
          applications = await recruitmentService.getAllJobApplications();
        }
      } else if (user.companyId) {
        if (jobPostingId) {
          const posting = await recruitmentService.getJobPosting(jobPostingId as string);
          if (posting && posting.companyId === user.companyId) {
            applications = await recruitmentService.getJobApplicationsByPosting(jobPostingId as string);
          } else {
            applications = [];
          }
        } else {
          applications = await recruitmentService.getJobApplicationsByCompany(user.companyId);
        }
      } else {
        applications = [];
      }
      res.json(applications);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job applications" });
    }
  });

  app.post("/api/job-applications", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const posting = await recruitmentService.getJobPosting(req.body.jobPostingId);
      if (!posting || posting.status !== "open") {
        return res.status(400).json({ error: "Job posting is not accepting applications" });
      }

      let employeeId = null;
      if (user.companyId) {
        const employees = await employeeService.getEmployeesByCompany(user.companyId);
        const myEmployee = employees.find(e => e.userId === user.id);
        if (myEmployee) employeeId = myEmployee.id;
      }

      const existingApps = await recruitmentService.getJobApplicationsByPosting(posting.id);
      const alreadyApplied = existingApps.find(a =>
        a.applicantUserId === user.id || (employeeId && a.employeeId === employeeId)
      );
      if (alreadyApplied) {
        return res.status(400).json({ error: "You have already applied for this position" });
      }

      const data = insertJobApplicationSchema.parse({
        ...req.body,
        companyId: posting.companyId,
        applicantUserId: user.id,
        employeeId,
        applicantName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username,
        applicantEmail: user.email,
        applicantPhone: req.body.applicantPhone || null,
        appliedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      const application = await recruitmentService.createJobApplication(data);
      res.status(201).json(application);
    } catch (error) {
      res.status(500).json({ error: "Failed to submit application" });
    }
  });

  app.put("/api/job-applications/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin", "recruiter"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await recruitmentService.getJobApplication(req.params.id);
      if (!existing) return res.status(404).json({ error: "Application not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const updates = {
        ...req.body,
        reviewedBy: user.id,
        reviewedAt: new Date().toISOString(),
      };
      const application = await recruitmentService.updateJobApplication(req.params.id, updates);

      // Email the candidate when an offer is extended
      if (updates.status === "offered" && existing.applicantEmail) {
        try {
          const posting = await recruitmentService.getJobPosting(existing.jobPostingId);
          await sendOfferLetterEmail({
            to: existing.applicantEmail,
            candidateName: existing.applicantName ?? "Candidate",
            jobTitle: posting?.title ?? null,
            companyId: existing.companyId,
          });
        } catch (err) {
          console.error("[Email] offer letter notify failed:", err);
        }
      }

      res.json(application);
    } catch (error) {
      res.status(500).json({ error: "Failed to update application" });
    }
  });

  app.put("/api/job-applications/:id/respond", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await recruitmentService.getJobApplication(req.params.id);
      if (!existing) return res.status(404).json({ error: "Application not found" });
      if (existing.applicantUserId !== user.id) {
        return res.status(403).json({ error: "You can only respond to your own applications" });
      }
      const { action, negotiationNote } = req.body;
      if (!["accept", "negotiate", "reject", "withdraw"].includes(action)) {
        return res.status(400).json({ error: "Invalid action. Use accept, negotiate, reject, or withdraw" });
      }
      const finalStatuses = ["offer_accepted", "offer_rejected", "hired", "rejected", "withdrawn"];
      if (finalStatuses.includes(existing.status)) {
        return res.status(400).json({ error: "This application is in a final state and cannot be modified" });
      }
      if (["accept", "negotiate", "reject"].includes(action) && existing.status !== "offered") {
        return res.status(400).json({ error: "You can only respond to an active offer" });
      }
      let updates: any = {};
      if (action === "accept") {
        updates = { status: "offer_accepted", employeeResponse: "accepted" };
      } else if (action === "negotiate") {
        updates = { status: "offer_negotiated", employeeResponse: "negotiated", negotiationNote: negotiationNote || "" };
      } else if (action === "reject") {
        updates = { status: "offer_rejected", employeeResponse: "rejected", negotiationNote: negotiationNote || "" };
      } else if (action === "withdraw") {
        updates = { status: "withdrawn", employeeResponse: "withdrawn" };
      }
      const application = await recruitmentService.updateJobApplication(req.params.id, updates);
      res.json(application);
    } catch (error) {
      res.status(500).json({ error: "Failed to respond to application" });
    }
  });

  app.delete("/api/job-applications/:id", requireAuth, requireRole("super_admin", "company_admin", "hr_admin"), async (req, res) => {
    try {
      const user = (req as any).user;
      const existing = await recruitmentService.getJobApplication(req.params.id);
      if (!existing) return res.status(404).json({ error: "Application not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const success = await recruitmentService.deleteJobApplication(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete application" });
    }
  });

  // ===== Employee Duplicate Validation Helper =====
}
