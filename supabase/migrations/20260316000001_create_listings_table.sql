CREATE TABLE public.listings (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    structure_name TEXT,
    address        TEXT        NOT NULL,
    parking_type   TEXT        NOT NULL CHECK (parking_type IN ('Structure', 'Driveway', 'Lot', 'ETC')),
    price_per_hour NUMERIC(10, 2) NOT NULL CHECK (price_per_hour >= 0),
    amenities      TEXT[]      NOT NULL DEFAULT '{}',
    images         TEXT[]      NOT NULL DEFAULT '{}',
    available_from TIMESTAMPTZ,
    available_until TIMESTAMPTZ,
    is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
