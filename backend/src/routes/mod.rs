use axum::{routing::get, Router};

use crate::AppState;

pub mod admin;
pub mod auth;
pub mod changes;
pub mod devices;
pub mod drift;
pub mod golden_configs;
pub mod stats;
pub mod terminal;
pub mod users;

pub fn api_router(state: AppState) -> Router {
    Router::new()
        .route("/stats", get(stats::get_stats))
        .nest("/auth", auth::router())
        .nest("/devices", devices::router())
        .nest("/changes", changes::router())
        .nest("/users", users::router())
        .nest("/admin", admin::router())
        .nest("/golden-configs", golden_configs::router())
        .nest("/drift", drift::router())
        .route("/devices/:id/drift", get(drift::get_for_device))
        .with_state(state)
}
