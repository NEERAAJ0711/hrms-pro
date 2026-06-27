// Mobile (JWT-auth) billing routes — super admin payment approval.
//
// The web equivalents live in server/routes/billing-routes.ts under session
// auth. Both call the same payment-submission service so the mobile app and the
// web app review and credit the exact same submissions.

import type { Express, Request, Response } from "express";
import { listPaymentSubmissions, reviewPaymentSubmission } from "../services/payment-submission-service";

export function registerMobileBillingRoutes(app: Express, requireJwtAuth: any) {
  // All submissions for super admin review.
  app.get("/api/mobile/billing/payment-submissions", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      res.json(await listPaymentSubmissions());
    } catch (error) {
      console.error("[mobile billing] list payment submissions error:", error);
      res.status(500).json({ error: "Failed to fetch payment submissions" });
    }
  });

  // Approve / reject a submission (approval credits the company's CD account).
  app.patch("/api/mobile/billing/payment-submission/:id", requireJwtAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const { status, reviewNote } = req.body as { status?: string; reviewNote?: string };
      if (status !== "approved" && status !== "rejected") {
        return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
      }
      const result = await reviewPaymentSubmission({
        id: req.params.id,
        status,
        reviewNote: reviewNote ?? null,
        reviewerUserId: user.id,
      });
      if (!result) return res.status(404).json({ error: "Submission not found" });
      res.json(result);
    } catch (error) {
      console.error("[mobile billing] review payment submission error:", error);
      res.status(500).json({ error: "Failed to update payment submission" });
    }
  });
}
