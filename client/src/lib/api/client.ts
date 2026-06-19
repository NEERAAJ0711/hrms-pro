import { apiRequest } from "@/lib/queryClient";

export { apiRequest };

/**
 * Throwing JSON fetch — mirrors the default TanStack queryFn semantics
 * (throws on non-OK responses). Use to replace inline `queryFn` calls that
 * threw on failure.
 */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message: string;
    try {
      const json = JSON.parse(text);
      message = json?.error || json?.message || text;
    } catch {
      message = text;
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

/**
 * Non-throwing JSON fetch — returns `fallback` when the response is not OK.
 * Mirrors the common inline pattern: `if (!res.ok) return []; return res.json();`
 * (network errors still reject, exactly like the original inline code).
 */
export async function fetchJsonOrEmpty<T>(url: string, fallback: T): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return fallback;
  return res.json() as Promise<T>;
}

/** Mutating request helper that returns parsed JSON. Throws on non-OK. */
export async function mutateJson<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiRequest(method, url, body);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
