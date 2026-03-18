CREATE TABLE public.listing_reports (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    listing_id  UUID        NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    reason      TEXT        NOT NULL CHECK (reason IN ('incorrect_information', 'scam', 'inappropriate_content', 'unavailable', 'other')),
    description TEXT,
    status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
