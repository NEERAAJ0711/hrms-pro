// Phase 6 — Workforce decision-support intent handlers (read-only).
//
// Each handler computes DETERMINISTIC decisions from a single workforce-signals
// pass (company-isolated; managers limited to allowedEmployeeIds) and renders a
// plain-language briefing that works with NO AI key. When a key is configured it
// appends an AI narrative over those same decisions. Every number comes from the
// deterministic facts, never the LLM — nothing can be hallucinated, and the AI
// never implies an action was taken (strictly decision SUPPORT).

import { computeWorkforceSignals } from "../../workforce/signals";
import { computePerformance, explainPerformance } from "../../workforce/performance";
import { computePromotion, explainPromotion } from "../../workforce/promotion";
import { computeIncrement, explainIncrement } from "../../workforce/increment";
import { computeAttrition, explainAttrition } from "../../workforce/attrition";
import { computeSuccession, explainSuccession } from "../../workforce/succession";
import { computeLearning, explainLearning } from "../../workforce/learning";
import { computeMobility, explainMobility } from "../../workforce/mobility";
import { computeOrgHealth, explainOrgHealth } from "../../workforce/health";
import { computeLeadershipReport, explainLeadershipReport } from "../../workforce/executive";
import { classifyStrategicTopic, computeStrategyFacts, answerCopilot, strategyTopicModules } from "../../workforce/copilot";
import { userHasAccess } from "../../../routes/shared";
import { currentMonthIST } from "../context";
import type { HandlerContext, IntentHandler } from "./shared";
import { t, ok, noData } from "./shared";
import type { DecisionFacts, Decision, AiResult, AiNarrative, Anomaly } from "../../decision/types";
import type { Language } from "../types";

function anomalyLines(lang: Language, anomalies: Anomaly[]): string {
  if (!anomalies.length) return "";
  const icon = (s: string) => (s === "critical" ? "🔴" : s === "warning" ? "🟠" : "🔵");
  return "\n\n" + t(lang, "Flags:", "ध्यान देने योग्य:") + "\n" + anomalies.map((a) => `${icon(a.severity)} ${a.message}`).join("\n");
}

function appendNarrative(lang: Language, baseText: string, ai: AiResult<AiNarrative>): string {
  if (!ai.available) return baseText;
  const d = ai.data;
  const parts: string[] = [];
  if (d.explanation) parts.push(d.explanation);
  if (d.insights.length) parts.push(t(lang, "Insights:", "मुख्य बातें:") + "\n" + d.insights.map((s) => `• ${s}`).join("\n"));
  if (d.recommendations.length) parts.push(t(lang, "Recommendations:", "सुझाव:") + "\n" + d.recommendations.map((s) => `• ${s}`).join("\n"));
  if (!parts.length) return baseText;
  return `${baseText}\n\n🤖 ${t(lang, "AI analysis", "AI विश्लेषण")}:\n${parts.join("\n\n")}`;
}

const conf = (lang: Language, c: string) =>
  c === "high" ? t(lang, "high confidence", "उच्च विश्वास")
    : c === "medium" ? t(lang, "medium confidence", "मध्यम विश्वास")
      : t(lang, "low confidence", "कम विश्वास");

// Render the top decisions as readable lines: subject — recommendation
// (score/category, confidence) + the leading reason.
function renderDecisions(lang: Language, decisions: Decision[], limit = 8): string {
  return decisions.slice(0, limit).map((d) => {
    const bits: string[] = [];
    if (d.score != null) bits.push(`${d.score}/100`);
    if (d.category) bits.push(d.category);
    bits.push(conf(lang, d.confidence));
    const head = `• ${d.subject} — ${d.recommendation} (${bits.join(", ")})`;
    const reason = d.reasons[0] ? `\n   ${d.reasons[0]}` : "";
    return head + reason;
  }).join("\n");
}

async function signalsFor(ctx: HandlerContext) {
  const { month, year } = currentMonthIST();
  return computeWorkforceSignals({
    companyId: ctx.actor.companyId!,
    allowedEmployeeIds: ctx.allowedEmployeeIds,
    month,
    year,
  });
}

// Generic renderer: header + decision list + flags + AI narrative. `emptyEN/HI`
// is shown (gracefully) when the engine produced no decisions.
function present(
  lang: Language,
  facts: DecisionFacts,
  headerEN: string,
  headerHI: string,
  emptyEN: string,
  emptyHI: string,
  ai: AiResult<AiNarrative>,
) {
  if (!facts.decisions.length) {
    const base = t(lang, emptyEN, emptyHI) + anomalyLines(lang, facts.anomalies);
    return ok(appendNarrative(lang, base, ai), false);
  }
  let base = t(lang, headerEN, headerHI) + "\n" + renderDecisions(lang, facts.decisions);
  base += anomalyLines(lang, facts.anomalies);
  return ok(appendNarrative(lang, base, ai));
}

// ── Engines ──────────────────────────────────────────────────────────────────
export const performanceIntelligence: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const signals = await signalsFor(ctx);
  if (signals.coverage.withPerformance === 0) return noData(lang, "performance reviews to analyze", "विश्लेषण के लिए कोई परफ़ॉर्मेंस रिव्यू");
  const facts = computePerformance(signals);
  const ai = await explainPerformance(facts, ctx.actor.companyId);
  return present(lang, facts, `Performance intelligence for ${signals.period.label}:`, `${signals.period.label} की परफ़ॉर्मेंस जानकारी:`, "No performance signals available yet.", "अभी कोई परफ़ॉर्मेंस डेटा उपलब्ध नहीं है।", ai);
};

