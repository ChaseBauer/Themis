use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize, Clone, sqlx::FromRow)]
pub struct ConfigDrift {
    pub id: Uuid,
    pub device_id: Uuid,
    pub device_name: String,
    pub golden_config_id: Uuid,
    pub current_config: String,
    pub detected_at: DateTime<Utc>,
    pub last_checked_at: DateTime<Utc>,
    pub status: String,
    pub resolved_by: Option<Uuid>,
    pub resolved_by_username: Option<String>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub accepted_change_id: Option<Uuid>,
}
