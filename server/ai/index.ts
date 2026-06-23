// ─── AI module public API ──────────────────────────────────────────────────────
// Single import surface for the rest of the server. The legacy `server/ai-service.ts`
// re-exports everything from here for full backward compatibility.

// Types
export type {
  KycStatus,
  Attachment,
  EmployeeContext,
  KycExtractionResult,
} from "./types";
export type { AiFeature, AiProvider } from "./config";
export { AI_CONFIG } from "./config";

// Providers — key management, status & diagnostics
export { setOpenAIKeyOverride } from "./providers/openai";
export { setGeminiKeyOverride } from "./providers/gemini";
export {
  loadAllApiKeysFromDB,
  loadOpenAIKeyFromDB,
  getAiProviderStatus,
  testAiProviders,
  type AiProviderTest,
} from "./providers/provider-manager";

// Extraction
export { extractKycDocument, isKycExtractable } from "./extraction/kyc";
export { extractProfileFromText, messageMayContainProfileInfo } from "./extraction/profile";

// Services
export { generateAiReply } from "./services/chat-service";
export { generateComplianceReply, analyzeJobError } from "./services/compliance-service";
export {
  computeKycOverallStatus,
  createFollowUpTask,
  startAiFollowUpScheduler,
} from "./services/scheduler-service";

// Metrics (observability — additive, not part of the legacy API)
export { getUsageSummary, getRecentUsage, recordUsage } from "./metrics/usage";

// Phase 2 — Enterprise AI intent layer (deterministic, RBAC-checked, live-data
// handlers). The chat route calls handleAssistantQuery before generateAiReply.
export { handleAssistantQuery, type AssistantQueryInput } from "./intents/orchestrator";
export { detectIntent } from "./intents/detector";
export { buildActor, authorizeIntent, normalizeLanguage } from "./intents/context";
export type { AiActor, DetectedIntent, AiQueryResult } from "./intents/types";
