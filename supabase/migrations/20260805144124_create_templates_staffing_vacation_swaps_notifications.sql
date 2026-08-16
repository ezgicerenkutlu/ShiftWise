/*
# Scheduling templates, staffing requirements, vacation requests, shift swaps, notifications

1. New Tables

- `schedule_templates`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, FK → restaurants ON DELETE CASCADE)
  - `location_id` (uuid, FK → locations ON DELETE CASCADE)
  - `name` (text, not null) — template name, e.g. "Weekday Lunch"
  - `day_of_week` (integer, CHECK 0–6) — which weekday this template applies to
  - `start_time` (time, not null) — shift start
  - `end_time` (time, not null) — shift end
  - `role_required` (text) — job title this template targets, e.g. "Server"
  - `min_staff` (integer, default 1) — minimum employees needed
  - `max_staff` (integer) — maximum employees allowed
  - `is_active` (boolean, default true)
  - `created_at`, `updated_at` (timestamptz)

- `staffing_requirements`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, FK → restaurants ON DELETE CASCADE)
  - `location_id` (uuid, FK → locations ON DELETE CASCADE)
  - `day_of_week` (integer, CHECK 0–6)
  - `start_time` (time, not null)
  - `end_time` (time, not null)
  - `role` (text, not null) — job title, e.g. "Server", "Cook"
  - `min_employees` (integer, not null, default 1) — minimum coverage required
  - `max_employees` (integer) — optional maximum
  - `created_at`, `updated_at` (timestamptz)
  - UNIQUE (location_id, day_of_week, start_time, end_time, role) — one requirement per slot/role

- `vacation_requests`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, FK → restaurants ON DELETE CASCADE)
  - `employee_id` (uuid, FK → employees ON DELETE CASCADE)
  - `start_date` (date, not null)
  - `end_date` (date, not null)
  - `reason` (text)
  - `status` (text, not null, default 'pending') — 'pending', 'approved', 'rejected'
  - `reviewed_by` (uuid, FK → profiles ON DELETE SET NULL) — manager who approved/rejected
  - `reviewed_at` (timestamptz) — when the decision was made
  - `created_at`, `updated_at` (timestamptz)

- `shift_swap_requests`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, FK → restaurants ON DELETE CASCADE)
  - `shift_id` (uuid, FK → shifts ON DELETE CASCADE) — the shift being swapped
  - `requesting_employee_id` (uuid, FK → employees ON DELETE CASCADE) — employee who wants to give away the shift
  - `target_employee_id` (uuid, FK → employees ON DELETE SET NULL) — employee asked to take it (nullable = open swap)
  - `status` (text, not null, default 'pending') — 'pending', 'accepted', 'rejected', 'completed'
  - `reason` (text)
  - `reviewed_by` (uuid, FK → profiles ON DELETE SET NULL) — manager who approved
  - `reviewed_at` (timestamptz)
  - `created_at`, `updated_at` (timestamptz)

- `notifications`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, FK → restaurants ON DELETE CASCADE)
  - `recipient_id` (uuid, FK → profiles ON DELETE CASCADE) — who receives the notification
  - `type` (text, not null) — 'shift_published', 'vacation_approved', 'shift_swap', 'reminder', etc.
  - `title` (text, not null)
  - `message` (text)
  - `is_read` (boolean, default false)
  - `related_entity_id` (uuid) — polymorphic FK to the related row (shift, vacation request, etc.)
  - `related_entity_type` (text) — which table the related_entity_id points to
  - `created_at` (timestamptz)

2. Indexes
- `schedule_templates_restaurant_id_idx`
- `schedule_templates_location_id_idx`
- `staffing_requirements_restaurant_id_idx`
- `staffing_requirements_location_id_idx`
- `vacation_requests_restaurant_id_idx`
- `vacation_requests_employee_id_idx`
- `vacation_requests_status_idx`
- `shift_swap_requests_restaurant_id_idx`
- `shift_swap_requests_shift_id_idx`
- `shift_swap_requests_status_idx`
- `notifications_recipient_id_idx`
- `notifications_restaurant_id_idx`
- `notifications_unread_idx` — partial index on unread notifications

3. Security
- Enable RLS on all five tables.
- schedule_templates, staffing_requirements: managers have full CRUD; employees can read.
- vacation_requests: employees can create/read their own; managers can read all and update status.
- shift_swap_requests: employees can create/read their own (as requester or target); managers can read all and update status.
- notifications: each user can read/update only their own notifications; managers can create notifications for any member of their restaurant.

4. Important Notes
- vacation_requests replaces the earlier time_off_requests table with richer fields (reviewed_by, reviewed_at).
  Both coexist for backward compatibility; the app can migrate to vacation_requests going forward.
- shift_swap_requests links to a specific shift and two employees (requester + optional target).
- notifications uses a polymorphic related_entity_id/type pattern since a notification can reference
  different entity types (shifts, vacation requests, swap requests).
- The partial index on notifications (WHERE is_read = false) speeds up the common "fetch unread count" query.
*/

