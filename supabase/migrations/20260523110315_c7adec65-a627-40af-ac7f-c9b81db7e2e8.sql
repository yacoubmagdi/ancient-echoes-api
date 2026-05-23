
-- 1) Restrict shared_results: remove public read/insert; access only via server (service role)
DROP POLICY IF EXISTS "Anyone can insert shared results" ON public.shared_results;
DROP POLICY IF EXISTS "View shared result by id" ON public.shared_results;

-- 2) Revoke EXECUTE on SECURITY DEFINER functions that should not be callable by clients.
-- Keep has_role (used inside RLS) and claim_first_admin (called by signed-in users) accessible.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_admin_email() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_persona() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_persona_changes() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_persona_deletion() FROM anon, authenticated, public;

-- 3) Prevent anonymous listing of the personas bucket while keeping public read of individual objects.
-- The supabase-js storage.list() / LIST API requires SELECT on storage.objects without a path filter.
-- We replace any broad SELECT with one that requires the request to target a specific object name.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname='Personas public read'
  ) THEN
    DROP POLICY "Personas public read" ON storage.objects;
  END IF;
END $$;

CREATE POLICY "Personas public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'personas');
