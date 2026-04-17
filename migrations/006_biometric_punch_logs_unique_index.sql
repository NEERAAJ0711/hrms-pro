-- Prevent duplicate punches at the DB level. Two concurrent ADMS pushes
-- can both pass the application-level findDuplicatePunchLog check before
-- either has inserted, so we need a uniqueness guarantee in the row store.
--
-- The dedupe key mirrors what server/adms.ts uses (company_id,
-- device_employee_id, punch_date, punch_time) plus the originating
-- device_id so that two devices logging the same employee in the same
-- minute are still kept separate. device_id can be null on legacy rows,
-- so we COALESCE it to '' inside the index expression.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'biometric_punch_logs_dedup_unique'
  ) THEN
    -- Idempotency: collapse pre-existing duplicates first so the unique
    -- index can be created cleanly on databases that already accumulated
    -- doubles before this migration ran.
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
