// ─── jsPDF font registration (kept for backward compat, not used for rendering) ───
let _cachedBase64: string | null = null;

export async function loadHindiFont(): Promise<string> {
  if (_cachedBase64) return _cachedBase64;
  const res = await fetch("/fonts/NotoSansDevanagari.ttf");
  if (!res.ok) throw new Error("Failed to load Devanagari font");
  const buf = await res.arrayBuffer();
  const uint8 = new Uint8Array(buf);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < uint8.length; i += chunk)
    binary += String.fromCharCode(...uint8.subarray(i, i + chunk));
  _cachedBase64 = btoa(binary);
  return _cachedBase64;
}

export function registerHindiFont(doc: any, base64: string): void {
  doc.addFileToVFS("NotoSansDevanagari.ttf", base64);
  doc.addFont("NotoSansDevanagari.ttf", "NotoSansDevanagari", "normal");
}

export const HI = "NotoSansDevanagari";
export const EN = "helvetica";

// ─── Canvas-based rendering (correct Devanagari shaping via browser engine) ────
const CANVAS_FAMILY = "NotoDevCanvas";
const SCALE = 2;           // 2× for print quality
const PX_PER_MM = 3.7795; // at 96 dpi

let _canvasFontLoaded = false;

export async function loadHindiFontForCanvas(): Promise<void> {
  if (_canvasFontLoaded) return;
  try {
    const ff = new FontFace(CANVAS_FAMILY, "url('/fonts/NotoSansDevanagari.ttf')");
    await ff.load();
    (document as any).fonts.add(ff);
    _canvasFontLoaded = true;
  } catch (e) {
    console.warn("[hindiFont] Canvas font load failed:", e);
  }
}

export interface HiTextOptions {
  fontSize?: number;       // pt  (default 10)
  maxWidthMM?: number;     // mm  (default 175)
  color?: [number, number, number];
  align?: "left" | "center" | "right";
  lineHeightFactor?: number; // multiplier on font px (default 1.5)
}

/**
 * Render a Hindi (Devanagari) string using the browser's text-shaping engine,
 * then embed the result as a PNG image in the jsPDF document.
 *
 * @param doc        jsPDF instance
 * @param text       Unicode Devanagari string
 * @param xMM        left edge of the image in mm
 * @param yTopMM     top edge of the image in mm
 * @param options    rendering options
 * @returns          bottom edge of the rendered image (yTopMM + imageHeightMM)
 */
export function addHindiText(
  doc: any,
  text: string,
  xMM: number,
  yTopMM: number,
  options: HiTextOptions = {}
): number {
  const {
    fontSize = 10,
    maxWidthMM = 175,
    color = [0, 0, 0],
    align = "left",
    lineHeightFactor = 1.5,
  } = options;

  const fontPx = fontSize * 1.334 * SCALE; // 1pt ≈ 1.334px at 96dpi
  const maxWidthPx = maxWidthMM * PX_PER_MM * SCALE;
  const lineHeightPx = fontPx * lineHeightFactor;
  const fontStr = `${fontPx}px ${CANVAS_FAMILY}, "Noto Sans Devanagari", "Arial Unicode MS", sans-serif`;

  // ── Word-wrap pass ──────────────────────────────────────────────────────────
  const mc = document.createElement("canvas");
  mc.width = Math.ceil(maxWidthPx) + 200;
  mc.height = 100;
  const mctx = mc.getContext("2d")!;
  mctx.font = fontStr;

  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (mctx.measureText(test).width > maxWidthPx && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  // ── Render pass ─────────────────────────────────────────────────────────────
  const canvasW = Math.ceil(maxWidthPx);
  const canvasH = Math.ceil(lines.length * lineHeightPx + fontPx * 0.5);
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;
  ctx.font = fontStr;
  ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
  ctx.textBaseline = "top";

  lines.forEach((l, i) => {
    let xPos = 0;
    const lw = ctx.measureText(l).width;
    if (align === "center") xPos = (canvasW - lw) / 2;
    else if (align === "right") xPos = canvasW - lw;
    ctx.fillText(l, xPos, i * lineHeightPx);
  });

  // ── Embed in PDF ─────────────────────────────────────────────────────────────
  const imgW = canvasW / PX_PER_MM / SCALE;
  const imgH = canvasH / PX_PER_MM / SCALE;
  doc.addImage(canvas.toDataURL("image/png"), "PNG", xMM, yTopMM, imgW, imgH);

  return yTopMM + imgH;
}
