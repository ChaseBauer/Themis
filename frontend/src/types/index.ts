export interface User {
  id: string
  username: string
  email: string
  role: string
}

export interface Device {
  id: string
  name: string
  ip_address: string
  site?: string
  vendor: string
  os: string
  ssh_port: number
  ssh_username?: string
  // ssh_password is never returned by the API
  config_pull_command?: string
  ssh_options?: string
  tags: string[]
  created_at: string
  created_by?: string
}

export interface DeviceTag {
  id: string
  name: string
  created_at: string
}

export interface DeviceSite {
  id: string
  name: string
  created_at: string
}

export type ChangeStatus = 'pending' | 'approved' | 'rejected' | 'deploying' | 'deployed' | 'failed'

export interface ConfigChange {
  id: string
  device_id: string
  device_name: string
  title: string
  description?: string
  config_diff: string
  full_config?: string
  status: ChangeStatus
  submitted_by: string
  submitted_by_username: string
  required_approvals: number
  approval_count: number
  scheduled_at?: string
  scheduled_by?: string
  scheduled_save_as_golden: boolean
  batch_id?: string
  deployed_at?: string
  deployment_output?: string
  created_at: string
  updated_at: string
}

export interface Approval {
  id: string
  change_id: string
  user_id: string
  username: string
  status: 'approved' | 'rejected'
  comment?: string
  created_at: string
}

export interface BatchDevice {
  id: string
  change_id: string
  name: string
  ip_address: string
  status: ChangeStatus
  approval_count: number
  required_approvals: number
  deployed_at?: string
  deployment_output?: string
}

export interface DeploymentAttempt {
  id: string
  change_id: string
  device_id: string
  device_name: string
  status: 'deployed' | 'failed'
  output: string
  config_diff_snapshot: string
  full_config_snapshot?: string
  attempted_by?: string
  attempted_by_username?: string
  created_at: string
}

export interface ChangeDetail extends ConfigChange {
  approvals: Approval[]
  batch_devices: BatchDevice[]
  deployment_attempts: DeploymentAttempt[]
}

export interface GoldenConfig {
  id: string
  device_id: string
  config: string
  version: number
  created_by?: string
  created_by_username?: string
  created_at: string
}

export interface ChangesPage {
  items: ConfigChange[]
  total: number
  page: number
  limit: number
  total_pages: number
}

export interface DeviceHealth {
  device_id: string
  reachable: boolean
  latency_ms?: number
  error?: string
  checked_at: string
}

export interface AppSettings {
  max_golden_configs: number
  default_required_approvals: number
  batch_deploy_concurrency: number
  rollback_guard_minutes: number
  vendor_profiles_toml: string
  vendor_profiles: VendorProfileView[]
  drift_check_interval_secs: number
  drift_check_concurrency: number
  health_check_concurrency: number
  ad_enabled: boolean
  ad_url: string
  ad_bind_dn: string
  ad_bind_password?: string
  ad_bind_password_configured: boolean
  ad_base_dn: string
  ad_user_filter: string
  ad_group_attribute: string
  ad_default_role: string
  ad_role_mappings_toml: string
  oauth_enabled: boolean
  oauth_provider_name: string
  oauth_authorize_url: string
  oauth_token_url: string
  oauth_userinfo_url: string
  oauth_client_id: string
  oauth_client_secret?: string
  oauth_client_secret_configured: boolean
  oauth_redirect_url: string
  oauth_scopes: string
  oauth_username_claim: string
  oauth_email_claim: string
  oauth_role_claim: string
  oauth_default_role: string
  oauth_role_mappings_toml: string
}

export interface VendorProfileView {
  source: string
  profile: VendorProfileEntry
}

export interface VendorProfileEntry {
  matches: string[]
  disable_pager: string[]
  show_config: string
  configure_enter: string[]
  configure_save: string[]
  configure_exit: string[]
  save_config: string[]
  replace_command?: string
  terminal_replace_cmd?: string
  allow_terminal_replace: boolean
  replace_format?: string
  replace_enter: string[]
  replace_exit: string[]
  scp_paths: string[]
  reload_guard_cmd?: string
  reload_guard_cancel?: string
  error_patterns: string[]
  replace_error_patterns: string[]
  replace_error_rules: CommandErrorRule[]
  drift_ignore_prefixes: string[]
  config_ignore_exact: string[]
  config_ignore_prefixes: string[]
  config_ignore_contains: string[]
  guarded_configure_save: string[]
  guard_confirm_cmds: string[]
  command_responses: CommandResponseRule[]
  drain_rules: DrainRule[]
  pull_quiet_ms?: number
  pull_max_ms?: number
}

export interface CommandResponseRule {
  command_starts_with?: string
  output_contains: string[]
  response: string
  max_repeats: number
  drain_ms: number
}

export interface CommandErrorRule {
  command_starts_with?: string
  output_contains: string[]
}

export interface DrainRule {
  command?: string
  command_starts_with?: string
  drain_ms: number
}

export interface ConfigDrift {
  id: string
  device_id: string
  device_name: string
  golden_config_id: string
  current_config: string
  detected_at: string
  last_checked_at: string
  status: 'open' | 'accepted' | 'dismissed' | 'auto_resolved'
  resolved_by?: string
  resolved_by_username?: string
  resolved_at?: string
  accepted_change_id?: string
}

export interface ChangeComment {
  id: string
  change_id: string
  user_id: string
  username: string
  content: string
  parent_comment_id?: string
  line_start?: number
  line_end?: number
  line_snapshot?: string
  mentioned_user_ids: string[]
  resolved: boolean
  resolved_by?: string
  resolved_by_username?: string
  resolved_at?: string
  created_at: string
}

export interface DashboardStats {
  device_count: number
  pending_changes: number
  approved_changes: number
  deployed_changes: number
  user_count: number
  recent_changes: ConfigChange[]
}
