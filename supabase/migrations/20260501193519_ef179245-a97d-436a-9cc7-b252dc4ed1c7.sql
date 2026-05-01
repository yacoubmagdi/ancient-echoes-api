CREATE TABLE public.shared_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_name text NOT NULL,
  category text NOT NULL,
  similarity numeric NOT NULL,
  description text NOT NULL,
  match_image_url text NOT NULL,
  user_image_data text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shared results"
  ON public.shared_results FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert shared results"
  ON public.shared_results FOR INSERT
  WITH CHECK (true);