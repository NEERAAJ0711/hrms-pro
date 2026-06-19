import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Auth guard (re-declared locally so this file is self-contained) ──────────
const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  if (!(req.session as any).userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
};

const requireAdminRole = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: "Authentication required" });
  const allowed = ["super_admin", "company_admin", "hr_admin"];
  if (!allowed.includes(user.role)) return res.status(403).json({ error: "Access denied" });
  next();
};

// Attach user to request
const attachUser = async (req: Request, res: Response, next: NextFunction) => {
  const userId = (req.session as any).userId;
  if (!userId) return next();
  try {
    const rows = await db.execute(sql`SELECT * FROM users WHERE id = ${userId} LIMIT 1`);
    if (rows.rows.length > 0) (req as any).user = rows.rows[0];
  } catch (_) {}
  next();
};

export function registerComplianceRoutes(app: Express) {

  // ── Ensure all compliance tables exist on startup ─────────────────────────
  db.execute(sql`
    CREATE TABLE IF NOT EXISTS compliance_carry_forward (
      id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      company_id    VARCHAR(36) NOT NULL,
      employee_id   VARCHAR(36) NOT NULL,
      month         TEXT        NOT NULL,
      year          INTEGER     NOT NULL,
      carry_fwd_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at    TEXT        NOT NULL,
      updated_at    TEXT        NOT NULL,
      UNIQUE (company_id, employee_id, month, year)
    )
  `).catch(() => {});

  db.execute(sql`
    CREATE TABLE IF NOT EXISTS compliance_employee_setup (
      id              VARCHAR PRIMARY KEY,
      company_id      VARCHAR NOT NULL,
      employee_id     VARCHAR NOT NULL,
      department      VARCHAR,
      designation     VARCHAR,
      weekly_off      VARCHAR DEFAULT 'sunday',
      ot_type         VARCHAR DEFAULT 'na',
      payment_mode    VARCHAR DEFAULT 'actual',
      diff_adjustments TEXT DEFAULT '',
      pf_type         VARCHAR DEFAULT 'na',
      esic_type       VARCHAR DEFAULT 'na',
      lwf_type        VARCHAR DEFAULT 'na',
      bonus_type      VARCHAR DEFAULT 'na',
      basic_salary    NUMERIC(12,2) DEFAULT 0,
      gross_salary    NUMERIC(12,2) DEFAULT 0,
      same_as_actual  BOOLEAN DEFAULT true,
      created_by      VARCHAR,
      created_at      TIMESTAMP DEFAULT NOW(),
      updated_at      TIMESTAMP DEFAULT NOW(),
      UNIQUE (company_id, employee_id)
    )
  `).catch(() => {});

  db.execute(sql`
    ALTER TABLE compliance_employee_setup
    ADD COLUMN IF NOT EXISTS wage_grade_id VARCHAR
  `).catch(() => {});

  db.execute(sql`
    ALTER TABLE compliance_employee_setup
    ADD COLUMN IF NOT EXISTS allowances NUMERIC(12,2)
  `).catch(() => {});

  db.execute(sql`
    CREATE TABLE IF NOT EXISTS compliance_adjustments (
      id                    VARCHAR PRIMARY KEY,
      company_id            VARCHAR NOT NULL,
      employee_id           VARCHAR NOT NULL,
      employee_name         VARCHAR,
      employee_code         VARCHAR,
      month                 VARCHAR NOT NULL,
      year                  INTEGER NOT NULL,
      compliance_type       VARCHAR DEFAULT 'PF',
      party_name            VARCHAR,
      original_attendance   NUMERIC(6,1),
      original_ot_hours     NUMERIC(8,2),
      original_basic_salary NUMERIC(12,2),
      original_gross_salary NUMERIC(12,2),
      original_net_salary   NUMERIC(12,2),
      adjusted_attendance   NUMERIC(6,1),
      adjusted_ot_hours     NUMERIC(8,2),
      adjusted_basic_salary NUMERIC(12,2),
      adjusted_gross_salary NUMERIC(12,2),
      adjusted_net_salary   NUMERIC(12,2),
      remarks               TEXT,
      status                VARCHAR DEFAULT 'draft',
      created_by            VARCHAR,
      created_at            TIMESTAMP DEFAULT NOW(),
      updated_at            TIMESTAMP DEFAULT NOW()
    )
  `).catch(() => {});

  db.execute(sql`
    CREATE TABLE IF NOT EXISTS compliance_clients (
      id                          VARCHAR PRIMARY KEY,
      company_id                  VARCHAR NOT NULL,
      project_name                VARCHAR NOT NULL,
      client_name                 VARCHAR,
      client_address              TEXT,
      principal_employer_name     VARCHAR,
      principal_employer_address  TEXT,
      nature_of_work              VARCHAR,
      location_of_work            VARCHAR,
      project_start_date          DATE,
      project_end_date            DATE,
      status                      VARCHAR DEFAULT 'active',
      created_by                  VARCHAR,
      created_at                  TIMESTAMP DEFAULT NOW(),
      updated_at                  TIMESTAMP DEFAULT NOW()
    )
  `).catch(() => {});

  db.execute(sql`
    CREATE TABLE IF NOT EXISTS compliance_client_employees (
      id                VARCHAR PRIMARY KEY,
      client_id         VARCHAR NOT NULL,
      employee_id       VARCHAR NOT NULL,
      company_id        VARCHAR NOT NULL,
      assigned_date     DATE NOT NULL,
      deassigned_date   DATE,
      status            VARCHAR DEFAULT 'active',
      created_by        VARCHAR,
      created_at        TIMESTAMP DEFAULT NOW(),
      updated_at        TIMESTAMP DEFAULT NOW()
    )
  `).catch(() => {});

  db.execute(sql`ALTER TABLE compliance_client_employees ADD COLUMN IF NOT EXISTS designation VARCHAR`).catch(() => {});
  db.execute(sql`ALTER TABLE compliance_client_employees ADD COLUMN IF NOT EXISTS present_address TEXT`).catch(() => {});

  // ── POST /api/compliance/carry-fwd/save — bulk-upsert carry-forward amounts
  app.post("/api/compliance/carry-fwd/save", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { companyId, month, year, data } = req.body as {
        companyId: string; month: string; year: number;
        data: { employeeId: string; carryFwdAmount: number }[];
      };
      if (!companyId || !month || !year || !Array.isArray(data)) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const now = new Date().toISOString();
      for (const item of data) {
        await db.execute(sql`
          INSERT INTO compliance_carry_forward (id, company_id, employee_id, month, year, carry_fwd_amount, created_at, updated_at)
          VALUES (${randomUUID()}, ${companyId}, ${item.employeeId}, ${month}, ${year}, ${item.carryFwdAmount}, ${now}, ${now})
          ON CONFLICT (company_id, employee_id, month, year)
          DO UPDATE SET carry_fwd_amount = ${item.carryFwdAmount}, updated_at = ${now}
        `);
      }
      return res.json({ ok: true, saved: data.length });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/compliance/employees — load employees + their payroll + attendance for a month/year
  app.get("/api/compliance/employees", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId, month, year } = req.query as { companyId?: string; month?: string; year?: string };

      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId) return res.status(400).json({ error: "Company ID required" });
      if (!month || !year) return res.status(400).json({ error: "Month and year required" });

      const yearNum = parseInt(year);

      // Month-end date string — used to pick the salary structure effective for the selected month
      const _ceMonths = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const _ceMonthIdx = _ceMonths.indexOf(month) + 1;
      const monthEndStr = `${yearNum}-${String(_ceMonthIdx).padStart(2,"0")}-${String(new Date(yearNum, _ceMonthIdx, 0).getDate()).padStart(2,"0")}`;

      // All employees with compliance setup (dept/designation/basic/gross) + salary structure conveyance
      console.log(`[CE] Q1 company=${targetCompanyId} month=${month} year=${yearNum}`);
      const empRows = await db.execute(sql`
        SELECT
          e.id, e.employee_code, e.first_name, e.last_name,
          e.date_of_joining,
          COALESCE(cs.department,  e.department,  '') AS department,
          COALESCE(cs.designation, e.designation, '') AS designation,
          COALESCE(cs.basic_salary, ss.basic_salary) AS setup_basic,
          COALESCE(cs.gross_salary, ss.gross_salary) AS setup_gross,
          cs.pf_type           AS setup_pf_type,
          cs.esic_type         AS setup_esic_type,
          cs.lwf_type          AS setup_lwf_type,
          cs.bonus_type        AS setup_bonus_type,
          cs.diff_adjustments  AS setup_diff_adj,
          cs.ot_type           AS setup_ot_type,
          cs.payment_mode      AS setup_payment_mode,
          cs.allowances        AS setup_allowances,
          cs.same_as_actual    AS setup_same_as_actual,
          ss.basic_salary      AS ss_basic,
          ss.conveyance        AS ss_conv,
          ss.hra               AS ss_hra,
          ss.gross_salary      AS ss_gross,
          wg.minimum_wage      AS grade_min_wage,
          COALESCE(e.pf_applicable,  false) AS pf_applicable,
          COALESCE(e.esi_applicable, false) AS esi_applicable,
          COALESCE(e.lwf_applicable, false) AS lwf_applicable
        FROM employees e
        LEFT JOIN compliance_employee_setup cs
          ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
        LEFT JOIN LATERAL (
          SELECT s.*
          FROM salary_structures s
          WHERE s.employee_id = e.id AND s.company_id = ${targetCompanyId} AND s.status = 'active'
          ORDER BY
            CASE WHEN NULLIF(s.effective_from,'')::date <= ${monthEndStr}::date THEN 0 ELSE 1 END,
            CASE WHEN NULLIF(s.effective_from,'')::date <= ${monthEndStr}::date THEN NULLIF(s.effective_from,'')::date END DESC,
            NULLIF(s.effective_from,'')::date ASC NULLS LAST
          LIMIT 1
        ) ss ON true
        LEFT JOIN wage_grades wg
          ON wg.id = COALESCE(cs.wage_grade_id, e.wage_grade_id) AND wg.company_id = ${targetCompanyId}
        WHERE e.company_id = ${targetCompanyId} AND e.status = 'active'
        ORDER BY e.employee_code
      `);

      // Month index (1-based) and boundary helpers for DOJ filtering
      const monthIndex    = ["January","February","March","April","May","June","July","August","September","October","November","December"].indexOf(month) + 1;
      const monthFirstDay = new Date(yearNum, monthIndex - 1, 1);
      const monthLastDay  = new Date(yearNum, monthIndex, 0);

      // Full payroll breakdown for month/year
      console.log(`[CE] Q2 payroll`);
      const payrollRows = await db.execute(sql`
        SELECT employee_id,
          basic_salary, hra, conveyance,
          COALESCE(medical_allowance,0)+COALESCE(special_allowance,0)+COALESCE(other_allowances,0) AS other_earn,
          COALESCE(bonus,0) AS bonus,
          total_earnings,
          COALESCE(pf_employee,0)       AS pf,
          COALESCE(vpf_amount,0)        AS vpf,
          COALESCE(esi,0)               AS esic,
          COALESCE(lwf_employee,0)      AS lwf,
          COALESCE(tds,0)               AS tds,
          COALESCE(professional_tax,0)  AS pt,
          COALESCE(other_deductions,0)  AS other_ded,
          COALESCE(loan_deduction,0)    AS loan_adv,
          total_deductions,
          net_salary,
          working_days,
          COALESCE(pay_days, present_days, 0) AS pay_days
        FROM payroll
        WHERE company_id = ${targetCompanyId}
          AND month = ${month}
          AND year = ${yearNum}
      `);
      const payrollMap: Record<string, any> = {};
      for (const p of payrollRows.rows) payrollMap[p.employee_id as string] = p;

      // Attendance OT summary
      console.log(`[CE] Q3 attendance monthIdx=${monthIndex}`);
      const attRows = await db.execute(sql`
        SELECT employee_id,
          COUNT(*) FILTER (WHERE status IN ('present','half_day')) AS present_days,
          COALESCE(SUM(
            CASE
              WHEN ot_hours IS NULL OR ot_hours = '' OR ot_hours = '0' THEN 0
              WHEN POSITION(':' IN ot_hours) > 0 THEN
                SPLIT_PART(ot_hours, ':', 1)::integer * 60 + SPLIT_PART(ot_hours, ':', 2)::integer
              WHEN ot_hours ~ '^[0-9]+(\.[0-9]+)?$' THEN (ot_hours::numeric * 60)::integer
              ELSE 0
            END
          ) / 60.0, 0) AS total_ot_hours
        FROM attendance
        WHERE company_id = ${targetCompanyId}
          AND EXTRACT(MONTH FROM date::date) = ${monthIndex}
          AND EXTRACT(YEAR FROM date::date) = ${yearNum}
        GROUP BY employee_id
      `);
      const attMap: Record<string, any> = {};
      for (const a of attRows.rows) attMap[a.employee_id as string] = a;

      // Existing compliance adjustments
      console.log(`[CE] Q4 adjustments`);
      const adjRows = await db.execute(sql`
        SELECT * FROM compliance_adjustments
        WHERE company_id = ${targetCompanyId}
          AND month = ${month}
          AND year = ${yearNum}
      `);
      const adjMap: Record<string, any> = {};
      for (const a of adjRows.rows) adjMap[a.employee_id as string] = a;

      // Previous month carry-forward lookup
      console.log(`[CE] Q5 carry-fwd`);
      const prevMonthIndex = monthIndex === 1 ? 12 : monthIndex - 1;
      const prevYear       = monthIndex === 1 ? yearNum - 1 : yearNum;
      const prevMonth      = ["January","February","March","April","May","June","July","August","September","October","November","December"][prevMonthIndex - 1];
      const prevCfRows = await db.execute(sql`
        SELECT employee_id, carry_fwd_amount
        FROM compliance_carry_forward
        WHERE company_id = ${targetCompanyId}
          AND month = ${prevMonth}
          AND year  = ${prevYear}
      `);
      const prevCfMap: Record<string, number> = {};
      for (const r of prevCfRows.rows) prevCfMap[r.employee_id as string] = Number(r.carry_fwd_amount);

      // Filter: include only employees with payroll for this month
      // OR who joined during this month (new joiners before payroll is generated)
      const eligibleEmps = empRows.rows.filter((emp: any) => {
        if (payrollMap[emp.id]) return true; // payroll exists → always include
        if (emp.date_of_joining) {
          const doj = new Date(emp.date_of_joining);
          return doj >= monthFirstDay && doj <= monthLastDay; // joined this month
        }
        return false;
      });

      const result = eligibleEmps.map((emp: any) => {
        const pay = payrollMap[emp.id] || {};
        const att = attMap[emp.id] || {};
        const adj = adjMap[emp.id] || null;

        // Mon.Days = total calendar days in the month
        const monDays = new Date(yearNum, monthIndex, 0).getDate();

        // "Same as actual payroll" (default ON): Basic AND Allowances both mirror the
        // employee's actual salary structure. When OFF: Basic = wage-grade minimum wage
        // (statutory) and Allowances = the admin-configured custom value.
        const sameAsActual = emp.setup_same_as_actual !== false;
        // Always use salary structure gross as the reference (ignores stale cs.gross_salary)
        const ssGross = Number(emp.ss_gross || emp.setup_gross || 0);
        const rConv   = Number(emp.ss_conv || 0);
        const rBasic = sameAsActual
          ? Number(emp.ss_basic ?? emp.setup_basic ?? 0)
          : (emp.grade_min_wage != null ? Number(emp.grade_min_wage) : Number(emp.setup_basic || 0));
        const hasCustomAllowances = emp.setup_allowances != null && !sameAsActual;
        const rHra = hasCustomAllowances
          ? Number(emp.setup_allowances)
          : Math.max(0, ssGross - rBasic);
        // R.Total = Basic + Allowances (explicit, matches what user sees)
        const rTotal  = rBasic + rHra;

        return {
          employeeId:    emp.id,
          employeeCode:  emp.employee_code,
          employeeName:  `${emp.first_name} ${emp.last_name}`.trim(),
          department:    emp.department,
          designation:   emp.designation,
          // Days
          monDays:       Number(monDays),
          payDays:       Number(att.present_days || pay.pay_days || 0),
          // Salary structure gross (for Gross Salary column)
          structureGross: ssGross,
          // Rate (statutory — grade min wage + allowances)
          rBasic,
          rHra,
          rConv,
          rTotal,
          // Earned (payroll)
          eBasic:        Number(pay.basic_salary   || 0),
          eHra:          Number(pay.hra            || 0),
          eConv:         Number(pay.conveyance     || 0),
          eOth:          Number(pay.other_earn     || 0),
          bonus:         Number(pay.bonus          || 0),
          eTotal:        Number(pay.total_earnings || 0),
          // Compliance setup config
          pfType:        emp.setup_pf_type     || "actual",
          esicType:      emp.setup_esic_type   || "actual",
          lwfType:       emp.setup_lwf_type    || "actual",
          bonusType:     emp.setup_bonus_type  || "actual",
          diffAdj:       emp.setup_diff_adj   || "",
          otType:        emp.setup_ot_type    || "na",
          paymentMode:   emp.setup_payment_mode || "actual",
          // Deductions (raw payroll values)
          pf:            Number(pay.pf      || 0),
          vpf:           Number(pay.vpf     || 0),
          esic:          Number(pay.esic    || 0),
          lwf:           Number(pay.lwf     || 0),
          tds:           Number(pay.tds     || 0),
          pt:            Number(pay.pt      || 0),
          otherDed:      Number(pay.other_ded  || 0),
          loanAdv:       Number(pay.loan_adv   || 0),
          dTotal:        Number(pay.total_deductions || 0),
          netPay:        Number(pay.net_salary || 0),
          prevBal:       prevCfMap[emp.id] || 0,
          // Legacy fields kept for existing adjustment logic
          originalAttendance:   Number(att.present_days  || 0),
          originalOtHours:      Number(att.total_ot_hours || 0).toFixed(2),
          originalBasicSalary:  Number(pay.basic_salary   || 0),
          originalGrossSalary:  Number(pay.total_earnings || 0),
          originalNetSalary:    Number(pay.net_salary     || 0),
          adjustment: adj ? {
            id: adj.id,
            complianceType: adj.compliance_type,
            partyName: adj.party_name,
            adjustedAttendance:   adj.adjusted_attendance,
            adjustedOtHours:      adj.adjusted_ot_hours,
            adjustedBasicSalary:  adj.adjusted_basic_salary,
            adjustedGrossSalary:  adj.adjusted_gross_salary,
            adjustedNetSalary:    adj.adjusted_net_salary,
            remarks: adj.remarks,
            status:  adj.status,
          } : null,
        };
      });

      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/compliance/adjustments — list all adjustments with filters
  app.get("/api/compliance/adjustments", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId, month, year, complianceType, status } = req.query as Record<string, string>;
      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId) return res.status(400).json({ error: "Company ID required" });

      const conditions: any[] = [sql`ca.company_id = ${targetCompanyId}`];
      if (month)          conditions.push(sql`ca.month = ${month}`);
      if (year)           conditions.push(sql`ca.year = ${parseInt(year)}`);
      if (complianceType) conditions.push(sql`ca.compliance_type = ${complianceType}`);
      if (status)         conditions.push(sql`ca.status = ${status}`);

      const whereClause = sql.join(conditions, sql` AND `);
      const rows = await db.execute(sql`
        SELECT ca.*, c.company_name
        FROM compliance_adjustments ca
        LEFT JOIN companies c ON ca.company_id = c.id
        WHERE ${whereClause}
        ORDER BY ca.created_at DESC
      `);
      return res.json(rows.rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/compliance/adjustments — save/upsert a single employee adjustment
  app.post("/api/compliance/adjustments", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const {
        companyId, employeeId, employeeName, employeeCode,
        month, year, complianceType, partyName,
        originalAttendance, originalOtHours, originalBasicSalary, originalGrossSalary, originalNetSalary,
        adjustedAttendance, adjustedOtHours, adjustedBasicSalary, adjustedGrossSalary, adjustedNetSalary,
        remarks, status,
      } = req.body;

      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId || !employeeId || !month || !year) {
        return res.status(400).json({ error: "companyId, employeeId, month, year are required" });
      }

      const now = new Date().toISOString();

      // Check if adjustment already exists for this employee+month+year+companyId
      const existing = await db.execute(sql`
        SELECT id FROM compliance_adjustments
        WHERE company_id = ${targetCompanyId}
          AND employee_id = ${employeeId}
          AND month = ${month}
          AND year = ${parseInt(year)}
        LIMIT 1
      `);

      if (existing.rows.length > 0) {
        // Update
        const id = existing.rows[0].id as string;
        await db.execute(sql`
          UPDATE compliance_adjustments SET
            employee_name         = ${employeeName || null},
            employee_code         = ${employeeCode || null},
            compliance_type       = ${complianceType || "PF"},
            party_name            = ${partyName || null},
            original_attendance   = ${originalAttendance ?? null},
            original_ot_hours     = ${originalOtHours ?? null},
            original_basic_salary = ${originalBasicSalary ?? null},
            original_gross_salary = ${originalGrossSalary ?? null},
            original_net_salary   = ${originalNetSalary ?? null},
            adjusted_attendance   = ${adjustedAttendance ?? null},
            adjusted_ot_hours     = ${adjustedOtHours ?? null},
            adjusted_basic_salary = ${adjustedBasicSalary ?? null},
            adjusted_gross_salary = ${adjustedGrossSalary ?? null},
            adjusted_net_salary   = ${adjustedNetSalary ?? null},
            remarks               = ${remarks || null},
            status                = ${status || "draft"},
            updated_at            = ${now}
          WHERE id = ${id}
        `);
        const updated = await db.execute(sql`SELECT * FROM compliance_adjustments WHERE id = ${id}`);
        return res.json(updated.rows[0]);
      } else {
        // Insert
        const id = randomUUID();
        await db.execute(sql`
          INSERT INTO compliance_adjustments (
            id, company_id, employee_id, employee_name, employee_code,
            month, year, compliance_type, party_name,
            original_attendance, original_ot_hours, original_basic_salary, original_gross_salary, original_net_salary,
            adjusted_attendance, adjusted_ot_hours, adjusted_basic_salary, adjusted_gross_salary, adjusted_net_salary,
            remarks, status, created_by, created_at, updated_at
          ) VALUES (
            ${id}, ${targetCompanyId}, ${employeeId}, ${employeeName || null}, ${employeeCode || null},
            ${month}, ${parseInt(year)}, ${complianceType || "PF"}, ${partyName || null},
            ${originalAttendance ?? null}, ${originalOtHours ?? null}, ${originalBasicSalary ?? null}, ${originalGrossSalary ?? null}, ${originalNetSalary ?? null},
            ${adjustedAttendance ?? null}, ${adjustedOtHours ?? null}, ${adjustedBasicSalary ?? null}, ${adjustedGrossSalary ?? null}, ${adjustedNetSalary ?? null},
            ${remarks || null}, ${status || "draft"}, ${user.id}, ${now}, ${now}
          )
        `);
        const inserted = await db.execute(sql`SELECT * FROM compliance_adjustments WHERE id = ${id}`);
        return res.status(201).json(inserted.rows[0]);
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/compliance/adjustments/bulk — bulk save multiple employee adjustments
  app.post("/api/compliance/adjustments/bulk", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId, month, year, complianceType, partyName, adjustments } = req.body;

      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId || !month || !year || !Array.isArray(adjustments)) {
        return res.status(400).json({ error: "companyId, month, year, adjustments[] are required" });
      }

      const now = new Date().toISOString();
      let saved = 0;

      for (const adj of adjustments) {
        const existing = await db.execute(sql`
          SELECT id FROM compliance_adjustments
          WHERE company_id = ${targetCompanyId}
            AND employee_id = ${adj.employeeId}
            AND month = ${month}
            AND year = ${parseInt(year)}
          LIMIT 1
        `);

        if (existing.rows.length > 0) {
          const id = existing.rows[0].id as string;
          await db.execute(sql`
            UPDATE compliance_adjustments SET
              employee_name         = ${adj.employeeName || null},
              employee_code         = ${adj.employeeCode || null},
              compliance_type       = ${complianceType || "PF"},
              party_name            = ${partyName || null},
              original_attendance   = ${adj.originalAttendance ?? null},
              original_ot_hours     = ${adj.originalOtHours ?? null},
              original_basic_salary = ${adj.originalBasicSalary ?? null},
              original_gross_salary = ${adj.originalGrossSalary ?? null},
              original_net_salary   = ${adj.originalNetSalary ?? null},
              adjusted_attendance   = ${adj.adjustedAttendance ?? null},
              adjusted_ot_hours     = ${adj.adjustedOtHours ?? null},
              adjusted_basic_salary = ${adj.adjustedBasicSalary ?? null},
              adjusted_gross_salary = ${adj.adjustedGrossSalary ?? null},
              adjusted_net_salary   = ${adj.adjustedNetSalary ?? null},
              remarks               = ${adj.remarks || null},
              status                = ${adj.status || "draft"},
              updated_at            = ${now}
            WHERE id = ${id}
          `);
        } else {
          const id = randomUUID();
          await db.execute(sql`
            INSERT INTO compliance_adjustments (
              id, company_id, employee_id, employee_name, employee_code,
              month, year, compliance_type, party_name,
              original_attendance, original_ot_hours, original_basic_salary, original_gross_salary, original_net_salary,
              adjusted_attendance, adjusted_ot_hours, adjusted_basic_salary, adjusted_gross_salary, adjusted_net_salary,
              remarks, status, created_by, created_at, updated_at
            ) VALUES (
              ${id}, ${targetCompanyId}, ${adj.employeeId}, ${adj.employeeName || null}, ${adj.employeeCode || null},
              ${month}, ${parseInt(year)}, ${complianceType || "PF"}, ${partyName || null},
              ${adj.originalAttendance ?? null}, ${adj.originalOtHours ?? null}, ${adj.originalBasicSalary ?? null}, ${adj.originalGrossSalary ?? null}, ${adj.originalNetSalary ?? null},
              ${adj.adjustedAttendance ?? null}, ${adj.adjustedOtHours ?? null}, ${adj.adjustedBasicSalary ?? null}, ${adj.adjustedGrossSalary ?? null}, ${adj.adjustedNetSalary ?? null},
              ${adj.remarks || null}, ${adj.status || "draft"}, ${user.id}, ${now}, ${now}
            )
          `);
        }
        saved++;
      }

      return res.json({ message: `${saved} record(s) saved successfully`, saved });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/compliance/adjustments/:id/finalize — mark as finalized
  app.patch("/api/compliance/adjustments/:id/finalize", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const now = new Date().toISOString();
      await db.execute(sql`
        UPDATE compliance_adjustments SET status = 'finalized', updated_at = ${now} WHERE id = ${id}
      `);
      return res.json({ message: "Marked as finalized" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /api/compliance/adjustments/:id — delete one adjustment
  app.delete("/api/compliance/adjustments/:id", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await db.execute(sql`DELETE FROM compliance_adjustments WHERE id = ${id}`);
      return res.json({ message: "Deleted" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/compliance/companies — for super_admin dropdown
  app.get("/api/compliance/companies", requireAuth, attachUser, async (req: Request, res: Response) => {
    try {
      const rows = await db.execute(sql`
        SELECT id, company_name FROM companies WHERE status = 'active' ORDER BY company_name
      `);
      return res.json(rows.rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/compliance/setup — employee-wise compliance setup for a company
  app.get("/api/compliance/setup", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId } = req.query as { companyId?: string };
      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId) return res.status(400).json({ error: "Company ID required" });

      // Get all active employees with their existing setup + salary structure figures
      const rows = await db.execute(sql`
        SELECT
          e.id            AS employee_id,
          e.employee_code,
          e.first_name,
          e.last_name,
          e.department    AS emp_department,
          e.designation   AS emp_designation,
          COALESCE(e.pf_applicable,  false) AS pf_applicable,
          COALESCE(e.esi_applicable, false) AS esi_applicable,
          COALESCE(e.lwf_applicable, false) AS lwf_applicable,
          cs.id           AS setup_id,
          cs.department,
          cs.designation,
          cs.weekly_off,
          cs.ot_type,
          cs.payment_mode,
          cs.diff_adjustments,
          cs.pf_type,
          cs.esic_type,
          cs.lwf_type,
          cs.bonus_type,
          cs.basic_salary,
          cs.gross_salary,
          cs.same_as_actual,
          cs.allowances,
          COALESCE(cs.wage_grade_id, e.wage_grade_id) AS eff_wage_grade_id,
          cs.wage_grade_id AS cs_wage_grade_id,
          wg.name          AS wg_name,
          wg.state         AS wg_state,
          wg.minimum_wage  AS wg_min_wage,
          ss.basic_salary AS struct_basic,
          ss.gross_salary AS struct_gross
        FROM employees e
        LEFT JOIN compliance_employee_setup cs
          ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
        LEFT JOIN LATERAL (
          SELECT s.*
          FROM salary_structures s
          WHERE s.employee_id = e.id AND s.company_id = ${targetCompanyId} AND s.status = 'active'
          ORDER BY NULLIF(s.effective_from,'')::date DESC NULLS LAST
          LIMIT 1
        ) ss ON true
        LEFT JOIN wage_grades wg
          ON wg.id = COALESCE(cs.wage_grade_id, e.wage_grade_id) AND wg.company_id = ${targetCompanyId}
        WHERE e.company_id = ${targetCompanyId} AND e.status = 'active'
        ORDER BY e.employee_code
      `);

      return res.json(rows.rows.map((r: any) => ({
        employeeId:           r.employee_id,
        employeeCode:         r.employee_code,
        employeeName:         `${r.first_name} ${r.last_name}`.trim(),
        empDepartment:        r.emp_department || "",
        empDesignation:       r.emp_designation || "",
        pfApplicable:         r.pf_applicable  === true || r.pf_applicable  === "true" || r.pf_applicable  === "t",
        esicApplicable:       r.esi_applicable === true || r.esi_applicable === "true" || r.esi_applicable === "t",
        lwfApplicable:        r.lwf_applicable === true || r.lwf_applicable === "true" || r.lwf_applicable === "t",
        setupId:              r.setup_id || null,
        department:           r.department  || r.emp_department  || "",
        designation:          r.designation || r.emp_designation || "",
        weeklyOff:            r.weekly_off    || "sunday",
        otType:               r.ot_type       || "na",
        paymentMode:          r.payment_mode  || "actual",
        diffAdjustments:      r.diff_adjustments ? r.diff_adjustments.split(",").filter(Boolean) : [],
        pfType:               r.pf_type        || "actual",
        esicType:             r.esic_type      || "actual",
        lwfType:              r.lwf_type       || "na",
        bonusType:            r.bonus_type     || "actual",
        basicSalary:          r.basic_salary   != null ? String(r.basic_salary) : "",
        grossSalary:          r.gross_salary   != null ? String(r.gross_salary) : "",
        sameAsActual:         r.same_as_actual ?? true,
        originalBasicSalary:  Number(r.struct_basic || 0),
        originalGrossSalary:  Number(r.struct_gross || 0),
        wageGradeId:          r.eff_wage_grade_id || "",
        wageGradeName:        r.wg_name ? `${r.wg_name}${r.wg_state ? ` - ${r.wg_state}` : ""}` : "",
        gradeMinWage:         Number(r.wg_min_wage || 0),
        allowances:           r.allowances != null ? String(r.allowances) : "",
      })));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/compliance/setup/bulk — bulk upsert employee compliance setups
  app.post("/api/compliance/setup/bulk", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId, setups } = req.body;
      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId || !Array.isArray(setups)) {
        return res.status(400).json({ error: "companyId and setups[] are required" });
      }

      const now = new Date().toISOString();
      let saved = 0;

      for (const s of setups) {
        const diffStr = Array.isArray(s.diffAdjustments) ? s.diffAdjustments.join(",") : (s.diffAdjustments || "");

        const existing = await db.execute(sql`
          SELECT id FROM compliance_employee_setup
          WHERE company_id = ${targetCompanyId} AND employee_id = ${s.employeeId}
          LIMIT 1
        `);

        const basicSal = s.basicSalary !== "" && s.basicSalary != null ? parseFloat(s.basicSalary) : null;
        const grossSal = s.grossSalary !== "" && s.grossSalary != null ? parseFloat(s.grossSalary) : null;
        const sameAsAct = s.sameAsActual === true || s.sameAsActual === "true";

        if (existing.rows.length > 0) {
          await db.execute(sql`
            UPDATE compliance_employee_setup SET
              department       = ${s.department       || null},
              designation      = ${s.designation      || null},
              weekly_off       = ${s.weeklyOff        || "sunday"},
              ot_type          = ${s.otType           || "na"},
              payment_mode     = ${s.paymentMode      || "actual"},
              diff_adjustments = ${diffStr},
              pf_type          = ${s.pfType           || "actual"},
              esic_type        = ${s.esicType         || "actual"},
              lwf_type         = ${s.lwfType          || "na"},
              bonus_type       = ${s.bonusType        || "actual"},
              basic_salary     = ${basicSal},
              gross_salary     = ${grossSal},
              same_as_actual   = ${sameAsAct},
              wage_grade_id    = ${s.wageGradeId||null},
              allowances       = ${s.allowances !== "" && s.allowances != null ? parseFloat(s.allowances) : null},
              updated_at       = ${now}
            WHERE company_id = ${targetCompanyId} AND employee_id = ${s.employeeId}
          `);
        } else {
          const id = randomUUID();
          await db.execute(sql`
            INSERT INTO compliance_employee_setup
              (id, company_id, employee_id, department, designation, weekly_off, ot_type,
               payment_mode, diff_adjustments, pf_type, esic_type, lwf_type, bonus_type,
               basic_salary, gross_salary, same_as_actual, wage_grade_id, allowances, created_by, created_at, updated_at)
            VALUES
              (${id}, ${targetCompanyId}, ${s.employeeId}, ${s.department||null}, ${s.designation||null},
               ${s.weeklyOff||"sunday"}, ${s.otType||"na"}, ${s.paymentMode||"actual"},
               ${diffStr}, ${s.pfType||"actual"}, ${s.esicType||"actual"}, ${s.lwfType||"na"},
               ${s.bonusType||"actual"}, ${basicSal}, ${grossSal}, ${sameAsAct}, ${s.wageGradeId||null},
               ${s.allowances !== "" && s.allowances != null ? parseFloat(s.allowances) : null},
               ${user.id}, ${now}, ${now})
          `);
        }
        saved++;
      }

      return res.json({ message: `${saved} setup(s) saved`, saved });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── PUT /api/compliance/setup/:employeeId — save single employee setup
  app.put("/api/compliance/setup/:employeeId", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { employeeId } = req.params;
      const { companyId, department, designation, weeklyOff, otType, paymentMode, diffAdjustments,
              pfType, esicType, lwfType, bonusType, basicSalary, grossSalary, sameAsActual,
              wageGradeId } = req.body;
      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId) return res.status(400).json({ error: "Company ID required" });

      const now = new Date().toISOString();
      const diffStr = Array.isArray(diffAdjustments) ? diffAdjustments.join(",") : (diffAdjustments || "");
      const basicSal = basicSalary !== "" && basicSalary != null ? parseFloat(basicSalary) : null;
      const grossSal = grossSalary !== "" && grossSalary != null ? parseFloat(grossSalary) : null;
      const sameAsAct = sameAsActual === true || sameAsActual === "true";

      const existing = await db.execute(sql`
        SELECT id FROM compliance_employee_setup
        WHERE company_id = ${targetCompanyId} AND employee_id = ${employeeId}
        LIMIT 1
      `);

      if (existing.rows.length > 0) {
        await db.execute(sql`
          UPDATE compliance_employee_setup SET
            department = ${department||null}, designation = ${designation||null},
            weekly_off = ${weeklyOff||"sunday"}, ot_type = ${otType||"na"},
            payment_mode = ${paymentMode||"actual"}, diff_adjustments = ${diffStr},
            pf_type = ${pfType||"actual"}, esic_type = ${esicType||"actual"},
            lwf_type = ${lwfType||"na"}, bonus_type = ${bonusType||"actual"},
            basic_salary = ${basicSal}, gross_salary = ${grossSal}, same_as_actual = ${sameAsAct},
            wage_grade_id = ${wageGradeId||null},
            allowances = ${req.body.allowances !== "" && req.body.allowances != null ? parseFloat(req.body.allowances) : null},
            updated_at = ${now}
          WHERE company_id = ${targetCompanyId} AND employee_id = ${employeeId}
        `);
      } else {
        const id = randomUUID();
        await db.execute(sql`
          INSERT INTO compliance_employee_setup
            (id, company_id, employee_id, department, designation, weekly_off, ot_type,
             payment_mode, diff_adjustments, pf_type, esic_type, lwf_type, bonus_type,
             basic_salary, gross_salary, same_as_actual, wage_grade_id, allowances, created_by, created_at, updated_at)
          VALUES
            (${id}, ${targetCompanyId}, ${employeeId}, ${department||null}, ${designation||null},
             ${weeklyOff||"sunday"}, ${otType||"na"}, ${paymentMode||"actual"},
             ${diffStr}, ${pfType||"actual"}, ${esicType||"actual"}, ${lwfType||"na"},
             ${bonusType||"actual"}, ${basicSal}, ${grossSal}, ${sameAsAct}, ${wageGradeId||null},
             ${req.body.allowances !== "" && req.body.allowances != null ? parseFloat(req.body.allowances) : null},
             ${user.id}, ${now}, ${now})
        `);
      }

      const result = await db.execute(sql`
        SELECT * FROM compliance_employee_setup
        WHERE company_id = ${targetCompanyId} AND employee_id = ${employeeId}
        LIMIT 1
      `);
      return res.json(result.rows[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/compliance/employee-list — simple list for dropdowns (no module-access gate)
  app.get("/api/compliance/employee-list", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const companyId = user.role === "super_admin" ? (req.query.companyId as string) : user.company_id;
      if (!companyId) return res.status(400).json({ error: "Company ID required" });
      const rows = await db.execute(sql`
        SELECT id, employee_code, first_name, last_name, designation,
               present_address, present_district, present_state
        FROM employees
        WHERE company_id = ${companyId} AND status = 'active'
        ORDER BY first_name, last_name
      `);
      res.json(rows.rows.map((e: any) => ({
        id: e.id,
        code: e.employee_code || "",
        name: `${e.first_name || ""} ${e.last_name || ""}`.trim(),
        designation: e.designation || "",
        presentAddress: [e.present_address, e.present_district, e.present_state].filter(Boolean).join(", "),
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch employees" });
    }
  });

  // ── GET /api/compliance/clients — list all clients for company
  app.get("/api/compliance/clients", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const companyId = user.role === "super_admin" ? (req.query.companyId as string) : user.company_id;
      if (!companyId) return res.status(400).json({ error: "Company ID required" });
      const rows = await db.execute(sql`
        SELECT c.*,
          (SELECT COUNT(*) FROM compliance_client_employees ce
           WHERE ce.client_id = c.id AND ce.status = 'active') AS active_employees
        FROM compliance_clients c
        WHERE c.company_id = ${companyId}
        ORDER BY c.created_at DESC
      `);
      return res.json(rows.rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/compliance/clients — create client
  app.post("/api/compliance/clients", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId, projectName, clientName, clientAddress, principalEmployerName,
              principalEmployerAddress, natureOfWork, locationOfWork, projectStartDate } = req.body;
      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId) return res.status(400).json({ error: "Company ID required" });
      if (!projectName) return res.status(400).json({ error: "Project name is required" });
      const id = randomUUID();
      const now = new Date().toISOString();
      await db.execute(sql`
        INSERT INTO compliance_clients
          (id, company_id, project_name, client_name, client_address,
           principal_employer_name, principal_employer_address,
           nature_of_work, location_of_work, project_start_date,
           status, created_by, created_at, updated_at)
        VALUES
          (${id}, ${targetCompanyId}, ${projectName}, ${clientName||null}, ${clientAddress||null},
           ${principalEmployerName||null}, ${principalEmployerAddress||null},
           ${natureOfWork||null}, ${locationOfWork||null},
           ${projectStartDate||null}, 'active', ${user.id}, ${now}, ${now})
      `);
      const result = await db.execute(sql`SELECT * FROM compliance_clients WHERE id = ${id}`);
      return res.json(result.rows[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/compliance/clients/:id/end — set end date
  app.patch("/api/compliance/clients/:id/end", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { endDate } = req.body;
      if (!endDate) return res.status(400).json({ error: "End date is required" });
      const now = new Date().toISOString();
      await db.execute(sql`
        UPDATE compliance_clients SET project_end_date = ${endDate}, status = 'ended', updated_at = ${now}
        WHERE id = ${id}
      `);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/compliance/clients/:id — edit client project details
  app.patch("/api/compliance/clients/:id", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const { projectName, clientName, clientAddress, principalEmployerName,
              principalEmployerAddress, natureOfWork, locationOfWork, projectStartDate } = req.body;
      if (!projectName) return res.status(400).json({ error: "Project name is required" });
      const now = new Date().toISOString();
      const companyClause = user.role === "super_admin" ? sql`` : sql` AND company_id = ${user.company_id}`;
      const result = await db.execute(sql`
        UPDATE compliance_clients SET
          project_name = ${projectName},
          client_name = ${clientName || null},
          client_address = ${clientAddress || null},
          principal_employer_name = ${principalEmployerName || null},
          principal_employer_address = ${principalEmployerAddress || null},
          nature_of_work = ${natureOfWork || null},
          location_of_work = ${locationOfWork || null},
          project_start_date = ${projectStartDate || null},
          updated_at = ${now}
        WHERE id = ${id}${companyClause}
        RETURNING *
      `);
      if (result.rows.length === 0) return res.status(404).json({ error: "Project not found" });
      return res.json(result.rows[0]);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /api/compliance/clients/:id — delete client project + its assignments
  app.delete("/api/compliance/clients/:id", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const companyClause = user.role === "super_admin" ? sql`` : sql` AND company_id = ${user.company_id}`;
      const found = await db.execute(sql`SELECT id FROM compliance_clients WHERE id = ${id}${companyClause}`);
      if (found.rows.length === 0) return res.status(404).json({ error: "Project not found" });
      await db.transaction(async (tx) => {
        await tx.execute(sql`DELETE FROM compliance_client_employees WHERE client_id = ${id}`);
        await tx.execute(sql`DELETE FROM compliance_clients WHERE id = ${id}`);
      });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/compliance/clients/:id/employees — list assigned employees
  app.get("/api/compliance/clients/:id/employees", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const rows = await db.execute(sql`
        SELECT ce.*, e.employee_code, e.first_name, e.last_name, e.department
        FROM compliance_client_employees ce
        JOIN employees e ON e.id = ce.employee_id
        WHERE ce.client_id = ${id}
        ORDER BY ce.assigned_date DESC
      `);
      return res.json(rows.rows);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/compliance/clients/:id/assign — assign employee
  app.post("/api/compliance/clients/:id/assign", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const { employeeId, assignedDate, designation, presentAddress } = req.body;
      if (!employeeId || !assignedDate) return res.status(400).json({ error: "Employee and date required" });
      const aeId = randomUUID();
      const now = new Date().toISOString();
      await db.execute(sql`
        INSERT INTO compliance_client_employees
          (id, client_id, employee_id, company_id, assigned_date, designation, present_address, status, created_by, created_at, updated_at)
        SELECT ${aeId}, ${id}, ${employeeId}, company_id, ${assignedDate}, ${designation || null}, ${presentAddress || null}, 'active', ${user.id}, ${now}, ${now}
        FROM compliance_clients WHERE id = ${id}
      `);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/compliance/clients/assignments/:assignId/update — edit designation / present address
  app.patch("/api/compliance/clients/assignments/:assignId/update", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { assignId } = req.params;
      const { designation, presentAddress, assignedDate } = req.body;
      const now = new Date().toISOString();
      await db.execute(sql`
        UPDATE compliance_client_employees
        SET designation    = ${designation    ?? null},
            present_address = ${presentAddress ?? null},
            assigned_date   = COALESCE(${assignedDate || null}, assigned_date),
            updated_at      = ${now}
        WHERE id = ${assignId}
      `);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /api/compliance/clients/assignments/:assignId — permanently remove an assignment
  app.delete("/api/compliance/clients/assignments/:assignId", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { assignId } = req.params;
      await db.execute(sql`
        DELETE FROM compliance_client_employees WHERE id = ${assignId}
      `);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/compliance/clients/assignments/:assignId/deassign — deassign
  app.patch("/api/compliance/clients/assignments/:assignId/deassign", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { assignId } = req.params;
      const { deassignedDate } = req.body;
      if (!deassignedDate) return res.status(400).json({ error: "De-assign date required" });
      const now = new Date().toISOString();
      await db.execute(sql`
        UPDATE compliance_client_employees
        SET deassigned_date = ${deassignedDate}, status = 'inactive', updated_at = ${now}
        WHERE id = ${assignId}
      `);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/compliance/workmen-register — Form IX data
  app.get("/api/compliance/workmen-register", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId, projectId } = req.query as { companyId?: string; projectId?: string };

      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId) return res.status(400).json({ error: "Company ID required" });

      // Company info
      const companyRow = await db.execute(sql`
        SELECT company_name, legal_name, registered_address, signature FROM companies WHERE id = ${targetCompanyId} LIMIT 1
      `);
      const company = companyRow.rows[0] as any;

      // Client info (if project selected)
      let client: any = null;
      if (projectId && projectId !== "company") {
        const clientRow = await db.execute(sql`
          SELECT project_name, client_name, client_address,
                 principal_employer_name, principal_employer_address,
                 nature_of_work, location_of_work, project_start_date
          FROM compliance_clients WHERE id = ${projectId} LIMIT 1
        `);
        client = clientRow.rows[0] || null;
      }

      // Employees — if project selected, only assigned employees; else all company employees
      let empRows: any;
      if (projectId && projectId !== "company") {
        empRows = await db.execute(sql`
          SELECT
            e.id, e.employee_code,
            e.first_name || ' ' || e.last_name AS full_name,
            e.date_of_birth, e.gender,
            e.father_husband_name,
            COALESCE(cce.designation, cs.designation, e.designation, '') AS designation,
            COALESCE(cs.payment_mode, e.payment_mode, 'Monthly') AS wages_period,
            COALESCE(
              NULLIF(CONCAT_WS(', ', NULLIF(e.permanent_address,''), NULLIF(e.permanent_district,''), NULLIF(e.permanent_state,''), NULLIF(e.permanent_pincode,'')), ''),
              ''
            ) AS permanent_address,
            COALESCE(
              cce.present_address,
              NULLIF(CONCAT_WS(', ', NULLIF(e.present_address,''), NULLIF(e.present_district,''), NULLIF(e.present_state,''), NULLIF(e.present_pincode,'')), ''),
              ''
            ) AS present_address,
            e.date_of_joining,
            e.exit_date,
            cce.assigned_date,
            cce.deassigned_date
          FROM compliance_client_employees cce
          JOIN employees e ON e.id = cce.employee_id
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          WHERE cce.client_id = ${projectId}
          ORDER BY cce.assigned_date, e.first_name, e.last_name
        `);
      } else {
        empRows = await db.execute(sql`
          SELECT
            e.id, e.employee_code,
            e.first_name || ' ' || e.last_name AS full_name,
            e.date_of_birth, e.gender,
            e.father_husband_name,
            COALESCE(cs.designation, e.designation, '') AS designation,
            COALESCE(e.payment_mode, 'Monthly') AS wages_period,
            COALESCE(
              NULLIF(CONCAT_WS(', ', NULLIF(e.permanent_address,''), NULLIF(e.permanent_district,''), NULLIF(e.permanent_state,''), NULLIF(e.permanent_pincode,'')), ''),
              ''
            ) AS permanent_address,
            COALESCE(
              NULLIF(CONCAT_WS(', ', NULLIF(e.present_address,''), NULLIF(e.present_district,''), NULLIF(e.present_state,''), NULLIF(e.present_pincode,'')), ''),
              ''
            ) AS present_address,
            e.date_of_joining,
            e.exit_date
          FROM employees e
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          WHERE e.company_id = ${targetCompanyId} AND e.status = 'active'
          ORDER BY e.first_name, e.last_name
        `);
      }

      // Calculate age from DOB
      const now2 = new Date();
      const employees = empRows.rows.map((r: any, idx: number) => {
        let age = "";
        if (r.date_of_birth) {
          const dob = new Date(r.date_of_birth);
          if (!isNaN(dob.getTime())) {
            age = String(now2.getFullYear() - dob.getFullYear());
          }
        }
        const wp = r.wages_period;
        const wagesPeriod = wp === "cash" ? "Cash" : wp === "bank" ? "Monthly" : wp === "both" ? "Monthly" : "Monthly";
        return {
          serialNo:          idx + 1,
          employeeCode:      r.employee_code || "",
          name:              r.full_name || "",
          age:               age,
          sex:               r.gender ? (r.gender === "male" ? "Male" : r.gender === "female" ? "Female" : r.gender) : "",
          fatherHusbandName: r.father_husband_name || "",
          wagesPeriod:       wagesPeriod,
          designation:       r.designation || "",
          permanentAddress:  r.permanent_address || "",
          presentAddress:    r.present_address || "",
          dateOfJoining:     r.date_of_joining || "",
          dateOfLeaving:     r.exit_date || "",
          assignedDate:      r.assigned_date || "",
          deassignedDate:    r.deassigned_date || "",
        };
      });

      return res.json({
        company: {
          name:    company?.company_name || company?.legal_name || "",
          address: company?.registered_address || "",
          signature: company?.signature || null,
        },
        client,
        employees,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/compliance/form-viii — Form VIII (Register of Particulars of Contractors)
  app.get("/api/compliance/form-viii", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId, projectId, month, year } = req.query as Record<string, string>;
      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId) return res.status(400).json({ error: "Company ID required" });

      const companyRow = await db.execute(sql`SELECT company_name, legal_name, registered_address, signature FROM companies WHERE id = ${targetCompanyId} LIMIT 1`);
      const company = companyRow.rows[0] as any;

      let client: any = null;
      if (projectId && projectId !== "company") {
        const clientRow = await db.execute(sql`
          SELECT project_name, client_name, client_address, principal_employer_name, principal_employer_address,
                 nature_of_work, location_of_work, project_start_date, project_end_date
          FROM compliance_clients WHERE id = ${projectId} LIMIT 1`);
        client = clientRow.rows[0] || null;
      }

      // Wage totals for the period from payroll
      let totalWages = 0, disbursedWages = 0, maxWorkmen = 0;
      if (month && year) {
        const monthNum = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month) + 1;
        const monthStr = ["January","February","March","April","May","June","July","August","September","October","November","December"][monthNum - 1] || month;

        let empIds: string[] = [];
        if (projectId && projectId !== "company") {
          const empRow = await db.execute(sql`SELECT employee_id FROM compliance_client_employees WHERE client_id = ${projectId} AND status = 'active'`);
          empIds = empRow.rows.map((r: any) => r.employee_id);
        } else {
          const empRow = await db.execute(sql`SELECT id FROM employees WHERE company_id = ${targetCompanyId} AND status = 'active'`);
          empIds = empRow.rows.map((r: any) => r.id);
        }

        if (empIds.length > 0) {
          const empInList = sql.join(empIds.map((id: string) => sql`${id}`), sql`, `);
          const payrollRow = await db.execute(sql`
            SELECT COALESCE(SUM(total_earnings),0) AS total_wages, COALESCE(SUM(net_salary),0) AS disbursed, COUNT(*) AS cnt
            FROM payroll
            WHERE company_id = ${targetCompanyId}
              AND year = ${parseInt(year)}
              AND month = ${monthStr}
              AND employee_id IN (${empInList})`);
          const pr = payrollRow.rows[0] as any;
          totalWages   = parseInt(pr?.total_wages || "0");
          disbursedWages = parseInt(pr?.disbursed || "0");
          maxWorkmen   = parseInt(pr?.cnt || "0") || empIds.length;
        }
      }

      return res.json({
        company: { name: company?.company_name || company?.legal_name || "", address: company?.registered_address || "", signature: company?.signature || null },
        client,
        month: month || "",
        year: year || "",
        totalWages,
        disbursedWages,
        maxWorkmen,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/compliance/muster-roll — Form XII (Muster Roll)
  app.get("/api/compliance/muster-roll", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId, projectId, month, year } = req.query as Record<string, string>;
      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId || !month || !year) return res.status(400).json({ error: "Company, month, year required" });

      const monthNum = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month) + 1;
      if (monthNum === 0) return res.status(400).json({ error: "Invalid month" });
      const daysInMonth = new Date(parseInt(year), monthNum, 0).getDate();

      const companyRow = await db.execute(sql`SELECT company_name, legal_name, registered_address, signature FROM companies WHERE id = ${targetCompanyId} LIMIT 1`);
      const company = companyRow.rows[0] as any;

      let client: any = null;
      if (projectId && projectId !== "company") {
        const clientRow = await db.execute(sql`SELECT project_name, client_name, client_address, principal_employer_name, principal_employer_address, nature_of_work, location_of_work FROM compliance_clients WHERE id = ${projectId} LIMIT 1`);
        client = clientRow.rows[0] || null;
      }

      // Compute date range first — needed in both the employee query and attendance query
      const startDate = `${year}-${String(monthNum).padStart(2,"0")}-01`;
      const endDate   = `${year}-${String(monthNum).padStart(2,"0")}-${String(daysInMonth).padStart(2,"0")}`;

      // Employees
      let empRows: any;
      if (projectId && projectId !== "company") {
        empRows = await db.execute(sql`
          SELECT e.id, e.first_name || ' ' || e.last_name AS full_name,
                 e.father_husband_name, e.gender,
                 COALESCE(cce.designation, cs.designation, e.designation, '') AS designation
          FROM compliance_client_employees cce
          JOIN employees e ON e.id = cce.employee_id
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          WHERE cce.client_id = ${projectId}
            AND cce.assigned_date::date <= ${endDate}::date
            AND (cce.status = 'active' OR cce.deassigned_date::date >= ${startDate}::date)
          ORDER BY e.first_name, e.last_name`);
      } else {
        empRows = await db.execute(sql`
          SELECT e.id, e.first_name || ' ' || e.last_name AS full_name,
                 e.father_husband_name, e.gender,
                 COALESCE(cs.designation, e.designation, '') AS designation
          FROM employees e
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          WHERE e.company_id = ${targetCompanyId} AND e.status = 'active'
          ORDER BY e.first_name, e.last_name`);
      }

      // Attendance for the month
      const attRows = await db.execute(sql`
        SELECT employee_id, date, status FROM attendance
        WHERE company_id = ${targetCompanyId}
          AND date >= ${startDate} AND date <= ${endDate}
        ORDER BY date`);

      const attMap: Record<string, Record<number, string>> = {};
      for (const a of attRows.rows as any[]) {
        if (!attMap[a.employee_id]) attMap[a.employee_id] = {};
        const day = parseInt(a.date.split("-")[2]);
        let sym = "A";
        if (a.status === "present")   sym = "P";
        else if (a.status === "half_day") sym = "HD";
        else if (a.status === "on_leave") sym = "L";
        else if (a.status === "holiday")  sym = "HD";
        else if (a.status === "weekend")  sym = "WO";
        attMap[a.employee_id][day] = sym;
      }

      const employees = empRows.rows.map((r: any, idx: number) => {
        const att = attMap[r.id] || {};
        let present = 0, woHd = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const s = att[d] || "";
          if (s === "P") present++;
          else if (s === "WO" || s === "HD") woHd++;
        }
        return {
          serialNo: idx + 1,
          name: r.full_name || "",
          fatherHusbandName: r.father_husband_name || "",
          gender: r.gender === "male" ? "Male" : r.gender === "female" ? "Female" : (r.gender || ""),
          designation: r.designation || "",
          attendance: att,
          presentDays: present,
          woHd,
          netPayDays: present + woHd,
        };
      });

      return res.json({ company: { name: company?.company_name || company?.legal_name || "", address: company?.registered_address || "", signature: company?.signature || null }, client, month, year, daysInMonth, employees });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/compliance/wages-register — Form XIII (Register of Wages)
  // Data comes from compliance_employee_setup (rates) + compliance_adjustments (overrides),
  // NOT from raw payroll figures.
  app.get("/api/compliance/wages-register", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId, projectId, month, year } = req.query as Record<string, string>;
      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId || !month || !year) return res.status(400).json({ error: "Company, month, year required" });

      const monthNum = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month) + 1;
      const monthStr = ["January","February","March","April","May","June","July","August","September","October","November","December"][monthNum - 1] || month;
      const PF_CEILING = 15000; const ESIC_CEILING = 21000;

      const companyRow = await db.execute(sql`SELECT company_name, legal_name, registered_address, signature FROM companies WHERE id = ${targetCompanyId} LIMIT 1`);
      const company = companyRow.rows[0] as any;

      let client: any = null;
      if (projectId && projectId !== "company") {
        const clientRow = await db.execute(sql`SELECT project_name, client_name, client_address, principal_employer_name, principal_employer_address, nature_of_work, location_of_work FROM compliance_clients WHERE id = ${projectId} LIMIT 1`);
        client = clientRow.rows[0] || null;
      }

      // Employees with compliance setup rates, falling back to salary_structures when not configured
      // Compute date range first — used both in the employee query and later for payroll/attendance
      const monDays = new Date(parseInt(year), monthNum, 0).getDate();
      const wrFirstDay = `${year}-${String(monthNum).padStart(2,"0")}-01`;
      const wrLastDay  = `${year}-${String(monthNum).padStart(2,"0")}-${String(monDays).padStart(2,"0")}`;

      let empRows: any;
      if (projectId && projectId !== "company") {
        empRows = await db.execute(sql`
          SELECT e.id, e.first_name || ' ' || e.last_name AS full_name,
                 e.father_husband_name,
                 COALESCE(cce.designation, cs.designation, e.designation, '') AS designation,
                 COALESCE(cs.basic_salary, ss.basic_salary, 0)  AS setup_basic,
                 COALESCE(cs.gross_salary, ss.gross_salary, 0)  AS setup_gross,
                 cs.allowances      AS setup_allowances,
                 cs.same_as_actual  AS setup_same_as_actual,
                 ss.gross_salary    AS ss_gross,
                 ss.basic_salary    AS ss_basic,
                 wg.minimum_wage    AS grade_min_wage,
                 COALESCE(cs.pf_type,    'na')  AS pf_type,
                 COALESCE(cs.esic_type,  'na')  AS esic_type,
                 COALESCE(cs.lwf_type,   'na')  AS lwf_type,
                 COALESCE(cs.bonus_type, 'na')  AS bonus_type
          FROM compliance_client_employees cce
          JOIN employees e ON e.id = cce.employee_id
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          LEFT JOIN LATERAL (
            SELECT s.*
            FROM salary_structures s
            WHERE s.employee_id = e.id AND s.company_id = ${targetCompanyId} AND s.status = 'active'
            ORDER BY
              CASE WHEN NULLIF(s.effective_from,'')::date <= ${wrLastDay}::date THEN 0 ELSE 1 END,
              CASE WHEN NULLIF(s.effective_from,'')::date <= ${wrLastDay}::date THEN NULLIF(s.effective_from,'')::date END DESC,
              NULLIF(s.effective_from,'')::date ASC NULLS LAST
            LIMIT 1
          ) ss ON true
          LEFT JOIN wage_grades wg ON wg.id = COALESCE(cs.wage_grade_id, e.wage_grade_id) AND wg.company_id = ${targetCompanyId}
          WHERE cce.client_id = ${projectId}
            AND cce.assigned_date::date <= ${wrLastDay}::date
            AND (cce.status = 'active' OR cce.deassigned_date::date >= ${wrFirstDay}::date)
          ORDER BY e.first_name, e.last_name`);
      } else {
        empRows = await db.execute(sql`
          SELECT e.id, e.first_name || ' ' || e.last_name AS full_name,
                 e.father_husband_name,
                 COALESCE(cs.designation, e.designation, '') AS designation,
                 COALESCE(cs.basic_salary, ss.basic_salary, 0)  AS setup_basic,
                 COALESCE(cs.gross_salary, ss.gross_salary, 0)  AS setup_gross,
                 cs.allowances      AS setup_allowances,
                 cs.same_as_actual  AS setup_same_as_actual,
                 ss.gross_salary    AS ss_gross,
                 ss.basic_salary    AS ss_basic,
                 wg.minimum_wage    AS grade_min_wage,
                 COALESCE(cs.pf_type,    'na')  AS pf_type,
                 COALESCE(cs.esic_type,  'na')  AS esic_type,
                 COALESCE(cs.lwf_type,   'na')  AS lwf_type,
                 COALESCE(cs.bonus_type, 'na')  AS bonus_type
          FROM employees e
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          LEFT JOIN LATERAL (
            SELECT s.*
            FROM salary_structures s
            WHERE s.employee_id = e.id AND s.company_id = ${targetCompanyId} AND s.status = 'active'
            ORDER BY
              CASE WHEN NULLIF(s.effective_from,'')::date <= ${wrLastDay}::date THEN 0 ELSE 1 END,
              CASE WHEN NULLIF(s.effective_from,'')::date <= ${wrLastDay}::date THEN NULLIF(s.effective_from,'')::date END DESC,
              NULLIF(s.effective_from,'')::date ASC NULLS LAST
            LIMIT 1
          ) ss ON true
          LEFT JOIN wage_grades wg ON wg.id = COALESCE(cs.wage_grade_id, e.wage_grade_id) AND wg.company_id = ${targetCompanyId}
          WHERE e.company_id = ${targetCompanyId} AND e.status = 'active'
          ORDER BY e.first_name, e.last_name`);
      }

      const empIds = empRows.rows.map((r: any) => r.id);
      let payrollMap: Record<string, any> = {};
      let adjMap: Record<string, any> = {};
      let attMap: Record<string, any> = {};

      if (empIds.length > 0) {
        const empInList = sql.join(empIds.map((id: string) => sql`${id}`), sql`, `);

        // Attendance: primary source for pay days.
        // Filter by employee_id (not company_id) so CLRA project employees' attendance
        // is found regardless of which company's company_id their records carry.
        // Count present + half_day + weekend (WO) + holiday (HD) — same as Muster Roll Net Days.
        const attRows = await db.execute(sql`
          SELECT employee_id,
                 COUNT(*) FILTER (WHERE status IN ('present','half_day','weekend','holiday')) AS present_days
          FROM attendance
          WHERE employee_id IN (${empInList})
            AND EXTRACT(MONTH FROM date::date) = ${monthNum}
            AND EXTRACT(YEAR  FROM date::date) = ${parseInt(year)}
          GROUP BY employee_id`);
        for (const a of attRows.rows as any[]) attMap[a.employee_id] = a;

        // Payroll: used for deductions + days fallback
        // Use COALESCE(pay_days, present_days, 0) same as compliance adjustment tab
        const payrollRows = await db.execute(sql`
          SELECT employee_id, bonus, pf_employee, esi, lwf_employee,
                 professional_tax, tds, loan_deduction, working_days,
                 COALESCE(pay_days, present_days, 0)  AS pay_days,
                 COALESCE(present_days, pay_days, 0)  AS present_days
          FROM payroll
          WHERE company_id = ${targetCompanyId} AND year = ${parseInt(year)} AND month = ${monthStr}
            AND employee_id IN (${empInList})`);
        for (const p of payrollRows.rows as any[]) payrollMap[p.employee_id] = p;

        // Compliance adjustments — highest priority, override everything
        const adjRows = await db.execute(sql`
          SELECT employee_id,
                 original_attendance, adjusted_attendance,
                 original_basic_salary, adjusted_basic_salary,
                 original_gross_salary, adjusted_gross_salary,
                 original_net_salary,  adjusted_net_salary
          FROM compliance_adjustments
          WHERE company_id = ${targetCompanyId} AND month = ${monthStr} AND year = ${parseInt(year)}
            AND employee_id IN (${empInList})`);
        for (const a of adjRows.rows as any[]) adjMap[a.employee_id] = a;
      }

      const employees = empRows.rows.map((r: any, idx: number) => {
        const p   = payrollMap[r.id] || {};
        const att = attMap[r.id]     || {};
        const adj = adjMap[r.id]     || null;

        // Rate mirrors the Compliance Adjustment tab exactly (the trusted source):
        //   Basic = wage-grade minimum wage if set, else compliance setup basic.
        //   Allowances = configured compliance allowances when set, else (actual gross − basic).
        // "Same as actual payroll" (default ON): Basic AND Allowances mirror the actual
        // salary structure. When OFF: Basic = wage-grade minimum wage, Allowances = custom value.
        const sameAsActual = r.setup_same_as_actual !== false;
        const setupBasic = sameAsActual
          ? Number(r.ss_basic ?? r.setup_basic ?? 0)
          : (r.grade_min_wage != null ? Number(r.grade_min_wage) : Number(r.setup_basic || 0));
        const ssGross = Number(r.ss_gross || r.setup_gross || 0);
        const hasCustomAllowances = r.setup_allowances != null && !sameAsActual;
        const setupHra = hasCustomAllowances
          ? Number(r.setup_allowances)
          : Math.max(0, ssGross - setupBasic);
        const setupRateTotal = setupBasic + setupHra;

        // Pay days priority:
        //   1. adjusted_attendance (manual override in adjustment tab)
        //   2. original_attendance (calculated value shown in adjustment tab)
        //   3. attendance table present_days (same as compliance tab logic)
        //   4. payroll COALESCE(pay_days, present_days, working_days)
        const _adjAtt  = adj?.adjusted_attendance != null ? Number(adj.adjusted_attendance) : null;
        const _origAtt = adj?.original_attendance  != null ? Number(adj.original_attendance) : null;
        const _attDays = att.present_days != null ? Number(att.present_days) : null;
        const _payDays = p.pay_days != null ? Number(p.pay_days) : null;
        const _presDays = p.present_days != null ? Number(p.present_days) : null;
        console.log(`[WR] emp=${r.full_name} adj_att=${_adjAtt} orig_att=${_origAtt} att_present=${_attDays} pay_days=${_payDays} present_days=${_presDays} working_days=${p.working_days}`);
        const payDays = _adjAtt  != null ? _adjAtt
                      : _origAtt != null ? _origAtt
                      : _attDays != null ? _attDays
                      : _payDays != null ? _payDays
                      : _presDays != null ? _presDays
                      : 0;

        // Denominator = calendar days in the month (matches compliance adjustment tab logic)
        const wDays = monDays;

        // Bonus: "actual" = from payroll, otherwise 0
        const bonus = r.bonus_type === "actual" ? Number(p.bonus || 0) : 0;

        // Compliance earnings — prorated by calendar days in month (matches compliance tab)
        // compGross = compBasic + compHra (from rate components, NOT from setupGross)
        let compBasic = payDays > 0 ? Math.round(setupBasic * payDays / wDays) : 0;
        let compHra   = payDays > 0 ? Math.round(setupHra   * payDays / wDays) : 0;
        let compGross = compBasic + compHra;

        // Compliance adjustment overrides (highest priority)
        if (adj?.adjusted_gross_salary != null) {
          compGross = Number(adj.adjusted_gross_salary);
          if (adj.adjusted_basic_salary != null) {
            compBasic = Number(adj.adjusted_basic_salary);
          } else {
            compBasic = setupRateTotal > 0 ? Math.round(compGross * setupBasic / setupRateTotal) : 0;
          }
          compHra = Math.max(0, compGross - compBasic);
        }

        const totalEarnings = compGross + bonus;

        // PF — "actual" uses payroll; otherwise calculated from compliance setup
        let pf = 0;
        if (r.pf_type === "actual")     pf = Math.round(Number(p.pf_employee || 0));
        else if (r.pf_type !== "na") {
          const pfBase = Math.min(compBasic, Math.round(PF_CEILING * payDays / wDays));
          pf = Math.round(pfBase * 0.12);
        }

        // ESI — "actual" uses payroll; otherwise calculated from compliance setup
        let esi = 0;
        if (r.esic_type === "actual")   esi = Math.round(Number(p.esi || 0));
        else if (r.esic_type !== "na") {
          const esicCeil = Math.round(ESIC_CEILING * payDays / wDays);
          if (totalEarnings <= esicCeil) esi = Math.round(totalEarnings * 0.0075);
        }

        // LWF — "actual" uses payroll; otherwise fixed 25
        let lwf = 0;
        if (r.lwf_type === "actual")    lwf = Math.round(Number(p.lwf_employee || 0));
        else if (r.lwf_type !== "na")   lwf = 25;

        const pt            = Number(p.professional_tax || 0);
        const tds           = Number(p.tds              || 0);
        const loanDeduction = Number(p.loan_deduction   || 0);
        const totalDeductions = pf + esi + lwf + pt + tds + loanDeduction;

        // Net salary: compliance adjustment → calculated
        const netSalary = adj?.adjusted_net_salary != null
          ? Number(adj.adjusted_net_salary)
          : totalEarnings - totalDeductions;

        return {
          serialNo:         idx + 1,
          name:             r.full_name || "",
          fatherHusbandName: r.father_husband_name || "",
          designation:      r.designation || "",
          monthlyRate:      setupRateTotal,   // Basic + Allowances (rate total, not gross)
          setupBasic:       setupBasic,
          setupHra:         setupHra,          // From cs.allowances when set, else gross-basic
          setupRateTotal:   setupRateTotal,
          payDays,
          workingDays:      wDays,
          basicSalary:      compBasic,
          hra:              compHra,
          conveyance:       0,
          medicalAllowance: 0,
          specialAllowance: 0,
          otherAllowances:  0,
          bonus,
          totalEarnings,
          pf,
          esi,
          pt,
          lwf,
          tds,
          loanDeduction,
          otherDeductions:  0,
          totalDeductions,
          netSalary,
        };
      });

      return res.json({ company: { name: company?.company_name || company?.legal_name || "", address: company?.registered_address || "", signature: company?.signature || null }, client, month, year, employees });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/compliance/ot-register — Form XVIII (Register of OT)
  app.get("/api/compliance/ot-register", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { companyId, projectId, month, year } = req.query as Record<string, string>;
      const targetCompanyId = user.role === "super_admin" ? companyId : user.company_id;
      if (!targetCompanyId || !month || !year) return res.status(400).json({ error: "Company, month, year required" });

      const monthNum = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month) + 1;
      const monthStr = ["January","February","March","April","May","June","July","August","September","October","November","December"][monthNum - 1] || month;

      const companyRow = await db.execute(sql`SELECT company_name, legal_name, registered_address, signature FROM companies WHERE id = ${targetCompanyId} LIMIT 1`);
      const company = companyRow.rows[0] as any;

      let client: any = null;
      if (projectId && projectId !== "company") {
        const clientRow = await db.execute(sql`SELECT project_name, client_name, client_address, principal_employer_name, principal_employer_address, nature_of_work, location_of_work FROM compliance_clients WHERE id = ${projectId} LIMIT 1`);
        client = clientRow.rows[0] || null;
      }

      const otMonthEnd = `${year}-${String(monthNum).padStart(2,"0")}-${String(new Date(parseInt(year), monthNum, 0).getDate()).padStart(2,"0")}`;
      let empRows: any;
      if (projectId && projectId !== "company") {
        empRows = await db.execute(sql`
          SELECT e.id, e.first_name || ' ' || e.last_name AS full_name,
                 COALESCE(cce.designation, cs.designation, e.designation, '') AS designation,
                 COALESCE(cs.basic_salary, ss.basic_salary, 0)  AS setup_basic,
                 COALESCE(cs.gross_salary, ss.gross_salary, 0)  AS setup_gross,
                 cs.allowances      AS setup_allowances,
                 cs.same_as_actual  AS setup_same_as_actual,
                 ss.gross_salary    AS ss_gross,
                 ss.basic_salary    AS ss_basic,
                 wg.minimum_wage    AS grade_min_wage
          FROM compliance_client_employees cce
          JOIN employees e ON e.id = cce.employee_id
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          LEFT JOIN LATERAL (
            SELECT s.*
            FROM salary_structures s
            WHERE s.employee_id = e.id AND s.company_id = ${targetCompanyId} AND s.status = 'active'
            ORDER BY
              CASE WHEN NULLIF(s.effective_from,'')::date <= ${otMonthEnd}::date THEN 0 ELSE 1 END,
              CASE WHEN NULLIF(s.effective_from,'')::date <= ${otMonthEnd}::date THEN NULLIF(s.effective_from,'')::date END DESC,
              NULLIF(s.effective_from,'')::date ASC NULLS LAST
            LIMIT 1
          ) ss ON true
          LEFT JOIN wage_grades wg ON wg.id = COALESCE(cs.wage_grade_id, e.wage_grade_id) AND wg.company_id = ${targetCompanyId}
          WHERE cce.client_id = ${projectId} AND cce.status = 'active'
          ORDER BY e.first_name, e.last_name`);
      } else {
        empRows = await db.execute(sql`
          SELECT e.id, e.first_name || ' ' || e.last_name AS full_name,
                 COALESCE(cs.designation, e.designation, '') AS designation,
                 COALESCE(cs.basic_salary, ss.basic_salary, 0)  AS setup_basic,
                 COALESCE(cs.gross_salary, ss.gross_salary, 0)  AS setup_gross,
                 cs.allowances      AS setup_allowances,
                 cs.same_as_actual  AS setup_same_as_actual,
                 ss.gross_salary    AS ss_gross,
                 ss.basic_salary    AS ss_basic,
                 wg.minimum_wage    AS grade_min_wage
          FROM employees e
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          LEFT JOIN LATERAL (
            SELECT s.*
            FROM salary_structures s
            WHERE s.employee_id = e.id AND s.company_id = ${targetCompanyId} AND s.status = 'active'
            ORDER BY
              CASE WHEN NULLIF(s.effective_from,'')::date <= ${otMonthEnd}::date THEN 0 ELSE 1 END,
              CASE WHEN NULLIF(s.effective_from,'')::date <= ${otMonthEnd}::date THEN NULLIF(s.effective_from,'')::date END DESC,
              NULLIF(s.effective_from,'')::date ASC NULLS LAST
            LIMIT 1
          ) ss ON true
          LEFT JOIN wage_grades wg ON wg.id = COALESCE(cs.wage_grade_id, e.wage_grade_id) AND wg.company_id = ${targetCompanyId}
          WHERE e.company_id = ${targetCompanyId} AND e.status = 'active'
          ORDER BY e.first_name, e.last_name`);
      }

      const empIds = empRows.rows.map((r: any) => r.id);
      const startDate = `${year}-${String(monthNum).padStart(2,"0")}-01`;
      const endDate   = `${year}-${String(monthNum).padStart(2,"0")}-${String(new Date(parseInt(year), monthNum, 0).getDate()).padStart(2,"0")}`;

      // OT hours from attendance
      let otMap: Record<string, { otHours: number; otDays: number }> = {};
      if (empIds.length > 0) {
        const empInList = sql.join(empIds.map((id: string) => sql`${id}`), sql`, `);
        const otRows = await db.execute(sql`
          SELECT employee_id,
                 COUNT(CASE WHEN ot_hours IS NOT NULL AND ot_hours != '' AND ot_hours != '0' THEN 1 END) AS ot_days,
                 COALESCE(SUM(
                   CASE
                     WHEN ot_hours IS NULL OR ot_hours = '' OR ot_hours = '0' THEN 0
                     WHEN POSITION(':' IN ot_hours) > 0 THEN
                       SPLIT_PART(ot_hours, ':', 1)::integer * 60 + SPLIT_PART(ot_hours, ':', 2)::integer
                     WHEN ot_hours ~ '^[0-9]+(\.[0-9]+)?$' THEN (ot_hours::numeric * 60)::integer
                     ELSE 0
                   END
                 ) / 60.0, 0) AS ot_hours_total
          FROM attendance
          WHERE date >= ${startDate} AND date <= ${endDate}
            AND employee_id IN (${empInList})
          GROUP BY employee_id`);
        for (const o of otRows.rows as any[]) {
          otMap[o.employee_id] = { otHours: parseFloat(o.ot_hours_total || "0"), otDays: parseInt(o.ot_days || "0") };
        }
      }

      // Payroll for normal wages
      let payrollMap: Record<string, any> = {};
      if (empIds.length > 0) {
        const empInList2 = sql.join(empIds.map((id: string) => sql`${id}`), sql`, `);
        const payrollRows = await db.execute(sql`
          SELECT employee_id, basic_salary, total_earnings, net_salary, working_days, pay_days
          FROM payroll
          WHERE company_id = ${targetCompanyId} AND year = ${parseInt(year)} AND month = ${monthStr}
            AND employee_id IN (${empInList2})`);
        for (const p of payrollRows.rows as any[]) payrollMap[p.employee_id] = p;
      }

      const employees = empRows.rows.map((r: any, idx: number) => {
        const p = payrollMap[r.id] || {};
        const ot = otMap[r.id] || { otHours: 0, otDays: 0 };

        // "Same as actual payroll" (default ON): Basic AND Allowances mirror the actual
        // salary structure. When OFF: Basic = wage-grade minimum wage, Allowances = custom value.
        const sameAsActual = r.setup_same_as_actual !== false;
        const setupBasic = sameAsActual
          ? Number(r.ss_basic ?? r.setup_basic ?? 0)
          : (r.grade_min_wage != null ? Number(r.grade_min_wage) : Number(r.setup_basic || 0));
        const ssGross = Number(r.ss_gross || r.setup_gross || 0);
        const hasCustomAllowances = r.setup_allowances != null && !sameAsActual;
        const setupHra = hasCustomAllowances
          ? Number(r.setup_allowances)
          : Math.max(0, ssGross - setupBasic);
        const setupRateTotal = setupBasic + setupHra;

        const workingDays = p.working_days || 26;
        // OT rate derived from compliance basic
        const dailyRate = workingDays > 0 ? Math.round(setupBasic / workingDays) : 0;
        const hourlyRate = Math.round(dailyRate / 8);
        const otWages = Math.round(hourlyRate * ot.otHours * 2);
        return {
          serialNo:   idx + 1,
          name:       r.full_name || "",
          designation: r.designation || "",
          normalDays: p.pay_days || 0,
          otDays:     ot.otDays,
          otHours:    ot.otHours,
          normalWages: setupRateTotal,
          otWages,
        };
      });

      return res.json({ company: { name: company?.company_name || company?.legal_name || "", address: company?.registered_address || "", signature: company?.signature || null }, client, month, year, employees });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
}
