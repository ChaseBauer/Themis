use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::{
    auth::{self, Claims},
    error::{AppError, Result},
    models::{
        change::{ConfigChangeWithUser, CreateChangeRequest},
        device::{
            CreateDeviceRequest, CreateDeviceSiteRequest, CreateDeviceTagRequest, Device,
            DeviceSite, DeviceTag, UpdateDeviceRequest,
        },
        golden_config::{CreateGoldenConfigRequest, GoldenConfigWithUser},
    },
    routes::terminal,
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_devices).post(create_device))
        .route("/sites", get(list_sites).post(create_site))
        .route("/sites/:id", get(get_site).delete(delete_site))
        .route("/tags", get(list_tags).post(create_tag))
        .route("/tags/:id", get(get_tag).delete(delete_tag))
        .route("/health", get(health_check_all))
        .route("/:id/health", get(health_check_one))
        .route(
            "/:id",
            get(get_device).put(update_device).delete(delete_device),
        )
        .route("/:id/changes", get(list_changes).post(create_change))
        .route("/:id/test-connection", post(test_connection))
        .route("/:id/onboard", post(onboard_device))
        .route("/:id/revert-golden", get(revert_to_golden))
        .route("/:id/terminal", get(terminal::handler))
        .route(
            "/:id/golden-configs",
            get(list_golden_configs).post(create_golden_config),
        )
}

