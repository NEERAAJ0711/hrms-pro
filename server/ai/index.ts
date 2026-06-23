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
export { setAnthropicKeyOverride } from "./providers/anthropic";
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
export {
  extractResumeText,
  parseResumeText,
  isResumeExtractable,
  normalizeParsedResume,
  RESUME_EXTENSIONS,
} from "./extraction/resume";

// Phase 3 — Recruitment AI Suite (scoring, JD match, summary, questions, rank,
// dedupe, dashboard). Importing prompts here registers them in the prompt registry.
import "./recruitment/prompts";
export {
  scoreCandidate,
  matchJd,
  summarizeCandidate,
  generateInterviewQuestions,
  rankCandidates,
  type JobContext,
  type CandidateContext,
  type ScoredInput,
} from "./recruitment/service";
export { findDuplicates, resumeSimilarity, type DedupeCandidate } from "./recruitment/dedupe";
export {
  searchCandidates,
  parseSearchQuery,
  type SearchableCandidate,
  type CandidateSearchResult,
} from "./recruitment/search";
export { computeRecruitmentDashboard, type DashboardJob, type DashboardApplication } from "./recruitment/dashboard";

// Phase 4 — Attendance, Leave & Payroll AI (read-only intelligence). Importing
// prompts here registers the analytics narratives in the prompt registry.
import "./analytics/prompts";
export {
  computeAttendanceFacts,
  explainAttendance,
  type AttendanceFacts,
  type AttendanceScope,
} from "./attendance/service";
export {
  computeLeaveFacts,
  explainLeave,
  type LeaveFacts,
  type LeaveScope,
} from "./leave/service";
export {
  computePayrollFacts,
  explainPayroll,
  computePayrollInsights,
  explainPayrollInsights,
  type PayrollFacts,
  type PayrollInsightFacts,
} from "./payroll/service";
export {
  computeManagerInsights,
  explainManagerInsights,
  computeExecutiveSummary,
  explainExecutiveSummary,
  type ManagerInsightFacts,
  type ExecutiveSummaryFacts,
} from "./insights/service";
export type { AiNarrative, Anomaly, AnomalySeverity } from "./analytics/types";
export type {
  ParsedResume,
  CandidateScore,
  JdMatch,
  CandidateSummary,
  InterviewQuestions,
  RankedCandidate,
  DuplicateMatch,
  RecruitmentDashboard,
  AiResult,
} from "./recruitment/types";

// Phase 6 — Enterprise AI Intelligence, Decision Support & Strategic HR Copilot
// (read-only, explainable). Importing prompts here registers the decision-support
// narratives. Engines emit deterministic Decision[]; the LLM only phrases them.
import "./workforce/prompts";
export {
  computeWorkforceSignals,
  type WorkforceSignals,
  type WorkforceScope,
  type EmployeeSignal,
  type DepartmentSignal,
} from "./workforce/signals";
export {
  confidenceFrom,
  completenessOf,
  score100,
  band,
  type Decision,
  type DecisionFacts,
  type Confidence,
} from "./decision/types";
export { computePerformance, explainPerformance } from "./workforce/performance";
export { computePromotion, explainPromotion } from "./workforce/promotion";
export { computeIncrement, explainIncrement } from "./workforce/increment";
export { computeAttrition, explainAttrition } from "./workforce/attrition";
export { computeSuccession, explainSuccession } from "./workforce/succession";
export { computeLearning, explainLearning } from "./workforce/learning";
export { computeMobility, explainMobility } from "./workforce/mobility";
export { computeOrgHealth, explainOrgHealth } from "./workforce/health";
export { computeLeadershipReport, explainLeadershipReport } from "./workforce/executive";
export {
  classifyStrategicTopic,
  computeStrategyFacts,
  answerCopilot,
  strategyTopicModules,
  STRATEGY_TOPIC_MODULES,
  type StrategyTopic,
} from "./workforce/copilot";

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
