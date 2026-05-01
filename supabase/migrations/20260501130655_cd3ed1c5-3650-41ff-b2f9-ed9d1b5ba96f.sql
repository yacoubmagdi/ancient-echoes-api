-- Add duplicate_flag column to store scan results
ALTER TABLE public.personas
ADD COLUMN IF NOT EXISTS duplicate_flag jsonb DEFAULT NULL;

-- Add index for quick filtering of flagged records
CREATE INDEX IF NOT EXISTS idx_personas_duplicate_flag
ON public.personas ((duplicate_flag IS NOT NULL));