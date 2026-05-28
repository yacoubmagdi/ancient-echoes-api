-- 1. Remove anonymous access to the biometric face_descriptor column.
REVOKE SELECT ON public.personas FROM anon;
GRANT SELECT (
  id, category, name, description, image_url, created_at,
  gender, role, description_audit, duplicate_flag,
  verification_status, source_image_url, skin_tone,
  is_drawing, name_en, description_en
) ON public.personas TO anon;

-- 2. Add explicit deny policies to shared_results so RLS is fully defined.
-- All access continues via server-side service role (which bypasses RLS).
CREATE POLICY "Deny anon select" ON public.shared_results
  FOR SELECT TO anon USING (false);

CREATE POLICY "Deny authenticated select" ON public.shared_results
  FOR SELECT TO authenticated USING (false);

CREATE POLICY "Deny anon insert" ON public.shared_results
  FOR INSERT TO anon WITH CHECK (false);

CREATE POLICY "Deny authenticated insert" ON public.shared_results
  FOR INSERT TO authenticated WITH CHECK (false);