-- Extend tenant-consistency checks to employee location/profile links.
CREATE OR REPLACE FUNCTION public.validate_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  related_restaurant_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'employees' THEN
    IF NEW.location_id IS NOT NULL THEN
      SELECT restaurant_id INTO related_restaurant_id FROM public.locations WHERE id = NEW.location_id;
      IF related_restaurant_id IS NULL OR related_restaurant_id <> NEW.restaurant_id THEN
        RAISE EXCEPTION 'Employee location must belong to the same restaurant' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.profile_id IS NOT NULL THEN
      SELECT restaurant_id INTO related_restaurant_id FROM public.profiles WHERE id = NEW.profile_id;
      IF related_restaurant_id IS NULL OR related_restaurant_id <> NEW.restaurant_id THEN
        RAISE EXCEPTION 'Employee profile must belong to the same restaurant' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'shifts' THEN
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

DROP TRIGGER IF EXISTS validate_tenant_consistency ON public.employees;
CREATE TRIGGER validate_tenant_consistency BEFORE INSERT OR UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_consistency();
