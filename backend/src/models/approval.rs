use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct ApprovalWithUser {
    pub id: Uuid,
    pub change_id: Uuid,
    pub user_id: Uuid,
    pub username: String,
    pub status: String,
    pub comment: Option<String>,
    pub created_at: DateTime<Utc>,
}