export const promotionReadiness: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const signals = await signalsFor(ctx);
  const facts = computePromotion(signals);
  const ai = await explainPromotion(facts, ctx.actor.companyId);
  return present(lang, facts, "Promotion-readiness assessment:", "प्रमोशन तैयारी आकलन:", "No employees are clearly promotion-ready right now.", "अभी कोई कर्मचारी स्पष्ट रूप से प्रमोशन के लिए तैयार नहीं है।", ai);
};

export const incrementIntelligence: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const signals = await signalsFor(ctx);
  const facts = computeIncrement(signals);
  const ai = await explainIncrement(facts, ctx.actor.companyId);
  return present(lang, facts, "Increment recommendations (for human review):", "इंक्रीमेंट सुझाव (समीक्षा हेतु):", "Not enough data to suggest increments yet.", "इंक्रीमेंट सुझाने के लिए अभी पर्याप्त डेटा नहीं है।", ai);
};

export const attritionRisk: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const signals = await signalsFor(ctx);
  const facts = computeAttrition(signals);
  const ai = await explainAttrition(facts, ctx.actor.companyId);
  return present(lang, facts, "Attrition-risk assessment:", "एट्रिशन जोखिम आकलन:", "No notable attrition risk detected.", "कोई उल्लेखनीय एट्रिशन जोखिम नहीं मिला।", ai);
};

export const successionPlanning: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const signals = await signalsFor(ctx);
  const facts = computeSuccession(signals);
  const ai = await explainSuccession(facts, ctx.actor.companyId);
  return present(lang, facts, "Succession bench:", "उत्तराधिकार बेंच:", "No high-potential succession candidates identified yet.", "अभी कोई उच्च-संभावना उत्तराधिकारी नहीं मिला।", ai);
};

export const learningDevelopment: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const signals = await signalsFor(ctx);
  const facts = computeLearning(signals);
  const ai = await explainLearning(facts, ctx.actor.companyId);
  return present(lang, facts, "Learning & development focus:", "लर्निंग और विकास फोकस:", "No specific development needs detected right now.", "अभी कोई विशेष विकास आवश्यकता नहीं मिली।", ai);
};

export const internalMobility: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const signals = await signalsFor(ctx);
  const facts = await computeMobility(signals, ctx.actor.companyId!);
  const ai = await explainMobility(facts, ctx.actor.companyId);
  return present(lang, facts, "Internal mobility matches:", "आंतरिक गतिशीलता मिलान:", "No open roles with strong internal matches right now.", "अभी कोई खुली भूमिका के लिए मज़बूत आंतरिक मिलान नहीं है।", ai);
};

export const orgHealth: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const signals = await signalsFor(ctx);
  const facts = computeOrgHealth(signals);
  const ai = await explainOrgHealth(facts, ctx.actor.companyId);
  return present(lang, facts, `Organizational health — ${signals.period.label}:`, `संगठनात्मक स्वास्थ्य — ${signals.period.label}:`, "Not enough data to compute organizational health.", "संगठनात्मक स्वास्थ्य निकालने के लिए पर्याप्त डेटा नहीं है।", ai);
};

export const leadershipReport: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const signals = await signalsFor(ctx);
  const facts = computeLeadershipReport(signals);
  const ai = await explainLeadershipReport(facts, ctx.actor.companyId);
  return present(lang, facts, `Executive briefing — ${signals.period.label}:`, `कार्यकारी ब्रीफ़िंग — ${signals.period.label}:`, "Not enough data for a leadership briefing yet.", "लीडरशिप ब्रीफ़िंग के लिए अभी पर्याप्त डेटा नहीं है।", ai);
};

export const hrCopilot: IntentHandler = async (ctx) => {
  const lang = ctx.actor.language;
  const question = ctx.detected.params.query || "";
  const topic = classifyStrategicTopic(question);
  // Topic-aware RBAC: the orchestrator only cleared the baseline hr_copilot
  // modules (attendance/leave). A copilot question can route into payroll
  // (increment) or recruitment (mobility) data, so re-check the modules THIS
  // topic actually reads against the user's real permissions (honoring per-user
  // revokes). super_admin always passes inside userHasAccess.
  for (const mod of strategyTopicModules(topic)) {
    let permitted = true;
    try {
      permitted = await userHasAccess({ id: ctx.actor.userId, role: ctx.actor.role }, mod);
    } catch {
      permitted = false; // fail closed
    }
    if (!permitted) {
      return ok(t(lang, "You don't have permission to access this information.", "आपके पास यह जानकारी देखने की अनुमति नहीं है।"), false);
    }
  }
  const signals = await signalsFor(ctx);
  const facts = await computeStrategyFacts(topic, signals, ctx.actor.companyId!);
  const ai = await answerCopilot(question, facts, ctx.actor.companyId);
  return present(
    lang,
    facts,
    t(lang, `Strategic answer (${topic}):`, `रणनीतिक उत्तर (${topic}):`),
    t(lang, `Strategic answer (${topic}):`, `रणनीतिक उत्तर (${topic}):`),
    "I don't have enough data to answer that strategically yet.",
    "इसका रणनीतिक उत्तर देने के लिए अभी पर्याप्त डेटा नहीं है।",
    ai,
  );
};
