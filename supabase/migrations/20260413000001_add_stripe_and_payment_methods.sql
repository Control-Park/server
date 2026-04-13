ALTER TABLE public.users ADD COLUMN stripe_customer_id TEXT;

CREATE TABLE public.payment_methods (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    stripe_payment_method_id TEXT        NOT NULL,
    brand                    TEXT        NOT NULL,
    last4                    TEXT        NOT NULL,
    exp_month                INTEGER     NOT NULL,
    exp_year                 INTEGER     NOT NULL,
    holder_name              TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, stripe_payment_method_id)
);
