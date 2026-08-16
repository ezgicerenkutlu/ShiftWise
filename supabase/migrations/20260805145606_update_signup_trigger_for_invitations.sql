/*
# Update handle_new_user to support invited employees

1. Changes
- Modify `handle_new_user()` trigger function to check for a pending invitation
  matching the new user's email. If found, link the user to the inviting restaurant
  with the role specified in the invitation (manager or employee), and mark the
  invitation as accepted. If no invitation is found, create a new restaurant
  (existing behavior for managers signing up directly).

2. Important Notes
- When a manager invites an employee, an invitation row is created with the employee's
  email and role. When that employee signs up via Supabase Auth, this trigger checks
  for a matching pending invitation and links them to the existing restaurant.
- The invitation's `status` is updated to 'accepted' and `accepted_at` is set.
- If no invitation exists (direct signup), the original behavior runs: create a new
  restaurant with the signer as manager.
- A new `accepted_at` column is added to the invitations table.
*/

-- Add accepted_at column to invitations
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

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
  v_invitation record;
  v_invited_role text;
BEGIN
  v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  -- Check for a pending invitation matching this email
  SELECT * INTO v_invitation
  FROM invitations
  WHERE email = new.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invitation IS NOT NULL THEN
    -- Invited user: link to existing restaurant with the invited role
    v_invited_role := v_invitation.role;

    INSERT INTO profiles (id, restaurant_id, email, full_name, role)
    VALUES (new.id, v_invitation.restaurant_id, new.email, v_full_name, v_invited_role);

    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = v_invitation.id;

    RETURN new;
  END IF;

  -- No invitation: create a new restaurant (manager signup)
  v_restaurant_name := COALESCE(
    new.raw_user_meta_data->>'restaurant_name',
    COALESCE(v_full_name, 'New User') || '''s Restaurant'
  );

  v_slug := slugify(v_restaurant_name) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO restaurants (name, slug, owner_id)
  VALUES (v_restaurant_name, v_slug, new.id)
  RETURNING id INTO v_restaurant_id;

  INSERT INTO profiles (id, restaurant_id, email, full_name, role)
  VALUES (new.id, v_restaurant_id, new.email, v_full_name, 'manager');

  INSERT INTO locations (restaurant_id, name, address)
  VALUES (v_restaurant_id, 'Main Location', NULL)
  RETURNING id INTO v_location_id;

  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM public;
