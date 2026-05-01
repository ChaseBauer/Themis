use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

use crate::{
    auth::{self, Claims},
    error::{AppError, Result},
    models::{
        approval::ApprovalWithUser,
        change::{
            ApproveChangeRequest, BatchCreateChangeRequest, ConfigChangeWithUser,
            UpdateChangeRequest,
        },
        comment::{ChangeComment, CreateCommentRequest},
        device::Device,
    },
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_all_changes))
        .route("/batch", post(create_batch_change))
        .route("/:id", get(get_change))
        .route("/:id", put(update_change))
        .route("/:id", delete(delete_change))
        .route("/:id/approve", post(approve_change))
        .route("/:id/unapprove", post(unapprove_change))
        .route("/:id/reject", post(reject_change))
        .route("/:id/deploy", get(deploy_stream))
        .route("/:id/comments", get(list_comments).post(create_comment))
        .route("/:id/comments/:cid/resolve", post(resolve_comment))
        .route("/:id/comments/:cid", delete(delete_comment))
}

#[derive(Deserialize)]
struct ListChangesQuery {
    status: Option<String>,
    search: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Serialize)]
pub struct ChangesPage {
    pub items: Vec<ConfigChangeWithUser>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
}

async fn list_all_changes(
    State(state): State<AppState>,
    _claims: Claims,
    Query(q): Query<ListChangesQuery>,
) -> Result<Json<ChangesPage>> {
    let page = q.page.unwrap_or(1).max(1);
    let limit = q.limit.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * limit;

    let status_filter = q.status.filter(|s| !s.is_empty() && s != "all");
    let search_filter = q.search.filter(|s| !s.is_empty());
    let search_pattern = search_filter.as_deref().map(|s| format!("%{}%", s));

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)
         FROM (
             SELECT COALESCE(cc.batch_id, cc.id) AS group_id
             FROM config_changes cc
             JOIN devices d ON d.id = cc.device_id
             JOIN users u ON u.id = cc.submitted_by
             WHERE ($1::text IS NULL OR cc.status = $1)
               AND ($2::text IS NULL OR (
                   cc.title ILIKE $2
                   OR d.name ILIKE $2
                   OR u.username ILIKE $2
               ))
             GROUP BY COALESCE(cc.batch_id, cc.id)
         ) grouped",
    )
    .bind(&status_filter)
    .bind(&search_pattern)
    .fetch_one(&state.db)
    .await?;

    let items = sqlx::query_as::<_, ConfigChangeWithUser>(
        "WITH visible AS (
            SELECT DISTINCT ON (COALESCE(cc.batch_id, cc.id))
                cc.id,
                cc.device_id,
                CASE
                    WHEN cc.batch_id IS NULL THEN d.name
                    ELSE COUNT(*) OVER (PARTITION BY cc.batch_id)::text || ' devices'
                END AS device_name,
                cc.title, cc.description, cc.config_diff, NULL::text AS full_config,
                cc.status, cc.submitted_by,
                u.username AS submitted_by_username,
                cc.required_approvals, cc.approval_count,
                cc.scheduled_at, cc.scheduled_by, cc.scheduled_save_as_golden, cc.batch_id,
                cc.deployed_at, NULL::text AS deployment_output, cc.created_at, cc.updated_at
            FROM config_changes cc
            JOIN devices d ON d.id = cc.device_id
            JOIN users u ON u.id = cc.submitted_by
            WHERE ($1::text IS NULL OR cc.status = $1)
              AND ($2::text IS NULL OR (
                  cc.title ILIKE $2
                  OR d.name ILIKE $2
                  OR u.username ILIKE $2
              ))
            ORDER BY COALESCE(cc.batch_id, cc.id), cc.created_at ASC
         )
         SELECT * FROM visible
         ORDER BY updated_at DESC
         LIMIT $3 OFFSET $4",
    )
    .bind(&status_filter)
    .bind(&search_pattern)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    let total_pages = (total + limit - 1) / limit;

    Ok(Json(ChangesPage {
        items,
        total,
        page,
        limit,
        total_pages,
    }))
}

