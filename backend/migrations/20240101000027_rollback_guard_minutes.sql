INSERT INTO app_settings (key, value)
VALUES ('rollback_guard_minutes', '2')
ON CONFLICT (key) DO NOTHING;
