use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod config;
mod directory_auth;
pub mod drift_checker;
mod error;
mod models;
mod oauth_auth;
mod routes;
mod scheduler;
pub mod settings;
pub mod ssh;
pub mod vendor_profiles;

use config::Config;
use settings::AppSettings;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub config: Arc<Config>,
    pub settings: Arc<RwLock<AppSettings>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "themis_backend=debug,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env()?;

    let db = PgPoolOptions::new()
        .max_connections(20)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!("./migrations").run(&db).await?;

    let settings = AppSettings::load_from_db(&db).await;

    let state = AppState {
        db,
        config: Arc::new(config),
        settings: Arc::new(RwLock::new(settings)),
    };
    scheduler::start(state.clone());
    drift_checker::start(state.clone());

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = axum::Router::new()
        .nest("/api", routes::api_router(state))
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let addr = "0.0.0.0:8080";
    tracing::info!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
