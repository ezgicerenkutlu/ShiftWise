/*
# Create shift_generator_configs table

1. New Tables
- `shift_generator_configs`
  - `id` (uuid, primary key)
  - `restaurant_id` (uuid, references restaurants ON DELETE CASCADE)
  - `name` (text, not null) — config name, e.g. "Weekend Config"
  - `opening_time` (time, not null) — daily opening hour, e.g. "09:00"
  - `closing_time` (time, not null) — daily closing hour, e.g. "22:00"
  - `shift_duration_hours` (numeric, not null) — hours per shift slot, e.g. 4 or 8
  - `min_employees_per_shift` (integer, not null) — minimum concurrent staff
  - `days_of_week` (integer[], not null) — which days to generate: 0=Sun … 6=Sat
  - `target_week_start` (date) — the Monday/start of the week to generate for
  - `notes` (text) — optional manager notes
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `shift_generator_configs`.
- Managers (same restaurant) can SELECT, INSERT, UPDATE, DELETE.
- Employees (same restaurant) can SELECT to view active configs.

3. Notes
- `days_of_week` stored as integer array so managers can select Mon-Fri vs all week etc.
- `shift_duration_hours` is numeric to support half-hour steps (e.g. 7.5 hours).
- This table acts as the input specification for the shift-generation engine — both the
  current rule-based engine and any future OR-Tools solver read from it.
*/

CREATE TABLE IF NOT EXISTS shift_generator_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default Config',
  opening_time time NOT NULL DEFAULT '09:00',
  closing_time time NOT NULL DEFAULT '22:00',
  shift_duration_hours numeric NOT NULL DEFAULT 8,
  min_employees_per_shift integer NOT NULL DEFAULT 2,
  days_of_week integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  target_week_start date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_generator_configs_restaurant_id_idx
  ON shift_generator_configs(restaurant_id);

ALTER TABLE shift_generator_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_shift_generator_configs" ON shift_generator_configs;
CREATE POLICY "read_shift_generator_configs" ON shift_generator_configs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.restaurant_id = shift_generator_configs.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_insert_shift_generator_configs" ON shift_generator_configs;
CREATE POLICY "manager_insert_shift_generator_configs" ON shift_generator_configs FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shift_generator_configs.restaurant_id)
  );

DROP POLICY IF EXISTS "manager_update_shift_generator_configs" ON shift_generator_configs;
CREATE POLICY "manager_update_shift_generator_configs" ON shift_generator_configs FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shift_generator_configs.restaurant_id))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shift_generator_configs.restaurant_id));

DROP POLICY IF EXISTS "manager_delete_shift_generator_configs" ON shift_generator_configs;
CREATE POLICY "manager_delete_shift_generator_configs" ON shift_generator_configs FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = shift_generator_configs.restaurant_id)
  );
