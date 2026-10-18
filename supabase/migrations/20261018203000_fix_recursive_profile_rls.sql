-- Avoid recursive RLS evaluation: profile policies must not query profiles
-- through the same RLS policies they are currently evaluating.
CREATE OR REPLACE FUNCTION public.current_profile_restaurant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.restaurant_id
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.role = 'manager' AND p.restaurant_id IS NOT NULL
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
    LIMIT 1
  ), false);
$$;

REVOKE ALL ON FUNCTION public.current_profile_restaurant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_profile_restaurant_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_profile_restaurant_id() TO authenticated;

REVOKE ALL ON FUNCTION public.current_profile_is_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_profile_is_manager() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_profile_is_manager() TO authenticated;

DROP POLICY IF EXISTS manager_read_team_profiles ON public.profiles;
CREATE POLICY manager_read_team_profiles ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.current_profile_is_manager()
    AND restaurant_id = public.current_profile_restaurant_id()
  );

DROP POLICY IF EXISTS manager_update_team_profiles ON public.profiles;
CREATE POLICY manager_update_team_profiles ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.current_profile_is_manager()
    AND restaurant_id = public.current_profile_restaurant_id()
  )
  WITH CHECK (
    public.current_profile_is_manager()
    AND restaurant_id = public.current_profile_restaurant_id()
  );

DROP POLICY IF EXISTS manager_delete_team_profiles ON public.profiles;
CREATE POLICY manager_delete_team_profiles ON public.profiles
  FOR DELETE TO authenticated
  USING (
    public.current_profile_is_manager()
    AND restaurant_id = public.current_profile_restaurant_id()
  );
