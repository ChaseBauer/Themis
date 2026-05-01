use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::AppState;

pub fn start(state: AppState) {
    tokio::spawn(async move {
        // Stagger startup so drift check doesn't race with scheduler
        tokio::time::sleep(Duration::from_secs(30)).await;

        loop {
            let interval_secs = state.settings.read().await.drift_check_interval_secs;
            if let Err(e) = check_all_devices(&state).await {
                tracing::warn!("Drift check cycle failed: {}", e);
            }
            tokio::time::sleep(Duration::from_secs(interval_secs)).await;
        }
    });
}

#[derive(sqlx::FromRow)]
struct DriftTarget {
    device_id: Uuid,
    device_name: String,
    ip_address: String,
    ssh_port: i32,
    ssh_username: Option<String>,
    ssh_password: Option<String>,
    ssh_options: Option<String>,
    vendor: String,
    os: String,
    config_pull_command: Option<String>,
    golden_config_id: Uuid,
    golden_config: String,
}

async fn check_all_devices(state: &AppState) -> Result<(), sqlx::Error> {
    // Fetch all devices that have SSH credentials and at least one golden config.
    let targets = sqlx::query_as::<_, DriftTarget>(
        "SELECT
            d.id        AS device_id,
            d.name      AS device_name,
            d.ip_address,
            d.ssh_port,
            d.ssh_username,
            d.ssh_password,
            d.ssh_options,
            d.vendor,
            d.os,
            d.config_pull_command,
            gc.id       AS golden_config_id,
            gc.config   AS golden_config
         FROM devices d
         JOIN LATERAL (
             SELECT id, config
             FROM golden_configs
             WHERE device_id = d.id
             ORDER BY version DESC
             LIMIT 1
         ) gc ON true
         WHERE d.ssh_username IS NOT NULL
           AND d.ssh_password IS NOT NULL
           AND (d.deploying_since IS NULL OR d.deploying_since < NOW() - INTERVAL '30 minutes')",
    )
    .fetch_all(&state.db)
    .await?;

    let concurrency = state.settings.read().await.drift_check_concurrency;
    tracing::info!(
        "Drift check: checking {} device(s) with concurrency {}",
        targets.len(),
        concurrency
    );

    let limiter = Arc::new(Semaphore::new(concurrency));
    let mut handles = Vec::with_capacity(targets.len());
    for target in targets {
        let state = state.clone();
        let limiter = Arc::clone(&limiter);
        handles.push(tokio::spawn(async move {
            let Ok(_permit) = limiter.acquire_owned().await else {
                return;
            };
            if let Err(e) = check_one_device(state, target).await {
                tracing::warn!("Drift check failed: {}", e);
            }
        }));
    }

    for handle in handles {
        if let Err(e) = handle.await {
            tracing::warn!("Drift check task join failed: {}", e);
        }
    }

    Ok(())
}

async fn check_one_device(state: AppState, target: DriftTarget) -> anyhow::Result<()> {
    let (username, password) = match (target.ssh_username, target.ssh_password) {
        (Some(u), Some(p)) => (u, p),
        _ => return Ok(()),
    };

    let host = target.ip_address.clone();
    let port = target.ssh_port as u16;
    let vendor = target.vendor.clone();
    let os = target.os.clone();
    let ssh_options = target.ssh_options.clone();
    let custom_command = target.config_pull_command.clone();
    let profiles = state.settings.read().await.vendor_profiles.clone();
    let profile = profiles.resolve(&target.vendor, &target.os).clone();

    let pulled = tokio::task::spawn_blocking(move || {
        let t = crate::ssh::SshTarget {
            host: &host,
            port,
            username: &username,
            password: &password,
            ssh_options: ssh_options.as_deref(),
        };
        crate::ssh::pull_running_config(&t, &vendor, &os, custom_command.as_deref(), &profiles)
    })
    .await;

    let current = match pulled {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => {
            tracing::debug!(
                "Drift check: skipping {}, SSH pull failed: {}",
                target.device_name,
                e
            );
            return Ok(());
        }
        Err(e) => {
            tracing::warn!("Drift check: spawn error for {}: {}", target.device_name, e);
            return Ok(());
        }
    };

    let has_drift = configs_differ(&target.golden_config, &current, &profile);

    if has_drift {
        upsert_drift(&state, target.device_id, target.golden_config_id, &current).await?;
        tracing::info!("Drift detected on {}", target.device_name);
    } else {
        // Configs match, auto-resolve any open drift for this device
        sqlx::query(
            "UPDATE config_drift
             SET status = 'auto_resolved', resolved_at = NOW()
             WHERE device_id = $1 AND status = 'open'",
        )
        .bind(target.device_id)
        .execute(&state.db)
        .await?;
    }

    Ok(())
}

async fn upsert_drift(
    state: &AppState,
    device_id: Uuid,
    golden_config_id: Uuid,
    current_config: &str,
) -> Result<(), sqlx::Error> {
    // If an open drift exists for this device, update it; otherwise insert.
    sqlx::query(
        "INSERT INTO config_drift (device_id, golden_config_id, current_config)
         VALUES ($1, $2, $3)
         ON CONFLICT (device_id) WHERE status = 'open'
         DO UPDATE SET
             golden_config_id = EXCLUDED.golden_config_id,
             current_config   = EXCLUDED.current_config,
             last_checked_at  = NOW()",
    )
    .bind(device_id)
    .bind(golden_config_id)
    .bind(current_config)
    .execute(&state.db)
    .await?;

    Ok(())
}

