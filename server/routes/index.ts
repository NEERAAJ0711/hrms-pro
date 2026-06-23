// HRMS Pro — API route orchestrator.
// Registers all domain route modules in the exact same order as the original
// monolithic routes.ts, preserving Express matching precedence and middleware order.
import type { Express } from "express";
import { createServer, type Server } from "http";
import * as path from "path";

import { registerAdmsRoutes } from "../adms";
import { registerMobileRoutes } from "../mobile-routes";
import { registerComplianceRoutes } from "../compliance-routes";
import { registerKraRoutes, startKraDeadlineScheduler } from "../kra-routes";
import { registerEpfoEsicRoutes } from "../epfo-esic-routes";
import { registerAiHrRoutes } from "../ai-hr-routes";
import { loadAllApiKeysFromDB, getAiProviderStatus } from "../ai-service";

import { requireAuth, requireRole } from "./shared";
import { runStartupMigrations } from "./startup-migrations";

import { registerSystemRoutes } from "./system-routes";
import { registerAuthRoutes } from "./auth-routes";
import { registerCompanyRoutes } from "./company-routes";
import { registerUserRoutes } from "./user-routes";
import { registerEmployeeBulkRoutes } from "./employee-bulk-routes";
import { registerBiometricRoutes } from "./biometric-routes";
import { registerRecruitmentRoutes } from "./recruitment-routes";
import { registerRecruitmentAiRoutes } from "./recruitment-ai-routes";
import { registerAnalyticsAiRoutes } from "./analytics-ai-routes";
import { registerWorkforceAiRoutes } from "./workforce-ai-routes";
import { registerEmployeeRoutes } from "./employee-routes";
import { registerAttendanceRoutes } from "./attendance-routes";
import { registerLeaveRoutes } from "./leave-routes";
import { registerPayrollRoutes } from "./payroll-routes";
import { registerSettingsRoutes } from "./settings-routes";
import { registerCompanyExtraRoutes } from "./company-extra-routes";
import { registerLoanRoutes } from "./loan-routes";
import { registerSelfServiceRoutes } from "./self-service-routes";
import { registerNotificationRoutes } from "./notification-routes";
import { registerMastersExtraRoutes } from "./masters-extra-routes";
import { registerBillingRoutes } from "./billing-routes";
import { registerAppVersionRoutes } from "./appversion-routes";
import { registerAutomationRoutes } from "./automation-routes";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Serve uploaded employee documents statically
  app.use('/uploads', (await import('express')).default.static(path.join(process.cwd(), 'uploads')));

  // ZKTeco ADMS push endpoints (/iclock/...) — devices behind NAT phone home
  // here over HTTP. These are intentionally unauthenticated at the session
  // layer; identity is the device serial number sent in the query string.
  registerAdmsRoutes(app);

  await registerSystemRoutes(app);
  await runStartupMigrations();

  // Register mobile API routes
  registerMobileRoutes(app);

  await registerAuthRoutes(app);
  await registerCompanyRoutes(app);
  await registerUserRoutes(app);
  await registerEmployeeBulkRoutes(app);
  await registerBiometricRoutes(app);
  await registerRecruitmentRoutes(app);
  await registerRecruitmentAiRoutes(app);
  await registerAnalyticsAiRoutes(app);
  await registerWorkforceAiRoutes(app);
  await registerEmployeeRoutes(app);
  await registerAttendanceRoutes(app);
  await registerLeaveRoutes(app);
  await registerPayrollRoutes(app);
  await registerSettingsRoutes(app);
  await registerCompanyExtraRoutes(app);
  await registerLoanRoutes(app);
  await registerSelfServiceRoutes(app);
  await registerNotificationRoutes(app);
  await registerMastersExtraRoutes(app);

  // Register compliance routes (completely separate module)
  registerComplianceRoutes(app);

  // Register KRA & KPI routes
  registerKraRoutes(app, requireAuth, requireRole);
  startKraDeadlineScheduler();

  await registerBillingRoutes(app);
  await registerAppVersionRoutes(app);

  // Register all EPFO / ESIC routes (jobs, portal sessions, registrations, returns, reports)
  registerEpfoEsicRoutes(app, requireAuth, requireRole);

  // Register AI HR Assistant routes (async — creates tables on first boot)
  await registerAiHrRoutes(app, requireAuth);

  // Load OpenAI + Gemini + Anthropic keys from DB (if admin saved them via Settings → API Keys)
  loadAllApiKeysFromDB()
    .then(() => {
      const s = getAiProviderStatus();
      console.log(
        `[AI] Provider status — OpenAI: ${s.openaiConfigured ? "configured" : "NOT configured"}, ` +
          `Gemini: ${s.geminiConfigured ? "configured" : "NOT configured"}, ` +
          `Claude: ${s.anthropicConfigured ? "configured" : "NOT configured"}`,
      );
      if (!s.openaiConfigured && !s.geminiConfigured && !s.anthropicConfigured) {
        console.warn(
          "[AI] No AI provider key found — the HR Assistant will use generic rule-based replies " +
            "until a key is set (env OPENAI_API_KEY / GOOGLE_GEMINI_API_KEY / ANTHROPIC_API_KEY, or Settings → API Keys).",
        );
      }
    })
    .catch(() => {});

  await registerAutomationRoutes(app);

  // NOTE: The automation resume route (POST /api/automation/jobs/:id/resume) is
  // registered by registerEpfoEsicRoutes() above with full admin authorization and
  // company-isolation checks.

  // Start the automation queue worker (fire-and-forget background process)
  try {
    const { startQueueWorker } = await import("../automation/queue-worker");
    startQueueWorker();
  } catch (err) {
    console.error("[Routes] Failed to start queue worker:", err);
  }

  return httpServer;
}