async fn list_devices(State(state): State<AppState>, _claims: Claims) -> Result<Json<Vec<Device>>> {
    let devices = sqlx::query_as::<_, Device>("SELECT * FROM devices ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(devices))
}

async fn create_device(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<CreateDeviceRequest>,
) -> Result<Json<Device>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;
    let tags = clean_tags(req.tags);
    ensure_tags_exist(&state, &tags).await?;
    let site = normalize_optional(req.site.as_deref());
    ensure_site_exists(&state, site.as_deref()).await?;

    let device = sqlx::query_as::<_, Device>(
        "INSERT INTO devices
            (id, name, ip_address, site, vendor, os, ssh_port, ssh_username, ssh_password, config_pull_command, ssh_options, tags, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *",
    )
    .bind(Uuid::new_v4())
    .bind(&req.name)
    .bind(&req.ip_address)
    .bind(&site)
    .bind(&req.vendor)
    .bind(&req.os)
    .bind(req.ssh_port.unwrap_or(22))
    .bind(&req.ssh_username)
    .bind(&req.ssh_password)
    .bind(&req.config_pull_command)
    .bind(&req.ssh_options)
    .bind(&tags)
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;
    sync_device_tag_assignments(&state, device.id, &tags).await?;

    Ok(Json(device))
}

async fn get_device(
    State(state): State<AppState>,
    _claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<Json<Device>> {
    let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(device))
}

async fn update_device(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateDeviceRequest>,
) -> Result<Json<Device>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;
    let tags = req.tags.map(clean_tag_vec);
    if let Some(tags) = &tags {
        ensure_tags_exist(&state, tags).await?;
    }
    let site_touched = req.site.is_some();
    let site = req
        .site
        .as_ref()
        .and_then(|site| normalize_optional(site.as_deref()));
    ensure_site_exists(&state, site.as_deref()).await?;

    let device = sqlx::query_as::<_, Device>(
        "UPDATE devices SET
             name               = COALESCE($2, name),
             ip_address         = COALESCE($3, ip_address),
             site               = CASE WHEN $4 THEN $5 ELSE site END,
             vendor             = COALESCE($6, vendor),
             os                 = COALESCE($7, os),
             ssh_port           = COALESCE($8, ssh_port),
             ssh_username       = COALESCE($9, ssh_username),
             ssh_password       = COALESCE($10, ssh_password),
             config_pull_command = $11,
             ssh_options        = $12,
             tags               = COALESCE($13, tags)
         WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(&req.name)
    .bind(&req.ip_address)
    .bind(site_touched)
    .bind(&site)
    .bind(&req.vendor)
    .bind(&req.os)
    .bind(req.ssh_port)
    .bind(&req.ssh_username)
    .bind(&req.ssh_password)
    .bind(&req.config_pull_command)
    .bind(&req.ssh_options)
    .bind(&tags)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    if let Some(tags) = &tags {
        sync_device_tag_assignments(&state, id, tags).await?;
    }

    Ok(Json(device))
}

async fn list_sites(
    State(state): State<AppState>,
    _claims: Claims,
) -> Result<Json<Vec<DeviceSite>>> {
    let sites = sqlx::query_as::<_, DeviceSite>(
        "SELECT id, name, created_at FROM device_sites ORDER BY LOWER(name)",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(sites))
}

async fn get_site(
    State(state): State<AppState>,
    _claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<Json<DeviceSite>> {
    let site = sqlx::query_as::<_, DeviceSite>(
        "SELECT id, name, created_at FROM device_sites WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(site))
}

async fn create_site(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<CreateDeviceSiteRequest>,
) -> Result<Json<DeviceSite>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;
    let name = req.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Site name is required".to_string()));
    }

    let site = sqlx::query_as::<_, DeviceSite>(
        "INSERT INTO device_sites (id, name, name_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (name_key) DO UPDATE SET name = device_sites.name
         RETURNING id, name, created_at",
    )
    .bind(Uuid::new_v4())
    .bind(name)
    .bind(name.to_lowercase())
    .fetch_one(&state.db)
    .await?;
    Ok(Json(site))
}

async fn delete_site(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let site_name: Option<String> =
        sqlx::query_scalar("SELECT name FROM device_sites WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    let Some(site_name) = site_name else {
        return Err(AppError::NotFound);
    };

    sqlx::query("DELETE FROM device_sites WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE devices SET site = NULL WHERE LOWER(site) = LOWER($1)")
        .bind(site_name)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_tags(State(state): State<AppState>, _claims: Claims) -> Result<Json<Vec<DeviceTag>>> {
    let tags = sqlx::query_as::<_, DeviceTag>(
        "SELECT id, name, created_at FROM device_tags ORDER BY LOWER(name)",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(tags))
}

async fn get_tag(
    State(state): State<AppState>,
    _claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<Json<DeviceTag>> {
    let tag = sqlx::query_as::<_, DeviceTag>(
        "SELECT id, name, created_at FROM device_tags WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(tag))
}

async fn create_tag(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<CreateDeviceTagRequest>,
) -> Result<Json<DeviceTag>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;
    let name = req.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Tag name is required".to_string()));
    }

    let tag = sqlx::query_as::<_, DeviceTag>(
        "INSERT INTO device_tags (id, name, name_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (name_key) DO UPDATE SET name = device_tags.name
         RETURNING id, name, created_at",
    )
    .bind(Uuid::new_v4())
    .bind(name)
    .bind(name.to_lowercase())
    .fetch_one(&state.db)
    .await?;
    Ok(Json(tag))
}

async fn delete_tag(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let tag_name: Option<String> = sqlx::query_scalar("SELECT name FROM device_tags WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?;
    let Some(tag_name) = tag_name else {
        return Err(AppError::NotFound);
    };

    sqlx::query("DELETE FROM device_tags WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE devices SET tags = array_remove(tags, $1)")
        .bind(tag_name)
        .execute(&state.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

fn clean_tags(tags: Option<Vec<String>>) -> Vec<String> {
    clean_tag_vec(tags.unwrap_or_default())
}

fn clean_tag_vec(tags: Vec<String>) -> Vec<String> {
    tags.into_iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .fold(Vec::<String>::new(), |mut acc, tag| {
            if !acc
                .iter()
                .any(|existing| existing.eq_ignore_ascii_case(&tag))
            {
                acc.push(tag);
            }
            acc
        })
}

fn normalize_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

async fn ensure_tags_exist(state: &AppState, tags: &[String]) -> Result<()> {
    if tags.is_empty() {
        return Ok(());
    }
    let existing: Vec<String> =
        sqlx::query_scalar("SELECT name FROM device_tags WHERE name_key = ANY($1)")
            .bind(
                tags.iter()
                    .map(|tag| tag.to_lowercase())
                    .collect::<Vec<_>>(),
            )
            .fetch_all(&state.db)
            .await?;
    for tag in tags {
        if !existing
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(tag))
        {
            return Err(AppError::BadRequest(format!(
                "Tag '{}' does not exist. Create it before assigning it to a device.",
                tag
            )));
        }
    }
    Ok(())
}

async fn ensure_site_exists(state: &AppState, site: Option<&str>) -> Result<()> {
    let Some(site) = site else {
        return Ok(());
    };
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM device_sites WHERE name_key = $1)")
            .bind(site.to_lowercase())
            .fetch_one(&state.db)
            .await?;
    if !exists {
        return Err(AppError::BadRequest(format!(
            "Site '{}' does not exist. Create it before assigning it to a device.",
            site
        )));
    }
    Ok(())
}

async fn sync_device_tag_assignments(
    state: &AppState,
    device_id: Uuid,
    tags: &[String],
) -> Result<()> {
    sqlx::query("DELETE FROM device_tag_assignments WHERE device_id = $1")
        .bind(device_id)
        .execute(&state.db)
        .await?;

    if tags.is_empty() {
        return Ok(());
    }

    sqlx::query(
        "INSERT INTO device_tag_assignments (device_id, tag_id)
         SELECT $1, id FROM device_tags WHERE name_key = ANY($2)
         ON CONFLICT DO NOTHING",
    )
    .bind(device_id)
    .bind(
        tags.iter()
            .map(|tag| tag.to_lowercase())
            .collect::<Vec<_>>(),
    )
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn delete_device(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    let role = auth::require_not_viewer(&state, user_id).await?;
    if role != "admin" {
        let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?
            .ok_or(AppError::NotFound)?;
        let default_approvals = state.settings.read().await.default_required_approvals;
        sqlx::query(
            "INSERT INTO config_changes
                (id, device_id, title, description, config_diff, submitted_by, required_approvals)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(Uuid::new_v4())
        .bind(id)
        .bind(format!("Delete device {}", device.name))
        .bind(format!(
            "{} requested deletion of device {} ({}). Admins can force-delete after review.",
            claims.username, device.name, device.ip_address
        ))
        .bind(format!("DELETE_DEVICE {}", id))
        .bind(user_id)
        .bind(default_approvals.max(1))
        .execute(&state.db)
        .await?;
        return Ok(StatusCode::ACCEPTED);
    }

    let result = sqlx::query("DELETE FROM devices WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
struct ConnectionStep {
    label: String,
    ok: bool,
    detail: Option<String>,
}

#[derive(Serialize)]
struct ConnectionResult {
    success: bool,
    steps: Vec<ConnectionStep>,
}

async fn test_connection(
    State(state): State<AppState>,
    _claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<Json<ConnectionResult>> {
    let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let username = device.ssh_username.ok_or_else(|| {
        AppError::BadRequest("SSH credentials not configured for this device".to_string())
    })?;
    let password = device.ssh_password.ok_or_else(|| {
        AppError::BadRequest("SSH credentials not configured for this device".to_string())
    })?;
    let host = device.ip_address.clone();
    let port = device.ssh_port as u16;
    let ssh_options = device.ssh_options.clone();

    let raw_steps = tokio::task::spawn_blocking(move || {
        let target = crate::ssh::SshTarget {
            host: &host,
            port,
            username: &username,
            password: &password,
            ssh_options: ssh_options.as_deref(),
        };
        crate::ssh::test_connection_verbose(&target)
    })
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    let success = raw_steps.last().map(|s| s.ok).unwrap_or(false);
    let steps = raw_steps
        .into_iter()
        .map(|s| ConnectionStep {
            label: s.label,
            ok: s.ok,
            detail: s.detail,
        })
        .collect();

    Ok(Json(ConnectionResult { success, steps }))
}

async fn list_changes(
    State(state): State<AppState>,
    _claims: Claims,
    Path(device_id): Path<Uuid>,
) -> Result<Json<Vec<ConfigChangeWithUser>>> {
    let changes = sqlx::query_as::<_, ConfigChangeWithUser>(
        "SELECT
            cc.id, cc.device_id, cc.title, cc.description, cc.config_diff,
            NULL::text AS full_config,
            cc.status, cc.submitted_by, cc.required_approvals, cc.approval_count,
            cc.scheduled_at, cc.scheduled_by, cc.scheduled_save_as_golden, cc.batch_id,
            cc.deployed_at, NULL::text AS deployment_output, cc.created_at, cc.updated_at,
            d.name AS device_name,
            u.username AS submitted_by_username
         FROM config_changes cc
         JOIN devices d ON d.id = cc.device_id
         JOIN users u ON u.id = cc.submitted_by
         WHERE cc.device_id = $1
         ORDER BY cc.updated_at DESC",
    )
    .bind(device_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(changes))
}

async fn create_change(
    State(state): State<AppState>,
    claims: Claims,
    Path(device_id): Path<Uuid>,
    Json(req): Json<CreateChangeRequest>,
) -> Result<Json<ConfigChangeWithUser>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    sqlx::query("SELECT id FROM devices WHERE id = $1")
        .bind(device_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let default_approvals = state.settings.read().await.default_required_approvals;
    let required_approvals = req.required_approvals.unwrap_or(default_approvals).max(1);
    let scheduled_by = req.scheduled_at.map(|_| user_id);

    let change = sqlx::query_as::<_, ConfigChangeWithUser>(
        "WITH ins AS (
            INSERT INTO config_changes
                (id, device_id, title, description, config_diff, full_config, submitted_by,
                 required_approvals, scheduled_at, scheduled_by, scheduled_save_as_golden)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
         )
         SELECT
            ins.id, ins.device_id, ins.title, ins.description, ins.config_diff, ins.full_config,
            ins.status, ins.submitted_by, ins.required_approvals, ins.approval_count,
            ins.scheduled_at, ins.scheduled_by, ins.scheduled_save_as_golden, ins.batch_id,
            ins.deployed_at, ins.deployment_output, ins.created_at, ins.updated_at,
            d.name AS device_name,
            u.username AS submitted_by_username
         FROM ins
         JOIN devices d ON d.id = ins.device_id
         JOIN users u ON u.id = ins.submitted_by",
    )
    .bind(Uuid::new_v4())
    .bind(device_id)
    .bind(&req.title)
    .bind(&req.description)
    .bind(&req.config_diff)
    .bind(&req.full_config)
    .bind(user_id)
    .bind(required_approvals)
    .bind(req.scheduled_at)
    .bind(scheduled_by)
    .bind(req.scheduled_save_as_golden.unwrap_or(true))
    .fetch_one(&state.db)
    .await?;

    Ok(Json(change))
}

async fn list_golden_configs(
    State(state): State<AppState>,
    _claims: Claims,
    Path(device_id): Path<Uuid>,
) -> Result<Json<Vec<GoldenConfigWithUser>>> {
    let configs = sqlx::query_as::<_, GoldenConfigWithUser>(
        "SELECT
            gc.id, gc.device_id, gc.config, gc.version, gc.created_by, gc.created_at,
            u.username AS created_by_username
         FROM golden_configs gc
         LEFT JOIN users u ON u.id = gc.created_by
         WHERE gc.device_id = $1
         ORDER BY gc.version DESC",
    )
    .bind(device_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(configs))
}

async fn create_golden_config(
    State(state): State<AppState>,
    claims: Claims,
    Path(device_id): Path<Uuid>,
    Json(req): Json<CreateGoldenConfigRequest>,
) -> Result<Json<GoldenConfigWithUser>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let next_version: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM golden_configs WHERE device_id = $1",
    )
    .bind(device_id)
    .fetch_one(&state.db)
    .await?;

    let config = sqlx::query_as::<_, GoldenConfigWithUser>(
        "WITH ins AS (
            INSERT INTO golden_configs (id, device_id, config, version, created_by)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
         )
         SELECT
            gc.id, gc.device_id, gc.config, gc.version, gc.created_by, gc.created_at,
            u.username AS created_by_username
         FROM ins gc
         LEFT JOIN users u ON u.id = gc.created_by",
    )
    .bind(Uuid::new_v4())
    .bind(device_id)
    .bind(&req.config)
    .bind(next_version)
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;

    let max_golden = state.settings.read().await.max_golden_configs;
    sqlx::query(
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
    .bind(max_golden)
    .execute(&state.db)
    .await?;

    Ok(Json(config))
}

#[derive(Serialize)]
struct OnboardResult {
    config: String,
    version: i32,
}

async fn onboard_device(
    State(state): State<AppState>,
    claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<Json<OnboardResult>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let username = device.ssh_username.ok_or_else(|| {
        AppError::BadRequest("SSH credentials not configured for this device".to_string())
    })?;
    let password = device.ssh_password.ok_or_else(|| {
        AppError::BadRequest("SSH credentials not configured for this device".to_string())
    })?;
    let host = device.ip_address;
    let port = device.ssh_port as u16;
    let vendor = device.vendor.clone();
    let os = device.os.clone();
    let custom_command = device.config_pull_command.clone();
    let ssh_options = device.ssh_options.clone();
    let profiles = Arc::clone(&state.settings.read().await.vendor_profiles);

    let raw_config = tokio::task::spawn_blocking(move || {
        let target = crate::ssh::SshTarget {
            host: &host,
            port,
            username: &username,
            password: &password,
            ssh_options: ssh_options.as_deref(),
        };
        crate::ssh::pull_running_config(&target, &vendor, &os, custom_command.as_deref(), &profiles)
    })
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
    .map_err(AppError::SshError)?;

    // Save as next golden config version
    let next_version: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM golden_configs WHERE device_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    sqlx::query(
        "INSERT INTO golden_configs (id, device_id, config, version, created_by)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(id)
    .bind(&raw_config)
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
    .bind(id)
    .bind(max_golden)
    .execute(&state.db)
    .await?;

    Ok(Json(OnboardResult {
        config: raw_config,
        version: next_version,
    }))
}

#[derive(Deserialize)]
struct RevertQuery {
    token: String,
    golden_config_id: Option<Uuid>,
}

async fn revert_to_golden(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(query): Query<RevertQuery>,
) -> Result<impl axum::response::IntoResponse> {
    let claims = crate::auth::verify_token(&query.token, &state.config.jwt_secret)
        .map_err(|_| AppError::Unauthorized)?;
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    auth::require_not_viewer(&state, user_id).await?;

    let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let golden = if let Some(gc_id) = query.golden_config_id {
        sqlx::query_as::<_, GoldenConfigWithUser>(
            "SELECT gc.id, gc.device_id, gc.config, gc.version, gc.created_by,
                    u.username AS created_by_username, gc.created_at
             FROM golden_configs gc
             LEFT JOIN users u ON u.id = gc.created_by
             WHERE gc.id = $1 AND gc.device_id = $2",
        )
        .bind(gc_id)
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::BadRequest("Golden config version not found".to_string()))?
    } else {
        sqlx::query_as::<_, GoldenConfigWithUser>(
            "SELECT gc.id, gc.device_id, gc.config, gc.version, gc.created_by,
                    u.username AS created_by_username, gc.created_at
             FROM golden_configs gc
             LEFT JOIN users u ON u.id = gc.created_by
             WHERE gc.device_id = $1
             ORDER BY gc.version DESC
             LIMIT 1",
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| {
            AppError::BadRequest("No golden config exists for this device".to_string())
        })?
    };

    let max_version = sqlx::query_scalar::<_, i32>(
        "SELECT COALESCE(MAX(version), 0) FROM golden_configs WHERE device_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    let is_latest_golden = golden.version == max_version;

    Ok(ws.on_upgrade(move |socket| {
        run_revert(socket, state, id, user_id, device, golden, is_latest_golden)
    }))
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

async fn run_revert(
    mut socket: WebSocket,
    state: AppState,
    device_id: Uuid,
    user_id: Uuid,
    device: Device,
    golden: GoldenConfigWithUser,
    is_latest_golden: bool,
) {
    let username = match device.ssh_username.clone() {
        Some(u) => u,
        None => {
            let _ = socket
                .send(Message::Text(
                    r#"{"type":"error","message":"SSH credentials not configured"}"#.to_string(),
                ))
                .await;
            return;
        }
    };
    let password = match device.ssh_password.clone() {
        Some(p) => p,
        None => {
            let _ = socket
                .send(Message::Text(
                    r#"{"type":"error","message":"SSH password not configured"}"#.to_string(),
                ))
                .await;
            return;
        }
    };

    lock_device(&state, device_id).await;

    let host = device.ip_address.clone();
    let port = device.ssh_port as u16;
    let vendor = device.vendor.clone();
    let os = device.os.clone();
    let ssh_options = device.ssh_options.clone();
    let config = golden.config.clone();
    let profiles = Arc::clone(&state.settings.read().await.vendor_profiles);

    let (chunk_tx, mut chunk_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    let ssh_handle = tokio::task::spawn_blocking(move || {
        let target = crate::ssh::SshTarget {
            host: &host,
            port,
            username: &username,
            password: &password,
            ssh_options: ssh_options.as_deref(),
        };
        crate::ssh::replace_config_streaming(&target, &config, &vendor, &os, &profiles, chunk_tx)
    });

    // Stream chunks to the WebSocket as they arrive
    while let Some(chunk) = chunk_rx.recv().await {
        let msg = serde_json::json!({"type": "output", "chunk": chunk}).to_string();
        if socket.send(Message::Text(msg)).await.is_err() {
            unlock_device(&state, device_id).await;
            return;
        }
    }

    let result = match ssh_handle.await {
        Ok(r) => r,
        Err(e) => Err(e.to_string()),
    };

    let (status, output, deployed) = match result {
        Ok(out) => ("deployed", out, true),
        Err(err) => {
            unlock_device(&state, device_id).await;
            ("failed", err, false)
        }
    };

    // On success: pull the running config and save it as the new golden config.
    // Skip when reverting to the latest golden , the baseline is already correct.
    if deployed && !is_latest_golden {
        let host2 = device.ip_address.clone();
        let port2 = device.ssh_port as u16;
        let vendor2 = device.vendor.clone();
        let os2 = device.os.clone();
        let ssh_options2 = device.ssh_options.clone();
        let username2 = device.ssh_username.clone().unwrap_or_default();
        let password2 = device.ssh_password.clone().unwrap_or_default();
        let profiles2 = Arc::clone(&state.settings.read().await.vendor_profiles);
        let custom_cmd2 = device.config_pull_command.clone();

        let _ = socket
            .send(Message::Text(
                serde_json::json!({"type":"output","chunk":"\n[themis] Pulling running config to save as new golden...\n"}).to_string(),
            ))
            .await;

        let pull_result = tokio::task::spawn_blocking(move || {
            let target = crate::ssh::SshTarget {
                host: &host2,
                port: port2,
                username: &username2,
                password: &password2,
                ssh_options: ssh_options2.as_deref(),
            };
            crate::ssh::pull_running_config(
                &target,
                &vendor2,
                &os2,
                custom_cmd2.as_deref(),
                &profiles2,
            )
        })
        .await;

        match pull_result {
            Ok(Ok(new_config)) => {
                let next_version = sqlx::query_scalar::<_, i32>(
                    "SELECT COALESCE(MAX(version), 0) + 1 FROM golden_configs WHERE device_id = $1",
                )
                .bind(device_id)
                .fetch_one(&state.db)
                .await;

                if let Ok(version) = next_version {
                    let _ = sqlx::query(
                        "INSERT INTO golden_configs (id, device_id, config, version, created_by)
                         VALUES ($1, $2, $3, $4, $5)",
                    )
                    .bind(Uuid::new_v4())
                    .bind(device_id)
                    .bind(&new_config)
                    .bind(version)
                    .bind(user_id)
                    .execute(&state.db)
                    .await;

                    let max_golden = state.settings.read().await.max_golden_configs;
                    let _ = sqlx::query(
                        "DELETE FROM golden_configs
                         WHERE device_id = $1
                           AND id NOT IN (
                               SELECT id FROM golden_configs WHERE device_id = $1
                               ORDER BY version DESC LIMIT $2
                           )",
                    )
                    .bind(device_id)
                    .bind(max_golden)
                    .execute(&state.db)
                    .await;

                    let _ = socket
                        .send(Message::Text(
                            serde_json::json!({"type":"output","chunk":format!("[themis] Saved running config as golden v{}.\n", version)}).to_string(),
                        ))
                        .await;
                }
            }
            _ => {
                let _ = socket
                    .send(Message::Text(
                        serde_json::json!({"type":"output","chunk":"[themis] Warning: config was applied but could not pull running config for golden snapshot.\n"}).to_string(),
                    ))
                    .await;
            }
        }
    }

    unlock_device(&state, device_id).await;

    let title = format!(
        "Revert {} to golden config v{}",
        device.name, golden.version
    );
    let description = format!(
        "Golden config v{} was loaded as a full-config replace on {} by request.",
        golden.version, device.name
    );
    let config_diff = format!("Revert to golden config v{}", golden.version);

    let change_result = sqlx::query_as::<_, ConfigChangeWithUser>(
        "WITH ins AS (
            INSERT INTO config_changes
                (id, device_id, title, description, config_diff, full_config,
                 status, submitted_by, required_approvals, approval_count,
                 deployed_at, deployment_output)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 1,
                    CASE WHEN $9 THEN NOW() ELSE NULL END, $10)
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
    .bind(&title)
    .bind(&description)
    .bind(&config_diff)
    .bind(&golden.config)
    .bind(status)
    .bind(user_id)
    .bind(deployed)
    .bind(&output)
    .fetch_one(&state.db)
    .await;

    if deployed {
        let _ = sqlx::query(
            "UPDATE config_drift SET status = 'auto_resolved', resolved_at = NOW()
             WHERE device_id = $1 AND status = 'open'",
        )
        .bind(device_id)
        .execute(&state.db)
        .await;
    }

    let done_msg = match change_result {
        Ok(change) => serde_json::json!({
            "type": "done",
            "ok": deployed,
            "change": change,
        }),
        Err(_) => serde_json::json!({
            "type": "done",
            "ok": deployed,
        }),
    };
    let _ = socket.send(Message::Text(done_msg.to_string())).await;
}

#[derive(Serialize)]
struct DeviceHealthResult {
    device_id: Uuid,
    reachable: bool,
    latency_ms: Option<u64>,
    error: Option<String>,
    checked_at: chrono::DateTime<Utc>,
}

async fn health_check_all(
    State(state): State<AppState>,
    _claims: Claims,
) -> Result<Json<Vec<DeviceHealthResult>>> {
    let devices = sqlx::query_as::<_, Device>("SELECT * FROM devices")
        .fetch_all(&state.db)
        .await?;

    let concurrency = state.settings.read().await.health_check_concurrency;
    let limiter = Arc::new(Semaphore::new(concurrency));
    let mut handles = Vec::with_capacity(devices.len());
    for device in devices {
        let limiter = Arc::clone(&limiter);
        handles.push(tokio::spawn(async move {
            let Ok(_permit) = limiter.acquire_owned().await else {
                return None;
            };
            tokio::task::spawn_blocking(move || check_device_health(device))
                .await
                .ok()
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        if let Ok(Some(r)) = handle.await {
            results.push(r);
        }
    }

    Ok(Json(results))
}

async fn health_check_one(
    State(state): State<AppState>,
    _claims: Claims,
    Path(id): Path<Uuid>,
) -> Result<Json<DeviceHealthResult>> {
    let device = sqlx::query_as::<_, Device>("SELECT * FROM devices WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let result = tokio::task::spawn_blocking(move || check_device_health(device))
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    Ok(Json(result))
}

fn check_device_health(device: Device) -> DeviceHealthResult {
    let id = device.id;
    let now = Utc::now();

    // If credentials are configured, do a full SSH auth check so that
    // a reachable port with wrong credentials is correctly reported as unhealthy.
    match (device.ssh_username, device.ssh_password) {
        (Some(username), Some(password)) => {
            let start = std::time::Instant::now();
            let target = crate::ssh::SshTarget {
                host: &device.ip_address,
                port: device.ssh_port as u16,
                username: &username,
                password: &password,
                ssh_options: device.ssh_options.as_deref(),
            };
            match crate::ssh::test_connection(&target) {
                Ok(()) => DeviceHealthResult {
                    device_id: id,
                    reachable: true,
                    latency_ms: Some(start.elapsed().as_millis() as u64),
                    error: None,
                    checked_at: now,
                },
                Err(e) => DeviceHealthResult {
                    device_id: id,
                    reachable: false,
                    latency_ms: None,
                    error: Some(e),
                    checked_at: now,
                },
            }
        }
        // No credentials , fall back to TCP probe only.
        _ => {
            let (reachable, latency_ms, error) =
                crate::ssh::probe_tcp(&device.ip_address, device.ssh_port as u16);
            DeviceHealthResult {
                device_id: id,
                reachable,
                latency_ms,
                error,
                checked_at: now,
            }
        }
    }
}
