// OpenAI client management — lazily constructed. The key can come from the
// environment (OPENAI_API_KEY) or an admin-saved override (Settings → API Keys),
// loaded into memory at startup by the provider manager.

let _openai: any = null;
let _openaiKeyOverride: string | null = null;

export function setOpenAIKeyOverride(key: string | null): void {
  _openaiKeyOverride = key || null;
  _openai = null;
}

export function getOpenAIKeyOverride(): string | null {
  return _openaiKeyOverride;
}

export function getOpenAI(): any | null {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY || _openaiKeyOverride;
  if (!key) return null;
  try {
    const { default: OpenAI } = require("openai");
    _openai = new OpenAI({ apiKey: key });
    return _openai;
  } catch {
    return null;
  }
}
