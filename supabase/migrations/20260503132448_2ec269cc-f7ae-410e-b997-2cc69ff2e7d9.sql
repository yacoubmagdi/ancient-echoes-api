-- Function to prevent duplicate personas by name similarity and art references
CREATE OR REPLACE FUNCTION public.prevent_duplicate_persona()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id uuid;
  existing_name text;
  ref_code text;
  ref_codes text[];
BEGIN
  -- 1. Exact name+category duplicate check
  SELECT id, name INTO existing_id, existing_name
  FROM public.personas
  WHERE category = NEW.category
    AND name = NEW.name
    AND (TG_OP = 'INSERT' OR id != NEW.id)
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'شخصية مكررة: "%" موجودة بالفعل (id=%)', existing_name, existing_id;
  END IF;

  -- 2. Fuzzy name check: strip common prefixes (الفرعون، الملكة، الملك، القائد، الكاتب، الكاهن، الكاهنة، العالم، الفنان، المهندس، الطبيب، الوزير، النحات، المحاربة، المغنية، العالمة، الفنانة، الكاتبة)
  DECLARE
    clean_new text;
    clean_existing text;
  BEGIN
    clean_new := regexp_replace(NEW.name, '^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة)\s+', '', 'i');
    
    SELECT id, name INTO existing_id, existing_name
    FROM public.personas
    WHERE category = NEW.category
      AND (TG_OP = 'INSERT' OR id != NEW.id)
      AND regexp_replace(name, '^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة)\s+', '', 'i') = clean_new
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'شخصية مشابهة: "%" تطابق "%" بعد إزالة البادئة (id=%)', NEW.name, existing_name, existing_id;
    END IF;
  END;

  -- 3. Art reference code duplicate check (museum catalog numbers like CG 1426, KV 42, TT 87, BH 17, EA 10)
  IF NEW.description IS NOT NULL THEN
    SELECT array_agg(m[1]) INTO ref_codes
    FROM regexp_matches(NEW.description, '([A-Z]{1,4}\s?\d{2,6})', 'g') AS m;

    IF ref_codes IS NOT NULL THEN
      FOREACH ref_code IN ARRAY ref_codes LOOP
        SELECT id, name INTO existing_id, existing_name
        FROM public.personas
        WHERE category = NEW.category
          AND (TG_OP = 'INSERT' OR id != NEW.id)
          AND description ~ ref_code
        LIMIT 1;

        IF existing_id IS NOT NULL THEN
          RAISE EXCEPTION 'مرجع فني مكرر: الكود "%" موجود بالفعل في شخصية "%" (id=%)', ref_code, existing_name, existing_id;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS check_duplicate_persona ON public.personas;
CREATE TRIGGER check_duplicate_persona
  BEFORE INSERT OR UPDATE ON public.personas
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_persona();