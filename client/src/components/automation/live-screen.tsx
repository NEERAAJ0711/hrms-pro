import { useEffect, useRef, useState } from "react";
import { Monitor } from "lucide-react";

interface LiveScreenProps {
  jobId: string | null;
  active: boolean;
  className?: string;
  label?: string;
}

/**
 * Polls /api/automation/jobs/:id/live-screenshot every 2 seconds and
 * renders the resulting image. Shows a "LIVE" indicator while connected,
 * "DONE" with last frame after the job completes, and stops rendering
 * only when there is nothing to show.
 */
export function LiveScreen({ jobId, active, className = "", label = "Live Browser Screen" }: LiveScreenProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastTick, setLastTick] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  // When jobId changes (new job), clear the previous frame
  useEffect(() => {
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setImgSrc(null);
      setConnected(false);
      setLastTick(null);
    };
  }, [jobId]);

  // Poll for screenshots while the job is active
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    cancelledRef.current = true;

    if (!active || !jobId) {
      setConnected(false);
      return;
    }

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
      // Do NOT revoke urlRef here — keep last frame visible when job completes
    };
  }, [jobId, active]);

  // Don't render if there's nothing to show
  if (!jobId || (!imgSrc && !active)) return null;

  const statusDot = active
    ? (connected ? "bg-green-400 animate-pulse" : "bg-yellow-400")
    : "bg-slate-500";
  const statusLabel = active ? (connected ? "LIVE" : "connecting…") : "DONE";
  const statusColor = active ? (connected ? "text-green-400" : "text-yellow-400") : "text-slate-400";

  return (
    <div className={`rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-950 shadow-xl ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Monitor className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs text-slate-300 font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {lastTick && (
            <span className="text-[10px] text-slate-500 font-mono">{lastTick}</span>
          )}
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${statusDot}`} />
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Screen content */}
      {imgSrc ? (
        <img
          src={imgSrc}
          alt="Live browser view"
          className="w-full block"
          style={{ imageRendering: "auto" }}
        />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-2 text-slate-600">
          <Monitor className="h-8 w-8" />
          <span className="text-xs">Waiting for browser to start…</span>
        </div>
      )}
    </div>
  );
}
