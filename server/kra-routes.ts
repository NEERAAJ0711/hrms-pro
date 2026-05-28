// KRA & KPI Routes
import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { randomUUID } from "crypto";
import {
  insertKraTemplateSchema,
  insertKraTemplateKpiSchema,
  insertKraAssignmentSchema,
  insertKraAssignmentKpiSchema,
} from "@shared/schema";
import { z } from "zod";

// Helper to compute the weighted score for an assignment from its KPIs
function computeAssignmentScore(kpis: { weightage: number; computedScore: number | null | undefined }[]): number {
  const total = kpis.reduce((sum, kpi) => sum + (kpi.weightage || 0), 0);
  if (total === 0) return 0;
  const weighted = kpis.reduce((sum, kpi) => {
    const score = kpi.computedScore ?? 0;
    return sum + (score * (kpi.weightage || 0)) / 100;
  }, 0);
  // Normalize if total weightage != 100
  return Math.round((weighted / total) * 100 * 10) / 10;
}

// Compute score for a single KPI line
function computeKpiScore(kpi: {
  targetValue?: number | null;
  actualValue?: number | null;
  selfScore?: number | null;
  managerScore?: number | null;
}): number | null {
  // Manager score takes highest priority
  if (kpi.managerScore != null) return Math.min(100, Math.max(0, kpi.managerScore));
  // Auto-score from actual vs target
  if (kpi.actualValue != null && kpi.targetValue != null && kpi.targetValue > 0) {
    return Math.min(100, Math.round((kpi.actualValue / kpi.targetValue) * 100 * 10) / 10);
  }
  // Fall back to self score
  if (kpi.selfScore != null) return Math.min(100, Math.max(0, kpi.selfScore));
  return null;
}

