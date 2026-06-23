import type { RecruitmentDashboard } from "./types";

// Phase 3 — deterministic recruitment dashboard metrics. Computed purely from
// live DB rows (no AI, no fabrication). The textual summary is generated from
// the same numbers so it can never contradict them.

export interface DashboardJob {
  status?: string | null;
}

export interface DashboardApplication {
  status?: string | null;
  appliedAt?: Date | string | null;
  hiredAt?: Date | string | null;
}

const OPEN_JOB_STATUSES = new Set(["open", "active", "published"]);
const INTERVIEW_STAGES = new Set(["interview_scheduled", "interviewed", "offered", "offer_accepted", "offer_negotiated", "offer_rejected", "hired"]);
const OFFER_STAGES = new Set(["offered", "offer_accepted", "offer_negotiated", "offer_rejected", "hired"]);
const ACCEPTED_STAGES = new Set(["offer_accepted", "hired"]);

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

export function computeRecruitmentDashboard(jobs: DashboardJob[], applications: DashboardApplication[]): RecruitmentDashboard {
  const openPositions = jobs.filter((j) => OPEN_JOB_STATUSES.has((j.status || "").toLowerCase())).length;
  const totalApplications = applications.length;

  const pipelineByStage: Record<string, number> = {};
  let interviewsScheduled = 0;
  let offersExtended = 0;
  let offersAccepted = 0;
  let reachedInterview = 0;
  const timeToHire: number[] = [];

  for (const a of applications) {
    const status = (a.status || "unknown").toLowerCase();
    pipelineByStage[status] = (pipelineByStage[status] || 0) + 1;
    if (status === "interview_scheduled" || status === "interviewed") interviewsScheduled++;
    if (INTERVIEW_STAGES.has(status)) reachedInterview++;
    if (OFFER_STAGES.has(status)) offersExtended++;
    if (ACCEPTED_STAGES.has(status)) offersAccepted++;

    if (status === "hired") {
      const applied = toDate(a.appliedAt);
      const hired = toDate(a.hiredAt);
      if (applied && hired && hired >= applied) {
        timeToHire.push((hired.getTime() - applied.getTime()) / (1000 * 60 * 60 * 24));
      }
    }
  }

  const averageTimeToHireDays = timeToHire.length
    ? Math.round((timeToHire.reduce((s, n) => s + n, 0) / timeToHire.length) * 10) / 10
    : null;

  const offerAcceptanceRate = pct(offersAccepted, offersExtended);
  const interviewConversionRate = pct(reachedInterview, totalApplications);

  const summary =
    `${openPositions} open position(s) with ${totalApplications} total application(s). ` +
    `${reachedInterview} reached interview (${interviewConversionRate}% conversion), ` +
    `${offersExtended} offer(s) extended and ${offersAccepted} accepted ` +
    `(${offerAcceptanceRate}% acceptance)` +
    (averageTimeToHireDays != null ? `, averaging ${averageTimeToHireDays} day(s) to hire.` : ".");

  return {
    openPositions,
    totalApplications,
    pipelineByStage,
    interviewsScheduled,
    offersExtended,
    offersAccepted,
    offerAcceptanceRate,
    interviewConversionRate,
    averageTimeToHireDays,
    summary,
  };
}
