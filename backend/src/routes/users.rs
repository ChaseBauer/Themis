use axum::{extract::State, routing::get, Json, Router};

use crate::{
    auth::Claims,
    error::Result,
    models::user::{User, UserPublic},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list_users))
}

async fn list_users(
    State(state): State<AppState>,
    _claims: Claims,
) -> Result<Json<Vec<UserPublic>>> {
    let users = sqlx::query_as::<_, User>("SELECT * FROM users ORDER BY username ASC")
        .fetch_all(&state.db)
        .await?
        .into_iter()
        .map(UserPublic::from)
        .collect();

    Ok(Json(users))
}
