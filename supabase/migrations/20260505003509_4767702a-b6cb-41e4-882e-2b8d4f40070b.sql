
-- The log_persona_deletion and prevent_duplicate_persona REVOKE was already in the migration.
-- Fix the remaining SECURITY DEFINER warnings for log_persona_changes (existing function).
REVOKE EXECUTE ON FUNCTION public.log_persona_changes() FROM anon, public;
