/*
# Auto-provision restaurant and manager profile on signup

1. New Functions
- `handle_new_user()` — a trigger function that runs AFTER INSERT on auth.users.
  When a new user signs up, this function:
  1. Creates a new `restaurants` row using the `restaurant_name` from user_metadata
     (or a default name if not provided), with the new user as owner.
  2. Creates a `profiles` row linked to auth.users and the new restaurant,
     with role='manager' (the signup user is the restaurant owner/manager).
  3. Creates a default `locations` row ("Main Location") for the restaurant.

2. New Triggers
- `on_auth_user_created` — fires AFTER INSERT on auth.users, calls handle_new_user().

3. Security
- The function runs with SECURITY DEFINER (as the postgres owner) so it can write to
  restaurants, profiles, and locations tables despite RLS. This is necessary because
  the new user's first request runs before their profile exists, so RLS membership
  checks would fail.
- The function is explicitly granted EXECUTE to the `authenticated` and `anon` roles
  so the trigger can fire during signup.

4. Important Notes
- The signup form stores `restaurant_name` and `full_name` in user_metadata (raw_user_meta_data).
  This trigger reads those values to populate the restaurant and profile.
- The restaurant slug is derived from the restaurant name, lowercased, with non-alphanumeric
  chars replaced by hyphens, and a short random suffix for uniqueness.
- If no restaurant_name is provided, defaults to "{full_name}'s Restaurant".
- The signup user always gets role='manager' since they are creating the workspace.
- Email confirmation is OFF, so the profile is created immediately on signup.
*/

-- Helper to generate a URL-friendly slug from text
CREATE OR REPLACE FUNCTION slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        COALESCE(input, 'restaurant'),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      ),
      '^-+|-+$',
      '',
      'g'
    )
  );
$$;

-- Trigger function: auto-provision restaurant + manager profile + default location
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_name text;
  v_full_name text;
  v_slug text;
  v_restaurant_id uuid;
  v_location_id uuid;
BEGIN
  -- Read metadata from the signup request
  v_restaurant_name := COALESCE(
    new.raw_user_meta_data->>'restaurant_name',
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User') || '''s Restaurant'
  );
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  -- Generate a unique slug (slug + 8-char random suffix)
  v_slug := slugify(v_restaurant_name) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  -- Create the restaurant
  INSERT INTO restaurants (name, slug, owner_id)
  VALUES (v_restaurant_name, v_slug, new.id)
  RETURNING id INTO v_restaurant_id;

  -- Create the manager profile
  INSERT INTO profiles (id, restaurant_id, email, full_name, role)
  VALUES (new.id, v_restaurant_id, new.email, v_full_name, 'manager');

  -- Create a default location
  INSERT INTO locations (restaurant_id, name, address)
  VALUES (v_restaurant_id, 'Main Location', NULL)
  RETURNING id INTO v_location_id;

  RETURN new;
END;
$$;

-- Grant execute so the trigger can fire
GRANT EXECUTE ON FUNCTION handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION handle_new_user() TO anon;

-- Drop existing trigger if re-running, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
