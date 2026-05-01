INSERT INTO app_settings (key, value)
VALUES ('ad_role_mappings_toml', '')
ON CONFLICT (key) DO NOTHING;
