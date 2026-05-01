CREATE TABLE approvals (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    change_id  UUID        NOT NULL REFERENCES config_changes(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id),
    status     TEXT        NOT NULL,
    comment    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(change_id, user_id)
);

CREATE INDEX idx_approvals_change_id ON approvals(change_id);
