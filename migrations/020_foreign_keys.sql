-- 020_foreign_keys.sql
  -- Task #8: Database hardening — add foreign-key constraints with sensible cascades.
  -- Until now all relationships were application-enforced only (zero FKs in the DB).
  --
  -- SAFETY / IDEMPOTENCY:
  --   * Every constraint is guarded by a pg_constraint NOT EXISTS check, so this
  --     file can be re-run safely (no-op if already applied).
  --   * The whole file runs inside one transaction (scripts/run-migrations.cjs wraps
  --     each migration in BEGIN/COMMIT), so a failure rolls back cleanly — no partial state.
  --   * Constraint names follow Drizzle's convention ({table}_{col}_{parent}_id_fk) so
  --     drizzle-kit "db:push" sees them as already-present and makes no changes.
  --
  -- ORPHAN HANDLING:
  --   * Step 1 defensively NULLs out dangling OPTIONAL (nullable) references so the
  --     constraints below apply cleanly. This only clears pointers to rows that no
  --     longer exist; no business rows are deleted.
  --   * NOT NULL references (ON DELETE CASCADE / RESTRICT) cannot be auto-nulled. If a
  --     production row points at a missing parent, the matching ADD CONSTRAINT will fail
  --     and the whole migration rolls back (safe). Before applying to prod, run the orphan
  --     audit (see PROD APPLY notes in the task / commit message) and resolve any rows first.
  --
  -- Verified: applied cleanly on the development database with zero orphans (Jun 2026).

  -- ============ Step 1: null out dangling OPTIONAL references ============
