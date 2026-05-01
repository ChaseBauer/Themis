ALTER TABLE config_changes
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS scheduled_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS scheduled_save_as_golden BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_config_changes_scheduled
    ON config_changes(scheduled_at)
    WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_config_changes_batch_id
    ON config_changes(batch_id)
    WHERE batch_id IS NOT NULL;
