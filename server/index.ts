import { readFileSync } from "fs";
import { join } from "path";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { registerRoutes } from "./routes";
import { setupBiometricSync } from "./biometric-sync";
import { startAdmsServer } from "./adms";
import { startBiometricAttendanceSync } from "./biometric-attendance-sync";
import { serveStatic } from "./static";
import { createServer } from "http";

// Load .env into process.env if DATABASE_URL is missing.
// Handles manual PM2 restarts where the shell didn't source .env first.
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
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch { /* no .env file, continue */ }
}

const app = express();
const httpServer = createServer(app);
const PgStore = connectPgSimple(session);

const sessionPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Biometric devices in ADMS push mode send tab-separated payloads with a
// non-JSON content type. Parse ALL known ADMS paths as plain text so those
// requests reach the handlers as a string instead of an empty body.
// Covers both /iclock/cdata and bare /cdata paths (device may use either).
const admsTextParser = express.text({ type: () => true, limit: "10mb" });
app.use("/iclock", admsTextParser);
app.use("/cdata", admsTextParser);
app.use("/getrequest", admsTextParser);
app.use("/devicecmd", admsTextParser);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.set("trust proxy", 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "hrms-dev-secret-key-2026",
    resave: false,
    saveUninitialized: false,
    store: new PgStore({
      pool: sessionPool,
      createTableIfMissing: true,
      tableName: "session",
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const { seedDefaultData } = await import("./seed");
  await seedDefaultData();

  // Auto-migration: ensure percentage columns are REAL (decimal) not INTEGER.
  // Runs on every startup; is a no-op when the column is already the right type.
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'earning_heads'
            AND column_name = 'percentage'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE earning_heads  ALTER COLUMN percentage TYPE real USING percentage::real;
          ALTER TABLE deduction_heads ALTER COLUMN percentage TYPE real USING percentage::real;
          RAISE NOTICE 'Migrated percentage columns from integer to real';
        END IF;
        -- Add custom_earnings JSON column to salary_structures if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'salary_structures' AND column_name = 'custom_earnings'
        ) THEN
          ALTER TABLE salary_structures ADD COLUMN custom_earnings json DEFAULT '{}';
        END IF;
        -- Add custom_deductions JSON column to salary_structures if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'salary_structures' AND column_name = 'custom_deductions'
        ) THEN
          ALTER TABLE salary_structures ADD COLUMN custom_deductions json DEFAULT '{}';
        END IF;
        -- Add custom_earnings JSON column to payroll if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'payroll' AND column_name = 'custom_earnings'
        ) THEN
          ALTER TABLE payroll ADD COLUMN custom_earnings json DEFAULT '{}';
        END IF;
        -- Add custom_deductions JSON column to payroll if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'payroll' AND column_name = 'custom_deductions'
        ) THEN
          ALTER TABLE payroll ADD COLUMN custom_deductions json DEFAULT '{}';
        END IF;
      END;
      $$
    `);
  } catch (migErr) {
    console.warn("[startup] percentage migration warning:", migErr);
  }

  // Preload face recognition models in background so first punch is fast
  import("./face-match").then(({ loadFaceModels }) => {
    loadFaceModels().catch((err) => console.warn("[face-match] Background model load failed:", err));
  });

  const httpServer = await registerRoutes(app);
  setupBiometricSync();
  startBiometricAttendanceSync();
  startAdmsServer();

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
