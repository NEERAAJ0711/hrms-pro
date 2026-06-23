// Phase 3 — Recruitment AI shared types. These describe the structured shapes
// the recruitment AI features return. They are intentionally permissive (most
// fields optional) because the underlying resumes/JDs vary widely and we never
// fabricate values the source does not contain.

export interface ParsedResume {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  currentCompany?: string;
  currentDesignation?: string;
  totalExperienceYears?: number;
  skills?: string[];
  education?: string[];
  experience?: Array<{ company?: string; designation?: string; duration?: string }>;
  certifications?: string[];
  languages?: string[];
  projects?: string[];
  links?: string[];
  noticePeriod?: string;
  currentSalary?: string;
  expectedSalary?: string;
  preferredLocation?: string;
  summary?: string;
}

export interface CandidateScore {
  score: number; // 0–100
  recommendation: "strong_hire" | "hire" | "maybe" | "no_hire";
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  rationale: string;
}

export interface JdMatch {
  matchPercent: number; // 0–100
  matchingSkills: string[];
  missingSkills: string[];
  extraSkills: string[];
  experienceGap: string;
  qualificationGap: string;
  locationFit: string;
  salaryFit: string;
  summary: string;
}

export interface CandidateSummary {
  summary: string;
  careerProgression: string;
  strengths: string[];
  concerns: string[];
  riskFactors: string[];
  recommendation: string;
}

export interface InterviewQuestions {
  technical: string[];
  behavioural: string[];
  situational: string[];
  leadership: string[];
  problemSolving: string[];
  communication: string[];
}

export interface RankedCandidate {
  applicationId: string;
  candidateName: string;
  score: number;
  recommendation: string;
  rank: number;
  rationale: string;
}

export interface DuplicateMatch {
  applicationId: string;
  candidateName: string;
  reasons: string[];
  confidence: "high" | "medium" | "low";
}

export interface RecruitmentDashboard {
  openPositions: number;
  totalApplications: number;
  pipelineByStage: Record<string, number>;
  interviewsScheduled: number;
  offersExtended: number;
  offersAccepted: number;
  offerAcceptanceRate: number; // %
  interviewConversionRate: number; // % applied → interview
  averageTimeToHireDays: number | null;
  summary: string;
}

// Standard result envelope mirroring the Phase 2 "graceful no-key/no-data"
// pattern: callers can render deterministic data and an explanatory message
// without ever surfacing a fabricated AI answer.
export type AiResult<T> =
  | { available: true; data: T }
  | { available: false; reason: string; message: string };
