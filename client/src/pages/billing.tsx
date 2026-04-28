import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import {
  CreditCard,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  Settings2,
  TrendingUp,
  TrendingDown,
  Building2,
  Users,
  Wallet,
  RefreshCw,
  ChevronRight,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type BillingAccount = {
  id: string;
  companyId: string;
  companyName: string;
  companyStatus: string;
  creditBalance: string;
  costPerEmployeePerDay: string;
  lowBalanceThreshold: string;
  notes: string | null;
  activeEmployeeCount: string;
  createdAt: string;
  updatedAt: string;
};

type CdTransaction = {
  id: string;
  companyId: string;
  type: "credit" | "debit" | "adjustment";
  amount: string;
  balanceAfter: string;
  description: string;
  referenceNo: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
};

type UnregisteredCompany = { id: string; company_name: string };

function fmt(n: string | number | null | undefined) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function BalanceBadge({ balance, threshold }: { balance: string; threshold: string }) {
  const b = Number(balance);
  const t = Number(threshold);
  if (b <= 0) return <Badge variant="destructive">₹ {fmt(balance)}</Badge>;
  if (t > 0 && b <= t) return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">₹ {fmt(balance)}</Badge>;
  return <Badge className="bg-green-600 hover:bg-green-700 text-white">₹ {fmt(balance)}</Badge>;
}

// ─── Setup Account Dialog ─────────────────────────────────────────────────────
function SetupAccountDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState("");
  const [rate, setRate] = useState("");
  const [threshold, setThreshold] = useState("");
  const [notes, setNotes] = useState("");

  const { data: unregistered = [] } = useQuery<UnregisteredCompany[]>({
    queryKey: ["/api/billing/unregistered-companies"],
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/billing/accounts", {
      companyId,
      costPerEmployeePerDay: Number(rate) || 0,
      lowBalanceThreshold: Number(threshold) || 0,
      notes: notes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/unregistered-companies"] });
      toast({ title: "CD Account Created", description: "Billing account has been set up successfully." });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Setup CD Account
          </DialogTitle>
          <DialogDescription>Create a credit/debit billing account for a company.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Company</label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger data-testid="select-billing-company">
                <SelectValue placeholder="Select company…" />
              </SelectTrigger>
              <SelectContent>
                {unregistered.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cost per Employee per Day (₹)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={rate}
              onChange={e => setRate(e.target.value)}
              placeholder="e.g. 2.50"
              data-testid="input-billing-rate"
            />
            <p className="text-xs text-muted-foreground">
              Auto-billing deduction rate. Leave 0 if billing manually.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Low Balance Alert Threshold (₹)</label>
            <Input
              type="number"
              min="0"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              placeholder="e.g. 500"
              data-testid="input-billing-threshold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes about this account…"
              rows={2}
              data-testid="input-billing-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!companyId || createMutation.isPending}
            data-testid="button-create-billing-account"
          >
            {createMutation.isPending ? "Creating…" : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Account Settings Dialog ────────────────────────────────────────────
function EditAccountDialog({ account, onClose }: { account: BillingAccount; onClose: () => void }) {
  const { toast } = useToast();
  const [rate, setRate] = useState(account.costPerEmployeePerDay);
  const [threshold, setThreshold] = useState(account.lowBalanceThreshold);
  const [notes, setNotes] = useState(account.notes || "");

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/billing/accounts/${account.companyId}`, {
      costPerEmployeePerDay: Number(rate) || 0,
      lowBalanceThreshold: Number(threshold) || 0,
      notes: notes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/accounts"] });
      toast({ title: "Account Updated" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" /> Edit Account — {account.companyName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cost per Employee per Day (₹)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={rate}
              onChange={e => setRate(e.target.value)}
              data-testid="input-edit-billing-rate"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Low Balance Alert Threshold (₹)</label>
            <Input
              type="number"
              min="0"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              data-testid="input-edit-billing-threshold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              data-testid="input-edit-billing-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-billing-account">
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Credit / Debit Dialog ────────────────────────────────────────────────────
function TransactionDialog({
  account,
  mode,
  onClose,
}: {
  account: BillingAccount;
  mode: "credit" | "debit";
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [referenceNo, setReferenceNo] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/billing/accounts/${account.companyId}/${mode}`, {
        amount: Number(amount),
        description: description || (mode === "credit" ? "Manual top-up" : "Manual debit"),
        referenceNo: referenceNo || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/accounts"] });
      queryClient.invalidateQueries({ queryKey: [`/api/billing/transactions/${account.companyId}`] });
      toast({
        title: mode === "credit" ? "Credits Added" : "Credits Deducted",
        description: `₹ ${fmt(amount)} ${mode === "credit" ? "added to" : "deducted from"} ${account.companyName}.`,
      });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isCredit = mode === "credit";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCredit
              ? <ArrowUpCircle className="h-5 w-5 text-green-600" />
              : <ArrowDownCircle className="h-5 w-5 text-red-600" />}
            {isCredit ? "Add Credits" : "Deduct Credits"} — {account.companyName}
          </DialogTitle>
          <DialogDescription>
            Current balance: <strong>₹ {fmt(account.creditBalance)}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Amount (₹)</label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Enter amount"
              data-testid="input-tx-amount"
            />
            {amount && (
              <p className="text-xs text-muted-foreground">
                New balance: ₹{" "}
                <strong>
                  {fmt(Number(account.creditBalance) + (isCredit ? 1 : -1) * Number(amount))}
                </strong>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={isCredit ? "e.g. Monthly top-up" : "e.g. Billing deduction"}
              data-testid="input-tx-description"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Reference No. <span className="text-muted-foreground">(optional)</span></label>
            <Input
              value={referenceNo}
              onChange={e => setReferenceNo(e.target.value)}
              placeholder="Bank ref / voucher no."
              data-testid="input-tx-reference"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!amount || Number(amount) <= 0 || mutation.isPending}
            variant={isCredit ? "default" : "destructive"}
            data-testid="button-confirm-transaction"
          >
            {mutation.isPending ? "Processing…" : isCredit ? "Add Credits" : "Deduct Credits"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transaction Ledger ───────────────────────────────────────────────────────
function TransactionLedger({ account, onClose }: { account: BillingAccount; onClose: () => void }) {
  const { data: txs = [], isLoading } = useQuery<CdTransaction[]>({
    queryKey: [`/api/billing/transactions/${account.companyId}`],
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> Transaction Ledger — {account.companyName}
          </DialogTitle>
          <DialogDescription>
            Current balance: <strong>₹ {fmt(account.creditBalance)}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 -mx-1">
          {isLoading ? (
            <div className="space-y-2 p-1">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : txs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No transactions yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Ref No.</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance After</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txs.map(tx => {
                  const isCredit = tx.type === "credit";
                  return (
                    <TableRow key={tx.id} data-testid={`row-tx-${tx.id}`}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(tx.createdAt), "dd-MMM-yy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={isCredit
                            ? "text-green-700 border-green-300 bg-green-50 dark:bg-green-950/30"
                            : "text-red-700 border-red-300 bg-red-50 dark:bg-red-950/30"
                          }
                        >
                          {isCredit ? <TrendingUp className="h-3 w-3 mr-1 inline" /> : <TrendingDown className="h-3 w-3 mr-1 inline" />}
                          {tx.type.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm">{tx.description}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{tx.referenceNo || "—"}</TableCell>
                      <TableCell className={`text-right font-semibold text-sm ${isCredit ? "text-green-700" : "text-red-700"}`}>
                        {isCredit ? "+" : "-"}₹{fmt(tx.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm">₹{fmt(tx.balanceAfter)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {tx.firstName ? `${tx.firstName} ${tx.lastName || ""}`.trim() : "System"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.role === "super_admin";
  const isCompanyAdmin = user?.role === "company_admin";

  const [showSetup, setShowSetup] = useState(false);
  const [editAccount, setEditAccount] = useState<BillingAccount | null>(null);
  const [creditAccount, setCreditAccount] = useState<BillingAccount | null>(null);
  const [debitAccount, setDebitAccount] = useState<BillingAccount | null>(null);
  const [ledgerAccount, setLedgerAccount] = useState<BillingAccount | null>(null);

  const { data: accounts = [], isLoading } = useQuery<BillingAccount[]>({
    queryKey: ["/api/billing/accounts"],
  });

  const totalBalance = accounts.reduce((s, a) => s + Number(a.creditBalance), 0);
  const totalCompanies = accounts.length;
  const lowBalanceCount = accounts.filter(a => {
    const b = Number(a.creditBalance), t = Number(a.lowBalanceThreshold);
    return t > 0 && b <= t;
  }).length;

  // Company admin: show their own account view
  if (isCompanyAdmin) {
    const acct = accounts[0];
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6" data-testid="billing-page-company">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" /> My Billing Account
          </h1>
          <p className="text-muted-foreground">View your credit balance and transaction history.</p>
        </div>

        {isLoading ? (
          <Card><CardContent className="pt-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
        ) : !acct ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <CreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-semibold">No billing account set up yet</p>
              <p className="text-sm text-muted-foreground">Contact your administrator to set up a billing account.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className={Number(acct.creditBalance) <= 0 ? "border-red-300 bg-red-50 dark:bg-red-950/20" : ""}>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">Credit Balance</p>
                  <p className={`text-3xl font-bold ${Number(acct.creditBalance) <= 0 ? "text-red-600" : "text-green-700"}`}>
                    ₹ {fmt(acct.creditBalance)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">Daily Rate</p>
                  <p className="text-2xl font-bold">₹ {fmt(acct.costPerEmployeePerDay)}</p>
                  <p className="text-xs text-muted-foreground">per employee per day</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <p className="text-sm text-muted-foreground mb-1">Active Employees</p>
                  <p className="text-2xl font-bold">{acct.activeEmployeeCount}</p>
                  <p className="text-xs text-muted-foreground">
                    Est. daily charge: ₹ {fmt(Number(acct.activeEmployeeCount) * Number(acct.costPerEmployeePerDay))}
                  </p>
                </CardContent>
              </Card>
            </div>

            {Number(acct.creditBalance) <= Number(acct.lowBalanceThreshold) && Number(acct.lowBalanceThreshold) > 0 && (
              <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="pt-4 pb-4 flex items-center gap-3 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">Low balance alert — please contact your administrator to top up.</span>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> Recent Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CompanyAdminLedger companyId={acct.companyId} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  // Super admin view
  return (
    <div className="p-6 space-y-6" data-testid="billing-page-admin">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" /> Credits & Billing
          </h1>
          <p className="text-muted-foreground">Manage CD accounts, credit balances, and billing rates for all companies.</p>
        </div>
        <Button onClick={() => setShowSetup(true)} data-testid="button-setup-cd-account">
          <Plus className="h-4 w-4 mr-2" /> Setup Account
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Companies</p>
              <p className="text-2xl font-bold">{totalCompanies}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Balance</p>
              <p className="text-2xl font-bold">₹ {fmt(totalBalance)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={lowBalanceCount > 0 ? "border-amber-300" : ""}>
          <CardContent className="pt-5 pb-4 flex items-center gap-4">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${lowBalanceCount > 0 ? "bg-amber-100 dark:bg-amber-950/40" : "bg-muted"}`}>
              <AlertTriangle className={`h-5 w-5 ${lowBalanceCount > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Low Balance</p>
              <p className={`text-2xl font-bold ${lowBalanceCount > 0 ? "text-amber-600" : ""}`}>{lowBalanceCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accounts Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">All CD Accounts</CardTitle>
          <CardDescription>Click a row to view transactions or use action buttons to manage credits.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No billing accounts yet</p>
              <p className="text-sm">Click "Setup Account" to create one.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Rate / Emp / Day</TableHead>
                  <TableHead className="text-right">Active Emp.</TableHead>
                  <TableHead className="text-right">Est. Daily</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map(acct => {
                  const dailyEstimate = Number(acct.activeEmployeeCount) * Number(acct.costPerEmployeePerDay);
                  const isLow = Number(acct.lowBalanceThreshold) > 0 && Number(acct.creditBalance) <= Number(acct.lowBalanceThreshold);
                  return (
                    <TableRow
                      key={acct.companyId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setLedgerAccount(acct)}
                      data-testid={`row-billing-${acct.companyId}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{acct.companyName}</span>
                          {isLow && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" title="Low balance" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <BalanceBadge balance={acct.creditBalance} threshold={acct.lowBalanceThreshold} />
                      </TableCell>
                      <TableCell className="text-right text-sm">₹ {fmt(acct.costPerEmployeePerDay)}</TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="flex items-center justify-end gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {acct.activeEmployeeCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">₹ {fmt(dailyEstimate)}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Add Credits"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                            onClick={() => setCreditAccount(acct)}
                            data-testid={`button-credit-${acct.companyId}`}
                          >
                            <ArrowUpCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Deduct Credits"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => setDebitAccount(acct)}
                            data-testid={`button-debit-${acct.companyId}`}
                          >
                            <ArrowDownCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit Settings"
                            onClick={() => setEditAccount(acct)}
                            data-testid={`button-edit-billing-${acct.companyId}`}
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View Ledger"
                            onClick={() => setLedgerAccount(acct)}
                            data-testid={`button-ledger-${acct.companyId}`}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      {showSetup && <SetupAccountDialog onClose={() => setShowSetup(false)} />}
      {editAccount && <EditAccountDialog account={editAccount} onClose={() => setEditAccount(null)} />}
      {creditAccount && <TransactionDialog account={creditAccount} mode="credit" onClose={() => setCreditAccount(null)} />}
      {debitAccount && <TransactionDialog account={debitAccount} mode="debit" onClose={() => setDebitAccount(null)} />}
      {ledgerAccount && <TransactionLedger account={ledgerAccount} onClose={() => setLedgerAccount(null)} />}
    </div>
  );
}

// ─── Company Admin Mini Ledger ────────────────────────────────────────────────
function CompanyAdminLedger({ companyId }: { companyId: string }) {
  const { data: txs = [], isLoading } = useQuery<CdTransaction[]>({
    queryKey: [`/api/billing/transactions/${companyId}`],
  });

  if (isLoading) return <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (txs.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">No transactions yet.</p>;

  return (
    <div className="space-y-1 max-h-72 overflow-y-auto">
      {txs.slice(0, 30).map(tx => {
        const isCredit = tx.type === "credit";
        return (
          <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              {isCredit
                ? <TrendingUp className="h-4 w-4 text-green-600 shrink-0" />
                : <TrendingDown className="h-4 w-4 text-red-600 shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm truncate">{tx.description}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(tx.createdAt), "dd-MMM-yyyy")}</p>
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className={`text-sm font-semibold ${isCredit ? "text-green-700" : "text-red-700"}`}>
                {isCredit ? "+" : "-"}₹{fmt(tx.amount)}
              </p>
              <p className="text-xs text-muted-foreground">Bal: ₹{fmt(tx.balanceAfter)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
