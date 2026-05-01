INSERT INTO app_settings (key, value)
VALUES ('batch_deploy_concurrency', '5')
ON CONFLICT (key) DO NOTHING;