async fn create_batch_change(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<BatchCreateChangeRequest>,
) -> Result<Json<Vec<ConfigChangeWithUser>>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    if req.device_ids.is_empty() {
        return Err(AppError::BadRequest(
            "Select at least one device for a batch change".to_string(),
        ));
    }
    if req.device_ids.len() > 100 {
        return Err(AppError::BadRequest(
            "Batch changes are limited to 100 devices".to_string(),
        ));
    }
    if req.title.trim().is_empty() || req.config_diff.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Title and config changes are required".to_string(),
        ));
    }

    let selected_devices = sqlx::query_as::<_, (Uuid, String, String)>(
        "SELECT id, name, os FROM devices WHERE id = ANY($1)",
    )
    .bind(&req.device_ids)
    .fetch_all(&state.db)
    .await?;
    if selected_devices.len() != req.device_ids.len() {
        return Err(AppError::BadRequest(
            "One or more selected devices no longer exist".to_string(),
        ));
    }

    let os_names: HashSet<String> = selected_devices
        .iter()
        .map(|(_, _, os)| os.trim())
        .map(|os| {
            if os.is_empty() {
                "Unspecified".to_string()
            } else {
                os.to_string()
            }
        })
        .collect();
    let normalized_os: HashSet<String> = os_names.iter().map(|os| os.to_lowercase()).collect();
    if normalized_os.len() > 1 {
        let mut display = os_names.into_iter().collect::<Vec<_>>();
        display.sort();
        return Err(AppError::BadRequest(format!(
            "Batch changes must target one OS. Selected devices include: {}",
            display.join(", ")
        )));
    }

    let default_approvals = state.settings.read().await.default_required_approvals;
    let required_approvals = req.required_approvals.unwrap_or(default_approvals).max(1);
    let batch_id = Uuid::new_v4();
    let scheduled_by = req.scheduled_at.map(|_| user_id);
    let save_as_golden = req.scheduled_save_as_golden.unwrap_or(true);
    let mut changes = Vec::with_capacity(req.device_ids.len());

    for device_id in req.device_ids {
        let change = sqlx::query_as::<_, ConfigChangeWithUser>(
            "WITH ins AS (
                INSERT INTO config_changes
                    (id, device_id, title, description, config_diff, full_config, submitted_by,
                     required_approvals, scheduled_at, scheduled_by, scheduled_save_as_golden, batch_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *
             )
             SELECT
                ins.id, ins.device_id, d.name AS device_name,
                ins.title, ins.description, ins.config_diff, ins.full_config,
                ins.status, ins.submitted_by,
                u.username AS submitted_by_username,
                ins.required_approvals, ins.approval_count,
                ins.scheduled_at, ins.scheduled_by, ins.scheduled_save_as_golden, ins.batch_id,
                ins.deployed_at, ins.deployment_output, ins.created_at, ins.updated_at
             FROM ins
             JOIN devices d ON d.id = ins.device_id
             JOIN users u ON u.id = ins.submitted_by",
        )
        .bind(Uuid::new_v4())
        .bind(device_id)
        .bind(req.title.trim())
        .bind(&req.description)
        .bind(&req.config_diff)
        .bind(&req.full_config)
        .bind(user_id)
        .bind(required_approvals)
        .bind(req.scheduled_at)
        .bind(scheduled_by)
        .bind(save_as_golden)
        .bind(batch_id)
        .fetch_one(&state.db)
        .await?;

        changes.push(change);
    }

    Ok(Json(changes))
}

