import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send, Loader2, ShieldQuestion } from "lucide-react";
import { useAuth } from "@/lib/auth";

const MODULES = [
  { value: "employees",   label: "Employees" },
  { value: "attendance",  label: "Attendance" },
  { value: "leave",       label: "Leave" },
  { value: "payroll",     label: "Payroll" },
  { value: "reports",     label: "Reports" },
  { value: "recruitment", label: "Recruitment" },
  { value: "masters",     label: "Master Data" },
  { value: "settings",    label: "Settings" },
  { value: "users",       label: "Users" },
];

const statusBadge = (s: string) => {
  if (s === "approved") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>;
  if (s === "denied")   return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Denied</Badge>;
  if (s === "revoked")  return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Revoked</Badge>;
  return <Badge variant="outline">Pending</Badge>;
};

export default function MyAccessRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [module, setModule] = useState("");
  const [reason, setReason] = useState("");

  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/module-access-requests/mine"],
    enabled: !!user,
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/module-access-requests", { module, reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Request sent", description: "Your administrator will review it shortly." });
      queryClient.invalidateQueries({ queryKey: ["/api/module-access-requests/mine"] });
      setModule(""); setReason("");
    },
    onError: (err: any) => toast({ title: "Could not send", description: err?.message || "Failed", variant: "destructive" }),
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <ShieldQuestion className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">My Access Requests</h1>
          <p className="text-sm text-muted-foreground">Request access to HR modules and track previous requests.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New request</CardTitle>
          <CardDescription>Pick a module and add an optional reason.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[260px_1fr_auto] md:items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Module</label>
              <Select value={module} onValueChange={setModule}>
                <SelectTrigger data-testid="select-request-module"><SelectValue placeholder="Choose a module" /></SelectTrigger>
                <SelectContent>
                  {MODULES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
              <Textarea
                placeholder="Why do you need this access?"
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                maxLength={500}
                data-testid="input-request-reason"
              />
            </div>
            <Button
              onClick={() => create.mutate()}
              disabled={!module || create.isPending}
              data-testid="button-send-request"
            >
              {create.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My requests</CardTitle>
          <CardDescription>{requests.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          ) : requests.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">You haven't requested any module access yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(r => (
                  <TableRow key={r.id} data-testid={`row-request-${r.id}`}>
                    <TableCell className="font-medium">{MODULES.find(m => m.value === r.module)?.label || r.module}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.createdAt ? format(new Date(r.createdAt), "dd MMM yyyy, HH:mm") : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.decidedAt ? format(new Date(r.decidedAt), "dd MMM yyyy, HH:mm") : "—"}</TableCell>
                    <TableCell className="text-sm">{r.decisionNote || r.reason || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
