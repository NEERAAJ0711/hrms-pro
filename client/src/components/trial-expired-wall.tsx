import { AlertTriangle, Phone, Mail, Clock, ArrowRight, QrCode } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

type PaymentQr = { qrUrl: string | null; upiId: string | null; note: string | null };

export function TrialExpiredWall() {
  const { user, logout } = useAuth();
  const { data: payment } = useQuery<PaymentQr>({ queryKey: ["/api/billing/payment-qr"] });
  const hasPayment = !!(payment?.qrUrl || payment?.upiId);

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

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 space-y-4">
          <h2 className="text-white font-semibold text-sm uppercase tracking-wider">Contact Sales &amp; Support</h2>
          <div className="flex items-center gap-4 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Phone className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Phone / WhatsApp</p>
              <p className="text-white font-semibold">+91 98765 43210</p>
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
