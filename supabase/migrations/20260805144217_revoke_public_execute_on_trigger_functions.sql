/*
# Revoke EXECUTE on SECURITY DEFINER functions from public role

The `public` role grants EXECUTE on all functions by default. Even after revoking
from anon and authenticated, the public role still allows execution. This migration
revokes EXECUTE from public on both SECURITY DEFINER trigger functions so they
cannot be called via the REST API — only as database triggers.
*/

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION set_updated_at() FROM public;
