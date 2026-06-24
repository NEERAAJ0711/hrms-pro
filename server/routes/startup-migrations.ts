// HRMS Pro — idempotent startup schema migrations (run once at boot)
import { db } from "../db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function runStartupMigrations(): Promise<void> {

  // Add OT columns to payroll table if they don't exist
  await db.execute(sql`ALTER TABLE payroll ADD COLUMN IF NOT EXISTS ot_hours NUMERIC(6,2) DEFAULT 0`).catch(() => {});
  await db.execute(sql`ALTER TABLE payroll ADD COLUMN IF NOT EXISTS ot_amount INTEGER DEFAULT 0`).catch(() => {});

  // Per-action access requests: optional array of actions requested within a
  // module (e.g. ["create","edit"]). NULL = full-module ("Select All") request.
  await db.execute(sql`ALTER TABLE module_access_requests ADD COLUMN IF NOT EXISTS actions text[]`).catch(() => {});

  // Mirror of migrations/007: short, friendly machine code shown in the
  // device list and used when assigning an employee to a specific machine.
  await db.execute(sql`ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS code TEXT`).catch(() => {});

  // Mirror of migrations/006: prevent duplicate biometric punches at the
  // DB level so two concurrent ADMS pushes can't sneak past the
  // application-level dedupe check.
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'biometric_punch_logs_dedup_unique'
      ) THEN
        DELETE FROM biometric_punch_logs a
        USING biometric_punch_logs b
        WHERE a.ctid < b.ctid
          AND a.company_id          = b.company_id
          AND COALESCE(a.device_id, '')   = COALESCE(b.device_id, '')
          AND COALESCE(a.employee_id, '') = COALESCE(b.employee_id, '')
          AND a.device_employee_id  = b.device_employee_id
          AND a.punch_date          = b.punch_date
          AND a.punch_time          = b.punch_time
          AND COALESCE(a.punch_type, '')  = COALESCE(b.punch_type, '');

        CREATE UNIQUE INDEX biometric_punch_logs_dedup_unique
          ON biometric_punch_logs (
            company_id,
            (COALESCE(device_id, '')),
            (COALESCE(employee_id, '')),
            device_employee_id,
            punch_date,
            punch_time,
            (COALESCE(punch_type, ''))
          );
      END IF;
    END $$;
  `).catch((err) => {
    console.error("[migrations] biometric_punch_logs_dedup_unique failed:", err);
  });

  // punch_type_override flag — lets admins manually correct in/out type
  // without the auto-classifier overwriting their change on the next sync.
  await db.execute(sql`
    ALTER TABLE biometric_punch_logs ADD COLUMN IF NOT EXISTS punch_type_override boolean NOT NULL DEFAULT false;
  `).catch((err) => console.error("[migrations] add punch_type_override failed:", err));

  // Mirror of migrations/007: per-device ADMS auth (shared secret OR pinned
  // source CIDR). Backfills existing devices to their last-seen push IP so
  // the deployed device keeps working without manual reconfiguration.
  await db.execute(sql`
    ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS push_token text;
  `).catch((err) => console.error("[migrations] add push_token failed:", err));
  await db.execute(sql`
    ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS allowed_ip_cidr text;
  `).catch((err) => console.error("[migrations] add allowed_ip_cidr failed:", err));
  // NOTE: The old backfill that set allowed_ip_cidr = last_push_ip/32 has been
  // intentionally removed. Locking devices to a /32 CIDR by default causes
  // silent auth failures when the device's public IP changes (e.g. DHCP/NAT).
  // Devices remain in open mode (pushToken=null, allowedIpCidr=null) unless
  // an admin explicitly configures auth in the Biometric Devices UI.
  // Reset any accidentally-backfilled CIDR locks back to open mode:
  await db.execute(sql`
    UPDATE biometric_devices
       SET allowed_ip_cidr = NULL
     WHERE push_token IS NULL
       AND allowed_ip_cidr IS NOT NULL
       AND allowed_ip_cidr LIKE '%.%.%.%/32';
  `).catch((err) => console.error("[migrations] clear backfilled allowed_ip_cidr failed:", err));

  // One-shot backfill: redirect existing payslip notifications away from
  // the admin-only /payroll page to the employee Payslips tab.
  await db.execute(sql`
    UPDATE notifications
       SET link = '/loan-advances?tab=payslips'
     WHERE type IN ('payroll_processed', 'payroll_paid')
       AND (link = '/payroll' OR link = '/loan-advances')
  `).catch((err) => console.error("[migrations] backfill payslip notification link failed:", err));

  // Startup migration for module_access_requests — users requesting HR
  // module access; admins approve/deny which upserts user_permissions.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS module_access_requests (
      id            VARCHAR(36) PRIMARY KEY,
      user_id       VARCHAR(36) NOT NULL,
      company_id    VARCHAR(36),
      module        TEXT        NOT NULL,
      status        TEXT        NOT NULL DEFAULT 'pending',
      reason        TEXT,
      decision_note TEXT,
      decided_by    VARCHAR(36),
      decided_at    TEXT,
      created_at    TEXT        NOT NULL
    )
  `).catch((err) => console.error("[migrations] create module_access_requests failed:", err));
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS module_access_requests_user_idx
      ON module_access_requests (user_id)
  `).catch((err) => console.error("[migrations] module_access_requests_user_idx failed:", err));
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS module_access_requests_company_status_idx
      ON module_access_requests (company_id, status)
  `).catch((err) => console.error("[migrations] module_access_requests_company_status_idx failed:", err));

  // Mirror of migrations/008: per-device enrolled-user roster, populated
  // from USERINFO/USER records pushed via ADMS. Powers the View Users
  // dialog so even employees who haven't punched yet appear.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS biometric_device_users (
      id                 VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      device_id          VARCHAR(36) NOT NULL,
      device_employee_id TEXT        NOT NULL,
      name               TEXT,
      privilege          TEXT,
      card               TEXT,
      password_set       BOOLEAN     DEFAULT false,
      fingerprint_count  INTEGER     DEFAULT 0,
      first_seen_at      TEXT,
      last_seen_at       TEXT
    )
  `).catch((err) => console.error("[migrations] create biometric_device_users failed:", err));
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS biometric_device_users_unique
      ON biometric_device_users (device_id, device_employee_id)
  `).catch((err) => console.error("[migrations] biometric_device_users_unique failed:", err));

  // Mirror of migrations/009: per-company wage grades + employee tag column.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wage_grades (
      id           VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      company_id   VARCHAR(36) NOT NULL,
      name         TEXT        NOT NULL,
      code         TEXT,
      minimum_wage INTEGER     NOT NULL,
      description  TEXT,
      status       TEXT        NOT NULL DEFAULT 'active'
    )
  `).catch((err) => console.error("[migrations] create wage_grades failed:", err));
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS wage_grades_company_idx ON wage_grades (company_id)
  `).catch(() => {});
  await db.execute(sql`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS wage_grade_id VARCHAR(36)
  `).catch((err) => console.error("[migrations] add employees.wage_grade_id failed:", err));
  await db.execute(sql`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS ot_applicable BOOLEAN DEFAULT false
  `).catch((err) => console.error("[migrations] add employees.ot_applicable failed:", err));
  await db.execute(sql`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS ot_rate TEXT DEFAULT '2x'
  `).catch((err) => console.error("[migrations] add employees.ot_rate failed:", err));
  await db.execute(sql`
    ALTER TABLE wage_grades ADD COLUMN IF NOT EXISTS period TEXT
  `).catch((err) => console.error("[migrations] add wage_grades.period failed:", err));
  await db.execute(sql`
    ALTER TABLE wage_grades ADD COLUMN IF NOT EXISTS effective_from TEXT
  `).catch((err) => console.error("[migrations] add wage_grades.effective_from failed:", err));
  await db.execute(sql`
    ALTER TABLE wage_grades ADD COLUMN IF NOT EXISTS state TEXT
  `).catch((err) => console.error("[migrations] add wage_grades.state failed:", err));
  await db.execute(sql`
    ALTER TABLE wage_grades ADD COLUMN IF NOT EXISTS effective_to TEXT
  `).catch((err) => console.error("[migrations] add wage_grades.effective_to failed:", err));

  // Mirror of migrations/010: pending command queue persisted in DB so commands
  // survive server restarts. Used by ADMS /getrequest handler.
  await db.execute(sql`
    ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS pending_commands JSONB DEFAULT '[]'::jsonb
  `).catch((err) => console.error("[migrations] add pending_commands failed:", err));

  // migrations/012: store the ADMS server IP per device so it is part of
  // the device record rather than derived at runtime from network-info.
  await db.execute(sql`
    ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS adms_server_ip text
  `).catch((err) => console.error("[migrations] add adms_server_ip failed:", err));

  // Auto-delete: when enabled the server queues DATA CLEAR ATTLOG after every
  // successful ATTLOG upload, keeping the device memory from filling up.
  await db.execute(sql`
    ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS auto_delete_punches boolean NOT NULL DEFAULT false
  `).catch((err) => console.error("[migrations] add auto_delete_punches failed:", err));

  // ESSL AirFace-Orcus support: track which machine model a device is.
  // "zkteco" covers all ZKTeco devices; "essl_airface" = AirFace-Orcus series.
  await db.execute(sql`
    ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS device_model text DEFAULT 'zkteco'
  `).catch((err) => console.error("[migrations] add device_model failed:", err));

  // Verify-mode: record HOW identity was confirmed on the device
  // (face, fingerprint, card, password, palm) — populated by the ADMS engine.
  await db.execute(sql`
    ALTER TABLE biometric_punch_logs ADD COLUMN IF NOT EXISTS verify_mode text
  `).catch((err) => console.error("[migrations] add verify_mode failed:", err));

  // Face-count: number of face templates enrolled per user on an AirFace device
  // (populated from FacePic= / FaceNum= fields in the USERINFO push).
  await db.execute(sql`
    ALTER TABLE biometric_device_users ADD COLUMN IF NOT EXISTS face_count integer DEFAULT 0
  `).catch((err) => console.error("[migrations] add face_count failed:", err));

  // Mirror of migrations/011: persistent ADMS activity log — survives server
  // restarts, powers the live activity feed in the Biometric Integration UI.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS adms_activity_log (
      id         BIGSERIAL    PRIMARY KEY,
      device_sn  TEXT         NOT NULL,
      direction  TEXT         NOT NULL,
      message    TEXT         NOT NULL,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `).catch((err) => console.error("[migrations] create adms_activity_log failed:", err));
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS adms_activity_log_sn_idx ON adms_activity_log (device_sn, id DESC)
  `).catch(() => {});

  // Tracking table for rows healed by the placeholder weekend/holiday backfill.
  // Drives the comp-off / OT recompute sweep so it only acts on (employee, date)
  // pairs that were actually corrected from "00:00" placeholder data — never on
  // rows that always had real punches.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS placeholder_backfill_heals (
      employee_id              VARCHAR(36) NOT NULL,
      worked_date              TEXT        NOT NULL,
      company_id               VARCHAR(36) NOT NULL,
      healed_at                TEXT        NOT NULL,
      comp_off_recomputed_at   TEXT,
      PRIMARY KEY (employee_id, worked_date)
    )
  `).catch((err) => console.error("[migrations] create placeholder_backfill_heals failed:", err));

  // Trial columns for companies (free trial — 3 days for all companies)
  await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_start_date TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 3`).catch(() => {});
  await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_extended_days INTEGER NOT NULL DEFAULT 0`).catch(() => {});

  // Ensure one daily-billing entry per company per day (enables ON CONFLICT dedupe).
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS daily_billing_logs_company_id_date_unique ON daily_billing_logs (company_id, date)`).catch(() => {});
  // Backfill: any company without a trial_start_date gets today as their trial start
  // trial_days stays 3 (default) — billing kicks in after 3 days from today
  await db.execute(sql`
    UPDATE companies
    SET trial_start_date = TO_CHAR(NOW(), 'YYYY-MM-DD'),
        trial_days = 3,
        trial_extended_days = 0
    WHERE trial_start_date IS NULL OR trial_start_date = ''
  `).catch(() => {});

  // Logo & signature columns for companies
  await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS signature TEXT`).catch(() => {});

  // CD Accounts (Credits & Billing)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cd_accounts (
      id VARCHAR(36) PRIMARY KEY,
      company_id VARCHAR(36) NOT NULL UNIQUE,
      credit_balance NUMERIC(14,4) NOT NULL DEFAULT 0,
      cost_per_employee_per_day NUMERIC(10,4) NOT NULL DEFAULT 15,
      rate_effective_from TEXT,
      low_balance_threshold NUMERIC(14,4) NOT NULL DEFAULT 1000,
      allow_negative BOOLEAN NOT NULL DEFAULT false,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).catch(() => {});
  await db.execute(sql`ALTER TABLE cd_accounts ADD COLUMN IF NOT EXISTS allow_negative BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
  await db.execute(sql`ALTER TABLE cd_accounts ADD COLUMN IF NOT EXISTS rate_effective_from TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE cd_accounts ALTER COLUMN cost_per_employee_per_day SET DEFAULT 15`).catch(() => {});
  await db.execute(sql`ALTER TABLE cd_accounts ALTER COLUMN low_balance_threshold SET DEFAULT 1000`).catch(() => {});

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cd_transactions (
      id VARCHAR(36) PRIMARY KEY,
      company_id VARCHAR(36) NOT NULL,
      type TEXT NOT NULL,
      amount NUMERIC(14,4) NOT NULL,
      balance_after NUMERIC(14,4) NOT NULL,
      description TEXT NOT NULL,
      reference_no TEXT,
      created_by VARCHAR(36),
      created_at TEXT NOT NULL
    )
  `).catch(() => {});

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS cd_transactions_company_idx ON cd_transactions (company_id, created_at DESC)
  `).catch(() => {});

  // Invoices table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR(36) PRIMARY KEY,
      invoice_no TEXT NOT NULL UNIQUE,
      company_id VARCHAR(36) NOT NULL,
      period_month TEXT NOT NULL,
      period_from TEXT NOT NULL,
      period_to TEXT NOT NULL,
      employee_count INTEGER NOT NULL DEFAULT 0,
      rate_per_day NUMERIC(10,4) NOT NULL,
      days_in_period INTEGER NOT NULL,
      total_amount NUMERIC(14,4) NOT NULL,
      status TEXT NOT NULL DEFAULT 'credited',
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS invoices_company_period_idx ON invoices (company_id, period_month DESC)
  `).catch(() => {});

  // Daily billing logs table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS daily_billing_logs (
      id VARCHAR(36) PRIMARY KEY,
      company_id VARCHAR(36) NOT NULL,
      date TEXT NOT NULL,
      employee_count INTEGER NOT NULL DEFAULT 0,
      rate_per_day NUMERIC(10,4) NOT NULL,
      amount NUMERIC(14,4) NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(company_id, date)
    )
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS daily_billing_logs_company_date_idx ON daily_billing_logs (company_id, date DESC)
  `).catch(() => {});

  // Add statutory profile fields (nominee, marital status, mother's name,
  // emergency contact, blood group) for ESIC/EPFO so the AI HR assistant can save them
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS marital_status TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS mother_name TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS blood_group TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS nominee_name TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS nominee_relation TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_number TEXT`).catch(() => {});

  // Create employee_documents table if not exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id          VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      employee_id VARCHAR(36) NOT NULL,
      company_id  VARCHAR(36) NOT NULL,
      doc_type    TEXT        NOT NULL,
      file_name   TEXT        NOT NULL,
      file_path   TEXT        NOT NULL,
      file_size   INTEGER,
      mime_type   TEXT,
      created_by  VARCHAR(36),
      created_at  TEXT        NOT NULL,
      updated_at  TEXT        NOT NULL
    )
  `).catch(() => {});

  // Mirror of migrations/022: AI usage/observability log. Additive, no foreign
  // keys — written best-effort by the AI metrics recorder so reporting works
  // without coupling to other tables' lifecycles.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id                 VARCHAR(36)   PRIMARY KEY,
      company_id         VARCHAR(36),
      employee_id        VARCHAR(36),
      feature            TEXT          NOT NULL,
      provider           TEXT          NOT NULL,
      model              TEXT,
      prompt_tokens      INTEGER       NOT NULL DEFAULT 0,
      completion_tokens  INTEGER       NOT NULL DEFAULT 0,
      total_tokens       INTEGER       NOT NULL DEFAULT 0,
      estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
      latency_ms         INTEGER       NOT NULL DEFAULT 0,
      success            BOOLEAN       NOT NULL DEFAULT true,
      error              TEXT,
      created_at         TEXT          NOT NULL
    )
  `).catch((err) => console.error("[migrations] create ai_usage_logs failed:", err));
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ai_usage_logs_company_created_idx
      ON ai_usage_logs (company_id, created_at DESC)
  `).catch(() => {});
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ai_usage_logs_feature_idx
      ON ai_usage_logs (feature, created_at DESC)
  `).catch(() => {});

  // Mirror of migrations/023: Phase-2 AI-assistant action audit columns.
  // Additive & nullable so existing usage rows and best-effort recording keep
  // working; lets the AI layer log user/intent/module/action per action.
  await db.execute(sql`ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)`).catch(() => {});
  await db.execute(sql`ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS intent TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS module TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS action TEXT`).catch(() => {});

  // Mirror of migrations/024: Phase-3 Recruitment AI columns. Additive & nullable
  // so existing recruitment rows/endpoints keep working; hold parsed resume data
  // and AI results (score, breakdown, summary, interview questions, dedupe link).
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS resume_text TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS parsed_resume JSONB`).catch(() => {});
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_score INTEGER`).catch(() => {});
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_score_breakdown JSONB`).catch(() => {});
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_scored_job_id VARCHAR(36)`).catch(() => {});
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_scored_at TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_summary TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS ai_questions JSONB`).catch(() => {});
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS duplicate_of VARCHAR(36)`).catch(() => {});
  await db.execute(sql`ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS resume_text TEXT`).catch(() => {});
  await db.execute(sql`ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS parsed_resume JSONB`).catch(() => {});
  await db.execute(sql`ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS ai_summary TEXT`).catch(() => {});

  // Mirror of migrations/025: cross-company employee link. When the same person
  // (same PAN/Aadhaar) is employed at a second company, the second record points
  // to the On-Roll (master) record so the two are associated. Additive & nullable.
  await db.execute(sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS master_employee_id VARCHAR(36)`).catch((err) => console.error("[migrations] add employees.master_employee_id failed:", err));
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS employees_master_employee_idx ON employees (master_employee_id)
  `).catch(() => {});

  // Payment submissions: a company admin reports a payment (amount/date/ref no)
  // from the trial-expired wall. Access is granted immediately (status pending);
  // a super admin later approves or rejects. Rejection re-locks access.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_submissions (
      id            VARCHAR(36)   PRIMARY KEY,
      company_id    VARCHAR(36)   NOT NULL,
      amount        NUMERIC(14,2) NOT NULL,
      payment_date  TEXT          NOT NULL,
      reference_no  TEXT          NOT NULL,
      note          TEXT,
      status        TEXT          NOT NULL DEFAULT 'pending',
      review_note   TEXT,
      reviewed_by   VARCHAR(36),
      reviewed_at   TEXT,
      submitted_by  VARCHAR(36),
      created_at    TEXT          NOT NULL
    )
  `).catch((err) => console.error("[migrations] create payment_submissions failed:", err));
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS payment_submissions_company_idx
      ON payment_submissions (company_id, created_at DESC)
  `).catch(() => {});
  // Idempotency marker: set once a submission's amount has been added to the
  // company's credit balance, so approval never double-credits.
  await db.execute(sql`ALTER TABLE payment_submissions ADD COLUMN IF NOT EXISTS credited_at TEXT`)
    .catch((err) => console.error("[migrations] add payment_submissions.credited_at failed:", err));

  // Backfill: credit any submission approved before crediting-on-approval
  // existed (status 'approved' but never credited). Each row is processed in its
  // own transaction with an atomic credited_at claim, so the backfill is safe to
  // run on every boot and a single bad row never aborts the rest.
  try {
    const pending = await db.execute(sql`
      SELECT id FROM payment_submissions WHERE status = 'approved' AND credited_at IS NULL
    `);
    for (const r of pending.rows as any[]) {
      try {
        await db.transaction(async (tx) => {
          const ts = new Date().toISOString();
          const claim = await tx.execute(sql`
            UPDATE payment_submissions SET credited_at = ${ts}
            WHERE id = ${r.id} AND credited_at IS NULL
            RETURNING amount, company_id, payment_date, reference_no, reviewed_by
          `);
          const c = claim.rows[0] as any;
          if (!c) return; // already credited by a concurrent path
          const amt = Number(c.amount);
          if (amt > 0) {
            await tx.execute(sql`
              INSERT INTO cd_accounts (id, company_id, credit_balance, cost_per_employee_per_day, rate_effective_from, low_balance_threshold, allow_negative, notes, created_at, updated_at)
              VALUES (${randomUUID()}, ${c.company_id}, 0, 15, ${ts.slice(0, 10)}, 1000, false, 'Auto-created on payment approval backfill', ${ts}, ${ts})
              ON CONFLICT (company_id) DO NOTHING
            `);
            const balRow = await tx.execute(sql`
              UPDATE cd_accounts SET credit_balance = credit_balance + ${amt}, updated_at = ${ts}
              WHERE company_id = ${c.company_id}
              RETURNING credit_balance
            `);
            const balAfter = (balRow.rows[0] as any)?.credit_balance ?? 0;
            await tx.execute(sql`
              INSERT INTO cd_transactions (id, company_id, type, amount, balance_after, description, reference_no, created_by, created_at)
              VALUES (${randomUUID()}, ${c.company_id}, 'credit', ${amt}, ${balAfter},
                ${`Payment approved — ${c.payment_date}`}, ${c.reference_no || null}, ${c.reviewed_by || null}, ${ts})
            `);
          }
          console.log(`[migrations] backfilled payment credit for submission ${r.id} (₹${amt})`);
        });
      } catch (rowErr) {
        console.error(`[migrations] backfill failed for submission ${r.id}:`, rowErr);
      }
    }
  } catch (err) {
    console.error("[migrations] payment credit backfill failed:", err);
  }
}
