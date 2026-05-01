use axum::{
    extract::{Query, State},
    response::Redirect,
    routing::{get, post, put},
    Json, Router,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::{create_token, Claims},
    directory_auth,
    error::{AppError, Result},
    models::user::{
        AuthResponse, ChangePasswordRequest, LoginRequest, RegisterRequest, User, UserPublic,
    },
    oauth_auth, AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/me", get(me))
        .route("/password", put(change_password))
        .route("/oauth/config", get(oauth_config))
        .route("/oauth/start", get(oauth_start))
        .route("/oauth/callback", get(oauth_callback))
}

#[derive(Serialize)]
struct OAuthConfigResponse {
    enabled: bool,
    provider_name: String,
}

async fn oauth_config(State(state): State<AppState>) -> Result<Json<OAuthConfigResponse>> {
    let settings = state.settings.read().await;
    Ok(Json(OAuthConfigResponse {
        enabled: settings.oauth_enabled,
        provider_name: settings.oauth_provider_name.clone(),
    }))
}

async fn oauth_start(State(state): State<AppState>) -> Result<Redirect> {
    let settings = state.settings.read().await.clone();
    let url = oauth_auth::authorize_url(&settings, &state.config.jwt_secret).map_err(|e| {
        tracing::warn!("OAuth start failed: {:?}", e);
        AppError::BadRequest("OAuth is not configured".to_string())
    })?;
    Ok(Redirect::temporary(&url))
}

#[derive(Deserialize)]
struct OAuthCallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

async fn oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<Redirect> {
    if let Some(error) = query.error {
        return Ok(Redirect::temporary(&format!(
            "/oauth/callback?error={}",
            urlencoding::encode(&error)
        )));
    }

    let code = query.code.ok_or(AppError::Unauthorized)?;
    let oauth_state = query.state.ok_or(AppError::Unauthorized)?;
    let settings = state.settings.read().await.clone();
    let auth = oauth_auth::complete_login(
        &state.db,
        &settings,
        &state.config.jwt_secret,
        &code,
        &oauth_state,
    )
    .await
    .map_err(|e| {
        tracing::warn!("OAuth callback failed: {:?}", e);
        AppError::Unauthorized
    })?;

    let user = serde_json::to_string(&auth.user)
        .map_err(|e| AppError::BadRequest(format!("Could not encode user: {}", e)))?;
    Ok(Redirect::temporary(&format!(
        "/oauth/callback?token={}&user={}",
        urlencoding::encode(&auth.token),
        urlencoding::encode(&user)
    )))
}

async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>> {
    let password_hash = hash(&req.password, DEFAULT_COST)?;

    let user_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);
    let role = if user_count == 0 { "admin" } else { "engineer" };

    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (id, username, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *",
    )
    .bind(Uuid::new_v4())
    .bind(&req.username)
    .bind(&req.email)
    .bind(&password_hash)
    .bind(role)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if e.to_string().contains("unique") || e.to_string().contains("duplicate") {
            AppError::BadRequest("Username or email already exists".to_string())
        } else {
            AppError::Database(e)
        }
    })?;

    let token = create_token(
        user.id,
        &user.username,
        &user.role,
        &state.config.jwt_secret,
    )?;

    Ok(Json(AuthResponse {
        token,
        user: user.into(),
    }))
}

async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = $1")
        .bind(&req.username)
        .fetch_optional(&state.db)
        .await?;

    if let Some(user) = user {
        if verify(&req.password, &user.password_hash)? {
            let token = create_token(
                user.id,
                &user.username,
                &user.role,
                &state.config.jwt_secret,
            )?;

            return Ok(Json(AuthResponse {
                token,
                user: user.into(),
            }));
        }
    }

    let settings = state.settings.read().await.clone();
    let Some(directory_user) =
        directory_auth::authenticate(&settings, &req.username, &req.password)
            .await
            .map_err(|e| {
                tracing::warn!("Directory login failed for {}: {:?}", req.username, e);
                AppError::Unauthorized
            })?
    else {
        return Err(AppError::Unauthorized);
    };

    let disabled_local_password = hash(Uuid::new_v4().to_string(), DEFAULT_COST)?;
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (id, username, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO UPDATE
         SET email = EXCLUDED.email, role = EXCLUDED.role
         RETURNING *",
    )
    .bind(Uuid::new_v4())
    .bind(&directory_user.username)
    .bind(&directory_user.email)
    .bind(&disabled_local_password)
    .bind(&directory_user.role)
    .fetch_one(&state.db)
    .await?;

    let token = create_token(
        user.id,
        &user.username,
        &user.role,
        &state.config.jwt_secret,
    )?;

    Ok(Json(AuthResponse {
        token,
        user: user.into(),
    }))
}

async fn me(State(state): State<AppState>, claims: Claims) -> Result<Json<UserPublic>> {
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(user.into()))
}

async fn change_password(
    State(state): State<AppState>,
    claims: Claims,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<Json<UserPublic>> {
    if req.new_password.len() < 8 {
        return Err(AppError::BadRequest(
            "New password must be at least 8 characters".to_string(),
        ));
    }

    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    if !verify(&req.current_password, &user.password_hash)? {
        return Err(AppError::BadRequest(
            "Current password is incorrect".to_string(),
        ));
    }

    let password_hash = hash(&req.new_password, DEFAULT_COST)?;

    let user =
        sqlx::query_as::<_, User>("UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING *")
            .bind(user_id)
            .bind(&password_hash)
            .fetch_one(&state.db)
            .await?;

    Ok(Json(user.into()))
}
