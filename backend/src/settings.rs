use std::sync::Arc;

use sqlx::PgPool;

use crate::vendor_profiles::VendorProfiles;

#[derive(Clone, Debug)]
pub struct AppSettings {
    pub max_golden_configs: i64,
    pub default_required_approvals: i32,
    pub batch_deploy_concurrency: i32,
    pub rollback_guard_minutes: u64,
    pub vendor_profiles_toml: String,
    pub vendor_profiles: Arc<VendorProfiles>,
    pub drift_check_interval_secs: u64,
    pub drift_check_concurrency: usize,
    pub health_check_concurrency: usize,
    pub ad_enabled: bool,
    pub ad_url: String,
    pub ad_bind_dn: String,
    pub ad_bind_password: String,
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
    pub oauth_client_secret: String,
    pub oauth_redirect_url: String,
    pub oauth_scopes: String,
    pub oauth_username_claim: String,
    pub oauth_email_claim: String,
    pub oauth_role_claim: String,
    pub oauth_default_role: String,
    pub oauth_role_mappings_toml: String,
}

impl AppSettings {
    pub async fn load_from_db(db: &PgPool) -> Self {
        let rows: Vec<(String, String)> = sqlx::query_as("SELECT key, value FROM app_settings")
            .fetch_all(db)
            .await
            .unwrap_or_default();

        let mut max_golden_configs = 10i64;
        let mut default_required_approvals = 1i32;
        let mut batch_deploy_concurrency = 5i32;
        let mut rollback_guard_minutes = 2u64;
        let mut vendor_profiles_toml = String::new();
        let mut drift_check_interval_secs = 30u64;
        let mut drift_check_concurrency = 10usize;
        let mut health_check_concurrency = 25usize;
        let mut ad_enabled = false;
        let mut ad_url = String::new();
        let mut ad_bind_dn = String::new();
        let mut ad_bind_password = String::new();
        let mut ad_base_dn = String::new();
        let mut ad_user_filter = "(&(objectClass=user)(sAMAccountName={username}))".to_string();
        let mut ad_group_attribute = "memberOf".to_string();
        let mut ad_default_role = "viewer".to_string();
        let mut ad_role_mappings_toml = String::new();
        let mut oauth_enabled = false;
        let mut oauth_provider_name = "OAuth".to_string();
        let mut oauth_authorize_url = String::new();
        let mut oauth_token_url = String::new();
        let mut oauth_userinfo_url = String::new();
        let mut oauth_client_id = String::new();
        let mut oauth_client_secret = String::new();
        let mut oauth_redirect_url = "http://localhost/api/auth/oauth/callback".to_string();
        let mut oauth_scopes = "openid profile email".to_string();
        let mut oauth_username_claim = "preferred_username".to_string();
        let mut oauth_email_claim = "email".to_string();
        let mut oauth_role_claim = "groups".to_string();
        let mut oauth_default_role = "viewer".to_string();
        let mut oauth_role_mappings_toml = String::new();

        for (key, value) in rows {
            match key.as_str() {
                "max_golden_configs" => max_golden_configs = value.parse().unwrap_or(10),
                "default_required_approvals" => {
                    default_required_approvals = value.parse().unwrap_or(1)
                }
                "batch_deploy_concurrency" => batch_deploy_concurrency = value.parse().unwrap_or(5),
                "rollback_guard_minutes" => rollback_guard_minutes = value.parse().unwrap_or(2),
                "vendor_profiles_toml" => vendor_profiles_toml = value,
                "drift_check_interval_secs" => {
                    drift_check_interval_secs = value.parse().unwrap_or(30)
                }
                "drift_check_concurrency" => drift_check_concurrency = value.parse().unwrap_or(10),
                "health_check_concurrency" => {
                    health_check_concurrency = value.parse().unwrap_or(25)
                }
                "ad_enabled" => ad_enabled = matches!(value.as_str(), "true" | "1" | "yes"),
                "ad_url" => ad_url = value,
                "ad_bind_dn" => ad_bind_dn = value,
                "ad_bind_password" => ad_bind_password = value,
                "ad_base_dn" => ad_base_dn = value,
                "ad_user_filter" if !value.trim().is_empty() => ad_user_filter = value,
                "ad_group_attribute" if !value.trim().is_empty() => ad_group_attribute = value,
                "ad_default_role" => {
                    if matches!(value.as_str(), "admin" | "engineer" | "viewer") {
                        ad_default_role = value;
                    }
                }
                "ad_role_mappings_toml" => ad_role_mappings_toml = value,
                "oauth_enabled" => oauth_enabled = matches!(value.as_str(), "true" | "1" | "yes"),
                "oauth_provider_name" if !value.trim().is_empty() => oauth_provider_name = value,
                "oauth_authorize_url" => oauth_authorize_url = value,
                "oauth_token_url" => oauth_token_url = value,
                "oauth_userinfo_url" => oauth_userinfo_url = value,
                "oauth_client_id" => oauth_client_id = value,
                "oauth_client_secret" => oauth_client_secret = value,
                "oauth_redirect_url" if !value.trim().is_empty() => oauth_redirect_url = value,
                "oauth_scopes" if !value.trim().is_empty() => oauth_scopes = value,
                "oauth_username_claim" if !value.trim().is_empty() => oauth_username_claim = value,
                "oauth_email_claim" if !value.trim().is_empty() => oauth_email_claim = value,
                "oauth_role_claim" if !value.trim().is_empty() => oauth_role_claim = value,
                "oauth_default_role" => {
                    if matches!(value.as_str(), "admin" | "engineer" | "viewer") {
                        oauth_default_role = value;
                    }
                }
                "oauth_role_mappings_toml" => oauth_role_mappings_toml = value,
                _ => {}
            }
        }

        let rollback_guard_minutes = rollback_guard_minutes.clamp(1, 60);
        let vendor_profiles = if vendor_profiles_toml.is_empty() {
            VendorProfiles::builtin(rollback_guard_minutes)
        } else {
            VendorProfiles::from_toml_str(&vendor_profiles_toml, rollback_guard_minutes)
                .unwrap_or_else(|| VendorProfiles::builtin(rollback_guard_minutes))
        };

        AppSettings {
            max_golden_configs,
            default_required_approvals,
            batch_deploy_concurrency,
            rollback_guard_minutes,
            vendor_profiles_toml,
            vendor_profiles,
            drift_check_interval_secs,
            drift_check_concurrency: drift_check_concurrency.clamp(1, 100),
            health_check_concurrency: health_check_concurrency.clamp(1, 200),
            ad_enabled,
            ad_url,
            ad_bind_dn,
            ad_bind_password,
            ad_base_dn,
            ad_user_filter,
            ad_group_attribute,
            ad_default_role,
            ad_role_mappings_toml,
            oauth_enabled,
            oauth_provider_name,
            oauth_authorize_url,
            oauth_token_url,
            oauth_userinfo_url,
            oauth_client_id,
            oauth_client_secret,
            oauth_redirect_url,
            oauth_scopes,
            oauth_username_claim,
            oauth_email_claim,
            oauth_role_claim,
            oauth_default_role,
            oauth_role_mappings_toml,
        }
    }
}
