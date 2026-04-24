import { readFileSync } from "fs";
import { join } from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

// Load .env here — in the compiled CJS bundle, db.ts initialises before
// index.ts body runs, so the .env loading in index.ts arrives too late.
// Doing it here guarantees DATABASE_URL is set before we check it.
if (!process.env.DATABASE_URL) {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
      if (process.env[key]) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    /* no .env file — rely on shell environment */
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
