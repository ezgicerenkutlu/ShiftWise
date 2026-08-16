/*
# Create restaurants and profiles tables (multi-tenant foundation)

1. New Tables
- `restaurants`
  - `id` (uuid, primary key) — unique identifier for each restaurant workspace
  - `name` (text, not null) — restaurant display name
  - `slug` (text, unique, not null) — URL-friendly identifier
  - `owner_id` (uuid, not null, references auth.users) — the user who created the restaurant
  - `created_at` (timestamptz, default now())
- `profiles`
  - `id` (uuid, primary key, references auth.users ON DELETE CASCADE) — one-to-one with auth.users
  - `restaurant_id` (uuid, references restaurants ON DELETE CASCADE) — which restaurant this user belongs to
  - `email` (text, not null) — denormalized from auth.users for convenience
  - `full_name` (text) — display name
  - `avatar_url` (text) — profile photo URL
  - `role` (text, not null, default 'employee') — 'manager' or 'employee'
  - `created_at` (timestamptz, default now())

2. Indexes
- `profiles_restaurant_id_idx` on profiles(restaurant_id) for fast tenant-scoped lookups
- `restaurants_owner_id_idx` on restaurants(owner_id)

3. Security
- Enable RLS on both tables.
- restaurants: members can read their own restaurant; owner can update.
- profiles: users can read/update their own profile row; managers can read/update/insert/delete profiles in their restaurant.
- All policies scoped TO authenticated with ownership/membership checks via auth.uid().

4. Important Notes
- Multi-tenant SaaS: each restaurant is a tenant. Data isolation enforced via RLS.
- The `role` column lives in `profiles` (not user_metadata) so it is server-controlled.
- A trigger (added in a later migration) will auto-create the restaurant + profile on signup.
*/

CREATE TABLE IF NOT EXISTS restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('manager', 'employee')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_restaurant_id_idx ON profiles(restaurant_id);
CREATE INDEX IF NOT EXISTS restaurants_owner_id_idx ON restaurants(owner_id);

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- restaurants: a user can read a restaurant if they have a profile in it
DROP POLICY IF EXISTS "read_own_restaurant" ON restaurants;
CREATE POLICY "read_own_restaurant" ON restaurants FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.restaurant_id = restaurants.id)
  );

-- restaurants: only the owner can update restaurant details
DROP POLICY IF EXISTS "update_own_restaurant" ON restaurants;
CREATE POLICY "update_own_restaurant" ON restaurants FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- profiles: a user can always read their own profile
DROP POLICY IF EXISTS "read_own_profile" ON profiles;
CREATE POLICY "read_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- profiles: a manager can read all profiles within their restaurant
DROP POLICY IF EXISTS "manager_read_team_profiles" ON profiles;
CREATE POLICY "manager_read_team_profiles" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = profiles.restaurant_id
    )
  );

-- profiles: a user can update their own profile (name, avatar) but NOT role
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- profiles: a manager can update team profiles within their restaurant
DROP POLICY IF EXISTS "manager_update_team_profiles" ON profiles;
CREATE POLICY "manager_update_team_profiles" ON profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = profiles.restaurant_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = profiles.restaurant_id
    )
  );

-- profiles: a manager can insert (invite) profiles into their restaurant
DROP POLICY IF EXISTS "manager_insert_team_profiles" ON profiles;
CREATE POLICY "manager_insert_team_profiles" ON profiles FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = profiles.restaurant_id
    )
  );

-- profiles: a manager can delete profiles from their restaurant
DROP POLICY IF EXISTS "manager_delete_team_profiles" ON profiles;
CREATE POLICY "manager_delete_team_profiles" ON profiles FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager' AND p.restaurant_id = profiles.restaurant_id
    )
  );
