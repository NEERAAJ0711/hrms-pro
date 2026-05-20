import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ShieldCheck, Check, X, Plus, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { User } from "@shared/schema";

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
const moduleLabel = (m: string) => MODULES.find(x => x.value === m)?.label || m;

const statusBadge = (s: string) => {
  if (s === "approved") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>;
  if (s === "denied")   return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Denied</Badge>;
  return <Badge variant="outline">Pending</Badge>;
};

export default function AccessRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "super_admin" || user?.role === "company_admin";

  const [decision, setDecision] = useState<{ id: string; action: "approve" | "deny" } | null>(null);
  const [note, setNote] = useState("");

  // Direct grant
  const [grantUserId, setGrantUserId] = useState("");
  const [grantModule, setGrantModule] = useState("");

  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/module-access-requests"],
    enabled: isAdmin,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  const decide = useMutation({
    mutationFn: async () => {
      if (!decision) return;
      const res = await apiRequest("PATCH", `/api/module-access-requests/${decision.id}`, { action: decision.action, note });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: decision?.action === "approve" ? "Approved" : "Denied", description: "The user has been notified." });
      queryClient.invalidateQueries({ queryKey: ["/api/module-access-requests"] });
      setDecision(null);
      setNote("");
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message || "Could not update request", variant: "destructive" }),
  });

  const grant = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/module-access-grants", { userId: grantUserId, module: grantModule, canAccess: true });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Access granted", description: "The user has been notified." });
      setGrantUserId("");
      setGrantModule("");
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message || "Could not grant access", variant: "destructive" }),
  });

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-8 pb-6 text-center">
            <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold mb-1">Admin only</h2>
            <p className="text-sm text-muted-foreground">Only Super Admin and Company Admin can review access requests.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pending  = requests.filter(r => r.status === "pending");
  const decided  = requests.filter(r => r.status !== "pending");
  const userName = (uid: string) => {
    const u = users.find(x => x.id === uid);
    if (!u) return uid;
    return `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username;
  };

  const renderRow = (r: any, showActions: boolean) => (
    <TableRow key={r.id} data-testid={`row-request-${r.id}`}>
      <TableCell className="font-medium">{userName(r.userId)}</TableCell>
      <TableCell>{moduleLabel(r.module)}</TableCell>
      <TableCell className="text-sm text-muted-foreground max-w-[260px] truncate">{r.reason || "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{r.createdAt ? format(new Date(r.createdAt), "dd MMM yyyy, HH:mm") : "—"}</TableCell>
      <TableCell>{statusBadge(r.status)}</TableCell>
      {showActions ? (
        <TableCell className="text-right">
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => { setDecision({ id: r.id, action: "approve" }); setNote(""); }} data-testid={`button-approve-${r.id}`}>
              <Check className="h-4 w-4 mr-1" /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setDecision({ id: r.id, action: "deny" }); setNote(""); }} data-testid={`button-deny-${r.id}`}>
              <X className="h-4 w-4 mr-1" /> Deny
            </Button>
          </div>
        </TableCell>
      ) : (
        <TableCell className="text-sm text-muted-foreground">{r.decisionNote || "—"}</TableCell>
      )}
    </TableRow>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Module Access Requests</h1>
          <p className="text-sm text-muted-foreground">Review pending requests, see history, or grant access directly.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grant access directly</CardTitle>
          <CardDescription>Skip the request flow and give a user access immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">User</label>
              <Select value={grantUserId} onValueChange={setGrantUserId}>
                <SelectTrigger data-testid="select-grant-user"><SelectValue placeholder="Choose a user" /></SelectTrigger>
                <SelectContent>
                  {users
                    .filter(u => u.role !== "super_admin")
                    .map(u => <SelectItem key={u.id} value={u.id}>{`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username} — {u.role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Module</label>
              <Select value={grantModule} onValueChange={setGrantModule}>
                <SelectTrigger data-testid="select-grant-module"><SelectValue placeholder="Choose a module" /></SelectTrigger>
                <SelectContent>
                  {MODULES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => grant.mutate()}
              disabled={!grantUserId || !grantModule || grant.isPending}
              data-testid="button-grant"
            >
              {grant.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Grant Access
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History ({decided.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
              ) : pending.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">No pending requests.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{pending.map(r => renderRow(r, true))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <CardContent className="pt-6">
              {decided.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">No history yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{decided.map(r => renderRow(r, false))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!decision} onOpenChange={(o) => { if (!o) setDecision(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision?.action === "approve" ? "Approve request" : "Deny request"}</DialogTitle>
            <DialogDescription>You can add an optional note that the user will see.</DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" maxLength={500} data-testid="input-decision-note" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={decide.isPending}>Cancel</Button>
            <Button
              onClick={() => decide.mutate()}
              disabled={decide.isPending}
              variant={decision?.action === "deny" ? "destructive" : "default"}
              data-testid="button-confirm-decision"
            >
              {decide.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
