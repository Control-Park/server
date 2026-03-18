CREATE TABLE public.reservations (
    id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID           NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    listing_id  UUID           NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    vehicle_id  UUID,
    start_time  TIMESTAMPTZ    NOT NULL,
    end_time    TIMESTAMPTZ    NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);
