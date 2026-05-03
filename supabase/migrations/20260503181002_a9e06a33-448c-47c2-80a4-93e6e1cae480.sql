
-- Create verification log table
CREATE TABLE public.persona_verification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_name text NOT NULL,
  category text NOT NULL,
  role text,
  gender text,
  verdict text NOT NULL CHECK (verdict IN ('accepted', 'rejected', 'uncertain')),
  reason text NOT NULL,
  sources text[],
  confidence numeric,
  verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.persona_verification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view verification logs"
  ON public.persona_verification_log
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service can insert verification logs"
  ON public.persona_verification_log
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add verification_status to personas table
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'unverified'
    CHECK (verification_status IN ('verified', 'rejected', 'unverified', 'uncertain'));
