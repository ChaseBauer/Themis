use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// A single vendor profile entry. `matches` is a list of case-insensitive substrings
/// that are tested against the device's vendor field; the first entry whose any keyword
/// appears in the vendor string wins.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VendorProfileEntry {
    pub matches: Vec<String>,
    pub disable_pager: Vec<String>,
    pub show_config: String,
    /// Commands to enter configuration mode (e.g. `configure terminal`).
    #[serde(default)]
    pub configure_enter: Vec<String>,
    /// Commands run inside config mode after the user's commands, before exiting.
    /// Used for vendors that require an explicit commit step.
    #[serde(default)]
    pub configure_save: Vec<String>,
    /// Commands to exit configuration mode (e.g. `end`, `exit`, `return`).
    #[serde(default)]
    pub configure_exit: Vec<String>,
    /// Commands run after leaving config mode to persist the config to non-volatile
    /// storage (e.g. `write memory`, `save force`).
    #[serde(default)]
    pub save_config: Vec<String>,
    /// If set, Themis will try SCP + this command for full-config replace (revert-to-golden).
    /// Use `{path}` as a placeholder for the remote file path.
    #[serde(default)]
    pub replace_command: Option<String>,
    /// If set, used as a PTY-inline fallback for full-config replace when SCP is unavailable.
    /// Themis sends the config content to stdin followed by Ctrl-D (EOF).
    #[serde(default)]
    pub terminal_replace_cmd: Option<String>,
    /// Whether Themis may use `terminal_replace_cmd` as an inline fallback.
    /// Some vendors support the command syntactically but should only use file-based full
    /// replace for reliable multiline handling.
    #[serde(default = "default_allow_terminal_replace")]
    pub allow_terminal_replace: bool,
    /// Optional format hint for full replace uploads.
    /// Used by the replace pipeline to pre-process the config before sending.
    #[serde(default)]
    pub replace_format: Option<String>,
    /// Commands run before `replace_command` to set up the correct CLI context.
    #[serde(default)]
    pub replace_enter: Vec<String>,
    /// Commands run after `replace_command` to activate and persist the loaded config.
    #[serde(default)]
    pub replace_exit: Vec<String>,
    /// Ordered list of SCP upload paths to try for full-config replace.
    /// Use `{filename}` as a placeholder. Falls back to bare filename if empty.
    /// Example: `["flash:/{filename}", "bootflash:/{filename}"]`
    #[serde(default)]
    pub scp_paths: Vec<String>,
    /// Command to schedule a safety rollback reload before applying changes.
    /// If absent, no reload guard is used.
    #[serde(default)]
    pub reload_guard_cmd: Option<String>,
    /// Command to cancel the safety reload after a successful deployment.
    #[serde(default)]
    pub reload_guard_cancel: Option<String>,
    /// Case-insensitive substrings that, when found at the start of an output line,
    /// indicate the device rejected or failed a command.
    #[serde(default)]
    pub error_patterns: Vec<String>,
    /// Additional error patterns that apply only during full-config replace workflows.
    #[serde(default)]
    pub replace_error_patterns: Vec<String>,
    /// Command-scoped error patterns for full-config replace workflows.
    #[serde(default)]
    pub replace_error_rules: Vec<CommandErrorRule>,
    /// Line prefixes (case-insensitive) to strip before drift comparison.
    /// Use this for volatile metadata lines that change on every commit but carry
    /// no configuration meaning.
    #[serde(default)]
    pub drift_ignore_prefixes: Vec<String>,
    /// Exact output lines to remove from pulled configs and drift comparisons.
    #[serde(default)]
    pub config_ignore_exact: Vec<String>,
    /// Output line prefixes to remove from pulled configs and drift comparisons.
    #[serde(default)]
    pub config_ignore_prefixes: Vec<String>,
    /// Output line substrings to remove from pulled configs and drift comparisons.
    #[serde(default)]
    pub config_ignore_contains: Vec<String>,
    /// Used instead of `configure_save` during a safe (guarded) deployment.
    /// Set this when the vendor's guard is the commit step itself, so Themis
    /// schedules a rollback-on-disconnect before committing and confirms after
    /// the SSH check passes.
    #[serde(default)]
    pub guarded_configure_save: Vec<String>,
    /// Commands run after a successful post-deploy SSH check to confirm/finalise
    /// the guarded commit (e.g. `["configure", "commit", "exit"]` for JunOS).
    #[serde(default)]
    pub guard_confirm_cmds: Vec<String>,
    /// How long (ms) the output channel must be silent before Themis considers the
    /// config pull complete. Increase for devices with large configs that pause
    /// mid-output (e.g. JunOS with thousands of interface stanzas). Default: 1200.
    #[serde(default)]
    pub pull_quiet_ms: Option<u64>,
    /// Maximum wall-clock time (ms) to wait for a config pull to finish before
    /// giving up. Default: 30000.
    #[serde(default)]
    pub pull_max_ms: Option<u64>,
    /// Profile-owned responses for interactive prompts raised by commands.
    #[serde(default)]
    pub command_responses: Vec<CommandResponseRule>,
    /// Profile-owned drain timings for slow commands.
    #[serde(default)]
    pub drain_rules: Vec<DrainRule>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CommandResponseRule {
    /// Only apply this rule when the command starts with this value.
    #[serde(default)]
    pub command_starts_with: Option<String>,
    /// Any of these case-insensitive substrings in output triggers the response.
    #[serde(default)]
    pub output_contains: Vec<String>,
    /// Response to send, without the trailing newline. Use an empty string for Enter.
    pub response: String,
    #[serde(default = "default_response_repeats")]
    pub max_repeats: usize,
    #[serde(default = "default_response_drain_ms")]
    pub drain_ms: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CommandErrorRule {
    /// Only apply this rule when the command starts with this value.
    #[serde(default)]
    pub command_starts_with: Option<String>,
    /// Any of these case-insensitive substrings in output marks the command failed.
    #[serde(default)]
    pub output_contains: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DrainRule {
    /// Exact command match.
    #[serde(default)]
    pub command: Option<String>,
    /// Prefix command match.
    #[serde(default)]
    pub command_starts_with: Option<String>,
    pub drain_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct VendorProfileView {
    pub source: String,
    pub profile: VendorProfileEntry,
}

#[derive(Debug, Deserialize, Default)]
struct VendorProfilesFile {
    #[serde(default)]
    vendor_profiles: Vec<VendorProfileEntry>,
}

fn default_allow_terminal_replace() -> bool {
    true
}

fn default_response_repeats() -> usize {
    1
}

fn default_response_drain_ms() -> u64 {
    1500
}

/// Holds user-defined overrides and compiled-in defaults.
/// Overrides are checked first so operators can change any entry without recompiling.
#[derive(Debug, Clone)]
pub struct VendorProfiles {
    overrides: Vec<VendorProfileEntry>,
    builtins: Vec<VendorProfileEntry>,
}

impl VendorProfiles {
    /// Build from a TOML string (from DB settings). Returns None if parsing fails.
    pub fn from_toml_str(toml_str: &str, rollback_minutes: u64) -> Option<Arc<Self>> {
        match toml::from_str::<VendorProfilesFile>(toml_str) {
            Ok(f) => {
                tracing::info!(
                    "Parsed {} vendor profile override(s) from settings",
                    f.vendor_profiles.len()
                );
                Some(Arc::new(VendorProfiles {
                    overrides: apply_rollback_minutes(f.vendor_profiles, rollback_minutes),
                    builtins: builtin_profiles(rollback_minutes),
                }))
            }
            Err(e) => {
                tracing::warn!("Failed to parse vendor profiles TOML from settings: {}", e);
                None
            }
        }
    }

    /// Built-in defaults only, no overrides.
    pub fn builtin(rollback_minutes: u64) -> Arc<Self> {
        Arc::new(VendorProfiles {
            overrides: vec![],
            builtins: builtin_profiles(rollback_minutes),
        })
    }

    /// Load from the path given by `VENDOR_PROFILES_PATH`, if set and readable.
    /// Built-in defaults are always available as a fallback.
    pub fn load() -> Arc<Self> {
        let path = std::env::var("VENDOR_PROFILES_PATH").ok();
        let overrides = path
            .as_deref()
            .and_then(|p| match std::fs::read_to_string(p) {
                Ok(content) => match toml::from_str::<VendorProfilesFile>(&content) {
                    Ok(f) => {
                        tracing::info!(
                            "Loaded {} vendor profile override(s) from {}",
                            f.vendor_profiles.len(),
                            p
                        );
                        Some(f.vendor_profiles)
                    }
                    Err(e) => {
                        tracing::warn!("Failed to parse vendor profiles file {}: {}", p, e);
                        None
                    }
                },
                Err(e) => {
                    tracing::warn!("Cannot read vendor profiles file {}: {}", p, e);
                    None
                }
            })
            .unwrap_or_default();

        Arc::new(VendorProfiles {
            overrides: apply_rollback_minutes(overrides, 2),
            builtins: builtin_profiles(2),
        })
    }

    /// Return the best-matching profile for the given vendor and OS strings.
    /// OS is matched first (more specific), then vendor. Overrides are checked
    /// before built-ins. The last built-in entry (catch-all) is returned when
    /// nothing else matches.
    pub fn resolve(&self, vendor: &str, os: &str) -> &VendorProfileEntry {
        let os_lc = os.to_lowercase();
        let os_lc = os_lc.trim();
        let vendor_lc = vendor.to_lowercase();
        let vendor_lc = vendor_lc.trim();

        let all = self.overrides.iter().chain(self.builtins.iter());

        // OS is matched by exact equality so "NX-OS" never accidentally hits
        // the IOS profile's "ios" keyword via substring.  Vendor falls back to
        // substring matching for human-entered strings.
        if !os_lc.is_empty() {
            if let Some(e) = all
                .clone()
                .find(|e| e.matches.iter().any(|kw| kw.as_str() == os_lc))
            {
                return e;
            }
        }

        self.overrides
            .iter()
            .chain(self.builtins.iter())
            .find(|e| e.matches.iter().any(|kw| vendor_lc.contains(kw.as_str())))
            .unwrap_or_else(|| self.builtins.last().expect("builtins is never empty"))
    }

    pub fn visible_profiles(&self) -> Vec<VendorProfileView> {
        self.overrides
            .iter()
            .cloned()
            .map(|profile| VendorProfileView {
                source: "override".to_string(),
                profile,
            })
            .chain(
                self.builtins
                    .iter()
                    .cloned()
                    .map(|profile| VendorProfileView {
                        source: "built-in".to_string(),
                        profile,
                    }),
            )
            .collect()
    }
}

#[allow(clippy::too_many_arguments)]
fn entry(
    matches: &[&str],
    disable_pager: &[&str],
    show_config: &str,
    configure_enter: &[&str],
    configure_save: &[&str],
    configure_exit: &[&str],
    save_config: &[&str],
    error_patterns: &[&str],
) -> VendorProfileEntry {
    let sv = |s: &[&str]| s.iter().map(|x| x.to_string()).collect();
    VendorProfileEntry {
        matches: sv(matches),
        disable_pager: sv(disable_pager),
        show_config: show_config.to_string(),
        configure_enter: sv(configure_enter),
        configure_save: sv(configure_save),
        configure_exit: sv(configure_exit),
        save_config: sv(save_config),
        error_patterns: sv(error_patterns),
        replace_error_patterns: vec![],
        replace_error_rules: vec![],
        replace_command: None,
        terminal_replace_cmd: None,
        allow_terminal_replace: true,
        replace_format: None,
        replace_enter: vec![],
        replace_exit: vec![],
        scp_paths: vec![],
        reload_guard_cmd: None,
        reload_guard_cancel: None,
        drift_ignore_prefixes: vec![],
        config_ignore_exact: vec![],
        config_ignore_prefixes: vec![],
        config_ignore_contains: vec![],
        guarded_configure_save: vec![],
        guard_confirm_cmds: vec![],
        command_responses: vec![],
        drain_rules: vec![],
        pull_quiet_ms: None,
        pull_max_ms: None,
    }
}

fn command_error_rule(command_starts_with: &str, output_contains: &[&str]) -> CommandErrorRule {
    CommandErrorRule {
        command_starts_with: Some(command_starts_with.to_string()),
        output_contains: output_contains.iter().map(|s| s.to_string()).collect(),
    }
}

fn response_rule(
    command_starts_with: &str,
    output_contains: &[&str],
    response: &str,
    max_repeats: usize,
    drain_ms: u64,
) -> CommandResponseRule {
    CommandResponseRule {
        command_starts_with: Some(command_starts_with.to_string()),
        output_contains: output_contains.iter().map(|s| s.to_string()).collect(),
        response: response.to_string(),
        max_repeats,
        drain_ms,
    }
}

fn drain_rule(
    command: Option<&str>,
    command_starts_with: Option<&str>,
    drain_ms: u64,
) -> DrainRule {
    DrainRule {
        command: command.map(str::to_string),
        command_starts_with: command_starts_with.map(str::to_string),
        drain_ms,
    }
}

fn cisco_style_config_ignore_exact() -> Vec<String> {
    vec![
        "!no configuration change since last restart".to_string(),
        "! no configuration change since last restart".to_string(),
        "building configuration...".to_string(),
    ]
}

fn cisco_style_config_ignore_prefixes() -> Vec<String> {
    vec![
        "!time:".to_string(),
        "! time:".to_string(),
        "! last configuration change at ".to_string(),
        "! nvram config last updated at ".to_string(),
        "!running configuration".to_string(),
        "! running configuration".to_string(),
        "current configuration : ".to_string(),
    ]
}

fn replace_rollback_placeholder(value: &mut String, rollback_minutes: u64) {
    *value = value.replace("{rollback_minutes}", &rollback_minutes.to_string());
}

fn apply_rollback_minutes(
    mut profiles: Vec<VendorProfileEntry>,
    rollback_minutes: u64,
) -> Vec<VendorProfileEntry> {
    for profile in &mut profiles {
        for value in profile
            .disable_pager
            .iter_mut()
            .chain(profile.configure_enter.iter_mut())
            .chain(profile.configure_save.iter_mut())
            .chain(profile.configure_exit.iter_mut())
            .chain(profile.save_config.iter_mut())
            .chain(profile.replace_enter.iter_mut())
            .chain(profile.replace_exit.iter_mut())
            .chain(profile.guarded_configure_save.iter_mut())
            .chain(profile.guard_confirm_cmds.iter_mut())
        {
            replace_rollback_placeholder(value, rollback_minutes);
        }
        replace_rollback_placeholder(&mut profile.show_config, rollback_minutes);
        if let Some(value) = &mut profile.replace_command {
            replace_rollback_placeholder(value, rollback_minutes);
        }
        if let Some(value) = &mut profile.terminal_replace_cmd {
            replace_rollback_placeholder(value, rollback_minutes);
        }
        if let Some(value) = &mut profile.reload_guard_cmd {
            replace_rollback_placeholder(value, rollback_minutes);
        }
        if let Some(value) = &mut profile.reload_guard_cancel {
            replace_rollback_placeholder(value, rollback_minutes);
        }
    }
    profiles
}

fn builtin_profiles(rollback_minutes: u64) -> Vec<VendorProfileEntry> {
    let cisco_ios_errors = &[
        "% invalid input",
        "% incomplete command",
        "% ambiguous command",
        "% unknown command",
        "% bad ip address",
        "% no such interface",
        "% error in line",
        "% failed",
    ];
    let mut profiles = vec![
        // ── Cisco IOS / IOS-XE ───────────────────────────────────────────────
        // configure terminal → user commands → end → write memory
        // "cisco" is here so devices with vendor="Cisco" and no OS set fall
        // through to this profile via the vendor fallback.
        entry(
            &["ios", "ios-xe", "cisco"],
            &["terminal length 0"],
            "show running-config",
            &["configure terminal"],
            &[],
            &["end"],
            &["write memory"],
            cisco_ios_errors,
        ),
        // ── Cisco IOS-XR ─────────────────────────────────────────────────────
        // Uses "configure" (not "configure terminal"), requires explicit
        // "commit" before "end", and does not use "write memory".
        entry(
            &["ios-xr"],
            &["terminal length 0"],
            "show running-config",
            &["configure"],
            &["commit"],
            &["end"],
            &[],
            cisco_ios_errors,
        ),
        // ── Cisco NX-OS ───────────────────────────────────────────────────────
        // Save command is "copy running-config startup-config", not "write
        // memory" (which is not supported on NX-OS).
        entry(
            &["nx-os", "nxos", "cisco-nxos", "cisco-nx-os"],
            &["terminal length 0"],
            "show running-config",
            &["configure terminal"],
            &[],
            &["end"],
            &["copy running-config startup-config"],
            &[
                "% invalid command",
                "invalid interface format",
                "% invalid input",
                "% incomplete command",
                "% ambiguous command",
                "% unknown command",
                "% bad ip address",
                "% no such interface",
                "% error in line",
                "% failed",
            ],
        ),
        // ── Juniper JunOS ────────────────────────────────────────────────────
        // Candidate-config model: configure → commit → exit.
        // No separate save step needed (commit is the save).
        entry(
            &["junos", "juniper"],
            &["set cli screen-length 0"],
            "show configuration | no-more",
            &["configure"],
            &["commit"],
            &["exit"],
            &[],
            &[
                "error:",
                "syntax error,",
                "unknown command.",
                "missing argument.",
                "invalid value",
                "commit failed",
            ],
        ),
        // ── Arista EOS ───────────────────────────────────────────────────────
        // IOS-style CLI: configure terminal → end → write memory.
        entry(
            &["eos", "arista"],
            &["terminal length 0"],
            "show running-config",
            &["configure terminal"],
            &[],
            &["end"],
            &["write memory"],
            &[
                "% invalid input",
                "% incomplete command",
                "% ambiguous command",
                "% unknown command",
                "% error",
            ],
        ),
        // ── Palo Alto PAN-OS ─────────────────────────────────────────────────
        // Candidate-config model: configure → commit → exit.
        entry(
            &["pan-os", "palo"],
            &["set cli pager off"],
            "show config running",
            &["configure"],
            &["commit"],
            &["exit"],
            &[],
            &["error:", "failed:", "invalid syntax", "unknown keyword"],
        ),
        // ── HPE / H3C Comware ────────────────────────────────────────────────
        // system-view → return → save force.
        entry(
            &["comware", "hpe", "h3c"],
            &["screen-length disable"],
            "display current-configuration",
            &["system-view"],
            &[],
            &["return"],
            &["save force"],
            &[
                "error:",
                "unrecognized command found",
                "incomplete command found",
                "ambiguous command found",
                "wrong parameter found",
            ],
        ),
        // ── Fortinet FortiOS ─────────────────────────────────────────────────
        // Flat VDOM hierarchy, no explicit configure/exit wrapper.
        // Each `config <section>` block is self-contained.
        entry(
            &["fortios", "fortinet", "fortigate"],
            &[],
            "show full-configuration",
            &[],
            &[],
            &["end"],
            &[],
            &[
                "command fail.",
                "object not found",
                "invalid value",
                "unknown action",
            ],
        ),
        // ── F5 BIG-IP TMOS ───────────────────────────────────────────────────
        // tmsh commands are run directly; save /sys config persists.
        entry(
            &["tmos", "f5", "bigip", "big-ip"],
            &[],
            "list /all",
            &[],
            &[],
            &[],
            &["save /sys config"],
            &["error:", "syntax error", "invalid command"],
        ),
        // ── MikroTik RouterOS ────────────────────────────────────────────────
        // No configure mode; commands are applied directly.
        entry(
            &["routeros", "mikrotik"],
            &[],
            "export verbose",
            &[],
            &[],
            &[],
            &[],
            &[
                "bad command name",
                "invalid value",
                "expected end of command",
                "input does not match",
            ],
        ),
        // Catch-all, must stay last
        entry(
            &[""],
            &[],
            "show running-config",
            &["configure terminal"],
            &[],
            &["end"],
            &["write memory"],
            &["% invalid input", "% unknown command", "error:"],
        ),
    ];

    for p in profiles.iter_mut() {
        // ── Cisco IOS / IOS-XE ──────────────────────────────────────────────
        if p.matches
            .iter()
            .any(|m| ["ios", "ios-xe", "cisco"].contains(&m.as_str()))
        {
            p.replace_command = Some("configure replace {path} force".to_string());
            p.scp_paths = vec![
                "flash:/{filename}".to_string(),
                "bootflash:/{filename}".to_string(),
                "{filename}".to_string(),
            ];
            p.reload_guard_cmd = Some("reload in {rollback_minutes}".to_string());
            p.reload_guard_cancel = Some("reload cancel".to_string());
            p.config_ignore_exact = cisco_style_config_ignore_exact();
            p.config_ignore_prefixes = cisco_style_config_ignore_prefixes();
            p.replace_error_rules = vec![command_error_rule(
                "configure replace",
                &[
                    "error opening",
                    "permission denied",
                    "not found",
                    "no such file",
                ],
            )];
            p.command_responses = vec![
                response_rule("reload ", &["save?", "[yes/no]"], "no", 1, 2000),
                response_rule("reload ", &["[confirm]", "confirm"], "", 5, 1500),
            ];
            p.drain_rules = vec![drain_rule(Some("write memory"), None, 3000)];
        }
        // ── Cisco NX-OS ──────────────────────────────────────────────────────
        if p.matches
            .iter()
            .any(|m| ["nx-os", "nxos", "cisco-nxos", "cisco-nx-os"].contains(&m.as_str()))
        {
            p.reload_guard_cmd = Some("reload in {rollback_minutes}".to_string());
            p.reload_guard_cancel = Some("reload cancel".to_string());
            p.config_ignore_exact = cisco_style_config_ignore_exact();
            p.config_ignore_prefixes = cisco_style_config_ignore_prefixes();
            p.command_responses = vec![
                response_rule("reload ", &["save?", "[yes/no]"], "no", 1, 2000),
                response_rule("reload ", &["[confirm]", "confirm"], "", 5, 1500),
                response_rule(
                    "copy running-config startup-config",
                    &["destination filename", "[startup-config]", "confirm"],
                    "",
                    2,
                    3000,
                ),
            ];
            p.drain_rules = vec![drain_rule(
                None,
                Some("copy running-config startup-config"),
                3000,
            )];
        }
        // ── Arista EOS ───────────────────────────────────────────────────────
        if p.matches
            .iter()
            .any(|m| ["eos", "arista"].contains(&m.as_str()))
        {
            p.replace_command = Some("configure replace {path}".to_string());
            p.scp_paths = vec![
                "/mnt/flash/{filename}".to_string(),
                "flash:/{filename}".to_string(),
                "{filename}".to_string(),
            ];
            p.reload_guard_cmd = Some("reload in {rollback_minutes}".to_string());
            p.reload_guard_cancel = Some("reload cancel".to_string());
            p.config_ignore_exact = cisco_style_config_ignore_exact();
            p.config_ignore_prefixes = cisco_style_config_ignore_prefixes();
            p.replace_error_rules = vec![command_error_rule(
                "configure replace",
                &[
                    "error opening",
                    "permission denied",
                    "not found",
                    "no such file",
                ],
            )];
            p.command_responses = vec![
                response_rule("reload ", &["save?", "[yes/no]"], "no", 1, 2000),
                response_rule("reload ", &["[confirm]", "confirm"], "", 5, 1500),
            ];
            p.drain_rules = vec![drain_rule(Some("write memory"), None, 3000)];
        }
        // ── Juniper JunOS ────────────────────────────────────────────────────
        // `load override` runs inside config mode and performs a true full replace.
        // JunOS's candidate-config model means uncommitted changes are rolled back
        // automatically on disconnect, providing a built-in safety net.
        if p.matches
            .iter()
            .any(|m| ["junos", "juniper"].contains(&m.as_str()))
        {
            p.replace_command = Some("load override {path}".to_string());
            p.allow_terminal_replace = false;
            p.replace_format = Some("junos-text".to_string());
            p.replace_enter = vec!["configure".to_string()];
            p.replace_exit = vec!["commit".to_string()];
            p.scp_paths = vec![
                "/var/tmp/{filename}".to_string(),
                "/tmp/{filename}".to_string(),
            ];
            p.replace_error_rules = vec![command_error_rule(
                "load override",
                &[
                    "error opening",
                    "permission denied",
                    "not found",
                    "no such file",
                ],
            )];
            // Volatile metadata lines that change on every commit, not meaningful config.
            p.drift_ignore_prefixes = vec!["## ".to_string()];
            p.config_ignore_prefixes = vec!["## ".to_string(), "message from syslogd".to_string()];
            p.config_ignore_contains = vec![
                "master:".to_string(),
                " /kernel: ".to_string(),
                " percentage memory available".to_string(),
                " less than threshold".to_string(),
            ];
            // Candidate-config guard: `commit confirmed N` rolls back automatically if
            // SSH is lost; a follow-up `commit` after SSH check confirms it permanently.
            p.guarded_configure_save = vec!["commit confirmed {rollback_minutes}".to_string()];
            p.guard_confirm_cmds = vec![
                "configure".to_string(),
                "commit".to_string(),
                "exit".to_string(),
            ];
            p.drain_rules = vec![
                drain_rule(Some("commit"), None, 3000),
                drain_rule(None, Some("commit confirmed"), 5000),
            ];
            // JunOS configs can be very large and the device may pause several seconds
            // between output chunks (e.g. between interface stanzas). Use a longer quiet
            // window to avoid truncating the pull mid-config.
            p.pull_quiet_ms = Some(4000);
            p.pull_max_ms = Some(120_000);
        }
    }

    apply_rollback_minutes(profiles, rollback_minutes)
}
