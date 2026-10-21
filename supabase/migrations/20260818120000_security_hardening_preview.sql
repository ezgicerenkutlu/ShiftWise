-- Security hardening for preview deployments.
-- This migration intentionally narrows request mutations to managers until
-- employee-specific status transitions are implemented with immutable-field checks.

-- Prevent authenticated users from changing their own role or tenant.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND current_user <> 'service_role'
     AND (
       NEW.role IS DISTINCT FROM OLD.role
       OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
     ) THEN
    RAISE EXCEPTION 'role and restaurant membership can only be changed by trusted server-side operations'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_changes ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_changes
BEFORE UPDATE OF role, restaurant_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_changes();

REVOKE ALL ON FUNCTION public.prevent_profile_privilege_changes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_profile_privilege_changes() FROM anon, authenticated;

-- Profiles: keep self-service updates scoped to the caller and block tenant/role
-- escalation above via trigger. Manager policy remains tenant-scoped.
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Time-off requests: only the linked employee may create their own request;
-- managers may create requests within their tenant. All decisions/edits are
-- manager-only until a dedicated employee cancellation workflow exists.
DROP POLICY IF EXISTS "read_time_off" ON public.time_off_requests;
CREATE POLICY "read_time_off" ON public.time_off_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.restaurant_id = time_off_requests.restaurant_id
    )
    AND (
      time_off_requests.employee_id IN (
        SELECT e.id FROM public.employees e WHERE e.profile_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'manager'
          AND p.restaurant_id = time_off_requests.restaurant_id
      )
    )
  );

DROP POLICY IF EXISTS "insert_time_off" ON public.time_off_requests;
CREATE POLICY "insert_time_off" ON public.time_off_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = time_off_requests.employee_id
        AND e.profile_id = auth.uid()
        AND e.restaurant_id = time_off_requests.restaurant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
        AND p.restaurant_id = time_off_requests.restaurant_id
    )
  );

DROP POLICY IF EXISTS "update_time_off" ON public.time_off_requests;
CREATE POLICY "update_time_off" ON public.time_off_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
        AND p.restaurant_id = time_off_requests.restaurant_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
        AND p.restaurant_id = time_off_requests.restaurant_id
    )
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = time_off_requests.employee_id
        AND e.restaurant_id = time_off_requests.restaurant_id
    )
  );

-- Vacation requests: verify employee-to-tenant linkage on insert and scope reads
-- to the linked employee or a manager in the same restaurant.
DROP POLICY IF EXISTS "read_vacation_requests" ON public.vacation_requests;
CREATE POLICY "read_vacation_requests" ON public.vacation_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = vacation_requests.employee_id
        AND e.profile_id = auth.uid()
        AND e.restaurant_id = vacation_requests.restaurant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
        AND p.restaurant_id = vacation_requests.restaurant_id
    )
  );

DROP POLICY IF EXISTS "insert_vacation_requests" ON public.vacation_requests;
CREATE POLICY "insert_vacation_requests" ON public.vacation_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = vacation_requests.employee_id
        AND e.profile_id = auth.uid()
        AND e.restaurant_id = vacation_requests.restaurant_id
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
        AND p.restaurant_id = vacation_requests.restaurant_id
    )
  );

-- Managers alone may approve/reject requests; employee self-updates could
-- otherwise modify status/reviewer fields due to row-level policies.
DROP POLICY IF EXISTS "update_vacation_requests" ON public.vacation_requests;
CREATE POLICY "update_vacation_requests" ON public.vacation_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
        AND p.restaurant_id = vacation_requests.restaurant_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
        AND p.restaurant_id = vacation_requests.restaurant_id
    )
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = vacation_requests.employee_id
        AND e.restaurant_id = vacation_requests.restaurant_id
    )
  );

-- Shift swaps: ensure inserts are tied to the actual requester's employee record
-- and the shift/target belong to the same tenant. Restrict updates to managers
-- until target-only acceptance is enforced at column/state-transition level.
DROP POLICY IF EXISTS "insert_shift_swap_requests" ON public.shift_swap_requests;
CREATE POLICY "insert_shift_swap_requests" ON public.shift_swap_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = shift_swap_requests.requesting_employee_id
          AND e.profile_id = auth.uid()
          AND e.restaurant_id = shift_swap_requests.restaurant_id
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'manager'
          AND p.restaurant_id = shift_swap_requests.restaurant_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_swap_requests.shift_id
        AND s.restaurant_id = shift_swap_requests.restaurant_id
    )
    AND (
      shift_swap_requests.target_employee_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.employees target
        WHERE target.id = shift_swap_requests.target_employee_id
          AND target.restaurant_id = shift_swap_requests.restaurant_id
      )
    )
  );

DROP POLICY IF EXISTS "update_shift_swap_requests" ON public.shift_swap_requests;
CREATE POLICY "update_shift_swap_requests" ON public.shift_swap_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
        AND p.restaurant_id = shift_swap_requests.restaurant_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager'
        AND p.restaurant_id = shift_swap_requests.restaurant_id
    )
    AND EXISTS (
      SELECT 1 FROM public.shifts s
      WHERE s.id = shift_swap_requests.shift_id
        AND s.restaurant_id = shift_swap_requests.restaurant_id
    )
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shift_swap_requests.requesting_employee_id
        AND e.restaurant_id = shift_swap_requests.restaurant_id
    )
    AND (
      shift_swap_requests.target_employee_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.employees target
        WHERE target.id = shift_swap_requests.target_employee_id
          AND target.restaurant_id = shift_swap_requests.restaurant_id
      )
    )
  );
