CREATE EXTENSION IF NOT EXISTS pg_trgm;

INSERT INTO app_settings (key, value)
VALUES ('drift_check_concurrency', '10')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value)
VALUES ('health_check_concurrency', '25')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_devices_created_desc
    ON devices(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_devices_name_trgm
    ON devices USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_devices_hostname_trgm
    ON devices USING GIN (hostname gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_username_trgm
    ON users USING GIN (username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_config_changes_title_trgm
    ON config_changes USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_config_changes_status_updated
    ON config_changes(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_changes_device_updated
    ON config_changes(device_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_changes_batch_status_created
    ON config_changes(batch_id, status, created_at ASC)
    WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_config_changes_group_updated
    ON config_changes((COALESCE(batch_id, id)), updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_config_changes_due_scheduled
    ON config_changes(scheduled_at ASC)
    WHERE status = 'approved' AND scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_golden_configs_device_version_desc
    ON golden_configs(device_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_change_comments_unresolved_roots
    ON change_comments(change_id)
    WHERE resolved = false AND parent_comment_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_approvals_change_status
    ON approvals(change_id, status);

CREATE INDEX IF NOT EXISTS idx_deployment_attempts_change_created
    ON deployment_attempts(change_id, created_at DESC);
