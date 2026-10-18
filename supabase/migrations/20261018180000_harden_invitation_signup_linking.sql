-- Harden invitation-to-account linking against ambiguous cross-tenant invites.
-- Supabase Auth invite links verify the email; the trigger must never choose
-- an arbitrary tenant when more than one pending invitation matches.
CREATE OR REPLACE FUNCTION public.handle_new_user()
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
  v_invitation public.invitations%ROWTYPE;
  v_invitation_count integer;
BEGIN
  v_full_name := COALESCE(
    NULLIF(btrim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(COALESCE(new.email, ''), '@', 1)
  );

  SELECT count(*) INTO v_invitation_count
  FROM public.invitations
  WHERE lower(email) = lower(new.email)
    AND status = 'pending'
    AND expires_at > now();

  IF v_invitation_count > 1 THEN
    RAISE EXCEPTION 'Multiple pending invitations exist for this email; resolve them before signup'
      USING ERRCODE = '23505';
  END IF;

  IF v_invitation_count = 1 THEN
    SELECT * INTO STRICT v_invitation
    FROM public.invitations
    WHERE lower(email) = lower(new.email)
      AND status = 'pending'
      AND expires_at > now()
    FOR UPDATE;

    INSERT INTO public.profiles (id, restaurant_id, email, full_name, role)
    VALUES (new.id, v_invitation.restaurant_id, lower(new.email), v_full_name, v_invitation.role);

    UPDATE public.invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = v_invitation.id;

    RETURN new;
  END IF;

  v_restaurant_name := COALESCE(
    NULLIF(btrim(new.raw_user_meta_data->>'restaurant_name'), ''),
    COALESCE(v_full_name, 'New User') || '''s Restaurant'
  );
  v_slug := public.slugify(v_restaurant_name) || '-' ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.restaurants (name, slug, owner_id)
  VALUES (v_restaurant_name, v_slug, new.id)
  RETURNING id INTO v_restaurant_id;

  INSERT INTO public.profiles (id, restaurant_id, email, full_name, role)
  VALUES (new.id, v_restaurant_id, lower(new.email), v_full_name, 'manager');

  INSERT INTO public.locations (restaurant_id, name, address)
  VALUES (v_restaurant_id, 'Main Location', NULL);

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
