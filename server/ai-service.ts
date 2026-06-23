// AI HR Assistant Service — backward-compatible facade.
//
// The implementation now lives in the modular `server/ai/` tree (config,
// providers, prompts, extraction, services, metrics). This file is a thin
// re-export so every existing `import { … } from "./ai-service"` (or
// "../ai-service") keeps working unchanged. New code should import from
// `server/ai` directly.

export type {
  KycStatus,
  Attachment,
  EmployeeContext,
  KycExtractionResult,
  AiProviderTest,
} from "./ai/index";

export {
  // Providers / keys / diagnostics
  setOpenAIKeyOverride,
  setGeminiKeyOverride,
  setAnthropicKeyOverride,
  loadAllApiKeysFromDB,
  loadOpenAIKeyFromDB,
  getAiProviderStatus,
  testAiProviders,
  // Extraction
  extractKycDocument,
  isKycExtractable,
  extractProfileFromText,
  messageMayContainProfileInfo,
  // Services
  generateAiReply,
  generateComplianceReply,
  analyzeJobError,
  computeKycOverallStatus,
  createFollowUpTask,
  startAiFollowUpScheduler,
} from "./ai/index";
