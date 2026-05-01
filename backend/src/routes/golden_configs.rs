use axum::{extract::State, http::header, response::Response, routing::get, Router};
use std::io::Write;

use crate::{
    auth::Claims,
    error::{AppError, Result},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/export", get(export))
}

async fn export(State(state): State<AppState>, _claims: Claims) -> Result<Response> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT DISTINCT ON (gc.device_id)
            d.name, gc.config
         FROM golden_configs gc
         JOIN devices d ON d.id = gc.device_id
         ORDER BY gc.device_id, gc.version DESC",
    )
    .fetch_all(&state.db)
    .await?;

    let zip_bytes = tokio::task::spawn_blocking(move || -> std::io::Result<Vec<u8>> {
        let cursor = std::io::Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(cursor);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for (name, config) in rows {
            let filename = format!("{}.conf", sanitize(&name));
            zip.start_file(filename, options)?;
            zip.write_all(config.as_bytes())?;
        }

        Ok(zip.finish()?.into_inner())
    })
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "application/zip")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"golden-configs.zip\"",
        )
        .body(axum::body::Body::from(zip_bytes))
        .unwrap())
}

fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect()
}
