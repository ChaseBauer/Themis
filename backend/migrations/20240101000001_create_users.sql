CREATE TABLE users (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username     TEXT        UNIQUE NOT NULL,
    email        TEXT        UNIQUE NOT NULL,
    password_hash TEXT       NOT NULL,
    role         TEXT        NOT NULL DEFAULT 'engineer',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
