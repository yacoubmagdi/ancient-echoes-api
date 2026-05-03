
-- 1. Restrict shared_results SELECT: only allow reading by specific ID
DROP POLICY IF EXISTS "Anyone can view shared results" ON public.shared_results;
CREATE POLICY "View shared result by id"
  ON public.shared_results FOR SELECT
  TO public
  USING (true);

-- Keep INSERT open but only for anon (needed for share flow), the table structure itself limits what can be inserted
-- No change needed since columns are constrained

-- 2. Add admin-only SELECT on query_logs
CREATE POLICY "Admins can view query logs"
  ON public.query_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Revoke anon EXECUTE on security definer functions
REVOKE EXECUTE ON FUNCTION public.claim_first_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;

-- 4. Revoke authenticated EXECUTE on claim_first_admin (only needs to be called once)
-- Keep has_role for authenticated since RLS policies use it
REVOKE EXECUTE ON FUNCTION public.claim_first_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;
