CREATE TABLE public.users (
    id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name        TEXT NOT NULL,
    last_name         TEXT NOT NULL,
    preferred_name    TEXT,
    phone             TEXT,
    birth_date        DATE,
    role              TEXT NOT NULL DEFAULT 'anon',
    host              BOOLEAN NOT NULL DEFAULT FALSE,
    host_display_name TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);