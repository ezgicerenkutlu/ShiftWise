/*
# Create availability_overrides table for temporary availability changes

1. New Tables
- `availability_overrides`
  - `id` (uuid, primary key)
  - `employee_id` (uuid, FK → employees ON DELETE CASCADE) — the employee this override belongs to
  - `restaurant_id` (uuid, FK → restaurants ON DELETE CASCADE) — tenant scoping (denormalized)
  - `date` (date, not null) — the specific date this override applies to
  - `is_available` (boolean, not null) — whether the employee is available on this date
  - `start_time` (time) — optional start of availability window (null = all day)
  - `end_time` (time) — optional end of availability window (null = all day)
  - `reason` (text) — optional reason for the override
  - `created_at` (timestamptz, default now())
  - UNIQUE (employee_id, date) — one override per employee per date

2. Indexes
- `availability_overrides_employee_id_idx` on (employee_id)
- `availability_overrides_restaurant_id_idx` on (restaurant_id)
- `availability_overrides_date_idx` on (date)

3. Security
- Enable RLS on `availability_overrides`.
- Employees can read their own overrides; managers can read all in their restaurant.
- Employees can insert/update/delete their own overrides; managers can manage all in their restaurant.
- Policies use EXISTS subqueries on profiles for tenant + role checks, and employee profile_id link for ownership.

4. Important Notes
- This table complements the existing `availability` table which stores recurring weekly availability.
- `availability_overrides` stores date-specific temporary changes (e.g., "unavailable on March 15" or "available 10am-2pm on March 20").
- When `is_available` is false, start_time/end_time are ignored (entire day is unavailable).
- When `is_available` is true and start_time/end_time are null, the entire day is available.
- When `is_available` is true and start_time/end_time are set, only that time window is available.
*/
CREATE TABLE IF NOT EXISTS availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  date date NOT NULL,
  is_available boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS availability_overrides_employee_id_idx ON availability_overrides(employee_id);
CREATE INDEX IF NOT EXISTS availability_overrides_restaurant_id_idx ON availability_overrides(restaurant_id);
CREATE INDEX IF NOT EXISTS availability_overrides_date_idx ON availability_overrides(date);

ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;

-- Employees can read their own overrides; managers can read all in their restaurant
DROP POLICY IF EXISTS "read_availability_overrides" ON availability_overrides;
CREATE POLICY "read_availability_overrides" ON availability_overrides FOR SELECT
  TO authenticated USING (
    availability_overrides.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = availability_overrides.restaurant_id
    )
  );

-- Employees can insert their own overrides; managers can insert for any employee in their restaurant
DROP POLICY IF EXISTS "insert_availability_overrides" ON availability_overrides;
CREATE POLICY "insert_availability_overrides" ON availability_overrides FOR INSERT
  TO authenticated WITH CHECK (
    availability_overrides.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = availability_overrides.restaurant_id
    )
  );

-- Employees can update their own overrides; managers can update any in their restaurant
DROP POLICY IF EXISTS "update_availability_overrides" ON availability_overrides;
CREATE POLICY "update_availability_overrides" ON availability_overrides FOR UPDATE
  TO authenticated USING (
    availability_overrides.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = availability_overrides.restaurant_id
    )
  ) WITH CHECK (
    availability_overrides.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = availability_overrides.restaurant_id
    )
  );

-- Employees can delete their own overrides; managers can delete any in their restaurant
DROP POLICY IF EXISTS "delete_availability_overrides" ON availability_overrides;
CREATE POLICY "delete_availability_overrides" ON availability_overrides FOR DELETE
  TO authenticated USING (
    availability_overrides.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = availability_overrides.restaurant_id
    )
  );
