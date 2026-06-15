import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot,
  Send,
  Paperclip,
  CheckCircle2,
  Circle,
  Languages,
  Upload,
  FileText,
  Camera,
  CreditCard,
  Building2,
  User,
  X,
  Loader2,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface KycStatus {
  aadhaarSubmitted: boolean;
  panSubmitted: boolean;
  bankDetailsSubmitted: boolean;
  cancelledChequeSubmitted: boolean;
  addressProofSubmitted: boolean;
  photographSubmitted: boolean;
  aadhaarVerified: boolean;
  panVerified: boolean;
  bankVerified: boolean;
  overallStatus: string;
}

interface Attachment {
  fileName: string;
  filePath: string;
  docType: string;
  uploadedAt: string;
}

interface AiMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[] | null;
  createdAt: string;
}

const DOC_TYPES = [
  { value: "aadhaar", label: "Aadhaar Card", icon: CreditCard, color: "bg-orange-100 text-orange-700" },
  { value: "pan", label: "PAN Card", icon: CreditCard, color: "bg-blue-100 text-blue-700" },
  { value: "bank_details", label: "Bank Details / Cheque", icon: Building2, color: "bg-green-100 text-green-700" },
  { value: "address_proof", label: "Address Proof", icon: FileText, color: "bg-purple-100 text-purple-700" },
  { value: "photograph", label: "Photograph", icon: Camera, color: "bg-pink-100 text-pink-700" },
];

const KYC_CHECKLIST = [
  { key: "aadhaarSubmitted", verifiedKey: "aadhaarVerified", label: "Aadhaar Card", icon: CreditCard },
  { key: "panSubmitted", verifiedKey: "panVerified", label: "PAN Card", icon: CreditCard },
  { key: "bankDetailsSubmitted", verifiedKey: "bankVerified", label: "Bank Details", icon: Building2 },
  { key: "cancelledChequeSubmitted", verifiedKey: null, label: "Cancelled Cheque", icon: FileText },
  { key: "addressProofSubmitted", verifiedKey: null, label: "Address Proof", icon: FileText },
  { key: "photographSubmitted", verifiedKey: null, label: "Photograph", icon: Camera },
];

function parseMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

function MessageBubble({ msg }: { msg: AiMessage }) {
  const isBot = msg.role === "assistant";
  return (
    <div className={cn("flex gap-2 mb-3", isBot ? "flex-row" : "flex-row-reverse")}>
      {isBot && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center mt-1">
          <Bot className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
          isBot
            ? "bg-muted text-foreground rounded-tl-sm"
            : "bg-primary text-primary-foreground rounded-tr-sm",
        )}
      >
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mb-2">
            {msg.attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-2 text-xs opacity-80 mb-1">
                <FileText className="h-3 w-3" />
                <span>{att.fileName}</span>
              </div>
            ))}
          </div>
        )}
        <div
          className="leading-relaxed"
          dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }}
        />
        <div className={cn("text-xs mt-1 opacity-50", isBot ? "text-left" : "text-right")}>
          {new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function KycChecklist({ kyc }: { kyc: KycStatus }) {
  const submitted = KYC_CHECKLIST.filter((item) => (kyc as any)[item.key]).length;
  const total = KYC_CHECKLIST.length;
  const percent = Math.round((submitted / total) * 100);

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-muted-foreground">KYC Progress</span>
          <span className="text-xs font-bold">{submitted}/{total}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all",
              percent === 100 ? "bg-green-500" : percent > 50 ? "bg-yellow-500" : "bg-red-500",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        {KYC_CHECKLIST.map((item) => {
          const submitted = (kyc as any)[item.key];
          const verified = item.verifiedKey ? (kyc as any)[item.verifiedKey] : null;
          return (
            <div key={item.key} className="flex items-center gap-2 text-xs">
              {submitted ? (
                <CheckCircle2 className={cn("h-4 w-4 flex-shrink-0", verified ? "text-green-600" : "text-yellow-500")} />
              ) : (
                <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground/40" />
              )}
              <span className={cn(submitted ? "text-foreground" : "text-muted-foreground")}>
                {item.label}
              </span>
              {submitted && verified && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-600 border-green-300 ml-auto">
                  Verified
                </Badge>
              )}
              {submitted && !verified && item.verifiedKey && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 text-yellow-600 border-yellow-300 ml-auto">
                  Pending
                </Badge>
              )}
            </div>
          );
        })}
      </div>

      {kyc.overallStatus === "complete" && (
        <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-green-50 border border-green-200 text-green-700">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-xs font-medium">KYC Complete!</span>
        </div>
      )}
    </div>
  );
}

