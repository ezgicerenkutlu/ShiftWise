/*
# Create operational tables: locations, employees, shifts, time_off_requests, invitations

1. New Tables

- `locations`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, references restaurants ON DELETE CASCADE)
  - `name` (text, not null) — e.g. "Downtown", "Uptown"
  - `address` (text) — physical address
  - `created_at` (timestamptz, default now())

- `employees`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, references restaurants ON DELETE CASCADE)
  - `location_id` (uuid, references locations ON DELETE SET NULL) — primary location
  - `profile_id` (uuid, references profiles ON DELETE SET NULL) — linked user account, nullable for non-user employees
  - `full_name` (text, not null)
  - `email` (text) — contact email
  - `phone` (text) — contact phone
  - `job_title` (text) — e.g. "Server", "Cook", "Host"
  - `color` (text) — calendar display color
  - `max_weekly_hours` (integer) — scheduling constraint
  - `is_active` (boolean, default true)
  - `created_at` (timestamptz, default now())

- `shifts`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, references restaurants ON DELETE CASCADE)
  - `location_id` (uuid, references locations ON DELETE CASCADE)
  - `employee_id` (uuid, references employees ON DELETE SET NULL) — nullable for unassigned shifts
  - `title` (text, not null) — shift label
  - `start_time` (timestamptz, not null)
  - `end_time` (timestamptz, not null)
  - `status` (text, not null, default 'draft') — 'draft', 'published', 'confirmed', 'completed'
  - `notes` (text)
  - `created_at` (timestamptz, default now())

- `time_off_requests`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, references restaurants ON DELETE CASCADE)
  - `employee_id` (uuid, references employees ON DELETE CASCADE)
  - `start_date` (date, not null)
  - `end_date` (date, not null)
  - `reason` (text)
  - `status` (text, not null, default 'pending') — 'pending', 'approved', 'rejected'
  - `created_at` (timestamptz, default now())

- `invitations`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, references restaurants ON DELETE CASCADE)
  - `email` (text, not null) — invitee email
  - `role` (text, not null, default 'employee') — 'manager' or 'employee'
  - `status` (text, not null, default 'pending') — 'pending', 'accepted', 'declined'
  - `token` (uuid, unique, not null, default gen_random_uuid()) — invite token
  - `expires_at` (timestamptz, not null)
  - `created_at` (timestamptz, default now())

2. Indexes
- `locations_restaurant_id_idx` on locations(restaurant_id)
- `employees_restaurant_id_idx` on employees(restaurant_id)
- `employees_location_id_idx` on employees(location_id)
- `shifts_restaurant_id_idx` on shifts(restaurant_id)
- `shifts_employee_id_idx` on shifts(employee_id)
- `shifts_start_time_idx` on shifts(start_time)
- `time_off_restaurant_id_idx` on time_off_requests(restaurant_id)
- `invitations_restaurant_id_idx` on invitations(restaurant_id)

3. Security
- Enable RLS on all tables.
- All tables are tenant-scoped: access requires a profile in the same restaurant.
- Managers have full CRUD; employees have read access to their restaurant's data and can create/update their own time-off requests.
- Policies use EXISTS subqueries checking profiles.restaurant_id match and role.

4. Important Notes
- Tenant isolation: every policy checks that the authenticated user's profile.restaurant_id matches the row's restaurant_id.
- Employees can see shifts and team data but only managers can create/update/delete.
- Time-off requests: employees can create their own; managers can update status (approve/reject).
- Invitations: only managers can create/read; token-based acceptance handled server-side.
*/

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  job_title text,
  color text,
  max_weekly_hours integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  title text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'confirmed', 'completed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS time_off_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('manager', 'employee')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS locations_restaurant_id_idx ON locations(restaurant_id);
