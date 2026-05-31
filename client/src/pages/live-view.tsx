import { useEffect, useRef, useState } from "react";
import { Monitor } from "lucide-react";

function useSearchParam(key: string) {
  return new URLSearchParams(window.location.search).get(key);
}

export default function LiveViewPage() {
  const jobId = useSearchParam("jobId");
  const label = useSearchParam("label") ?? "Live Browser View";

  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastTick, setLastTick] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    document.title = label + " — HRMS Pro";
    return () => { cancelledRef.current = true; };
  }, [label]);

  useEffect(() => {
    if (!jobId) return;
    cancelledRef.current = false;

    async function poll() {
      if (cancelledRef.current) return;
      try {
        const res = await fetch(`/api/automation/jobs/${jobId}/live-screenshot`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!cancelledRef.current && res.ok) {
          const blob = await res.blob();
          const newUrl = URL.createObjectURL(blob);
          setImgSrc(prev => {
            if (urlRef.current) URL.revokeObjectURL(urlRef.current);
            urlRef.current = newUrl;
            return newUrl;
          });
          setConnected(true);
          setLastTick(new Date().toLocaleTimeString());
        } else {
          setConnected(false);
        }
      } catch {
        setConnected(false);
      }
      if (!cancelledRef.current) {
        timerRef.current = setTimeout(poll, 2000);
      }
    }
    poll();
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId]);

  if (!jobId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        No jobId in URL. Open this window from the portal screen.
      </div>
    );
  }

  const statusDot = connected ? "bg-green-400 animate-pulse" : "bg-yellow-400";
  const statusLabel = connected ? "LIVE" : "Connecting…";
  const statusColor = connected ? "text-green-400" : "text-yellow-400";

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-200 font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {lastTick && <span className="text-[11px] text-slate-500 font-mono">{lastTick}</span>}
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${statusDot}`} />
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${statusColor}`}>{statusLabel}</span>
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-start justify-center p-4">
        {imgSrc ? (
          <img src={imgSrc} alt="Live browser view" className="max-w-full rounded shadow-2xl" style={{ imageRendering: "auto" }} />
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-600">
            <Monitor className="h-12 w-12" />
            <p className="text-sm">Waiting for browser to start…</p>
          </div>
        )}
      </div>
    </div>
  );
}
