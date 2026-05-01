ALTER TABLE config_changes
    ALTER COLUMN scheduled_save_as_golden SET DEFAULT TRUE;

UPDATE config_changes
SET scheduled_save_as_golden = TRUE
WHERE status <> 'deployed';