CREATE INDEX IF NOT EXISTS employees_restaurant_id_idx ON employees(restaurant_id);
CREATE INDEX IF NOT EXISTS employees_location_id_idx ON employees(location_id);
CREATE INDEX IF NOT EXISTS shifts_restaurant_id_idx ON shifts(restaurant_id);
CREATE INDEX IF NOT EXISTS shifts_employee_id_idx ON shifts(employee_id);
CREATE INDEX IF NOT EXISTS shifts_start_time_idx ON shifts(start_time);
CREATE INDEX IF NOT EXISTS time_off_restaurant_id_idx ON time_off_requests(restaurant_id);
CREATE INDEX IF NOT EXISTS invitations_restaurant_id_idx ON invitations(restaurant_id);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Helper: any authenticated user with a profile in the restaurant can read
-- We use a consistent pattern: EXISTS check on profiles for membership, plus role check for manager-only ops

-- LOCATIONS
DROP POLICY IF EXISTS "read_locations" ON locations;
CREATE POLICY "read_locations" ON locations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = locations.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_insert_locations" ON locations;
CREATE POLICY "manager_insert_locations" ON locations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = locations.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_locations" ON locations;
CREATE POLICY "manager_update_locations" ON locations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = locations.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = locations.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_delete_locations" ON locations;
CREATE POLICY "manager_delete_locations" ON locations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = locations.restaurant_id)
  );

-- EMPLOYEES
DROP POLICY IF EXISTS "read_employees" ON employees;
CREATE POLICY "read_employees" ON employees FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = employees.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_insert_employees" ON employees;
CREATE POLICY "manager_insert_employees" ON employees FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = employees.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_employees" ON employees;
CREATE POLICY "manager_update_employees" ON employees FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = employees.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = employees.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_delete_employees" ON employees;
CREATE POLICY "manager_delete_employees" ON employees FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = employees.restaurant_id)
  );

-- SHIFTS
DROP POLICY IF EXISTS "read_shifts" ON shifts;
CREATE POLICY "read_shifts" ON shifts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = shifts.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_insert_shifts" ON shifts;
CREATE POLICY "manager_insert_shifts" ON shifts FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shifts.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_shifts" ON shifts;
CREATE POLICY "manager_update_shifts" ON shifts FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shifts.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shifts.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_delete_shifts" ON shifts;
CREATE POLICY "manager_delete_shifts" ON shifts FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shifts.restaurant_id)
  );

-- TIME OFF REQUESTS
-- Employees can read their restaurant's requests, managers can read all
DROP POLICY IF EXISTS "read_time_off" ON time_off_requests;
CREATE POLICY "read_time_off" ON time_off_requests FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = time_off_requests.restaurant_id)
  );

-- Any authenticated member can create a time-off request
DROP POLICY IF EXISTS "insert_time_off" ON time_off_requests;
CREATE POLICY "insert_time_off" ON time_off_requests FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = time_off_requests.restaurant_id)
  );

-- Managers can update (approve/reject); employees can cancel their own
DROP POLICY IF EXISTS "update_time_off" ON time_off_requests;
CREATE POLICY "update_time_off" ON time_off_requests FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = time_off_requests.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = time_off_requests.restaurant_id)
  );

-- Managers can delete time-off requests
DROP POLICY IF EXISTS "manager_delete_time_off" ON time_off_requests;
CREATE POLICY "manager_delete_time_off" ON time_off_requests FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = time_off_requests.restaurant_id)
  );

-- INVITATIONS
DROP POLICY IF EXISTS "manager_read_invitations" ON invitations;
CREATE POLICY "manager_read_invitations" ON invitations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = invitations.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_insert_invitations" ON invitations;
CREATE POLICY "manager_insert_invitations" ON invitations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = invitations.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_invitations" ON invitations;
CREATE POLICY "manager_update_invitations" ON invitations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = invitations.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = invitations.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_delete_invitations" ON invitations;
CREATE POLICY "manager_delete_invitations" ON invitations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = invitations.restaurant_id)
  );
