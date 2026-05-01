INSERT INTO app_settings (key, value) VALUES
    ('oauth_enabled', 'false'),
    ('oauth_provider_name', 'OAuth'),
    ('oauth_authorize_url', ''),
    ('oauth_token_url', ''),
    ('oauth_userinfo_url', ''),
    ('oauth_client_id', ''),
    ('oauth_client_secret', ''),
    ('oauth_redirect_url', 'http://localhost/api/auth/oauth/callback'),
    ('oauth_scopes', 'openid profile email'),
    ('oauth_username_claim', 'preferred_username'),
    ('oauth_email_claim', 'email'),
    ('oauth_role_claim', 'groups'),
    ('oauth_default_role', 'viewer'),
    ('oauth_role_mappings_toml', '')
ON CONFLICT DO NOTHING;
