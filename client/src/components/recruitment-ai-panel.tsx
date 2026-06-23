import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Sparkles,
  FileText,
  Gauge,
  ScrollText,
  MessageSquareText,
  Copy,
  Target,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { JobApplication } from "@shared/schema";

interface ParsedResume {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  currentCompany?: string;
  currentDesignation?: string;
  totalExperienceYears?: number;
  skills?: string[];
  education?: string[];
  certifications?: string[];
  summary?: string;
}

interface CandidateScore {
  score: number;
  recommendation: "strong_hire" | "hire" | "maybe" | "no_hire";
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  rationale: string;
}

interface JdMatch {
  matchPercent: number;
  matchingSkills: string[];
  missingSkills: string[];
  extraSkills: string[];
  experienceGap: string;
  qualificationGap: string;
  locationFit: string;
  salaryFit: string;
  summary: string;
}

interface CandidateSummary {
  summary: string;
  careerProgression: string;
  strengths: string[];
  concerns: string[];
  riskFactors: string[];
  recommendation: string;
}

interface InterviewQuestions {
  technical: string[];
  behavioural: string[];
  situational: string[];
  leadership: string[];
  problemSolving: string[];
  communication: string[];
}

interface DuplicateMatch {
  applicationId: string;
  candidateName: string;
  reasons: string[];
  confidence: "high" | "medium" | "low";
}

type NoAi = { available: false; reason: string; message: string };

