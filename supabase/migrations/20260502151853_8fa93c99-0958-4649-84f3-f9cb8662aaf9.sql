
-- Audit log table for persona changes
CREATE TABLE public.persona_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL,
  persona_name text NOT NULL,
  changed_field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.persona_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read audit logs
CREATE POLICY "Admins can view audit logs"
  ON public.persona_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow trigger inserts (security definer function handles this)
-- No public INSERT policy needed since the trigger function uses SECURITY DEFINER

-- Trigger function to log changes
CREATE OR REPLACE FUNCTION public.log_persona_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.image_url IS DISTINCT FROM NEW.image_url THEN
    INSERT INTO public.persona_audit_log (persona_id, persona_name, changed_field, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.name, 'image_url', OLD.image_url, NEW.image_url, auth.uid());
  END IF;

  IF OLD.face_descriptor IS DISTINCT FROM NEW.face_descriptor THEN
    INSERT INTO public.persona_audit_log (persona_id, persona_name, changed_field, old_value, new_value, changed_by)
    VALUES (NEW.id, NEW.name, 'face_descriptor',
      LEFT(OLD.face_descriptor::text, 200),
      LEFT(NEW.face_descriptor::text, 200),
      auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to personas table
CREATE TRIGGER trg_persona_audit
  AFTER UPDATE ON public.personas
  FOR EACH ROW
  EXECUTE FUNCTION public.log_persona_changes();

-- Index for quick lookups
CREATE INDEX idx_persona_audit_persona_id ON public.persona_audit_log (persona_id);
CREATE INDEX idx_persona_audit_created_at ON public.persona_audit_log (created_at DESC);
