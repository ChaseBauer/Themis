CREATE TABLE change_comments (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    change_id            UUID        NOT NULL REFERENCES config_changes(id) ON DELETE CASCADE,
    user_id              UUID        NOT NULL REFERENCES users(id),
    username             TEXT        NOT NULL,
    content              TEXT        NOT NULL,
    line_start           INTEGER,
    line_end             INTEGER,
    /* Snapshot of the selected diff lines at comment time, used to detect
       whether the code changed after the comment was left. */
    line_snapshot        TEXT,
    resolved             BOOLEAN     NOT NULL DEFAULT false,
    resolved_by          UUID        REFERENCES users(id),
    resolved_by_username TEXT,
    resolved_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_change_comments_change_id ON change_comments(change_id);
