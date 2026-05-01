ALTER TABLE devices
    ADD COLUMN os TEXT NOT NULL DEFAULT '';

ALTER TABLE devices
    DROP COLUMN device_type;
