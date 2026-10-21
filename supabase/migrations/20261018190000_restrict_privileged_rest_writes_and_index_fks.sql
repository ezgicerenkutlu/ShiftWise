-- Close direct REST paths that could create privileged team membership or invitations.
DROP POLICY IF EXISTS "manager_insert_team_profiles" ON public.profiles;
CREATE POLICY "manager_insert_team_profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    role = 'employee'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'manager'
        AND p.restaurant_id = profiles.restaurant_id
    )
  );

-- Invitations are created by the authenticated, server-validated Edge Function
-- using the service role. Managers may read their tenant's invitations, but
-- cannot forge manager invitations or mutate invitation state directly via REST.
DROP POLICY IF EXISTS "manager_insert_invitations" ON public.invitations;
DROP POLICY IF EXISTS "manager_update_invitations" ON public.invitations;
DROP POLICY IF EXISTS "manager_delete_invitations" ON public.invitations;

-- Index the foreign-key columns flagged by the Supabase performance advisor.
CREATE INDEX IF NOT EXISTS employees_profile_id_idx ON public.employees(profile_id);
CREATE INDEX IF NOT EXISTS shift_swap_requests_requesting_employee_id_idx ON public.shift_swap_requests(requesting_employee_id);
CREATE INDEX IF NOT EXISTS shift_swap_requests_reviewed_by_idx ON public.shift_swap_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS shift_swap_requests_target_employee_id_idx ON public.shift_swap_requests(target_employee_id);
CREATE INDEX IF NOT EXISTS shifts_location_id_idx ON public.shifts(location_id);
CREATE INDEX IF NOT EXISTS time_off_requests_employee_id_idx ON public.time_off_requests(employee_id);
CREATE INDEX IF NOT EXISTS vacation_requests_reviewed_by_idx ON public.vacation_requests(reviewed_by);