#[derive(Debug, Serialize)]
pub struct ChangeDetail {
    #[serde(flatten)]
    pub change: ConfigChangeWithUser,
    pub approvals: Vec<ApprovalWithUser>,
    pub batch_devices: Vec<BatchDevice>,
    pub deployment_attempts: Vec<DeploymentAttempt>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct BatchDevice {
    pub id: Uuid,
    pub change_id: Uuid,
    pub name: String,
    pub ip_address: String,
    pub status: String,
    pub approval_count: i32,
    pub required_approvals: i32,
    pub deployed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub deployment_output: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DeploymentAttempt {
    pub id: Uuid,
    pub change_id: Uuid,
    pub device_id: Uuid,
    pub device_name: String,
    pub status: String,
    pub output: String,
    pub config_diff_snapshot: String,
    pub full_config_snapshot: Option<String>,
    pub attempted_by: Option<Uuid>,
    pub attempted_by_username: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

async fn fetch_change_detail(state: &AppState, id: Uuid) -> Result<Option<ChangeDetail>> {
    let change = sqlx::query_as::<_, ConfigChangeWithUser>(
        "SELECT
            cc.id, cc.device_id, cc.title, cc.description, cc.config_diff, cc.full_config,
            cc.status, cc.submitted_by, cc.required_approvals, cc.approval_count,
            cc.scheduled_at, cc.scheduled_by, cc.scheduled_save_as_golden, cc.batch_id,
            cc.deployed_at, cc.deployment_output, cc.created_at, cc.updated_at,
            d.name AS device_name,
            u.username AS submitted_by_username
         FROM config_changes cc
         JOIN devices d ON d.id = cc.device_id
         JOIN users u ON u.id = cc.submitted_by
         WHERE cc.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    let Some(change) = change else {
        return Ok(None);
    };

    let approvals = sqlx::query_as::<_, ApprovalWithUser>(
        "SELECT a.id, a.change_id, a.user_id, a.status, a.comment, a.created_at, u.username
         FROM approvals a
         JOIN users u ON u.id = a.user_id
         WHERE a.change_id = $1
         ORDER BY a.created_at ASC",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    let batch_devices = if let Some(batch_id) = change.batch_id {
        sqlx::query_as::<_, BatchDevice>(
            "SELECT
                d.id, cc.id AS change_id, d.name, d.ip_address,
                cc.status, cc.approval_count, cc.required_approvals,
                cc.deployed_at, cc.deployment_output
             FROM config_changes cc
             JOIN devices d ON d.id = cc.device_id
             WHERE cc.batch_id = $1
             ORDER BY
                CASE cc.status
                    WHEN 'failed' THEN 0
                    WHEN 'deploying' THEN 1
                    WHEN 'approved' THEN 2
                    WHEN 'pending' THEN 3
                    WHEN 'deployed' THEN 4
                    ELSE 5
                END,
                d.name ASC",
        )
        .bind(batch_id)
        .fetch_all(&state.db)
        .await?
    } else {
        Vec::new()
    };

    let deployment_attempts = if let Some(batch_id) = change.batch_id {
        sqlx::query_as::<_, DeploymentAttempt>(
            "SELECT
                da.id, da.change_id, da.device_id, d.name AS device_name,
                da.status, da.output, da.config_diff_snapshot, da.full_config_snapshot,
                da.attempted_by, u.username AS attempted_by_username, da.created_at
             FROM deployment_attempts da
             JOIN devices d ON d.id = da.device_id
             JOIN config_changes cc ON cc.id = da.change_id
             LEFT JOIN users u ON u.id = da.attempted_by
             WHERE cc.batch_id = $1
             ORDER BY da.created_at DESC",
        )
        .bind(batch_id)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, DeploymentAttempt>(
            "SELECT
                da.id, da.change_id, da.device_id, d.name AS device_name,
                da.status, da.output, da.config_diff_snapshot, da.full_config_snapshot,
                da.attempted_by, u.username AS attempted_by_username, da.created_at
             FROM deployment_attempts da
             JOIN devices d ON d.id = da.device_id
             LEFT JOIN users u ON u.id = da.attempted_by
             WHERE da.change_id = $1
             ORDER BY da.created_at DESC",
        )
        .bind(id)
        .fetch_all(&state.db)
        .await?
    };

    Ok(Some(ChangeDetail {
        change,
        approvals,
        batch_devices,
        deployment_attempts,
    }))
}

async fn get_change(
    State(state): State<AppState>,
    _claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<Json<ChangeDetail>> {
    fetch_change_detail(&state, id)
        .await?
        .ok_or(AppError::NotFound)
        .map(Json)
}

async fn update_change(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateChangeRequest>,
) -> Result<Json<ChangeDetail>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let detail = fetch_change_detail(&state, id)
        .await?
        .ok_or(AppError::NotFound)?;

    if detail.change.submitted_by != user_id {
        return Err(AppError::Forbidden);
    }
    let revision_ids = editable_change_ids(&state, &detail.change).await?;
    // Update the change and wipe approvals , the config changed so prior reviews are stale.
    // Failed revisions go back to pending review but keep deployment_attempts as an audit trail.
    sqlx::query(
        "UPDATE config_changes
         SET title = $2, description = $3, config_diff = $4,
             scheduled_at = $5,
             scheduled_by = CASE WHEN $5::timestamptz IS NULL THEN NULL ELSE $6 END,
             scheduled_save_as_golden = $7,
             approval_count = 0,
             status = 'pending',
             deployed_at = NULL,
             deployment_output = NULL,
             updated_at = NOW()
         WHERE id = ANY($1)",
    )
    .bind(&revision_ids)
    .bind(&req.title)
    .bind(&req.description)
    .bind(&req.config_diff)
    .bind(req.scheduled_at)
    .bind(user_id)
    .bind(req.scheduled_save_as_golden.unwrap_or(true))
    .execute(&state.db)
    .await?;

    sqlx::query("DELETE FROM approvals WHERE change_id = ANY($1)")
        .bind(&revision_ids)
        .execute(&state.db)
        .await?;

    fetch_change_detail(&state, id)
        .await?
        .ok_or(AppError::NotFound)
        .map(Json)
}

async fn editable_change_ids(state: &AppState, change: &ConfigChangeWithUser) -> Result<Vec<Uuid>> {
    if let Some(batch_id) = change.batch_id {
        let failed_ids = sqlx::query_scalar::<_, Uuid>(
            "SELECT id
             FROM config_changes
             WHERE batch_id = $1 AND status = 'failed'
             ORDER BY created_at ASC",
        )
        .bind(batch_id)
        .fetch_all(&state.db)
        .await?;

        if !failed_ids.is_empty() {
            return Ok(failed_ids);
        }

        let pending_ids = sqlx::query_scalar::<_, Uuid>(
            "SELECT id
             FROM config_changes
             WHERE batch_id = $1 AND status = 'pending'
             ORDER BY created_at ASC",
        )
        .bind(batch_id)
        .fetch_all(&state.db)
        .await?;

        if !pending_ids.is_empty() {
            return Ok(pending_ids);
        }
    } else if matches!(change.status.as_str(), "pending" | "failed") {
        return Ok(vec![change.id]);
    }

    Err(AppError::BadRequest(
        "Only pending changes or failed deployments can be revised".to_string(),
    ))
}

async fn delete_change(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let detail = fetch_change_detail(&state, id)
        .await?
        .ok_or(AppError::NotFound)?;

    if detail.change.submitted_by != user_id {
        return Err(AppError::Forbidden);
    }
    if detail.change.status == "deployed" {
        return Err(AppError::BadRequest(
            "Deployed changes cannot be deleted".to_string(),
        ));
    }

    sqlx::query("DELETE FROM approvals WHERE change_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    sqlx::query("DELETE FROM config_changes WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn approve_change(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<Uuid>,
    Json(_req): Json<ApproveChangeRequest>,
) -> Result<Json<ChangeDetail>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    let role = auth::require_not_viewer(&state, user_id).await?;
    let is_admin = role == "admin";

    let detail = fetch_change_detail(&state, id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !is_admin && detail.change.submitted_by == user_id {
        return Err(AppError::BadRequest(
            "You cannot approve your own change".to_string(),
        ));
    }

    let target_ids = target_change_ids(&state, &detail.change).await?;
    for change_id in &target_ids {
        let submitted_by: Uuid =
            sqlx::query_scalar("SELECT submitted_by FROM config_changes WHERE id = $1")
                .bind(change_id)
                .fetch_one(&state.db)
                .await?;
        if !is_admin && submitted_by == user_id {
            return Err(AppError::BadRequest(
                "You cannot approve your own change".to_string(),
            ));
        }
        sqlx::query(
            "INSERT INTO approvals (id, change_id, user_id, status, comment)
             VALUES ($1, $2, $3, 'approved', $4)
             ON CONFLICT (change_id, user_id)
             DO UPDATE SET status = 'approved', comment = $4, created_at = NOW()",
        )
        .bind(Uuid::new_v4())
        .bind(change_id)
        .bind(user_id)
        .bind(Option::<String>::None)
        .execute(&state.db)
        .await?;

        refresh_change_approval_state(&state, *change_id).await?;
    }

    fetch_change_detail(&state, id)
        .await?
        .ok_or(AppError::NotFound)
        .map(Json)
}

async fn unapprove_change(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<Json<ChangeDetail>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let detail = fetch_change_detail(&state, id)
        .await?
        .ok_or(AppError::NotFound)?;

    if detail.change.status != "pending" && detail.change.status != "approved" {
        return Err(AppError::BadRequest(
            "Only pending or approved changes can be unapproved".to_string(),
        ));
    }

    let target_ids = approved_target_change_ids(&state, &detail.change, user_id).await?;
    for change_id in &target_ids {
        sqlx::query(
            "DELETE FROM approvals
             WHERE change_id = $1 AND user_id = $2 AND status = 'approved'",
        )
        .bind(change_id)
        .bind(user_id)
        .execute(&state.db)
        .await?;

        refresh_change_approval_state(&state, *change_id).await?;
    }

    fetch_change_detail(&state, id)
        .await?
        .ok_or(AppError::NotFound)
        .map(Json)
}

async fn reject_change(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<Uuid>,
    Json(req): Json<ApproveChangeRequest>,
) -> Result<Json<ChangeDetail>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let detail = fetch_change_detail(&state, id)
        .await?
        .ok_or(AppError::NotFound)?;

    if detail.change.status == "deployed" {
        return Err(AppError::BadRequest(
            "Cannot reject a deployed change".to_string(),
        ));
    }

    let target_ids = target_change_ids(&state, &detail.change).await?;
    for change_id in &target_ids {
        sqlx::query(
            "INSERT INTO approvals (id, change_id, user_id, status, comment)
             VALUES ($1, $2, $3, 'rejected', $4)
             ON CONFLICT (change_id, user_id)
             DO UPDATE SET status = 'rejected', comment = $4, created_at = NOW()",
        )
        .bind(Uuid::new_v4())
        .bind(change_id)
        .bind(user_id)
        .bind(&req.comment)
        .execute(&state.db)
        .await?;

        sqlx::query(
            "UPDATE config_changes SET status = 'rejected', updated_at = NOW() WHERE id = $1",
        )
        .bind(change_id)
        .execute(&state.db)
        .await?;
    }

    fetch_change_detail(&state, id)
        .await?
        .ok_or(AppError::NotFound)
        .map(Json)
}

async fn target_change_ids(state: &AppState, change: &ConfigChangeWithUser) -> Result<Vec<Uuid>> {
    if let Some(batch_id) = change.batch_id {
        let ids = sqlx::query_scalar::<_, Uuid>(
            "SELECT id
             FROM config_changes
             WHERE batch_id = $1
               AND status = 'pending'
             ORDER BY created_at ASC",
        )
        .bind(batch_id)
        .fetch_all(&state.db)
        .await?;

        if ids.is_empty() {
            return Err(AppError::BadRequest(
                "No pending changes remain in this batch".to_string(),
            ));
        }
        Ok(ids)
    } else {
        if change.status != "pending" {
            return Err(AppError::BadRequest(
                "Only pending changes can be approved".to_string(),
            ));
        }
        Ok(vec![change.id])
    }
}

async fn approved_target_change_ids(
    state: &AppState,
    change: &ConfigChangeWithUser,
    user_id: Uuid,
) -> Result<Vec<Uuid>> {
    let ids = if let Some(batch_id) = change.batch_id {
        sqlx::query_scalar::<_, Uuid>(
            "SELECT cc.id
             FROM config_changes cc
             JOIN approvals a ON a.change_id = cc.id
             WHERE cc.batch_id = $1
               AND cc.status IN ('pending', 'approved')
               AND a.user_id = $2
               AND a.status = 'approved'
             ORDER BY cc.created_at ASC",
        )
        .bind(batch_id)
        .bind(user_id)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_scalar::<_, Uuid>(
            "SELECT cc.id
             FROM config_changes cc
             JOIN approvals a ON a.change_id = cc.id
             WHERE cc.id = $1
               AND cc.status IN ('pending', 'approved')
               AND a.user_id = $2
               AND a.status = 'approved'",
        )
        .bind(change.id)
        .bind(user_id)
        .fetch_all(&state.db)
        .await?
    };

    if ids.is_empty() {
        return Err(AppError::BadRequest(
            "You have not approved this change".to_string(),
        ));
    }

    Ok(ids)
}

async fn refresh_change_approval_state(state: &AppState, id: Uuid) -> Result<()> {
    sqlx::query(
        "UPDATE config_changes SET
            approval_count = (
                SELECT COUNT(*) FROM approvals
                WHERE change_id = $1 AND status = 'approved'
            ),
            status = CASE
                WHEN (
                    SELECT COUNT(*) FROM approvals
                    WHERE change_id = $1 AND status = 'approved'
                ) >= required_approvals THEN 'approved'
                WHEN status = 'approved' THEN 'pending'
                ELSE status
            END,
            updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .execute(&state.db)
    .await?;

    Ok(())
}

// Section
// Comments
// Section

async fn list_comments(
    State(state): State<AppState>,
    _claims: Claims,
    Path(change_id): Path<Uuid>,
) -> Result<Json<Vec<ChangeComment>>> {
    let comments = sqlx::query_as::<_, ChangeComment>(
        "SELECT * FROM change_comments WHERE change_id = $1 ORDER BY created_at ASC",
    )
    .bind(change_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(comments))
}

async fn create_comment(
    State(state): State<AppState>,
    claims: Claims,
    Path(change_id): Path<Uuid>,
    Json(req): Json<CreateCommentRequest>,
) -> Result<Json<ChangeComment>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;
    let username: String = sqlx::query_scalar("SELECT username FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&state.db)
        .await?;

    ensure_change_comments_mutable(&state, change_id).await?;

    if let Some(parent_comment_id) = req.parent_comment_id {
        let parent_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(
                SELECT 1 FROM change_comments
                WHERE id = $1 AND change_id = $2 AND parent_comment_id IS NULL
            )",
        )
        .bind(parent_comment_id)
        .bind(change_id)
        .fetch_one(&state.db)
        .await?;
        if !parent_exists {
            return Err(AppError::BadRequest(
                "Reply target was not found on this change".to_string(),
            ));
        }
    }

    let mentioned_user_ids = mentioned_user_ids(&state, &req.content).await?;

    let comment = sqlx::query_as::<_, ChangeComment>(
        "INSERT INTO change_comments
            (change_id, user_id, username, content, parent_comment_id, line_start, line_end,
             line_snapshot, mentioned_user_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *",
    )
    .bind(change_id)
    .bind(user_id)
    .bind(&username)
    .bind(&req.content)
    .bind(req.parent_comment_id)
    .bind(req.line_start)
    .bind(req.line_end)
    .bind(&req.line_snapshot)
    .bind(&mentioned_user_ids)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(comment))
}

async fn mentioned_user_ids(state: &AppState, content: &str) -> Result<Vec<Uuid>> {
    let usernames: Vec<String> = content
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '@'))
        .filter_map(|token| token.strip_prefix('@'))
        .filter(|name| !name.is_empty())
        .map(|name| name.to_ascii_lowercase())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    if usernames.is_empty() {
        return Ok(Vec::new());
    }

    let ids = sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE lower(username) = ANY($1)")
        .bind(&usernames)
        .fetch_all(&state.db)
        .await?;

    Ok(ids)
}

async fn resolve_comment(
    State(state): State<AppState>,
    claims: Claims,
    Path((change_id, comment_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<ChangeComment>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;
    ensure_change_comments_mutable(&state, change_id).await?;
    let username: String = sqlx::query_scalar("SELECT username FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&state.db)
        .await?;

    // Toggle: if already resolved → unresolve, otherwise resolve
    let comment = sqlx::query_as::<_, ChangeComment>(
        "UPDATE change_comments
         SET resolved             = NOT resolved,
             resolved_by          = CASE WHEN resolved THEN NULL ELSE $2 END,
             resolved_by_username = CASE WHEN resolved THEN NULL ELSE $3 END,
             resolved_at          = CASE WHEN resolved THEN NULL ELSE NOW() END
         WHERE id = $1 AND change_id = $4 AND parent_comment_id IS NULL
         RETURNING *",
    )
    .bind(comment_id)
    .bind(user_id)
    .bind(&username)
    .bind(change_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(comment))
}

async fn delete_comment(
    State(state): State<AppState>,
    claims: Claims,
    Path((change_id, comment_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;
    ensure_change_comments_mutable(&state, change_id).await?;
    let role: String = sqlx::query_scalar("SELECT role FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&state.db)
        .await?;

    // Authors and admins can delete any comment; others can only delete their own
    let result = if role == "admin" {
        sqlx::query("DELETE FROM change_comments WHERE id = $1 AND change_id = $2")
            .bind(comment_id)
            .bind(change_id)
            .execute(&state.db)
            .await?
    } else {
        sqlx::query("DELETE FROM change_comments WHERE id = $1 AND change_id = $2 AND user_id = $3")
            .bind(comment_id)
            .bind(change_id)
            .bind(user_id)
            .execute(&state.db)
            .await?
    };

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn ensure_change_comments_mutable(state: &AppState, change_id: Uuid) -> Result<()> {
    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM config_changes WHERE id = $1")
            .bind(change_id)
            .fetch_optional(&state.db)
            .await?;

    let Some(status) = status else {
        return Err(AppError::NotFound);
    };

    if status == "deployed" {
        return Err(AppError::BadRequest(
            "Comments are read-only after a change is deployed".to_string(),
        ));
    }

    Ok(())
}

// Section

#[derive(Deserialize)]
struct DeployQuery {
    token: String,
    save_as_golden: Option<bool>,
    batch: Option<bool>,
    target_change_id: Option<Uuid>,
    failed_only: Option<bool>,
}

#[derive(Clone)]
struct DeployTarget {
    change: ConfigChangeWithUser,
    device_name: String,
    host: String,
    port: u16,
    username: String,
    password: String,
    ssh_options: Option<String>,
    vendor: String,
    os: String,
}

#[allow(clippy::large_enum_variant)]
enum DeployEvent {
    Output {
        change_id: Uuid,
        device_name: String,
        chunk: String,
    },
    Progress {
        device_name: String,
        change: ChangeDetail,
    },
    Error {
        device_name: String,
        message: String,
    },
}

async fn deploy_stream(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(query): Query<DeployQuery>,
) -> Result<impl IntoResponse> {
    let claims = crate::auth::verify_token(&query.token, &state.config.jwt_secret)
        .map_err(|_| AppError::Unauthorized)?;
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let detail = fetch_change_detail(&state, id)
        .await?
        .ok_or(AppError::NotFound)?;

    let failed_only = query.failed_only.unwrap_or(false);
    let target_changes = if query.batch.unwrap_or(false) {
        let Some(batch_id) = detail.change.batch_id else {
            return Err(AppError::BadRequest(
                "This change is not part of a batch".to_string(),
            ));
        };

        let status = if failed_only { "failed" } else { "approved" };
        sqlx::query_as::<_, ConfigChangeWithUser>(
            "SELECT
                cc.id, cc.device_id, d.name AS device_name,
                cc.title, cc.description, cc.config_diff, cc.full_config,
                cc.status, cc.submitted_by,
                u.username AS submitted_by_username,
                cc.required_approvals, cc.approval_count,
                cc.scheduled_at, cc.scheduled_by, cc.scheduled_save_as_golden, cc.batch_id,
                cc.deployed_at, cc.deployment_output, cc.created_at, cc.updated_at
             FROM config_changes cc
             JOIN devices d ON d.id = cc.device_id
             JOIN users u ON u.id = cc.submitted_by
             WHERE cc.batch_id = $1 AND cc.status = $2
             ORDER BY d.name ASC",
        )
        .bind(batch_id)
        .bind(status)
        .fetch_all(&state.db)
        .await?
    } else {
        let target_id = query.target_change_id.unwrap_or(id);
        let target_detail = fetch_change_detail(&state, target_id)
            .await?
            .ok_or(AppError::NotFound)?;

        if target_id != id && target_detail.change.batch_id != detail.change.batch_id {
            return Err(AppError::BadRequest(
                "Selected device is not part of this batch".to_string(),
            ));
        }
        if !is_deployable_status(&target_detail.change.status) {
            return Err(AppError::BadRequest(
                "Only approved or failed changes can be deployed".to_string(),
            ));
        }

        vec![target_detail.change]
    };

    if target_changes.is_empty() {
        let message = if failed_only {
            "No failed devices are ready to retry in this batch"
        } else {
            "No approved devices are ready to deploy in this batch"
        };
        return Err(AppError::BadRequest(message.to_string()));
    }

    // Block deploy if any targeted change has unresolved comments
    for change in &target_changes {
        let unresolved: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM change_comments
             WHERE change_id = $1 AND resolved = false AND parent_comment_id IS NULL",
        )
        .bind(change.id)
        .fetch_one(&state.db)
        .await?;

        if unresolved > 0 {
            return Err(AppError::BadRequest(format!(
                "Cannot deploy '{}': {} unresolved comment{} must be resolved first",
                change.device_name,
                unresolved,
                if unresolved == 1 { "" } else { "s" },
            )));
        }
    }

    let mut targets = Vec::with_capacity(target_changes.len());
    for change in target_changes {
        let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = $1")
            .bind(change.device_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or(AppError::NotFound)?;

        let ssh_username = device.ssh_username.ok_or_else(|| {
            AppError::BadRequest(format!(
                "SSH credentials not configured for {}. Add them via the device settings.",
                device.name
            ))
        })?;
        let ssh_password = device.ssh_password.ok_or_else(|| {
            AppError::BadRequest(format!(
                "SSH credentials not configured for {}. Add them via the device settings.",
                device.name
            ))
        })?;

        targets.push(DeployTarget {
            change,
            device_name: device.name,
            host: device.ip_address,
            port: device.ssh_port as u16,
            username: ssh_username,
            password: ssh_password,
            ssh_options: device.ssh_options,
            vendor: device.vendor,
            os: device.os,
        });
    }

    let save_as_golden = query.save_as_golden.unwrap_or(true);

    Ok(
        ws.on_upgrade(move |socket| {
            run_deploy(socket, state, id, user_id, targets, save_as_golden)
        }),
    )
}

fn is_deployable_status(status: &str) -> bool {
    matches!(status, "approved" | "failed")
}

async fn run_deploy(
    mut socket: WebSocket,
    state: AppState,
    root_id: Uuid,
    user_id: Uuid,
    targets: Vec<DeployTarget>,
    save_as_golden: bool,
) {
    let target_count = targets.len();
    let concurrency = if target_count > 1 {
        state.settings.read().await.batch_deploy_concurrency
    } else {
        1
    }
    .clamp(1, 50) as usize;

    let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel::<DeployEvent>();
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(concurrency));
    let mut handles = Vec::with_capacity(target_count);

    for target in targets {
        let state = state.clone();
        let event_tx = event_tx.clone();
        let semaphore = std::sync::Arc::clone(&semaphore);

        handles.push(tokio::spawn(async move {
            let Ok(_permit) = semaphore.acquire_owned().await else {
                return false;
            };
            deploy_target(state, root_id, user_id, target, save_as_golden, event_tx).await
        }));
    }
    drop(event_tx);

    while let Some(event) = event_rx.recv().await {
        let message = match event {
            DeployEvent::Output {
                change_id,
                device_name,
                chunk,
            } => serde_json::json!({
                "type": "output",
                "change_id": change_id,
                "device": device_name,
                "chunk": chunk
            })
            .to_string(),
            DeployEvent::Progress {
                device_name,
                change,
            } => serde_json::json!({
                "type": "progress",
                "device": device_name,
                "change": change
            })
            .to_string(),
            DeployEvent::Error {
                device_name,
                message,
            } => serde_json::json!({
                "type": "device_error",
                "device": device_name,
                "message": message
            })
            .to_string(),
        };

        if socket.send(Message::Text(message)).await.is_err() {
            return;
        }
    }

    let mut failed_count = 0usize;
    for handle in handles {
        match handle.await {
            Ok(true) => {}
            Ok(false) | Err(_) => failed_count += 1,
        }
    }

    let done_msg = match fetch_change_detail(&state, root_id).await {
        Ok(Some(updated)) => serde_json::json!({
            "type": "done",
            "change": updated,
            "failed_count": failed_count,
            "total_count": target_count
        })
        .to_string(),
        _ => serde_json::json!({
            "type": "done",
            "failed_count": failed_count,
            "total_count": target_count
        })
        .to_string(),
    };
    let _ = socket.send(Message::Text(done_msg)).await;
}

async fn deploy_target(
    state: AppState,
    root_id: Uuid,
    user_id: Uuid,
    target: DeployTarget,
    save_as_golden: bool,
    event_tx: tokio::sync::mpsc::UnboundedSender<DeployEvent>,
) -> bool {
    if let Err(e) = sqlx::query(
        "UPDATE config_changes SET status = 'deploying', updated_at = NOW() WHERE id = $1",
    )
    .bind(target.change.id)
    .execute(&state.db)
    .await
    {
        let _ = event_tx.send(DeployEvent::Error {
            device_name: target.device_name,
            message: e.to_string(),
        });
        return false;
    }

    send_progress_event(&event_tx, &state, root_id, &target.device_name).await;
    lock_device(&state, target.change.device_id).await;

    let _ = event_tx.send(DeployEvent::Output {
        change_id: target.change.id,
        device_name: target.device_name.clone(),
        chunk: format!(
            "\n===== Deploying {} ({}) =====\n",
            target.device_name, target.host
        ),
    });

    let (chunk_tx, mut chunk_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let commands = target.change.config_diff.clone();
    let host = target.host.clone();
    let username = target.username.clone();
    let password = target.password.clone();
    let ssh_options = target.ssh_options.clone();
    let vendor = target.vendor.clone();
    let os = target.os.clone();
    let port = target.port;
    let change_id = target.change.id;
    let device_name = target.device_name.clone();
    let output_event_tx = event_tx.clone();
    let profiles = state.settings.read().await.vendor_profiles.clone();

    let ssh_handle = tokio::task::spawn_blocking(move || {
        let target = crate::ssh::SshTarget {
            host: &host,
            port,
            username: &username,
            password: &password,
            ssh_options: ssh_options.as_deref(),
        };
        crate::ssh::apply_config_safe_streaming(
            &target, &commands, &vendor, &os, &profiles, chunk_tx,
        )
    });

    while let Some(chunk) = chunk_rx.recv().await {
        let _ = output_event_tx.send(DeployEvent::Output {
            change_id,
            device_name: device_name.clone(),
            chunk,
        });
    }

    let device_id = target.change.device_id;

    let full_output = match ssh_handle.await {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => {
            let _ = mark_deploy_failed(&state, target.change.id, user_id, &e).await;
            unlock_device(&state, device_id).await;
            send_progress_event(&event_tx, &state, root_id, &target.device_name).await;
            let _ = event_tx.send(DeployEvent::Error {
                device_name: target.device_name,
                message: e,
            });
            return false;
        }
        Err(e) => {
            let message = e.to_string();
            let _ = mark_deploy_failed(&state, target.change.id, user_id, &message).await;
            unlock_device(&state, device_id).await;
            send_progress_event(&event_tx, &state, root_id, &target.device_name).await;
            let _ = event_tx.send(DeployEvent::Error {
                device_name: target.device_name,
                message,
            });
            return false;
        }
    };

    if let Err(e) = sqlx::query(
        "UPDATE config_changes
         SET status = 'deployed', deployed_at = NOW(), deployment_output = $2, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(target.change.id)
    .bind(&full_output)
    .execute(&state.db)
    .await
    {
        unlock_device(&state, device_id).await;
        let _ = event_tx.send(DeployEvent::Error {
            device_name: target.device_name,
            message: e.to_string(),
        });
        return false;
    }

    let _ = record_deployment_attempt(&state, target.change.id, user_id, "deployed", &full_output)
        .await;

    if save_as_golden {
        let golden_ok = save_golden_config(&state, &target, user_id).await;
        let msg = if golden_ok {
            "[themis] Golden config updated.\n".to_string()
        } else {
            "[themis] WARNING: deployment succeeded but could not pull running config to save as golden. Drift detection may trigger until the config is manually refreshed.\n".to_string()
        };
        let _ = event_tx.send(DeployEvent::Output {
            change_id: target.change.id,
            device_name: target.device_name.clone(),
            chunk: msg,
        });
    }

    unlock_device(&state, device_id).await;
    send_progress_event(&event_tx, &state, root_id, &target.device_name).await;
    true
}

async fn send_progress_event(
    event_tx: &tokio::sync::mpsc::UnboundedSender<DeployEvent>,
    state: &AppState,
    root_id: Uuid,
    device_name: &str,
) {
    if let Ok(Some(change)) = fetch_change_detail(state, root_id).await {
        let _ = event_tx.send(DeployEvent::Progress {
            device_name: device_name.to_string(),
            change,
        });
    }
}

async fn lock_device(state: &AppState, device_id: Uuid) {
    let _ = sqlx::query("UPDATE devices SET deploying_since = NOW() WHERE id = $1")
        .bind(device_id)
        .execute(&state.db)
        .await;
}

async fn unlock_device(state: &AppState, device_id: Uuid) {
    let _ = sqlx::query("UPDATE devices SET deploying_since = NULL WHERE id = $1")
        .bind(device_id)
        .execute(&state.db)
        .await;
}

async fn mark_deploy_failed(state: &AppState, id: Uuid, user_id: Uuid, output: &str) -> Result<()> {
    sqlx::query(
        "UPDATE config_changes
         SET status = 'failed', deployment_output = $2, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(id)
    .bind(output)
    .execute(&state.db)
    .await?;

    record_deployment_attempt(state, id, user_id, "failed", output).await?;

    Ok(())
}

async fn record_deployment_attempt(
    state: &AppState,
    id: Uuid,
    user_id: Uuid,
    status: &str,
    output: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO deployment_attempts
            (change_id, device_id, status, output, config_diff_snapshot, full_config_snapshot, attempted_by)
         SELECT id, device_id, $2, $3, config_diff, full_config, $4
         FROM config_changes
         WHERE id = $1",
    )
    .bind(id)
    .bind(status)
    .bind(output)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    Ok(())
}

async fn save_golden_config(state: &AppState, target: &DeployTarget, user_id: Uuid) -> bool {
    let host = target.host.clone();
    let port = target.port;
    let username = target.username.clone();
    let password = target.password.clone();
    let ssh_options = target.ssh_options.clone();
    let vendor = target.vendor.clone();
    let os = target.os.clone();
    let device_id = target.change.device_id;
    let custom_command = sqlx::query_scalar::<_, Option<String>>(
        "SELECT config_pull_command FROM devices WHERE id = $1",
    )
    .bind(device_id)
    .fetch_one(&state.db)
    .await
    .ok()
    .flatten();

    let profiles = state.settings.read().await.vendor_profiles.clone();

    let pulled = tokio::task::spawn_blocking(move || {
        let ssh_target = crate::ssh::SshTarget {
            host: &host,
            port,
            username: &username,
            password: &password,
            ssh_options: ssh_options.as_deref(),
        };
        crate::ssh::pull_running_config(
            &ssh_target,
            &vendor,
            &os,
            custom_command.as_deref(),
            &profiles,
        )
    })
    .await;

    let config = match pulled {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => {
            tracing::warn!(
                "save_as_golden: config pull failed for device {}: {}",
                device_id,
                e
            );
            return false;
        }
        Err(e) => {
            tracing::warn!(
                "save_as_golden: spawn error for device {}: {}",
                device_id,
                e
            );
            return false;
        }
    };

    let next_version = match sqlx::query_scalar::<_, i32>(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM golden_configs WHERE device_id = $1",
    )
    .bind(device_id)
    .fetch_one(&state.db)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(
                "save_as_golden: version query failed for device {}: {}",
                device_id,
                e
            );
            return false;
        }
    };

    if let Err(e) = sqlx::query(
        "INSERT INTO golden_configs (id, device_id, config, version, created_by)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(device_id)
    .bind(&config)
    .bind(next_version)
    .bind(user_id)
    .execute(&state.db)
    .await
    {
        tracing::warn!(
            "save_as_golden: insert failed for device {}: {}",
            device_id,
            e
        );
        return false;
    }

    let _ = sqlx::query(
        "DELETE FROM golden_configs
         WHERE device_id = $1
           AND id NOT IN (
               SELECT id FROM golden_configs
               WHERE device_id = $1
               ORDER BY version DESC
               LIMIT $2
           )",
    )
    .bind(device_id)
    .bind(state.settings.read().await.max_golden_configs)
    .execute(&state.db)
    .await;

    true
}
