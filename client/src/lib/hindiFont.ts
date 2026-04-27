let _cachedBase64: string | null = null;

export async function loadHindiFont(): Promise<string> {
  if (_cachedBase64) return _cachedBase64;
  const res = await fetch("/fonts/NotoSansDevanagari.ttf");
  if (!res.ok) throw new Error("Failed to load Devanagari font");
  const buf = await res.arrayBuffer();
  const uint8 = new Uint8Array(buf);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < uint8.length; i += chunk) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunk));
  }
  _cachedBase64 = btoa(binary);
  return _cachedBase64;
}

export function registerHindiFont(doc: any, base64: string): void {
  doc.addFileToVFS("NotoSansDevanagari.ttf", base64);
  doc.addFont("NotoSansDevanagari.ttf", "NotoSansDevanagari", "normal");
}

export const HI = "NotoSansDevanagari";
export const EN = "helvetica";
