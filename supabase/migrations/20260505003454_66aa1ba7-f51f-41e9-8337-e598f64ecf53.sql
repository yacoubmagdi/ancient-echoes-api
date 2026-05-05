
-- 1. Unique constraint: name + category
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_personas_name_category'
  ) THEN
    ALTER TABLE public.personas
      ADD CONSTRAINT uq_personas_name_category UNIQUE (name, category);
  END IF;
END$$;

-- 2. Enhanced duplicate prevention trigger with embedding similarity check
CREATE OR REPLACE FUNCTION public.prevent_duplicate_persona()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_id uuid;
  existing_name text;
  ref_code text;
  ref_codes text[];
  sim_distance double precision;
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

  -- 2. Fuzzy name check: strip common prefixes
  DECLARE
    clean_new text;
  BEGIN
    clean_new := regexp_replace(NEW.name,
      '^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة)\s+',
      '', 'i');

    SELECT id, name INTO existing_id, existing_name
    FROM public.personas
    WHERE category = NEW.category
      AND (TG_OP = 'INSERT' OR id != NEW.id)
      AND regexp_replace(name,
        '^(الفرعون|الملكة|الملك|القائد|الكاتب|الكاهن|الكاهنة|العالم|الفنان|المهندس|الطبيب|الوزير|النحات|المحاربة|المغنية|العالمة|الفنانة|الكاتبة)\s+',
        '', 'i') = clean_new
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'شخصية مشابهة: "%" تطابق "%" بعد إزالة البادئة (id=%)', NEW.name, existing_name, existing_id;
    END IF;
  END;

  -- 3. Embedding similarity check (Euclidean distance < 0.3 = likely duplicate face)
  IF NEW.face_descriptor IS NOT NULL AND jsonb_array_length(NEW.face_descriptor) = 128 THEN
    SELECT p.id, p.name,
      sqrt(
        (SELECT sum(power(
          (NEW.face_descriptor->>idx)::double precision -
          (p.face_descriptor->>idx)::double precision, 2))
        FROM generate_series(0, 127) AS idx)
      ) AS dist
    INTO existing_id, existing_name, sim_distance
    FROM public.personas p
    WHERE p.face_descriptor IS NOT NULL
      AND jsonb_array_length(p.face_descriptor) = 128
      AND (TG_OP = 'INSERT' OR p.id != NEW.id)
    ORDER BY dist ASC
    LIMIT 1;

    IF existing_id IS NOT NULL AND sim_distance < 0.3 THEN
      RAISE EXCEPTION 'وجه مكرر: تشابه عالي (مسافة=%) مع شخصية "%" (id=%)', round(sim_distance::numeric, 4), existing_name, existing_id;
    END IF;
  END IF;

  -- 4. Art reference code duplicate check
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
$function$;

-- Reattach trigger
DROP TRIGGER IF EXISTS check_duplicate_persona ON public.personas;
CREATE TRIGGER check_duplicate_persona
  BEFORE INSERT OR UPDATE ON public.personas
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_persona();

REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_persona() FROM anon, authenticated, public;

-- 3. Deletion audit log table
CREATE TABLE IF NOT EXISTS public.persona_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL,
  persona_name text NOT NULL,
  category text NOT NULL,
  role text,
  gender text,
  description text,
  image_url text,
  source_image_url text,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.persona_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view deletion logs"
  ON public.persona_deletion_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Pre-deletion trigger
CREATE OR REPLACE FUNCTION public.log_persona_deletion()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.persona_deletion_log
    (persona_id, persona_name, category, role, gender, description, image_url, source_image_url, deleted_by)
  VALUES
    (OLD.id, OLD.name, OLD.category, OLD.role, OLD.gender, OLD.description, OLD.image_url, OLD.source_image_url, auth.uid());
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_persona_deletion ON public.personas;
CREATE TRIGGER trg_log_persona_deletion
  BEFORE DELETE ON public.personas
  FOR EACH ROW
  EXECUTE FUNCTION public.log_persona_deletion();

REVOKE EXECUTE ON FUNCTION public.log_persona_deletion() FROM anon, authenticated, public;
