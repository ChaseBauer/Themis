use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::AdminClaims,
    directory_auth::DirectoryRoleMappings,
    error::{AppError, Result},
    models::user::UserPublic,
    settings::AppSettings,
    vendor_profiles::{VendorProfileView, VendorProfiles},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/users", get(list_users))
        .route("/users/:id/role", put(update_user_role))
        .route("/settings", get(get_settings).put(update_settings))
}

async fn list_users(
    State(state): State<AppState>,
    _admin: AdminClaims,
) -> Result<Json<Vec<UserPublic>>> {
    let users = sqlx::query_as::<_, UserPublic>(
        "SELECT id, username, email, role FROM users ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(users))
}

#[derive(Deserialize)]
struct UpdateRoleRequest {
    role: String,
}

async fn update_user_role(
    State(state): State<AppState>,
    admin: AdminClaims,
    Path(user_id): Path<Uuid>,
    Json(req): Json<UpdateRoleRequest>,
) -> Result<Json<UserPublic>> {
    if !matches!(req.role.as_str(), "admin" | "engineer" | "viewer") {
        return Err(AppError::BadRequest(
            "Role must be 'admin', 'engineer', or 'viewer'".to_string(),
        ));
    }

    let admin_id = Uuid::parse_str(&admin.0.sub).map_err(|_| AppError::Unauthorized)?;
    if user_id == admin_id && req.role != "admin" {
        return Err(AppError::BadRequest(
            "Cannot remove your own admin role".to_string(),
        ));
    }

    let user = sqlx::query_as::<_, UserPublic>(
        "UPDATE users SET role = $2 WHERE id = $1 RETURNING id, username, email, role",
    )
    .bind(user_id)
    .bind(&req.role)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(user))
}

#[derive(Serialize)]
pub struct SettingsResponse {
    pub max_golden_configs: i64,
    pub default_required_approvals: i32,
    pub batch_deploy_concurrency: i32,
    pub rollback_guard_minutes: u64,
    pub vendor_profiles_toml: String,
    pub vendor_profiles: Vec<VendorProfileView>,
    pub drift_check_interval_secs: u64,
    pub drift_check_concurrency: usize,
    pub health_check_concurrency: usize,
    pub ad_enabled: bool,
    pub ad_url: String,
    pub ad_bind_dn: String,
    pub ad_bind_password_configured: bool,
    pub ad_base_dn: String,
    pub ad_user_filter: String,
    pub ad_group_attribute: String,
    pub ad_default_role: String,
    pub ad_role_mappings_toml: String,
    pub oauth_enabled: bool,
    pub oauth_provider_name: String,
    pub oauth_authorize_url: String,
    pub oauth_token_url: String,
    pub oauth_userinfo_url: String,
    pub oauth_client_id: String,
    pub oauth_client_secret_configured: bool,
    pub oauth_redirect_url: String,
    pub oauth_scopes: String,
    pub oauth_username_claim: String,
    pub oauth_email_claim: String,
    pub oauth_role_claim: String,
    pub oauth_default_role: String,
    pub oauth_role_mappings_toml: String,
}

impl From<&AppSettings> for SettingsResponse {
    fn from(s: &AppSettings) -> Self {
        SettingsResponse {
            max_golden_configs: s.max_golden_configs,
            default_required_approvals: s.default_required_approvals,
            batch_deploy_concurrency: s.batch_deploy_concurrency,
            rollback_guard_minutes: s.rollback_guard_minutes,
            vendor_profiles_toml: s.vendor_profiles_toml.clone(),
            vendor_profiles: s.vendor_profiles.visible_profiles(),
            drift_check_interval_secs: s.drift_check_interval_secs,
            drift_check_concurrency: s.drift_check_concurrency,
            health_check_concurrency: s.health_check_concurrency,
            ad_enabled: s.ad_enabled,
            ad_url: s.ad_url.clone(),
            ad_bind_dn: s.ad_bind_dn.clone(),
            ad_bind_password_configured: !s.ad_bind_password.is_empty(),
            ad_base_dn: s.ad_base_dn.clone(),
            ad_user_filter: s.ad_user_filter.clone(),
            ad_group_attribute: s.ad_group_attribute.clone(),
            ad_default_role: s.ad_default_role.clone(),
            ad_role_mappings_toml: s.ad_role_mappings_toml.clone(),
            oauth_enabled: s.oauth_enabled,
            oauth_provider_name: s.oauth_provider_name.clone(),
            oauth_authorize_url: s.oauth_authorize_url.clone(),
            oauth_token_url: s.oauth_token_url.clone(),
            oauth_userinfo_url: s.oauth_userinfo_url.clone(),
            oauth_client_id: s.oauth_client_id.clone(),
            oauth_client_secret_configured: !s.oauth_client_secret.is_empty(),
            oauth_redirect_url: s.oauth_redirect_url.clone(),
            oauth_scopes: s.oauth_scopes.clone(),
            oauth_username_claim: s.oauth_username_claim.clone(),
            oauth_email_claim: s.oauth_email_claim.clone(),
            oauth_role_claim: s.oauth_role_claim.clone(),
            oauth_default_role: s.oauth_default_role.clone(),
            oauth_role_mappings_toml: s.oauth_role_mappings_toml.clone(),
        }
    }
}

