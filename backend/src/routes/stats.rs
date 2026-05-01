use axum::{extract::State, Json};
use serde::Serialize;

use crate::{auth::Claims, error::Result, models::change::ConfigChangeWithUser, AppState};

#[derive(Debug, Serialize)]
pub struct Stats {
    pub device_count: i64,
    pub pending_changes: i64,
    pub approved_changes: i64,
    pub deployed_changes: i64,
    pub user_count: i64,
    pub recent_changes: Vec<ConfigChangeWithUser>,
}

pub async fn get_stats(State(state): State<AppState>, _claims: Claims) -> Result<Json<Stats>> {
    let device_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM devices")
        .fetch_one(&state.db)
        .await?;

    let pending_changes: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT COALESCE(batch_id, id)) FROM config_changes WHERE status = 'pending'",
    )
    .fetch_one(&state.db)
    .await?;

    let approved_changes: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT COALESCE(batch_id, id)) FROM config_changes WHERE status = 'approved'",
    )
    .fetch_one(&state.db)
    .await?;

    let deployed_changes: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT COALESCE(batch_id, id)) FROM config_changes WHERE status = 'deployed'",
    )
    .fetch_one(&state.db)
    .await?;

    let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await?;

    let recent_changes = sqlx::query_as::<_, ConfigChangeWithUser>(
        "WITH visible AS (
            SELECT DISTINCT ON (COALESCE(cc.batch_id, cc.id))
                cc.id,
                cc.device_id,
                CASE
                    WHEN cc.batch_id IS NULL THEN d.name
                    ELSE COUNT(*) OVER (PARTITION BY cc.batch_id)::text || ' devices'
                END AS device_name,
                cc.title, cc.description, cc.config_diff, NULL::text AS full_config,
                cc.status, cc.submitted_by, cc.required_approvals, cc.approval_count,
                cc.scheduled_at, cc.scheduled_by, cc.scheduled_save_as_golden, cc.batch_id,
                cc.deployed_at, NULL::text AS deployment_output, cc.created_at, cc.updated_at,
                u.username AS submitted_by_username
             FROM config_changes cc
             JOIN devices d ON d.id = cc.device_id
             JOIN users u ON u.id = cc.submitted_by
             ORDER BY COALESCE(cc.batch_id, cc.id), cc.created_at ASC
         )
         SELECT * FROM visible
         ORDER BY updated_at DESC
         LIMIT 10",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(Stats {
        device_count,
        pending_changes,
        approved_changes,
        deployed_changes,
        user_count,
        recent_changes,
    }))
}
