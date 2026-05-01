use ssh2::Session;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::time::SystemTime;
use std::time::{Duration, Instant};

/// Quick TCP-only reachability probe. Returns `(reachable, latency_ms, error)`.
/// Does not attempt SSH auth, just checks that the port accepts a connection.
pub fn probe_tcp(host: &str, port: u16) -> (bool, Option<u64>, Option<String>) {
    let addr = format!("{}:{}", host, port);
    let sock_addr = match addr.to_socket_addrs().ok().and_then(|mut i| i.next()) {
        Some(a) => a,
        None => return (false, None, Some(format!("Could not resolve: {}", addr))),
    };
    let start = Instant::now();
    match TcpStream::connect_timeout(&sock_addr, Duration::from_secs(3)) {
        Ok(_) => (true, Some(start.elapsed().as_millis() as u64), None),
        Err(e) => (false, None, Some(e.to_string())),
    }
}

pub struct SshTarget<'a> {
    pub host: &'a str,
    pub port: u16,
    pub username: &'a str,
    pub password: &'a str,
    pub ssh_options: Option<&'a str>,
}

// Defaults that libssh2 uses; listed here so +algo prepending works correctly.
const DEFAULT_HOST_KEY_ALGOS: &str =
    "ssh-ed25519,ecdsa-sha2-nistp256,ecdsa-sha2-nistp384,ecdsa-sha2-nistp521,ssh-rsa,ssh-dss";
const DEFAULT_KEX_ALGOS: &str =
    "curve25519-sha256,ecdh-sha2-nistp256,ecdh-sha2-nistp384,ecdh-sha2-nistp521,\
     diffie-hellman-group14-sha256,diffie-hellman-group14-sha1,diffie-hellman-group1-sha1";
const DEFAULT_CIPHERS: &str = "aes128-ctr,aes192-ctr,aes256-ctr,aes128-cbc,aes256-cbc,3des-cbc";

/// Expand an OpenSSH-style algorithm list (`+algo` / `-algo` / literal) against `defaults`.
fn resolve_algorithms(value: &str, defaults: &str) -> String {
    if let Some(to_add) = value.strip_prefix('+') {
        format!("{},{}", to_add, defaults)
    } else if let Some(to_remove) = value.strip_prefix('-') {
        let remove: std::collections::HashSet<&str> = to_remove.split(',').map(str::trim).collect();
        defaults
            .split(',')
            .filter(|a| !remove.contains(a))
            .collect::<Vec<_>>()
            .join(",")
    } else {
        value.to_string()
    }
}

/// Apply key=value SSH options to a session **before** handshake.
/// Accepts both `Key=value` and `-oKey=value` formats, one per line.
/// `PubkeyAcceptedAlgorithms` is accepted for compatibility but silently ignored
/// (libssh2 has no equivalent when using password auth).
fn apply_ssh_options(sess: &mut Session, options: &str) -> Result<(), String> {
    for raw in options.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("-o").unwrap_or(line);
        if let Some((key, value)) = line.split_once('=') {
            match key.trim() {
                "HostKeyAlgorithms" => {
                    let algos = resolve_algorithms(value.trim(), DEFAULT_HOST_KEY_ALGOS);
                    sess.method_pref(ssh2::MethodType::HostKey, &algos)
                        .map_err(|e| format!("HostKeyAlgorithms: {}", e))?;
                }
                "KexAlgorithms" => {
                    let algos = resolve_algorithms(value.trim(), DEFAULT_KEX_ALGOS);
                    sess.method_pref(ssh2::MethodType::Kex, &algos)
                        .map_err(|e| format!("KexAlgorithms: {}", e))?;
                }
                "Ciphers" => {
                    let algos = resolve_algorithms(value.trim(), DEFAULT_CIPHERS);
                    sess.method_pref(ssh2::MethodType::CryptCs, &algos)
                        .map_err(|e| format!("Ciphers (C→S): {}", e))?;
                    sess.method_pref(ssh2::MethodType::CryptSc, &algos)
                        .map_err(|e| format!("Ciphers (S→C): {}", e))?;
                }
                "PubkeyAcceptedAlgorithms" | "PubkeyAcceptedKeyTypes" => {
                    // Not applicable for password auth in libssh2; accepted silently.
                }
                other => {
                    tracing::debug!("SSH option '{}' has no libssh2 mapping, skipping", other);
                }
            }
        }
    }
    Ok(())
}

fn open_session(target: &SshTarget) -> Result<Session, String> {
    let addr = format!("{}:{}", target.host, target.port);
    let sock_addr = addr
        .to_socket_addrs()
        .ok()
        .and_then(|mut i| i.next())
        .ok_or_else(|| format!("Could not resolve: {}", addr))?;

    let tcp = TcpStream::connect_timeout(&sock_addr, Duration::from_secs(10))
        .map_err(|e| format!("Cannot reach {}, {}", addr, e))?;

    tcp.set_read_timeout(Some(Duration::from_secs(30))).ok();
    tcp.set_write_timeout(Some(Duration::from_secs(30))).ok();

    let mut sess = Session::new().map_err(|e| format!("SSH init failed: {}", e))?;
    sess.set_tcp_stream(tcp);

    if let Some(opts) = target.ssh_options {
        apply_ssh_options(&mut sess, opts)?;
    }

    sess.handshake()
        .map_err(|e| format!("SSH handshake failed: {}", e))?;
    sess.userauth_password(target.username, target.password)
        .map_err(|e| format!("Authentication failed: {}", e))?;

    if !sess.authenticated() {
        return Err("Authentication rejected, check username/password".to_string());
    }

    Ok(sess)
}

/// Read whatever data is available from the channel within `window_ms` milliseconds.
/// Used in non-blocking mode to drain device output between commands.
fn drain(ch: &mut ssh2::Channel, window_ms: u64) -> String {
    let mut out = String::new();
    let deadline = Instant::now() + Duration::from_millis(window_ms);
    let mut buf = [0u8; 4096];
    loop {
        match ch.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                out.push_str(&String::from_utf8_lossy(&buf[..n]));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(_) => break,
        }
    }
    out
}