async fn get_settings(
    State(state): State<AppState>,
    _admin: AdminClaims,
) -> Result<Json<SettingsResponse>> {
    let s = state.settings.read().await;
    Ok(Json(SettingsResponse::from(&*s)))
}

#[derive(Deserialize)]
struct UpdateSettingsRequest {
    max_golden_configs: Option<i64>,
    default_required_approvals: Option<i32>,
    batch_deploy_concurrency: Option<i32>,
    rollback_guard_minutes: Option<u64>,
    vendor_profiles_toml: Option<String>,
    drift_check_interval_secs: Option<u64>,
    drift_check_concurrency: Option<usize>,
    health_check_concurrency: Option<usize>,
    ad_enabled: Option<bool>,
    ad_url: Option<String>,
    ad_bind_dn: Option<String>,
    ad_bind_password: Option<String>,
    ad_base_dn: Option<String>,
    ad_user_filter: Option<String>,
    ad_group_attribute: Option<String>,
    ad_default_role: Option<String>,
    ad_role_mappings_toml: Option<String>,
    oauth_enabled: Option<bool>,
    oauth_provider_name: Option<String>,
    oauth_authorize_url: Option<String>,
    oauth_token_url: Option<String>,
    oauth_userinfo_url: Option<String>,
    oauth_client_id: Option<String>,
    oauth_client_secret: Option<String>,
    oauth_redirect_url: Option<String>,
    oauth_scopes: Option<String>,
    oauth_username_claim: Option<String>,
    oauth_email_claim: Option<String>,
    oauth_role_claim: Option<String>,
    oauth_default_role: Option<String>,
    oauth_role_mappings_toml: Option<String>,
}

