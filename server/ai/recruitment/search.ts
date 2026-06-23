// Phase 3 — deterministic natural-language candidate search. No AI/hallucination:
// the query is parsed into structured filters (skills/keywords, min experience,
// location, status) and matched against live candidate rows with an explainable
// score. Used by both the REST search endpoint and the candidate_search intent.

export interface SearchableCandidate {
  applicationId: string;
  name: string;
  status?: string | null;
  location?: string | null;
  skills?: string[] | null;
  experienceYears?: number | null;
  resumeText?: string | null;
  appliedAt?: string | null;
}

export interface CandidateSearchResult {
  applicationId: string;
  name: string;
  status: string;
  experienceYears: number | null;
  matchedOn: string[];
  score: number;
}

const KNOWN_STATUSES = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "interviewed",
  "offered",
  "offer_accepted",
  "offer_negotiated",
  "offer_rejected",
  "hired",
  "rejected",
  "withdrawn",
];

const STOPWORDS = new Set([
  "find","show","me","all","the","a","an","with","and","or","of","in","at","for","who","has","have",
  "candidate","candidates","applicant","applicants","resume","resumes","years","year","yrs","yr",
  "experience","exp","located","location","based","from","near","status","is","are","than","more",
  "least","minimum","min","over","above","atleast","plus",
]);

export interface ParsedQuery {
  minExperience: number | null;
  status: string | null;
  location: string | null;
  terms: string[];
}

export function parseSearchQuery(query: string): ParsedQuery {
  const q = (query || "").toLowerCase();

  let minExperience: number | null = null;
  const expMatch = q.match(/(\d+)\s*\+?\s*(?:years|year|yrs|yr)/);
  if (expMatch) minExperience = Number(expMatch[1]);

  let status: string | null = null;
  for (const s of KNOWN_STATUSES) {
    if (q.includes(s) || q.includes(s.replace(/_/g, " "))) {
      status = s;
      break;
    }
  }

  let location: string | null = null;
  const locMatch = q.match(/\b(?:in|at|from|near|located in|based in)\s+([a-z][a-z .]+)/);
  if (locMatch) location = locMatch[1].trim().split(/\s+(?:with|who|having|and|status)\b/)[0].trim();

  const terms = q
    .replace(/[^a-z0-9.+#\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t));

  return { minExperience, status, location, terms: Array.from(new Set(terms)) };
}

export function searchCandidates(query: string, candidates: SearchableCandidate[]): CandidateSearchResult[] {
  const parsed = parseSearchQuery(query);
  const results: CandidateSearchResult[] = [];

  for (const c of candidates) {
    const matchedOn: string[] = [];
    let score = 0;

    const skillsLc = (c.skills || []).map((s) => s.toLowerCase());
    const haystack = [c.name, c.location, c.resumeText, ...(c.skills || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    // Experience filter (hard): if asked and candidate is below, skip.
    if (parsed.minExperience != null) {
      if (c.experienceYears == null || c.experienceYears < parsed.minExperience) continue;
      matchedOn.push(`${c.experienceYears}+ yrs experience`);
      score += 2;
    }

    // Status filter (hard).
    if (parsed.status) {
      if ((c.status || "").toLowerCase() !== parsed.status) continue;
      matchedOn.push(`status: ${parsed.status}`);
      score += 1;
    }

    // Location (soft but weighted).
    if (parsed.location) {
      if ((c.location || "").toLowerCase().includes(parsed.location)) {
        matchedOn.push(`location: ${c.location}`);
        score += 2;
      }
    }

    // Term matching — skills are weighted higher than free-text resume hits.
    for (const term of parsed.terms) {
      if (skillsLc.some((s) => s.includes(term))) {
        matchedOn.push(`skill: ${term}`);
        score += 3;
      } else if (haystack.includes(term)) {
        matchedOn.push(term);
        score += 1;
      }
    }

    // If the query had only hard filters (no free terms) and they matched, keep it.
    const onlyHardFilters = parsed.terms.length === 0 && (parsed.minExperience != null || parsed.status || parsed.location);
    if (score <= 0 && !onlyHardFilters) continue;
    if (matchedOn.length === 0) continue;

    results.push({
      applicationId: c.applicationId,
      name: c.name,
      status: c.status || "unknown",
      experienceYears: c.experienceYears ?? null,
      matchedOn: Array.from(new Set(matchedOn)),
      score,
    });
  }

  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
