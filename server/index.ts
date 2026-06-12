import { readFileSync } from "fs";
import { join } from "path";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { registerRoutes } from "./routes";
import { setupBiometricSync } from "./biometric-sync";
import { startAdmsServer, registerAdmsRoutes } from "./adms";
import { startBiometricAttendanceSync } from "./biometric-attendance-sync";
import { serveStatic } from "./static";
import { createServer } from "http";

// Always load .env from disk, merging into process.env without overwriting
// vars already set by PM2's --update-env or the shell. This ensures
// GIT_COMMIT and BUILD_TIME are always available regardless of how PM2
// passes (or doesn't pass) those variables to the process.
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

// Register ADMS routes on the main app as well as the dedicated port-8181 server.
// This is critical for deployments behind a reverse proxy (Nginx, Cloudflare, etc.)
// where only the main port is forwarded — devices can then reach /iclock/cdata
// through the standard HTTPS port without needing direct access to port 8181.
registerAdmsRoutes(app);

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
  // Auto-migration MUST run before seed so any new columns exist before Drizzle queries them.
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
        -- Add contractor_master_id to employees if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'employees' AND column_name = 'contractor_master_id'
        ) THEN
          ALTER TABLE employees ADD COLUMN contractor_master_id varchar(36);
        END IF;
        -- Create contractor_masters table if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'contractor_masters'
        ) THEN
          CREATE TABLE contractor_masters (
            id varchar(36) PRIMARY KEY,
            company_id varchar(36) NOT NULL,
            contractor_name varchar(255) NOT NULL,
            contractor_address text,
            service_charge_percent real DEFAULT 0,
            applicable_compliances text[] DEFAULT '{}',
            status varchar(20) DEFAULT 'active'
          );
        END IF;
        -- Add access_departments column to users if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'access_departments'
        ) THEN
          ALTER TABLE users ADD COLUMN access_departments text[];
        END IF;
        -- Add access_locations column to users if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'access_locations'
        ) THEN
          ALTER TABLE users ADD COLUMN access_locations text[];
        END IF;
        -- Add access_contractors column to users if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'access_contractors'
        ) THEN
          ALTER TABLE users ADD COLUMN access_contractors text[];
        END IF;
        -- Add vpf_amount column to salary_structures if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'salary_structures' AND column_name = 'vpf_amount'
        ) THEN
          ALTER TABLE salary_structures ADD COLUMN vpf_amount integer DEFAULT 0;
        END IF;
        -- Add vpf_amount column to payroll if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'payroll' AND column_name = 'vpf_amount'
        ) THEN
          ALTER TABLE payroll ADD COLUMN vpf_amount integer DEFAULT 0;
        END IF;
        -- Create esic_fetched_employees table if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'esic_fetched_employees'
        ) THEN
          CREATE TABLE esic_fetched_employees (
            id varchar(36) PRIMARY KEY,
            company_id varchar(36) NOT NULL,
            ip_no text NOT NULL,
            name text NOT NULL,
            date_of_registration text,
            job_id varchar(36),
            fetched_at text NOT NULL,
            created_at text NOT NULL
          );
          CREATE INDEX ON esic_fetched_employees (company_id);
        END IF;
        -- Add leave_type_code column to attendance if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'attendance' AND column_name = 'leave_type_code'
        ) THEN
          ALTER TABLE attendance ADD COLUMN leave_type_code text;
        END IF;
        -- Add clock-out tracking columns to attendance if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'attendance' AND column_name = 'clock_out_latitude'
        ) THEN
          ALTER TABLE attendance ADD COLUMN clock_out_latitude text;
          ALTER TABLE attendance ADD COLUMN clock_out_longitude text;
          ALTER TABLE attendance ADD COLUMN clock_out_location_accuracy text;
          ALTER TABLE attendance ADD COLUMN clock_out_face_image_path text;
          ALTER TABLE attendance ADD COLUMN clock_out_face_verified boolean DEFAULT false;
          ALTER TABLE attendance ADD COLUMN clock_out_method text;
        END IF;

        -- Add day_type column to leave_requests if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'leave_requests' AND column_name = 'day_type'
        ) THEN
          ALTER TABLE leave_requests ADD COLUMN day_type text NOT NULL DEFAULT 'full_day';
        END IF;

        -- Add newer company columns if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'companies' AND column_name = 'office_latitude'
        ) THEN
          ALTER TABLE companies ADD COLUMN office_latitude text;
          ALTER TABLE companies ADD COLUMN office_longitude text;
          ALTER TABLE companies ADD COLUMN office_radius_meters integer DEFAULT 100;
          ALTER TABLE companies ADD COLUMN face_verification_enabled boolean DEFAULT true;
          ALTER TABLE companies ADD COLUMN gps_verification_enabled boolean DEFAULT true;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'companies' AND column_name = 'is_contractor'
        ) THEN
          ALTER TABLE companies ADD COLUMN is_contractor boolean DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'companies' AND column_name = 'trial_start_date'
        ) THEN
          ALTER TABLE companies ADD COLUMN trial_start_date text;
          ALTER TABLE companies ADD COLUMN trial_days integer DEFAULT 3;
          ALTER TABLE companies ADD COLUMN trial_extended_days integer DEFAULT 0;
        END IF;

        -- Add newer employee columns if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'employees' AND column_name = 'biometric_device_id'
        ) THEN
          ALTER TABLE employees ADD COLUMN biometric_device_id text;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'employees' AND column_name = 'wage_grade_id'
        ) THEN
          ALTER TABLE employees ADD COLUMN wage_grade_id varchar(36);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'employees' AND column_name = 'registered_face_image'
        ) THEN
          ALTER TABLE employees ADD COLUMN registered_face_image text;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'employees' AND column_name = 'father_husband_name'
        ) THEN
          ALTER TABLE employees ADD COLUMN father_husband_name text;
          ALTER TABLE employees ADD COLUMN present_address text;
          ALTER TABLE employees ADD COLUMN present_state text;
          ALTER TABLE employees ADD COLUMN present_district text;
          ALTER TABLE employees ADD COLUMN present_pincode text;
          ALTER TABLE employees ADD COLUMN permanent_address text;
          ALTER TABLE employees ADD COLUMN permanent_state text;
          ALTER TABLE employees ADD COLUMN permanent_district text;
          ALTER TABLE employees ADD COLUMN permanent_pincode text;
          ALTER TABLE employees ADD COLUMN address text;
          ALTER TABLE employees ADD COLUMN address_state text;
          ALTER TABLE employees ADD COLUMN address_district text;
        END IF;

        -- Add newer statutory_settings columns if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'statutory_settings' AND column_name = 'esic_calc_on_gross'
        ) THEN
          ALTER TABLE statutory_settings ADD COLUMN esic_calc_on_gross boolean DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'statutory_settings' AND column_name = 'lwf_employee_percent'
        ) THEN
          ALTER TABLE statutory_settings ADD COLUMN lwf_employee_percent integer DEFAULT 20;
          ALTER TABLE statutory_settings ADD COLUMN lwf_employer_percent integer DEFAULT 40;
          ALTER TABLE statutory_settings ADD COLUMN lwf_employee_max_cap integer DEFAULT 34;
          ALTER TABLE statutory_settings ADD COLUMN lwf_employer_max_cap integer DEFAULT 68;
          ALTER TABLE statutory_settings ADD COLUMN lwf_calculation_base text DEFAULT 'gross';
          ALTER TABLE statutory_settings ADD COLUMN lwf_enabled boolean DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'statutory_settings' AND column_name = 'bonus_percent'
        ) THEN
          ALTER TABLE statutory_settings ADD COLUMN bonus_percent integer DEFAULT 833;
          ALTER TABLE statutory_settings ADD COLUMN bonus_calculation_base text DEFAULT 'basic';
          ALTER TABLE statutory_settings ADD COLUMN bonus_max_ceiling integer DEFAULT 7000;
          ALTER TABLE statutory_settings ADD COLUMN bonus_min_percent integer DEFAULT 833;
          ALTER TABLE statutory_settings ADD COLUMN bonus_max_percent integer DEFAULT 2000;
          ALTER TABLE statutory_settings ADD COLUMN bonus_enabled boolean DEFAULT true;
          ALTER TABLE statutory_settings ADD COLUMN bonus_skip_ceiling boolean DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'statutory_settings' AND column_name = 'pt_state'
        ) THEN
          ALTER TABLE statutory_settings ADD COLUMN pt_state text;
        END IF;

        -- Ensure biometric_devices table exists
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'biometric_devices'
        ) THEN
          CREATE TABLE biometric_devices (
            id varchar(36) PRIMARY KEY,
            company_id varchar(36),
            name text NOT NULL,
            code text,
            device_serial text NOT NULL,
            ip_address text,
            adms_server_ip text,
            port integer DEFAULT 8181,
            status text NOT NULL DEFAULT 'offline',
            last_sync text,
            created_at text,
            last_push_at text,
            last_push_ip text,
            firmware_version text,
            push_total integer NOT NULL DEFAULT 0,
            push_token text,
            allowed_ip_cidr text,
            last_attlog_stamp integer NOT NULL DEFAULT 0,
            pending_commands json DEFAULT '[]',
            auto_delete_punches boolean NOT NULL DEFAULT false,
            device_model text DEFAULT 'zkteco'
          );
        END IF;

        -- Add newer biometric_devices columns if missing (for older table)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'biometric_devices' AND column_name = 'device_model'
        ) THEN
          ALTER TABLE biometric_devices ADD COLUMN device_model text DEFAULT 'zkteco';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'biometric_devices' AND column_name = 'push_token'
        ) THEN
          ALTER TABLE biometric_devices ADD COLUMN push_token text;
          ALTER TABLE biometric_devices ADD COLUMN allowed_ip_cidr text;
          ALTER TABLE biometric_devices ADD COLUMN last_attlog_stamp integer NOT NULL DEFAULT 0;
          ALTER TABLE biometric_devices ADD COLUMN pending_commands json DEFAULT '[]';
          ALTER TABLE biometric_devices ADD COLUMN auto_delete_punches boolean NOT NULL DEFAULT false;
        END IF;

        -- Ensure biometric_punch_logs table exists
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'biometric_punch_logs'
        ) THEN
          CREATE TABLE biometric_punch_logs (
            id varchar(36) PRIMARY KEY,
            company_id varchar(36) NOT NULL,
            employee_id varchar(36),
            device_employee_id text NOT NULL,
            punch_time text NOT NULL,
            punch_date text NOT NULL,
            punch_type text DEFAULT 'unknown',
            punch_type_override boolean DEFAULT false,
            device_id text,
            is_processed boolean DEFAULT false,
            is_duplicate boolean DEFAULT false,
            missing_punch boolean DEFAULT false,
            synced_at text,
            created_at text,
            verify_mode text
          );
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'biometric_punch_logs' AND column_name = 'verify_mode'
        ) THEN
          ALTER TABLE biometric_punch_logs ADD COLUMN verify_mode text;
        END IF;

        -- Ensure biometric_device_users table exists
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'biometric_device_users'
        ) THEN
          CREATE TABLE biometric_device_users (
            id varchar(36) PRIMARY KEY,
            device_id varchar(36) NOT NULL,
            device_employee_id text NOT NULL,
            name text,
            privilege text,
            card text,
            password_set boolean DEFAULT false,
            fingerprint_count integer DEFAULT 0,
            face_count integer DEFAULT 0,
            first_seen_at text,
            last_seen_at text
          );
        END IF;

        -- Ensure adms_activity_log table exists
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'adms_activity_log'
        ) THEN
          CREATE TABLE adms_activity_log (
            id bigserial PRIMARY KEY,
            device_sn text NOT NULL,
            direction text NOT NULL,
            message text NOT NULL,
            created_at timestamptz DEFAULT now()
          );
        END IF;

        -- Ensure wage_grades table exists
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'wage_grades'
        ) THEN
          CREATE TABLE wage_grades (
            id varchar(36) PRIMARY KEY,
            company_id varchar(36) NOT NULL,
            name text NOT NULL,
            code text,
            minimum_wage integer NOT NULL,
            period text,
            effective_from text,
            effective_to text,
            state text,
            description text,
            status text NOT NULL DEFAULT 'active'
          );
        END IF;

        -- Ensure contractor_masters table exists
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'contractor_masters'
        ) THEN
          CREATE TABLE contractor_masters (
            id varchar(36) PRIMARY KEY,
            company_id varchar(36) NOT NULL,
            name text NOT NULL,
            code text,
            contact_person text,
            mobile text,
            email text,
            address text,
            status text NOT NULL DEFAULT 'active'
          );
        END IF;

        -- Add payroll.pay_days if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'payroll' AND column_name = 'pay_days'
        ) THEN
          ALTER TABLE payroll ADD COLUMN pay_days numeric(6,1) DEFAULT 0;
        END IF;

        -- Add payroll.loan_deduction if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'payroll' AND column_name = 'loan_deduction'
        ) THEN
          ALTER TABLE payroll ADD COLUMN loan_deduction integer DEFAULT 0;
        END IF;

        -- Add payroll.ot_amount if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'payroll' AND column_name = 'ot_amount'
        ) THEN
          ALTER TABLE payroll ADD COLUMN ot_amount integer DEFAULT 0;
        END IF;

        -- Add payroll.bonus if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'payroll' AND column_name = 'bonus'
        ) THEN
          ALTER TABLE payroll ADD COLUMN bonus integer DEFAULT 0;
        END IF;

        -- Add time_office_policies.allow_auto_attend if missing
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_office_policies' AND column_name = 'allow_auto_attend'
        ) THEN
          ALTER TABLE time_office_policies ADD COLUMN allow_auto_attend boolean DEFAULT false;
          ALTER TABLE time_office_policies ADD COLUMN present_marking_duration integer DEFAULT 480;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_office_policies' AND column_name = 'is_default'
        ) THEN
          ALTER TABLE time_office_policies ADD COLUMN is_default boolean DEFAULT false;
        END IF;
      END;
      $$
    `);
  } catch (migErr) {
    console.warn("[startup] percentage migration warning:", migErr);
  }

  // Seed default data AFTER migrations so all columns exist before Drizzle queries the DB.
  const { seedDefaultData } = await import("./seed");
  await seedDefaultData();

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
