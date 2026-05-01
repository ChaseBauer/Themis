CREATE TABLE app_settings (
    key        TEXT        PRIMARY KEY,
    value      TEXT        NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES
    ('max_golden_configs',         '10'),
    ('default_required_approvals', '1'),
    ('vendor_profiles_toml',       '')
ON CONFLICT DO NOTHING;
