
-- Enable extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create table for URL check results
CREATE TABLE public.source_url_check_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  persona_id uuid NOT NULL,
  persona_name text NOT NULL,
  source_url text NOT NULL,
  status_code integer,
  is_ok boolean NOT NULL DEFAULT false,
  error_message text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX idx_source_url_check_batch ON public.source_url_check_logs(batch_id);
CREATE INDEX idx_source_url_check_date ON public.source_url_check_logs(checked_at DESC);
CREATE INDEX idx_source_url_check_failures ON public.source_url_check_logs(is_ok) WHERE is_ok = false;

-- Enable RLS
ALTER TABLE public.source_url_check_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view
CREATE POLICY "Admins can view source url check logs"
  ON public.source_url_check_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Auto-cleanup: keep only last 30 days of logs
SELECT cron.schedule(
  'cleanup-source-url-logs',
  '0 3 * * 0',
  $$DELETE FROM public.source_url_check_logs WHERE checked_at < now() - interval '30 days';$$
);
