
REVOKE EXECUTE ON FUNCTION public.log_persona_changes() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_persona_changes() TO authenticated;
