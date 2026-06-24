import { useState } from "react";
import { AlertTriangle, Phone, Mail, Clock, ArrowRight, QrCode, CreditCard, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

type PaymentQr = { qrUrl: string | null; upiId: string | null; note: string | null };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function TrialExpiredWall() {
  const { user, logout, refreshUser } = useAuth();
  const { toast } = useToast();
  const { data: payment } = useQuery<PaymentQr>({ queryKey: ["/api/billing/payment-qr"] });
  const hasPayment = !!(payment?.qrUrl || payment?.upiId);

  const wasRejected = (user as { paymentStatus?: string | null })?.paymentStatus === "rejected";

  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayStr());
  const [referenceNo, setReferenceNo] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/payment-submission", {
        amount,
        paymentDate,
        referenceNo,
      });
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Payment submitted", description: "Access restored. Our team will verify your payment shortly." });
      await refreshUser();
    },
    onError: (e: Error) => toast({ title: "Could not submit", description: e.message, variant: "destructive" }),
  });

  const canSubmit = amount.trim() !== "" && Number(amount) > 0 && paymentDate.trim() !== "" && referenceNo.trim() !== "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500/40 mb-6">
            <AlertTriangle className="h-10 w-10 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Free Trial Expired</h1>
          <p className="text-slate-400 text-base leading-relaxed">
            Your 3-day free trial for <span className="text-white font-semibold">{user?.companyName || "your company"}</span> has ended.
            Please contact our Sales &amp; Support team to continue using the platform.
          </p>
        </div>

        {wasRejected && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-start gap-3" data-testid="banner-payment-rejected">
            <XCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">
              Your last payment could not be verified and was rejected. Please make the payment again and resubmit the details below.
            </p>
          </div>
        )}

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 space-y-4">
          <h2 className="text-white font-semibold text-sm uppercase tracking-wider">Contact Sales &amp; Support</h2>
          <div className="flex items-center gap-4 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Phone className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Phone / WhatsApp</p>
              <p className="text-white font-semibold" data-testid="text-support-phone">+91 99990 87409</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 bg-green-500/10 rounded-xl border border-green-500/20">
            <div className="flex-shrink-0 w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <Mail className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Email Support</p>
              <p className="text-white font-semibold">sales@tbjvisionconnect.com</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 bg-purple-500/10 rounded-xl border border-purple-500/20">
            <div className="flex-shrink-0 w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Clock className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Support Hours</p>
              <p className="text-white font-semibold">Mon–Sat, 9:00 AM – 7:00 PM IST</p>
            </div>
          </div>
        </div>

        {hasPayment && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6" data-testid="section-payment-qr">
            <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <QrCode className="h-4 w-4 text-emerald-400" /> Pay to Restore Access
            </h2>
            {payment?.qrUrl && (
              <div className="flex justify-center mb-4">
                <div className="bg-white rounded-xl p-3">
                  <img
                    src={payment.qrUrl}
                    alt="Payment QR Code"
                    className="h-52 w-52 object-contain"
                    data-testid="img-trial-payment-qr"
                  />
                </div>
              </div>
            )}
            {payment?.upiId && (
              <div className="text-center mb-3">
                <p className="text-xs text-slate-400 mb-0.5">UPI ID</p>
                <p className="text-white font-semibold" data-testid="text-trial-upi-id">{payment.upiId}</p>
              </div>
            )}
            {payment?.note && (
              <p className="text-slate-300 text-sm text-center" data-testid="text-trial-payment-note">{payment.note}</p>
            )}
          </div>
        )}

        {/* Update Payment — restores access immediately, pending admin verification */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-400" /> Already Paid?
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            Enter your payment details to restore access right away. Our team will verify it shortly.
          </p>

          {!showForm ? (
            <Button
              onClick={() => setShowForm(true)}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              data-testid="button-update-payment"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> Update Payment
            </Button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Amount (₹)</label>
                <Input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                  data-testid="input-payment-amount"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Payment Date</label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="bg-white/10 border-white/20 text-white"
                  data-testid="input-payment-date"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Reference / Transaction No.</label>
                <Input
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="UTR / UPI ref / transaction id"
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                  data-testid="input-payment-reference"
                />
              </div>
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={!canSubmit || submitMutation.isPending}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                data-testid="button-submit-payment"
              >
                {submitMutation.isPending
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Submit &amp; Restore Access
              </Button>
            </div>
          )}
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6">
          <p className="text-amber-300 text-sm text-center">
            Our team will activate your account within minutes of your confirmation.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <a
            href="mailto:sales@tbjvisionconnect.com"
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            <Mail className="h-4 w-4" />
            Send Email to Sales
            <ArrowRight className="h-4 w-4 ml-1" />
          </a>
          <Button
            variant="ghost"
            onClick={logout}
            className="text-slate-400 hover:text-white"
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
