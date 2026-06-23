// Phase 4 — shared strict-JSON caller for the Attendance/Leave/Payroll AI
// features. This is the SAME provider-agnostic caller used by recruitment
// (OpenAI first, Gemini fallback, usage metrics, optional cache). Re-exported
// under a neutral name so analytics services read clearly without depending on
// a recruitment-specific identifier.

export {
  callRecruitmentJson as callAnalyticsJson,
  type AiJsonOptions,
  type AiJsonOutcome,
} from "../recruitment/ai-json";
