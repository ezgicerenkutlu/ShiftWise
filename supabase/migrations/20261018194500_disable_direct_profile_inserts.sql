-- Profile creation is handled only by the trusted auth signup trigger.
-- Do not allow direct PostgREST inserts into profiles, even with role='employee',
-- because callers could attach an existing account to a tenant without an invite.
DROP POLICY IF EXISTS "manager_insert_team_profiles" ON public.profiles;
