use anyhow::{Context, Result};

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub max_golden_configs: i64,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Config {
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgresql://themis:themis@localhost:5432/themis".to_string()),
            jwt_secret: std::env::var("JWT_SECRET")
                .context("JWT_SECRET must be set before starting Themis")?,
            max_golden_configs: std::env::var("MAX_GOLDEN_CONFIGS")
                .unwrap_or_else(|_| "10".to_string())
                .parse()
                .unwrap_or(10),
        })
    }
}
