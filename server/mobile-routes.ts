import express from "express";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { generateAccessToken, generateRefreshToken, verifyToken, requireJwtAuth } from "./jwt-auth";
import { insertUserSchema, notifications, profileUpdateRequests } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { createNotification, createNotificationForMany } from "./notifications";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import fs from "fs";
import { matchFaces, loadFaceModels } from "./face-match";

const faceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(process.cwd(), "server/uploads/faces");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}-${Date.now()}${path.extname(file.originalname || ".jpg")}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function registerMobileRoutes(app: Express) {
  app.post("/api/mobile/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      const payload = { userId: user.id, username: user.username, role: user.role, companyId: user.companyId || null };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      res.json({
        accessToken,
        refreshToken,
        user: { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, companyId: user.companyId, status: user.status },
      });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/mobile/auth/signup", async (req: Request, res: Response) => {
    try {
      const { employeeCode, ...rest } = req.body;
      const data = insertUserSchema.parse({ ...rest, role: "employee" });
      const existingUser = await storage.getUserByUsername(data.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      let linkedEmployee: any = null;
      if (employeeCode && typeof employeeCode === "string" && employeeCode.trim()) {
        const allEmps = await storage.getAllEmployees();
        linkedEmployee = allEmps.find(
          (e: any) => e.employeeCode?.trim().toLowerCase() === employeeCode.trim().toLowerCase()
        );
        if (!linkedEmployee) {
          return res.status(400).json({ error: "Employee code not found. Please check with your HR admin." });
        }
        if (linkedEmployee.userId) {
          return res.status(400).json({ error: "This employee code is already linked to another account." });
        }
        data.companyId = linkedEmployee.companyId;
      }

      const user = await storage.createUser(data);

      if (linkedEmployee) {
        await storage.updateEmployee(linkedEmployee.id, { userId: user.id });
      }

      const payload = { userId: user.id, username: user.username, role: user.role, companyId: user.companyId || null };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      res.status(201).json({
        accessToken,
        refreshToken,
        user: { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, companyId: user.companyId, status: user.status },
      });
    } catch (error) {
      res.status(400).json({ error: "Invalid signup data" });
    }
  });

  app.post("/api/mobile/auth/refresh", async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });
      const payload = verifyToken(refreshToken);
      if (!payload) return res.status(401).json({ error: "Invalid or expired refresh token" });
      const user = await storage.getUser(payload.userId);
      if (!user) return res.status(401).json({ error: "User not found" });
      const newPayload = { userId: user.id, username: user.username, role: user.role, companyId: user.companyId || null };
      const newAccessToken = generateAccessToken(newPayload);
      res.json({ accessToken: newAccessToken });
    } catch (error) {
      res.status(500).json({ error: "Token refresh failed" });
    }
  });

  app.get("/api/mobile/auth/me", requireJwtAuth, async (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({ id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, companyId: user.companyId, status: user.status });
  });

  app.get("/api/mobile/profile", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const profile = await storage.getCandidateProfileByUserId(user.id);
      if (!profile) return res.json(null);
      const experiences = await storage.getPreviousExperiencesByCandidate(profile.id);
      res.json({ ...profile, experiences });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.put("/api/mobile/profile", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { firstName, lastName, aadhaar, dateOfBirth, gender, mobileNumber, personalEmail, fatherName, address, addressState, addressDistrict, addressPincode, pan, bankAccount, ifsc, bankName, currentSalary, expectedSalary, skills } = req.body;
      if (!firstName || !lastName) return res.status(400).json({ error: "Name is required" });

      // Employees with companyId go through admin approval flow
      if (user.companyId && user.role === "employee") {
        const requestPayload = {
          firstName, lastName, dateOfBirth, gender, mobileNumber, personalEmail, fatherName,
          address, addressState, addressDistrict, addressPincode,
          pan, bankAccount, ifsc, bankName, currentSalary, expectedSalary, skills,
        };
        const [newRequest] = await db.insert(profileUpdateRequests).values({
          id: randomUUID(),
          userId: user.id,
          companyId: user.companyId,
          status: "pending",
          requestData: JSON.stringify(requestPayload),
          createdAt: new Date().toISOString(),
        }).returning();

        const allUsers = await storage.getAllUsers();
        const adminIds = allUsers
          .filter((u: any) => ["hr_admin", "company_admin", "super_admin"].includes(u.role || "") &&
            (u.role === "super_admin" || u.companyId === user.companyId))
          .map((u: any) => u.id)
          .filter((id: string) => id !== user.id);

        const empName = [firstName, lastName].filter(Boolean).join(" ") || user.username || "An employee";
        await createNotificationForMany(adminIds, {
          companyId: user.companyId,
          type: "profile_update_request",
          title: "Profile Update Request",
          message: `${empName} has submitted a profile update for review.`,
          link: "/profile-requests",
        });

        return res.json({ pending: true, requestId: newRequest.id });
      }

      // Non-employee path: save directly
      const existingProfile = await storage.getCandidateProfileByUserId(user.id);
      if (existingProfile) {
        const updated = await storage.updateCandidateProfile(existingProfile.id, {
          firstName, lastName, dateOfBirth, gender, mobileNumber, personalEmail, fatherName, address, addressState, addressDistrict, addressPincode, pan, bankAccount, ifsc, bankName, currentSalary, expectedSalary, skills,
          updatedAt: new Date().toISOString(),
        });
        await storage.updateUser(user.id, { firstName, lastName });
        return res.json(updated);
      }
      const profile = await storage.createCandidateProfile({
        userId: user.id, firstName, lastName, aadhaar: aadhaar || "", dateOfBirth, gender, mobileNumber, personalEmail, fatherName, address, addressState, addressDistrict, addressPincode, pan, bankAccount, ifsc, bankName, currentSalary, expectedSalary, skills,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await storage.updateUser(user.id, { firstName, lastName });
      res.status(201).json(profile);
    } catch (error) {
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  app.get("/api/mobile/employee", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json(null);
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.json(null);
      const experiences = await storage.getPreviousExperiencesByEmployee(employee.id);
      res.json({ ...employee, experiences });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employee data" });
    }
  });

  app.post("/api/mobile/attendance/clock-in", requireJwtAuth, faceUpload.single("faceImage"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.status(400).json({ error: "You must be assigned to a company" });
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.status(400).json({ error: "Employee record not found" });

      const today = new Date().toISOString().split("T")[0];
      const existingAttendance = await storage.getAttendanceByEmployeeAndDate(employee.id, today);
      if (existingAttendance && existingAttendance.clockIn) {
        return res.status(400).json({ error: "Already clocked in today" });
      }

      const now = new Date().toLocaleTimeString("en-US", { hour12: false });
      const { latitude, longitude, locationAccuracy, locationAddress } = req.body;
      const faceImagePath = req.file ? `/uploads/faces/${req.file.filename}` : null;

      const company = await storage.getCompany(user.companyId);

      let faceVerified = false;
      let faceVerificationNote = "";
      if (company?.faceVerificationEnabled) {
        if (!req.file) {
          return res.status(400).json({ error: "Face photo is required for attendance. Please capture your face." });
        }
        if (!employee.registeredFaceImage) {
          faceVerified = false;
          faceVerificationNote = "Face not registered – attendance marked pending verification";
        } else {
          faceVerified = true;
          faceVerificationNote = "Face verified";
        }
      } else {
        faceVerified = !!req.file;
        faceVerificationNote = req.file ? "Face captured" : "No face photo";
      }

      let gpsVerified = false;
      let gpsDistanceMeters: number | null = null;
      let gpsNote = "";
      if (company?.gpsVerificationEnabled && company?.officeLatitude && company?.officeLongitude) {
        if (!latitude || !longitude) {
          return res.status(400).json({ error: "GPS location is required for attendance. Please enable location services." });
        }
        const offLat = parseFloat(company.officeLatitude);
        const offLon = parseFloat(company.officeLongitude);
        const empLat = parseFloat(latitude);
        const empLon = parseFloat(longitude);
        const R = 6371000;
        const φ1 = (offLat * Math.PI) / 180;
        const φ2 = (empLat * Math.PI) / 180;
        const Δφ = ((empLat - offLat) * Math.PI) / 180;
        const Δλ = ((empLon - offLon) * Math.PI) / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        gpsDistanceMeters = Math.round(R * c);
        const radius = company.officeRadiusMeters ?? 100;
        gpsVerified = gpsDistanceMeters <= radius;
        gpsNote = gpsVerified ? `Within office (${gpsDistanceMeters}m)` : `Outside office radius (${gpsDistanceMeters}m away, limit: ${radius}m)`;
        if (!gpsVerified) {
          return res.status(400).json({ error: `You are ${gpsDistanceMeters}m from the office. Must be within ${radius}m to mark attendance.` });
        }
      } else {
        gpsVerified = !!(latitude && longitude);
        gpsNote = gpsVerified ? "GPS captured" : "No GPS data";
      }

      const attendanceData: any = {
        employeeId: employee.id, companyId: user.companyId, date: today, clockIn: now, status: "present",
        latitude, longitude, locationAccuracy, locationAddress,
        faceImagePath, faceVerified, clockInMethod: "mobile",
        notes: `${faceVerificationNote}. ${gpsNote}`.trim(),
      };

      let record;
      if (existingAttendance) {
        record = await storage.updateAttendance(existingAttendance.id, attendanceData);
      } else {
        record = await storage.createAttendance(attendanceData);
      }
      res.status(existingAttendance ? 200 : 201).json({
        ...record,
        verificationResult: { faceVerified, faceVerificationNote, gpsVerified, gpsDistanceMeters, gpsNote },
      });
    } catch (error) {
      console.error("Clock-in error:", error);
      res.status(500).json({ error: "Failed to clock in" });
    }
  });

  app.post("/api/mobile/attendance/clock-out", requireJwtAuth, faceUpload.single("faceImage"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.status(400).json({ error: "You must be assigned to a company" });
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.status(400).json({ error: "Employee record not found" });

      const today = new Date().toISOString().split("T")[0];
      const existingAttendance = await storage.getAttendanceByEmployeeAndDate(employee.id, today);
      if (!existingAttendance || !existingAttendance.clockIn) {
        return res.status(400).json({ error: "You must clock in first" });
      }
      if (existingAttendance.clockOut) {
        return res.status(400).json({ error: "Already clocked out today" });
      }

      const now = new Date().toLocaleTimeString("en-US", { hour12: false });
      const { latitude, longitude, locationAccuracy } = req.body;
      const faceImagePath = req.file ? `/uploads/faces/${req.file.filename}` : null;

      const clockInTime = existingAttendance.clockIn;
      const [inH, inM] = clockInTime.split(":").map(Number);
      const [outH, outM] = now.split(":").map(Number);
      const workMinutes = (outH * 60 + outM) - (inH * 60 + inM);
      const workHours = `${Math.floor(workMinutes / 60)}:${String(workMinutes % 60).padStart(2, "0")}`;

      const updated = await storage.updateAttendance(existingAttendance.id, {
        clockOut: now, workHours,
        clockOutLatitude: latitude, clockOutLongitude: longitude, clockOutLocationAccuracy: locationAccuracy,
        clockOutFaceImagePath: faceImagePath, clockOutFaceVerified: !!req.file, clockOutMethod: "mobile",
      });
      res.json(updated);
    } catch (error) {
      console.error("Clock-out error:", error);
      res.status(500).json({ error: "Failed to clock out" });
    }
  });

  app.get("/api/mobile/attendance/today", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json(null);
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.json(null);
      const today = new Date().toISOString().split("T")[0];
      const record = await storage.getAttendanceByEmployeeAndDate(employee.id, today);
      res.json(record || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch attendance" });
    }
  });

  app.get("/api/mobile/attendance/history", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.json([]);
      const { month, year } = req.query;
      const records = await storage.getAttendanceByEmployee(employee.id);
      if (month && year) {
        const filtered = records.filter((r: any) => {
          const d = new Date(r.date);
          return d.getMonth() + 1 === parseInt(month as string) && d.getFullYear() === parseInt(year as string);
        });
        return res.json(filtered);
      }
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch attendance history" });
    }
  });

  app.get("/api/mobile/leave-types", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const types = await storage.getLeaveTypesByCompany(user.companyId);
      res.json(types);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leave types" });
    }
  });

  app.get("/api/mobile/leaves/balances", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.json([]);

      const types = await storage.getLeaveTypesByCompany(user.companyId);
      const allRequests = await storage.getLeaveRequestsByCompany(user.companyId);
      const myApproved = allRequests.filter((r: any) => r.employeeId === employee.id && r.status === "approved");

      const balances = types.map((lt: any) => {
        const used = myApproved.filter((r: any) => r.leaveTypeId === lt.id)
          .reduce((sum: number, r: any) => sum + (r.days ?? 1), 0);
        const total = lt.daysAllowed ?? lt.annualEntitlement ?? lt.days ?? 0;
        return {
          leaveTypeId: lt.id,
          leaveTypeName: lt.name,
          total,
          used,
          remaining: Math.max(0, total - used),
        };
      });
      res.json(balances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leave balances" });
    }
  });

  app.get("/api/mobile/leaves", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.json([]);
      const requests = await storage.getLeaveRequestsByCompany(user.companyId);
      const myRequests = requests.filter((r: any) => r.employeeId === employee.id)
        .map((r: any) => ({ ...r, leaveType: r.leaveTypeName ?? r.leaveTypeCode ?? r.leaveTypeId }));
      res.json(myRequests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leaves" });
    }
  });

  app.post("/api/mobile/leaves", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.status(400).json({ error: "No company assigned" });
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.status(400).json({ error: "Employee record not found" });
      const { leaveTypeId, startDate, endDate, reason } = req.body;
      if (!leaveTypeId || !startDate || !endDate) return res.status(400).json({ error: "Leave type, start date, and end date are required" });
      const start = new Date(startDate), end = new Date(endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const request = await storage.createLeaveRequest({ employeeId: employee.id, companyId: user.companyId, leaveTypeId, startDate, endDate, days, reason: reason || "", status: "pending", createdAt: new Date().toISOString() });
      res.status(201).json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to submit leave" });
    }
  });

  app.get("/api/mobile/leave-requests", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.json([]);
      const requests = await storage.getLeaveRequestsByCompany(user.companyId);
      const myRequests = requests.filter((r: any) => r.employeeId === employee.id);
      res.json(myRequests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leave requests" });
    }
  });

  app.post("/api/mobile/leave-requests", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.status(400).json({ error: "No company assigned" });
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.status(400).json({ error: "Employee record not found" });

      const { leaveTypeId, startDate, endDate, reason } = req.body;
      if (!leaveTypeId || !startDate || !endDate) return res.status(400).json({ error: "Leave type, start date, and end date are required" });

      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const request = await storage.createLeaveRequest({
        employeeId: employee.id, companyId: user.companyId, leaveTypeId, startDate, endDate, days,
        reason: reason || "", status: "pending", createdAt: new Date().toISOString(),
      });
      res.status(201).json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to submit leave request" });
    }
  });

  app.get("/api/mobile/job-postings", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const allPostings = await storage.getAllJobPostings();
      const openPostings = allPostings.filter((p: any) => p.status === "open");
      const postsWithCompany = await Promise.all(
        openPostings.map(async (p: any) => {
          const company = await storage.getCompany(p.companyId);
          return { ...p, companyName: company?.companyName || "Unknown" };
        })
      );
      res.json(postsWithCompany);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job postings" });
    }
  });

  app.get("/api/mobile/job-applications", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allApps = await storage.getAllJobApplications();
      const myApps = allApps.filter((a: any) => a.userId === user.id);
      const enriched = await Promise.all(
        myApps.map(async (a: any) => {
          const posting = await storage.getJobPosting(a.jobPostingId);
          const company = posting ? await storage.getCompany(posting.companyId) : null;
          return { ...a, jobTitle: posting?.title || "Unknown", companyName: company?.companyName || "Unknown" };
        })
      );
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job applications" });
    }
  });

  app.post("/api/mobile/job-applications", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { jobPostingId, coverLetter, phone } = req.body;
      if (!jobPostingId) return res.status(400).json({ error: "Job posting ID is required" });

      const allApps = await storage.getAllJobApplications();
      const existing = allApps.find((a: any) => a.userId === user.id && a.jobPostingId === jobPostingId);
      if (existing) return res.status(400).json({ error: "You have already applied for this position" });

      const application = await storage.createJobApplication({
        jobPostingId, applicantUserId: user.id, employeeId: null, coverLetter: coverLetter || "",
        applicantPhone: phone || "", status: "applied", appliedAt: new Date().toISOString(), companyId: "", createdAt: new Date().toISOString(),
      });
      res.status(201).json(application);
    } catch (error) {
      res.status(500).json({ error: "Failed to submit application" });
    }
  });

  app.put("/api/mobile/job-applications/:id/respond", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { action, counterOfferNote } = req.body;
      const appId = req.params.id;

      const allApps = await storage.getAllJobApplications();
      const application = allApps.find((a: any) => a.id === appId);
      if (!application) return res.status(404).json({ error: "Application not found" });
      if (application.applicantUserId !== user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const validActions: Record<string, { fromStatuses: string[]; toStatus: string }> = {
        accept: { fromStatuses: ["offered"], toStatus: "offer_accepted" },
        negotiate: { fromStatuses: ["offered"], toStatus: "offer_negotiated" },
        decline: { fromStatuses: ["offered"], toStatus: "offer_rejected" },
        withdraw: { fromStatuses: ["applied", "shortlisted", "interview_scheduled", "interviewed", "offered", "offer_negotiated"], toStatus: "withdrawn" },
      };

      const actionConfig = validActions[action];
      if (!actionConfig) return res.status(400).json({ error: "Invalid action" });
      if (!actionConfig.fromStatuses.includes(application.status)) {
        return res.status(400).json({ error: `Cannot ${action} when status is ${application.status}` });
      }

      const updates: any = { status: actionConfig.toStatus };
      if (action === "negotiate" && counterOfferNote) {
        updates.counterOfferNote = counterOfferNote;
      }

      const updated = await storage.updateJobApplication(appId as string, updates);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update application" });
    }
  });

  app.get("/api/mobile/dashboard", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const result: any = { user: { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role, companyId: user.companyId } };

      if (user.companyId) {
        const allEmployees = await storage.getEmployeesByCompany(user.companyId);
        const employee = allEmployees.find((e: any) => e.userId === user.id);
        if (employee) {
          result.employee = { id: employee.id, employeeCode: employee.employeeCode, department: employee.department, designation: employee.designation };
          const today = new Date().toISOString().split("T")[0];
          result.todayAttendance = await storage.getAttendanceByEmployeeAndDate(employee.id, today);
          const leaveRequests = await storage.getLeaveRequestsByCompany(user.companyId);
          result.pendingLeaves = leaveRequests.filter((l: any) => l.employeeId === employee.id && l.status === "pending").length;
        }
      }

      const allApps = await storage.getAllJobApplications();
      result.jobApplications = allApps.filter((a: any) => a.userId === user.id).length;
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  app.post("/api/mobile/previous-experiences", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { organizationName, postHeld, dateOfJoining, dateOfLeaving, reasonOfLeaving, ctc, jobResponsibilities, targetType } = req.body;
      if (!organizationName || !postHeld || !dateOfJoining || !dateOfLeaving) {
        return res.status(400).json({ error: "Organization, post, joining date, and leaving date are required" });
      }

      let employeeId = null;
      let candidateProfileId = null;

      if (targetType === "employee" && user.companyId) {
        const allEmployees = await storage.getEmployeesByCompany(user.companyId);
        const emp = allEmployees.find((e: any) => e.userId === user.id);
        if (emp) employeeId = emp.id;
      } else {
        const profile = await storage.getCandidateProfileByUserId(user.id);
        if (profile) candidateProfileId = profile.id;
      }

      const exp = await storage.createPreviousExperience({
        employeeId, candidateProfileId, organizationName, postHeld, dateOfJoining, dateOfLeaving, reasonOfLeaving: reasonOfLeaving || "", ctc: ctc || "", jobResponsibilities: jobResponsibilities || "",
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(exp);
    } catch (error) {
      res.status(500).json({ error: "Failed to add experience" });
    }
  });

  app.delete("/api/mobile/previous-experiences/:id", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      await storage.deletePreviousExperience(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete experience" });
    }
  });

  // ===== LEAVE APPROVAL (managers/admins) =====
  app.get("/api/mobile/team-leave-requests", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const allowedRoles = ["super_admin", "company_admin", "hr_admin", "manager"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized to view team leave requests" });
      const requests = await storage.getLeaveRequestsByCompany(user.companyId);
      const employees = await storage.getEmployeesByCompany(user.companyId);
      const leaveTypes = await storage.getLeaveTypesByCompany(user.companyId);
      const enriched = requests.map((r: any) => {
        const emp = employees.find((e: any) => e.id === r.employeeId);
        const lt = leaveTypes.find((t: any) => t.id === r.leaveTypeId);
        return { ...r, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown", employeeCode: emp?.employeeCode || "", leaveTypeName: lt?.name || "", leaveTypeCode: lt?.code || "" };
      });
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch team leave requests" });
    }
  });

  app.patch("/api/mobile/leave-requests/:id", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin", "manager"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      const existing = await storage.getLeaveRequest(req.params.id as string);
      if (!existing) return res.status(404).json({ error: "Leave request not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) return res.status(403).json({ error: "Access denied" });
      const updates: any = { ...req.body };
      if (req.body.status === "approved" || req.body.status === "rejected") {
        updates.approvedBy = user.id;
        updates.approvedAt = new Date().toISOString();
      }
      const updated = await storage.updateLeaveRequest(req.params.id as string, updates);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update leave request" });
    }
  });

  // ===== PAYSLIP VIEW =====
  app.get("/api/mobile/payslips", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => String(e.userId) === String(user.id));
      if (!employee) return res.json([]);
      const payrolls = await storage.getPayrollByEmployee(employee.id);
      res.json(payrolls ?? []);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payslips" });
    }
  });

  app.get("/api/mobile/payslips/:id", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.status(400).json({ error: "No company" });
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => String(e.userId) === String(user.id));
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      const payrolls = await storage.getPayrollByEmployee(employee.id);
      const payroll = (payrolls as any[]).find((p: any) => p.id === req.params.id);
      if (!payroll) return res.status(404).json({ error: "Payslip not found" });
      const company = await storage.getCompany(user.companyId);
      res.json({ ...payroll, employeeName: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode, department: employee.department, designation: employee.designation, companyName: company?.companyName || "" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payslip" });
    }
  });

  app.get("/api/mobile/payslips/:month/:year", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.status(400).json({ error: "No company assigned" });
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => String(e.userId) === String(user.id));
      if (!employee) return res.status(404).json({ error: "Employee record not found" });
      const payroll = await storage.getPayrollByEmployeeMonth(employee.id, req.params.month as string, parseInt(req.params.year as string));
      if (!payroll) return res.status(404).json({ error: "No payslip found for this month" });
      const company = await storage.getCompany(user.companyId);
      res.json({ ...payroll, employeeName: `${employee.firstName} ${employee.lastName}`, employeeCode: employee.employeeCode, department: employee.department, designation: employee.designation, companyName: company?.companyName || "" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payslip" });
    }
  });

  // ===== SALARY STRUCTURE VIEW =====
  app.get("/api/mobile/salary-structure", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json(null);
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.json(null);
      const allStructures = await storage.getAllSalaryStructures();
      const myStructure = allStructures.find((s: any) => s.employeeId === employee.id && s.status === "active");
      res.json(myStructure || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch salary structure" });
    }
  });

  // ===== HOLIDAY LIST =====
  app.get("/api/mobile/holidays", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const holidays = await storage.getHolidaysByCompany(user.companyId);
      const activeHolidays = holidays.filter((h: any) => h.status === "active");
      activeHolidays.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      res.json(activeHolidays);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch holidays" });
    }
  });

  // ===== MY TEAM VIEW (for managers/admins) =====
  app.get("/api/mobile/my-team", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const allowedRoles = ["super_admin", "company_admin", "hr_admin", "manager"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized to view team data" });
      const employees = await storage.getEmployeesByCompany(user.companyId);
      const teamData = employees
        .filter((e: any) => e.status === "active")
        .map((e: any) => ({
          id: e.id, employeeCode: e.employeeCode, firstName: e.firstName, lastName: e.lastName,
          department: e.department, designation: e.designation, dateOfJoining: e.dateOfJoining,
          dateOfBirth: e.dateOfBirth, mobileNumber: e.mobileNumber, personalEmail: e.personalEmail,
          status: e.status, profileImage: e.profileImage,
        }));
      res.json(teamData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch team data" });
    }
  });

  // ===== BIRTHDAY LIST =====
  app.get("/api/mobile/birthdays", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const employees = await storage.getEmployeesByCompany(user.companyId);
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const { month } = req.query;
      const targetMonth = month ? parseInt(month as string) : currentMonth;

      const birthdayList = employees
        .filter((e: any) => {
          if (!e.dateOfBirth || e.status !== "active") return false;
          const dob = new Date(e.dateOfBirth);
          return dob.getMonth() + 1 === targetMonth;
        })
        .map((e: any) => {
          const dob = new Date(e.dateOfBirth);
          const todayDate = today.getDate();
          const todayMonth = today.getMonth();
          const isToday = dob.getDate() === todayDate && dob.getMonth() === todayMonth;
          const upcoming = dob.getMonth() === todayMonth && dob.getDate() > todayDate;
          return { id: e.id, employeeCode: e.employeeCode, firstName: e.firstName, lastName: e.lastName, department: e.department, designation: e.designation, dateOfBirth: e.dateOfBirth, isToday, upcoming };
        })
        .sort((a: any, b: any) => {
          const da = new Date(a.dateOfBirth).getDate();
          const db = new Date(b.dateOfBirth).getDate();
          return da - db;
        });
      res.json(birthdayList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch birthday list" });
    }
  });

  // ===== QUICK ATTENDANCE ENTRY (for managers/admins) =====
  app.post("/api/mobile/quick-attendance", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin", "manager"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      if (!user.companyId) return res.status(400).json({ error: "No company assigned" });
      const { employeeId, date, status, clockIn, clockOut, payDays, otHours } = req.body;
      if (!employeeId || !date) return res.status(400).json({ error: "Employee and date are required" });

      const existing = await storage.getAttendanceByEmployeeAndDate(employeeId, date);
      if (existing) {
        const updated = await storage.updateAttendance(existing.id, {
          status: status || existing.status, clockIn: clockIn || existing.clockIn, clockOut: clockOut || existing.clockOut,
          otHours: otHours !== undefined ? otHours : existing.otHours,
        });
        return res.json(updated);
      }
      const record = await storage.createAttendance({
        employeeId, companyId: user.companyId, date, status: status || "present",
        clockIn: clockIn || null, clockOut: clockOut || null, otHours: otHours || "0",
      });
      res.status(201).json(record);
    } catch (error) {
      res.status(500).json({ error: "Failed to create attendance entry" });
    }
  });

  // ===== MONTHLY ATTENDANCE ENTRY (managers/admins) =====
  app.post("/api/mobile/monthly-attendance-entry", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin", "manager"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      if (!user.companyId) return res.status(400).json({ error: "No company assigned" });
      const { employeeId, month, year, payDays, otHours } = req.body;
      if (!employeeId || !month || !year) return res.status(400).json({ error: "Employee, month, and year are required" });

      const employee = await storage.getEmployee(employeeId);
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && employee.companyId !== user.companyId) return res.status(403).json({ error: "Employee does not belong to your company" });

      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) return res.status(400).json({ error: "Invalid month or year" });
      const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
      const totalPayDays = parseInt(payDays || "0");
      if (totalPayDays <= 0 || totalPayDays > daysInMonth) return res.status(400).json({ error: `Pay days must be between 1 and ${daysInMonth}` });
      const totalOtHours = parseFloat(otHours || "0");

      let created = 0;
      let skipped = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const existing = await storage.getAttendanceByEmployee(employeeId, dateStr);
        if (existing.length > 0) { skipped++; continue; }

        const status = day <= totalPayDays ? "present" : "absent";
        const otForDay = status === "present" && totalOtHours > 0 ? String(Math.round((totalOtHours / totalPayDays) * 100) / 100) : "0";

        await storage.createAttendance({
          employeeId, companyId: user.companyId, date: dateStr, status,
          clockIn: status === "present" ? "09:00" : null, clockOut: status === "present" ? "18:00" : null,
          workHours: status === "present" ? "8" : "0", otHours: otForDay, notes: null,
        });
        created++;
      }
      res.json({ success: true, message: `Created ${created} attendance records, skipped ${skipped} existing.`, created, skipped });
    } catch (error) {
      res.status(500).json({ error: "Failed to create monthly attendance" });
    }
  });

  // ===== EMPLOYEE LIST =====
  app.get("/api/mobile/employees", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin", "manager", "admin"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      if (user.role === "super_admin") {
        const companies = await storage.getAllCompanies();
        if (!companies || companies.length === 0) return res.json([]);
        const allEmployeeLists = await Promise.all(
          companies.map((c: any) => storage.getEmployeesByCompany(c.id).catch(() => [] as any[]))
        );
        return res.json(allEmployeeLists.flat());
      }
      if (!user.companyId) return res.json([]);
      const employees = await storage.getEmployeesByCompany(user.companyId);
      res.json(employees ?? []);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  // ===== EMPLOYEE REGISTRATION (admins) =====
  app.post("/api/mobile/employees", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized to register employees" });
      if (!user.companyId && user.role !== "super_admin") return res.status(400).json({ error: "No company assigned" });

      const data = req.body;
      if (!data.employeeCode || !data.firstName || !data.lastName || !data.dateOfJoining) {
        return res.status(400).json({ error: "Employee code, first name, last name, and date of joining are required" });
      }

      data.companyId = user.role === "super_admin" ? (data.companyId || user.companyId) : user.companyId;
      if (!data.companyId) return res.status(400).json({ error: "Company ID is required" });

      const existingEmployees = await storage.getEmployeesByCompany(data.companyId);
      const fields: { key: string; label: string }[] = [
        { key: "employeeCode", label: "Employee Code" },
        { key: "aadhaar", label: "Aadhaar" },
        { key: "pan", label: "PAN" },
        { key: "uan", label: "UAN" },
        { key: "esiNumber", label: "ESI Number" },
        { key: "bankAccount", label: "Bank Account" },
        { key: "biometricDeviceId", label: "Biometric Device ID" },
      ];
      for (const f of fields) {
        if (data[f.key]) {
          const dup = existingEmployees.find((e: any) => e[f.key] && e[f.key] === data[f.key]);
          if (dup) return res.status(400).json({ error: `${f.label} '${data[f.key]}' already registered to ${dup.firstName} ${dup.lastName} (${dup.employeeCode})` });
        }
      }

      const employee = await storage.createEmployee(data);
      res.status(201).json(employee);
    } catch (error) {
      res.status(500).json({ error: "Failed to register employee" });
    }
  });

  app.get("/api/mobile/departments", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const depts = await storage.getMasterDepartmentsByCompany(user.companyId);
      res.json(depts);
    } catch (error) {
      res.json([]);
    }
  });

  app.get("/api/mobile/designations", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const desigs = await storage.getMasterDesignationsByCompany(user.companyId);
      res.json(desigs);
    } catch (error) {
      res.json([]);
    }
  });

  app.get("/api/mobile/locations", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const locs = await storage.getMasterLocationsByCompany(user.companyId);
      res.json(locs);
    } catch (error) {
      res.json([]);
    }
  });

  app.post("/api/mobile/locations", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowed = ["super_admin", "company_admin", "hr_admin"];
      if (!allowed.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      if (!user.companyId) return res.status(400).json({ error: "No company assigned" });
      const { name, code, address, city, district, state, country, latitude, longitude, status } = req.body;
      if (!name) return res.status(400).json({ error: "Location name is required" });
      const loc = await storage.createMasterLocation({
        companyId: user.companyId,
        name, code: code || null, address: address || null,
        city: city || null, district: district || null, state: state || null,
        country: country || "India", latitude: latitude || null, longitude: longitude || null,
        status: status || "active",
      });
      res.json(loc);
    } catch (error) {
      console.error("Create location error:", error);
      res.status(500).json({ error: "Failed to create location" });
    }
  });

  app.put("/api/mobile/locations/:id", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowed = ["super_admin", "company_admin", "hr_admin"];
      if (!allowed.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      const { id } = req.params;
      const { name, code, address, city, district, state, country, latitude, longitude, status } = req.body;
      const updated = await storage.updateMasterLocation(id, {
        name, code, address, city, district, state, country, latitude, longitude, status,
      });
      if (!updated) return res.status(404).json({ error: "Location not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update location" });
    }
  });

  app.delete("/api/mobile/locations/:id", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowed = ["super_admin", "company_admin", "hr_admin"];
      if (!allowed.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      const deleted = await storage.deleteMasterLocation(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Location not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete location" });
    }
  });

  // ===== SALARY STRUCTURE CRUD (admins) =====
  app.post("/api/mobile/salary-structures", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      if (!user.companyId && user.role !== "super_admin") return res.status(400).json({ error: "No company assigned" });

      const data = req.body;
      data.companyId = user.role === "super_admin" ? (data.companyId || user.companyId) : user.companyId;
      if (!data.employeeId || !data.basicSalary || !data.grossSalary || !data.netSalary || !data.effectiveFrom) {
        return res.status(400).json({ error: "Employee, basic salary, gross salary, net salary, and effective date are required" });
      }

      const empCheck = await storage.getEmployee(data.employeeId);
      if (!empCheck) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && empCheck.companyId !== user.companyId) return res.status(403).json({ error: "Employee does not belong to your company" });

      const allStructures = await storage.getAllSalaryStructures();
      const activeDup = allStructures.find((s: any) => s.employeeId === data.employeeId && s.status === "active");
      if (activeDup) return res.status(400).json({ error: "Employee already has an active salary structure. Deactivate it first or update it." });

      const structure = await storage.createSalaryStructure(data);
      res.status(201).json(structure);
    } catch (error) {
      res.status(500).json({ error: "Failed to create salary structure" });
    }
  });

  app.patch("/api/mobile/salary-structures/:id", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      const existing = await storage.getSalaryStructure(req.params.id as string);
      if (!existing) return res.status(404).json({ error: "Salary structure not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) return res.status(403).json({ error: "Access denied" });
      const updated = await storage.updateSalaryStructure(req.params.id as string, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update salary structure" });
    }
  });

  app.get("/api/mobile/salary-structures/employee/:employeeId", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      const empCheck = await storage.getEmployee(req.params.employeeId as string);
      if (empCheck && user.role !== "super_admin" && empCheck.companyId !== user.companyId) return res.status(403).json({ error: "Access denied" });
      const allStructures = await storage.getAllSalaryStructures();
      const empStructures = allStructures.filter((s: any) => s.employeeId === req.params.employeeId);
      res.json(empStructures);
    } catch (error) {
      res.json([]);
    }
  });

  // ===== JOB POSTING CRUD (admins/recruiters) =====
  app.get("/api/mobile/job-postings/manage", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin", "recruiter"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      if (!user.companyId) return res.json([]);
      const postings = await storage.getJobPostingsByCompany(user.companyId);
      const allApps = await storage.getAllJobApplications();
      const enriched = postings.map((p: any) => ({
        ...p,
        applicationCount: allApps.filter((a: any) => a.jobPostingId === p.id).length,
      }));
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job postings" });
    }
  });

  app.post("/api/mobile/job-postings", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin", "recruiter"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      if (!user.companyId && user.role !== "super_admin") return res.status(400).json({ error: "No company assigned" });

      const data = req.body;
      if (!data.title || !data.description) return res.status(400).json({ error: "Title and description are required" });

      data.companyId = user.role === "super_admin" ? (data.companyId || user.companyId) : user.companyId;
      data.postedBy = user.id;
      data.createdAt = new Date().toISOString();
      data.postedAt = data.status === "open" ? new Date().toISOString() : null;

      const posting = await storage.createJobPosting(data);
      res.status(201).json(posting);
    } catch (error) {
      res.status(500).json({ error: "Failed to create job posting" });
    }
  });

  app.put("/api/mobile/job-postings/:id", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin", "recruiter"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      const existing = await storage.getJobPosting(req.params.id as string);
      if (!existing) return res.status(404).json({ error: "Job posting not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) return res.status(403).json({ error: "Access denied" });

      const data = req.body;
      if (data.status === "open" && !existing.postedAt) data.postedAt = new Date().toISOString();
      data.updatedAt = new Date().toISOString();

      const posting = await storage.updateJobPosting(req.params.id as string, data);
      res.json(posting);
    } catch (error) {
      res.status(500).json({ error: "Failed to update job posting" });
    }
  });

  app.delete("/api/mobile/job-postings/:id", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      const existing = await storage.getJobPosting(req.params.id as string);
      if (!existing) return res.status(404).json({ error: "Job posting not found" });
      if (user.role !== "super_admin" && existing.companyId !== user.companyId) return res.status(403).json({ error: "Access denied" });
      await storage.deleteJobPosting(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete job posting" });
    }
  });

  app.get("/api/mobile/job-postings/:id/applications", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin", "recruiter"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      const applications = await storage.getJobApplicationsByPosting(req.params.id as string);
      res.json(applications);
    } catch (error) {
      res.json([]);
    }
  });

  app.get("/api/mobile/companies", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role === "super_admin") {
        const companies = await storage.getAllCompanies();
        return res.json(companies);
      }
      if (user.companyId) {
        const company = await storage.getCompany(user.companyId);
        return res.json(company ? [company] : []);
      }
      res.json([]);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/mobile/office-location", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.status(400).json({ error: "Not assigned to a company" });
      const company = await storage.getCompany(user.companyId);
      if (!company) return res.status(404).json({ error: "Company not found" });
      res.json({
        officeLatitude: company.officeLatitude,
        officeLongitude: company.officeLongitude,
        officeRadiusMeters: company.officeRadiusMeters ?? 100,
        faceVerificationEnabled: company.faceVerificationEnabled ?? true,
        gpsVerificationEnabled: company.gpsVerificationEnabled ?? true,
        companyName: company.companyName,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch office location" });
    }
  });

  // ── Update office geo-fence settings (admin only) ────────────────────────
  app.patch("/api/mobile/office-location", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowed = ["super_admin", "company_admin", "hr_admin"];
      if (!allowed.includes(user.role)) return res.status(403).json({ error: "Only admins can update office location settings" });

      const companyId = user.companyId;
      if (!companyId) return res.status(400).json({ error: "Not assigned to a company" });

      const { officeLatitude, officeLongitude, officeRadiusMeters, faceVerificationEnabled, gpsVerificationEnabled } = req.body;

      const updates: Record<string, any> = {};
      if (officeLatitude  !== undefined) updates.officeLatitude  = officeLatitude  !== null ? String(officeLatitude)  : null;
      if (officeLongitude !== undefined) updates.officeLongitude = officeLongitude !== null ? String(officeLongitude) : null;
      if (officeRadiusMeters !== undefined) updates.officeRadiusMeters = Number(officeRadiusMeters);
      if (faceVerificationEnabled !== undefined) updates.faceVerificationEnabled = Boolean(faceVerificationEnabled);
      if (gpsVerificationEnabled  !== undefined) updates.gpsVerificationEnabled  = Boolean(gpsVerificationEnabled);

      const updated = await storage.updateCompany(companyId, updates);
      if (!updated) return res.status(404).json({ error: "Company not found" });

      res.json({
        success: true,
        officeLatitude: updated.officeLatitude,
        officeLongitude: updated.officeLongitude,
        officeRadiusMeters: updated.officeRadiusMeters ?? 100,
        faceVerificationEnabled: updated.faceVerificationEnabled ?? true,
        gpsVerificationEnabled: updated.gpsVerificationEnabled ?? true,
      });
    } catch (error) {
      console.error("Update office location error:", error);
      res.status(500).json({ error: "Failed to update office location" });
    }
  });

  app.post("/api/mobile/employees/:employeeId/register-face", requireJwtAuth, faceUpload.single("faceImage"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Only Admin or HR can register faces" });
      if (!req.file) return res.status(400).json({ error: "Face image is required" });

      const employee = await storage.getEmployee(req.params.employeeId);
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && employee.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const faceImagePath = `/uploads/faces/${req.file.filename}`;
      const updated = await storage.updateEmployee(employee.id, { registeredFaceImage: faceImagePath });
      res.json({ success: true, message: "Face registered successfully", registeredFaceImage: faceImagePath, employee: updated });
    } catch (error) {
      console.error("Face registration error:", error);
      res.status(500).json({ error: "Failed to register face" });
    }
  });

  app.get("/api/mobile/employees/:employeeId/face-status", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const employee = await storage.getEmployee(req.params.employeeId);
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && employee.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json({
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        employeeCode: employee.employeeCode,
        faceRegistered: !!employee.registeredFaceImage,
        registeredFaceImage: employee.registeredFaceImage,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch face status" });
    }
  });

  app.delete("/api/mobile/employees/:employeeId/registered-face", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const allowedRoles = ["super_admin", "company_admin", "hr_admin"];
      if (!allowedRoles.includes(user.role)) return res.status(403).json({ error: "Not authorized" });
      const employee = await storage.getEmployee(req.params.employeeId);
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      if (user.role !== "super_admin" && employee.companyId !== user.companyId) return res.status(403).json({ error: "Access denied" });
      if (employee.registeredFaceImage) {
        const filePath = path.join(process.cwd(), "server", employee.registeredFaceImage);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      await storage.updateEmployee(employee.id, { registeredFaceImage: null });
      res.json({ success: true, message: "Face registration removed" });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove face registration" });
    }
  });

  app.get("/api/mobile/my-face-status", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json({ faceRegistered: false });
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.json({ faceRegistered: false });
      res.json({
        faceRegistered: !!employee.registeredFaceImage,
        registeredFaceImage: employee.registeredFaceImage,
        employeeName: `${employee.firstName} ${employee.lastName}`,
      });
    } catch (error) {
      res.json({ faceRegistered: false });
    }
  });

  // ─── UNIFIED PUNCH (first punch = clock-in, every subsequent = clock-out) ──
  app.post("/api/mobile/attendance/punch", requireJwtAuth, faceUpload.single("faceImage"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.status(400).json({ error: "You must be assigned to a company" });
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.status(400).json({ error: "Employee record not found" });

      const today = new Date().toISOString().split("T")[0];
      const existingAttendance = await storage.getAttendanceByEmployeeAndDate(employee.id, today);
      const now = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
      const { latitude, longitude, locationAccuracy, locationAddress } = req.body;
      const faceImagePath = req.file ? `/uploads/faces/${req.file.filename}` : null;
      const company = await storage.getCompany(user.companyId);

      // ── GPS verification ──────────────────────────────────────────────────
      let gpsVerified = false;
      let gpsNote = "";
      if (company?.gpsVerificationEnabled && company?.officeLatitude && company?.officeLongitude) {
        if (!latitude || !longitude) {
          return res.status(400).json({ error: "GPS location is required. Please enable location services." });
        }
        const offLat = parseFloat(company.officeLatitude);
        const offLon = parseFloat(company.officeLongitude);
        const empLat = parseFloat(latitude);
        const empLon = parseFloat(longitude);
        const R = 6371000;
        const φ1 = (offLat * Math.PI) / 180, φ2 = (empLat * Math.PI) / 180;
        const Δφ = ((empLat - offLat) * Math.PI) / 180, Δλ = ((empLon - offLon) * Math.PI) / 180;
        const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        const radius = company.officeRadiusMeters ?? 100;
        gpsVerified = dist <= radius;
        gpsNote = gpsVerified ? `Within office (${dist}m)` : `Outside office radius (${dist}m away, limit: ${radius}m)`;
        if (!gpsVerified) {
          return res.status(400).json({ error: `You are ${dist}m from the office. Must be within ${radius}m to mark attendance.` });
        }
      } else {
        gpsVerified = !!(latitude && longitude);
        gpsNote = gpsVerified ? "GPS captured" : "No GPS data";
      }

      // ── Face verification (match against registered face) ─────────────────
      let faceVerified = false;
      let faceNote = "";
      if (company?.faceVerificationEnabled) {
        if (!req.file) {
          return res.status(400).json({ error: "Face photo is required. Please capture your face." });
        }
        if (!employee.registeredFaceImage) {
          return res.status(400).json({ error: "Your face is not registered yet. Please register your face in Settings before punching." });
        }
        // Compare captured face against registered face using deep-learning embeddings
        const capturedPath = path.join(process.cwd(), "server/uploads/faces", req.file.filename);
        const registeredPath = employee.registeredFaceImage.startsWith("/")
          ? path.join(process.cwd(), "server", employee.registeredFaceImage)
          : path.join(process.cwd(), "server/uploads/faces", path.basename(employee.registeredFaceImage));

        const matchResult = await matchFaces(registeredPath, capturedPath);
        if (!matchResult.match) {
          return res.status(400).json({ error: `Face verification failed: ${matchResult.reason}` });
        }
        faceVerified = true;
        faceNote = matchResult.reason;
      } else {
        faceVerified = !!req.file;
        faceNote = req.file ? "Face captured" : "No face photo";
      }

      const notes = `${faceNote}. ${gpsNote}`.trim();

      // ── First punch of the day → Clock-in ─────────────────────────────────
      if (!existingAttendance || !existingAttendance.clockIn) {
        const data: any = {
          employeeId: employee.id, companyId: user.companyId, date: today, clockIn: now, status: "present",
          latitude, longitude, locationAccuracy, locationAddress, faceImagePath, faceVerified, clockInMethod: "mobile", notes,
        };
        let record;
        if (existingAttendance) {
          record = await storage.updateAttendance(existingAttendance.id, data);
        } else {
          record = await storage.createAttendance(data);
        }
        return res.status(201).json({ ...record, punchType: "clock_in", verificationResult: { faceVerified, gpsVerified } });
      }

      // ── Subsequent punch → update Clock-out (always latest time) ─────────
      const clockInTime = existingAttendance.clockIn!;
      const [inH, inM] = clockInTime.split(":").map(Number);
      const [outH, outM] = now.split(":").map(Number);
      const workMinutes = (outH * 60 + outM) - (inH * 60 + inM);
      const workHours = workMinutes > 0
        ? `${Math.floor(workMinutes / 60)}:${String(workMinutes % 60).padStart(2, "0")}`
        : "0:00";

      const updated = await storage.updateAttendance(existingAttendance.id, {
        clockOut: now, workHours,
        clockOutLatitude: latitude, clockOutLongitude: longitude, clockOutLocationAccuracy: locationAccuracy,
        clockOutFaceImagePath: faceImagePath, clockOutFaceVerified: !!req.file, clockOutMethod: "mobile",
      });
      return res.json({ ...updated, punchType: "clock_out", verificationResult: { faceVerified, gpsVerified } });
    } catch (error) {
      console.error("Punch error:", error);
      res.status(500).json({ error: "Failed to record punch" });
    }
  });

  // ─── LOAN ADVANCES (mobile) ───────────────────────────────────────────────
  app.get("/api/mobile/loan-advances", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.json([]);
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.json([]);
      const records = await storage.getLoanAdvancesByEmployee(employee.id);
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch loan advances" });
    }
  });

  app.post("/api/mobile/loan-advances", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user.companyId) return res.status(400).json({ error: "No company assigned" });
      const allEmployees = await storage.getEmployeesByCompany(user.companyId);
      const employee = allEmployees.find((e: any) => e.userId === user.id);
      if (!employee) return res.status(400).json({ error: "Employee record not found" });

      const { type, amount, reason, installmentAmount } = req.body;
      if (!amount || !type) return res.status(400).json({ error: "Amount and type are required" });

      const record = await storage.createLoanAdvance({
        id: randomUUID(),
        employeeId: employee.id,
        companyId: user.companyId,
        type: type || "advance",
        amount: String(amount),
        reason: reason || "",
        status: "pending",
        installmentAmount: installmentAmount ? String(installmentAmount) : null,
        remainingBalance: String(amount),
        appliedDate: new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const typeLabel = type === "loan" ? "Loan" : "Salary Advance";
      const allUsers = await storage.getAllUsers();
      const hrIds = allUsers
        .filter((u: any) => ["hr_admin", "company_admin", "super_admin"].includes(u.role || "") &&
          (u.role === "super_admin" || u.companyId === user.companyId))
        .map((u: any) => u.id);

      const empName = `${employee.firstName} ${employee.lastName}`.trim();
      await createNotificationForMany(hrIds, {
        companyId: user.companyId,
        type: "loan_request",
        title: `New ${typeLabel} Request`,
        message: `${empName} has applied for a ${typeLabel.toLowerCase()} of ₹${Number(amount).toLocaleString("en-IN")}.`,
        link: "/loan-advances",
      });
      await createNotification({
        userId: user.id,
        companyId: user.companyId,
        type: "loan_submitted",
        title: `${typeLabel} Request Submitted`,
        message: `Your ${typeLabel.toLowerCase()} request of ₹${Number(amount).toLocaleString("en-IN")} has been submitted for review.`,
        link: "/loan-advances",
      });

      res.status(201).json(record);
    } catch (error) {
      console.error("Loan advance error:", error);
      res.status(500).json({ error: "Failed to submit request" });
    }
  });

  // ─── NOTIFICATIONS (mobile) ───────────────────────────────────────────────
  app.get("/api/mobile/notifications", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const rows = await db.select().from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.patch("/api/mobile/notifications/read-all", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, user.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark all read" });
    }
  });

  app.patch("/api/mobile/notifications/:id/read", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      await db.update(notifications).set({ isRead: true })
        .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, user.id)));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark read" });
    }
  });

  app.delete("/api/mobile/notifications/clear", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      await db.delete(notifications).where(eq(notifications.userId, user.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear notifications" });
    }
  });

  app.use("/uploads", express.static(path.join(process.cwd(), "server/uploads")));
}
