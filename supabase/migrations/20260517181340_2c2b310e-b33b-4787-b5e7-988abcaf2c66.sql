
-- Rate limits table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_time
  ON public.rate_limits (key, created_at DESC);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only admins can view; inserts happen via SECURITY DEFINER function (no public policy)
CREATE POLICY "Admins can view rate limits"
  ON public.rate_limits FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Atomic rate-limit check: returns true if allowed, false if over limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key text,
  _max integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attempts integer;
BEGIN
  -- purge stale entries opportunistically for this key
  DELETE FROM public.rate_limits
  WHERE key = _key
    AND created_at < now() - make_interval(secs => _window_seconds);

  SELECT count(*) INTO attempts
  FROM public.rate_limits
  WHERE key = _key
    AND created_at > now() - make_interval(secs => _window_seconds);

  IF attempts >= _max THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limits (key) VALUES (_key);
  RETURN true;
END;
$$;

-- Lock down user_messages: remove public insert policy
DROP POLICY IF EXISTS "Anyone can submit messages" ON public.user_messages;
