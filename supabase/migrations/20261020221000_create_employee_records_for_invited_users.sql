-- Ensure accepted employee invitations also create the operational employee record
-- consumed by Schedule, Availability, and other staffing features.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_full_name text;
  v_slug text;
  v_restaurant_name text;
  v_restaurant_id uuid;
  v_invitation public.invitations%ROWTYPE;
  v_invitation_count integer;
BEGIN
  v_full_name := COALESCE(
    NULLIF(btrim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(COALESCE(new.email, ''), '@', 1)
  );

  SELECT count(*)
  INTO v_invitation_count
  FROM public.invitations
  WHERE lower(email) = lower(new.email)
    AND status = 'pending'
    AND expires_at > now();

  IF v_invitation_count > 1 THEN
    RAISE EXCEPTION 'Multiple pending invitations exist for this email; resolve them before signup'
      USING ERRCODE = '23505';
  END IF;

  IF v_invitation_count = 1 THEN
    SELECT *
    INTO STRICT v_invitation
    FROM public.invitations
    WHERE lower(email) = lower(new.email)
      AND status = 'pending'
      AND expires_at > now()
    FOR UPDATE;

    INSERT INTO public.profiles (id, restaurant_id, email, full_name, role)
    VALUES (
      new.id,
      v_invitation.restaurant_id,
      lower(new.email),
      v_full_name,
      v_invitation.role
    );

    IF v_invitation.role = 'employee' THEN
      INSERT INTO public.employees (
        restaurant_id,
        location_id,
        profile_id,
        full_name,
        email
      )
      VALUES (
        v_invitation.restaurant_id,
        (
          SELECT l.id
          FROM public.locations AS l
          WHERE l.restaurant_id = v_invitation.restaurant_id
          ORDER BY l.created_at
          LIMIT 1
        ),
        new.id,
        v_full_name,
        lower(new.email)
      )
      ON CONFLICT DO NOTHING;
    END IF;

    UPDATE public.invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = v_invitation.id;

    RETURN new;
  END IF;

  v_restaurant_name := COALESCE(
    NULLIF(btrim(new.raw_user_meta_data->>'restaurant_name'), ''),
    COALESCE(v_full_name, 'New User') || '''s Restaurant'
  );
  v_slug := public.slugify(v_restaurant_name)
    || '-'
    || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.restaurants (name, slug, owner_id)
  VALUES (v_restaurant_name, v_slug, new.id)
  RETURNING id INTO v_restaurant_id;

  INSERT INTO public.profiles (id, restaurant_id, email, full_name, role)
  VALUES (new.id, v_restaurant_id, lower(new.email), v_full_name, 'manager');

  INSERT INTO public.locations (restaurant_id, name, address)
  VALUES (v_restaurant_id, 'Main Location', NULL);

  RETURN new;
END;
$function$;

-- Repair employee profiles that were accepted before the employee-row creation
-- was added. Do not create duplicates when a linked employee already exists.
INSERT INTO public.employees (
  restaurant_id,
  location_id,
  profile_id,
  full_name,
  email
)
SELECT
  p.restaurant_id,
  (
    SELECT l.id
    FROM public.locations AS l
    WHERE l.restaurant_id = p.restaurant_id
    ORDER BY l.created_at
    LIMIT 1
  ),
  p.id,
  COALESCE(NULLIF(btrim(p.full_name), ''), split_part(COALESCE(p.email, ''), '@', 1)),
  lower(p.email)
FROM public.profiles AS p
WHERE p.role = 'employee'
  AND p.restaurant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.employees AS e
    WHERE e.profile_id = p.id
       OR (lower(e.email) = lower(p.email) AND e.restaurant_id = p.restaurant_id)
  );
