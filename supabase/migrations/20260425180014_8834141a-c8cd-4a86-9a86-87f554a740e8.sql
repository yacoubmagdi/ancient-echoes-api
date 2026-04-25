-- 1) Roles enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2) user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- 4) Policies on user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Personas write policies for admins
DROP POLICY IF EXISTS "Admins can insert personas" ON public.personas;
CREATE POLICY "Admins can insert personas"
  ON public.personas FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update personas" ON public.personas;
CREATE POLICY "Admins can update personas"
  ON public.personas FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete personas" ON public.personas;
CREATE POLICY "Admins can delete personas"
  ON public.personas FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 6) Storage policies for personas bucket (admins only for writes)
DROP POLICY IF EXISTS "Admins can upload persona images" ON storage.objects;
CREATE POLICY "Admins can upload persona images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'personas' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update persona images" ON storage.objects;
CREATE POLICY "Admins can update persona images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'personas' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete persona images" ON storage.objects;
CREATE POLICY "Admins can delete persona images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'personas' AND public.has_role(auth.uid(), 'admin'));