-- ============================================================
-- schedule_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS schedule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  role_required text,
  min_staff integer NOT NULL DEFAULT 1,
  max_staff integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_templates_restaurant_id_idx ON schedule_templates(restaurant_id);
CREATE INDEX IF NOT EXISTS schedule_templates_location_id_idx ON schedule_templates(location_id);

ALTER TABLE schedule_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_schedule_templates" ON schedule_templates;
CREATE POLICY "read_schedule_templates" ON schedule_templates FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = schedule_templates.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_insert_schedule_templates" ON schedule_templates;
CREATE POLICY "manager_insert_schedule_templates" ON schedule_templates FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = schedule_templates.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_schedule_templates" ON schedule_templates;
CREATE POLICY "manager_update_schedule_templates" ON schedule_templates FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = schedule_templates.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = schedule_templates.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_delete_schedule_templates" ON schedule_templates;
CREATE POLICY "manager_delete_schedule_templates" ON schedule_templates FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = schedule_templates.restaurant_id)
  );

-- ============================================================
-- staffing_requirements
-- ============================================================
CREATE TABLE IF NOT EXISTS staffing_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  role text NOT NULL,
  min_employees integer NOT NULL DEFAULT 1 CHECK (min_employees >= 0),
  max_employees integer CHECK (max_employees >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, day_of_week, start_time, end_time, role)
);

CREATE INDEX IF NOT EXISTS staffing_requirements_restaurant_id_idx ON staffing_requirements(restaurant_id);
CREATE INDEX IF NOT EXISTS staffing_requirements_location_id_idx ON staffing_requirements(location_id);

ALTER TABLE staffing_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_staffing_requirements" ON staffing_requirements;
CREATE POLICY "read_staffing_requirements" ON staffing_requirements FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = staffing_requirements.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_insert_staffing_requirements" ON staffing_requirements;
CREATE POLICY "manager_insert_staffing_requirements" ON staffing_requirements FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = staffing_requirements.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_staffing_requirements" ON staffing_requirements;
CREATE POLICY "manager_update_staffing_requirements" ON staffing_requirements FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = staffing_requirements.restaurant_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = staffing_requirements.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_delete_staffing_requirements" ON staffing_requirements;
CREATE POLICY "manager_delete_staffing_requirements" ON staffing_requirements FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = staffing_requirements.restaurant_id)
  );

-- ============================================================
-- vacation_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS vacation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vacation_requests_restaurant_id_idx ON vacation_requests(restaurant_id);
CREATE INDEX IF NOT EXISTS vacation_requests_employee_id_idx ON vacation_requests(employee_id);
CREATE INDEX IF NOT EXISTS vacation_requests_status_idx ON vacation_requests(status);

ALTER TABLE vacation_requests ENABLE ROW LEVEL SECURITY;

-- Employees can read their own; managers can read all in restaurant
DROP POLICY IF EXISTS "read_vacation_requests" ON vacation_requests;
CREATE POLICY "read_vacation_requests" ON vacation_requests FOR SELECT
  TO authenticated USING (
    vacation_requests.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = vacation_requests.restaurant_id
    )
  );

