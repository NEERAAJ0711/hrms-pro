// Central AI configuration — single source of truth for models, limits,
// timeouts, feature flags and tuning knobs used across the AI module. Every
// value keeps the historical default, and can be overridden via environment
// variables without touching code.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

export const AI_CONFIG = {
  models: {
    openaiChat: process.env.AI_OPENAI_MODEL || "gpt-4o-mini",
    geminiChat: process.env.AI_GEMINI_MODEL || "gemini-2.0-flash",
    anthropicChat: process.env.AI_ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
  },
  temperatures: {
    chat: 0.7,
    compliance: 0.3,
    jobAnalysis: 0.2,
    extraction: 0,
    // Recruitment AI: low temperature for consistent, deterministic-leaning output.
    recruitment: 0.2,
    // Phase 4 analytics (attendance/leave/payroll narratives): low temperature so
    // the plain-language explanation stays faithful to the computed facts.
    analytics: 0.3,
  },
  maxTokens: {
    chat: 400,
    compliance: 500,
    jobAnalysis: 400,
    test: 5,
    // Recruitment AI generates richer JSON (breakdowns, question sets, summaries).
    recruitment: 1200,
    // Phase 4 analytics narratives (explanation + insights + recommendations).
    analytics: 1000,
  },
  history: {
    chatWindow: 12,
    complianceWindow: 10,
    fetchLimit: 50,
  },
  timeouts: {
    providerTestMs: envInt("AI_TEST_TIMEOUT_MS", 12000),
  },
  scheduler: {
    intervalMs: envInt("AI_FOLLOWUP_INTERVAL_MS", 60 * 60 * 1000),
    firstRunDelayMs: envInt("AI_FOLLOWUP_FIRST_RUN_MS", 5000),
  },
  cache: {
    // Disabled by default so responses are never served stale unless opted in.
    enabled: envBool("AI_CACHE_ENABLED", false),
    ttlMs: envInt("AI_CACHE_TTL_MS", 5 * 60 * 1000),
    maxEntries: envInt("AI_CACHE_MAX_ENTRIES", 500),
  },
  security: {
    // When false (default) the prompt guard only detects + logs, never mutates input.
    sanitizeInput: envBool("AI_SANITIZE_INPUT", false),
    maxInputChars: envInt("AI_MAX_INPUT_CHARS", 8000),
  },
  metrics: {
    persist: envBool("AI_USAGE_PERSIST", true),
    bufferSize: envInt("AI_USAGE_BUFFER", 500),
  },
} as const;

export type AiFeature =
  | "hr_chat"
  | "compliance"
  | "job_analysis"
  | "kyc_extraction"
  | "profile_extraction"
  | "provider_test"
  // Phase 3 — Recruitment AI Suite
  | "resume_parse"
  | "candidate_score"
  | "jd_match"
  | "candidate_summary"
  | "interview_questions"
  | "candidate_rank"
  | "candidate_search"
  | "recruitment_dashboard"
  // Phase 4 — Attendance, Leave & Payroll AI (read-only intelligence)
  | "attendance_insight"
  | "leave_insight"
  | "payroll_explain"
  | "payroll_insight"
  | "manager_insight"
  | "executive_summary"
  // Phase 6 — Enterprise AI Decision Support (read-only, explainable)
  | "performance_insight"
  | "promotion_readiness"
  | "increment_reco"
  | "attrition_risk"
  | "succession_plan"
  | "learning_reco"
  | "internal_mobility"
  | "org_health"
  | "leadership_report"
  | "hr_copilot";

export type AiProvider = "openai" | "gemini" | "anthropic" | "rule-based";