export function registerKraRoutes(app: Express, requireAuth: any, requireRole: any) {
  // ─── KRA Templates ───────────────────────────────────────────────────────────

  // List templates for a company
  app.get("/api/kra/templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const companyId = user.role === "super_admin" ? req.query.companyId as string : user.companyId;
      if (!companyId) return res.status(400).json({ error: "companyId required" });
      const templates = await storage.getKraTemplatesByCompany(companyId);
      res.json(templates);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch KRA templates" });
    }
  });

  // Get single template with KPIs
  app.get("/api/kra/templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const template = await storage.getKraTemplate(req.params.id);
      if (!template) return res.status(404).json({ error: "Template not found" });
      const kpis = await storage.getKraTemplateKpis(template.id);
      res.json({ ...template, kpis });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  // Create template (with KPIs in body)
  app.post("/api/kra/templates", requireAuth, requireRole("company_admin", "hr_admin", "super_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { kpis, ...templateData } = req.body;
      const parsed = insertKraTemplateSchema.parse({
        ...templateData,
        companyId: user.role === "super_admin" ? templateData.companyId : user.companyId,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
      });
      const template = await storage.createKraTemplate(parsed);
      // Create KPIs
      if (Array.isArray(kpis) && kpis.length > 0) {
        for (let i = 0; i < kpis.length; i++) {
          await storage.createKraTemplateKpi({
            templateId: template.id,
            kpiName: kpis[i].kpiName,
            description: kpis[i].description || null,
            weightage: kpis[i].weightage || 0,
            measurementUnit: kpis[i].measurementUnit || "number",
            targetValue: kpis[i].targetValue || 100,
            sortOrder: i,
          });
        }
      }
      const savedKpis = await storage.getKraTemplateKpis(template.id);
      res.status(201).json({ ...template, kpis: savedKpis });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to create template" });
    }
  });

  // Update template
  app.patch("/api/kra/templates/:id", requireAuth, requireRole("company_admin", "hr_admin", "super_admin"), async (req: Request, res: Response) => {
    try {
      const { kpis, ...updateData } = req.body;
      const updated = await storage.updateKraTemplate(req.params.id, updateData);
      if (!updated) return res.status(404).json({ error: "Template not found" });
      // Replace KPIs if provided
      if (Array.isArray(kpis)) {
        await storage.deleteKraTemplateKpisByTemplate(req.params.id);
        for (let i = 0; i < kpis.length; i++) {
          await storage.createKraTemplateKpi({
            templateId: req.params.id,
            kpiName: kpis[i].kpiName,
            description: kpis[i].description || null,
            weightage: kpis[i].weightage || 0,
            measurementUnit: kpis[i].measurementUnit || "number",
            targetValue: kpis[i].targetValue || 100,
            sortOrder: i,
          });
        }
      }
      const savedKpis = await storage.getKraTemplateKpis(req.params.id);
      res.json({ ...updated, kpis: savedKpis });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update template" });
    }
  });

  // Delete template
  app.delete("/api/kra/templates/:id", requireAuth, requireRole("company_admin", "hr_admin", "super_admin"), async (req: Request, res: Response) => {
    try {
      await storage.deleteKraTemplateKpisByTemplate(req.params.id);
      const ok = await storage.deleteKraTemplate(req.params.id);
      if (!ok) return res.status(404).json({ error: "Template not found" });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // ─── KRA Assignments ─────────────────────────────────────────────────────────

  // List assignments (company-wide or for employee)
  app.get("/api/kra/assignments", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      let assignments;
      if (user.role === "employee") {
        // Employee sees their own assignments
        const emp = await storage.getEmployeeByUserId(user.id);
        if (!emp) return res.json([]);
        assignments = await storage.getKraAssignmentsByEmployee(emp.id);
      } else {
        const companyId = user.role === "super_admin" ? req.query.companyId as string : user.companyId;
        if (!companyId) return res.json([]);
        const employeeId = req.query.employeeId as string | undefined;
        if (employeeId) {
          assignments = await storage.getKraAssignmentsByEmployee(employeeId);
          assignments = assignments.filter(a => a.companyId === companyId);
        } else {
          assignments = await storage.getKraAssignmentsByCompany(companyId);
        }
      }
      // Enrich with employee names
      const enriched = await Promise.all(assignments.map(async (a) => {
        const emp = await storage.getEmployee(a.employeeId);
        return {
          ...a,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          employeeCode: emp?.employeeCode || "",
          department: emp?.department || "",
        };
      }));
      res.json(enriched);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  // Get single assignment with KPIs
  app.get("/api/kra/assignments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const assignment = await storage.getKraAssignment(req.params.id);
      if (!assignment) return res.status(404).json({ error: "Assignment not found" });
      const kpis = await storage.getKraAssignmentKpis(assignment.id);
      const emp = await storage.getEmployee(assignment.employeeId);
      res.json({
        ...assignment,
        kpis,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
        employeeCode: emp?.employeeCode || "",
        department: emp?.department || "",
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch assignment" });
    }
  });

  // Create assignment (optionally from template)
  app.post("/api/kra/assignments", requireAuth, requireRole("company_admin", "hr_admin", "manager", "super_admin"), async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { kpis, templateId, ...assignmentData } = req.body;
      const companyId = user.role === "super_admin" ? assignmentData.companyId : user.companyId;

      const parsed = insertKraAssignmentSchema.parse({
        ...assignmentData,
        companyId,
        templateId: templateId || null,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
        status: assignmentData.status || "active",
      });
      const assignment = await storage.createKraAssignment(parsed);

      let kpisToCreate = kpis || [];
      // If template provided and no custom KPIs, copy from template
      if (templateId && (!kpis || kpis.length === 0)) {
        const templateKpis = await storage.getKraTemplateKpis(templateId);
        kpisToCreate = templateKpis.map(k => ({
          kpiName: k.kpiName,
          description: k.description,
          weightage: k.weightage,
          measurementUnit: k.measurementUnit,
          targetValue: k.targetValue,
        }));
      }

      for (let i = 0; i < kpisToCreate.length; i++) {
        await storage.createKraAssignmentKpi({
          assignmentId: assignment.id,
          kpiName: kpisToCreate[i].kpiName,
          description: kpisToCreate[i].description || null,
          weightage: kpisToCreate[i].weightage || 0,
          measurementUnit: kpisToCreate[i].measurementUnit || "number",
          targetValue: kpisToCreate[i].targetValue || 100,
          actualValue: null,
          selfScore: null,
          managerScore: null,
          computedScore: null,
          sortOrder: i,
        });
      }

      const savedKpis = await storage.getKraAssignmentKpis(assignment.id);
      res.status(201).json({ ...assignment, kpis: savedKpis });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to create assignment" });
    }
  });

  // Update assignment metadata
  app.patch("/api/kra/assignments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { kpis, ...updateData } = req.body;
      const updated = await storage.updateKraAssignment(req.params.id, updateData);
      if (!updated) return res.status(404).json({ error: "Assignment not found" });
      const savedKpis = await storage.getKraAssignmentKpis(req.params.id);
      res.json({ ...updated, kpis: savedKpis });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update assignment" });
    }
  });

  // Delete assignment
  app.delete("/api/kra/assignments/:id", requireAuth, requireRole("company_admin", "hr_admin", "super_admin"), async (req: Request, res: Response) => {
    try {
      await storage.deleteKraAssignmentKpisByAssignment(req.params.id);
      const ok = await storage.deleteKraAssignment(req.params.id);
      if (!ok) return res.status(404).json({ error: "Assignment not found" });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete assignment" });
    }
  });

  // ─── KPI Scoring ─────────────────────────────────────────────────────────────

  // Submit actuals / self-review for an assignment (employee or manager)
  app.post("/api/kra/assignments/:id/score", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { kpis, feedback, reviewType } = req.body; // reviewType: "self" | "manager"
      const assignment = await storage.getKraAssignment(req.params.id);
      if (!assignment) return res.status(404).json({ error: "Assignment not found" });

      const isEmployee = user.role === "employee";
      const isManager = ["company_admin", "hr_admin", "manager", "super_admin"].includes(user.role);

      // Update each KPI
      const updatedKpis = [];
      for (const kpiUpdate of (kpis || [])) {
        const existing = (await storage.getKraAssignmentKpis(req.params.id)).find(k => k.id === kpiUpdate.id);
        if (!existing) continue;

        const patch: Record<string, any> = {};
        if (isEmployee && reviewType === "self") {
          if (kpiUpdate.actualValue != null) patch.actualValue = kpiUpdate.actualValue;
          if (kpiUpdate.selfScore != null) patch.selfScore = kpiUpdate.selfScore;
        } else if (isManager) {
          if (kpiUpdate.actualValue != null) patch.actualValue = kpiUpdate.actualValue;
          if (kpiUpdate.managerScore != null) patch.managerScore = kpiUpdate.managerScore;
        }

        // Recompute score
        const merged = { ...existing, ...patch };
        patch.computedScore = computeKpiScore(merged);

        const updated = await storage.updateKraAssignmentKpi(kpiUpdate.id, patch);
        if (updated) updatedKpis.push(updated);
      }

      // Recompute total assignment score
      const allKpis = await storage.getKraAssignmentKpis(req.params.id);
      const validKpis = allKpis.filter(k => k.computedScore != null);

      const assignPatch: Record<string, any> = {};
      if (isEmployee && reviewType === "self") {
        assignPatch.selfScore = computeAssignmentScore(allKpis.map(k => ({ weightage: k.weightage || 0, computedScore: k.selfScore })));
        if (assignment.status === "active") assignPatch.status = "under_review";
      } else if (isManager) {
        const totalScore = computeAssignmentScore(allKpis.map(k => ({ weightage: k.weightage || 0, computedScore: k.computedScore })));
        assignPatch.managerScore = totalScore;
        assignPatch.totalScore = totalScore;
        if (feedback) assignPatch.feedback = feedback;
        if (req.body.complete) assignPatch.status = "completed";
      }

      const finalAssignment = await storage.updateKraAssignment(req.params.id, assignPatch);
      const finalKpis = await storage.getKraAssignmentKpis(req.params.id);
      res.json({ ...finalAssignment, kpis: finalKpis });
    } catch (e: any) {
      console.error("[KRA score]", e);
      res.status(500).json({ error: e.message || "Failed to save scores" });
    }
  });

  // ─── Analytics ───────────────────────────────────────────────────────────────

  app.get("/api/kra/analytics", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const companyId = user.role === "super_admin" ? req.query.companyId as string : user.companyId;
      if (!companyId) return res.status(400).json({ error: "companyId required" });

      const assignments = await storage.getKraAssignmentsByCompany(companyId);

      // Enrich with employee data
      const enriched = await Promise.all(assignments.map(async (a) => {
        const emp = await storage.getEmployee(a.employeeId);
        return {
          ...a,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
          employeeCode: emp?.employeeCode || "",
          department: emp?.department || "Unassigned",
        };
      }));

      // Score distribution buckets
      const buckets = [
        { range: "0–40%", min: 0, max: 40, count: 0 },
        { range: "40–60%", min: 40, max: 60, count: 0 },
        { range: "60–80%", min: 60, max: 80, count: 0 },
        { range: "80–100%", min: 80, max: 100, count: 0 },
      ];
      const scored = enriched.filter(a => a.totalScore != null);
      scored.forEach(a => {
        const s = a.totalScore!;
        for (const b of buckets) {
          if (s >= b.min && (s < b.max || (b.max === 100 && s <= 100))) {
            b.count++;
            break;
          }
        }
      });

      // Top & bottom performers (only scored assignments)
      const sorted = [...scored].sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0));
      const topPerformers = sorted.slice(0, 5).map(a => ({
        employeeName: a.employeeName,
        employeeCode: a.employeeCode,
        department: a.department,
        title: a.title,
        totalScore: a.totalScore,
        status: a.status,
      }));
      const bottomPerformers = [...sorted].reverse().slice(0, 5).map(a => ({
        employeeName: a.employeeName,
        employeeCode: a.employeeCode,
        department: a.department,
        title: a.title,
        totalScore: a.totalScore,
        status: a.status,
      }));

      // Department stats
      const deptMap: Record<string, { total: number; completed: number; scored: number; scoreSum: number }> = {};
      enriched.forEach(a => {
        const d = a.department || "Unassigned";
        if (!deptMap[d]) deptMap[d] = { total: 0, completed: 0, scored: 0, scoreSum: 0 };
        deptMap[d].total++;
        if (a.status === "completed") deptMap[d].completed++;
        if (a.totalScore != null) {
          deptMap[d].scored++;
          deptMap[d].scoreSum += a.totalScore;
        }
      });
      const departmentStats = Object.entries(deptMap).map(([department, v]) => ({
        department,
        total: v.total,
        completed: v.completed,
        completionRate: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0,
        avgScore: v.scored > 0 ? Math.round((v.scoreSum / v.scored) * 10) / 10 : null,
      })).sort((a, b) => b.total - a.total);

      // Status breakdown for donut chart
      const statusBreakdown = [
        { status: "Active", count: enriched.filter(a => a.status === "active").length },
        { status: "Under Review", count: enriched.filter(a => a.status === "under_review").length },
        { status: "Completed", count: enriched.filter(a => a.status === "completed").length },
        { status: "Draft", count: enriched.filter(a => a.status === "draft").length },
      ].filter(s => s.count > 0);

      // KPI completion rate (assignments that have at least 1 scored KPI)
      const kpiCompletionData = await Promise.all(
        enriched.map(async a => {
          const kpis = await storage.getKraAssignmentKpis(a.id);
          const totalKpis = kpis.length;
          const scoredKpis = kpis.filter(k => k.computedScore != null).length;
          return { department: a.department, totalKpis, scoredKpis };
        })
      );
      const deptKpiMap: Record<string, { total: number; scored: number }> = {};
      kpiCompletionData.forEach(d => {
        if (!deptKpiMap[d.department]) deptKpiMap[d.department] = { total: 0, scored: 0 };
        deptKpiMap[d.department].total += d.totalKpis;
        deptKpiMap[d.department].scored += d.scoredKpis;
      });
      const deptKpiCompletion = Object.entries(deptKpiMap).map(([department, v]) => ({
        department,
        kpiCompletionRate: v.total > 0 ? Math.round((v.scored / v.total) * 100) : 0,
        totalKpis: v.total,
        scoredKpis: v.scored,
      }));

      res.json({
        summary: {
          total: enriched.length,
          active: enriched.filter(a => a.status === "active").length,
          underReview: enriched.filter(a => a.status === "under_review").length,
          completed: enriched.filter(a => a.status === "completed").length,
          avgScore: scored.length > 0
            ? Math.round((scored.reduce((s, a) => s + (a.totalScore ?? 0), 0) / scored.length) * 10) / 10
            : null,
        },
        scoreDistribution: buckets,
        statusBreakdown,
        topPerformers,
        bottomPerformers,
        departmentStats,
        deptKpiCompletion,
      });
    } catch (e: any) {
      console.error("[KRA analytics]", e);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // Update single KPI actual/score
  app.patch("/api/kra/assignment-kpis/:kpiId", requireAuth, async (req: Request, res: Response) => {
    try {
      const patch = req.body;
      // Recompute
      const existing = (await storage.getKraAssignmentKpis("")) as any; // We'll get it directly
      const result = await storage.updateKraAssignmentKpi(req.params.kpiId, patch);
      if (!result) return res.status(404).json({ error: "KPI not found" });
      // Recompute score
      const computedScore = computeKpiScore(result);
      const final = await storage.updateKraAssignmentKpi(req.params.kpiId, { computedScore });
      res.json(final);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
}
