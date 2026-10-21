-- Evaluate stable auth helpers once per statement in RLS policies.
-- Recreate policies transactionally while preserving table, roles, command,
-- permissive/restrictive mode, USING and WITH CHECK expressions.
DO $$
DECLARE
  p record;
  roles_sql text;
  new_qual text;
  new_check text;
  policy_mode text;
  create_sql text;
BEGIN
  FOR p IN
    SELECT *
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual, '') ~* 'auth\.(uid|role)\(\)'
        OR COALESCE(with_check, '') ~* 'auth\.(uid|role)\(\)'
      )
  LOOP
    SELECT string_agg(
      CASE WHEN role_name = 'public' THEN 'PUBLIC' ELSE quote_ident(role_name) END,
      ', '
    )
    INTO roles_sql
    FROM unnest(p.roles) AS role_name;

    new_qual := p.qual;
    new_check := p.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(new_qual, 'auth\.uid\(\)', '(select auth.uid())', 'gi');
      new_qual := regexp_replace(new_qual, 'auth\.role\(\)', '(select auth.role())', 'gi');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(new_check, 'auth\.uid\(\)', '(select auth.uid())', 'gi');
      new_check := regexp_replace(new_check, 'auth\.role\(\)', '(select auth.role())', 'gi');
    END IF;

    policy_mode := CASE WHEN p.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END;

    create_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      p.policyname,
      p.schemaname,
      p.tablename,
      policy_mode,
      p.cmd,
      COALESCE(roles_sql, 'PUBLIC'),
      CASE WHEN new_qual IS NOT NULL THEN format(' USING (%s)', new_qual) ELSE '' END,
      CASE WHEN new_check IS NOT NULL THEN format(' WITH CHECK (%s)', new_check) ELSE '' END
    );

    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    EXECUTE create_sql;
  END LOOP;
END;
$$;
