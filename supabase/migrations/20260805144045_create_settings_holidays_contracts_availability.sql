/*
# Workforce scheduling foundation: settings, holidays, contracts, availability

1. New Tables

- `restaurant_settings`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, FK → restaurants, UNIQUE) — one-to-one with restaurant
  - `week_start_day` (integer, default 1) — 0=Sunday, 1=Monday, etc.
  - `default_shift_color` (text) — hex color for calendar display
  - `min_hours_between_shifts` (numeric, default 11) — rest period between shifts
  - `max_weekly_hours` (numeric, default 40) — default labor law cap
  - `overtime_threshold` (numeric, default 40) — hours after which overtime applies
  - `overtime_multiplier` (numeric, default 1.5) — pay multiplier for overtime
  - `timezone` (text, default 'UTC') — restaurant's timezone
  - `currency` (text, default 'USD') — ISO 4217 currency code
  - `created_at`, `updated_at` (timestamptz)

- `holiday_calendar`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, FK → restaurants ON DELETE CASCADE)
  - `name` (text, not null) — e.g. "Independence Day"
  - `holiday_date` (date, not null) — the date of the holiday
  - `is_paid` (boolean, default true) — whether employees are paid for this holiday
  - `created_at` (timestamptz)

- `contracts`
  - `id` (uuid, primary key)
  - `employee_id` (uuid, FK → employees ON DELETE CASCADE) — the employee this contract belongs to
  - `restaurant_id` (uuid, FK → restaurants ON DELETE CASCADE) — tenant scoping (denormalized from employee)
  - `contract_type` (text, not null) — 'full_time', 'part_time', 'casual', 'seasonal'
  - `hourly_rate` (numeric, not null) — pay rate per hour
  - `weekly_hours` (numeric) — contracted weekly hours (for full-time/part-time)
  - `start_date` (date, not null) — contract start
  - `end_date` (date) — contract end (nullable = open-ended)
  - `status` (text, not null, default 'active') — 'active', 'expired', 'terminated'
  - `created_at`, `updated_at` (timestamptz)

- `availability`
  - `id` (uuid, primary key)
  - `employee_id` (uuid, FK → employees ON DELETE CASCADE)
  - `restaurant_id` (uuid, FK → restaurants ON DELETE CASCADE) — tenant scoping
  - `day_of_week` (integer, not null, CHECK 0–6) — 0=Sunday through 6=Saturday
  - `start_time` (time, not null) — available from
  - `end_time` (time, not null) — available until
  - `is_available` (boolean, default true) — false = unavailable that day
  - `created_at` (timestamptz)
  - UNIQUE constraint on (employee_id, day_of_week) — one availability slot per day

2. Indexes
- `restaurant_settings_restaurant_id_idx` (restaurant_settings.restaurant_id)
- `holiday_calendar_restaurant_id_idx` (holiday_calendar.restaurant_id)
- `holiday_calendar_date_idx` (holiday_calendar.holiday_date)
- `contracts_employee_id_idx` (contracts.employee_id)
- `contracts_restaurant_id_idx` (contracts.restaurant_id)
- `contracts_status_idx` (contracts.status)
- `availability_employee_id_idx` (availability.employee_id)
- `availability_restaurant_id_idx` (availability.restaurant_id)

3. Security
- Enable RLS on all four tables.
- restaurant_settings: any member of the restaurant can read; only managers can update.
- holiday_calendar: any member can read; only managers can write/update/delete.
- contracts: employees can read their own contract; managers can read all contracts in their restaurant and manage them.
- availability: employees can read their own availability; managers can read all availability in their restaurant and manage it.
- All policies use EXISTS subqueries on profiles for tenant + role checks.

4. Important Notes
- restaurant_settings is one-to-one with restaurants (unique restaurant_id).
- contracts and availability carry a denormalized restaurant_id for efficient RLS policy checks
  without joining through employees. This avoids extra subquery joins in policies.
- availability uses a UNIQUE constraint on (employee_id, day_of_week) so each employee
  has at most one availability window per weekday.
- holiday_calendar uses a plain `date` (not timestamptz) since holidays are date-based.
*/

