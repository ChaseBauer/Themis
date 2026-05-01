use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct ConfigChangeWithUser {
    pub id: Uuid,
    pub device_id: Uuid,
    pub device_name: String,
    pub title: String,
    pub description: Option<String>,
    pub config_diff: String,
    pub full_config: Option<String>,
    pub status: String,
    pub submitted_by: Uuid,
    pub submitted_by_username: String,
    pub required_approvals: i32,
    pub approval_count: i32,
    pub scheduled_at: Option<DateTime<Utc>>,
    pub scheduled_by: Option<Uuid>,
    pub scheduled_save_as_golden: bool,
    pub batch_id: Option<Uuid>,
    pub deployed_at: Option<DateTime<Utc>>,
    pub deployment_output: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateChangeRequest {
    pub title: String,
    pub description: Option<String>,
    pub config_diff: String,
    pub full_config: Option<String>,
    pub required_approvals: Option<i32>,
    pub scheduled_at: Option<DateTime<Utc>>,
    pub scheduled_save_as_golden: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChangeRequest {
    pub title: String,
    pub description: Option<String>,
    pub config_diff: String,
    pub scheduled_at: Option<DateTime<Utc>>,
    pub scheduled_save_as_golden: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct BatchCreateChangeRequest {
    pub device_ids: Vec<Uuid>,
    pub title: String,
    pub description: Option<String>,
    pub config_diff: String,
    pub full_config: Option<String>,
    pub required_approvals: Option<i32>,
    pub scheduled_at: Option<DateTime<Utc>>,
    pub scheduled_save_as_golden: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ApproveChangeRequest {
    pub comment: Option<String>,
}
