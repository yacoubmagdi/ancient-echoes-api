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