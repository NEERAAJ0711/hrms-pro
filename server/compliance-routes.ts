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

  // ── Ensure carry-forward table exists ─────────────────────────────────────
  db.execute(sql`
    CREATE TABLE IF NOT EXISTS compliance_carry_forward (
      id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
      company_id    VARCHAR(36) NOT NULL,
      employee_id   VARCHAR(36) NOT NULL,
      month         TEXT        NOT NULL,
      year          INTEGER     NOT NULL,
      carry_fwd_amount INTEGER  NOT NULL DEFAULT 0,
      created_at    TEXT        NOT NULL,
      updated_at    TEXT        NOT NULL,
      UNIQUE (company_id, employee_id, month, year)
    )
  `).catch(() => {}); // ignore if already exists

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

      // All employees with compliance setup (dept/designation/basic/gross) + salary structure conveyance
      const empRows = await db.execute(sql`
        SELECT
          e.id, e.employee_code, e.first_name, e.last_name,
          e.date_of_joining,
          COALESCE(cs.department,  e.department,  '') AS department,
          COALESCE(cs.designation, e.designation, '') AS designation,
          cs.basic_salary      AS setup_basic,
          cs.gross_salary      AS setup_gross,
          cs.pf_type           AS setup_pf_type,
          cs.esic_type         AS setup_esic_type,
          cs.lwf_type          AS setup_lwf_type,
          cs.bonus_type        AS setup_bonus_type,
          cs.diff_adjustments  AS setup_diff_adj,
          cs.ot_type           AS setup_ot_type,
          cs.payment_mode      AS setup_payment_mode,
          ss.conveyance        AS ss_conv,
          COALESCE(e.pf_applicable,  false) AS pf_applicable,
          COALESCE(e.esi_applicable, false) AS esi_applicable,
          COALESCE(e.lwf_applicable, false) AS lwf_applicable
        FROM employees e
        LEFT JOIN compliance_employee_setup cs
          ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
        LEFT JOIN salary_structures ss
          ON ss.employee_id = e.id AND ss.company_id = ${targetCompanyId} AND ss.status = 'active'
        WHERE e.company_id = ${targetCompanyId} AND e.status = 'active'
        ORDER BY e.employee_code
      `);

      // Month index (1-based) and boundary helpers for DOJ filtering
      const monthIndex    = ["January","February","March","April","May","June","July","August","September","October","November","December"].indexOf(month) + 1;
      const monthFirstDay = new Date(yearNum, monthIndex - 1, 1);
      const monthLastDay  = new Date(yearNum, monthIndex, 0);

      // Full payroll breakdown for month/year
      const payrollRows = await db.execute(sql`
        SELECT employee_id,
          basic_salary, hra, conveyance,
          COALESCE(medical_allowance,0)+COALESCE(special_allowance,0)+COALESCE(other_allowances,0) AS other_earn,
          COALESCE(bonus,0) AS bonus,
          total_earnings,
          COALESCE(pf_employee,0)       AS pf,
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
      const attRows = await db.execute(sql`
        SELECT employee_id,
          COUNT(*) FILTER (WHERE status IN ('present','half_day')) AS present_days,
          SUM(COALESCE(ot_hours::numeric, 0)) AS total_ot_hours
        FROM attendance
        WHERE company_id = ${targetCompanyId}
          AND EXTRACT(MONTH FROM date::date) = ${monthIndex}
          AND EXTRACT(YEAR FROM date::date) = ${yearNum}
        GROUP BY employee_id
      `);
      const attMap: Record<string, any> = {};
      for (const a of attRows.rows) attMap[a.employee_id as string] = a;

      // Existing compliance adjustments
      const adjRows = await db.execute(sql`
        SELECT * FROM compliance_adjustments
        WHERE company_id = ${targetCompanyId}
          AND month = ${month}
          AND year = ${yearNum}
      `);
      const adjMap: Record<string, any> = {};
      for (const a of adjRows.rows) adjMap[a.employee_id as string] = a;

      // Previous month carry-forward lookup
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

        // Rate from compliance setup
        const rBasic = Number(emp.setup_basic  || 0);
        const rTotal = Number(emp.setup_gross  || 0);
        const rConv  = Number(emp.ss_conv      || 0);
        const rHra   = Math.max(0, rTotal - rBasic); // HRA = Gross - Basic

        return {
          employeeId:    emp.id,
          employeeCode:  emp.employee_code,
          employeeName:  `${emp.first_name} ${emp.last_name}`.trim(),
          department:    emp.department,
          designation:   emp.designation,
          // Days
          monDays:       Number(monDays),
          payDays:       Number(att.present_days || pay.pay_days || 0),
          // Rate (from compliance setup — as instructed)
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
          ss.basic_salary AS struct_basic,
          ss.gross_salary AS struct_gross
        FROM employees e
        LEFT JOIN compliance_employee_setup cs
          ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
        LEFT JOIN salary_structures ss
          ON ss.employee_id = e.id AND ss.company_id = ${targetCompanyId} AND ss.status = 'active'
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
        sameAsActual:         r.same_as_actual || false,
        originalBasicSalary:  Number(r.struct_basic || 0),
        originalGrossSalary:  Number(r.struct_gross || 0),
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
              updated_at       = ${now}
            WHERE company_id = ${targetCompanyId} AND employee_id = ${s.employeeId}
          `);
        } else {
          const id = randomUUID();
          await db.execute(sql`
            INSERT INTO compliance_employee_setup
              (id, company_id, employee_id, department, designation, weekly_off, ot_type,
               payment_mode, diff_adjustments, pf_type, esic_type, lwf_type, bonus_type,
               basic_salary, gross_salary, same_as_actual, created_by, created_at, updated_at)
            VALUES
              (${id}, ${targetCompanyId}, ${s.employeeId}, ${s.department||null}, ${s.designation||null},
               ${s.weeklyOff||"sunday"}, ${s.otType||"na"}, ${s.paymentMode||"actual"},
               ${diffStr}, ${s.pfType||"actual"}, ${s.esicType||"actual"}, ${s.lwfType||"na"},
               ${s.bonusType||"actual"}, ${basicSal}, ${grossSal}, ${sameAsAct}, ${user.id}, ${now}, ${now})
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
              pfType, esicType, lwfType, bonusType, basicSalary, grossSalary, sameAsActual } = req.body;
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
            updated_at = ${now}
          WHERE company_id = ${targetCompanyId} AND employee_id = ${employeeId}
        `);
      } else {
        const id = randomUUID();
        await db.execute(sql`
          INSERT INTO compliance_employee_setup
            (id, company_id, employee_id, department, designation, weekly_off, ot_type,
             payment_mode, diff_adjustments, pf_type, esic_type, lwf_type, bonus_type,
             basic_salary, gross_salary, same_as_actual, created_by, created_at, updated_at)
          VALUES
            (${id}, ${targetCompanyId}, ${employeeId}, ${department||null}, ${designation||null},
             ${weeklyOff||"sunday"}, ${otType||"na"}, ${paymentMode||"actual"},
             ${diffStr}, ${pfType||"actual"}, ${esicType||"actual"}, ${lwfType||"na"},
             ${bonusType||"actual"}, ${basicSal}, ${grossSal}, ${sameAsAct}, ${user.id}, ${now}, ${now})
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

  // ── GET /api/compliance/clients/:id/employees — list assigned employees
  app.get("/api/compliance/clients/:id/employees", requireAuth, attachUser, requireAdminRole, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const rows = await db.execute(sql`
        SELECT ce.*, e.employee_code, e.first_name, e.last_name, e.department, e.designation
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
      const { employeeId, assignedDate } = req.body;
      if (!employeeId || !assignedDate) return res.status(400).json({ error: "Employee and date required" });
      const aeId = randomUUID();
      const now = new Date().toISOString();
      await db.execute(sql`
        INSERT INTO compliance_client_employees
          (id, client_id, employee_id, company_id, assigned_date, status, created_by, created_at, updated_at)
        SELECT ${aeId}, ${id}, ${employeeId}, company_id, ${assignedDate}, 'active', ${user.id}, ${now}, ${now}
        FROM compliance_clients WHERE id = ${id}
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
        SELECT company_name, legal_name, registered_address FROM companies WHERE id = ${targetCompanyId} LIMIT 1
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
            COALESCE(cs.designation, e.designation, '') AS designation,
            COALESCE(cs.payment_mode, e.payment_mode, 'Monthly') AS wages_period,
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
          FROM compliance_client_employees cce
          JOIN employees e ON e.id = cce.employee_id
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          WHERE cce.client_id = ${projectId} AND cce.status = 'active'
          ORDER BY e.first_name, e.last_name
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
        };
      });

      return res.json({
        company: {
          name:    company?.company_name || company?.legal_name || "",
          address: company?.registered_address || "",
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

      const companyRow = await db.execute(sql`SELECT company_name, legal_name, registered_address FROM companies WHERE id = ${targetCompanyId} LIMIT 1`);
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
        company: { name: company?.company_name || company?.legal_name || "", address: company?.registered_address || "" },
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

      const companyRow = await db.execute(sql`SELECT company_name, legal_name, registered_address FROM companies WHERE id = ${targetCompanyId} LIMIT 1`);
      const company = companyRow.rows[0] as any;

      let client: any = null;
      if (projectId && projectId !== "company") {
        const clientRow = await db.execute(sql`SELECT project_name, client_name, client_address, principal_employer_name, principal_employer_address, nature_of_work, location_of_work FROM compliance_clients WHERE id = ${projectId} LIMIT 1`);
        client = clientRow.rows[0] || null;
      }

      // Employees
      let empRows: any;
      if (projectId && projectId !== "company") {
        empRows = await db.execute(sql`
          SELECT e.id, e.first_name || ' ' || e.last_name AS full_name,
                 e.father_husband_name, e.gender,
                 COALESCE(cs.designation, e.designation, '') AS designation
          FROM compliance_client_employees cce
          JOIN employees e ON e.id = cce.employee_id
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          WHERE cce.client_id = ${projectId} AND cce.status = 'active'
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
      const startDate = `${year}-${String(monthNum).padStart(2,"0")}-01`;
      const endDate   = `${year}-${String(monthNum).padStart(2,"0")}-${String(daysInMonth).padStart(2,"0")}`;
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

      return res.json({ company: { name: company?.company_name || company?.legal_name || "", address: company?.registered_address || "" }, client, month, year, daysInMonth, employees });
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

      const companyRow = await db.execute(sql`SELECT company_name, legal_name, registered_address FROM companies WHERE id = ${targetCompanyId} LIMIT 1`);
      const company = companyRow.rows[0] as any;

      let client: any = null;
      if (projectId && projectId !== "company") {
        const clientRow = await db.execute(sql`SELECT project_name, client_name, client_address, principal_employer_name, principal_employer_address, nature_of_work, location_of_work FROM compliance_clients WHERE id = ${projectId} LIMIT 1`);
        client = clientRow.rows[0] || null;
      }

      // Employees with compliance setup rates
      let empRows: any;
      if (projectId && projectId !== "company") {
        empRows = await db.execute(sql`
          SELECT e.id, e.first_name || ' ' || e.last_name AS full_name,
                 e.father_husband_name,
                 COALESCE(cs.designation, e.designation, '') AS designation,
                 COALESCE(cs.basic_salary, 0)   AS setup_basic,
                 COALESCE(cs.gross_salary, 0)   AS setup_gross,
                 COALESCE(cs.pf_type,    'na')  AS pf_type,
                 COALESCE(cs.esic_type,  'na')  AS esic_type,
                 COALESCE(cs.lwf_type,   'na')  AS lwf_type,
                 COALESCE(cs.bonus_type, 'na')  AS bonus_type
          FROM compliance_client_employees cce
          JOIN employees e ON e.id = cce.employee_id
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          WHERE cce.client_id = ${projectId} AND cce.status = 'active'
          ORDER BY e.first_name, e.last_name`);
      } else {
        empRows = await db.execute(sql`
          SELECT e.id, e.first_name || ' ' || e.last_name AS full_name,
                 e.father_husband_name,
                 COALESCE(cs.designation, e.designation, '') AS designation,
                 COALESCE(cs.basic_salary, 0)   AS setup_basic,
                 COALESCE(cs.gross_salary, 0)   AS setup_gross,
                 COALESCE(cs.pf_type,    'na')  AS pf_type,
                 COALESCE(cs.esic_type,  'na')  AS esic_type,
                 COALESCE(cs.lwf_type,   'na')  AS lwf_type,
                 COALESCE(cs.bonus_type, 'na')  AS bonus_type
          FROM employees e
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          WHERE e.company_id = ${targetCompanyId} AND e.status = 'active'
          ORDER BY e.first_name, e.last_name`);
      }

      const empIds = empRows.rows.map((r: any) => r.id);
      let payrollMap: Record<string, any> = {};
      let adjMap: Record<string, any> = {};
      if (empIds.length > 0) {
        const empInList = sql.join(empIds.map((id: string) => sql`${id}`), sql`, `);
        // Payroll: reference for pay_days/working_days + actual values for "actual" compliance types
        const payrollRows = await db.execute(sql`
          SELECT employee_id, bonus, pf_employee, esi, lwf_employee,
                 professional_tax, tds, loan_deduction, working_days, present_days, pay_days
          FROM payroll
          WHERE company_id = ${targetCompanyId} AND year = ${parseInt(year)} AND month = ${monthStr}
            AND employee_id IN (${empInList})`);
        for (const p of payrollRows.rows as any[]) payrollMap[p.employee_id] = p;

        // Compliance adjustments override everything
        const adjRows = await db.execute(sql`
          SELECT employee_id, adjusted_attendance, adjusted_basic_salary,
                 adjusted_gross_salary, adjusted_net_salary
          FROM compliance_adjustments
          WHERE company_id = ${targetCompanyId} AND month = ${monthStr} AND year = ${parseInt(year)}
            AND employee_id IN (${empInList})`);
        for (const a of adjRows.rows as any[]) adjMap[a.employee_id] = a;
      }

      const employees = empRows.rows.map((r: any, idx: number) => {
        const p = payrollMap[r.id] || {};
        const adj = adjMap[r.id] || null;

        const setupBasic   = Number(r.setup_basic  || 0);
        const setupGross   = Number(r.setup_gross  || 0);
        const workingDays  = Number(p.working_days || 26);
        // Pay days: adjusted attendance > actual payroll > 0
        const payDays = adj?.adjusted_attendance != null
          ? Number(adj.adjusted_attendance)
          : Number(p.pay_days || p.present_days || 0);

        // Bonus: "actual" = from payroll, otherwise 0
        const bonus = r.bonus_type === "actual" ? Number(p.bonus || 0) : 0;

        // Compliance earnings (prorated from compliance setup)
        let compGross = payDays > 0 && workingDays > 0 ? Math.round(setupGross * payDays / workingDays) : 0;
        let compBasic = payDays > 0 && workingDays > 0 ? Math.round(setupBasic * payDays / workingDays) : 0;
        let compHra   = compGross - compBasic;

        // Override with adjustments if present
        if (adj?.adjusted_gross_salary != null) {
          compGross = Number(adj.adjusted_gross_salary);
          if (adj.adjusted_basic_salary != null) {
            compBasic = Number(adj.adjusted_basic_salary);
          } else {
            compBasic = setupGross > 0 ? Math.round(compGross * setupBasic / setupGross) : 0;
          }
          compHra = compGross - compBasic;
        }

        const totalEarnings = compGross + bonus;

        // PF deduction from compliance type
        let pf = 0;
        if (r.pf_type === "actual")      pf = Math.round(Number(p.pf_employee || 0));
        else if (r.pf_type !== "na") {
          const pfBase = Math.min(compBasic, Math.round(PF_CEILING * payDays / workingDays));
          pf = Math.round(pfBase * 0.12);
        }

        // ESI deduction from compliance type
        let esi = 0;
        if (r.esic_type === "actual")    esi = Math.round(Number(p.esi || 0));
        else if (r.esic_type !== "na") {
          const esicCeil = Math.round(ESIC_CEILING * payDays / workingDays);
          if (totalEarnings <= esicCeil)  esi = Math.round(totalEarnings * 0.0075);
        }

        // LWF from compliance type
        let lwf = 0;
        if (r.lwf_type === "actual")     lwf = Math.round(Number(p.lwf_employee || 0));
        else if (r.lwf_type !== "na")    lwf = 25;

        const pt           = Number(p.professional_tax || 0);
        const tds          = Number(p.tds              || 0);
        const loanDeduction = Number(p.loan_deduction  || 0);
        const totalDeductions = pf + esi + lwf + pt + tds + loanDeduction;
        const netSalary = adj?.adjusted_net_salary != null
          ? Number(adj.adjusted_net_salary)
          : totalEarnings - totalDeductions;

        return {
          serialNo:         idx + 1,
          name:             r.full_name || "",
          fatherHusbandName: r.father_husband_name || "",
          designation:      r.designation || "",
          monthlyRate:      setupGross,
          payDays,
          workingDays,
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

      return res.json({ company: { name: company?.company_name || company?.legal_name || "", address: company?.registered_address || "" }, client, month, year, employees });
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

      const companyRow = await db.execute(sql`SELECT company_name, legal_name, registered_address FROM companies WHERE id = ${targetCompanyId} LIMIT 1`);
      const company = companyRow.rows[0] as any;

      let client: any = null;
      if (projectId && projectId !== "company") {
        const clientRow = await db.execute(sql`SELECT project_name, client_name, client_address, principal_employer_name, principal_employer_address, nature_of_work, location_of_work FROM compliance_clients WHERE id = ${projectId} LIMIT 1`);
        client = clientRow.rows[0] || null;
      }

      let empRows: any;
      if (projectId && projectId !== "company") {
        empRows = await db.execute(sql`
          SELECT e.id, e.first_name || ' ' || e.last_name AS full_name,
                 COALESCE(cs.designation, e.designation, '') AS designation
          FROM compliance_client_employees cce
          JOIN employees e ON e.id = cce.employee_id
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
          WHERE cce.client_id = ${projectId} AND cce.status = 'active'
          ORDER BY e.first_name, e.last_name`);
      } else {
        empRows = await db.execute(sql`
          SELECT e.id, e.first_name || ' ' || e.last_name AS full_name,
                 COALESCE(cs.designation, e.designation, '') AS designation
          FROM employees e
          LEFT JOIN compliance_employee_setup cs ON cs.employee_id = e.id AND cs.company_id = ${targetCompanyId}
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
                 COALESCE(SUM(CASE WHEN ot_hours ~ '^[0-9]+(\.[0-9]+)?$' THEN ot_hours::numeric ELSE 0 END), 0) AS ot_hours_total
          FROM attendance
          WHERE company_id = ${targetCompanyId} AND date >= ${startDate} AND date <= ${endDate}
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
        const workingDays = p.working_days || 26;
        const dailyRate = workingDays > 0 ? Math.round((p.basic_salary || 0) / workingDays) : 0;
        const hourlyRate = Math.round(dailyRate / 8);
        const otWages = Math.round(hourlyRate * ot.otHours * 2);
        return {
          serialNo:   idx + 1,
          name:       r.full_name || "",
          designation: r.designation || "",
          normalDays: p.pay_days || 0,
          otDays:     ot.otDays,
          otHours:    ot.otHours,
          normalWages: p.net_salary || 0,
          otWages,
        };
      });

      return res.json({ company: { name: company?.company_name || company?.legal_name || "", address: company?.registered_address || "" }, client, month, year, employees });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
}
