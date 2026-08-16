/*
# Fix security advisor warnings on trigger functions

1. Changes
- `slugify()`: add `SET search_path = public` to lock the search path (removes mutable search_path warning).
- `handle_new_user()`: revoke EXECUTE from `anon` and `authenticated` so the function cannot be called
  directly via the REST API. It only needs to run as a database trigger on auth.users INSERT, not as
  an RPC endpoint.

2. Security
- Both functions remain SECURITY DEFINER (required for the trigger to write to tables during signup).
- By revoking EXECUTE from anon/authenticated, the function is no longer callable via
  /rest/v1/rpc/handle_new_user — it can only fire as a trigger.
- search_path is now locked to public on slugify, preventing search_path injection.
*/

-- Fix slugify: lock search_path
CREATE OR REPLACE FUNCTION slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        COALESCE(input, 'restaurant'),
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      ),
      '^-+|-+$',
      '',
      'g'
    )
  );
$$;

-- Revoke direct execute on handle_new_user (trigger-only)
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM authenticated;
