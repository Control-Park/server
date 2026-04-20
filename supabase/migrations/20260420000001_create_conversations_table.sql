CREATE TABLE IF NOT EXISTS conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  host_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guest_id, host_id, listing_id)
);
