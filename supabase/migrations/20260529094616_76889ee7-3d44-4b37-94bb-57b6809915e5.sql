-- Explicitly lock down biometric face_descriptor column on public.personas.
-- The table has a permissive "Personas are viewable by everyone" RLS policy;
-- we rely on column-level privileges to keep biometric vectors private.
REVOKE SELECT (face_descriptor) ON public.personas FROM PUBLIC;
REVOKE SELECT (face_descriptor) ON public.personas FROM anon;
REVOKE SELECT (face_descriptor) ON public.personas FROM authenticated;

-- Service role (used by server-side admin client) keeps access to all columns
-- because it bypasses these GRANTs anyway, but make it explicit:
GRANT SELECT (face_descriptor) ON public.personas TO service_role;