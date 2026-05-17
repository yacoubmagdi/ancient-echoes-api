
CREATE TABLE public.user_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit messages"
  ON public.user_messages FOR INSERT TO public
  WITH CHECK (char_length(message) BETWEEN 1 AND 5000);

CREATE POLICY "Admins can view messages"
  ON public.user_messages FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update messages"
  ON public.user_messages FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete messages"
  ON public.user_messages FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE INDEX idx_user_messages_created_at ON public.user_messages (created_at DESC);
