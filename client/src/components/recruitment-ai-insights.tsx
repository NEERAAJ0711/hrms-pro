import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BarChart3, Search, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

interface RecruitmentDashboard {
  openPositions: number;
  totalApplications: number;
  pipelineByStage: Record<string, number>;
  interviewsScheduled: number;
  offersExtended: number;
  offersAccepted: number;
  offerAcceptanceRate: number;
  interviewConversionRate: number;
  averageTimeToHireDays: number | null;
  summary: string;
}

interface SearchResult {
  applicationId: string;
  name: string;
  status: string;
  experienceYears: number | null;
  matchedOn: string[];
}

function Stat({ label, value, testid }: { label: string; value: string | number; testid: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold" data-testid={testid}>{value}</p>
    </div>
  );
}

export function RecruitmentAiInsights() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);

  const { data: dashboard, isLoading } = useQuery<RecruitmentDashboard>({
    queryKey: ["/api/recruitment/dashboard"],
  });

  const searchMutation = useMutation({
    mutationFn: async (q: string) => (await apiRequest("POST", "/api/recruitment/search", { query: q })).json(),
    onSuccess: (data: any) => setResults((data.results as SearchResult[]) ?? []),
  });

  const runSearch = () => {
    const q = query.trim();
    if (q) searchMutation.mutate(q);
  };

  return (
    <Card data-testid="card-recruitment-ai-insights">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> AI Recruitment Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <BarChart3 className="h-4 w-4" /> Hiring Dashboard
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
          </div>
        ) : dashboard ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Open Positions" value={dashboard.openPositions} testid="stat-open-positions" />
            <Stat label="Applications" value={dashboard.totalApplications} testid="stat-total-applications" />
            <Stat label="Interview Conv." value={`${dashboard.interviewConversionRate}%`} testid="stat-interview-conversion" />
            <Stat label="Offer Accept." value={`${dashboard.offerAcceptanceRate}%`} testid="stat-offer-acceptance" />
            <Stat label="Offers Extended" value={dashboard.offersExtended} testid="stat-offers-extended" />
            <Stat label="Offers Accepted" value={dashboard.offersAccepted} testid="stat-offers-accepted" />
            <Stat label="Interviews" value={dashboard.interviewsScheduled} testid="stat-interviews" />
            <Stat
              label="Avg Time to Hire"
              value={dashboard.averageTimeToHireDays != null ? `${dashboard.averageTimeToHireDays} d` : "—"}
              testid="stat-time-to-hire"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recruitment data yet.</p>
        )}

        {dashboard && Object.keys(dashboard.pipelineByStage).length > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="pipeline-stages">
            {Object.entries(dashboard.pipelineByStage).map(([stage, n]) => (
              <Badge key={stage} variant="secondary" className="text-xs">{stage}: {n}</Badge>
            ))}
          </div>
        )}

        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Search className="h-4 w-4" /> Candidate Search
          </div>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder='e.g. "React developers with 5 years in Pune"'
              data-testid="input-candidate-search"
            />
            <Button onClick={runSearch} disabled={searchMutation.isPending || !query.trim()} data-testid="button-candidate-search">
              {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {results && (
            results.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-search-empty">No candidates matched your search.</p>
            ) : (
              <ul className="space-y-1" data-testid="list-search-results">
                {results.map((r) => (
                  <li key={r.applicationId} className="flex items-center justify-between gap-2 rounded-md border bg-background p-2 text-sm" data-testid={`row-search-${r.applicationId}`}>
                    <div>
                      <span className="font-medium">{r.name}</span>
                      <span className="text-muted-foreground"> — {r.status}{r.experienceYears != null ? `, ${r.experienceYears} yr` : ""}</span>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {r.matchedOn.slice(0, 3).map((m, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{m}</Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
