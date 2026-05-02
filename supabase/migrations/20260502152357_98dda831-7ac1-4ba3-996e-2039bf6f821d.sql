
-- Unify category: pharaonic → Pharaoh
UPDATE public.personas SET category = 'Pharaoh' WHERE category = 'pharaonic';

-- Also update nationality_categories if it references pharaonic
UPDATE public.nationality_categories
SET categories = array_replace(categories, 'pharaonic', 'Pharaoh')
WHERE 'pharaonic' = ANY(categories);
