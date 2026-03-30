CREATE TABLE public.notification_settings (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    all_notifications     BOOLEAN     NOT NULL DEFAULT TRUE,
    new_listing           BOOLEAN     NOT NULL DEFAULT TRUE,
    new_message           BOOLEAN     NOT NULL DEFAULT TRUE,
    parking_alerts        BOOLEAN     NOT NULL DEFAULT TRUE,
    reservation_reminders BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id)
);
