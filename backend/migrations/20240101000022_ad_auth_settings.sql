INSERT INTO app_settings (key, value) VALUES
    ('ad_enabled', 'false'),
    ('ad_url', ''),
    ('ad_bind_dn', ''),
    ('ad_bind_password', ''),
    ('ad_base_dn', ''),
    ('ad_user_filter', '(&(objectClass=user)(sAMAccountName={username}))'),
    ('ad_group_attribute', 'memberOf'),
    ('ad_default_role', 'viewer')
ON CONFLICT DO NOTHING;