const recommendationColors: Record<string, string> = {
  strong_hire: "bg-green-200 text-green-900 dark:bg-green-800 dark:text-green-100",
  hire: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  maybe: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  no_hire: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const confidenceColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  low: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

function scoreColor(score: number): string {
  if (score >= 75) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function ChipList({ items, testid }: { items?: string[]; testid: string }) {
  if (!items || items.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1" data-testid={testid}>
      {items.map((s, i) => (
        <Badge key={`${s}-${i}`} variant="secondary" className="text-xs">
          {s}
        </Badge>
      ))}
    </div>
  );
}

function NoAiNotice({ data }: { data: NoAi }) {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      data-testid="notice-ai-unavailable"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{data.message}</span>
    </div>
  );
}

interface Props {
  application: JobApplication;
}

export function RecruitmentAiPanel({ application }: Props) {
  const { toast } = useToast();
  const appId = application.id;

  const parsedFromRecord = (application.parsedResume as ParsedResume | null) ?? null;
  const [parsed, setParsed] = useState<ParsedResume | null>(parsedFromRecord);
  const [score, setScore] = useState<CandidateScore | null>(
    (application.aiScoreBreakdown as CandidateScore | null) ?? null,
  );
  const [summary, setSummary] = useState<CandidateSummary | null>(null);
  const [summaryText, setSummaryText] = useState<string | null>(application.aiSummary ?? null);
  const [questions, setQuestions] = useState<InterviewQuestions | null>(
    (application.aiQuestions as InterviewQuestions | null) ?? null,
  );
  const [match, setMatch] = useState<JdMatch | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [notice, setNotice] = useState<NoAi | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/job-applications"] });

  function handleError(err: unknown) {
    setNotice(null);
    toast({
      title: "Could not complete",
      description: err instanceof Error ? err.message : "Something went wrong.",
      variant: "destructive",
    });
  }

  const parseMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/recruitment/applications/${appId}/parse-resume`)).json(),
    onSuccess: (data: any) => {
      if (data.available === false) return setNotice(data as NoAi);
      setNotice(null);
      setParsed(data.parsed as ParsedResume);
      invalidate();
    },
    onError: handleError,
  });

  const scoreMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/recruitment/applications/${appId}/score`)).json(),
    onSuccess: (data: any) => {
      if (data.available === false) return setNotice(data as NoAi);
      setNotice(null);
      setScore(data.score as CandidateScore);
      invalidate();
    },
    onError: handleError,
  });

  const summaryMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/recruitment/applications/${appId}/summary`)).json(),
    onSuccess: (data: any) => {
      if (data.available === false) return setNotice(data as NoAi);
      setNotice(null);
      setSummary(data.summary as CandidateSummary);
      setSummaryText((data.summary as CandidateSummary).summary);
      invalidate();
    },
    onError: handleError,
  });

  const questionsMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/recruitment/applications/${appId}/questions`)).json(),
    onSuccess: (data: any) => {
      if (data.available === false) return setNotice(data as NoAi);
      setNotice(null);
      setQuestions(data.questions as InterviewQuestions);
      invalidate();
    },
    onError: handleError,
  });

  const matchMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/recruitment/applications/${appId}/match`)).json(),
    onSuccess: (data: any) => {
      if (data.available === false) return setNotice(data as NoAi);
      setNotice(null);
      setMatch(data.data as JdMatch);
    },
    onError: handleError,
  });

  const duplicatesMutation = useMutation({
    mutationFn: async () => (await apiRequest("GET", `/api/recruitment/applications/${appId}/duplicates`)).json(),
    onSuccess: (data: any) => {
      setNotice(null);
      setDuplicates((data.duplicates as DuplicateMatch[]) ?? []);
    },
    onError: handleError,
  });

  const anyPending =
    parseMutation.isPending ||
    scoreMutation.isPending ||
    summaryMutation.isPending ||
    questionsMutation.isPending ||
    matchMutation.isPending ||
    duplicatesMutation.isPending;

  const Spin = ({ pending }: { pending: boolean }) =>
    pending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null;

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3" data-testid="panel-recruitment-ai">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold">AI Hiring Tools</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={anyPending} onClick={() => parseMutation.mutate()} data-testid="button-ai-parse">
          <Spin pending={parseMutation.isPending} />
          <FileText className="h-4 w-4 mr-2" /> Parse Resume
        </Button>
        <Button size="sm" variant="outline" disabled={anyPending} onClick={() => scoreMutation.mutate()} data-testid="button-ai-score">
          <Spin pending={scoreMutation.isPending} />
          <Gauge className="h-4 w-4 mr-2" /> Score
        </Button>
        <Button size="sm" variant="outline" disabled={anyPending} onClick={() => matchMutation.mutate()} data-testid="button-ai-match">
          <Spin pending={matchMutation.isPending} />
          <Target className="h-4 w-4 mr-2" /> JD Match
        </Button>
        <Button size="sm" variant="outline" disabled={anyPending} onClick={() => summaryMutation.mutate()} data-testid="button-ai-summary">
          <Spin pending={summaryMutation.isPending} />
          <ScrollText className="h-4 w-4 mr-2" /> Summary
        </Button>
        <Button size="sm" variant="outline" disabled={anyPending} onClick={() => questionsMutation.mutate()} data-testid="button-ai-questions">
          <Spin pending={questionsMutation.isPending} />
          <MessageSquareText className="h-4 w-4 mr-2" /> Questions
        </Button>
        <Button size="sm" variant="outline" disabled={anyPending} onClick={() => duplicatesMutation.mutate()} data-testid="button-ai-duplicates">
          <Spin pending={duplicatesMutation.isPending} />
          <Copy className="h-4 w-4 mr-2" /> Duplicates
        </Button>
      </div>

      {notice && <NoAiNotice data={notice} />}

      {parsed && (
        <div className="rounded-md border bg-background p-3 space-y-2" data-testid="section-parsed-resume">
          <p className="text-sm font-medium">Parsed Resume</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Name: </span>{parsed.fullName || "—"}</div>
            <div><span className="text-muted-foreground">Experience: </span>{parsed.totalExperienceYears != null ? `${parsed.totalExperienceYears} yr` : "—"}</div>
            <div><span className="text-muted-foreground">Current Co.: </span>{parsed.currentCompany || "—"}</div>
            <div><span className="text-muted-foreground">Role: </span>{parsed.currentDesignation || "—"}</div>
            <div><span className="text-muted-foreground">Location: </span>{parsed.location || "—"}</div>
            <div><span className="text-muted-foreground">Email: </span>{parsed.email || "—"}</div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Skills</p>
            <ChipList items={parsed.skills} testid="chips-skills" />
          </div>
          {parsed.education && parsed.education.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Education</p>
              <ul className="list-disc pl-5 text-sm">{parsed.education.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {score && (
        <div className="rounded-md border bg-background p-3 space-y-2" data-testid="section-ai-score">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Candidate Score</p>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${scoreColor(score.score)}`} data-testid="text-ai-score">{score.score}</span>
              <span className="text-sm text-muted-foreground">/100</span>
              <Badge className={recommendationColors[score.recommendation] || ""}>{score.recommendation.replace("_", " ")}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Strengths</p>
              <ChipList items={score.strengths} testid="chips-strengths" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Gaps</p>
              <ChipList items={score.weaknesses} testid="chips-weaknesses" />
            </div>
          </div>
          {score.missingSkills && score.missingSkills.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Missing Skills</p>
              <ChipList items={score.missingSkills} testid="chips-missing" />
            </div>
          )}
          {score.rationale && <p className="text-sm text-muted-foreground">{score.rationale}</p>}
        </div>
      )}

      {match && (
        <div className="rounded-md border bg-background p-3 space-y-2" data-testid="section-jd-match">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">JD Match</p>
            <span className={`text-xl font-bold ${scoreColor(match.matchPercent)}`} data-testid="text-match-percent">{match.matchPercent}%</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Matching Skills</p>
              <ChipList items={match.matchingSkills} testid="chips-matching" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Missing Skills</p>
              <ChipList items={match.missingSkills} testid="chips-match-missing" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Experience: </span>{match.experienceGap || "—"}</div>
            <div><span className="text-muted-foreground">Qualification: </span>{match.qualificationGap || "—"}</div>
            <div><span className="text-muted-foreground">Location: </span>{match.locationFit || "—"}</div>
            <div><span className="text-muted-foreground">Salary: </span>{match.salaryFit || "—"}</div>
          </div>
          {match.summary && <p className="text-sm text-muted-foreground">{match.summary}</p>}
        </div>
      )}

      {(summary || summaryText) && (
        <div className="rounded-md border bg-background p-3 space-y-2" data-testid="section-ai-summary">
          <p className="text-sm font-medium">Candidate Summary</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{summary?.summary || summaryText}</p>
          {summary?.careerProgression && (
            <p className="text-sm"><span className="text-muted-foreground">Career: </span>{summary.careerProgression}</p>
          )}
          {summary && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Strengths</p>
                <ChipList items={summary.strengths} testid="chips-summary-strengths" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Concerns</p>
                <ChipList items={summary.concerns} testid="chips-summary-concerns" />
              </div>
            </div>
          )}
          {summary?.recommendation && (
            <p className="text-sm"><span className="text-muted-foreground">Recommendation: </span>{summary.recommendation}</p>
          )}
        </div>
      )}

      {questions && (
        <div className="rounded-md border bg-background p-3 space-y-2" data-testid="section-ai-questions">
          <p className="text-sm font-medium">Interview Questions</p>
          {([
            ["Technical", questions.technical],
            ["Behavioural", questions.behavioural],
            ["Situational", questions.situational],
            ["Leadership", questions.leadership],
            ["Problem Solving", questions.problemSolving],
            ["Communication", questions.communication],
          ] as Array<[string, string[] | undefined]>)
            .filter(([, list]) => list && list.length > 0)
            .map(([label, list]) => (
              <div key={label}>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <ul className="list-disc pl-5 text-sm">{list!.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            ))}
        </div>
      )}

      {duplicates && (
        <div className="rounded-md border bg-background p-3 space-y-2" data-testid="section-duplicates">
          <p className="text-sm font-medium">Possible Duplicates</p>
          {duplicates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No duplicate applications found.</p>
          ) : (
            <ul className="space-y-2">
              {duplicates.map((d) => (
                <li key={d.applicationId} className="flex items-start justify-between gap-2 text-sm" data-testid={`row-duplicate-${d.applicationId}`}>
                  <div>
                    <p className="font-medium">{d.candidateName}</p>
                    <p className="text-xs text-muted-foreground">{d.reasons.join(", ")}</p>
                  </div>
                  <Badge className={confidenceColors[d.confidence] || ""}>{d.confidence}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