-- Employees can create their own vacation requests
DROP POLICY IF EXISTS "insert_vacation_requests" ON vacation_requests;
CREATE POLICY "insert_vacation_requests" ON vacation_requests FOR INSERT
  TO authenticated WITH CHECK (
    vacation_requests.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = vacation_requests.restaurant_id
    )
  );

-- Managers can update (approve/reject); employees can cancel their own
DROP POLICY IF EXISTS "update_vacation_requests" ON vacation_requests;
CREATE POLICY "update_vacation_requests" ON vacation_requests FOR UPDATE
  TO authenticated USING (
    vacation_requests.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = vacation_requests.restaurant_id
    )
  ) WITH CHECK (
    vacation_requests.employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = vacation_requests.restaurant_id
    )
  );

-- Only managers can delete vacation requests
DROP POLICY IF EXISTS "manager_delete_vacation_requests" ON vacation_requests;
CREATE POLICY "manager_delete_vacation_requests" ON vacation_requests FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = vacation_requests.restaurant_id)
  );

-- ============================================================
-- shift_swap_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  requesting_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  target_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'completed')),
  reason text,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_swap_requests_restaurant_id_idx ON shift_swap_requests(restaurant_id);
CREATE INDEX IF NOT EXISTS shift_swap_requests_shift_id_idx ON shift_swap_requests(shift_id);
CREATE INDEX IF NOT EXISTS shift_swap_requests_status_idx ON shift_swap_requests(status);

ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY;

-- Employees can read swaps where they are requester or target; managers can read all
DROP POLICY IF EXISTS "read_shift_swap_requests" ON shift_swap_requests;
CREATE POLICY "read_shift_swap_requests" ON shift_swap_requests FOR SELECT
  TO authenticated USING (
    shift_swap_requests.requesting_employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR shift_swap_requests.target_employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shift_swap_requests.restaurant_id
    )
  );

-- Employees can create swap requests for their own shifts
DROP POLICY IF EXISTS "insert_shift_swap_requests" ON shift_swap_requests;
CREATE POLICY "insert_shift_swap_requests" ON shift_swap_requests FOR INSERT
  TO authenticated WITH CHECK (
    shift_swap_requests.requesting_employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shift_swap_requests.restaurant_id
    )
  );

-- Managers can update (approve/reject); employees can update status of swaps involving them
DROP POLICY IF EXISTS "update_shift_swap_requests" ON shift_swap_requests;
CREATE POLICY "update_shift_swap_requests" ON shift_swap_requests FOR UPDATE
  TO authenticated USING (
    shift_swap_requests.requesting_employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR shift_swap_requests.target_employee_id IN (
      SELECT e.id FROM employees e WHERE e.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shift_swap_requests.restaurant_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = shift_swap_requests.restaurant_id
    )
  );

-- Only managers can delete swap requests
DROP POLICY IF EXISTS "manager_delete_shift_swap_requests" ON shift_swap_requests;
CREATE POLICY "manager_delete_shift_swap_requests" ON shift_swap_requests FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shift_swap_requests.restaurant_id)
  );

-- ============================================================
-- notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  related_entity_id uuid,
  related_entity_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_id_idx ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS notifications_restaurant_id_idx ON notifications(restaurant_id);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(recipient_id) WHERE is_read = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
DROP POLICY IF EXISTS "read_own_notifications" ON notifications;
CREATE POLICY "read_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = recipient_id);

-- Users can mark their own notifications as read
DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

-- Users can delete their own notifications
DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (auth.uid() = recipient_id);

-- Managers can create notifications for any member of their restaurant
DROP POLICY IF EXISTS "manager_insert_notifications" ON notifications;
CREATE POLICY "manager_insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'manager'
        AND p.restaurant_id = notifications.restaurant_id
    )
    AND EXISTS (
      SELECT 1 FROM profiles r
      WHERE r.id = notifications.recipient_id
        AND r.restaurant_id = notifications.restaurant_id
    )
  );
