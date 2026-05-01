ALTER TABLE change_comments
    ADD COLUMN parent_comment_id UUID REFERENCES change_comments(id) ON DELETE CASCADE,
    ADD COLUMN mentioned_user_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_change_comments_parent_comment_id ON change_comments(parent_comment_id);
