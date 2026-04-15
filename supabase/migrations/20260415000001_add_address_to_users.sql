ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS address_line1    TEXT,
  ADD COLUMN IF NOT EXISTS address_line2    TEXT,
  ADD COLUMN IF NOT EXISTS address_city     TEXT,
  ADD COLUMN IF NOT EXISTS address_state    TEXT,
  ADD COLUMN IF NOT EXISTS address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS address_country  TEXT;
