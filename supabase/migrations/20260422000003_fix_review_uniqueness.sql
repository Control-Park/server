ALTER TABLE reviews
DROP CONSTRAINT IF EXISTS reviews_reservation_id_reviewer_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_guest_target_idx
ON reviews (reservation_id, reviewer_id, target_user_id)
WHERE target_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_unique_listing_target_idx
ON reviews (reservation_id, reviewer_id, target_listing_id)
WHERE target_listing_id IS NOT NULL;
