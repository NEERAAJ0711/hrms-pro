import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Brain,
  TrendingUp,
  ArrowUpCircle,
  Banknote,
  UserMinus,
  Network,
  GraduationCap,
  Shuffle,
  HeartPulse,
  FileBarChart,
  MessageSquare,
  Send,
  Loader2,
  Lightbulb,
  KeyRound,
} from "lucide-react";
import { WorkforceDecisionPanel } from "@/components/workforce-decision-panel";
import { apiRequest } from "@/lib/queryClient";

interface CopilotDecision {
  subject: string;
  recommendation: string;
  score?: number | null;
  category?: string | null;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

interface CopilotResponse {
  topic: string;
  facts?: {
    decisions: CopilotDecision[];
    coverage?: { employees: number; analyzed: number; note?: string };
  };
  ai:
    | { available: true; data: { explanation: string; insights: string[]; recommendations: string[] } }
    | { available: false; reason?: string; message?: string };
}

function StrategicCopilot() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<CopilotResponse | null>(null);

  const ask = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest("POST", "/api/ai/workforce/copilot", { question: q });
      return (await res.json()) as CopilotResponse;
    },
    onSuccess: (data) => setAnswer(data),
  });

  const submit = () => {
    const q = question.trim();
    if (q) ask.mutate(q);
  };

  const examples = [
    "What should I do about attrition this quarter?",
    "How healthy is the organization right now?",
    "Where are our biggest talent risks?",
    "Who should we prioritize for promotion?",
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Strategic HR Copilot
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Ask a strategic workforce question. Answers are grounded in your live HR
          data — the copilot never invents numbers or takes any action.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <Badge
              key={ex}
              variant="outline"
              className="cursor-pointer hover:bg-muted text-xs font-normal"
              onClick={() => setQuestion(ex)}
              data-testid={`example-${ex.slice(0, 12)}`}
            >
              {ex}
            </Badge>
          ))}
        </div>

        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What should I do about attrition this quarter?"
          rows={3}
          data-testid="input-copilot-question"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="flex justify-end">
          <Button
            onClick={submit}
            disabled={ask.isPending || !question.trim()}
            data-testid="button-ask-copilot"
          >
            {ask.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Ask
          </Button>
        </div>

        {ask.isError && (
          <p className="text-sm text-destructive" data-testid="text-copilot-error">
            {(ask.error as Error).message || "Failed to answer. Please try again."}
          </p>
        )}

        {answer && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2" data-testid="copilot-answer">
            <Badge variant="outline" className="text-xs">
              Topic: {answer.topic.replace(/_/g, " ")}
            </Badge>
            {answer.ai.available ? (
              <>
                <p className="text-sm" data-testid="text-copilot-explanation">
                  {answer.ai.data.explanation}
                </p>
                {answer.ai.data.insights.length > 0 && (
                  <ul className="space-y-1">
                    {answer.ai.data.insights.map((ins, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <TrendingUp className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
                        {ins}
                      </li>
                    ))}
                  </ul>
                )}
                {answer.ai.data.recommendations.length > 0 && (
                  <ul className="space-y-1">
                    {answer.ai.data.recommendations.map((rec, i) => (
                      <li key={i} className="text-xs flex items-start gap-1.5">
                        <Lightbulb className="h-3 w-3 mt-0.5 shrink-0 text-yellow-500" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <KeyRound className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {("message" in answer.ai && answer.ai.message) ||
                    ("reason" in answer.ai && answer.ai.reason) ||
                    "AI narration unavailable — the underlying figures are still computed and shown below."}
                </span>
              </div>
            )}

            {answer.facts && answer.facts.decisions.length > 0 && (
              <div className="pt-1 space-y-1.5 border-t" data-testid="copilot-facts">
                <p className="text-xs font-medium text-muted-foreground pt-2">
                  Based on {answer.facts.coverage?.analyzed ?? answer.facts.decisions.length} analyzed
                  {answer.facts.coverage ? ` of ${answer.facts.coverage.employees}` : ""} — deterministic findings:
                </p>
                {answer.facts.decisions.slice(0, 8).map((d, i) => (
                  <div key={i} className="text-xs" data-testid={`copilot-decision-${i}`}>
                    <span className="font-medium">{d.subject}</span> — {d.recommendation}
                    {(d.score != null || d.category) && (
                      <span className="text-muted-foreground">
                        {" "}({[d.score != null ? `${d.score}/100` : null, d.category].filter(Boolean).join(", ")},{" "}
                        {d.confidence} confidence)
                      </span>
                    )}
                    {d.reasons[0] && (
                      <span className="block text-muted-foreground pl-2">{d.reasons[0]}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {answer.facts && answer.facts.decisions.length === 0 && (
              <p className="text-xs text-muted-foreground pt-1 border-t" data-testid="copilot-no-decisions">
                No specific findings for this topic in the current period.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TABS = [
  { value: "performance", label: "Performance", icon: TrendingUp },
  { value: "promotion", label: "Promotion", icon: ArrowUpCircle },
  { value: "increment", label: "Increment", icon: Banknote },
  { value: "attrition", label: "Attrition", icon: UserMinus },
  { value: "succession", label: "Succession", icon: Network },
  { value: "learning", label: "Learning", icon: GraduationCap },
  { value: "mobility", label: "Mobility", icon: Shuffle },
  { value: "org-health", label: "Org Health", icon: HeartPulse },
  { value: "executive", label: "Executive", icon: FileBarChart },
  { value: "copilot", label: "Copilot", icon: MessageSquare },
];

export default function WorkforceIntelligencePage() {
  const [tab, setTab] = useState("performance");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          Workforce Intelligence
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Explainable, data-grounded decision support across performance, pay,
          retention, succession and organizational health.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} data-testid={`tab-${t.value}`}>
              <t.icon className="h-4 w-4 mr-1.5" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="performance" className="mt-4">
          <WorkforceDecisionPanel
            title="Performance Intelligence"
            description="Top performers, strong contributors and those who may need support, with the figures behind each call."
            endpoint="/api/ai/workforce/performance"
            icon={TrendingUp}
          />
        </TabsContent>
        <TabsContent value="promotion" className="mt-4">
          <WorkforceDecisionPanel
            title="Promotion Readiness"
            description="Who is ready for the next level, why, and what is still missing."
            endpoint="/api/ai/workforce/promotion"
            icon={ArrowUpCircle}
          />
        </TabsContent>
        <TabsContent value="increment" className="mt-4">
          <WorkforceDecisionPanel
            title="Increment Intelligence"
            description="Suggested increment ranges with justification, internal parity and confidence."
            endpoint="/api/ai/workforce/increment"
            icon={Banknote}
          />
        </TabsContent>
        <TabsContent value="attrition" className="mt-4">
          <WorkforceDecisionPanel
            title="Attrition Risk"
            description="Flight-risk signals with the drivers behind each level and suggested interventions."
            endpoint="/api/ai/workforce/attrition"
            icon={UserMinus}
          />
        </TabsContent>
        <TabsContent value="succession" className="mt-4">
          <WorkforceDecisionPanel
            title="Succession Planning"
            description="High-potential successors for critical roles and the reasoning behind each match."
            endpoint="/api/ai/workforce/succession"
            icon={Network}
          />
        </TabsContent>
        <TabsContent value="learning" className="mt-4">
          <WorkforceDecisionPanel
            title="Learning & Development"
            description="Skill, course and certification recommendations derived from gaps and role."
            endpoint="/api/ai/workforce/learning"
            icon={GraduationCap}
          />
        </TabsContent>
        <TabsContent value="mobility" className="mt-4">
          <WorkforceDecisionPanel
            title="Internal Mobility"
            description="Best internal fits for open roles, with skill gaps and readiness."
            endpoint="/api/ai/workforce/mobility"
            icon={Shuffle}
          />
        </TabsContent>
        <TabsContent value="org-health" className="mt-4">
          <WorkforceDecisionPanel
            title="Organizational Health"
            description="Department health scores from attendance, performance and retention, weakest first."
            endpoint="/api/ai/workforce/org-health"
            icon={HeartPulse}
          />
        </TabsContent>
        <TabsContent value="executive" className="mt-4">
          <WorkforceDecisionPanel
            title="Executive Decision Support"
            description="A leadership-level workforce read composed from every engine."
            endpoint="/api/ai/workforce/executive"
            icon={FileBarChart}
          />
        </TabsContent>
        <TabsContent value="copilot" className="mt-4">
          <StrategicCopilot />
        </TabsContent>
      </Tabs>
    </div>
  );
}
