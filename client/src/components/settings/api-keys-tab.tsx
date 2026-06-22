import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Settings, Building2, Calendar, CalendarDays, Clock, Bell, Shield, Save, Users, Briefcase, MapPin, DollarSign, Percent, Plus, Pencil, Trash2, FileText, LocateFixed, Loader2, Smartphone, Upload, CheckCircle2, AlertTriangle, KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/hooks/use-can";
import type { Company, Setting, MasterDepartment, MasterDesignation, MasterLocation, EarningHead, DeductionHead, StatutorySettings, TimeOfficePolicy, Holiday, WageGrade, ContractorMaster, LeavePolicy } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";

// ─── API Keys Tab ──────────────────────────────────────────────────────────────

type ApiKeysData = { openai: { set: boolean; hint: string }; gemini: { set: boolean; hint: string } };

function KeyRow({
  label,
  description,
  placeholder,
  isLoading,
  status,
  value,
  onChange,
  show,
  onToggleShow,
  onSave,
  onClear,
  saving,
  testPrefix,
}: {
  label: string;
  description: string;
  placeholder: string;
  isLoading: boolean;
  status: { set: boolean; hint: string } | undefined;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  onSave: () => void;
  onClear: () => void;
  saving: boolean;
  testPrefix: string;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : status?.set ? (
          <Badge className="bg-green-100 text-green-700 border-green-200" data-testid={`badge-${testPrefix}-status`}>
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Active — {status.hint}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground" data-testid={`badge-${testPrefix}-status`}>
            Not set
          </Badge>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={show ? "text" : "password"}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            data-testid={`input-${testPrefix}-key`}
            className="pr-10"
          />
          <button
            type="button"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={onToggleShow}
            data-testid={`button-toggle-${testPrefix}-visibility`}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button
          onClick={onSave}
          disabled={saving || !value.trim()}
          data-testid={`button-save-${testPrefix}-key`}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save
        </Button>
        {status?.set && (
          <Button
            variant="outline"
            onClick={onClear}
            disabled={saving}
            data-testid={`button-clear-${testPrefix}-key`}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

type ProviderTest = { configured: boolean; ok: boolean; error?: string };
type TestResult = { openai: ProviderTest; gemini: ProviderTest; activeProvider: "openai" | "gemini" | "rule-based" };

export function ApiKeysTab() {
  const { toast } = useToast();
  const [openaiKey, setOpenaiKey] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [showGemini, setShowGemini] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const { data, isLoading } = useQuery<ApiKeysData>({
    queryKey: ["/api/settings/api-keys"],
  });

  const testMutation = useMutation({
    mutationFn: () => api.settings.testApiKeys(),
    onSuccess: (res) => {
      setTestResult(res);
      if (res.activeProvider === "rule-based") {
        toast({
          title: "AI is not active",
          description: "No provider responded — the assistant is using generic canned replies. See details below.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "AI is working",
          description: `Active provider: ${res.activeProvider === "openai" ? "OpenAI" : "Gemini"}.`,
        });
      }
    },
    onError: () => {
      toast({ title: "Test failed", description: "Could not reach the server to run the test.", variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { openaiApiKey?: string; geminiApiKey?: string }) =>
      api.settings.saveApiKeys(payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/api-keys"] });
      if (vars.openaiApiKey !== undefined) setOpenaiKey("");
      if (vars.geminiApiKey !== undefined) setGeminiKey("");
      toast({ title: "Saved", description: "API key is now active globally." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save the API key.", variant: "destructive" });
    },
  });

  const save = (payload: { openaiApiKey?: string; geminiApiKey?: string }) => {
    const hasValue = Object.values(payload).some((v) => v !== undefined && (v as string).trim() !== "");
    if (!hasValue) {
      toast({ title: "No key entered", description: "Paste a key before saving.", variant: "destructive" });
      return;
    }
    saveMutation.mutate(payload);
  };

  return (
    <div className="grid gap-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            AI Provider Keys
          </CardTitle>
          <CardDescription>
            Keys are stored globally and shared across all companies. The AI assistant tries providers in order: <strong>OpenAI → Gemini → built-in rule-based</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">

          {/* ── OpenAI ── */}
          <KeyRow
            label="OpenAI API Key"
            description="Primary AI provider — GPT-4o-mini (fast, accurate)"
            placeholder="sk-proj-..."
            isLoading={isLoading}
            status={data?.openai}
            value={openaiKey}
            onChange={setOpenaiKey}
            show={showOpenai}
            onToggleShow={() => setShowOpenai((v) => !v)}
            onSave={() => save({ openaiApiKey: openaiKey.trim() })}
            onClear={() => saveMutation.mutate({ openaiApiKey: "" })}
            saving={saveMutation.isPending}
            testPrefix="openai"
          />
          <p className="text-xs text-muted-foreground -mt-1">
            Get your key at{" "}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline text-primary">
              platform.openai.com/api-keys
            </a>
          </p>

          <Separator />

          {/* ── Gemini ── */}
          <KeyRow
            label="Google Gemini API Key"
            description="Fallback AI provider — Gemini 2.0 Flash (used when OpenAI is unavailable)"
            placeholder="AIzaSy..."
            isLoading={isLoading}
            status={data?.gemini}
            value={geminiKey}
            onChange={setGeminiKey}
            show={showGemini}
            onToggleShow={() => setShowGemini((v) => !v)}
            onSave={() => save({ geminiApiKey: geminiKey.trim() })}
            onClear={() => saveMutation.mutate({ geminiApiKey: "" })}
            saving={saveMutation.isPending}
            testPrefix="gemini"
          />
          <p className="text-xs text-muted-foreground -mt-1">
            Get your key at{" "}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline text-primary">
              aistudio.google.com/app/apikey
            </a>{" "}
            (free tier available)
          </p>

          <Separator />

          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">How the fallback chain works</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>OpenAI key is tried first (env var <code className="text-xs bg-muted px-1 rounded">OPENAI_API_KEY</code> takes priority over DB).</li>
              <li>If OpenAI fails or has no key, Gemini is tried (env var <code className="text-xs bg-muted px-1 rounded">GOOGLE_GEMINI_API_KEY</code> or DB).</li>
              <li>If both are unavailable, the assistant uses a built-in rule-based engine — no AI needed.</li>
            </ol>
            <p className="mt-2">Keys are never shown in full after saving. Clearing a key disables that provider.</p>
          </div>

          <Separator />

          {/* ── Live test ── */}
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Test AI connection</p>
                <p className="text-xs text-muted-foreground">
                  Sends a real request to each saved key and shows the active provider — use this if the
                  assistant keeps giving the same generic answer.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                data-testid="button-test-ai-keys"
              >
                {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Test connection
              </Button>
            </div>

            {testResult && (
              <div className="grid gap-2" data-testid="text-ai-test-result">
                <div
                  className={`rounded-lg p-3 text-sm font-medium ${
                    testResult.activeProvider === "rule-based"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-green-50 text-green-700 border border-green-200"
                  }`}
                >
                  {testResult.activeProvider === "rule-based"
                    ? "⚠️ AI is NOT active — replies are coming from the built-in canned engine, so every answer looks the same."
                    : `✅ AI is active — answers are generated by ${testResult.activeProvider === "openai" ? "OpenAI" : "Gemini"}.`}
                </div>
                {(["openai", "gemini"] as const).map((p) => {
                  const r = testResult[p];
                  return (
                    <div key={p} className="flex items-start gap-2 text-xs">
                      <span className="font-medium w-16 shrink-0">{p === "openai" ? "OpenAI" : "Gemini"}:</span>
                      {!r.configured ? (
                        <span className="text-muted-foreground">No key saved</span>
                      ) : r.ok ? (
                        <span className="text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Working</span>
                      ) : (
                        <span className="text-red-700 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> {r.error || "Failed"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

