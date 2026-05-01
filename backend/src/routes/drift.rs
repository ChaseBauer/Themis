use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    auth::{self, Claims},
    drift_checker::unified_diff_with_ignores,
    error::{AppError, Result},
    models::{ConfigDrift, Device},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_open))
        .route("/:id/accept", post(accept))
        .route("/:id/dismiss", post(dismiss))
}

/// List all open drift records across all devices.
async fn list_open(
    State(state): State<AppState>,
    _claims: Claims,
) -> Result<Json<Vec<ConfigDrift>>> {
    let drifts = sqlx::query_as::<_, ConfigDrift>(
        "SELECT
            cd.id, cd.device_id, d.name AS device_name,
            cd.golden_config_id, cd.current_config,
            cd.detected_at, cd.last_checked_at, cd.status,
            cd.resolved_by, u.username AS resolved_by_username,
            cd.resolved_at, cd.accepted_change_id
         FROM config_drift cd
         JOIN devices d ON d.id = cd.device_id
         LEFT JOIN users u ON u.id = cd.resolved_by
         WHERE cd.status = 'open'
         ORDER BY cd.last_checked_at DESC",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(drifts))
}

#[derive(Deserialize)]
struct AcceptBody {
    title: Option<String>,
}

/// Accept the drifted config as the new golden:
/// 1. Create a config_change record (status=deployed) in the ledger.
/// 2. Save the current config as a new golden config version.
/// 3. Mark the drift as 'accepted'.
async fn accept(
    State(state): State<AppState>,
    claims: Claims,
    Path(drift_id): Path<Uuid>,
    Json(body): Json<AcceptBody>,
) -> Result<Json<ConfigDrift>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let drift = fetch_drift(&state, drift_id)
        .await?
        .ok_or(AppError::NotFound)?;

    if drift.status != "open" {
        return Err(AppError::BadRequest(
            "Drift is already resolved".to_string(),
        ));
    }

    // Fetch the golden config that the drift was compared against
    let golden_config: String =
        sqlx::query_scalar("SELECT config FROM golden_configs WHERE id = $1")
            .bind(drift.golden_config_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or(AppError::NotFound)?;

    let title = body
        .title
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "Accepted config drift as new golden".to_string());

    let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = $1")
        .bind(drift.device_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let profiles = state.settings.read().await.vendor_profiles.clone();
    let profile = profiles.resolve(&device.vendor, &device.os);
    let diff = unified_diff_with_ignores(&golden_config, &drift.current_config, Some(profile));

    let username: String = sqlx::query_scalar("SELECT username FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&state.db)
        .await?;

    // 1. Create change-ledger entry (already deployed , config is on the device)
    let change_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO config_changes
            (id, device_id, title, description, config_diff, full_config,
             status, submitted_by, required_approvals, approval_count,
             deployed_at, deployment_output)
         VALUES ($1,$2,$3,$4,$5,$6,'deployed',$7,1,1,NOW(),$8)",
    )
    .bind(change_id)
    .bind(drift.device_id)
    .bind(&title)
    .bind(format!(
        "Config drift detected on {} and accepted as new golden by {}.",
        device.name, username
    ))
    .bind(&diff)
    .bind(&drift.current_config)
    .bind(user_id)
    .bind(format!(
        "Drift accepted by {} at {}",
        username,
        Utc::now().format("%Y-%m-%d %H:%M UTC")
    ))
    .execute(&state.db)
    .await?;

    // 2. Save as next golden config version
    let next_version: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM golden_configs WHERE device_id = $1",
    )
    .bind(drift.device_id)
    .fetch_one(&state.db)
    .await?;

    sqlx::query(
        "INSERT INTO golden_configs (id, device_id, config, version, created_by)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(drift.device_id)
    .bind(&drift.current_config)
    .bind(next_version)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    let max_golden = state.settings.read().await.max_golden_configs;
    sqlx::query(
        "DELETE FROM golden_configs
         WHERE device_id = $1
           AND id NOT IN (
               SELECT id FROM golden_configs WHERE device_id = $1
               ORDER BY version DESC LIMIT $2
           )",
    )
    .bind(drift.device_id)
    .bind(max_golden)
    .execute(&state.db)
    .await?;

    // 3. Mark drift as accepted
    let updated = sqlx::query_as::<_, ConfigDrift>(
        "UPDATE config_drift
         SET status = 'accepted',
             resolved_by = $2,
             resolved_at = NOW(),
             accepted_change_id = $3
         WHERE id = $1
         RETURNING
            id, device_id,
            (SELECT name FROM devices WHERE id = device_id) AS device_name,
            golden_config_id, current_config,
            detected_at, last_checked_at, status,
            resolved_by,
            (SELECT username FROM users WHERE id = resolved_by) AS resolved_by_username,
            resolved_at, accepted_change_id",
    )
    .bind(drift_id)
    .bind(user_id)
    .bind(change_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(updated))
}

/// Dismiss drift without creating a change-ledger entry.
async fn dismiss(
    State(state): State<AppState>,
    claims: Claims,
    Path(drift_id): Path<Uuid>,
) -> Result<Json<ConfigDrift>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let drift = fetch_drift(&state, drift_id)
        .await?
        .ok_or(AppError::NotFound)?;

    if drift.status != "open" {
        return Err(AppError::BadRequest(
            "Drift is already resolved".to_string(),
        ));
    }

    let updated = sqlx::query_as::<_, ConfigDrift>(
        "UPDATE config_drift
         SET status = 'dismissed', resolved_by = $2, resolved_at = NOW()
         WHERE id = $1
         RETURNING
            id, device_id,
            (SELECT name FROM devices WHERE id = device_id) AS device_name,
            golden_config_id, current_config,
            detected_at, last_checked_at, status,
            resolved_by,
            (SELECT username FROM users WHERE id = resolved_by) AS resolved_by_username,
            resolved_at, accepted_change_id",
    )
    .bind(drift_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(updated))
}

async fn fetch_drift(state: &AppState, id: Uuid) -> Result<Option<ConfigDrift>> {
    let drift = sqlx::query_as::<_, ConfigDrift>(
        "SELECT
            cd.id, cd.device_id, d.name AS device_name,
            cd.golden_config_id, cd.current_config,
            cd.detected_at, cd.last_checked_at, cd.status,
            cd.resolved_by, u.username AS resolved_by_username,
            cd.resolved_at, cd.accepted_change_id
         FROM config_drift cd
         JOIN devices d ON d.id = cd.device_id
         LEFT JOIN users u ON u.id = cd.resolved_by
         WHERE cd.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    Ok(drift)
}

/// Fetch the current open drift for a single device (used by DeviceDetail).
pub async fn get_for_device(
    State(state): State<AppState>,
    _claims: Claims,
    Path(device_id): Path<Uuid>,
) -> Result<Json<Option<ConfigDrift>>> {
    let drift = sqlx::query_as::<_, ConfigDrift>(
        "SELECT
            cd.id, cd.device_id, d.name AS device_name,
            cd.golden_config_id, cd.current_config,
            cd.detected_at, cd.last_checked_at, cd.status,
            cd.resolved_by, u.username AS resolved_by_username,
            cd.resolved_at, cd.accepted_change_id
         FROM config_drift cd
         JOIN devices d ON d.id = cd.device_id
         LEFT JOIN users u ON u.id = cd.resolved_by
         WHERE cd.device_id = $1 AND cd.status = 'open'
         LIMIT 1",
    )
    .bind(device_id)
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(drift))
}
