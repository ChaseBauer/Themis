use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct GoldenConfigWithUser {
    pub id: Uuid,
    pub device_id: Uuid,
    pub config: String,
    pub version: i32,
    pub created_by: Option<Uuid>,
    pub created_by_username: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGoldenConfigRequest {
    pub config: String,
}
