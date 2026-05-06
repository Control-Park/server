ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile_image TEXT;
