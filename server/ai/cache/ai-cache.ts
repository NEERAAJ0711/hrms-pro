import { AI_CONFIG } from "../config";

// Simple in-memory TTL cache with recency-based eviction. Disabled by default
// (see AI_CONFIG.cache.enabled) so it never changes response behavior unless a
// caller opts in. The surface is deliberately small so a Redis-backed
// implementation can be swapped in later without touching call sites.

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class AiCache {
  private store = new Map<string, Entry<unknown>>();

  constructor(
    private ttlMs: number = AI_CONFIG.cache.ttlMs,
    private maxEntries: number = AI_CONFIG.cache.maxEntries,
  ) {}

  get<T>(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh recency (move to newest position).
    this.store.delete(key);
    this.store.set(key, e);
    return e.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number = this.ttlMs): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export const aiResponseCache = new AiCache();

export function isCacheEnabled(): boolean {
  return AI_CONFIG.cache.enabled;
}
