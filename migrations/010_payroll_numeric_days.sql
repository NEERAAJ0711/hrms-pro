-- Convert present_days and pay_days from INTEGER to NUMERIC(6,1)
-- to correctly store half-day values like 12.5, 23.5 without rounding.
-- Guards ensure this is safe even if already numeric (idempotent).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll'
      AND column_name = 'present_days'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE payroll
      ALTER COLUMN present_days TYPE NUMERIC(6,1) USING present_days::NUMERIC;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll'
      AND column_name = 'pay_days'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE payroll
      ALTER COLUMN pay_days TYPE NUMERIC(6,1) USING pay_days::NUMERIC;
  END IF;
END $$;
