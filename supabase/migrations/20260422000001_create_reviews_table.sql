CREATE TABLE IF NOT EXISTS reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id     uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  reviewer_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  target_listing_id  uuid REFERENCES listings(id) ON DELETE CASCADE,
  rating             integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment            text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_target CHECK (
    (target_user_id IS NOT NULL)::int + (target_listing_id IS NOT NULL)::int = 1
  ),
  UNIQUE (reservation_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_target_user ON reviews(target_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_target_listing ON reviews(target_listing_id);