/// Drain output until the channel has been quiet for `quiet_ms`, or until
/// `max_ms` is reached. This is better for login banners and large configs than
/// a fixed read window, because slow devices may keep producing output after the
/// first timeout window.
fn drain_until_quiet(ch: &mut ssh2::Channel, max_ms: u64, quiet_ms: u64) -> String {
    let mut out = String::new();
    let max_deadline = Instant::now() + Duration::from_millis(max_ms);
    let mut quiet_deadline = Instant::now() + Duration::from_millis(quiet_ms);
    let mut buf = [0u8; 4096];

    loop {
        match ch.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                out.push_str(&String::from_utf8_lossy(&buf[..n]));
                quiet_deadline = Instant::now() + Duration::from_millis(quiet_ms);
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                let now = Instant::now();
                if now >= max_deadline || now >= quiet_deadline {
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(_) => break,
        }
    }

    out
}

pub struct ConnectionStep {
    pub label: String,
    pub ok: bool,
    pub detail: Option<String>,
}

/// Run each phase of SSH setup separately and return per-step results.
/// Never returns Err, failures are captured as a failed step.
pub fn test_connection_verbose(target: &SshTarget) -> Vec<ConnectionStep> {
    let mut steps = Vec::new();

    // Step 1: TCP reachability
    let (reachable, latency_ms, tcp_err) = probe_tcp(target.host, target.port);
    steps.push(ConnectionStep {
        label: format!("TCP connect to {}:{}", target.host, target.port),
        ok: reachable,
        detail: if reachable {
            latency_ms.map(|ms| format!("{}ms", ms))
        } else {
            tcp_err
        },
    });
    if !reachable {
        return steps;
    }

    // Step 2: SSH handshake
    let addr = format!("{}:{}", target.host, target.port);
    let sock_addr = match addr.to_socket_addrs().ok().and_then(|mut i| i.next()) {
        Some(a) => a,
        None => {
            steps.push(ConnectionStep {
                label: "SSH handshake".to_string(),
                ok: false,
                detail: Some(format!("Could not resolve: {}", addr)),
            });
            return steps;
        }
    };
    let tcp = match TcpStream::connect_timeout(&sock_addr, Duration::from_secs(10)) {
        Ok(s) => s,
        Err(e) => {
            steps.push(ConnectionStep {
                label: "SSH handshake".to_string(),
                ok: false,
                detail: Some(e.to_string()),
            });
            return steps;
        }
    };
    tcp.set_read_timeout(Some(Duration::from_secs(30))).ok();
    tcp.set_write_timeout(Some(Duration::from_secs(30))).ok();

    let mut sess = match Session::new() {
        Ok(s) => s,
        Err(e) => {
            steps.push(ConnectionStep {
                label: "SSH handshake".to_string(),
                ok: false,
                detail: Some(format!("SSH init: {}", e)),
            });
            return steps;
        }
    };
    sess.set_tcp_stream(tcp);

    if let Some(opts) = target.ssh_options {
        if let Err(e) = apply_ssh_options(&mut sess, opts) {
            steps.push(ConnectionStep {
                label: "SSH options".to_string(),
                ok: false,
                detail: Some(e),
            });
            return steps;
        }
        steps.push(ConnectionStep {
            label: "SSH options applied".to_string(),
            ok: true,
            detail: Some(
                opts.lines()
                    .filter(|l| !l.trim().is_empty())
                    .collect::<Vec<_>>()
                    .join(", "),
            ),
        });
    }

    match sess.handshake() {
        Ok(_) => {
            let fingerprint = sess
                .host_key()
                .map(|(key, _)| {
                    use std::fmt::Write;
                    let mut s = String::new();
                    for b in key.iter().take(6) {
                        let _ = write!(s, "{:02x}:", b);
                    }
                    s.pop();
                    format!("fingerprint ...{}", s)
                })
                .unwrap_or_default();
            steps.push(ConnectionStep {
                label: "SSH handshake".to_string(),
                ok: true,
                detail: if fingerprint.is_empty() {
                    None
                } else {
                    Some(fingerprint)
                },
            });
        }
        Err(e) => {
            steps.push(ConnectionStep {
                label: "SSH handshake".to_string(),
                ok: false,
                detail: Some(e.to_string()),
            });
            return steps;
        }
    }

    // Step 3: Authentication
    match sess.userauth_password(target.username, target.password) {
        Ok(_) if sess.authenticated() => {
            steps.push(ConnectionStep {
                label: format!("Authenticate as '{}'", target.username),
                ok: true,
                detail: None,
            });
        }
        Ok(_) => {
            steps.push(ConnectionStep {
                label: format!("Authenticate as '{}'", target.username),
                ok: false,
                detail: Some("Server rejected credentials".to_string()),
            });
        }
        Err(e) => {
            steps.push(ConnectionStep {
                label: format!("Authenticate as '{}'", target.username),
                ok: false,
                detail: Some(e.to_string()),
            });
        }
    }

    steps
}

/// Verify the device is reachable and that SSH credentials are valid.
pub fn test_connection(target: &SshTarget) -> Result<(), String> {
    open_session(target)?;
    Ok(())
}

