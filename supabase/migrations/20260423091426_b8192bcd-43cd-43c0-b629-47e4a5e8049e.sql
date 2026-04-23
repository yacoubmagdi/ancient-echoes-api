-- Personas table
CREATE TABLE public.personas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  luxand_uuid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_personas_category ON public.personas(category);
CREATE INDEX idx_personas_luxand_uuid ON public.personas(luxand_uuid);

ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personas are viewable by everyone"
  ON public.personas FOR SELECT
  USING (true);

-- Query logs (analytics + free-tier tracking)
CREATE TABLE public.query_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash TEXT,
  matched_persona_id UUID REFERENCES public.personas(id) ON DELETE SET NULL,
  similarity NUMERIC,
  success BOOLEAN NOT NULL DEFAULT true,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_query_logs_ip_hash ON public.query_logs(ip_hash);
CREATE INDEX idx_query_logs_created_at ON public.query_logs(created_at DESC);

ALTER TABLE public.query_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a log entry (the edge function uses service role anyway)
CREATE POLICY "Anyone can insert query logs"
  ON public.query_logs FOR INSERT
  WITH CHECK (true);

-- Logs are not publicly readable (only service role / admins via direct DB)
-- No SELECT policy = no one can read via the API.