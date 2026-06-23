import { useQuery } from "@tanstack/react-query";
import { Sparkles, RefreshCw, AlertTriangle, AlertCircle, Info, Lightbulb, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// Phase 4 — shared, read-only AI insights panel. Renders deterministic FACTS
// (anomalies + key figures) plus an LLM narrative envelope that degrades
// gracefully when no AI key / no data is available. The component is purely
// presentational over the API response; it never computes figures itself.

export interface AiNarrative {
  explanation: string;
  insights: string[];
  recommendations: string[];
}

type AiEnvelope =
  | { available: true; data: AiNarrative }
  | { available: false; reason?: string; message?: string };

interface Anomaly {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  value?: number | string | null;
}

interface AiResponse {
  facts: Record<string, any> & { anomalies?: Anomaly[] };
  ai: AiEnvelope;
}

const severityStyle: Record<Anomaly["severity"], string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
};

function SeverityIcon({ severity }: { severity: Anomaly["severity"] }) {
  if (severity === "critical") return <AlertCircle className="h-4 w-4 shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="h-4 w-4 shrink-0" />;
  return <Info className="h-4 w-4 shrink-0" />;
}

// Humanize a camelCase / snake_case key into a short label.
function label(key: string): string {
  return key
    .replace(/Pct$/, " %")
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Pull a small set of primitive headline figures out of the facts object so the
// panel is useful even with no AI key. Skips arrays/objects and noisy ids.
function keyFigures(facts: Record<string, any>): { key: string; value: string }[] {
  const skip = new Set(["anomalies", "employeeId", "companyId", "id", "month", "year"]);
  const out: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(facts || {})) {
    if (skip.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
      out.push({ key: k, value: String(v) });
    }
  }
  return out.slice(0, 8);
}

interface Props {
  endpoint: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  testIdPrefix?: string;
}

export function AiInsightsPanel({
  endpoint,
  title = "AI Insights",
  description = "Plain-language analysis over your live data.",
  actionLabel = "AI insights",
  testIdPrefix = "ai-insights",
}: Props) {
  const { data, isLoading, isFetching, isError, refetch } = useQuery<AiResponse>({
    queryKey: [endpoint],
    staleTime: 5 * 60 * 1000,
  });

  const facts = data?.facts;
  const ai = data?.ai;
  const anomalies = facts?.anomalies ?? [];
  const figures = facts ? keyFigures(facts) : [];

  return (
    <Card data-testid={`card-${testIdPrefix}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid={`button-${testIdPrefix}-refresh`}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          <span className="ml-2 hidden sm:inline">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3" data-testid={`loading-${testIdPrefix}`}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground" data-testid={`error-${testIdPrefix}`}>
            Couldn't load insights right now. Try refreshing.
          </p>
        ) : (
          <>
            {/* Key figures (always available — deterministic) */}
            {figures.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid={`figures-${testIdPrefix}`}>
                {figures.map((f) => (
                  <div key={f.key} className="rounded-md border bg-muted/40 p-2">
                    <div className="text-xs text-muted-foreground">{label(f.key)}</div>
                    <div className="text-sm font-semibold" data-testid={`figure-${testIdPrefix}-${f.key}`}>
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Anomalies (deterministic, no AI needed) */}
            {anomalies.length > 0 && (
              <div className="space-y-2" data-testid={`anomalies-${testIdPrefix}`}>
                {anomalies.map((a, i) => (
                  <div
                    key={`${a.code}-${i}`}
                    className={`flex items-start gap-2 rounded-md p-2 text-sm ${severityStyle[a.severity]}`}
                    data-testid={`anomaly-${testIdPrefix}-${a.code}`}
                  >
                    <SeverityIcon severity={a.severity} />
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* AI narrative envelope */}
            {ai?.available ? (
              <div className="space-y-3" data-testid={`narrative-${testIdPrefix}`}>
                {ai.data.explanation && (
                  <p className="text-sm leading-relaxed" data-testid={`text-${testIdPrefix}-explanation`}>
                    {ai.data.explanation}
                  </p>
                )}
                {ai.data.insights?.length > 0 && (
                  <div className="space-y-1.5">
                    {ai.data.insights.map((ins, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                        <span>{ins}</span>
                      </div>
                    ))}
                  </div>
                )}
                {ai.data.recommendations?.length > 0 && (
                  <div className="space-y-1.5 border-t pt-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Recommendations</div>
                    {ai.data.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
                data-testid={`unavailable-${testIdPrefix}`}
              >
                {ai?.message ||
                  `AI narrative is unavailable. The figures above are still accurate. Add an API key in Settings → API Keys to enable ${actionLabel}.`}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
