-- Lock SECURITY DEFINER trigger functions to an empty search_path.
-- Their table and application-function references are schema-qualified; pg_catalog
-- built-ins remain resolvable without adding writable schemas to the path.
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.validate_tenant_consistency() SET search_path = '';
