/**
 * BrowserPool — manages up to MAX_BROWSERS_PER_PORTAL concurrent Chromium
 * instances per portal. Browsers are kept alive between jobs to reuse OS
 * processes and skip re-login overhead. A crashed browser is replaced
 * automatically before the slot is returned to the pool.
 *
 * On NixOS (Replit), the Playwright-downloaded headless shell may be missing
 * system libraries (libgbm, libudev).  We prefer the NixOS-managed Chromium
 * binary (found via PATH) which self-wraps all its dependencies.
 */
import * as fs from "fs";
import { execSync } from "child_process";
import { chromium, type Browser } from "playwright";

const MAX_BROWSERS_PER_PORTAL = 3;
const PLAYWRIGHT_HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== "false";

/** Resolve the best available Chromium executable path at startup */
function resolveChromiumPath(): string | undefined {
  // 1. Explicit override always wins
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  // 2. Search PATH for any known Chrome/Chromium binary name
  const pathCandidates = [
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
    "google-chrome-beta",
  ];
  for (const candidate of pathCandidates) {
    try {
      const p = execSync(`which ${candidate}`, { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
      if (p) return p;
    } catch {
      // not on PATH — try next
    }
  }

  // 3. Check well-known absolute paths on Ubuntu/Debian/CentOS VPS servers
  const absoluteCandidates = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/local/bin/chromium",
    "/snap/bin/chromium",
    "/opt/google/chrome/chrome",
  ];
  for (const p of absoluteCandidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }

  // 4. Fall back to Playwright's own downloaded binary
  return undefined;
}

const CHROMIUM_EXECUTABLE = resolveChromiumPath();
// Log at startup so operators can immediately see whether a system browser was found
console.log(
  CHROMIUM_EXECUTABLE
    ? `[BrowserPool] Using system Chromium: ${CHROMIUM_EXECUTABLE}`
    : "[BrowserPool] No system Chromium found — will use Playwright's downloaded binary. " +
      "If it is missing, run: npx playwright install chromium"
);

interface PoolSlot {
  browser: Browser | null;
  inUse: boolean;
}

class BrowserPool {
  private pools: Map<string, PoolSlot[]> = new Map();
  // Queue of resolvers waiting for a free slot
  private waiters: Map<string, Array<() => void>> = new Map();

  private getPool(portal: string): PoolSlot[] {
    if (!this.pools.has(portal)) {
      const slots: PoolSlot[] = Array.from({ length: MAX_BROWSERS_PER_PORTAL }, () => ({
        browser: null,
        inUse: false,
      }));
      this.pools.set(portal, slots);
      this.waiters.set(portal, []);
    }
    return this.pools.get(portal)!;
  }

  /**
   * Acquire an available browser slot for the given portal.
   * If all slots are in use, waits until one is released.
   */
  async acquireBrowser(portal: string): Promise<Browser> {
    const pool = this.getPool(portal);
    const freeSlot = pool.find((s) => !s.inUse);

    if (freeSlot) {
      return this._claimSlot(freeSlot, portal);
    }

    // All slots busy — wait for one to free up
    await new Promise<void>((resolve) => {
      this.waiters.get(portal)!.push(resolve);
    });
    return this.acquireBrowser(portal);
  }

  /**
   * Release a browser back to the pool. Must be called after every
   * acquireBrowser(), even on error, to prevent deadlocks.
   */
  releaseBrowser(portal: string, browser: Browser): void {
    const pool = this.getPool(portal);
    const slot = pool.find((s) => s.browser === browser);
    if (slot) {
      slot.inUse = false;
    }
    // Wake up the first waiter, if any
    const queue = this.waiters.get(portal) ?? [];
    const next = queue.shift();
    if (next) next();
  }

  private async _claimSlot(slot: PoolSlot, portal: string): Promise<Browser> {
    slot.inUse = true;

    // Replace if crashed or not yet launched
    if (!slot.browser || !slot.browser.isConnected()) {
      if (slot.browser) {
        try { await slot.browser.close(); } catch { /* ignore */ }
        slot.browser = null;
      }
      try {
        // Race the launch against a 30s timeout so a hung Chromium never blocks the slot
        const launchPromise = chromium.launch({
          headless: PLAYWRIGHT_HEADLESS,
          executablePath: CHROMIUM_EXECUTABLE,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-extensions",
          ],
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Chromium launch timed out after 30s")), 30_000)
        );
        slot.browser = await Promise.race([launchPromise, timeoutPromise]);
      } catch (err) {
        // Free the slot so future jobs can try again instead of deadlocking
        slot.inUse = false;
        throw err;
      }
    }
    return slot.browser;
  }

  /** Close all browsers gracefully (call on server shutdown) */
  async closeAll(): Promise<void> {
    for (const pool of this.pools.values()) {
      for (const slot of pool) {
        if (slot.browser) {
          try { await slot.browser.close(); } catch { /* ignore */ }
          slot.browser = null;
        }
      }
    }
  }
}

export const browserPool = new BrowserPool();