DO $$ BEGIN IF to_regclass('public.users') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL THEN
  UPDATE users SET company_id = NULL WHERE company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies p WHERE p.id = users.company_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE employees SET user_id = NULL WHERE user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = employees.user_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL THEN
  UPDATE employees SET reporting_manager = NULL WHERE reporting_manager IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employees p WHERE p.id = employees.reporting_manager::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.time_office_policies') IS NOT NULL THEN
  UPDATE employees SET time_office_policy_id = NULL WHERE time_office_policy_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM time_office_policies p WHERE p.id = employees.time_office_policy_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.wage_grades') IS NOT NULL THEN
  UPDATE employees SET wage_grade_id = NULL WHERE wage_grade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM wage_grades p WHERE p.id = employees.wage_grade_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.contractor_masters') IS NOT NULL THEN
  UPDATE employees SET contractor_master_id = NULL WHERE contractor_master_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contractor_masters p WHERE p.id = employees.contractor_master_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.leave_policies') IS NOT NULL THEN
  UPDATE employees SET leave_policy_id = NULL WHERE leave_policy_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM leave_policies p WHERE p.id = employees.leave_policy_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.leave_types') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL THEN
  UPDATE leave_types SET company_id = NULL WHERE company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies p WHERE p.id = leave_types.company_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.leave_requests') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE leave_requests SET approved_by = NULL WHERE approved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = leave_requests.approved_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.settings') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL THEN
  UPDATE settings SET company_id = NULL WHERE company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies p WHERE p.id = settings.company_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.fnf_settlements') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE fnf_settlements SET approved_by = NULL WHERE approved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = fnf_settlements.approved_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.biometric_devices') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL THEN
  UPDATE biometric_devices SET company_id = NULL WHERE company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies p WHERE p.id = biometric_devices.company_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.biometric_punch_logs') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL THEN
  UPDATE biometric_punch_logs SET employee_id = NULL WHERE employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employees p WHERE p.id = biometric_punch_logs.employee_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.job_applications') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE job_applications SET applicant_user_id = NULL WHERE applicant_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = job_applications.applicant_user_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.job_applications') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL THEN
  UPDATE job_applications SET employee_id = NULL WHERE employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employees p WHERE p.id = job_applications.employee_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.job_applications') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE job_applications SET reviewed_by = NULL WHERE reviewed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = job_applications.reviewed_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.previous_experiences') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL THEN
  UPDATE previous_experiences SET employee_id = NULL WHERE employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employees p WHERE p.id = previous_experiences.employee_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.loan_advances') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE loan_advances SET approved_by = NULL WHERE approved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = loan_advances.approved_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.user_permissions') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL THEN
  UPDATE user_permissions SET company_id = NULL WHERE company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies p WHERE p.id = user_permissions.company_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.module_access_requests') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL THEN
  UPDATE module_access_requests SET company_id = NULL WHERE company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies p WHERE p.id = module_access_requests.company_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.module_access_requests') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE module_access_requests SET decided_by = NULL WHERE decided_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = module_access_requests.decided_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.notifications') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL THEN
  UPDATE notifications SET company_id = NULL WHERE company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies p WHERE p.id = notifications.company_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.profile_update_requests') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL THEN
  UPDATE profile_update_requests SET company_id = NULL WHERE company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies p WHERE p.id = profile_update_requests.company_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.profile_update_requests') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE profile_update_requests SET reviewed_by = NULL WHERE reviewed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = profile_update_requests.reviewed_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.compliance_adjustments') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE compliance_adjustments SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = compliance_adjustments.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.cd_transactions') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE cd_transactions SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = cd_transactions.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.expenses') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE expenses SET approved_by = NULL WHERE approved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = expenses.approved_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.comp_off_applications') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE comp_off_applications SET approved_by = NULL WHERE approved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = comp_off_applications.approved_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.kra_templates') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE kra_templates SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = kra_templates.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.kra_assignments') IS NOT NULL AND to_regclass('public.kra_templates') IS NOT NULL THEN
  UPDATE kra_assignments SET template_id = NULL WHERE template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM kra_templates p WHERE p.id = kra_assignments.template_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.kra_assignments') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE kra_assignments SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = kra_assignments.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.automation_jobs') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE automation_jobs SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = automation_jobs.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.automation_logs') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE automation_logs SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = automation_logs.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.portal_sessions') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE portal_sessions SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = portal_sessions.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.epfo_registrations') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL THEN
  UPDATE epfo_registrations SET job_id = NULL WHERE job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM automation_jobs p WHERE p.id = epfo_registrations.job_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.epfo_registrations') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE epfo_registrations SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = epfo_registrations.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.epfo_kyc_records') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL THEN
  UPDATE epfo_kyc_records SET job_id = NULL WHERE job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM automation_jobs p WHERE p.id = epfo_kyc_records.job_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.epfo_kyc_records') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE epfo_kyc_records SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = epfo_kyc_records.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.epfo_ecr_returns') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL THEN
  UPDATE epfo_ecr_returns SET job_id = NULL WHERE job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM automation_jobs p WHERE p.id = epfo_ecr_returns.job_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.epfo_ecr_returns') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE epfo_ecr_returns SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = epfo_ecr_returns.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.esic_registrations') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL THEN
  UPDATE esic_registrations SET job_id = NULL WHERE job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM automation_jobs p WHERE p.id = esic_registrations.job_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.esic_registrations') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE esic_registrations SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = esic_registrations.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.esic_monthly_returns') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL THEN
  UPDATE esic_monthly_returns SET job_id = NULL WHERE job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM automation_jobs p WHERE p.id = esic_monthly_returns.job_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.esic_monthly_returns') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE esic_monthly_returns SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = esic_monthly_returns.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.challans') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL THEN
  UPDATE challans SET job_id = NULL WHERE job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM automation_jobs p WHERE p.id = challans.job_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.challans') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE challans SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = challans.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.compliance_calendar_events') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE compliance_calendar_events SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = compliance_calendar_events.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.outdoor_entries') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE outdoor_entries SET approved_by = NULL WHERE approved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = outdoor_entries.approved_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.esic_fetched_employees') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL THEN
  UPDATE esic_fetched_employees SET job_id = NULL WHERE job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM automation_jobs p WHERE p.id = esic_fetched_employees.job_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.ai_follow_up_tasks') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE ai_follow_up_tasks SET user_id = NULL WHERE user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = ai_follow_up_tasks.user_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.ai_follow_up_tasks') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE ai_follow_up_tasks SET escalated_to = NULL WHERE escalated_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = ai_follow_up_tasks.escalated_to::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.compliance_employee_setup') IS NOT NULL AND to_regclass('public.wage_grades') IS NOT NULL THEN
  UPDATE compliance_employee_setup SET wage_grade_id = NULL WHERE wage_grade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM wage_grades p WHERE p.id = compliance_employee_setup.wage_grade_id::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.compliance_employee_setup') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE compliance_employee_setup SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = compliance_employee_setup.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.compliance_clients') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE compliance_clients SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = compliance_clients.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.compliance_client_employees') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE compliance_client_employees SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = compliance_client_employees.created_by::varchar);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.employee_documents') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN
  UPDATE employee_documents SET created_by = NULL WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users p WHERE p.id = employee_documents.created_by::varchar);
END IF; END $$;

