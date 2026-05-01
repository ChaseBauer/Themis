ALTER TABLE config_changes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE config_changes SET updated_at = COALESCE(deployed_at, created_at);

CREATE INDEX idx_config_changes_updated ON config_changes(updated_at DESC);
