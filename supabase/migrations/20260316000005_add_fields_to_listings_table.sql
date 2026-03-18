ALTER TABLE public.listings
  ADD COLUMN title       TEXT   NOT NULL DEFAULT '',
  ADD COLUMN description TEXT   NOT NULL DEFAULT '',
  ADD COLUMN perks       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN incentives  TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.listings
  ALTER COLUMN title       DROP DEFAULT,
  ALTER COLUMN description DROP DEFAULT;
