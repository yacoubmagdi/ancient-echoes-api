-- Add skin_tone column to personas table
-- Stores HSL color values extracted from the face region of persona images
-- Format: {"h": 25, "s": 45, "l": 55, "category": "medium"}
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS skin_tone jsonb DEFAULT NULL;