// ── Self-Link Form ────────────────────────────────────────────────────────────
// Shown to employees whose user account isn't linked to an employee record.
// They enter their Employee Code to link the account themselves.
function SelfLinkForm({ onLinked }: { onLinked: () => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [linked, setLinked] = useState(false);

  const handleLink = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      toast({ title: "Please enter your employee code", variant: "destructive" });
      return;
    }
    setIsLinking(true);
    try {
      const res = await fetch("/api/ai-hr/self-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ employeeCode: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.message || "Failed to link account", variant: "destructive" });
        return;
      }
      setLinked(true);
      toast({ title: `Account linked to ${data.employeeName}! Loading AI Assistant…` });
      setTimeout(() => onLinked(), 1200);
    } catch {
      toast({ title: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-amber-100 p-4 dark:bg-amber-900/30">
            <User className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-lg">Link Your Employee Record</p>
            <p className="text-muted-foreground text-sm mt-1">
              Your login isn't connected to an employee record yet. Enter your
              employee code to link it now.
            </p>
          </div>
        </div>

        {linked ? (
          <div className="flex items-center justify-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Account linked! Loading…</span>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              data-testid="input-employee-code"
              placeholder="e.g. EMP001"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleLink()}
              disabled={isLinking}
              className="text-center tracking-widest font-mono uppercase"
            />
            <Button
              data-testid="button-link-account"
              className="w-full"
              onClick={handleLink}
              disabled={isLinking}
            >
              {isLinking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Linking…
                </>
              ) : (
                "Link My Account"
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Don't know your code? Contact your HR team.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin / Compliance Chat Mode ─────────────────────────────────────────────
// Shown to admin/HR users who don't have a linked employee record.
// Uses the stateless /api/ai-hr/compliance-chat endpoint.
function AdminComplianceChat({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isPending]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isPending) return;
    setInputText("");
    const newHistory = [...history, { role: "user" as const, content: text }];
    setHistory(newHistory);
    setIsPending(true);
    try {
      const res = await fetch("/api/ai-hr/compliance-chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setHistory([...newHistory, { role: "assistant", content: data.reply }]);
    } catch {
      toast({ title: "Failed to get response", variant: "destructive" });
      setHistory(history); // roll back
    } finally {
      setIsPending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const suggestions = [
    "What are the PF deduction rules for 2026?",
    "Explain ESIC eligibility criteria",
    "How to calculate gratuity for an employee?",
    "What are the leave encashment rules?",
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3 bg-background flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
          <Bot className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-semibold text-sm">Priya — AI HR Assistant</p>
          <p className="text-xs text-muted-foreground">Compliance & HR Policy Q&amp;A</p>
        </div>
        {isSuperAdmin && (
          <div className="ml-auto">
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
              Super Admin Mode
            </Badge>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Hello! 👋</p>
              <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                I can answer HR compliance questions — PF, ESIC, Gratuity, Labour law, and more.
                {isSuperAdmin && (
                  <span className="block mt-1 text-xs text-amber-700">
                    To use the employee KYC assistant, log in as a company user with a linked employee profile.
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center max-w-lg">
              {suggestions.map((s) => (
                <Button key={s} variant="outline" size="sm" className="text-xs" onClick={() => setInputText(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {history.map((msg, i) => (
              <div key={i} className={cn("flex gap-2 mb-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center mt-1">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                    msg.role === "assistant"
                      ? "bg-muted text-foreground rounded-tl-sm"
                      : "bg-primary text-primary-foreground rounded-tr-sm",
                  )}
                >
                  <div className="leading-relaxed" dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }} />
                </div>
              </div>
            ))}
            {isPending && (
              <div className="flex gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3 bg-background">
        <div className="flex gap-2 items-end">
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask an HR compliance question... (Enter to send)"
            className="flex-1 min-h-[38px] max-h-[120px] resize-none text-sm"
            rows={1}
            data-testid="input-admin-chat-message"
          />
          <Button
            size="icon"
            className="flex-shrink-0 h-9 w-9"
            onClick={handleSend}
            disabled={!inputText.trim() || isPending}
            data-testid="button-admin-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
          AI-powered compliance assistant · Responses are informational only
        </p>
      </div>
    </div>
  );
}

export default function AiAssistantPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputText, setInputText] = useState("");
  const [uploadDialog, setUploadDialog] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Load conversation + KYC — also handles isAdminMode for admin/HR users
  const { data: convData, isLoading: convLoading, isError: convError, error: convRawError } = useQuery<{
    conversation?: { id: string; language: string };
    kyc?: KycStatus;
    employee?: { id: string; name: string };
    isAdminMode?: boolean;
    isSuperAdmin?: boolean;
  }>({
    queryKey: ["/api/ai-hr/my-conversation"],
  });

  const convId = convData?.conversation?.id;
  const kyc = convData?.kyc;
  const language = convData?.conversation?.language ?? "english";

  // Load messages
  const { data: messages = [], isLoading: msgsLoading } = useQuery<AiMessage[]>({
    queryKey: ["/api/ai-hr/conversations", convId, "messages"],
    queryFn: async () => {
      if (!convId) return [];
      const res = await fetch(`/api/ai-hr/conversations/${convId}/messages`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!convId,
    refetchInterval: 0,
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/ai-hr/conversations/${convId}/messages`, {
        content,
        language,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/conversations", convId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/my-conversation"] });
    },
    onError: () => toast({ title: "Failed to send", variant: "destructive" }),
  });

  // Language switch mutation
  const langMutation = useMutation({
    mutationFn: async (lang: string) => {
      const res = await apiRequest("PATCH", `/api/ai-hr/conversations/${convId}/language`, { language: lang });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/ai-hr/my-conversation"] }),
  });

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || !convId || sendMutation.isPending) return;
    setInputText("");
    sendMutation.mutate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedDocType || !convId) return;
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("docType", selectedDocType);

      const res = await fetch(`/api/ai-hr/conversations/${convId}/upload`, {
        method: "POST",
        credentials: "include",
        body: form,
      });

      if (!res.ok) throw new Error("Upload failed");

      qc.invalidateQueries({ queryKey: ["/api/ai-hr/conversations", convId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/ai-hr/my-conversation"] });

      setUploadDialog(false);
      setSelectedFile(null);
      setSelectedDocType("");
      toast({ title: "Document uploaded successfully" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  if (convLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Admin/HR users without a linked employee record → compliance chat mode
  if (convData?.isAdminMode) {
    return <AdminComplianceChat isSuperAdmin={convData.isSuperAdmin ?? false} />;
  }

  // Server error (e.g. DB table missing, 500) — show a retry screen, not the self-link form
  if (convError) {
    const msg = (convRawError as any)?.message ?? "Server error";
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center p-8">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div>
          <p className="font-semibold text-lg">Could Not Load AI Assistant</p>
          <p className="text-muted-foreground text-sm mt-1">{msg}</p>
        </div>
        <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["/api/ai-hr/my-conversation"] })}>
          Try Again
        </Button>
      </div>
    );
  }

  // Employee with no linked record — show self-link form
  if (!convData || !convData.conversation) {
    return <SelfLinkForm onLinked={() => qc.invalidateQueries({ queryKey: ["/api/ai-hr/my-conversation"] })} />;
  }

  const completedCount = KYC_CHECKLIST.filter((item) => kyc && (kyc as any)[item.key]).length;

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* ── Chat Panel ── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="border-b px-4 py-3 bg-background flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-semibold text-sm">Priya — AI HR Assistant</p>
              <p className="text-xs text-muted-foreground">
                KYC: {completedCount}/6 documents submitted
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <Select
              value={language}
              onValueChange={(val) => langMutation.mutate(val)}
            >
              <SelectTrigger className="h-7 w-[110px] text-xs" data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="english">English</SelectItem>
                <SelectItem value="hindi">हिंदी</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {msgsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Hello, {convData.employee.name.split(" ")[0]}! 👋</p>
                <p className="text-muted-foreground text-sm mt-1 max-w-xs">
                  I'm Priya, your AI HR Assistant. I'll help you complete your KYC
                  and answer any HR questions. Type a message to get started!
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {[
                  language === "hindi" ? "मेरा KYC status बताओ" : "Show my KYC status",
                  language === "hindi" ? "Aadhaar कैसे अपलोड करूं?" : "How to upload Aadhaar?",
                  language === "hindi" ? "Bank details कैसे दें?" : "I need to submit bank details",
                ].map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setInputText(suggestion);
                    }}
                    data-testid="button-suggestion"
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {sendMutation.isPending && (
                <div className="flex gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div className="border-t px-4 py-3 bg-background">
          <div className="flex gap-2 items-end">
            <Button
              variant="outline"
              size="icon"
              className="flex-shrink-0 h-9 w-9"
              onClick={() => setUploadDialog(true)}
              data-testid="button-upload-doc"
              title="Upload KYC document"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={language === "hindi" ? "संदेश लिखें..." : "Type your message... (Enter to send)"}
              className="flex-1 min-h-[38px] max-h-[120px] resize-none text-sm"
              rows={1}
              data-testid="input-chat-message"
            />
            <Button
              size="icon"
              className="flex-shrink-0 h-9 w-9"
              onClick={handleSend}
              disabled={!inputText.trim() || sendMutation.isPending}
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
            AI-powered assistant · For urgent HR matters, contact HR directly
          </p>
        </div>
      </div>

      {/* ── KYC Sidebar ── */}
      <div className="w-64 border-l bg-muted/30 flex-shrink-0 hidden md:flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b">
          <p className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            KYC Checklist
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Required for salary & statutory benefits
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {kyc && <KycChecklist kyc={kyc} />}

          <div className="mt-6">
            <p className="text-xs font-medium text-muted-foreground mb-2">Quick Upload</p>
            <div className="space-y-1.5">
              {DOC_TYPES.map((dt) => (
                <Button
                  key={dt.value}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-xs h-8"
                  onClick={() => {
                    setSelectedDocType(dt.value);
                    setUploadDialog(true);
                  }}
                  data-testid={`button-upload-${dt.value}`}
                >
                  <dt.icon className="h-3 w-3 mr-2 flex-shrink-0" />
                  {dt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Upload Dialog ── */}
      <Dialog open={uploadDialog} onOpenChange={setUploadDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload KYC Document
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Document Type</label>
              <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                <SelectTrigger data-testid="select-doc-type">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value}>
                      <div className="flex items-center gap-2">
                        <dt.icon className="h-4 w-4" />
                        {dt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">File</label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="drop-zone-file"
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{selectedFile.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Click to browse
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, PDF up to 10MB
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".jpg,.jpeg,.png,.pdf,.webp"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                data-testid="input-file-upload"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setUploadDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || !selectedDocType || isUploading}
                data-testid="button-confirm-upload"
              >
                {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
