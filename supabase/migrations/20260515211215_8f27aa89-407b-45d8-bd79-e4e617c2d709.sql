
-- Restrict admin role to only yacoubmgy@gmail.com
CREATE OR REPLACE FUNCTION public.enforce_admin_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
BEGIN
  IF NEW.role = 'admin' THEN
    SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
    IF user_email IS NULL OR lower(user_email) <> 'yacoubmgy@gmail.com' THEN
      RAISE EXCEPTION 'Admin role can only be granted to yacoubmgy@gmail.com';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_admin_email_trigger ON public.user_roles;
CREATE TRIGGER enforce_admin_email_trigger
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_email();

-- Remove any non-allowed admin rows
DELETE FROM public.user_roles
WHERE role = 'admin'
  AND user_id NOT IN (SELECT id FROM auth.users WHERE lower(email) = 'yacoubmgy@gmail.com');

-- OTP codes table
CREATE TABLE IF NOT EXISTS public.admin_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_otp_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view own otp"
ON public.admin_otp_codes FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
