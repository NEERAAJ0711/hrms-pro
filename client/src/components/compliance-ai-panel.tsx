import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Bot, X, Send, Loader2, Sparkles, RotateCcw, ChevronDown,
  AlertTriangle, CheckCircle2, Info, ShieldCheck,
} from "lucide-react";

interface Message { role: "user" | "assistant"; content: string; }

interface ErrorAnalysis {
  summary: string;
  likelyCause: string;
  suggestedFix: string;
  canRetry: boolean;
}

interface Props {
  portal?: "epfo" | "esic" | "both";
  /** Pre-fill error analysis when opened from a failed job row */
  initialJobError?: { jobType: string; errorMessage: string; jobId?: string };
}

const QUICK_ACTIONS: Record<string, string[]> = {
  epfo: [
    "When is ECR filing due?",
    "What are PF contribution rates?",
    "How to generate UAN?",
    "What is TRRN?",
    "How to fix invalid credentials?",
  ],
  esic: [
    "When is ESIC monthly return due?",
    "What are ESIC contribution rates?",
    "How to generate IP number?",
    "ESIC applicability limit?",
    "How to fix failed ESIC job?",
  ],
  both: [
    "PF contribution rates?",
    "ESIC due dates?",
    "How to fix a failed job?",
    "UAN vs IP Number?",
    "ECR filing process?",
  ],
};

const PORTAL_LABEL: Record<string, string> = {
  epfo: "PF / EPFO",
  esic: "ESIC",
  both: "PF & ESIC",
};

export function ComplianceAiPanel({ portal = "both", initialJobError }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [errorAnalysis, setErrorAnalysis] = useState<ErrorAnalysis | null>(null);
  const [analyzingError, setAnalyzingError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-open + analyze if an error is injected
  useEffect(() => {
    if (initialJobError) {
      setOpen(true);
      runErrorAnalysis(initialJobError.jobType, initialJobError.errorMessage);
    }
  }, [initialJobError?.jobId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, errorAnalysis]);

  const chatMutation = useMutation({
    mutationFn: async (payload: { message: string; history: Message[]; portal: string }) => {
      const res = await apiRequest("POST", "/api/ai-hr/compliance-chat", payload);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ reply: string }>;
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (payload: { jobType: string; errorMessage: string }) => {
      const res = await apiRequest("POST", "/api/ai-hr/analyze-job-error", payload);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<ErrorAnalysis>;
    },
    onSuccess: (data) => {
      setErrorAnalysis(data);
      setAnalyzingError(false);
    },
    onError: () => setAnalyzingError(false),
  });

  function runErrorAnalysis(jobType: string, errorMessage: string) {
    setAnalyzingError(true);
    setErrorAnalysis(null);
    analyzeMutation.mutate({ jobType, errorMessage });
  }

  function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg) return;
    const updated: Message[] = [...messages, { role: "user", content: msg }];
    setMessages(updated);
    setInput("");
    chatMutation.mutate({ message: msg, history: updated.slice(-10), portal });
  }

  function clearChat() {
    setMessages([]);
    setErrorAnalysis(null);
    setInput("");
  }

  const isLoading = chatMutation.isPending;

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all text-sm font-medium"
          data-testid="button-open-compliance-ai"
        >
          <Sparkles className="h-4 w-4" />
          AI Co-pilot
          <Badge className="ml-1 text-[10px] px-1.5 py-0 bg-white/20 text-primary-foreground border-0">
            {PORTAL_LABEL[portal]}
          </Badge>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-0 right-0 z-50 w-full sm:w-[420px] h-[600px] flex flex-col bg-background border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl sm:bottom-6 sm:right-6">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5 rounded-t-2xl">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Compliance Co-pilot</p>
                <p className="text-xs text-muted-foreground">{PORTAL_LABEL[portal]} · AI-powered</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Clear chat"
                  data-testid="button-clear-compliance-chat"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                data-testid="button-close-compliance-ai"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                data-testid="button-dismiss-compliance-ai"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

            {/* Error analysis card */}
            {(analyzingError || errorAnalysis) && (
              <div className="rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  Job Error Analysis
                </div>
                {analyzingError ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Analyzing error with AI…
                  </div>
                ) : errorAnalysis ? (
                  <div className="space-y-2 text-xs">
                    <p className="text-foreground">{errorAnalysis.summary}</p>
                    <div>
                      <span className="font-medium text-amber-700 dark:text-amber-300">Likely cause: </span>
                      <span className="text-foreground">{errorAnalysis.likelyCause}</span>
                    </div>
                    <div>
                      <span className="font-medium text-amber-700 dark:text-amber-300">Fix: </span>
                      <span className="text-foreground">{errorAnalysis.suggestedFix}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {errorAnalysis.canRetry ? (
                        <><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /><span className="text-green-700 dark:text-green-400 font-medium">Safe to retry</span></>
                      ) : (
                        <><Info className="h-3.5 w-3.5 text-orange-500" /><span className="text-orange-700 dark:text-orange-400 font-medium">Fix required before retrying</span></>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Welcome / quick actions (shown when no messages) */}
            {messages.length === 0 && !analyzingError && !errorAnalysis && (
              <div className="space-y-3">
                <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {PORTAL_LABEL[portal]} Compliance Assistant
                  </p>
                  Ask me about contribution rates, due dates, portal errors, filing steps, or anything else related to {PORTAL_LABEL[portal]} compliance.
                </div>
                <p className="text-xs text-muted-foreground font-medium px-1">Quick questions:</p>
                <div className="flex flex-wrap gap-2">
                  {(QUICK_ACTIONS[portal] ?? QUICK_ACTIONS.both).map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      disabled={isLoading}
                      className="text-xs px-3 py-1.5 rounded-full border bg-background hover:bg-muted transition-colors text-foreground"
                      data-testid={`chip-compliance-${q.slice(0, 20).replace(/\s/g, "-").toLowerCase()}`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat messages */}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.content.split("\n").map((line, j) => (
                    <span key={j}>
                      {line.split(/(\*\*[^*]+\*\*)/).map((part, k) =>
                        part.startsWith("**") && part.endsWith("**")
                          ? <strong key={k}>{part.slice(2, -2)}</strong>
                          : part
                      )}
                      {j < m.content.split("\n").length - 1 && <br />}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Separator + Input */}
          <div className="border-t px-3 py-2.5 bg-background rounded-b-2xl">
            <div className="flex gap-2 items-end">
              <Textarea
                placeholder={`Ask about ${PORTAL_LABEL[portal]} compliance…`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                rows={1}
                className="flex-1 min-h-[36px] max-h-[100px] resize-none text-sm"
                disabled={isLoading}
                data-testid="input-compliance-message"
              />
              <Button
                size="sm"
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="h-9 px-3"
                data-testid="button-send-compliance-message"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              AI may make mistakes — verify critical compliance details with official EPFO/ESIC portals
            </p>
          </div>
        </div>
      )}
    </>
  );
}
