import { randomUUID } from "crypto";
import { AI_CONFIG, type AiFeature, type AiProvider } from "../config";
import { aiLogger } from "../logging/ai-logger";

// Per-1K-token pricing (USD) for rough cost estimation. Approximate — used only
// for reporting/observability, never for billing. Easy to update as prices move.
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gemini-2.0-flash": { input: 0, output: 0 },
};

export interface UsageRecord {
  id: string;
  feature: AiFeature;
  provider: AiProvider;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  success: boolean;
  companyId: string | null;
  employeeId: string | null;
  // Phase 2 — AI-assistant action audit fields (null for legacy/raw usage rows).
  userId: string | null;
  intent: string | null;
  module: string | null;
  action: string | null;
  error: string | null;
  createdAt: string;
}

function estimateCost(model: string | null, promptTokens: number, completionTokens: number): number {
  if (!model) return 0;
  const p = PRICING[model];
  if (!p) return 0;
  return (promptTokens / 1000) * p.input + (completionTokens / 1000) * p.output;
}

// In-memory ring buffer so dashboards stay responsive even when the DB is
// unavailable or the usage table has not been migrated yet.
const buffer: UsageRecord[] = [];

function pushBuffer(rec: UsageRecord): void {
  buffer.push(rec);
  if (buffer.length > AI_CONFIG.metrics.bufferSize) buffer.shift();
}

export interface RecordUsageInput {
  feature: AiFeature;
  provider: AiProvider;
  model?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  latencyMs?: number;
  success?: boolean;
  companyId?: string | null;
  employeeId?: string | null;
  userId?: string | null;
  intent?: string | null;
  module?: string | null;
  action?: string | null;
  error?: string | null;
}

// Best-effort: never throws, never blocks the caller's response path.
export function recordUsage(input: RecordUsageInput): void {
  try {
    const promptTokens = input.promptTokens ?? input.usage?.prompt_tokens ?? 0;
    const completionTokens = input.completionTokens ?? input.usage?.completion_tokens ?? 0;
    const totalTokens =
      input.totalTokens ?? input.usage?.total_tokens ?? promptTokens + completionTokens;
    const model = input.model ?? null;

    const rec: UsageRecord = {
      id: randomUUID(),
      feature: input.feature,
      provider: input.provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: estimateCost(model, promptTokens, completionTokens),
      latencyMs: input.latencyMs ?? 0,
      success: input.success ?? true,
      companyId: input.companyId ?? null,
      employeeId: input.employeeId ?? null,
      userId: input.userId ?? null,
      intent: input.intent ?? null,
      module: input.module ?? null,
      action: input.action ?? null,
      error: input.error ?? null,
      createdAt: new Date().toISOString(),
    };

    pushBuffer(rec);
    if (AI_CONFIG.metrics.persist) void persist(rec);
  } catch (err) {
    aiLogger.warn("AI Usage", `failed to record usage: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function persist(rec: UsageRecord): Promise<void> {
  try {
    const { db } = await import("../../db");
    const { aiUsageLogs } = await import("../../../shared/schema");
    await db.insert(aiUsageLogs).values({
      id: rec.id,
      companyId: rec.companyId,
      employeeId: rec.employeeId,
      userId: rec.userId,
      intent: rec.intent,
      module: rec.module,
      action: rec.action,
      feature: rec.feature,
      provider: rec.provider,
      model: rec.model,
      promptTokens: rec.promptTokens,
      completionTokens: rec.completionTokens,
      totalTokens: rec.totalTokens,
      estimatedCostUsd: rec.estimatedCostUsd.toFixed(6),
      latencyMs: rec.latencyMs,
      success: rec.success,
      error: rec.error,
      createdAt: rec.createdAt,
    });
  } catch {
    // The table may not exist yet (dev before db:push / prod before migration).
    // The in-memory buffer still has the record, so reporting keeps working.
  }
}

export interface UsageBucket {
  calls: number;
  tokens: number;
  costUsd: number;
}

export interface UsageSummary {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  failures: number;
  byProvider: Record<string, UsageBucket>;
  byFeature: Record<string, UsageBucket>;
}

export function getUsageSummary(): UsageSummary {
  const summary: UsageSummary = {
    totalCalls: buffer.length,
    totalTokens: 0,
    totalCostUsd: 0,
    failures: 0,
    byProvider: {},
    byFeature: {},
  };
  for (const r of buffer) {
    summary.totalTokens += r.totalTokens;
    summary.totalCostUsd += r.estimatedCostUsd;
    if (!r.success) summary.failures++;
    const bp = (summary.byProvider[r.provider] ??= { calls: 0, tokens: 0, costUsd: 0 });
    bp.calls++;
    bp.tokens += r.totalTokens;
    bp.costUsd += r.estimatedCostUsd;
    const bf = (summary.byFeature[r.feature] ??= { calls: 0, tokens: 0, costUsd: 0 });
    bf.calls++;
    bf.tokens += r.totalTokens;
    bf.costUsd += r.estimatedCostUsd;
  }
  return summary;
}

export function getRecentUsage(limit = 100): UsageRecord[] {
  return buffer.slice(-limit).reverse();
}
