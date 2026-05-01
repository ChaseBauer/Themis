use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct ChangeComment {
    pub id: Uuid,
    pub change_id: Uuid,
    pub user_id: Uuid,
    pub username: String,
    pub content: String,
    pub parent_comment_id: Option<Uuid>,
    pub line_start: Option<i32>,
    pub line_end: Option<i32>,
    pub line_snapshot: Option<String>,
    pub mentioned_user_ids: Vec<Uuid>,
    pub resolved: bool,
    pub resolved_by: Option<Uuid>,
    pub resolved_by_username: Option<String>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub content: String,
    pub parent_comment_id: Option<Uuid>,
    pub line_start: Option<i32>,
    pub line_end: Option<i32>,
    pub line_snapshot: Option<String>,
}