async fn update_settings(
    State(state): State<AppState>,
    _admin: AdminClaims,
    Json(req): Json<UpdateSettingsRequest>,
) -> Result<Json<SettingsResponse>> {
    if let Some(ref toml_str) = req.vendor_profiles_toml {
        let rollback_minutes = req.rollback_guard_minutes.unwrap_or(2).clamp(1, 60);
        if !toml_str.is_empty()
            && VendorProfiles::from_toml_str(toml_str, rollback_minutes).is_none()
        {
            return Err(AppError::BadRequest(
                "Invalid vendor profiles TOML".to_string(),
            ));
        }
    }
    if let Some(ref toml_str) = req.ad_role_mappings_toml {
        DirectoryRoleMappings::parse(toml_str).map_err(|e| AppError::BadRequest(e.to_string()))?;
    }
    if let Some(ref toml_str) = req.oauth_role_mappings_toml {
        DirectoryRoleMappings::parse(toml_str).map_err(|e| AppError::BadRequest(e.to_string()))?;
    }
    if let Some(ref role) = req.ad_default_role {
        if !matches!(role.as_str(), "admin" | "engineer" | "viewer") {
            return Err(AppError::BadRequest(
                "ad_default_role must be 'admin', 'engineer', or 'viewer'".to_string(),
            ));
        }
    }
    if let Some(ref role) = req.oauth_default_role {
        if !matches!(role.as_str(), "admin" | "engineer" | "viewer") {
            return Err(AppError::BadRequest(
                "oauth_default_role must be 'admin', 'engineer', or 'viewer'".to_string(),
            ));
        }
    }

    let upsert = "INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
                  ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()";

    if let Some(v) = req.max_golden_configs {
        if v < 1 {
            return Err(AppError::BadRequest(
                "max_golden_configs must be at least 1".to_string(),
            ));
        }
        sqlx::query(upsert)
            .bind("max_golden_configs")
            .bind(v.to_string())
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = req.default_required_approvals {
        if v < 1 {
            return Err(AppError::BadRequest(
                "default_required_approvals must be at least 1".to_string(),
            ));
        }
        sqlx::query(upsert)
            .bind("default_required_approvals")
            .bind(v.to_string())
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = req.batch_deploy_concurrency {
        if !(1..=50).contains(&v) {
            return Err(AppError::BadRequest(
                "batch_deploy_concurrency must be between 1 and 50".to_string(),
            ));
        }
        sqlx::query(upsert)
            .bind("batch_deploy_concurrency")
            .bind(v.to_string())
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = req.rollback_guard_minutes {
        if !(1..=60).contains(&v) {
            return Err(AppError::BadRequest(
                "rollback_guard_minutes must be between 1 and 60".to_string(),
            ));
        }
        sqlx::query(upsert)
            .bind("rollback_guard_minutes")
            .bind(v.to_string())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.vendor_profiles_toml {
        sqlx::query(upsert)
            .bind("vendor_profiles_toml")
            .bind(v)
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = req.drift_check_interval_secs {
        if v < 10 {
            return Err(AppError::BadRequest(
                "drift_check_interval_secs must be at least 10".to_string(),
            ));
        }
        sqlx::query(upsert)
            .bind("drift_check_interval_secs")
            .bind(v.to_string())
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = req.drift_check_concurrency {
        if !(1..=100).contains(&v) {
            return Err(AppError::BadRequest(
                "drift_check_concurrency must be between 1 and 100".to_string(),
            ));
        }
        sqlx::query(upsert)
            .bind("drift_check_concurrency")
            .bind(v.to_string())
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = req.health_check_concurrency {
        if !(1..=200).contains(&v) {
            return Err(AppError::BadRequest(
                "health_check_concurrency must be between 1 and 200".to_string(),
            ));
        }
        sqlx::query(upsert)
            .bind("health_check_concurrency")
            .bind(v.to_string())
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = req.ad_enabled {
        sqlx::query(upsert)
            .bind("ad_enabled")
            .bind(v.to_string())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.ad_url {
        sqlx::query(upsert)
            .bind("ad_url")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.ad_bind_dn {
        sqlx::query(upsert)
            .bind("ad_bind_dn")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.ad_bind_password {
        if !v.is_empty() {
            sqlx::query(upsert)
                .bind("ad_bind_password")
                .bind(v)
                .execute(&state.db)
                .await?;
        }
    }
    if let Some(ref v) = req.ad_base_dn {
        sqlx::query(upsert)
            .bind("ad_base_dn")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.ad_user_filter {
        if v.trim().is_empty() || !v.contains("{username}") {
            return Err(AppError::BadRequest(
                "ad_user_filter must include {username}".to_string(),
            ));
        }
        sqlx::query(upsert)
            .bind("ad_user_filter")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.ad_group_attribute {
        if v.trim().is_empty() {
            return Err(AppError::BadRequest(
                "ad_group_attribute cannot be empty".to_string(),
            ));
        }
        sqlx::query(upsert)
            .bind("ad_group_attribute")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.ad_default_role {
        sqlx::query(upsert)
            .bind("ad_default_role")
            .bind(v)
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.ad_role_mappings_toml {
        sqlx::query(upsert)
            .bind("ad_role_mappings_toml")
            .bind(v)
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = req.oauth_enabled {
        sqlx::query(upsert)
            .bind("oauth_enabled")
            .bind(v.to_string())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_provider_name {
        sqlx::query(upsert)
            .bind("oauth_provider_name")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_authorize_url {
        sqlx::query(upsert)
            .bind("oauth_authorize_url")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_token_url {
        sqlx::query(upsert)
            .bind("oauth_token_url")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_userinfo_url {
        sqlx::query(upsert)
            .bind("oauth_userinfo_url")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_client_id {
        sqlx::query(upsert)
            .bind("oauth_client_id")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_client_secret {
        if !v.is_empty() {
            sqlx::query(upsert)
                .bind("oauth_client_secret")
                .bind(v)
                .execute(&state.db)
                .await?;
        }
    }
    if let Some(ref v) = req.oauth_redirect_url {
        sqlx::query(upsert)
            .bind("oauth_redirect_url")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_scopes {
        sqlx::query(upsert)
            .bind("oauth_scopes")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_username_claim {
        sqlx::query(upsert)
            .bind("oauth_username_claim")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_email_claim {
        sqlx::query(upsert)
            .bind("oauth_email_claim")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_role_claim {
        sqlx::query(upsert)
            .bind("oauth_role_claim")
            .bind(v.trim())
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_default_role {
        sqlx::query(upsert)
            .bind("oauth_default_role")
            .bind(v)
            .execute(&state.db)
            .await?;
    }
    if let Some(ref v) = req.oauth_role_mappings_toml {
        sqlx::query(upsert)
            .bind("oauth_role_mappings_toml")
            .bind(v)
            .execute(&state.db)
            .await?;
    }

    let new_settings = AppSettings::load_from_db(&state.db).await;
    let response = SettingsResponse::from(&new_settings);
    *state.settings.write().await = new_settings;

    Ok(Json(response))
}
