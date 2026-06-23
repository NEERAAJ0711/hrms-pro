// Lightweight structured logger for the AI module. Preserves the existing
// "[scope] ..." console style so any log scraping keeps working, while adding a
// single choke-point that masks anything resembling an API key before it is
// printed. New AI code should log through here.

const SECRET_RE = /\b(sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{8,})\b/g;

export function maskSecrets(text: string): string {
  return text.replace(SECRET_RE, (m) => `${m.slice(0, 4)}…${m.slice(-2)}`);
}

function fmt(scope: string, msg: string): string {
  return `[${scope}] ${maskSecrets(msg)}`;
}

export const aiLogger = {
  info(scope: string, msg: string): void {
    console.log(fmt(scope, msg));
  },
  warn(scope: string, msg: string): void {
    console.warn(fmt(scope, msg));
  },
  error(scope: string, msg: string, err?: unknown): void {
    const detail = err instanceof Error ? err.message : err ? String(err) : "";
    console.error(fmt(scope, detail ? `${msg}: ${detail}` : msg));
  },
};
