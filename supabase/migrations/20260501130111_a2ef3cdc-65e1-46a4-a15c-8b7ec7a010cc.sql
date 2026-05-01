-- Add unique constraint on (name, category) to prevent duplicate personas
ALTER TABLE public.personas
ADD CONSTRAINT personas_name_category_unique UNIQUE (name, category);