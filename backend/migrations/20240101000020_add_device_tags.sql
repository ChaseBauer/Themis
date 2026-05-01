ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_devices_tags
    ON devices USING GIN (tags);
