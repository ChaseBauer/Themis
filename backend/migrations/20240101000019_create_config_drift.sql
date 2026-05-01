CREATE TABLE IF NOT EXISTS config_drift (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id           UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    golden_config_id    UUID        NOT NULL REFERENCES golden_configs(id),
    current_config      TEXT        NOT NULL,
    detected_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status              TEXT        NOT NULL DEFAULT 'open',
    resolved_by         UUID        REFERENCES users(id),
    resolved_at         TIMESTAMPTZ,
    accepted_change_id  UUID        REFERENCES config_changes(id)
);

/* Only one open drift per device at a time */
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_drift_device_open
    ON config_drift(device_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_config_drift_device_id ON config_drift(device_id);
CREATE INDEX IF NOT EXISTS idx_config_drift_status    ON config_drift(status);

/* Add drift check interval in seconds to settings. Default 30. */
INSERT INTO app_settings (key, value) VALUES ('drift_check_interval_secs', '30')
    ON CONFLICT (key) DO NOTHING;

DELETE FROM app_settings WHERE key = 'drift_check_interval_mins';
