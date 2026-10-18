-- Enforce tenant consistency for denormalized restaurant_id columns.
-- SECURITY DEFINER is required so RLS on referenced rows cannot hide a mismatch.
CREATE OR REPLACE FUNCTION public.validate_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  related_restaurant_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'shifts' THEN
    SELECT restaurant_id INTO related_restaurant_id FROM public.locations WHERE id = NEW.location_id;
    IF related_restaurant_id IS NULL OR related_restaurant_id <> NEW.restaurant_id THEN
      RAISE EXCEPTION 'Shift location must belong to the same restaurant' USING ERRCODE = '23514';
    END IF;
    IF NEW.employee_id IS NOT NULL THEN
      SELECT restaurant_id INTO related_restaurant_id FROM public.employees WHERE id = NEW.employee_id;
      IF related_restaurant_id IS NULL OR related_restaurant_id <> NEW.restaurant_id THEN
        RAISE EXCEPTION 'Assigned employee must belong to the same restaurant' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'contracts' OR TG_TABLE_NAME = 'availability' OR TG_TABLE_NAME = 'availability_overrides' THEN
    SELECT restaurant_id INTO related_restaurant_id FROM public.employees WHERE id = NEW.employee_id;
    IF related_restaurant_id IS NULL OR related_restaurant_id <> NEW.restaurant_id THEN
      RAISE EXCEPTION 'Employee must belong to the same restaurant' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'schedule_templates' OR TG_TABLE_NAME = 'staffing_requirements' THEN
    SELECT restaurant_id INTO related_restaurant_id FROM public.locations WHERE id = NEW.location_id;
    IF related_restaurant_id IS NULL OR related_restaurant_id <> NEW.restaurant_id THEN
      RAISE EXCEPTION 'Location must belong to the same restaurant' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'payroll_entries' THEN
    SELECT restaurant_id INTO related_restaurant_id FROM public.payroll_periods WHERE id = NEW.payroll_period_id;
    IF related_restaurant_id IS NULL OR related_restaurant_id <> NEW.restaurant_id THEN
      RAISE EXCEPTION 'Payroll period must belong to the same restaurant' USING ERRCODE = '23514';
    END IF;
    SELECT restaurant_id INTO related_restaurant_id FROM public.employees WHERE id = NEW.employee_id;
    IF related_restaurant_id IS NULL OR related_restaurant_id <> NEW.restaurant_id THEN
      RAISE EXCEPTION 'Payroll employee must belong to the same restaurant' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'notifications' THEN
    SELECT restaurant_id INTO related_restaurant_id FROM public.profiles WHERE id = NEW.recipient_id;
    IF related_restaurant_id IS NULL OR related_restaurant_id <> NEW.restaurant_id THEN
      RAISE EXCEPTION 'Notification recipient must belong to the same restaurant' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_tenant_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_tenant_consistency() FROM anon, authenticated;

DROP TRIGGER IF EXISTS validate_tenant_consistency ON public.shifts;
CREATE TRIGGER validate_tenant_consistency BEFORE INSERT OR UPDATE ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_consistency();

DROP TRIGGER IF EXISTS validate_tenant_consistency ON public.contracts;
CREATE TRIGGER validate_tenant_consistency BEFORE INSERT OR UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_consistency();

DROP TRIGGER IF EXISTS validate_tenant_consistency ON public.availability;
CREATE TRIGGER validate_tenant_consistency BEFORE INSERT OR UPDATE ON public.availability
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_consistency();

DROP TRIGGER IF EXISTS validate_tenant_consistency ON public.availability_overrides;
CREATE TRIGGER validate_tenant_consistency BEFORE INSERT OR UPDATE ON public.availability_overrides
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_consistency();

DROP TRIGGER IF EXISTS validate_tenant_consistency ON public.schedule_templates;
CREATE TRIGGER validate_tenant_consistency BEFORE INSERT OR UPDATE ON public.schedule_templates
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_consistency();

DROP TRIGGER IF EXISTS validate_tenant_consistency ON public.staffing_requirements;
CREATE TRIGGER validate_tenant_consistency BEFORE INSERT OR UPDATE ON public.staffing_requirements
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_consistency();

DROP TRIGGER IF EXISTS validate_tenant_consistency ON public.payroll_entries;
CREATE TRIGGER validate_tenant_consistency BEFORE INSERT OR UPDATE ON public.payroll_entries
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_consistency();

DROP TRIGGER IF EXISTS validate_tenant_consistency ON public.notifications;
CREATE TRIGGER validate_tenant_consistency BEFORE INSERT OR UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_consistency();
