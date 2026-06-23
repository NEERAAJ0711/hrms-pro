import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sparkles,
  Loader2,
  Info,
  AlertTriangle,
  Lightbulb,
  ShieldAlert,
  TrendingUp,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Confidence = "low" | "medium" | "high";

interface Decision {
  subject: string;
  subjectId?: string | null;
  recommendation: string;
  score?: number | null;
  category?: string | null;
  confidence: Confidence;
  reasons: string[];
  supportingData: Record<string, number | string | null>;
  businessImpact?: string | null;
  risks: string[];
  alternatives: string[];
}

interface Anomaly {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  value?: number;
}

interface DecisionFacts {
  engine: string;
  period: { month: number; year: number; label: string };
  scope: "company" | "team" | "employee";
  decisions: Decision[];
  anomalies: Anomaly[];
  coverage: { employees: number; analyzed: number; note?: string };
}

interface AiNarrative {
  explanation: string;
  insights: string[];
  recommendations: string[];
}

type AiResult =
  | { available: true; data: AiNarrative }
  | { available: false; reason?: string; message?: string };

interface DecisionResponse {
  facts: DecisionFacts;
  ai: AiResult;
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "bg-green-100 text-green-700 border-green-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-muted text-muted-foreground",
};

const CATEGORY_STYLE: Record<string, string> = {
  top: "bg-green-100 text-green-700 border-green-200",
  strong: "bg-emerald-100 text-emerald-700 border-emerald-200",
  solid: "bg-blue-100 text-blue-700 border-blue-200",
  needs_improvement: "bg-orange-100 text-orange-700 border-orange-200",
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-green-100 text-green-700 border-green-200",
};

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/Pct\b/, "%")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatValue(v: number | string | null): string {
  if (v == null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return v;
}

function AnomalyRow({ a }: { a: Anomaly }) {
  const tone =
    a.severity === "critical"
      ? "text-red-600"
      : a.severity === "warning"
        ? "text-orange-500"
        : "text-muted-foreground";
  const Icon = a.severity === "info" ? Info : AlertTriangle;
  return (
    <div className="flex items-start gap-2 text-sm" data-testid={`anomaly-${a.code}`}>
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", tone)} />
      <span>{a.message}</span>
    </div>
  );
}

export function WorkforceDecisionPanel({
  title,
  description,
  endpoint,
  icon: Icon = Sparkles,
  emptyLabel = "No recommendations for this period.",
}: {
  title: string;
  description?: string;
  endpoint: string;
  icon?: any;
  emptyLabel?: string;
}) {
  const { data, isLoading, error } = useQuery<DecisionResponse>({
    queryKey: [endpoint],
  });

  return (
    <Card data-testid={`panel-${data?.facts?.engine ?? "workforce"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {data?.facts?.period?.label && (
            <Badge variant="outline" className="text-xs shrink-0">
              {data.facts.period.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <ShieldAlert className="h-4 w-4" />
            {(error as Error).message || "Unable to load this analysis."}
          </div>
        ) : !data ? null : (
          <>
            {/* AI narrative — degrades gracefully when no key */}
            {data.ai.available ? (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <p className="text-sm" data-testid="text-ai-explanation">
                  {data.ai.data.explanation}
                </p>
                {data.ai.data.insights.length > 0 && (
                  <ul className="space-y-1">
                    {data.ai.data.insights.map((ins, i) => (
                      <li
                        key={i}
                        className="text-xs text-muted-foreground flex items-start gap-1.5"
                      >
                        <TrendingUp className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                        {ins}
                      </li>
                    ))}
                  </ul>
                )}
                {data.ai.data.recommendations.length > 0 && (
                  <ul className="space-y-1">
                    {data.ai.data.recommendations.map((rec, i) => (
                      <li
                        key={i}
                        className="text-xs flex items-start gap-1.5"
                      >
                        <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-yellow-500" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 flex items-start gap-2 text-xs text-muted-foreground">
                <KeyRound className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {("message" in data.ai && data.ai.message) ||
                    ("reason" in data.ai && data.ai.reason) ||
                    "AI narration unavailable — showing the underlying figures only."}
                </span>
              </div>
            )}

            {/* Anomalies */}
            {data.facts.anomalies.length > 0 && (
              <div className="space-y-1.5">
                {data.facts.anomalies.map((a, i) => (
                  <AnomalyRow key={i} a={a} />
                ))}
              </div>
            )}

            {/* Deterministic decisions */}
            {data.facts.decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">{emptyLabel}</p>
            ) : (
              <Accordion type="multiple" className="w-full">
                {data.facts.decisions.map((d, idx) => (
                  <AccordionItem
                    key={d.subjectId ?? `${d.subject}-${idx}`}
                    value={d.subjectId ?? `${d.subject}-${idx}`}
                    data-testid={`decision-${idx}`}
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center justify-between gap-2 w-full pr-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-sm truncate">{d.subject}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs shrink-0",
                              (d.category && CATEGORY_STYLE[d.category]) ||
                                "bg-muted text-muted-foreground",
                            )}
                          >
                            {d.recommendation}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {d.score != null && (
                            <span className="text-sm font-semibold tabular-nums">
                              {d.score}
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={cn("text-xs", CONFIDENCE_STYLE[d.confidence])}
                          >
                            {d.confidence}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      {d.reasons.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            Why
                          </p>
                          <ul className="space-y-0.5">
                            {d.reasons.map((r, i) => (
                              <li key={i} className="text-sm flex items-start gap-1.5">
                                <span className="text-muted-foreground">•</span>
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {Object.keys(d.supportingData).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            Supporting data
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                            {Object.entries(d.supportingData).map(([k, v]) => (
                              <div
                                key={k}
                                className="text-xs rounded bg-muted/50 px-2 py-1"
                              >
                                <span className="text-muted-foreground">
                                  {formatLabel(k)}:
                                </span>{" "}
                                <span className="font-medium">{formatValue(v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {d.businessImpact && (
                        <div className="text-sm">
                          <span className="text-xs font-semibold text-muted-foreground">
                            Business impact:{" "}
                          </span>
                          {d.businessImpact}
                        </div>
                      )}

                      {d.risks.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 text-orange-500" />
                            Risks
                          </p>
                          <ul className="space-y-0.5">
                            {d.risks.map((r, i) => (
                              <li
                                key={i}
                                className="text-sm text-muted-foreground flex items-start gap-1.5"
                              >
                                <span>•</span>
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {d.alternatives.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                            <Lightbulb className="h-3 w-3 text-yellow-500" />
                            Suggested next steps
                          </p>
                          <ul className="space-y-0.5">
                            {d.alternatives.map((a, i) => (
                              <li key={i} className="text-sm flex items-start gap-1.5">
                                <span className="text-muted-foreground">•</span>
                                {a}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}

            <Separator />
            <p className="text-xs text-muted-foreground" data-testid="text-coverage">
              Analyzed {data.facts.coverage.analyzed} of {data.facts.coverage.employees}{" "}
              employee(s).
              {data.facts.coverage.note ? ` ${data.facts.coverage.note}` : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
