CREATE TABLE deployment_attempts (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    change_id            UUID        NOT NULL REFERENCES config_changes(id) ON DELETE CASCADE,
    device_id            UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    status               TEXT        NOT NULL,
    output               TEXT        NOT NULL,
    config_diff_snapshot TEXT        NOT NULL,
    full_config_snapshot TEXT,
    attempted_by         UUID        REFERENCES users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deployment_attempts_change_id ON deployment_attempts(change_id);
CREATE INDEX idx_deployment_attempts_created ON deployment_attempts(created_at DESC);
