CREATE TABLE IF NOT EXISTS device_sites (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    name_key   TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_sites_name_key
    ON device_sites (name_key);

INSERT INTO device_sites (name, name_key)
SELECT DISTINCT btrim(site), LOWER(btrim(site))
FROM devices
WHERE site IS NOT NULL AND btrim(site) <> ''
ON CONFLICT (name_key) DO NOTHING;
