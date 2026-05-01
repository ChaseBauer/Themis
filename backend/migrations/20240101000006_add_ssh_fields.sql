ALTER TABLE devices
    ADD COLUMN ssh_port     INTEGER NOT NULL DEFAULT 22,
    ADD COLUMN ssh_username TEXT,
    ADD COLUMN ssh_password TEXT;

ALTER TABLE config_changes
    ADD COLUMN deployment_output TEXT;