/// Open an interactive shell, send vendor-appropriate pager-disable commands, run the
/// config pull command, and return the cleaned output.
///
/// `custom_command` overrides the vendor-profile default when set (used for "Other" devices).
pub fn pull_running_config(
    target: &SshTarget,
    vendor: &str,
    os: &str,
    custom_command: Option<&str>,
    profiles: &crate::vendor_profiles::VendorProfiles,
) -> Result<String, String> {
    let profile = profiles.resolve(vendor, os);
    let show_config = custom_command.unwrap_or(&profile.show_config);

    let sess = open_session(target)?;

    let mut ch = sess
        .channel_session()
        .map_err(|e| format!("Failed to open channel: {}", e))?;
    ch.request_pty("vt100", None, Some((220, 50, 0, 0)))
        .map_err(|e| format!("PTY request failed: {}", e))?;
    ch.shell()
        .map_err(|e| format!("Shell open failed: {}", e))?;

    sess.set_blocking(false);

    let _ = drain_until_quiet(&mut ch, 5000, 900); // consume banner / initial prompt

    for cmd in &profile.disable_pager {
        ch.write_all(format!("{}\n", cmd).as_bytes())
            .map_err(|e| format!("Failed to send pager command: {}", e))?;
        let _ = drain_until_quiet(&mut ch, 3000, 500);
    }

    ch.write_all(format!("{}\n", show_config).as_bytes())
        .map_err(|e| format!("Failed to send config command: {}", e))?;
    let pull_max_ms = profile.pull_max_ms.unwrap_or(30_000);
    let pull_quiet_ms = profile.pull_quiet_ms.unwrap_or(1_200);
    let raw = drain_until_quiet(&mut ch, pull_max_ms, pull_quiet_ms);

    sess.set_blocking(true);
    ch.send_eof().ok();
    ch.wait_close().ok();

    let config = clean_config_output(&strip_ansi(&raw), show_config, profile);
    if config.trim().is_empty() {
        return Err(format!(
            "Device returned no output for '{}', check that the command is correct for this vendor",
            show_config
        ));
    }
    Ok(config)
}

/// Strip command echo, device banners, "Building configuration..." headers,
/// and trailing CLI prompts from raw `show running-config` output.
///
/// Strategy:
///   - Find the first line that starts with `!` (standard IOS/NX-OS/EOS config
///     delimiter). Everything before it is noise (echo, header lines, etc.).
///     If no `!` is found, fall back to keeping everything.
///   - Walk backwards from the end removing blank lines and bare CLI prompts
///     (a prompt is a token with no whitespace that ends in `#` or `>`).
fn clean_config_output(
    raw: &str,
    command_echo: &str,
    profile: &crate::vendor_profiles::VendorProfileEntry,
) -> String {
    let lines: Vec<&str> = raw.lines().collect();

    let after_echo = lines
        .iter()
        .position(|l| l.trim() == command_echo.trim())
        .map(|idx| idx + 1)
        .unwrap_or(0);

    let start = lines[after_echo..]
        .iter()
        .position(|l| is_config_start_line(l))
        .map(|idx| after_echo + idx)
        .unwrap_or(after_echo);

    let mut start = start;
    while start < lines.len() && is_config_header_line(lines[start]) {
        start += 1;
    }

    // Strip trailing blank lines and CLI prompts
    let mut end = lines.len();
    while end > start {
        let t = lines[end - 1].trim();
        if t.is_empty() || is_cli_prompt(t) {
            end -= 1;
        } else {
            break;
        }
    }

    lines[start..end]
        .iter()
        .map(|line| line.trim_end())
        .filter(|line| !is_non_config_output_line(line, profile))
        .collect::<Vec<_>>()
        .join("\n")
}

fn is_config_start_line(line: &str) -> bool {
    let t = line.trim_start().to_lowercase();
    t.starts_with('!')
        || t.starts_with("##")
        || t == "building configuration..."
        || t.starts_with("current configuration")
        || t.starts_with("version ")
        || t.starts_with("hostname ")
        || t.starts_with("system {")
        || t.starts_with("boot-start-marker")
        || t.starts_with("configure replace")
}

fn is_config_header_line(line: &str) -> bool {
    let t = line.trim().to_lowercase();
    t.is_empty() || t == "building configuration..." || t.starts_with("current configuration")
}

/// Returns true for bare CLI prompts like `Router#`, `Switch>`, `cat8000v#`.
/// Prompts contain no whitespace and end with `#` or `>`.
fn is_cli_prompt(s: &str) -> bool {
    if s.contains(' ') {
        return false;
    }
    (s.ends_with('#') || s.ends_with('>'))
        || (s.starts_with('{') && s.ends_with('}') && s.contains(':'))
}

fn is_non_config_output_line(
    line: &str,
    profile: &crate::vendor_profiles::VendorProfileEntry,
) -> bool {
    let t = line.trim().trim_matches(|c: char| c.is_control());
    if t.is_empty() || is_cli_prompt(t) {
        return true;
    }
    let lower = t.to_ascii_lowercase();
    profile
        .config_ignore_exact
        .iter()
        .any(|value| lower == value.to_ascii_lowercase())
        || profile
            .config_ignore_prefixes
            .iter()
            .any(|value| lower.starts_with(value.to_ascii_lowercase().as_str()))
        || profile
            .config_ignore_contains
            .iter()
            .any(|value| lower.contains(value.to_ascii_lowercase().as_str()))
}

fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if let Some('[') = chars.next() {
                for ch in chars.by_ref() {
                    if ch.is_alphabetic() || ch == '~' {
                        break;
                    }
                }
            }
        } else if !c.is_control() || matches!(c, '\n' | '\r' | '\t') {
            out.push(c);
        }
    }
    out
}

