import { AlertTriangle, Clock, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

export function TrialBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (!user?.trialActive || user.trialExpired) return null;

  const daysLeft = user.trialDaysLeft ?? 0;
  const isUrgent = daysLeft <= 1;

  return (
    <div className={`flex items-center justify-between px-4 py-2 text-sm font-medium ${isUrgent ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>
      <div className="flex items-center gap-2">
        {isUrgent ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
        <span>
          {isUrgent
            ? "Your free trial expires today! Contact Sales & Support to continue."
            : `Free trial: ${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining. Contact sales@tbjvisionconnect.com to activate full access.`}
        </span>
      </div>
      <button onClick={() => setDismissed(true)} className="ml-4 opacity-80 hover:opacity-100 shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
