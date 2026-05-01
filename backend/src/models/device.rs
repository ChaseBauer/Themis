use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Device {
    pub id: Uuid,
    pub name: String,
    pub ip_address: String,
    pub vendor: String,
    pub os: String,
    pub ssh_port: i32,
    pub ssh_username: Option<String>,
    #[serde(skip_serializing)]
    pub ssh_password: Option<String>,
    pub config_pull_command: Option<String>,
    pub ssh_options: Option<String>,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub created_by: Option<Uuid>,
    pub deploying_since: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDeviceRequest {
    pub name: String,
    pub ip_address: String,
    pub vendor: String,
    pub os: String,
    pub ssh_port: Option<i32>,
    pub ssh_username: Option<String>,
    pub ssh_password: Option<String>,
    pub config_pull_command: Option<String>,
    pub ssh_options: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDeviceRequest {
    pub name: Option<String>,
    pub ip_address: Option<String>,
    pub vendor: Option<String>,
    pub os: Option<String>,
    pub ssh_port: Option<i32>,
    pub ssh_username: Option<String>,
    pub ssh_password: Option<String>,
    pub config_pull_command: Option<String>,
    pub ssh_options: Option<String>,
    pub tags: Option<Vec<String>>,
}