/// Scan output lines for known error patterns. Returns the first matching error line,
/// stripped of ANSI and trimmed.
fn detect_error(output: &str, patterns: &[String]) -> Option<String> {
    if patterns.is_empty() {
        return None;
    }
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_lowercase();
        for pat in patterns {
            if lower.contains(pat.as_str()) {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::clean_config_output;
    use crate::vendor_profiles::VendorProfiles;

    #[test]
    fn strips_junos_prompt_and_syslog_noise_from_config_pull() {
        let raw = r#"show configuration | no-more
version 23.4R1.9;
system {
    host-name test-device;
}
{master:0}
jcluser@test-device>
Message from syslogd@test-device at Apr 28 23:06:48  ...
test-device /kernel: Percentage memory available(18)less than threshold(20 %)- 37
"#;

        let profiles = VendorProfiles::builtin(2);
        let profile = profiles.resolve("juniper", "junos");
        let config = clean_config_output(raw, "show configuration | no-more", profile);

        assert!(config.contains("version 23.4R1.9;"));
        assert!(config.contains("system {"));
        assert!(!config.contains("{master"));
        assert!(!config.contains("jcluser@test-device>"));
        assert!(!config.contains("Message from syslogd"));
        assert!(!config.contains("/kernel:"));
        assert!(!config.contains("Percentage memory"));
    }
}

fn detect_replace_error(
    cmd: &str,
    output: &str,
    profile: &crate::vendor_profiles::VendorProfileEntry,
) -> Option<String> {
    if let Some(err) = detect_error(output, &profile.error_patterns) {
        return Some(err);
    }
    if let Some(err) = detect_error(output, &profile.replace_error_patterns) {
        return Some(err);
    }

    let mut scoped_patterns = Vec::new();
    for rule in &profile.replace_error_rules {
        if let Some(prefix) = &rule.command_starts_with {
            if !cmd.starts_with(prefix) {
                continue;
            }
        }
        scoped_patterns.extend(rule.output_contains.iter().cloned());
    }

    detect_error(output, &scoped_patterns)
}

/// Build the ordered command sequence for a config deploy based on the vendor profile.
///
/// Sequence:
///   disable_pager → configure_enter → user commands → configure_save → configure_exit → save_config
///
/// User command lines that are blank or start with `!` (IOS comment marker) are dropped.
fn build_deploy_commands(
    commands: &str,
    profile: &crate::vendor_profiles::VendorProfileEntry,
) -> Vec<String> {
    profile
        .disable_pager
        .iter()
        .cloned()
        .chain(profile.configure_enter.iter().cloned())
        .chain(
            commands
                .lines()
                .map(|l| l.trim_end().to_string())
                .filter(|l| !l.is_empty() && !l.starts_with('!')),
        )
        .chain(profile.configure_save.iter().cloned())
        .chain(profile.configure_exit.iter().cloned())
        .chain(profile.save_config.iter().cloned())
        .collect()
}

/// Like `build_deploy_commands` but uses `guarded_configure_save` instead of
/// `configure_save` when the vendor profile defines it.
/// Does not include disable_pager, `apply_config_safe_inner` sends those separately.
fn build_safe_apply_commands(
    commands: &str,
    profile: &crate::vendor_profiles::VendorProfileEntry,
) -> Vec<String> {
    let save = if !profile.guarded_configure_save.is_empty() {
        &profile.guarded_configure_save
    } else {
        &profile.configure_save
    };
    profile
        .configure_enter
        .iter()
        .cloned()
        .chain(
            commands
                .lines()
                .map(|l| l.trim_end().to_string())
                .filter(|l| !l.is_empty() && !l.starts_with('!')),
        )
        .chain(save.iter().cloned())
        .chain(profile.configure_exit.iter().cloned())
        .collect()
}

/// Returns a longer drain window for commands that trigger slow device operations
/// (commit/save/reload guards), based on the selected vendor profile.
fn drain_window_ms(cmd: &str, profile: &crate::vendor_profiles::VendorProfileEntry) -> u64 {
    let c = cmd.trim();
    for rule in &profile.drain_rules {
        if let Some(exact) = &rule.command {
            if c == exact {
                return rule.drain_ms;
            }
        }
        if let Some(prefix) = &rule.command_starts_with {
            if c.starts_with(prefix) {
                return rule.drain_ms;
            }
        }
    }
    if profile
        .configure_save
        .iter()
        .chain(profile.save_config.iter())
        .any(|known_slow| known_slow == c)
    {
        return 3000;
    }
    if profile
        .guarded_configure_save
        .iter()
        .any(|known_slow| c.starts_with(known_slow))
    {
        return 5000;
    }
    600
}

fn command_response_matches(
    rule: &crate::vendor_profiles::CommandResponseRule,
    cmd: &str,
    output: &str,
) -> bool {
    if let Some(prefix) = &rule.command_starts_with {
        if !cmd.starts_with(prefix) {
            return false;
        }
    }
    let lower = output.to_lowercase();
    rule.output_contains
        .iter()
        .any(|needle| lower.contains(&needle.to_lowercase()))
}

fn send_shell_command(
    sess: &Session,
    ch: &mut ssh2::Channel,
    cmd: &str,
    window_ms: u64,
    profile: &crate::vendor_profiles::VendorProfileEntry,
) -> Result<String, String> {
    ch.write_all(format!("{}\n", cmd).as_bytes())
        .map_err(|e| format!("Failed to send '{}': {}", cmd, e))?;
    let mut chunk = drain(ch, window_ms);

    for rule in &profile.command_responses {
        for _ in 0..rule.max_repeats {
            if !command_response_matches(rule, cmd, &chunk) {
                break;
            }
            ch.write_all(format!("{}\n", rule.response).as_bytes())
                .map_err(|e| format!("Failed to answer prompt for '{}': {}", cmd, e))?;
            chunk.push_str(&drain(ch, rule.drain_ms));
        }
    }

    sess.set_blocking(false);
    Ok(chunk)
}

fn open_shell(sess: &Session) -> Result<ssh2::Channel, String> {
    let mut ch = sess
        .channel_session()
        .map_err(|e| format!("Failed to open channel: {}", e))?;
    ch.request_pty("vt100", None, Some((220, 50, 0, 0)))
        .map_err(|e| format!("PTY request failed: {}", e))?;
    ch.shell()
        .map_err(|e| format!("Shell open failed: {}", e))?;
    sess.set_blocking(false);
    Ok(ch)
}

fn close_shell(sess: &Session, ch: &mut ssh2::Channel) {
    sess.set_blocking(true);
    ch.send_eof().ok();
    ch.wait_close().ok();
}

fn run_operational_commands(
    target: &SshTarget,
    commands: &[String],
    vendor: &str,
    os: &str,
    profiles: &crate::vendor_profiles::VendorProfiles,
) -> Result<String, String> {
    let profile = profiles.resolve(vendor, os);
    let sess = open_session(target)?;
    let mut ch = open_shell(&sess)?;
    let mut out = drain(&mut ch, 1500);

    for cmd in commands {
        let chunk = send_shell_command(
            &sess,
            &mut ch,
            cmd,
            drain_window_ms(cmd, profile).max(3000),
            profile,
        )?;
        out.push_str(&chunk);
        if let Some(err_line) = detect_error(&chunk, &profile.error_patterns) {
            close_shell(&sess, &mut ch);
            return Err(format!("Command failed: '{}'\n  {}", cmd, err_line));
        }
    }

    out.push_str(&drain(&mut ch, 1000));
    close_shell(&sess, &mut ch);
    Ok(out)
}

fn upload_config(sess: &Session, remote_path: &str, config: &str) -> Result<(), String> {
    let mut remote = sess
        .scp_send(Path::new(remote_path), 0o644, config.len() as u64, None)
        .map_err(|e| format!("SCP upload to '{}' failed: {}", remote_path, e))?;
    remote
        .write_all(config.as_bytes())
        .map_err(|e| format!("SCP write to '{}' failed: {}", remote_path, e))?;
    remote
        .send_eof()
        .map_err(|e| format!("SCP EOF for '{}' failed: {}", remote_path, e))?;
    remote
        .wait_eof()
        .map_err(|e| format!("SCP EOF wait for '{}' failed: {}", remote_path, e))?;
    remote
        .close()
        .map_err(|e| format!("SCP close for '{}' failed: {}", remote_path, e))?;
    remote
        .wait_close()
        .map_err(|e| format!("SCP close wait for '{}' failed: {}", remote_path, e))?;
    Ok(())
}

fn run_shell_commands(
    sess: &Session,
    commands: &[String],
    profile: &crate::vendor_profiles::VendorProfileEntry,
) -> Result<String, String> {
    let mut ch = sess
        .channel_session()
        .map_err(|e| format!("Failed to open channel: {}", e))?;
    ch.request_pty("vt100", None, Some((220, 50, 0, 0)))
        .map_err(|e| format!("PTY request failed: {}", e))?;
    ch.shell()
        .map_err(|e| format!("Shell open failed: {}", e))?;

    sess.set_blocking(false);
    let mut full_output = String::new();
    full_output.push_str(&drain(&mut ch, 1500));

    for cmd in commands {
        let chunk = send_shell_command(
            sess,
            &mut ch,
            cmd,
            drain_window_ms(cmd, profile).max(6000),
            profile,
        )?;
        full_output.push_str(&chunk);

        if let Some(err_line) = detect_replace_error(cmd, &chunk, profile) {
            sess.set_blocking(true);
            ch.send_eof().ok();
            ch.wait_close().ok();
            return Err(format!("Command failed: '{}'\n  {}", cmd, err_line));
        }
    }

    full_output.push_str(&drain(&mut ch, 1500));
    sess.set_blocking(true);
    ch.send_eof().ok();
    ch.wait_close().ok();
    Ok(full_output)
}

/// Replace the running configuration with a complete golden config.
///
pub fn replace_config_streaming(
    target: &SshTarget,
    config: &str,
    vendor: &str,
    os: &str,
    profiles: &crate::vendor_profiles::VendorProfiles,
    tx: tokio::sync::mpsc::UnboundedSender<String>,
) -> Result<String, String> {
    replace_config_inner(target, config, vendor, os, profiles, Some(tx))
}

pub fn replace_config(
    target: &SshTarget,
    config: &str,
    vendor: &str,
    os: &str,
    profiles: &crate::vendor_profiles::VendorProfiles,
) -> Result<String, String> {
    replace_config_inner(target, config, vendor, os, profiles, None)
}

/// Full-config replace via an inline PTY stream.
/// Sends the config to stdin of the terminal_replace_cmd defined in the vendor profile,
/// terminated with Ctrl-D (EOF). Uses `replace_enter`/`replace_exit` from the profile.
fn replace_via_terminal_inline(
    target: &SshTarget,
    config: &str,
    profile: &crate::vendor_profiles::VendorProfileEntry,
    term_cmd: &str,
    tx: Option<&tokio::sync::mpsc::UnboundedSender<String>>,
) -> Result<String, String> {
    macro_rules! emit {
        ($s:expr) => {
            if let Some(t) = tx {
                let _ = t.send($s);
            }
        };
    }

    let sess = open_session(target)?;
    let mut ch = open_shell(&sess)?;
    let mut out = String::new();
    out.push_str(&drain(&mut ch, 1500));

    for cmd in &profile.disable_pager {
        ch.write_all(format!("{}\n", cmd).as_bytes())
            .map_err(|e| format!("Failed to send '{}': {}", cmd, e))?;
        out.push_str(&drain(&mut ch, 1500));
    }

    for cmd in &profile.replace_enter {
        ch.write_all(format!("{}\n", cmd).as_bytes())
            .map_err(|e| format!("Failed to enter config mode ('{}'): {}", cmd, e))?;
        out.push_str(&drain(&mut ch, 2000));
    }

    emit!(format!(
        "[themis] Sending config inline via '{}'...\n",
        term_cmd
    ));
    ch.write_all(format!("{}\n", term_cmd).as_bytes())
        .map_err(|e| format!("Failed to send '{}': {}", term_cmd, e))?;
    let _ = drain(&mut ch, 1000); // consume prompt/acknowledgement

    // Stream config content then signal EOF with Ctrl-D
    for line in config.lines() {
        ch.write_all(format!("{}\n", line).as_bytes())
            .map_err(|e| format!("Failed to send config line: {}", e))?;
    }
    ch.write_all(b"\x04")
        .map_err(|e| format!("Failed to send EOF: {}", e))?;

    let load_out = drain(&mut ch, 15000);
    emit!(load_out.clone());
    out.push_str(&load_out);

    if let Some(err_line) = detect_error(&load_out, &profile.error_patterns) {
        close_shell(&sess, &mut ch);
        return Err(format!("'{}' failed: {}", term_cmd, err_line));
    }

    for cmd in &profile.replace_exit {
        ch.write_all(format!("{}\n", cmd).as_bytes())
            .map_err(|e| format!("Failed to run '{}': {}", cmd, e))?;
        let chunk = drain(&mut ch, drain_window_ms(cmd, profile).max(8000));
        emit!(chunk.clone());
        out.push_str(&chunk);
        if let Some(err_line) = detect_error(&chunk, &profile.error_patterns) {
            close_shell(&sess, &mut ch);
            return Err(format!("'{}' failed: {}", cmd, err_line));
        }
    }

    close_shell(&sess, &mut ch);
    Ok(out)
}

/// Strip lines whose trimmed, lowercased content starts with any of the given prefixes.
/// Removes display-only metadata comments from a config before uploading it back to the
/// device, these annotations are not valid config syntax on most platforms.
fn strip_upload_noise(
    config: &str,
    profile: &crate::vendor_profiles::VendorProfileEntry,
) -> String {
    config
        .lines()
        .filter(|line| {
            let lower = line.trim().to_ascii_lowercase();
            !is_non_config_output_line(line, profile)
                && !profile
                    .drift_ignore_prefixes
                    .iter()
                    .any(|p| lower.starts_with(p.to_ascii_lowercase().as_str()))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum JunosConfigFormat {
    Text,
    Set,
    Json,
    Xml,
}

fn detect_junos_config_format(config: &str) -> JunosConfigFormat {
    let meaningful = config
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with("##"));

    match meaningful {
        Some(line) if line.starts_with("set ") || line.starts_with("delete ") => {
            JunosConfigFormat::Set
        }
        Some(line) if line.starts_with('{') || line.starts_with('[') => JunosConfigFormat::Json,
        Some(line) if line.starts_with('<') => JunosConfigFormat::Xml,
        _ => JunosConfigFormat::Text,
    }
}

fn replace_config_inner(
    target: &SshTarget,
    config: &str,
    vendor: &str,
    os: &str,
    profiles: &crate::vendor_profiles::VendorProfiles,
    tx: Option<tokio::sync::mpsc::UnboundedSender<String>>,
) -> Result<String, String> {
    macro_rules! emit {
        ($s:expr) => {
            if let Some(ref t) = tx {
                let _ = t.send($s);
            }
        };
    }

    let profile = profiles.resolve(vendor, os);

    if profile.replace_command.is_none() && profile.terminal_replace_cmd.is_none() {
        return Err(
            "Revert-to-golden requires a full config replace, but the vendor profile for this \
             device has no 'replace_command' or 'terminal_replace_cmd' configured.\n\
             Add a replace_command to the vendor profile in Admin → Settings → Vendor Profiles."
                .to_string(),
        );
    }

    let mut attempt_log = String::new();
    macro_rules! log {
        ($s:expr) => {{
            let s = $s;
            emit!(s.to_string());
            attempt_log.push_str(s.as_ref());
        }};
    }

    // Strip display-only metadata lines before upload.
    // These are identical to what we already ignore for drift comparison.
    let sanitized_config = strip_upload_noise(config, profile);
    let junos_format = if profile.replace_format.as_deref() == Some("junos-text") {
        Some(detect_junos_config_format(&sanitized_config))
    } else {
        None
    };

    if matches!(
        junos_format,
        Some(JunosConfigFormat::Set | JunosConfigFormat::Json | JunosConfigFormat::Xml)
    ) {
        return Err(
            "Junos golden config is not in brace-style text format. A true full replacement \
             requires 'load override <file>', which expects Junos text configuration from \
             'show configuration | no-more'. Re-pull or recreate the golden config in that \
             format, then retry revert-to-golden."
                .to_string(),
        );
    }

    // Prefer inline terminal replace when the profile defines it.
    if profile.allow_terminal_replace {
        if let Some(ref term_cmd) = profile.terminal_replace_cmd.clone() {
            log!(format!(
                "[themis] Trying inline terminal replace via '{}'...\n",
                term_cmd
            ));
            match replace_via_terminal_inline(
                target,
                &sanitized_config,
                profile,
                term_cmd,
                tx.as_ref(),
            ) {
                Ok(out) => {
                    attempt_log.push_str(&out);
                    log!("\n[themis] Full config replace completed via terminal inline.\n");
                    return Ok(attempt_log);
                }
                Err(e) => {
                    log!(format!("[themis] Terminal inline replace failed: {}\n", e));
                    if profile.replace_command.is_none() {
                        return Err(format!(
                        "Full config replace failed, terminal inline failed and no SCP replace_command is configured.\n{}",
                        attempt_log
                    ));
                    }
                    log!("[themis] Falling back to SCP-based replace...\n");
                }
            }
        }
    }

    // ── SCP + file-based replace ──────────────────────────────────────────────
    if let Some(replace_cmd_template) = &profile.replace_command.clone() {
        let millis = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let filename = format!("themis-golden-{}.cfg", millis);
        let candidates: Vec<String> = if !profile.scp_paths.is_empty() {
            profile
                .scp_paths
                .iter()
                .map(|p| p.replace("{filename}", &filename))
                .collect()
        } else {
            vec![filename.clone()]
        };

        for upload_path in &candidates {
            log!(format!(
                "\n[themis] Uploading full config to {}\n",
                upload_path
            ));
            let upload_sess = match open_session(target) {
                Ok(sess) => sess,
                Err(err) => {
                    log!(format!("[themis] SSH connection failed: {}\n", err));
                    continue;
                }
            };

            match upload_config(&upload_sess, upload_path, &sanitized_config) {
                Ok(()) => {
                    drop(upload_sess);
                    let replace_cmd = replace_cmd_template.replace("{path}", upload_path);
                    let mut commands = profile.disable_pager.clone();
                    commands.extend(profile.replace_enter.clone());
                    commands.push(replace_cmd);
                    commands.extend(profile.replace_exit.clone());
                    commands.extend(profile.save_config.clone());

                    log!(format!(
                        "[themis] Upload complete. Running replace from {}\n",
                        upload_path
                    ));

                    let replace_sess = match open_session(target) {
                        Ok(sess) => sess,
                        Err(err) => {
                            log!(format!(
                                "[themis] SSH reconnect before replace failed: {}\n",
                                err
                            ));
                            continue;
                        }
                    };

                    match run_shell_commands(&replace_sess, &commands, profile) {
                        Ok(output) => {
                            emit!(output.clone());
                            attempt_log.push_str(&output);
                            let done = format!(
                                "\n[themis] Full config replace completed using {}\n",
                                upload_path
                            );
                            log!(done);
                            return Ok(attempt_log);
                        }
                        Err(err) => {
                            log!(format!(
                                "[themis] Replace using {} failed:\n{}\n",
                                upload_path, err
                            ));
                        }
                    }
                }
                Err(err) => {
                    log!(format!("[themis] {}\n", err));
                }
            }
        }

        return Err(format!(
            "Full config replace failed, all SCP paths failed.\n{}",
            attempt_log
        ));
    }

    Err(format!("Full config replace failed.\n{}", attempt_log))
}

/// Open an interactive shell on the device, apply the provided config commands
/// using the correct vendor-specific sequence, and return all collected output.
/// Returns `Err` immediately if the device outputs an error for any command.
pub fn apply_config(
    target: &SshTarget,
    commands: &str,
    vendor: &str,
    os: &str,
    profiles: &crate::vendor_profiles::VendorProfiles,
) -> Result<String, String> {
    let profile = profiles.resolve(vendor, os);
    let cmd_list = build_deploy_commands(commands, profile);

    let sess = open_session(target)?;
    let mut ch = sess
        .channel_session()
        .map_err(|e| format!("Failed to open channel: {}", e))?;
    ch.request_pty("vt100", None, Some((220, 50, 0, 0)))
        .map_err(|e| format!("PTY request failed: {}", e))?;
    ch.shell()
        .map_err(|e| format!("Shell open failed: {}", e))?;

    sess.set_blocking(false);
    let mut full_output = String::new();

    full_output.push_str(&drain(&mut ch, 1500));

    for cmd in &cmd_list {
        ch.write_all(format!("{}\n", cmd).as_bytes())
            .map_err(|e| format!("Failed to send '{}': {}", cmd, e))?;
        let chunk = drain(&mut ch, drain_window_ms(cmd, profile));
        full_output.push_str(&chunk);

        if let Some(err_line) = detect_error(&chunk, &profile.error_patterns) {
            sess.set_blocking(true);
            ch.send_eof().ok();
            ch.wait_close().ok();
            return Err(format!("Command failed: '{}'\n {}", cmd, err_line));
        }
    }

    full_output.push_str(&drain(&mut ch, 1000));

    sess.set_blocking(true);
    ch.send_eof().ok();
    ch.wait_close().ok();

    Ok(full_output)
}

fn apply_config_safe_inner(
    target: &SshTarget,
    commands: &str,
    vendor: &str,
    os: &str,
    profiles: &crate::vendor_profiles::VendorProfiles,
    tx: Option<tokio::sync::mpsc::UnboundedSender<String>>,
) -> Result<String, String> {
    let profile = profiles.resolve(vendor, os);
    let cmd_list = build_safe_apply_commands(commands, profile);
    let guard_cmd = profile.reload_guard_cmd.as_deref();
    let guard_cancel = profile.reload_guard_cancel.as_deref();
    let guard_confirm = profile.guard_confirm_cmds.clone();
    let uses_commit_guard = !profile.guarded_configure_save.is_empty();
    let mut full_output = String::new();

    macro_rules! emit {
        ($chunk:expr) => {{
            let s: String = $chunk;
            if let Some(tx) = &tx {
                let _ = tx.send(s.clone());
            }
            full_output.push_str(&s);
        }};
    }

    emit!("[SAFETY] Starting guarded deployment. Config will not be saved until SSH connectivity is verified.\n".to_string());

    let sess = open_session(target)?;
    let mut ch = open_shell(&sess)?;
    emit!(drain(&mut ch, 1500));

    for cmd in &profile.disable_pager {
        let chunk =
            send_shell_command(&sess, &mut ch, cmd, drain_window_ms(cmd, profile), profile)?;
        emit!(chunk);
    }

    if let Some(gcmd) = guard_cmd {
        emit!(format!(
            "[SAFETY] Scheduling rollback reload before applying changes.\n"
        ));
        let chunk = send_shell_command(&sess, &mut ch, gcmd, 3000, profile)?;
        if let Some(err_line) = detect_error(&chunk, &profile.error_patterns) {
            close_shell(&sess, &mut ch);
            return Err(format!(
                "Safety guard failed: could not schedule rollback reload.\n  {}",
                err_line
            ));
        }
        emit!(chunk);
    } else if uses_commit_guard {
        emit!(
            "[SAFETY] Using commit-confirmed guard, device will auto-rollback if SSH is lost.\n"
                .to_string()
        );
    } else {
        emit!("[SAFETY] This vendor profile has no automatic reload guard. Themis will still avoid saving until post-deploy SSH succeeds.\n".to_string());
    }

    for cmd in &cmd_list {
        let chunk =
            send_shell_command(&sess, &mut ch, cmd, drain_window_ms(cmd, profile), profile)?;
        emit!(chunk.clone());

        if let Some(err_line) = detect_error(&chunk, &profile.error_patterns) {
            if let Some(cancel) = guard_cancel {
                let out =
                    send_shell_command(&sess, &mut ch, cancel, 3000, profile).unwrap_or_else(|e| {
                        format!("\n[SAFETY] Failed to cancel rollback reload: {}\n", e)
                    });
                emit!(out);
            }
            close_shell(&sess, &mut ch);
            return Err(format!("Command failed: '{}'\n  {}", cmd, err_line));
        }
    }

    close_shell(&sess, &mut ch);
    emit!(
        "[SAFETY] Waiting briefly, then testing SSH connectivity before confirming.\n".to_string()
    );
    std::thread::sleep(Duration::from_secs(3));

    if let Err(e) = test_connection(target) {
        emit!(format!("[SAFETY] Post-deploy SSH check failed: {}\n", e));
        if guard_cmd.is_some() {
            return Err(format!(
                "Post-deploy SSH check failed. A rollback reload was left scheduled and the config was not saved: {}",
                e
            ));
        }
        if uses_commit_guard {
            return Err(format!(
                "Post-deploy SSH check failed. The device will automatically roll back the commit: {}",
                e
            ));
        }
        return Err(format!(
            "Post-deploy SSH check failed. Config was not saved automatically: {}",
            e
        ));
    }

    emit!("[SAFETY] Post-deploy SSH check passed.\n".to_string());

    if let Some(cancel) = guard_cancel {
        match run_operational_commands(target, &[cancel.to_string()], vendor, os, profiles) {
            Ok(out) => {
                emit!("[SAFETY] Cancelled rollback reload.\n".to_string());
                emit!(out);
            }
            Err(e) => {
                return Err(format!(
                    "Deployment applied and SSH passed, but cancelling rollback reload failed: {}",
                    e
                ));
            }
        }
    } else if !guard_confirm.is_empty() {
        // Run guard_confirm_cmds to finalize the guarded commit.
        emit!("[SAFETY] Confirming commit after SSH check passed.\n".to_string());
        match run_operational_commands(target, &guard_confirm, vendor, os, profiles) {
            Ok(out) => {
                emit!("[SAFETY] Commit confirmed.\n".to_string());
                emit!(out);
            }
            Err(e) => {
                return Err(format!(
                    "Deployment applied and SSH passed, but commit confirmation failed: {}",
                    e
                ));
            }
        }
    }

    if !profile.save_config.is_empty() {
        emit!("[SAFETY] Saving configuration after connectivity check.\n".to_string());
        let save_out =
            run_operational_commands(target, &profile.save_config, vendor, os, profiles)?;
        emit!(save_out);
    }

    emit!("[SAFETY] Guarded deployment completed successfully.\n".to_string());
    Ok(full_output)
}

pub fn apply_config_safe(
    target: &SshTarget,
    commands: &str,
    vendor: &str,
    os: &str,
    profiles: &crate::vendor_profiles::VendorProfiles,
) -> Result<String, String> {
    apply_config_safe_inner(target, commands, vendor, os, profiles, None)
}

/// Same as `apply_config` but streams each chunk of output through `tx` as it arrives.
/// On error the error message is also streamed before returning `Err`.
/// Returns the full accumulated output on success.
pub fn apply_config_streaming(
    target: &SshTarget,
    commands: &str,
    vendor: &str,
    os: &str,
    profiles: &crate::vendor_profiles::VendorProfiles,
    tx: tokio::sync::mpsc::UnboundedSender<String>,
) -> Result<String, String> {
    let profile = profiles.resolve(vendor, os);
    let cmd_list = build_deploy_commands(commands, profile);

    let sess = open_session(target)?;
    let mut ch = sess
        .channel_session()
        .map_err(|e| format!("Failed to open channel: {}", e))?;
    ch.request_pty("vt100", None, Some((220, 50, 0, 0)))
        .map_err(|e| format!("PTY request failed: {}", e))?;
    ch.shell()
        .map_err(|e| format!("Shell open failed: {}", e))?;

    sess.set_blocking(false);
    let mut full_output = String::new();

    macro_rules! emit {
        ($chunk:expr) => {{
            let s: String = $chunk;
            let _ = tx.send(s.clone());
            full_output.push_str(&s);
        }};
    }

    emit!(drain(&mut ch, 1500));

    for cmd in &cmd_list {
        ch.write_all(format!("{}\n", cmd).as_bytes())
            .map_err(|e| format!("Failed to send '{}': {}", cmd, e))?;
        let chunk = drain(&mut ch, drain_window_ms(cmd, profile));
        emit!(chunk.clone());

        if let Some(err_line) = detect_error(&chunk, &profile.error_patterns) {
            let err_msg = format!(
                "\n[DEPLOY ERROR] Command '{}' was rejected by the device:\n  {}\n",
                cmd, err_line
            );
            emit!(err_msg);
            sess.set_blocking(true);
            ch.send_eof().ok();
            ch.wait_close().ok();
            return Err(format!(
                "Command failed: '{}'\n  Device said: {}",
                cmd, err_line
            ));
        }
    }

    emit!(drain(&mut ch, 1000));

    sess.set_blocking(true);
    ch.send_eof().ok();
    ch.wait_close().ok();

    Ok(full_output)
}

pub fn apply_config_safe_streaming(
    target: &SshTarget,
    commands: &str,
    vendor: &str,
    os: &str,
    profiles: &crate::vendor_profiles::VendorProfiles,
    tx: tokio::sync::mpsc::UnboundedSender<String>,
) -> Result<String, String> {
    apply_config_safe_inner(target, commands, vendor, os, profiles, Some(tx))
}