-- ============ Step 2: add foreign-key constraints (idempotent) ============
DO $$ BEGIN
    IF to_regclass('public.company_contractors') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='company_contractors_company_id_companies_id_fk') THEN
      ALTER TABLE company_contractors ADD CONSTRAINT company_contractors_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.company_contractors') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='company_contractors_contractor_id_companies_id_fk') THEN
      ALTER TABLE company_contractors ADD CONSTRAINT company_contractors_contractor_id_companies_id_fk FOREIGN KEY (contractor_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.contractor_employees') IS NOT NULL AND to_regclass('public.company_contractors') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contractor_employees_company_contractor_id_company_contractors_id_fk') THEN
      ALTER TABLE contractor_employees ADD CONSTRAINT contractor_employees_company_contractor_id_company_contractors_id_fk FOREIGN KEY (company_contractor_id) REFERENCES company_contractors(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.contractor_employees') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contractor_employees_employee_id_employees_id_fk') THEN
      ALTER TABLE contractor_employees ADD CONSTRAINT contractor_employees_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.users') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_company_id_companies_id_fk') THEN
      ALTER TABLE users ADD CONSTRAINT users_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_company_id_companies_id_fk') THEN
      ALTER TABLE employees ADD CONSTRAINT employees_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_user_id_users_id_fk') THEN
      ALTER TABLE employees ADD CONSTRAINT employees_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_reporting_manager_employees_id_fk') THEN
      ALTER TABLE employees ADD CONSTRAINT employees_reporting_manager_employees_id_fk FOREIGN KEY (reporting_manager) REFERENCES employees(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.time_office_policies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_time_office_policy_id_time_office_policies_id_fk') THEN
      ALTER TABLE employees ADD CONSTRAINT employees_time_office_policy_id_time_office_policies_id_fk FOREIGN KEY (time_office_policy_id) REFERENCES time_office_policies(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.wage_grades') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_wage_grade_id_wage_grades_id_fk') THEN
      ALTER TABLE employees ADD CONSTRAINT employees_wage_grade_id_wage_grades_id_fk FOREIGN KEY (wage_grade_id) REFERENCES wage_grades(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.contractor_masters') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_contractor_master_id_contractor_masters_id_fk') THEN
      ALTER TABLE employees ADD CONSTRAINT employees_contractor_master_id_contractor_masters_id_fk FOREIGN KEY (contractor_master_id) REFERENCES contractor_masters(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.employees') IS NOT NULL AND to_regclass('public.leave_policies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_leave_policy_id_leave_policies_id_fk') THEN
      ALTER TABLE employees ADD CONSTRAINT employees_leave_policy_id_leave_policies_id_fk FOREIGN KEY (leave_policy_id) REFERENCES leave_policies(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.master_departments') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='master_departments_company_id_companies_id_fk') THEN
      ALTER TABLE master_departments ADD CONSTRAINT master_departments_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.master_designations') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='master_designations_company_id_companies_id_fk') THEN
      ALTER TABLE master_designations ADD CONSTRAINT master_designations_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.wage_grades') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='wage_grades_company_id_companies_id_fk') THEN
      ALTER TABLE wage_grades ADD CONSTRAINT wage_grades_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.master_locations') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='master_locations_company_id_companies_id_fk') THEN
      ALTER TABLE master_locations ADD CONSTRAINT master_locations_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.earning_heads') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='earning_heads_company_id_companies_id_fk') THEN
      ALTER TABLE earning_heads ADD CONSTRAINT earning_heads_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.deduction_heads') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deduction_heads_company_id_companies_id_fk') THEN
      ALTER TABLE deduction_heads ADD CONSTRAINT deduction_heads_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.statutory_settings') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='statutory_settings_company_id_companies_id_fk') THEN
      ALTER TABLE statutory_settings ADD CONSTRAINT statutory_settings_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.attendance') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='attendance_employee_id_employees_id_fk') THEN
      ALTER TABLE attendance ADD CONSTRAINT attendance_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.attendance') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='attendance_company_id_companies_id_fk') THEN
      ALTER TABLE attendance ADD CONSTRAINT attendance_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.leave_types') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leave_types_company_id_companies_id_fk') THEN
      ALTER TABLE leave_types ADD CONSTRAINT leave_types_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.leave_requests') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leave_requests_employee_id_employees_id_fk') THEN
      ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.leave_requests') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leave_requests_company_id_companies_id_fk') THEN
      ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.leave_requests') IS NOT NULL AND to_regclass('public.leave_types') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leave_requests_leave_type_id_leave_types_id_fk') THEN
      ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_leave_type_id_leave_types_id_fk FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE RESTRICT;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.leave_requests') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leave_requests_approved_by_users_id_fk') THEN
      ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.leave_policies') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leave_policies_company_id_companies_id_fk') THEN
      ALTER TABLE leave_policies ADD CONSTRAINT leave_policies_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.salary_structures') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='salary_structures_employee_id_employees_id_fk') THEN
      ALTER TABLE salary_structures ADD CONSTRAINT salary_structures_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.salary_structures') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='salary_structures_company_id_companies_id_fk') THEN
      ALTER TABLE salary_structures ADD CONSTRAINT salary_structures_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.payroll') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payroll_employee_id_employees_id_fk') THEN
      ALTER TABLE payroll ADD CONSTRAINT payroll_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.payroll') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payroll_company_id_companies_id_fk') THEN
      ALTER TABLE payroll ADD CONSTRAINT payroll_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.settings') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='settings_company_id_companies_id_fk') THEN
      ALTER TABLE settings ADD CONSTRAINT settings_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.time_office_policies') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='time_office_policies_company_id_companies_id_fk') THEN
      ALTER TABLE time_office_policies ADD CONSTRAINT time_office_policies_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.fnf_settlements') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fnf_settlements_employee_id_employees_id_fk') THEN
      ALTER TABLE fnf_settlements ADD CONSTRAINT fnf_settlements_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.fnf_settlements') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fnf_settlements_company_id_companies_id_fk') THEN
      ALTER TABLE fnf_settlements ADD CONSTRAINT fnf_settlements_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.fnf_settlements') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fnf_settlements_approved_by_users_id_fk') THEN
      ALTER TABLE fnf_settlements ADD CONSTRAINT fnf_settlements_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.holidays') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='holidays_company_id_companies_id_fk') THEN
      ALTER TABLE holidays ADD CONSTRAINT holidays_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.biometric_devices') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='biometric_devices_company_id_companies_id_fk') THEN
      ALTER TABLE biometric_devices ADD CONSTRAINT biometric_devices_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.biometric_punch_logs') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='biometric_punch_logs_company_id_companies_id_fk') THEN
      ALTER TABLE biometric_punch_logs ADD CONSTRAINT biometric_punch_logs_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.biometric_punch_logs') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='biometric_punch_logs_employee_id_employees_id_fk') THEN
      ALTER TABLE biometric_punch_logs ADD CONSTRAINT biometric_punch_logs_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.biometric_device_users') IS NOT NULL AND to_regclass('public.biometric_devices') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='biometric_device_users_device_id_biometric_devices_id_fk') THEN
      ALTER TABLE biometric_device_users ADD CONSTRAINT biometric_device_users_device_id_biometric_devices_id_fk FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.job_postings') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='job_postings_company_id_companies_id_fk') THEN
      ALTER TABLE job_postings ADD CONSTRAINT job_postings_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.job_applications') IS NOT NULL AND to_regclass('public.job_postings') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='job_applications_job_posting_id_job_postings_id_fk') THEN
      ALTER TABLE job_applications ADD CONSTRAINT job_applications_job_posting_id_job_postings_id_fk FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.job_applications') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='job_applications_company_id_companies_id_fk') THEN
      ALTER TABLE job_applications ADD CONSTRAINT job_applications_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.job_applications') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='job_applications_applicant_user_id_users_id_fk') THEN
      ALTER TABLE job_applications ADD CONSTRAINT job_applications_applicant_user_id_users_id_fk FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.job_applications') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='job_applications_employee_id_employees_id_fk') THEN
      ALTER TABLE job_applications ADD CONSTRAINT job_applications_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.job_applications') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='job_applications_reviewed_by_users_id_fk') THEN
      ALTER TABLE job_applications ADD CONSTRAINT job_applications_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.candidate_profiles') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='candidate_profiles_user_id_users_id_fk') THEN
      ALTER TABLE candidate_profiles ADD CONSTRAINT candidate_profiles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.previous_experiences') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='previous_experiences_employee_id_employees_id_fk') THEN
      ALTER TABLE previous_experiences ADD CONSTRAINT previous_experiences_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.previous_experiences') IS NOT NULL AND to_regclass('public.candidate_profiles') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='previous_experiences_candidate_profile_id_candidate_profiles_id_fk') THEN
      ALTER TABLE previous_experiences ADD CONSTRAINT previous_experiences_candidate_profile_id_candidate_profiles_id_fk FOREIGN KEY (candidate_profile_id) REFERENCES candidate_profiles(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.loan_advances') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='loan_advances_company_id_companies_id_fk') THEN
      ALTER TABLE loan_advances ADD CONSTRAINT loan_advances_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.loan_advances') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='loan_advances_employee_id_employees_id_fk') THEN
      ALTER TABLE loan_advances ADD CONSTRAINT loan_advances_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.loan_advances') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='loan_advances_approved_by_users_id_fk') THEN
      ALTER TABLE loan_advances ADD CONSTRAINT loan_advances_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.user_permissions') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_permissions_user_id_users_id_fk') THEN
      ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.user_permissions') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_permissions_company_id_companies_id_fk') THEN
      ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.module_access_requests') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='module_access_requests_user_id_users_id_fk') THEN
      ALTER TABLE module_access_requests ADD CONSTRAINT module_access_requests_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.module_access_requests') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='module_access_requests_company_id_companies_id_fk') THEN
      ALTER TABLE module_access_requests ADD CONSTRAINT module_access_requests_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.module_access_requests') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='module_access_requests_decided_by_users_id_fk') THEN
      ALTER TABLE module_access_requests ADD CONSTRAINT module_access_requests_decided_by_users_id_fk FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.notifications') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notifications_user_id_users_id_fk') THEN
      ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.notifications') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notifications_company_id_companies_id_fk') THEN
      ALTER TABLE notifications ADD CONSTRAINT notifications_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.profile_update_requests') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profile_update_requests_user_id_users_id_fk') THEN
      ALTER TABLE profile_update_requests ADD CONSTRAINT profile_update_requests_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.profile_update_requests') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profile_update_requests_company_id_companies_id_fk') THEN
      ALTER TABLE profile_update_requests ADD CONSTRAINT profile_update_requests_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.profile_update_requests') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profile_update_requests_reviewed_by_users_id_fk') THEN
      ALTER TABLE profile_update_requests ADD CONSTRAINT profile_update_requests_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_adjustments') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_adjustments_company_id_companies_id_fk') THEN
      ALTER TABLE compliance_adjustments ADD CONSTRAINT compliance_adjustments_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_adjustments') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_adjustments_employee_id_employees_id_fk') THEN
      ALTER TABLE compliance_adjustments ADD CONSTRAINT compliance_adjustments_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_adjustments') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_adjustments_created_by_users_id_fk') THEN
      ALTER TABLE compliance_adjustments ADD CONSTRAINT compliance_adjustments_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.contractor_masters') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contractor_masters_company_id_companies_id_fk') THEN
      ALTER TABLE contractor_masters ADD CONSTRAINT contractor_masters_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.cd_accounts') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cd_accounts_company_id_companies_id_fk') THEN
      ALTER TABLE cd_accounts ADD CONSTRAINT cd_accounts_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.cd_transactions') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cd_transactions_company_id_companies_id_fk') THEN
      ALTER TABLE cd_transactions ADD CONSTRAINT cd_transactions_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.cd_transactions') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cd_transactions_created_by_users_id_fk') THEN
      ALTER TABLE cd_transactions ADD CONSTRAINT cd_transactions_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.daily_billing_logs') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='daily_billing_logs_company_id_companies_id_fk') THEN
      ALTER TABLE daily_billing_logs ADD CONSTRAINT daily_billing_logs_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.invoices') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_company_id_companies_id_fk') THEN
      ALTER TABLE invoices ADD CONSTRAINT invoices_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.expenses') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='expenses_company_id_companies_id_fk') THEN
      ALTER TABLE expenses ADD CONSTRAINT expenses_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.expenses') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='expenses_employee_id_employees_id_fk') THEN
      ALTER TABLE expenses ADD CONSTRAINT expenses_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.expenses') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='expenses_approved_by_users_id_fk') THEN
      ALTER TABLE expenses ADD CONSTRAINT expenses_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.leave_adjustments') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leave_adjustments_company_id_companies_id_fk') THEN
      ALTER TABLE leave_adjustments ADD CONSTRAINT leave_adjustments_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.leave_adjustments') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leave_adjustments_employee_id_employees_id_fk') THEN
      ALTER TABLE leave_adjustments ADD CONSTRAINT leave_adjustments_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.leave_adjustments') IS NOT NULL AND to_regclass('public.leave_types') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leave_adjustments_leave_type_id_leave_types_id_fk') THEN
      ALTER TABLE leave_adjustments ADD CONSTRAINT leave_adjustments_leave_type_id_leave_types_id_fk FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE RESTRICT;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.leave_adjustments') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leave_adjustments_adjusted_by_users_id_fk') THEN
      ALTER TABLE leave_adjustments ADD CONSTRAINT leave_adjustments_adjusted_by_users_id_fk FOREIGN KEY (adjusted_by) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.comp_off_applications') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='comp_off_applications_company_id_companies_id_fk') THEN
      ALTER TABLE comp_off_applications ADD CONSTRAINT comp_off_applications_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.comp_off_applications') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='comp_off_applications_employee_id_employees_id_fk') THEN
      ALTER TABLE comp_off_applications ADD CONSTRAINT comp_off_applications_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.comp_off_applications') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='comp_off_applications_approved_by_users_id_fk') THEN
      ALTER TABLE comp_off_applications ADD CONSTRAINT comp_off_applications_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.kra_templates') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kra_templates_company_id_companies_id_fk') THEN
      ALTER TABLE kra_templates ADD CONSTRAINT kra_templates_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.kra_templates') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kra_templates_created_by_users_id_fk') THEN
      ALTER TABLE kra_templates ADD CONSTRAINT kra_templates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.kra_template_kpis') IS NOT NULL AND to_regclass('public.kra_templates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kra_template_kpis_template_id_kra_templates_id_fk') THEN
      ALTER TABLE kra_template_kpis ADD CONSTRAINT kra_template_kpis_template_id_kra_templates_id_fk FOREIGN KEY (template_id) REFERENCES kra_templates(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.kra_assignments') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kra_assignments_company_id_companies_id_fk') THEN
      ALTER TABLE kra_assignments ADD CONSTRAINT kra_assignments_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.kra_assignments') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kra_assignments_employee_id_employees_id_fk') THEN
      ALTER TABLE kra_assignments ADD CONSTRAINT kra_assignments_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.kra_assignments') IS NOT NULL AND to_regclass('public.kra_templates') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kra_assignments_template_id_kra_templates_id_fk') THEN
      ALTER TABLE kra_assignments ADD CONSTRAINT kra_assignments_template_id_kra_templates_id_fk FOREIGN KEY (template_id) REFERENCES kra_templates(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.kra_assignments') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kra_assignments_created_by_users_id_fk') THEN
      ALTER TABLE kra_assignments ADD CONSTRAINT kra_assignments_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.kra_assignment_kpis') IS NOT NULL AND to_regclass('public.kra_assignments') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kra_assignment_kpis_assignment_id_kra_assignments_id_fk') THEN
      ALTER TABLE kra_assignment_kpis ADD CONSTRAINT kra_assignment_kpis_assignment_id_kra_assignments_id_fk FOREIGN KEY (assignment_id) REFERENCES kra_assignments(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.automation_jobs') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='automation_jobs_company_id_companies_id_fk') THEN
      ALTER TABLE automation_jobs ADD CONSTRAINT automation_jobs_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.automation_jobs') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='automation_jobs_created_by_users_id_fk') THEN
      ALTER TABLE automation_jobs ADD CONSTRAINT automation_jobs_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.automation_logs') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='automation_logs_job_id_automation_jobs_id_fk') THEN
      ALTER TABLE automation_logs ADD CONSTRAINT automation_logs_job_id_automation_jobs_id_fk FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.automation_logs') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='automation_logs_company_id_companies_id_fk') THEN
      ALTER TABLE automation_logs ADD CONSTRAINT automation_logs_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.automation_logs') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='automation_logs_created_by_users_id_fk') THEN
      ALTER TABLE automation_logs ADD CONSTRAINT automation_logs_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.portal_sessions') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='portal_sessions_company_id_companies_id_fk') THEN
      ALTER TABLE portal_sessions ADD CONSTRAINT portal_sessions_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.portal_sessions') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='portal_sessions_created_by_users_id_fk') THEN
      ALTER TABLE portal_sessions ADD CONSTRAINT portal_sessions_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.epfo_registrations') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='epfo_registrations_company_id_companies_id_fk') THEN
      ALTER TABLE epfo_registrations ADD CONSTRAINT epfo_registrations_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.epfo_registrations') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='epfo_registrations_employee_id_employees_id_fk') THEN
      ALTER TABLE epfo_registrations ADD CONSTRAINT epfo_registrations_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.epfo_registrations') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='epfo_registrations_job_id_automation_jobs_id_fk') THEN
      ALTER TABLE epfo_registrations ADD CONSTRAINT epfo_registrations_job_id_automation_jobs_id_fk FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.epfo_registrations') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='epfo_registrations_created_by_users_id_fk') THEN
      ALTER TABLE epfo_registrations ADD CONSTRAINT epfo_registrations_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.epfo_kyc_records') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='epfo_kyc_records_company_id_companies_id_fk') THEN
      ALTER TABLE epfo_kyc_records ADD CONSTRAINT epfo_kyc_records_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.epfo_kyc_records') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='epfo_kyc_records_employee_id_employees_id_fk') THEN
      ALTER TABLE epfo_kyc_records ADD CONSTRAINT epfo_kyc_records_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.epfo_kyc_records') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='epfo_kyc_records_job_id_automation_jobs_id_fk') THEN
      ALTER TABLE epfo_kyc_records ADD CONSTRAINT epfo_kyc_records_job_id_automation_jobs_id_fk FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.epfo_kyc_records') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='epfo_kyc_records_created_by_users_id_fk') THEN
      ALTER TABLE epfo_kyc_records ADD CONSTRAINT epfo_kyc_records_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.epfo_ecr_returns') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='epfo_ecr_returns_company_id_companies_id_fk') THEN
      ALTER TABLE epfo_ecr_returns ADD CONSTRAINT epfo_ecr_returns_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.epfo_ecr_returns') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='epfo_ecr_returns_job_id_automation_jobs_id_fk') THEN
      ALTER TABLE epfo_ecr_returns ADD CONSTRAINT epfo_ecr_returns_job_id_automation_jobs_id_fk FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.epfo_ecr_returns') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='epfo_ecr_returns_created_by_users_id_fk') THEN
      ALTER TABLE epfo_ecr_returns ADD CONSTRAINT epfo_ecr_returns_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.esic_registrations') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='esic_registrations_company_id_companies_id_fk') THEN
      ALTER TABLE esic_registrations ADD CONSTRAINT esic_registrations_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.esic_registrations') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='esic_registrations_employee_id_employees_id_fk') THEN
      ALTER TABLE esic_registrations ADD CONSTRAINT esic_registrations_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.esic_registrations') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='esic_registrations_job_id_automation_jobs_id_fk') THEN
      ALTER TABLE esic_registrations ADD CONSTRAINT esic_registrations_job_id_automation_jobs_id_fk FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.esic_registrations') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='esic_registrations_created_by_users_id_fk') THEN
      ALTER TABLE esic_registrations ADD CONSTRAINT esic_registrations_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.esic_monthly_returns') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='esic_monthly_returns_company_id_companies_id_fk') THEN
      ALTER TABLE esic_monthly_returns ADD CONSTRAINT esic_monthly_returns_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.esic_monthly_returns') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='esic_monthly_returns_job_id_automation_jobs_id_fk') THEN
      ALTER TABLE esic_monthly_returns ADD CONSTRAINT esic_monthly_returns_job_id_automation_jobs_id_fk FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.esic_monthly_returns') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='esic_monthly_returns_created_by_users_id_fk') THEN
      ALTER TABLE esic_monthly_returns ADD CONSTRAINT esic_monthly_returns_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.challans') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='challans_company_id_companies_id_fk') THEN
      ALTER TABLE challans ADD CONSTRAINT challans_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.challans') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='challans_job_id_automation_jobs_id_fk') THEN
      ALTER TABLE challans ADD CONSTRAINT challans_job_id_automation_jobs_id_fk FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.challans') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='challans_created_by_users_id_fk') THEN
      ALTER TABLE challans ADD CONSTRAINT challans_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_calendar_events') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_calendar_events_company_id_companies_id_fk') THEN
      ALTER TABLE compliance_calendar_events ADD CONSTRAINT compliance_calendar_events_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_calendar_events') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_calendar_events_created_by_users_id_fk') THEN
      ALTER TABLE compliance_calendar_events ADD CONSTRAINT compliance_calendar_events_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.outdoor_entries') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='outdoor_entries_company_id_companies_id_fk') THEN
      ALTER TABLE outdoor_entries ADD CONSTRAINT outdoor_entries_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.outdoor_entries') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='outdoor_entries_employee_id_employees_id_fk') THEN
      ALTER TABLE outdoor_entries ADD CONSTRAINT outdoor_entries_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.outdoor_entries') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='outdoor_entries_approved_by_users_id_fk') THEN
      ALTER TABLE outdoor_entries ADD CONSTRAINT outdoor_entries_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.esic_fetched_employees') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='esic_fetched_employees_company_id_companies_id_fk') THEN
      ALTER TABLE esic_fetched_employees ADD CONSTRAINT esic_fetched_employees_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.esic_fetched_employees') IS NOT NULL AND to_regclass('public.automation_jobs') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='esic_fetched_employees_job_id_automation_jobs_id_fk') THEN
      ALTER TABLE esic_fetched_employees ADD CONSTRAINT esic_fetched_employees_job_id_automation_jobs_id_fk FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.ai_conversations') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_conversations_employee_id_employees_id_fk') THEN
      ALTER TABLE ai_conversations ADD CONSTRAINT ai_conversations_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.ai_conversations') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_conversations_user_id_users_id_fk') THEN
      ALTER TABLE ai_conversations ADD CONSTRAINT ai_conversations_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.ai_conversations') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_conversations_company_id_companies_id_fk') THEN
      ALTER TABLE ai_conversations ADD CONSTRAINT ai_conversations_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.ai_messages') IS NOT NULL AND to_regclass('public.ai_conversations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_messages_conversation_id_ai_conversations_id_fk') THEN
      ALTER TABLE ai_messages ADD CONSTRAINT ai_messages_conversation_id_ai_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.ai_follow_up_tasks') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_follow_up_tasks_employee_id_employees_id_fk') THEN
      ALTER TABLE ai_follow_up_tasks ADD CONSTRAINT ai_follow_up_tasks_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.ai_follow_up_tasks') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_follow_up_tasks_user_id_users_id_fk') THEN
      ALTER TABLE ai_follow_up_tasks ADD CONSTRAINT ai_follow_up_tasks_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.ai_follow_up_tasks') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_follow_up_tasks_company_id_companies_id_fk') THEN
      ALTER TABLE ai_follow_up_tasks ADD CONSTRAINT ai_follow_up_tasks_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.ai_follow_up_tasks') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_follow_up_tasks_escalated_to_users_id_fk') THEN
      ALTER TABLE ai_follow_up_tasks ADD CONSTRAINT ai_follow_up_tasks_escalated_to_users_id_fk FOREIGN KEY (escalated_to) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.kyc_submission_status') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kyc_submission_status_employee_id_employees_id_fk') THEN
      ALTER TABLE kyc_submission_status ADD CONSTRAINT kyc_submission_status_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.kyc_submission_status') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='kyc_submission_status_company_id_companies_id_fk') THEN
      ALTER TABLE kyc_submission_status ADD CONSTRAINT kyc_submission_status_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_employee_setup') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_employee_setup_company_id_companies_id_fk') THEN
      ALTER TABLE compliance_employee_setup ADD CONSTRAINT compliance_employee_setup_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_employee_setup') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_employee_setup_employee_id_employees_id_fk') THEN
      ALTER TABLE compliance_employee_setup ADD CONSTRAINT compliance_employee_setup_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_employee_setup') IS NOT NULL AND to_regclass('public.wage_grades') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_employee_setup_wage_grade_id_wage_grades_id_fk') THEN
      ALTER TABLE compliance_employee_setup ADD CONSTRAINT compliance_employee_setup_wage_grade_id_wage_grades_id_fk FOREIGN KEY (wage_grade_id) REFERENCES wage_grades(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_employee_setup') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_employee_setup_created_by_users_id_fk') THEN
      ALTER TABLE compliance_employee_setup ADD CONSTRAINT compliance_employee_setup_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_clients') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_clients_company_id_companies_id_fk') THEN
      ALTER TABLE compliance_clients ADD CONSTRAINT compliance_clients_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_clients') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_clients_created_by_users_id_fk') THEN
      ALTER TABLE compliance_clients ADD CONSTRAINT compliance_clients_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_carry_forward') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_carry_forward_company_id_companies_id_fk') THEN
      ALTER TABLE compliance_carry_forward ADD CONSTRAINT compliance_carry_forward_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_carry_forward') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_carry_forward_employee_id_employees_id_fk') THEN
      ALTER TABLE compliance_carry_forward ADD CONSTRAINT compliance_carry_forward_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_client_employees') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_client_employees_company_id_companies_id_fk') THEN
      ALTER TABLE compliance_client_employees ADD CONSTRAINT compliance_client_employees_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_client_employees') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_client_employees_employee_id_employees_id_fk') THEN
      ALTER TABLE compliance_client_employees ADD CONSTRAINT compliance_client_employees_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_client_employees') IS NOT NULL AND to_regclass('public.compliance_clients') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_client_employees_client_id_compliance_clients_id_fk') THEN
      ALTER TABLE compliance_client_employees ADD CONSTRAINT compliance_client_employees_client_id_compliance_clients_id_fk FOREIGN KEY (client_id) REFERENCES compliance_clients(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.compliance_client_employees') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='compliance_client_employees_created_by_users_id_fk') THEN
      ALTER TABLE compliance_client_employees ADD CONSTRAINT compliance_client_employees_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.placeholder_backfill_heals') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='placeholder_backfill_heals_company_id_companies_id_fk') THEN
      ALTER TABLE placeholder_backfill_heals ADD CONSTRAINT placeholder_backfill_heals_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.placeholder_backfill_heals') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='placeholder_backfill_heals_employee_id_employees_id_fk') THEN
      ALTER TABLE placeholder_backfill_heals ADD CONSTRAINT placeholder_backfill_heals_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.employee_documents') IS NOT NULL AND to_regclass('public.companies') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_documents_company_id_companies_id_fk') THEN
      ALTER TABLE employee_documents ADD CONSTRAINT employee_documents_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.employee_documents') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_documents_employee_id_employees_id_fk') THEN
      ALTER TABLE employee_documents ADD CONSTRAINT employee_documents_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
    END IF;
  END $$;
DO $$ BEGIN
    IF to_regclass('public.employee_documents') IS NOT NULL AND to_regclass('public.users') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_documents_created_by_users_id_fk') THEN
      ALTER TABLE employee_documents ADD CONSTRAINT employee_documents_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END $$;
