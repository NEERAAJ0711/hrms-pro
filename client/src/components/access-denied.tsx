import { useState } from "react";
import { Lock, Send, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

const MODULE_LABELS: Record<string, string> = {
  employees: "Employees",
  attendance: "Attendance",
  leave: "Leave",
  payroll: "Payroll",
  reports: "Reports",
  recruitment: "Recruitment",
  masters: "Master Data",
  settings: "Settings",
  users: "Users",
};

export function AccessDenied({ module }: { module: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const label = MODULE_LABELS[module] || module;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/module-access-requests", { module, reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Request sent", description: `Your request for ${label} access has been sent to your administrator.` });
      queryClient.invalidateQueries({ queryKey: ["/api/module-access-requests/mine"] });
      setOpen(false);
      setReason("");
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to send request";
      toast({ title: "Could not send", description: msg, variant: "destructive" });
    },
  });

  return (
    <div className="container mx-auto p-6 flex items-center justify-center min-h-[calc(100vh-200px)]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-6 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-1" data-testid="text-access-denied-title">Access Required</h2>
          <p className="text-sm text-muted-foreground mb-5">
            You don't have access to the <span className="font-medium text-foreground">{label}</span> module. Request access and an administrator will review it.
          </p>
          <Button onClick={() => setOpen(true)} data-testid="button-request-access">
            <Send className="h-4 w-4 mr-2" /> Request Access
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request access to {label}</DialogTitle>
            <DialogDescription>Optionally tell your administrator why you need this access.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            data-testid="input-access-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-submit-access-request">
              {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
