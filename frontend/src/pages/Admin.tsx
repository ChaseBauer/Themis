import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Code2,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react'
import { adminApi } from '../api'
import type { AppSettings, CommandErrorRule, CommandResponseRule, DrainRule, VendorProfileEntry } from '../types'
import { useAuthStore } from '../store'

type Tab = 'users' | 'settings' | 'directory' | 'vendor-profiles'

export default function Admin() {
  const [tab, setTab] = useState<Tab>('users')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Admin</h1>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-white/10">
        {([
          { id: 'users', label: 'Users', Icon: Users },
          { id: 'settings', label: 'Settings', Icon: Settings },
          { id: 'directory', label: 'Directory', Icon: KeyRound },
          { id: 'vendor-profiles', label: 'Vendor Profiles', Icon: Code2 },
        ] as { id: Tab; label: string; Icon: React.ElementType }[]).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'users' && <UsersTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'directory' && <DirectoryTab />}
      {tab === 'vendor-profiles' && <VendorProfilesTab />}
    </div>
  )
}

function UsersTab() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers().then((r) => r.data),
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      adminApi.updateUserRole(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading users...
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-white/10 text-left">
            <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Username</th>
            <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Email</th>
            <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Role</th>
            <th className="px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((user) => (
            <tr
              key={user.id}
              className="border-b border-gray-100 dark:border-white/5 last:border-0"
            >
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                {user.username}
                {user.id === currentUser?.id && (
                  <span className="ml-2 text-xs text-gray-400">(you)</span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{user.email}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    user.role === 'admin'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                      : user.role === 'viewer'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                  }`}
                >
                  {user.role}
                </span>
              </td>
              <td className="px-4 py-3">
                {user.id !== currentUser?.id && (
                  <select
                    value={user.role}
                    onChange={(e) => roleMutation.mutate({ id: user.id, role: e.target.value })}
                    disabled={roleMutation.isPending}
                    className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 disabled:opacity-50"
                  >
                    <option value="viewer">viewer</option>
                    <option value="engineer">engineer</option>
                    <option value="admin">admin</option>
                  </select>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SettingsTab() {
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => adminApi.getSettings().then((r) => r.data),
  })

  const [form, setForm] = useState<{
    max_golden_configs: string
    default_required_approvals: string
    batch_deploy_concurrency: string
    rollback_guard_minutes: string
    drift_check_interval_secs: string
    drift_check_concurrency: string
    health_check_concurrency: string
  }>({
    max_golden_configs: '',
    default_required_approvals: '',
    batch_deploy_concurrency: '',
    rollback_guard_minutes: '',
    drift_check_interval_secs: '',
    drift_check_concurrency: '',
    health_check_concurrency: '',
  })
  const [initialized, setInitialized] = useState(false)

  if (settings && !initialized) {
    setForm({
      max_golden_configs: String(settings.max_golden_configs),
      default_required_approvals: String(settings.default_required_approvals),
      batch_deploy_concurrency: String(settings.batch_deploy_concurrency),
      rollback_guard_minutes: String(settings.rollback_guard_minutes),
      drift_check_interval_secs: String(settings.drift_check_interval_secs),
      drift_check_concurrency: String(settings.drift_check_concurrency),
      health_check_concurrency: String(settings.health_check_concurrency),
    })
    setInitialized(true)
  }

  const mutation = useMutation({
    mutationFn: (data: Partial<AppSettings>) => adminApi.updateSettings(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-settings'] }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading settings...
      </div>
    )
  }

  const handleSave = () => {
    mutation.mutate({
      max_golden_configs: parseInt(form.max_golden_configs, 10) || 10,
      default_required_approvals: parseInt(form.default_required_approvals, 10) || 1,
      batch_deploy_concurrency: parseInt(form.batch_deploy_concurrency, 10) || 5,
      rollback_guard_minutes: parseInt(form.rollback_guard_minutes, 10) || 2,
      drift_check_interval_secs: parseInt(form.drift_check_interval_secs, 10) || 30,
      drift_check_concurrency: parseInt(form.drift_check_concurrency, 10) || 10,
      health_check_concurrency: parseInt(form.health_check_concurrency, 10) || 25,
    })
  }

  const errorMessage =
    (mutation.error as { response?: { data?: { error?: string } } } | null)?.response?.data
      ?.error ?? 'Save failed'

  return (
    <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-6 space-y-6 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Max Golden Configs per Device
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Oldest versions are pruned automatically when this limit is exceeded.
        </p>
        <input
          type="number"
          min={1}
          max={100}
          value={form.max_golden_configs}
          onChange={(e) => setForm((f) => ({ ...f, max_golden_configs: e.target.value }))}
          className="w-32 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Default Required Approvals
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          How many approvals a new change request requires before it can be deployed.
        </p>
        <input
          type="number"
          min={1}
          max={10}
          value={form.default_required_approvals}
          onChange={(e) =>
            setForm((f) => ({ ...f, default_required_approvals: e.target.value }))
          }
          className="w-32 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Batch Deploy Concurrency
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Maximum number of devices Themis deploys to at the same time when using Deploy All Devices.
        </p>
        <input
          type="number"
          min={1}
          max={50}
          value={form.batch_deploy_concurrency}
          onChange={(e) =>
            setForm((f) => ({ ...f, batch_deploy_concurrency: e.target.value }))
          }
          className="w-32 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Rollback Guard Time
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Minutes before a guarded rollback expires. Built-in profiles use this for reload guards
          and Junos commit-confirmed safety.
        </p>
        <input
          type="number"
          min={1}
          max={60}
          value={form.rollback_guard_minutes}
          onChange={(e) =>
            setForm((f) => ({ ...f, rollback_guard_minutes: e.target.value }))
          }
          className="w-32 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Drift Check Interval
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Seconds between drift check cycles. Large inventories should use a longer interval.
        </p>
        <input
          type="number"
          min={10}
          max={86400}
          value={form.drift_check_interval_secs}
          onChange={(e) =>
            setForm((f) => ({ ...f, drift_check_interval_secs: e.target.value }))
          }
          className="w-32 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Drift Check Concurrency
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Maximum number of devices Themis pulls from at the same time during drift checks.
        </p>
        <input
          type="number"
          min={1}
          max={100}
          value={form.drift_check_concurrency}
          onChange={(e) =>
            setForm((f) => ({ ...f, drift_check_concurrency: e.target.value }))
          }
          className="w-32 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Health Check Concurrency
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Maximum number of device reachability checks Themis runs at the same time.
        </p>
        <input
          type="number"
          min={1}
          max={200}
          value={form.health_check_concurrency}
          onChange={(e) =>
            setForm((f) => ({ ...f, health_check_concurrency: e.target.value }))
          }
          className="w-32 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {mutation.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Changes
        </button>
        {mutation.isSuccess && (
          <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
        )}
        {mutation.isError && (
          <span className="text-sm text-red-600 dark:text-red-400">{errorMessage}</span>
        )}
      </div>
    </div>
  )
}

function DirectoryTab() {
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => adminApi.getSettings().then((r) => r.data),
  })

  const [form, setForm] = useState<{
    ad_enabled: boolean
    ad_url: string
    ad_bind_dn: string
    ad_bind_password: string
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
    oauth_client_secret: string
    oauth_redirect_url: string
    oauth_scopes: string
    oauth_username_claim: string
    oauth_email_claim: string
    oauth_role_claim: string
    oauth_default_role: string
    oauth_role_mappings_toml: string
  }>({
    ad_enabled: false,
    ad_url: '',
    ad_bind_dn: '',
    ad_bind_password: '',
    ad_base_dn: '',
    ad_user_filter: '(&(objectClass=user)(sAMAccountName={username}))',
    ad_group_attribute: 'memberOf',
    ad_default_role: 'viewer',
    ad_role_mappings_toml: '',
    oauth_enabled: false,
    oauth_provider_name: 'OAuth',
    oauth_authorize_url: '',
    oauth_token_url: '',
    oauth_userinfo_url: '',
    oauth_client_id: '',
    oauth_client_secret: '',
    oauth_redirect_url: 'http://localhost/api/auth/oauth/callback',
    oauth_scopes: 'openid profile email',
    oauth_username_claim: 'preferred_username',
    oauth_email_claim: 'email',
    oauth_role_claim: 'groups',
    oauth_default_role: 'viewer',
    oauth_role_mappings_toml: '',
  })
  const [initialized, setInitialized] = useState(false)

  if (settings && !initialized) {
    setForm({
      ad_enabled: settings.ad_enabled,
      ad_url: settings.ad_url,
      ad_bind_dn: settings.ad_bind_dn,
      ad_bind_password: '',
      ad_base_dn: settings.ad_base_dn,
      ad_user_filter: settings.ad_user_filter,
      ad_group_attribute: settings.ad_group_attribute,
      ad_default_role: settings.ad_default_role,
      ad_role_mappings_toml: settings.ad_role_mappings_toml,
      oauth_enabled: settings.oauth_enabled,
      oauth_provider_name: settings.oauth_provider_name,
      oauth_authorize_url: settings.oauth_authorize_url,
      oauth_token_url: settings.oauth_token_url,
      oauth_userinfo_url: settings.oauth_userinfo_url,
      oauth_client_id: settings.oauth_client_id,
      oauth_client_secret: '',
      oauth_redirect_url: settings.oauth_redirect_url,
      oauth_scopes: settings.oauth_scopes,
      oauth_username_claim: settings.oauth_username_claim,
      oauth_email_claim: settings.oauth_email_claim,
      oauth_role_claim: settings.oauth_role_claim,
      oauth_default_role: settings.oauth_default_role,
      oauth_role_mappings_toml: settings.oauth_role_mappings_toml,
    })
    setInitialized(true)
  }

  const mutation = useMutation({
    mutationFn: (data: Partial<AppSettings>) => adminApi.updateSettings(data),
    onSuccess: () => {
      setForm((f) => ({ ...f, ad_bind_password: '', oauth_client_secret: '' }))
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading directory settings...
      </div>
    )
  }

  const handleSave = () => {
    mutation.mutate({
      ad_enabled: form.ad_enabled,
      ad_url: form.ad_url,
      ad_bind_dn: form.ad_bind_dn,
      ad_bind_password: form.ad_bind_password,
      ad_base_dn: form.ad_base_dn,
      ad_user_filter: form.ad_user_filter,
      ad_group_attribute: form.ad_group_attribute,
      ad_default_role: form.ad_default_role,
      ad_role_mappings_toml: form.ad_role_mappings_toml,
      oauth_enabled: form.oauth_enabled,
      oauth_provider_name: form.oauth_provider_name,
      oauth_authorize_url: form.oauth_authorize_url,
      oauth_token_url: form.oauth_token_url,
      oauth_userinfo_url: form.oauth_userinfo_url,
      oauth_client_id: form.oauth_client_id,
      oauth_client_secret: form.oauth_client_secret,
      oauth_redirect_url: form.oauth_redirect_url,
      oauth_scopes: form.oauth_scopes,
      oauth_username_claim: form.oauth_username_claim,
      oauth_email_claim: form.oauth_email_claim,
      oauth_role_claim: form.oauth_role_claim,
      oauth_default_role: form.oauth_default_role,
      oauth_role_mappings_toml: form.oauth_role_mappings_toml,
    })
  }

  const errorMessage =
    (mutation.error as { response?: { data?: { error?: string } } } | null)?.response?.data
      ?.error ?? 'Save failed'

  const mappingPlaceholder = `admin_groups = ["CN=Themis Admins,OU=Groups,DC=example,DC=com"]\nengineer_groups = ["CN=Network Engineers,OU=Groups,DC=example,DC=com"]\nviewer_groups = ["CN=NOC Viewers,OU=Groups,DC=example,DC=com"]`
  const oauthMappingPlaceholder = `admin_groups = ["themis-admins"]\nengineer_groups = ["network-engineers"]\nviewer_groups = ["noc-viewers"]`

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-6 space-y-5">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.ad_enabled}
            onChange={(e) => setForm((f) => ({ ...f, ad_enabled: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Enable AD / LDAP login
          </span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="LDAP URL"
            value={form.ad_url}
            placeholder="ldaps://dc01.example.com:636"
            onChange={(value) => setForm((f) => ({ ...f, ad_url: value }))}
          />
          <TextField
            label="Base DN"
            value={form.ad_base_dn}
            placeholder="DC=example,DC=com"
            onChange={(value) => setForm((f) => ({ ...f, ad_base_dn: value }))}
          />
          <TextField
            label="Bind DN"
            value={form.ad_bind_dn}
            placeholder="CN=svc-themis,OU=Service Accounts,DC=example,DC=com"
            onChange={(value) => setForm((f) => ({ ...f, ad_bind_dn: value }))}
          />
          <TextField
            label="Bind Password"
            type="password"
            value={form.ad_bind_password}
            placeholder={
              settings?.ad_bind_password_configured ? 'Configured; leave blank to keep' : ''
            }
            onChange={(value) => setForm((f) => ({ ...f, ad_bind_password: value }))}
          />
          <TextField
            label="User Search Filter"
            value={form.ad_user_filter}
            placeholder="(&(objectClass=user)(sAMAccountName={username}))"
            onChange={(value) => setForm((f) => ({ ...f, ad_user_filter: value }))}
          />
          <TextField
            label="Group Attribute"
            value={form.ad_group_attribute}
            placeholder="memberOf"
            onChange={(value) => setForm((f) => ({ ...f, ad_group_attribute: value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Default Role
          </label>
          <select
            value={form.ad_default_role}
            onChange={(e) => setForm((f) => ({ ...f, ad_default_role: e.target.value }))}
            className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="viewer">viewer</option>
            <option value="engineer">engineer</option>
            <option value="admin">admin</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Role Mapping
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Themis checks admin, then engineer, then viewer groups. Full DNs or group CN names are accepted.
        </p>
        <textarea
          rows={9}
          value={form.ad_role_mappings_toml}
          onChange={(e) => setForm((f) => ({ ...f, ad_role_mappings_toml: e.target.value }))}
          placeholder={mappingPlaceholder}
          spellCheck={false}
          className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 p-6 space-y-5">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.oauth_enabled}
            onChange={(e) => setForm((f) => ({ ...f, oauth_enabled: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Enable OAuth / OIDC login
          </span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="Provider Name"
            value={form.oauth_provider_name}
            placeholder="Microsoft Entra ID"
            onChange={(value) => setForm((f) => ({ ...f, oauth_provider_name: value }))}
          />
          <TextField
            label="Redirect URL"
            value={form.oauth_redirect_url}
            placeholder="http://localhost/api/auth/oauth/callback"
            onChange={(value) => setForm((f) => ({ ...f, oauth_redirect_url: value }))}
          />
          <TextField
            label="Authorize URL"
            value={form.oauth_authorize_url}
            placeholder="https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize"
            onChange={(value) => setForm((f) => ({ ...f, oauth_authorize_url: value }))}
          />
          <TextField
            label="Token URL"
            value={form.oauth_token_url}
            placeholder="https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token"
            onChange={(value) => setForm((f) => ({ ...f, oauth_token_url: value }))}
          />
          <TextField
            label="Userinfo URL"
            value={form.oauth_userinfo_url}
            placeholder="https://graph.microsoft.com/oidc/userinfo"
            onChange={(value) => setForm((f) => ({ ...f, oauth_userinfo_url: value }))}
          />
          <TextField
            label="Scopes"
            value={form.oauth_scopes}
            placeholder="openid profile email"
            onChange={(value) => setForm((f) => ({ ...f, oauth_scopes: value }))}
          />
          <TextField
            label="Client ID"
            value={form.oauth_client_id}
            onChange={(value) => setForm((f) => ({ ...f, oauth_client_id: value }))}
          />
          <TextField
            label="Client Secret"
            type="password"
            value={form.oauth_client_secret}
            placeholder={
              settings?.oauth_client_secret_configured ? 'Configured; leave blank to keep' : ''
            }
            onChange={(value) => setForm((f) => ({ ...f, oauth_client_secret: value }))}
          />
          <TextField
            label="Username Claim"
            value={form.oauth_username_claim}
            placeholder="preferred_username"
            onChange={(value) => setForm((f) => ({ ...f, oauth_username_claim: value }))}
          />
          <TextField
            label="Email Claim"
            value={form.oauth_email_claim}
            placeholder="email"
            onChange={(value) => setForm((f) => ({ ...f, oauth_email_claim: value }))}
          />
          <TextField
            label="Role Claim"
            value={form.oauth_role_claim}
            placeholder="groups"
            onChange={(value) => setForm((f) => ({ ...f, oauth_role_claim: value }))}
          />
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              OAuth Default Role
            </span>
            <select
              value={form.oauth_default_role}
              onChange={(e) => setForm((f) => ({ ...f, oauth_default_role: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="viewer">viewer</option>
              <option value="engineer">engineer</option>
              <option value="admin">admin</option>
            </select>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            OAuth Role Mapping
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Values are matched against the configured role claim, such as groups or roles.
          </p>
          <textarea
            rows={7}
            value={form.oauth_role_mappings_toml}
            onChange={(e) =>
              setForm((f) => ({ ...f, oauth_role_mappings_toml: e.target.value }))
            }
            placeholder={oauthMappingPlaceholder}
            spellCheck={false}
            className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {mutation.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Directory Settings
        </button>
        {mutation.isSuccess && (
          <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
        )}
        {mutation.isError && (
          <span className="text-sm text-red-600 dark:text-red-400">{errorMessage}</span>
        )}
      </div>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  )
}

function VendorProfilesTab() {
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => adminApi.getSettings().then((r) => r.data),
  })

  const [toml, setToml] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [viewingKey, setViewingKey] = useState<string | null>(null)
  const [draftProfile, setDraftProfile] = useState<VendorProfileEntry | null>(null)

  if (settings && !initialized) {
    setToml(settings.vendor_profiles_toml)
    setInitialized(true)
  }

  const mutation = useMutation({
    mutationFn: (vendor_profiles_toml: string) =>
      adminApi.updateSettings({ vendor_profiles_toml }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-settings'] }),
  })

  const prependOverrideText = (current: string | null, block: string) => {
      const existing = (current ?? '').trim()
      return existing ? `${block.trim()}\n\n${existing}\n` : `${block.trim()}\n`
  }

  const addProfileTemplate = () => {
    setEditingKey('new-profile')
    setViewingKey(null)
    setDraftProfile(newVendorProfile())
  }

  const editProfile = (key: string, profile: VendorProfileEntry) => {
    setEditingKey(key)
    setViewingKey(null)
    setDraftProfile(cloneProfile(profile))
  }

  const updateDraft = (patch: Partial<VendorProfileEntry>) => {
    setDraftProfile((current) => (current ? { ...current, ...patch } : current))
  }

  const saveDraft = () => {
    if (!draftProfile) return
    const nextToml = prependOverrideText(toml, profileToToml(draftProfile))
    setToml(nextToml)
    setEditingKey(null)
    setViewingKey(null)
    setDraftProfile(null)
    mutation.mutate(nextToml)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Active Vendor Profiles
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Profiles tell Themis how to pull configs, deploy changes, recover safely, and ignore
            noisy drift lines for each network OS. Overrides are checked before built-ins.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={addProfileTemplate}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10"
          >
            <Plus className="w-4 h-4" />
            Add Vendor Profile
          </button>
        </div>

        {editingKey === 'new-profile' && draftProfile && (
          <VendorProfileEditor
            title="New Vendor Profile"
            profile={draftProfile}
            onChange={updateDraft}
            onCancel={() => {
              setEditingKey(null)
              setDraftProfile(null)
            }}
            onSave={saveDraft}
            isSaving={mutation.isPending}
          />
        )}

        <div className="grid gap-3">
          {settings?.vendor_profiles?.map(({ source, profile }, idx) => (
            <VendorProfileCard
              key={`${source}-${profile.matches.join('-')}-${idx}`}
              source={source}
              profile={profile}
              isViewing={viewingKey === `${source}-${idx}`}
              isEditing={editingKey === `${source}-${idx}`}
              draft={editingKey === `${source}-${idx}` ? draftProfile : null}
              onToggleView={() => {
                setEditingKey(null)
                setDraftProfile(null)
                setViewingKey((current) =>
                  current === `${source}-${idx}` ? null : `${source}-${idx}`
                )
              }}
              onDraftChange={updateDraft}
              onCancelEdit={() => {
                setEditingKey(null)
                setDraftProfile(null)
              }}
              onSaveEdit={saveDraft}
              isSaving={mutation.isPending}
              onEdit={() => editProfile(`${source}-${idx}`, profile)}
            />
          ))}
        </div>
      </div>

      {mutation.isSuccess && (
        <span className="text-sm text-green-600 dark:text-green-400">
          Saved , changes take effect immediately
        </span>
      )}
      {mutation.isError && (
        <span className="text-sm text-red-600 dark:text-red-400">
          Save failed , check profile fields
        </span>
      )}
    </div>
  )
}

function VendorProfileCard({
  source,
  profile,
  isViewing,
  isEditing,
  draft,
  onToggleView,
  onDraftChange,
  onCancelEdit,
  onSaveEdit,
  isSaving,
  onEdit,
}: {
  source: string
  profile: VendorProfileEntry
  isViewing: boolean
  isEditing: boolean
  draft: VendorProfileEntry | null
  onToggleView: () => void
  onDraftChange: (patch: Partial<VendorProfileEntry>) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  isSaving: boolean
  onEdit: () => void
}) {
  return (
    <div className="group bg-white dark:bg-white/5 rounded-lg border border-gray-200 dark:border-white/10">
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            onClick={onToggleView}
            className="min-w-0 text-left flex-1"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">
                {profile.matches.filter(Boolean).join(', ') || 'default'}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  source === 'override'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
                    : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                }`}
              >
                {source}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words">
              Pull: {profile.show_config}
            </div>
          </button>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <ProfileCapability label="Deploy" enabled={profile.configure_enter.length > 0 || profile.save_config.length > 0 || profile.configure_save.length > 0} />
            <ProfileCapability label="Safe" enabled={Boolean(profile.reload_guard_cmd || profile.guarded_configure_save.length)} />
            <ProfileCapability label="Revert" enabled={Boolean(profile.replace_command || profile.terminal_replace_cmd)} />
            <ProfileCapability label="Drift" enabled={Boolean(profile.drift_ignore_prefixes.length || profile.config_ignore_exact.length || profile.config_ignore_prefixes.length || profile.config_ignore_contains.length)} />
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onEdit()
              }}
              className="inline-flex items-center gap-1 rounded border border-gray-200 dark:border-white/10 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-gray-50 dark:hover:bg-white/10 transition-opacity"
            >
              <Pencil className="w-3 h-3" />
              Edit Override
            </button>
          </div>
        </div>
      </div>

      {isEditing && draft ? (
        <VendorProfileEditor
          title={`Edit ${profile.matches.filter(Boolean).join(', ') || 'default'} Override`}
          profile={draft}
          onChange={onDraftChange}
          onCancel={onCancelEdit}
          onSave={onSaveEdit}
          isSaving={isSaving}
        />
      ) : isViewing ? (
        <div className="border-t border-gray-200 dark:border-white/10 px-4 py-4 space-y-5">
          <ProfileSummary profile={profile} />
          <div className="grid gap-4 md:grid-cols-2">
            <ProfileGroup title="Pull Config">
              <ProfileList label="Disable Pager" items={profile.disable_pager} />
              <ProfileList label="Show Config" items={[profile.show_config]} />
              <ProfileList label="Pull Timing" items={[
                `Quiet: ${profile.pull_quiet_ms ?? 1200}ms`,
                `Max: ${profile.pull_max_ms ?? 30000}ms`,
              ]} />
            </ProfileGroup>
            <ProfileGroup title="Deploy Changes">
              <ProfileList label="Enter Config Mode" items={profile.configure_enter} />
              <ProfileList label="Commit or Save in Config Mode" items={profile.configure_save} />
              <ProfileList label="Exit Config Mode" items={profile.configure_exit} />
              <ProfileList label="Save to Startup" items={profile.save_config} />
              <ProfileList label="Deploy Error Patterns" items={profile.error_patterns} />
            </ProfileGroup>
            <ProfileGroup title="Safety">
              <ProfileList label="Reload Guard" items={[profile.reload_guard_cmd, profile.reload_guard_cancel].filter(Boolean) as string[]} />
              <ProfileList label="Commit Confirmed Guard" items={profile.guarded_configure_save} />
              <ProfileList label="Confirm Guard" items={profile.guard_confirm_cmds} />
              <ProfileList
                label="Prompt Responses"
                items={profile.command_responses.map(
                  (rule) => `${rule.command_starts_with || '*'} watches ${rule.output_contains.join(', ')}`
                )}
              />
            </ProfileGroup>
            <ProfileGroup title="Revert to Golden">
              <ProfileList label="Terminal Replace" items={profile.terminal_replace_cmd ? [profile.terminal_replace_cmd] : []} />
              <ProfileList label="File Replace" items={profile.replace_command ? [profile.replace_command] : []} />
              <ProfileList label="Replace Enter" items={profile.replace_enter} />
              <ProfileList label="Replace Exit" items={profile.replace_exit} />
              <ProfileList label="SCP Paths" items={profile.scp_paths} />
              <ProfileList label="Replace Error Patterns" items={profile.replace_error_patterns} />
              <ProfileList
                label="Replace Error Rules"
                items={profile.replace_error_rules.map(
                  (rule) => `${rule.command_starts_with || '*'} watches ${rule.output_contains.join(', ')}`
                )}
              />
            </ProfileGroup>
            <ProfileGroup title="Drift Cleanup">
              <ProfileList label="Ignore Exact Lines" items={profile.config_ignore_exact} />
              <ProfileList label="Ignore Prefixes" items={[...profile.drift_ignore_prefixes, ...profile.config_ignore_prefixes]} />
              <ProfileList label="Ignore Contains" items={profile.config_ignore_contains} />
            </ProfileGroup>
            <ProfileGroup title="Advanced Timing">
              <ProfileList
                label="Drain Rules"
                items={profile.drain_rules.map(
                  (rule) => `${rule.command || rule.command_starts_with || '*'}: ${rule.drain_ms}ms`
                )}
              />
            </ProfileGroup>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function VendorProfileEditor({
  title,
  profile,
  onChange,
  onCancel,
  onSave,
  isSaving,
}: {
  title: string
  profile: VendorProfileEntry
  onChange: (patch: Partial<VendorProfileEntry>) => void
  onCancel: () => void
  onSave: () => void
  isSaving: boolean
}) {
  return (
    <div className="border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 px-4 py-4 space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-300 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-medium text-amber-900 dark:text-amber-100">{title}</div>
          <div className="text-xs text-amber-800 dark:text-amber-100/80">
            Saving creates an override that takes precedence over the built-in profile.
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <ProfileSection title="1. Match and Pull Config" description="Choose which devices use this profile and how Themis captures running config." defaultOpen>
          <ProfileArrayField
            label="OS and Vendor Matches"
            values={profile.matches}
            help="Put OS names first. OS matches are exact, vendor matches are substring based."
            onChange={(matches) => onChange({ matches })}
          />
          <ProfileField
            label="Show Config Command"
            value={profile.show_config}
            help="The command that prints the full running configuration."
            onChange={(show_config) => onChange({ show_config })}
          />
          <ProfileArrayField
            label="Disable Pager Commands"
            values={profile.disable_pager}
            help="Commands sent before pulling config so output is not paginated."
            onChange={(disable_pager) => onChange({ disable_pager })}
          />
          <ProfileNumberField
            label="Pull Quiet ms"
            value={profile.pull_quiet_ms}
            min={100}
            step={100}
            placeholder="1200 default"
            help="How long output must be quiet before Themis treats the pull as complete."
            onChange={(pull_quiet_ms) => onChange({ pull_quiet_ms })}
          />
          <ProfileNumberField
            label="Pull Max ms"
            value={profile.pull_max_ms}
            min={1000}
            step={1000}
            placeholder="30000 default"
            help="Maximum total wait time for one config pull."
            onChange={(pull_max_ms) => onChange({ pull_max_ms })}
          />
        </ProfileSection>

        <ProfileSection title="2. Deploy Changes" description="Define the normal command flow for applying a reviewed change.">
          <ProfileArrayField
            label="Enter Config Mode"
            values={profile.configure_enter}
            help="Examples: configure terminal, configure, system-view."
            onChange={(configure_enter) => onChange({ configure_enter })}
          />
          <ProfileArrayField
            label="Commit Inside Config Mode"
            values={profile.configure_save}
            help="Use for candidate-config systems. Leave empty for IOS-style devices."
            onChange={(configure_save) => onChange({ configure_save })}
          />
          <ProfileArrayField
            label="Exit Config Mode"
            values={profile.configure_exit}
            help="Examples: end, exit, return."
            onChange={(configure_exit) => onChange({ configure_exit })}
          />
          <ProfileArrayField
            label="Save to Startup Config"
            values={profile.save_config}
            help="Examples: write memory, copy running-config startup-config. Leave empty if commit persists config."
            onChange={(save_config) => onChange({ save_config })}
          />
          <ProfileArrayField
            label="Deploy Error Patterns"
            values={profile.error_patterns}
            help="If command output contains one of these strings, deployment stops."
            onChange={(error_patterns) => onChange({ error_patterns })}
          />
        </ProfileSection>

        <ProfileSection title="3. Safety Rollback" description="Protect management access when a deployment changes something risky.">
          <ProfileField
            label="Reload Guard Command"
            value={profile.reload_guard_cmd ?? ''}
            help="Schedules rollback by reload. Use {rollback_minutes} for the admin setting."
            onChange={(reload_guard_cmd) => onChange({ reload_guard_cmd: reload_guard_cmd || undefined })}
          />
          <ProfileField
            label="Reload Guard Cancel"
            value={profile.reload_guard_cancel ?? ''}
            help="Cancels the scheduled reload after Themis verifies SSH still works."
            onChange={(reload_guard_cancel) => onChange({ reload_guard_cancel: reload_guard_cancel || undefined })}
          />
          <ProfileArrayField
            label="Commit Confirmed Guard"
            values={profile.guarded_configure_save}
            help="Use for Junos-style commit confirmed workflows."
            onChange={(guarded_configure_save) => onChange({ guarded_configure_save })}
          />
          <ProfileArrayField
            label="Confirm Guard Commands"
            values={profile.guard_confirm_cmds}
            help="Commands that permanently confirm a guarded commit after SSH passes."
            onChange={(guard_confirm_cmds) => onChange({ guard_confirm_cmds })}
          />
          <CommandResponsesEditor
            rules={profile.command_responses}
            onChange={(command_responses) => onChange({ command_responses })}
          />
        </ProfileSection>

        <ProfileSection title="4. Revert to Golden" description="Define how Themis loads a complete golden config back to the device.">
          <ProfileField
            label="Terminal Replace Command"
            value={profile.terminal_replace_cmd ?? ''}
            help="Streams full config into a command. Good when SCP is unavailable."
            onChange={(terminal_replace_cmd) => onChange({ terminal_replace_cmd: terminal_replace_cmd || undefined })}
          />
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Allow Terminal Replace
            </span>
            <div className="flex items-center gap-2 h-9">
              <input
                type="checkbox"
                checked={profile.allow_terminal_replace}
                onChange={(e) => onChange({ allow_terminal_replace: e.target.checked })}
                className="rounded border-gray-300 dark:border-white/20 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Try terminal replace before SCP
              </span>
            </div>
          </label>
          <ProfileField
            label="File Replace Command"
            value={profile.replace_command ?? ''}
            help="SCP-based full replace command. Use {path} where the uploaded file path belongs."
            onChange={(replace_command) => onChange({ replace_command: replace_command || undefined })}
          />
          <ProfileField
            label="Replace Format"
            value={profile.replace_format ?? ''}
            help="Optional format hint, for example junos-text."
            onChange={(replace_format) => onChange({ replace_format: replace_format || undefined })}
          />
          <ProfileArrayField
            label="Replace Enter"
            values={profile.replace_enter}
            help="Commands sent before full replace."
            onChange={(replace_enter) => onChange({ replace_enter })}
          />
          <ProfileArrayField
            label="Replace Exit"
            values={profile.replace_exit}
            help="Commands sent after full replace, often commit."
            onChange={(replace_exit) => onChange({ replace_exit })}
          />
          <ProfileArrayField
            label="SCP Paths"
            values={profile.scp_paths}
            help="Remote upload paths. Use {filename} as the placeholder."
            onChange={(scp_paths) => onChange({ scp_paths })}
          />
          <ProfileArrayField
            label="Replace Error Patterns"
            values={profile.replace_error_patterns}
            help="Extra errors to watch for during full replace."
            onChange={(replace_error_patterns) => onChange({ replace_error_patterns })}
          />
          <CommandErrorRulesEditor
            rules={profile.replace_error_rules}
            onChange={(replace_error_rules) => onChange({ replace_error_rules })}
          />
        </ProfileSection>

        <ProfileSection title="5. Drift Cleanup" description="Remove timestamps, prompts, banners, and other non-config noise before comparing configs.">
          <ProfileArrayField
            label="Ignore Exact Lines"
            values={profile.config_ignore_exact}
            help="Whole lines to remove when they match exactly."
            onChange={(config_ignore_exact) => onChange({ config_ignore_exact })}
          />
          <ProfileArrayField
            label="Ignore Line Prefixes"
            values={profile.config_ignore_prefixes}
            help="Lines starting with these strings are removed."
            onChange={(config_ignore_prefixes) => onChange({ config_ignore_prefixes })}
          />
          <ProfileArrayField
            label="Ignore Drift Prefixes"
            values={profile.drift_ignore_prefixes}
            help="Legacy drift prefix list. Also useful for metadata emitted by the OS."
            onChange={(drift_ignore_prefixes) => onChange({ drift_ignore_prefixes })}
          />
          <ProfileArrayField
            label="Ignore Lines Containing"
            values={profile.config_ignore_contains}
            help="Lines containing these strings are removed."
            onChange={(config_ignore_contains) => onChange({ config_ignore_contains })}
          />
        </ProfileSection>

        <ProfileSection title="6. Advanced Timing" description="Tune slow commands that need longer output drain windows.">
          <DrainRulesEditor
            rules={profile.drain_rules}
            onChange={(drain_rules) => onChange({ drain_rules })}
          />
        </ProfileSection>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Override
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function ProfileSection({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string
  description: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5"
    >
      <summary className="cursor-pointer select-none px-4 py-3">
        <div className="inline-flex flex-col">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{description}</span>
        </div>
      </summary>
      <div className="border-t border-gray-100 dark:border-white/10 px-4 py-4 grid gap-4 md:grid-cols-2">
        {children}
      </div>
    </details>
  )
}

function ProfileCapability({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
        enabled
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          : 'bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-500'
      }`}
    >
      {label}
    </span>
  )
}

function ProfileGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 p-3 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</div>
      {children}
    </div>
  )
}

function ProfileSummary({ profile }: { profile: VendorProfileEntry }) {
  const flow = [
    profile.configure_enter.length ? `enter: ${profile.configure_enter.join(', ')}` : null,
    profile.configure_save.length ? `commit: ${profile.configure_save.join(', ')}` : null,
    profile.configure_exit.length ? `exit: ${profile.configure_exit.join(', ')}` : null,
    profile.save_config.length ? `save: ${profile.save_config.join(', ')}` : null,
  ].filter(Boolean)

  return (
    <div className="rounded-lg border border-blue-100 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/20 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-300 mb-1">
        What this profile does
      </div>
      <div className="text-sm text-blue-900 dark:text-blue-100">
        Pulls with <span className="font-mono text-xs">{profile.show_config}</span>
        {flow.length > 0 && <>. Deploy flow: {flow.join(' | ')}</>}
        {profile.reload_guard_cmd || profile.guarded_configure_save.length ? '. Safety rollback is configured.' : '. No safety rollback is configured.'}
      </div>
    </div>
  )
}

function ProfileField({
  label,
  value,
  help,
  onChange,
}: {
  label: string
  value: string
  help?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {help && <span className="mt-1 block text-xs text-gray-400">{help}</span>}
    </label>
  )
}

function ProfileNumberField({
  label,
  value,
  min,
  step,
  placeholder,
  help,
  onChange,
}: {
  label: string
  value?: number
  min: number
  step: number
  placeholder: string
  help?: string
  onChange: (value?: number) => void
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </span>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        step={step}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {help && <span className="mt-1 block text-xs text-gray-400">{help}</span>}
    </label>
  )
}

function ProfileArrayField({
  label,
  values,
  help,
  onChange,
}: {
  label: string
  values: string[]
  help?: string
  onChange: (values: string[]) => void
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </span>
      <textarea
        value={values.join('\n')}
        rows={3}
        onChange={(e) =>
          onChange(e.target.value.split('\n').map((v) => v.trim()).filter(Boolean))
        }
        className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />
      {help && <span className="mt-1 block text-xs text-gray-400">{help}</span>}
    </label>
  )
}

function ProfileList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map((item, idx) => (
            <div
              key={`${item}-${idx}`}
              className="rounded border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 px-2 py-1 font-mono text-xs text-gray-700 dark:text-gray-200 break-words"
            >
              {item}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-gray-400 dark:text-gray-500">None</div>
      )}
    </div>
  )
}

function CommandResponsesEditor({
  rules,
  onChange,
}: {
  rules: CommandResponseRule[]
  onChange: (rules: CommandResponseRule[]) => void
}) {
  const update = (i: number, patch: Partial<CommandResponseRule>) =>
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => onChange(rules.filter((_, idx) => idx !== i))
  const add = () =>
    onChange([
      ...rules,
      {
        command_starts_with: 'reload ',
        output_contains: ['[confirm]'],
        response: '',
        max_repeats: 1,
        drain_ms: 1500,
      },
    ])

  return (
    <div className="md:col-span-2">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        Prompt Responses
        <span className="ml-1 font-normal text-gray-400">
          Answer interactive prompts such as reload confirmations.
        </span>
      </div>
      <div className="space-y-2">
        {rules.map((rule, i) => (
          <div key={i} className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-3 grid gap-2 md:grid-cols-[1fr_1fr_120px_90px_32px]">
            <input
              value={rule.command_starts_with ?? ''}
              onChange={(e) => update(i, { command_starts_with: e.target.value || undefined })}
              placeholder="command starts with"
              className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-1.5 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              value={rule.output_contains.join('\n')}
              rows={2}
              onChange={(e) => update(i, { output_contains: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })}
              placeholder="output contains"
              className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-1.5 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              value={rule.response}
              onChange={(e) => update(i, { response: e.target.value })}
              placeholder="response"
              className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-1.5 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              value={rule.drain_ms}
              min={100}
              step={100}
              onChange={(e) => update(i, { drain_ms: Number(e.target.value) })}
              className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => remove(i)}
              className="text-red-400 hover:text-red-600 transition-colors p-1 rounded"
              title="Remove prompt response"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={add}
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Prompt Response
        </button>
      </div>
    </div>
  )
}

function CommandErrorRulesEditor({
  rules,
  onChange,
}: {
  rules: CommandErrorRule[]
  onChange: (rules: CommandErrorRule[]) => void
}) {
  const update = (i: number, patch: Partial<CommandErrorRule>) =>
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => onChange(rules.filter((_, idx) => idx !== i))
  const add = () =>
    onChange([
      ...rules,
      {
        command_starts_with: 'load override',
        output_contains: ['error opening', 'permission denied', 'not found'],
      },
    ])

  return (
    <div className="md:col-span-2">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        Replace Error Rules
        <span className="ml-1 font-normal text-gray-400">
          Extra failure patterns for specific replace commands.
        </span>
      </div>
      <div className="space-y-2">
        {rules.map((rule, i) => (
          <div key={i} className="flex items-start gap-2">
            <input
              value={rule.command_starts_with ?? ''}
              onChange={(e) => update(i, { command_starts_with: e.target.value || undefined })}
              placeholder="command starts with"
              className="w-52 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              value={rule.output_contains.join('\n')}
              rows={2}
              onChange={(e) => update(i, { output_contains: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })}
              placeholder="error output contains"
              className="flex-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => remove(i)}
              className="text-red-400 hover:text-red-600 transition-colors p-1 rounded"
              title="Remove error rule"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={add}
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Replace Error Rule
        </button>
      </div>
    </div>
  )
}

function DrainRulesEditor({
  rules,
  onChange,
}: {
  rules: DrainRule[]
  onChange: (rules: DrainRule[]) => void
}) {
  const update = (i: number, patch: Partial<DrainRule>) =>
    onChange(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => onChange(rules.filter((_, idx) => idx !== i))
  const add = () => onChange([...rules, { command: 'write memory', drain_ms: 3000 }])

  return (
    <div className="md:col-span-2">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        Drain Rules
        <span className="ml-1 font-normal text-gray-400">
          (built-in fallbacks: configure_save → 3000ms, guarded_configure_save → 5000ms, others → 600ms)
        </span>
      </div>
      <div className="space-y-2">
        {rules.map((rule, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={rule.command_starts_with != null ? 'prefix' : 'exact'}
              onChange={(e) => {
                if (e.target.value === 'prefix') {
                  update(i, { command_starts_with: rule.command ?? '', command: undefined })
                } else {
                  update(i, { command: rule.command_starts_with ?? '', command_starts_with: undefined })
                }
              }}
              className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="exact">exact</option>
              <option value="prefix">starts with</option>
            </select>
            <input
              value={rule.command ?? rule.command_starts_with ?? ''}
              onChange={(e) =>
                rule.command_starts_with != null
                  ? update(i, { command_starts_with: e.target.value })
                  : update(i, { command: e.target.value })
              }
              placeholder="command"
              className="flex-1 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              value={rule.drain_ms}
              min={100}
              step={100}
              onChange={(e) => update(i, { drain_ms: Number(e.target.value) })}
              className="w-24 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">ms</span>
            <button
              onClick={() => remove(i)}
              className="text-red-400 hover:text-red-600 transition-colors p-1 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={add}
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Rule
        </button>
      </div>
    </div>
  )
}

function tomlString(value: string) {
  return JSON.stringify(value)
}

function tomlArray(values: string[]) {
  return `[${values.map(tomlString).join(', ')}]`
}

function appendString(lines: string[], key: string, value?: string) {
  if (value && value.trim()) {
    lines.push(`${key} = ${tomlString(value)}`)
  }
}

function appendStringArray(lines: string[], key: string, values: string[]) {
  lines.push(`${key} = ${tomlArray(values)}`)
}

function cloneProfile(profile: VendorProfileEntry): VendorProfileEntry {
  return JSON.parse(JSON.stringify(profile)) as VendorProfileEntry
}

function newVendorProfile(): VendorProfileEntry {
  return {
    matches: ['new-vendor-os', 'new-vendor'],
    disable_pager: [],
    show_config: 'show running-config',
    configure_enter: ['configure terminal'],
    configure_save: [],
    configure_exit: ['end'],
    save_config: ['write memory'],
    allow_terminal_replace: true,
    replace_enter: [],
    replace_exit: [],
    scp_paths: [],
    reload_guard_cmd: 'reload in {rollback_minutes}',
    reload_guard_cancel: 'reload cancel',
    error_patterns: ['error:', '% invalid input'],
    replace_error_patterns: [],
    replace_error_rules: [],
    drift_ignore_prefixes: [],
    config_ignore_exact: [],
    config_ignore_prefixes: [],
    config_ignore_contains: [],
    guarded_configure_save: [],
    guard_confirm_cmds: [],
    command_responses: [
      {
        command_starts_with: 'reload ',
        output_contains: ['[confirm]', 'confirm'],
        response: '',
        max_repeats: 5,
        drain_ms: 1500,
      },
    ],
    drain_rules: [
      {
        command: 'write memory',
        drain_ms: 3000,
      },
    ],
    pull_quiet_ms: undefined,
    pull_max_ms: undefined,
  }
}

function profileToToml(profile: VendorProfileEntry) {
  const lines = [
    '# WARNING: this override takes precedence over built-in behavior.',
    '# Review deploy, replace, rollback, and error rules carefully before saving.',
    '[[vendor_profiles]]',
  ]

  appendStringArray(lines, 'matches', profile.matches)
  appendStringArray(lines, 'disable_pager', profile.disable_pager)
  appendString(lines, 'show_config', profile.show_config)
  appendStringArray(lines, 'configure_enter', profile.configure_enter)
  appendStringArray(lines, 'configure_save', profile.configure_save)
  appendStringArray(lines, 'configure_exit', profile.configure_exit)
  appendStringArray(lines, 'save_config', profile.save_config)
  appendString(lines, 'replace_command', profile.replace_command)
  appendString(lines, 'terminal_replace_cmd', profile.terminal_replace_cmd)
  lines.push(`allow_terminal_replace = ${profile.allow_terminal_replace}`)
  appendString(lines, 'replace_format', profile.replace_format)
  appendStringArray(lines, 'replace_enter', profile.replace_enter)
  appendStringArray(lines, 'replace_exit', profile.replace_exit)
  appendStringArray(lines, 'scp_paths', profile.scp_paths)
  appendString(lines, 'reload_guard_cmd', profile.reload_guard_cmd)
  appendString(lines, 'reload_guard_cancel', profile.reload_guard_cancel)
  appendStringArray(lines, 'error_patterns', profile.error_patterns)
  appendStringArray(lines, 'replace_error_patterns', profile.replace_error_patterns)
  appendStringArray(lines, 'drift_ignore_prefixes', profile.drift_ignore_prefixes)
  appendStringArray(lines, 'config_ignore_exact', profile.config_ignore_exact)
  appendStringArray(lines, 'config_ignore_prefixes', profile.config_ignore_prefixes)
  appendStringArray(lines, 'config_ignore_contains', profile.config_ignore_contains)
  appendStringArray(lines, 'guarded_configure_save', profile.guarded_configure_save)
  appendStringArray(lines, 'guard_confirm_cmds', profile.guard_confirm_cmds)
  if (profile.pull_quiet_ms != null) lines.push(`pull_quiet_ms = ${profile.pull_quiet_ms}`)
  if (profile.pull_max_ms != null) lines.push(`pull_max_ms = ${profile.pull_max_ms}`)

  for (const rule of profile.replace_error_rules) {
    lines.push('', '[[vendor_profiles.replace_error_rules]]')
    appendString(lines, 'command_starts_with', rule.command_starts_with)
    appendStringArray(lines, 'output_contains', rule.output_contains)
  }

  for (const rule of profile.command_responses) {
    lines.push('', '[[vendor_profiles.command_responses]]')
    appendString(lines, 'command_starts_with', rule.command_starts_with)
    appendStringArray(lines, 'output_contains', rule.output_contains)
    lines.push(`response = ${tomlString(rule.response)}`)
    lines.push(`max_repeats = ${rule.max_repeats}`)
    lines.push(`drain_ms = ${rule.drain_ms}`)
  }

  for (const rule of profile.drain_rules) {
    lines.push('', '[[vendor_profiles.drain_rules]]')
    appendString(lines, 'command', rule.command)
    appendString(lines, 'command_starts_with', rule.command_starts_with)
    lines.push(`drain_ms = ${rule.drain_ms}`)
  }

  return lines.join('\n')
}
