INSERT INTO storage.buckets (id, name, public) VALUES ('personas', 'personas', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Persona images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'personas');