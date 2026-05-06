ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS site TEXT;

CREATE TABLE IF NOT EXISTS device_tags (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    name_key   TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tags_name_key
    ON device_tags (name_key);

CREATE TABLE IF NOT EXISTS device_tag_assignments (
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    tag_id    UUID NOT NULL REFERENCES device_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (device_id, tag_id)
);

INSERT INTO device_tags (name, name_key)
SELECT DISTINCT btrim(tag), LOWER(btrim(tag))
FROM devices d
CROSS JOIN LATERAL unnest(d.tags) AS tag
WHERE btrim(tag) <> ''
ON CONFLICT (name_key) DO NOTHING;

INSERT INTO device_tag_assignments (device_id, tag_id)
SELECT d.id, dt.id
FROM devices d
CROSS JOIN LATERAL unnest(d.tags) AS tag
JOIN device_tags dt ON dt.name_key = LOWER(btrim(tag))
ON CONFLICT DO NOTHING;
