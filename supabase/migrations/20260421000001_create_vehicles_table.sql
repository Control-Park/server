CREATE TABLE IF NOT EXISTS vehicles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  make       text NOT NULL,
  model      text NOT NULL,
  year       text NOT NULL,
  color      text NOT NULL,
  plate      text NOT NULL,
  nickname   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
