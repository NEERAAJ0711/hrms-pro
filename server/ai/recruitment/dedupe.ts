import type { DuplicateMatch } from "./types";

// Phase 3 — deterministic duplicate-candidate detection. No AI: pure comparison
// on normalized email, phone, PAN, name+company and resume-text similarity.
// Surfaces a "merge?" suggestion instead of silently creating duplicates.

export interface DedupeCandidate {
  applicationId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pan?: string | null;
  company?: string | null;
  resumeText?: string | null;
}

function normEmail(v?: string | null): string {
  return (v || "").trim().toLowerCase();
}

function normPhone(v?: string | null): string {
  const digits = (v || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normPan(v?: string | null): string {
  return (v || "").replace(/\s/g, "").toUpperCase();
}

function normName(v?: string | null): string {
  return (v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenSet(text?: string | null): Set<string> {
  const toks = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  return new Set(toks);
}

// Jaccard similarity over word tokens — cheap, deterministic, language-agnostic.
export function resumeSimilarity(a?: string | null, b?: string | null): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  sa.forEach((t) => {
    if (sb.has(t)) inter++;
  });
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Compare `target` against `existing` candidates and return likely duplicates.
export function findDuplicates(target: DedupeCandidate, existing: DedupeCandidate[]): DuplicateMatch[] {
  const tEmail = normEmail(target.email);
  const tPhone = normPhone(target.phone);
  const tPan = normPan(target.pan);
  const tName = normName(target.name);
  const tCompany = normName(target.company);

  const matches: DuplicateMatch[] = [];
  for (const e of existing) {
    if (e.applicationId === target.applicationId) continue;
    const reasons: string[] = [];
    let strong = false;

    if (tEmail && tEmail === normEmail(e.email)) {
      reasons.push("Same email address");
      strong = true;
    }
    if (tPhone && tPhone === normPhone(e.phone)) {
      reasons.push("Same phone number");
      strong = true;
    }
    if (tPan && tPan === normPan(e.pan)) {
      reasons.push("Same PAN");
      strong = true;
    }
    if (tName && tName === normName(e.name) && tCompany && tCompany === normName(e.company)) {
      reasons.push("Same name and company");
    }
    const sim = resumeSimilarity(target.resumeText, e.resumeText);
    if (sim >= 0.6) {
      reasons.push(`Highly similar resume (${Math.round(sim * 100)}% overlap)`);
    } else if (sim >= 0.4 && tName && tName === normName(e.name)) {
      reasons.push(`Similar resume (${Math.round(sim * 100)}% overlap) and same name`);
    }

    if (reasons.length === 0) continue;

    const confidence: DuplicateMatch["confidence"] =
      strong || sim >= 0.6 ? "high" : reasons.length >= 2 ? "medium" : "low";

    matches.push({
      applicationId: e.applicationId,
      candidateName: e.name || "Unknown",
      reasons,
      confidence,
    });
  }

  // Strongest first.
  const order = { high: 0, medium: 1, low: 2 } as const;
  return matches.sort((a, b) => order[a.confidence] - order[b.confidence]);
}
