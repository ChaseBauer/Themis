use anyhow::{anyhow, Context, Result};
use bcrypt::{hash, DEFAULT_COST};
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::{create_token, verify_token},
    directory_auth::DirectoryRoleMappings,
    models::user::{AuthResponse, User, UserPublic},
    settings::AppSettings,
};

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    token_type: Option<String>,
}

pub fn authorize_url(settings: &AppSettings, jwt_secret: &str) -> Result<String> {
    validate_settings(settings)?;
    let state = create_token(Uuid::new_v4(), "oauth-state", "oauth", jwt_secret)?;
    let mut url = reqwest::Url::parse(&settings.oauth_authorize_url)
        .context("invalid OAuth authorize URL")?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &settings.oauth_client_id)
        .append_pair("redirect_uri", &settings.oauth_redirect_url)
        .append_pair("scope", &settings.oauth_scopes)
        .append_pair("state", &state);
    Ok(url.to_string())
}

pub async fn complete_login(
    db: &sqlx::PgPool,
    settings: &AppSettings,
    jwt_secret: &str,
    code: &str,
    state: &str,
) -> Result<AuthResponse> {
    validate_settings(settings)?;
    verify_token(state, jwt_secret).context("invalid OAuth state")?;

    let client = Client::new();
    let token = client
        .post(&settings.oauth_token_url)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", &settings.oauth_redirect_url),
            ("client_id", &settings.oauth_client_id),
            ("client_secret", &settings.oauth_client_secret),
        ])
        .send()
        .await
        .context("OAuth token request failed")?
        .error_for_status()
        .context("OAuth token request rejected")?
        .json::<TokenResponse>()
        .await
        .context("OAuth token response was invalid")?;

    let bearer = token
        .token_type
        .as_deref()
        .unwrap_or("Bearer")
        .eq_ignore_ascii_case("bearer");
    if !bearer {
        return Err(anyhow!("OAuth provider returned an unsupported token type"));
    }

    let profile = client
        .get(&settings.oauth_userinfo_url)
        .bearer_auth(&token.access_token)
        .send()
        .await
        .context("OAuth userinfo request failed")?
        .error_for_status()
        .context("OAuth userinfo request rejected")?
        .json::<Value>()
        .await
        .context("OAuth userinfo response was invalid")?;

    let username = claim_string(&profile, &settings.oauth_username_claim)
        .or_else(|| claim_string(&profile, "preferred_username"))
        .or_else(|| claim_string(&profile, "email"))
        .or_else(|| claim_string(&profile, "sub"))
        .ok_or_else(|| anyhow!("OAuth profile did not include a usable username"))?;
    let email = claim_string(&profile, &settings.oauth_email_claim)
        .or_else(|| claim_string(&profile, "email"))
        .unwrap_or_else(|| username.clone());
    let groups = claim_values(&profile, &settings.oauth_role_claim);
    let mappings = DirectoryRoleMappings::parse(&settings.oauth_role_mappings_toml)?;
    let role = mappings.role_for_groups(&groups, &settings.oauth_default_role);

    let disabled_local_password = hash(Uuid::new_v4().to_string(), DEFAULT_COST)?;
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (id, username, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO UPDATE
         SET email = EXCLUDED.email, role = EXCLUDED.role
         RETURNING *",
    )
    .bind(Uuid::new_v4())
    .bind(&username)
    .bind(&email)
    .bind(&disabled_local_password)
    .bind(&role)
    .fetch_one(db)
    .await?;

    let token = create_token(user.id, &user.username, &user.role, jwt_secret)?;

    Ok(AuthResponse {
        token,
        user: UserPublic::from(user),
    })
}

fn validate_settings(settings: &AppSettings) -> Result<()> {
    if !settings.oauth_enabled {
        return Err(anyhow!("OAuth is disabled"));
    }
    for (label, value) in [
        ("authorize URL", &settings.oauth_authorize_url),
        ("token URL", &settings.oauth_token_url),
        ("userinfo URL", &settings.oauth_userinfo_url),
        ("client ID", &settings.oauth_client_id),
        ("client secret", &settings.oauth_client_secret),
        ("redirect URL", &settings.oauth_redirect_url),
    ] {
        if value.trim().is_empty() {
            return Err(anyhow!("OAuth {} is required", label));
        }
    }
    Ok(())
}

fn claim_string(profile: &Value, claim: &str) -> Option<String> {
    profile.get(claim).and_then(|value| match value {
        Value::String(s) if !s.trim().is_empty() => Some(s.clone()),
        _ => None,
    })
}

fn claim_values(profile: &Value, claim: &str) -> Vec<String> {
    match profile.get(claim) {
        Some(Value::String(s)) if !s.trim().is_empty() => vec![s.clone()],
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(|value| value.as_str().map(ToString::to_string))
            .collect(),
        _ => Vec::new(),
    }
}
