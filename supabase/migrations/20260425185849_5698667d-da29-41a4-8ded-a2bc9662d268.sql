ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS face_descriptor jsonb;

CREATE INDEX IF NOT EXISTS idx_personas_has_descriptor
  ON public.personas ((face_descriptor IS NOT NULL));