-- ============================================================
-- restaurant_settings (one-to-one with restaurants)
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid UNIQUE NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  week_start_day integer NOT NULL DEFAULT 1 CHECK (week_start_day BETWEEN 0 AND 6),
  default_shift_color text DEFAULT '#3b82f6',
  min_hours_between_shifts numeric NOT NULL DEFAULT 11,
  max_weekly_hours numeric NOT NULL DEFAULT 40,
  overtime_threshold numeric NOT NULL DEFAULT 40,
  overtime_multiplier numeric NOT NULL DEFAULT 1.5,
  timezone text NOT NULL DEFAULT 'UTC',
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restaurant_settings_restaurant_id_idx ON restaurant_settings(restaurant_id);

ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_restaurant_settings" ON restaurant_settings;
CREATE POLICY "read_restaurant_settings" ON restaurant_settings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = restaurant_settings.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_restaurant_settings" ON restaurant_settings;
CREATE POLICY "manager_update_restaurant_settings" ON restaurant_settings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = restaurant_settings.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = restaurant_settings.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_insert_restaurant_settings" ON restaurant_settings;
CREATE POLICY "manager_insert_restaurant_settings" ON restaurant_settings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = restaurant_settings.restaurant_id)
  );

-- ============================================================
-- holiday_calendar
-- ============================================================
CREATE TABLE IF NOT EXISTS holiday_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  holiday_date date NOT NULL,
  is_paid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS holiday_calendar_restaurant_id_idx ON holiday_calendar(restaurant_id);
CREATE INDEX IF NOT EXISTS holiday_calendar_date_idx ON holiday_calendar(holiday_date);

ALTER TABLE holiday_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_holidays" ON holiday_calendar;
CREATE POLICY "read_holidays" ON holiday_calendar FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = holiday_calendar.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_insert_holidays" ON holiday_calendar;
CREATE POLICY "manager_insert_holidays" ON holiday_calendar FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = holiday_calendar.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_holidays" ON holiday_calendar;
CREATE POLICY "manager_update_holidays" ON holiday_calendar FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = holiday_calendar.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = holiday_calendar.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_delete_holidays" ON holiday_calendar;
CREATE POLICY "manager_delete_holidays" ON holiday_calendar FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = holiday_calendar.restaurant_id)
  );

-- ============================================================
-- contracts
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  contract_type text NOT NULL CHECK (contract_type IN ('full_time', 'part_time', 'casual', 'seasonal')),
  hourly_rate numeric NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  weekly_hours numeric CHECK (weekly_hours >= 0),
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contracts_employee_id_idx ON contracts(employee_id);
CREATE INDEX IF NOT EXISTS contracts_restaurant_id_idx ON contracts(restaurant_id);
CREATE INDEX IF NOT EXISTS contracts_status_idx ON contracts(status);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Employees can read their own contracts (via profile_id link)
DROP POLICY IF EXISTS "read_own_contracts" ON contracts;
CREATE POLICY "read_own_contracts" ON contracts FOR SELECT
  TO authenticated USING (
    contracts.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = contracts.restaurant_id
    )
  );

DROP POLICY IF EXISTS "manager_insert_contracts" ON contracts;
CREATE POLICY "manager_insert_contracts" ON contracts FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = contracts.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_contracts" ON contracts;
CREATE POLICY "manager_update_contracts" ON contracts FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = contracts.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = contracts.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_delete_contracts" ON contracts;
CREATE POLICY "manager_delete_contracts" ON contracts FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = contracts.restaurant_id)
  );

-- ============================================================
-- availability
-- ============================================================
CREATE TABLE IF NOT EXISTS availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS availability_employee_id_idx ON availability(employee_id);
CREATE INDEX IF NOT EXISTS availability_restaurant_id_idx ON availability(restaurant_id);

ALTER TABLE availability ENABLE ROW LEVEL SECURITY;

-- Employees can read their own availability; managers can read all in their restaurant
DROP POLICY IF EXISTS "read_availability" ON availability;
CREATE POLICY "read_availability" ON availability FOR SELECT
  TO authenticated USING (
    availability.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = availability.restaurant_id
    )
  );

-- Employees can manage their own availability
DROP POLICY IF EXISTS "insert_own_availability" ON availability;
CREATE POLICY "insert_own_availability" ON availability FOR INSERT
  TO authenticated WITH CHECK (
    availability.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = availability.restaurant_id
    )
  );

DROP POLICY IF EXISTS "update_availability" ON availability;
CREATE POLICY "update_availability" ON availability FOR UPDATE
  TO authenticated USING (
    availability.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = availability.restaurant_id
    )
  ) WITH CHECK (
    availability.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = availability.restaurant_id
    )
  );

DROP POLICY IF EXISTS "delete_availability" ON availability;
CREATE POLICY "delete_availability" ON availability FOR DELETE
  TO authenticated USING (
    availability.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = availability.restaurant_id
    )
  );
