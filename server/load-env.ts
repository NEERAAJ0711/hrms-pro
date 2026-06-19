// Load .env from disk into process.env BEFORE any other module is evaluated.
//
// This module must be imported first in the entrypoint (server/index.ts) so the
// .env file is parsed before transitively-imported modules (e.g. ./jwt-auth)
// read secrets at import time. ES module imports are hoisted and executed in
// import order, so placing `import "./load-env"` first guarantees this runs
// before routes/jwt-auth are evaluated.
//
// Values already present in process.env (set by PM2 --update-env or the shell)
// are NOT overwritten — the .env file only fills in what's missing.
import { readFileSync } from "fs";
import { join } from "path";

try {
  const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
    if (process.env[key]) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
} catch { /* no .env file — dev environment or first boot, continue */ }
