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
 * renders the resulting image. Shows a "LIVE" indicator while connected.
 */
export function LiveScreen({ jobId, active, className = "", label = "Live Browser Screen" }: LiveScreenProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastTick, setLastTick] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
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
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [jobId, active]);

  if (!active || !jobId) return null;

  return (
    <div className={`rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-950 shadow-xl ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Monitor className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs text-slate-300 font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {connected && lastTick && (
            <span className="text-[10px] text-slate-500 font-mono">{lastTick}</span>
          )}
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${connected ? "text-green-400" : "text-yellow-400"}`}>
              {connected ? "LIVE" : "connecting…"}
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
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-600">
          <Monitor className="h-8 w-8" />
          <span className="text-xs">Waiting for browser to start…</span>
        </div>
      )}
    </div>
  );
}
