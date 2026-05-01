CREATE TABLE golden_configs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id  UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    config     TEXT        NOT NULL,
    version    INTEGER     NOT NULL,
    created_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_golden_configs_device_id ON golden_configs(device_id);
CREATE UNIQUE INDEX idx_golden_configs_device_version ON golden_configs(device_id, version);
