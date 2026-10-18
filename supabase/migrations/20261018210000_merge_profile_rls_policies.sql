-- Merge own-profile and manager-team policies to avoid repeated permissive-policy evaluation.
-- The predicates preserve the existing access model while reducing duplicate policy checks.

DROP POLICY IF EXISTS read_own_profile ON public.profiles;
DROP POLICY IF EXISTS manager_read_team_profiles ON public.profiles;
CREATE POLICY profiles_select_own_or_manager_team ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (
      private.current_profile_is_manager()
      AND restaurant_id = private.current_profile_restaurant_id()
    )
  );

DROP POLICY IF EXISTS update_own_profile ON public.profiles;
DROP POLICY IF EXISTS manager_update_team_profiles ON public.profiles;
CREATE POLICY profiles_update_own_or_manager_team ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (
      private.current_profile_is_manager()
      AND restaurant_id = private.current_profile_restaurant_id()
    )
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR (
      private.current_profile_is_manager()
      AND restaurant_id = private.current_profile_restaurant_id()
    )
  );
