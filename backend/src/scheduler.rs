use std::time::Duration;

use uuid::Uuid;

use chrono::{DateTime, Utc};

use crate::AppState;

#[derive(sqlx::FromRow)]
struct ScheduledChange {
    device_id: Uuid,
    config_diff: String,
    scheduled_save_as_golden: bool,
    scheduled_by: Option<Uuid>,
    ip_address: String,
    ssh_port: i32,
    ssh_username: Option<String>,
    ssh_password: Option<String>,
    ssh_options: Option<String>,
    vendor: String,
    os: String,
    #[allow(dead_code)]
    scheduled_at: Option<DateTime<Utc>>,
}

pub fn start(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        loop {
            interval.tick().await;
            if let Err(e) = deploy_due_changes(&state).await {
                tracing::warn!("Scheduled deploy check failed: {}", e);
            }
        }
    });
}

async fn deploy_due_changes(state: &AppState) -> Result<(), sqlx::Error> {
    let due: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id
         FROM config_changes
         WHERE status = 'approved'
           AND scheduled_at IS NOT NULL
           AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC
         LIMIT 5",
    )
    .fetch_all(&state.db)
    .await?;

    for change_id in due {
        let claimed = sqlx::query(
            "UPDATE config_changes
             SET status = 'deploying', updated_at = NOW()
             WHERE id = $1 AND status = 'approved'
             RETURNING id",
        )
        .bind(change_id)
        .fetch_optional(&state.db)
        .await?;

        if claimed.is_none() {
            continue;
        }

        let state = state.clone();
        tokio::spawn(async move {
            if let Err(e) = deploy_one(state, change_id).await {
                tracing::warn!("Scheduled deployment {} failed: {}", change_id, e);
            }
        });
    }

    Ok(())
}

async fn deploy_one(state: AppState, change_id: Uuid) -> anyhow::Result<()> {
    let unresolved_comments: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM change_comments
         WHERE change_id = $1 AND resolved = false AND parent_comment_id IS NULL",
    )
    .bind(change_id)
    .fetch_one(&state.db)
    .await?;

    if unresolved_comments > 0 {
        mark_failed(
            &state,
            change_id,
            &format!(
                "Scheduled deployment blocked: {} unresolved comment{} must be resolved first",
                unresolved_comments,
                if unresolved_comments == 1 { "" } else { "s" },
            ),
        )
        .await?;
        return Ok(());
    }

    let change = sqlx::query_as::<_, ScheduledChange>(
        "SELECT
            cc.device_id,
            cc.config_diff,
            cc.scheduled_save_as_golden,
            cc.scheduled_by,
            d.ip_address,
            d.ssh_port,
            d.ssh_username,
            d.ssh_password,
            d.ssh_options,
            d.vendor,
            d.os,
            cc.scheduled_at
         FROM config_changes cc
         JOIN devices d ON d.id = cc.device_id
         WHERE cc.id = $1",
    )
    .bind(change_id)
    .fetch_one(&state.db)
    .await?;

    let username = match change.ssh_username {
        Some(v) => v,
        None => {
            mark_failed(&state, change_id, "SSH username is not configured").await?;
            return Ok(());
        }
    };
    let password = match change.ssh_password {
        Some(v) => v,
        None => {
            mark_failed(&state, change_id, "SSH password is not configured").await?;
            return Ok(());
        }
    };

    let host = change.ip_address.clone();
    let port = change.ssh_port as u16;
    let commands = change.config_diff.clone();
    let ssh_options = change.ssh_options.clone();
    let vendor = change.vendor.clone();
    let os = change.os.clone();
    let profiles = state.settings.read().await.vendor_profiles.clone();

    // Clone again for the post-deploy golden pull
    let host2 = host.clone();
    let username2 = username.clone();
    let password2 = password.clone();
    let ssh_options2 = ssh_options.clone();
    let vendor2 = vendor.clone();
    let os2 = os.clone();

    let output = tokio::task::spawn_blocking(move || {
        let target = crate::ssh::SshTarget {
            host: &host,
            port,
            username: &username,
            password: &password,
            ssh_options: ssh_options.as_deref(),
        };
        crate::ssh::apply_config_safe(&target, &commands, &vendor, &os, &profiles)
    })
    .await
    .map_err(|e| anyhow::anyhow!(e))?;

    match output {
        Ok(out) => {
            sqlx::query(
                "UPDATE config_changes
                 SET status = 'deployed',
                     deployed_at = NOW(),
                     deployment_output = $2,
                     updated_at = NOW()
                 WHERE id = $1",
            )
            .bind(change_id)
            .bind(&out)
            .execute(&state.db)
            .await?;

            if change.scheduled_save_as_golden {
                let device_id = change.device_id;
                let created_by = change.scheduled_by;
                let custom_command = sqlx::query_scalar::<_, Option<String>>(
                    "SELECT config_pull_command FROM devices WHERE id = $1",
                )
                .bind(device_id)
                .fetch_one(&state.db)
                .await
                .ok()
                .flatten();
                let profiles2 = state.settings.read().await.vendor_profiles.clone();
                let pulled = tokio::task::spawn_blocking(move || {
                    let target = crate::ssh::SshTarget {
                        host: &host2,
                        port,
                        username: &username2,
                        password: &password2,
                        ssh_options: ssh_options2.as_deref(),
                    };
                    crate::ssh::pull_running_config(
                        &target,
                        &vendor2,
                        &os2,
                        custom_command.as_deref(),
                        &profiles2,
                    )
                })
                .await;

                match pulled {
                    Ok(Ok(config)) => {
                        save_golden_config(&state, device_id, config, created_by).await?;
                    }
                    Ok(Err(e)) => {
                        tracing::warn!(
                            "save_as_golden: config pull failed for device {}: {}",
                            device_id,
                            e
                        );
                    }
                    Err(e) => {
                        tracing::warn!(
                            "save_as_golden: spawn error for device {}: {}",
                            device_id,
                            e
                        );
                    }
                }
            }
        }
        Err(e) => mark_failed(&state, change_id, &e).await?,
    }

    Ok(())
}

async fn mark_failed(state: &AppState, change_id: Uuid, message: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE config_changes
         SET status = 'failed',
             deployment_output = $2,
             updated_at = NOW()
         WHERE id = $1",
    )
    .bind(change_id)
    .bind(message)
    .execute(&state.db)
    .await?;

    Ok(())
}

async fn save_golden_config(
    state: &AppState,
    device_id: Uuid,
    config: String,
    created_by: Option<Uuid>,
) -> Result<(), sqlx::Error> {
    let next_version: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM golden_configs WHERE device_id = $1",
    )
    .bind(device_id)
    .fetch_one(&state.db)
    .await?;

    sqlx::query(
        "INSERT INTO golden_configs (id, device_id, config, version, created_by)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(device_id)
    .bind(config)
    .bind(next_version)
    .bind(created_by)
    .execute(&state.db)
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

    Ok(())
}
