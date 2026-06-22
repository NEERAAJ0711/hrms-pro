import { useEffect, useRef, useState } from "react";
import { Monitor, ExternalLink, Loader2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface LiveScreenProps {
  jobId: string | null;
  active: boolean;
  className?: string;
  label?: string;
}

interface JobStatus {
  status: string;
  errorMessage?: string | null;
  jobType?: string;
}

/**
 * Polls /api/automation/jobs/:id/live-screenshot every 1 second.
 * When the screenshot endpoint returns 404 (job not active), falls back to
 * fetching real job status and shows a meaningful message instead of the
 * generic "Waiting for browser to start…".
 */
export function LiveScreen({ jobId, active, className = "", label = "Live Browser Screen" }: LiveScreenProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastTick, setLastTick] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isBlank, setIsBlank] = useState(false);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // When jobId changes, reset all state
  useEffect(() => {
    setImgSrc(null);
    setConnected(false);
    setLastTick(null);
    setJobStatus(null);
    setIsBlank(false);
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
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

    async function fetchJobStatus() {
      try {
        const res = await fetch(`/api/automation/jobs/${jobId}`, { credentials: "include", cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setJobStatus({ status: data.status, errorMessage: data.errorMessage, jobType: data.jobType });
        }
      } catch { /* ignore */ }
    }

    async function poll() {
      if (cancelledRef.current) return;
      try {
        const res = await fetch(`/api/automation/jobs/${jobId}/live-screenshot`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!cancelledRef.current && res.ok) {
          const blob = await res.blob();
          if (blob.size === 0) {
            // 200 with an empty body — the browser isn't producing frames yet.
            setConnected(false);
            await fetchJobStatus();
          } else {
            const newUrl = URL.createObjectURL(blob);
            setImgSrc(prev => {
              if (urlRef.current) URL.revokeObjectURL(urlRef.current);
              urlRef.current = newUrl;
              return newUrl;
            });
            setConnected(true);
            setLastTick(new Date().toLocaleTimeString());
            setJobStatus(null); // clear status overlay once we have a live image
          }
        } else if (!cancelledRef.current) {
          setConnected(false);
          // Screenshot not available — fetch actual job status for a real message
          await fetchJobStatus();
        }
      } catch {
        if (!cancelledRef.current) {
          setConnected(false);
          await fetchJobStatus();
        }
      }
      if (!cancelledRef.current) {
        // Poll faster when still waiting (1s), slower once connected (1s too — portal actions need fast updates)
        timerRef.current = setTimeout(poll, 1000);
      }
    }

    poll();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId, active]);

  // Don't render if there's nothing to show
  if (!jobId || (!imgSrc && !active)) return null;

  const statusDot = active
    ? (connected ? "bg-green-400 animate-pulse" : "bg-yellow-400 animate-pulse")
    : "bg-slate-500";
  const statusLabel = active ? (connected ? "LIVE" : "connecting…") : "DONE";
  const statusColor = active ? (connected ? "text-green-400" : "text-yellow-400") : "text-slate-400";

  function popOut() {
    const url = `/live-view?jobId=${jobId}&label=${encodeURIComponent(label)}`;
    window.open(url, `live_${jobId}`, "width=960,height=700,popup=yes,resizable=yes");
  }

  // Detect a blank / near-uniform frame (e.g. the portal page still white while
  // loading or navigating) so we can show a "working" overlay instead of a
  // confusing blank white screen. Same-origin blob → canvas is not tainted.
  function analyzeFrame(img: HTMLImageElement) {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = 48, h = 27;
      canvas.width = w; canvas.height = h;
      const cx = canvas.getContext("2d", { willReadFrequently: true });
      if (!cx) { setIsBlank(false); return; }
      cx.drawImage(img, 0, 0, w, h);
      const { data } = cx.getImageData(0, 0, w, h);
      const total = w * h;
      let nearWhite = 0, min = 255, max = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 244 && g > 244 && b > 244) nearWhite++;
        const lum = (r + g + b) / 3;
        if (lum < min) min = lum;
        if (lum > max) max = lum;
      }
      // Blank if almost entirely white, or the whole frame is one flat colour.
      setIsBlank(nearWhite / total > 0.985 || max - min < 6);
    } catch {
      setIsBlank(false);
    }
  }

  // ── Status overlay when no screenshot yet ────────────────────────────────────
  function renderStatusPlaceholder() {
    if (!jobStatus) {
      // Still waiting for first status fetch
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-xs">Browser starting — checking status…</span>
        </div>
      );
    }

    const s = jobStatus.status;

    if (s === "pending") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-400">
          <Clock className="h-8 w-8 text-yellow-500" />
          <span className="text-sm font-medium text-yellow-400">Job queued — waiting to start</span>
          <span className="text-xs text-slate-500">The browser will appear here once the job begins</span>
        </div>
      );
    }

    if (s === "running") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <span className="text-sm font-medium text-blue-400">Browser starting…</span>
          <span className="text-xs text-slate-500">Opening portal in Chromium</span>
        </div>
      );
    }

    if (s === "paused") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
          <span className="text-sm font-medium text-orange-400">Paused — waiting for CAPTCHA / OTP</span>
        </div>
      );
    }

    if (s === "failed") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 px-6">
          <AlertTriangle className="h-8 w-8 text-red-500" />
          <span className="text-sm font-semibold text-red-400">Job failed</span>
          {jobStatus.errorMessage && (
            <p className="text-xs text-slate-400 text-center max-w-sm leading-relaxed">
              {jobStatus.errorMessage}
            </p>
          )}
          <span className="text-xs text-slate-600">Check the Logs tab for full details</span>
        </div>
      );
    }

    if (s === "completed") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <span className="text-sm font-semibold text-green-400">Job completed successfully</span>
          {imgSrc && <span className="text-xs text-slate-500">Last frame shown above</span>}
        </div>
      );
    }

    if (s === "cancelled") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-500">
          <Monitor className="h-8 w-8" />
          <span className="text-sm">Job was cancelled</span>
        </div>
      );
    }

    // Unknown state
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-2 text-slate-600">
        <Monitor className="h-8 w-8" />
        <span className="text-xs">Status: {s}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-950 shadow-xl ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Monitor className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs text-slate-300 font-medium">{label}</span>
          {jobStatus && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              jobStatus.status === "failed" ? "bg-red-900/50 text-red-400" :
              jobStatus.status === "completed" ? "bg-green-900/50 text-green-400" :
              jobStatus.status === "pending" ? "bg-yellow-900/50 text-yellow-400" :
              "bg-slate-800 text-slate-400"
            }`}>
              {jobStatus.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastTick && (
            <span className="text-[10px] text-slate-500 font-mono">{lastTick}</span>
          )}
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${statusDot}`} />
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
          <button
            onClick={popOut}
            title="Pop out into separate window"
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="hidden sm:inline">Pop out</span>
          </button>
        </div>
      </div>

      {/* Screen content */}
      {imgSrc ? (
        <div className="relative">
          <img
            src={imgSrc}
            alt="Live browser view"
            className="w-full block"
            style={{ imageRendering: "auto" }}
            onLoad={e => analyzeFrame(e.currentTarget)}
            onError={() => setIsBlank(true)}
          />
          {isBlank && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/85 backdrop-blur-sm px-6 text-center">
              {active ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                  <span className="text-sm font-medium text-blue-300">Working… loading portal page</span>
                  <span className="text-xs text-slate-500">The page is still rendering — this updates automatically every second</span>
                </>
              ) : (
                <>
                  <Monitor className="h-8 w-8 text-slate-500" />
                  <span className="text-sm font-medium text-slate-300">No page preview captured</span>
                  <span className="text-xs text-slate-500">Open the Logs tab to see what the portal returned</span>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        renderStatusPlaceholder()
      )}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
