ALTER TABLE public.listings
  ADD COLUMN sub_heading       TEXT[]         NOT NULL DEFAULT '{}',
  ADD COLUMN is_guest_favorite BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN is_popular        BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN original_price    NUMERIC(10, 2),
  ADD COLUMN rating            NUMERIC(3, 2)  CHECK (rating >= 0 AND rating <= 5),
  ADD COLUMN review_count      INTEGER        NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  ADD COLUMN host_name         TEXT,
  ADD COLUMN host_type         TEXT;
