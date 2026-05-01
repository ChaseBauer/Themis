CREATE TABLE devices (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    hostname    TEXT        NOT NULL,
    ip_address  TEXT        NOT NULL,
    device_type TEXT        NOT NULL,
    vendor      TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID        REFERENCES users(id) ON DELETE SET NULL
);
