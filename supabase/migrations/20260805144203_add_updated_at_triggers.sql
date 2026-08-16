/*
# Auto-update updated_at columns and add updated_at to existing tables

1. Changes
- Add `updated_at` column to `employees` and `shifts` tables (they previously lacked it).
- Create a reusable trigger function `set_updated_at()` that sets `updated_at = now()` on row update.
- Attach the trigger to all tables that have an `updated_at` column:
  restaurant_settings, contracts, availability, schedule_templates, staffing_requirements,
  vacation_requests, shift_swap_requests, payroll_periods, payroll_entries,
  employees, shifts.

2. Security
- The trigger function is SECURITY DEFINER with a locked search_path, so it runs reliably
  regardless of the caller's search_path.
- EXECUTE is revoked from anon and authenticated — this function should only fire as a trigger,
  not be callable via REST RPC.

3. Important Notes
- The `set_updated_at` function is generic: it sets NEW.updated_at = now() for any table
  that has an updated_at column. One function, many triggers.
- Adding updated_at to employees and shifts is non-destructive (nullable column with default now()).
*/

-- Add updated_at to tables that don't have it
ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Generic trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION set_updated_at() FROM authenticated;

-- Attach to all tables with updated_at
DROP TRIGGER IF EXISTS set_updated_at ON restaurant_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON restaurant_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON contracts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON availability;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON availability
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON schedule_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON schedule_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON staffing_requirements;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON staffing_requirements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON vacation_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON vacation_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON shift_swap_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON shift_swap_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON payroll_periods;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payroll_periods
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON payroll_entries;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payroll_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON employees;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON shifts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
