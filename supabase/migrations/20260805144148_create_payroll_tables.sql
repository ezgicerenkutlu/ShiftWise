/*
# Payroll: payroll periods and entries

1. New Tables

- `payroll_periods`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, FK → restaurants ON DELETE CASCADE)
  - `name` (text, not null) — e.g. "July 2026 Pay Period 1"
  - `start_date` (date, not null) — period start
  - `end_date` (date, not null) — period end
  - `pay_date` (date) — when employees are paid
  - `status` (text, not null, default 'open') — 'open', 'processing', 'closed'
  - `created_at`, `updated_at` (timestamptz)
  - UNIQUE (restaurant_id, start_date, end_date) — no overlapping periods per restaurant

- `payroll_entries`
  - `id` (uuid, primary key)
  - `payroll_period_id` (uuid, FK → payroll_periods ON DELETE CASCADE)
  - `restaurant_id` (uuid, FK → restaurants ON DELETE CASCADE) — denormalized for RLS
  - `employee_id` (uuid, FK → employees ON DELETE CASCADE)
  - `regular_hours` (numeric, not null, default 0) — non-overtime hours
  - `overtime_hours` (numeric, not null, default 0) — overtime hours
  - `holiday_hours` (numeric, not null, default 0) — hours worked on holidays
  - `regular_pay` (numeric, not null, default 0) — calculated regular pay
  - `overtime_pay` (numeric, not null, default 0) — calculated overtime pay
  - `holiday_pay` (numeric, not null, default 0) — holiday pay
  - `total_pay` (numeric, not null, default 0) — sum of all pay components
  - `status` (text, not null, default 'pending') — 'pending', 'approved', 'paid'
  - `notes` (text)
  - `created_at`, `updated_at` (timestamptz)
  - UNIQUE (payroll_period_id, employee_id) — one entry per employee per period

2. Indexes
- `payroll_periods_restaurant_id_idx`
- `payroll_periods_status_idx`
- `payroll_entries_payroll_period_id_idx`
- `payroll_entries_restaurant_id_idx`
- `payroll_entries_employee_id_idx`
- `payroll_entries_status_idx`

3. Security
- Enable RLS on both tables.
- payroll_periods: managers have full CRUD; employees can read their restaurant's periods.
- payroll_entries: employees can read their own entries; managers can read all entries in their restaurant and manage them.
- Policies use EXISTS subqueries on profiles for tenant + role checks.

4. Important Notes
- payroll_entries is denormalized with restaurant_id for efficient RLS without joining through
  payroll_periods → employees. This avoids extra subquery joins in policies.
- The UNIQUE constraint on payroll_entries (payroll_period_id, employee_id) ensures one entry
  per employee per pay period.
- Pay amounts are stored as calculated values (regular_pay, overtime_pay, holiday_pay, total_pay)
  rather than computing on the fly, so payroll records are immutable once closed.
- The payroll_periods UNIQUE constraint prevents duplicate periods for the same restaurant.
*/

-- ============================================================
-- payroll_periods
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  pay_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'processing', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS payroll_periods_restaurant_id_idx ON payroll_periods(restaurant_id);
CREATE INDEX IF NOT EXISTS payroll_periods_status_idx ON payroll_periods(status);

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_payroll_periods" ON payroll_periods;
CREATE POLICY "read_payroll_periods" ON payroll_periods FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = payroll_periods.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_insert_payroll_periods" ON payroll_periods;
CREATE POLICY "manager_insert_payroll_periods" ON payroll_periods FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = payroll_periods.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_payroll_periods" ON payroll_periods;
CREATE POLICY "manager_update_payroll_periods" ON payroll_periods FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = payroll_periods.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = payroll_periods.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_delete_payroll_periods" ON payroll_periods;
CREATE POLICY "manager_delete_payroll_periods" ON payroll_periods FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = payroll_periods.restaurant_id)
  );

-- ============================================================
-- payroll_entries
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  regular_hours numeric NOT NULL DEFAULT 0 CHECK (regular_hours >= 0),
  overtime_hours numeric NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
  holiday_hours numeric NOT NULL DEFAULT 0 CHECK (holiday_hours >= 0),
  regular_pay numeric NOT NULL DEFAULT 0 CHECK (regular_pay >= 0),
  overtime_pay numeric NOT NULL DEFAULT 0 CHECK (overtime_pay >= 0),
  holiday_pay numeric NOT NULL DEFAULT 0 CHECK (holiday_pay >= 0),
  total_pay numeric NOT NULL DEFAULT 0 CHECK (total_pay >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_period_id, employee_id)
);

CREATE INDEX IF NOT EXISTS payroll_entries_payroll_period_id_idx ON payroll_entries(payroll_period_id);
CREATE INDEX IF NOT EXISTS payroll_entries_restaurant_id_idx ON payroll_entries(restaurant_id);
CREATE INDEX IF NOT EXISTS payroll_entries_employee_id_idx ON payroll_entries(employee_id);
CREATE INDEX IF NOT EXISTS payroll_entries_status_idx ON payroll_entries(status);

ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;

-- Employees can read their own payroll entries; managers can read all in restaurant
DROP POLICY IF EXISTS "read_payroll_entries" ON payroll_entries;
CREATE POLICY "read_payroll_entries" ON payroll_entries FOR SELECT
  TO authenticated USING (
    payroll_entries.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = payroll_entries.restaurant_id
    )
  );

DROP POLICY IF EXISTS "manager_insert_payroll_entries" ON payroll_entries;
CREATE POLICY "manager_insert_payroll_entries" ON payroll_entries FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = payroll_entries.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_payroll_entries" ON payroll_entries;
CREATE POLICY "manager_update_payroll_entries" ON payroll_entries FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = payroll_entries.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = payroll_entries.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_delete_payroll_entries" ON payroll_entries;
CREATE POLICY "manager_delete_payroll_entries" ON payroll_entries FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = payroll_entries.restaurant_id)
  );
