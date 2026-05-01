CREATE TABLE config_changes (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id          UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    title              TEXT        NOT NULL,
    description        TEXT,
    config_diff        TEXT        NOT NULL,
    full_config        TEXT,
    status             TEXT        NOT NULL DEFAULT 'pending',
    submitted_by       UUID        NOT NULL REFERENCES users(id),
    required_approvals INTEGER     NOT NULL DEFAULT 1,
    approval_count     INTEGER     NOT NULL DEFAULT 0,
    deployed_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_config_changes_device_id ON config_changes(device_id);
CREATE INDEX idx_config_changes_status    ON config_changes(status);
CREATE INDEX idx_config_changes_created   ON config_changes(created_at DESC);
