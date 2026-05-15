CREATE TABLE public.admin_otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_otp_requests_user_created ON public.admin_otp_requests(user_id, created_at DESC);
CREATE INDEX idx_admin_otp_requests_ip_created ON public.admin_otp_requests(ip_hash, created_at DESC);

ALTER TABLE public.admin_otp_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view otp requests"
ON public.admin_otp_requests
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));