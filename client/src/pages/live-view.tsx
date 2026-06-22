import { useEffect, useRef, useState } from "react";
import { Monitor, Loader2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

function useSearchParam(key: string) {
  return new URLSearchParams(window.location.search).get(key);
}

interface JobStatus {
  status: string;
  errorMessage?: string | null;
  jobType?: string;
}

export default function LiveViewPage() {
  const jobId = useSearchParam("jobId");
  const label = useSearchParam("label") ?? "Live Browser View";

  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastTick, setLastTick] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isBlank, setIsBlank] = useState(false);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    document.title = label + " — HRMS Pro";
    return () => { cancelledRef.current = true; };
  }, [label]);

  useEffect(() => {
    if (!jobId) return;
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
            setJobStatus(null);
          }
        } else if (!cancelledRef.current) {
          setConnected(false);
          await fetchJobStatus();
        }
      } catch {
        if (!cancelledRef.current) {
          setConnected(false);
          await fetchJobStatus();
        }
      }
      if (!cancelledRef.current) {
        timerRef.current = setTimeout(poll, 1000);
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
  }, [jobId]);

  if (!jobId) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        No jobId in URL. Open this window from the portal screen.
      </div>
    );
  }

  const statusDot = connected ? "bg-green-400 animate-pulse" : "bg-yellow-400 animate-pulse";
  const statusLabel = connected ? "LIVE" : (jobStatus?.status ?? "Connecting…");
  const statusColor = connected ? "text-green-400" :
    jobStatus?.status === "failed" ? "text-red-400" :
    jobStatus?.status === "completed" ? "text-green-400" :
    "text-yellow-400";

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
      setIsBlank(nearWhite / total > 0.985 || max - min < 6);
    } catch {
      setIsBlank(false);
    }
  }

  function renderPlaceholder() {
    if (!jobStatus) {
      return (
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-12 w-12 animate-spin" />
          <p className="text-sm">Connecting to browser…</p>
        </div>
      );
    }

    const s = jobStatus.status;

    if (s === "pending") return (
      <div className="flex flex-col items-center gap-3">
        <Clock className="h-12 w-12 text-yellow-500" />
        <p className="text-base font-semibold text-yellow-400">Job queued — waiting to start</p>
        <p className="text-sm text-slate-500">Browser will appear here once the job begins</p>
      </div>
    );

    if (s === "running") return (
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
        <p className="text-base font-semibold text-blue-400">Browser starting…</p>
        <p className="text-sm text-slate-500">Opening portal in Chromium</p>
      </div>
    );

    if (s === "paused") return (
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-12 w-12 animate-spin text-orange-400" />
        <p className="text-base font-semibold text-orange-400">Paused — waiting for CAPTCHA / OTP</p>
        <p className="text-sm text-slate-500">Submit the answer in the HRMS portal</p>
      </div>
    );

    if (s === "failed") return (
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <p className="text-base font-semibold text-red-400">Job failed</p>
        {jobStatus.errorMessage && (
          <p className="text-sm text-slate-300 leading-relaxed bg-slate-900 rounded-lg px-4 py-3 border border-red-900/50">
            {jobStatus.errorMessage}
          </p>
        )}
        <p className="text-xs text-slate-600">Retry the job in the HRMS portal → Automation Jobs → Failed tab</p>
      </div>
    );

    if (s === "completed") return (
      <div className="flex flex-col items-center gap-3">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <p className="text-base font-semibold text-green-400">Job completed successfully</p>
      </div>
    );

    if (s === "cancelled") return (
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Monitor className="h-12 w-12" />
        <p className="text-sm">Job was cancelled</p>
      </div>
    );

    return (
      <div className="flex flex-col items-center gap-2 text-slate-600">
        <Monitor className="h-12 w-12" />
        <p className="text-sm">Status: {s}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-200 font-medium">{label}</span>
          {jobStatus && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              jobStatus.status === "failed" ? "bg-red-900/50 text-red-400" :
              jobStatus.status === "completed" ? "bg-green-900/50 text-green-400" :
              jobStatus.status === "pending" ? "bg-yellow-900/50 text-yellow-400" :
              jobStatus.status === "running" ? "bg-blue-900/50 text-blue-400" :
              "bg-slate-800 text-slate-400"
            }`}>
              {jobStatus.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastTick && <span className="text-[11px] text-slate-500 font-mono">{lastTick}</span>}
          <div className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${statusDot}`} />
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${statusColor}`}>{statusLabel}</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-start justify-center p-4">
        {imgSrc ? (
          <div className="relative max-w-full">
            <img
              src={imgSrc}
              alt="Live browser view"
              className="max-w-full rounded shadow-2xl"
              style={{ imageRendering: "auto" }}
              onLoad={e => analyzeFrame(e.currentTarget)}
              onError={() => setIsBlank(true)}
            />
            {isBlank && (() => {
              const s = jobStatus?.status;
              const terminal = s === "completed" || s === "failed" || s === "cancelled";
              return (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded bg-slate-950/85 backdrop-blur-sm px-6 text-center">
                  {terminal ? (
                    <>
                      <Monitor className="h-10 w-10 text-slate-500" />
                      <p className="text-base font-semibold text-slate-300">No page preview captured</p>
                      <p className="text-sm text-slate-500">Open the Logs tab to see what the portal returned</p>
                    </>
                  ) : (
                    <>
                      <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
                      <p className="text-base font-semibold text-blue-300">Working… loading portal page</p>
                      <p className="text-sm text-slate-500">The page is still rendering — this updates automatically every second</p>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            {renderPlaceholder()}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