fn is_cli_prompt_like(s: &str) -> bool {
    if s.contains(' ') {
        return false;
    }
    (s.ends_with('#') || s.ends_with('>'))
        || (s.starts_with('{') && s.ends_with('}') && s.contains(':'))
}

fn is_ignored_drift_line(
    line: &str,
    profile: Option<&crate::vendor_profiles::VendorProfileEntry>,
) -> bool {
    let lower = line.trim().to_ascii_lowercase();
    if is_cli_prompt_like(&lower) {
        return true;
    }
    let Some(profile) = profile else {
        return false;
    };
    profile
        .drift_ignore_prefixes
        .iter()
        .chain(profile.config_ignore_prefixes.iter())
        .any(|p| lower.starts_with(p.to_ascii_lowercase().as_str()))
        || profile
            .config_ignore_exact
            .iter()
            .any(|p| lower == p.to_ascii_lowercase())
        || profile
            .config_ignore_contains
            .iter()
            .any(|p| lower.contains(p.to_ascii_lowercase().as_str()))
}

fn normalize_config_for_drift_inner(
    config: &str,
    profile: Option<&crate::vendor_profiles::VendorProfileEntry>,
) -> Vec<String> {
    config
        .lines()
        .map(|line| line.trim_end())
        .filter(|line| !line.is_empty())
        .filter(|line| !is_ignored_drift_line(line, profile))
        .map(ToString::to_string)
        .collect()
}

/// Normalize configs before drift comparison and display by removing volatile
/// device-generated header/comment lines that change on every pull.
pub fn normalize_config_for_drift(config: &str) -> Vec<String> {
    normalize_config_for_drift_inner(config, None)
}

/// Returns true if the two cleaned configs differ line-by-line.
/// `extra_prefixes` are vendor-specific volatile line prefixes (from vendor profile).
pub fn configs_differ(
    golden: &str,
    current: &str,
    profile: &crate::vendor_profiles::VendorProfileEntry,
) -> bool {
    normalize_config_for_drift_inner(golden, Some(profile))
        != normalize_config_for_drift_inner(current, Some(profile))
}

/// Produce a simple changed-lines diff: lines prefixed with '+' or '-'.
/// Used when generating the change-ledger entry on drift acceptance.
pub fn unified_diff(golden: &str, current: &str) -> String {
    unified_diff_with_ignores(golden, current, None)
}

pub fn unified_diff_with_ignores(
    golden: &str,
    current: &str,
    profile: Option<&crate::vendor_profiles::VendorProfileEntry>,
) -> String {
    let old = normalize_config_for_drift_inner(golden, profile);
    let new = normalize_config_for_drift_inner(current, profile);

    // LCS table
    let m = old.len();
    let n = new.len();
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for i in (0..m).rev() {
        for j in (0..n).rev() {
            dp[i][j] = if old[i] == new[j] {
                dp[i + 1][j + 1] + 1
            } else {
                dp[i + 1][j].max(dp[i][j + 1])
            };
        }
    }

    let mut result = String::new();
    let (mut i, mut j) = (0, 0);
    while i < m || j < n {
        if i < m && j < n && old[i] == new[j] {
            i += 1;
            j += 1;
        } else if j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j]) {
            result.push('+');
            result.push_str(&new[j]);
            result.push('\n');
            j += 1;
        } else {
            result.push('-');
            result.push_str(&old[i]);
            result.push('\n');
            i += 1;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::{configs_differ, unified_diff_with_ignores};
    use crate::vendor_profiles::VendorProfiles;

    #[test]
    fn ignores_device_generated_timestamp_comments() {
        let golden = r#"!Time: Sun Apr 26 18:01:29 2026
!No configuration change since last restart
! Last configuration change at 21:38:22 UTC Sun Apr 26 2026 by developer
!Running configuration last done at: Sun Apr 26 18:01:22 2026
interface Ethernet1/1
 description uplink
"#;
        let current = r#"!Time: Mon Apr 27 06:24:33 2026
! No configuration change since last restart
! Last configuration change at 13:24:07 UTC Mon Apr 27 2026 by developer
! Running configuration
interface Ethernet1/1
 description uplink
"#;

        let profiles = VendorProfiles::builtin(2);
        let profile = profiles.resolve("cisco", "ios");

        assert!(!configs_differ(golden, current, profile));
        assert!(!unified_diff_with_ignores(golden, current, Some(profile)).contains("!Time:"));
        assert!(!unified_diff_with_ignores(golden, current, Some(profile))
            .contains("Last configuration change"));
        assert!(!unified_diff_with_ignores(golden, current, Some(profile))
            .contains("Running configuration"));
    }

    #[test]
    fn ignores_cli_prompt_and_syslog_noise() {
        let golden = r#"version 23.4R1.9;
system {
    host-name test-device;
}
"#;
        let current = r#"version 23.4R1.9;
system {
    host-name test-device;
}
{master:0}
jcluser@test-device>
Message from syslogd@test-device at Apr 28 23:06:48  ...
test-device /kernel: Percentage memory available(18)less than threshold(20 %)- 37
"#;

        let profiles = VendorProfiles::builtin(2);
        let profile = profiles.resolve("juniper", "junos");

        assert!(!configs_differ(golden, current, profile));
        assert!(!unified_diff_with_ignores(golden, current, Some(profile)).contains("syslogd"));
        assert!(!unified_diff_with_ignores(golden, current, Some(profile)).contains("/kernel:"));
    }
}
