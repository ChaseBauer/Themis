import { useMemo, useState } from 'react'
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Server, ChevronRight, Trash2, X, CheckCircle, XCircle, Loader, Shield, RefreshCw, Wifi, Download } from 'lucide-react'
import { devicesApi } from '../api'
import type { Device, DeviceHealth } from '../types'
import { useAuthStore } from '../store'
import TagPicker from '../components/TagPicker'

const OS_OPTIONS = ['IOS', 'IOS-XE', 'IOS-XR', 'NX-OS', 'JunOS', 'EOS', 'PAN-OS', 'FortiOS', 'TMOS', 'RouterOS', 'Comware', 'Other']
const VENDORS = ['Cisco', 'Juniper', 'Arista', 'Palo Alto', 'F5', 'HPE', 'Fortinet', 'MikroTik', 'Other']

const inputCls =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'

// Section
// Onboarding step types
// Section
type StepStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped'

interface Step {
  label: string
  status: StepStatus
  detail?: string
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'running')
    return <Loader className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
  if (status === 'success')
    return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
  if (status === 'error')
    return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
  if (status === 'skipped')
    return <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
  return <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-500 flex-shrink-0" />
}

function stepTextColor(status: StepStatus) {
  if (status === 'running') return 'text-blue-600 dark:text-blue-400'
  if (status === 'success') return 'text-green-700 dark:text-green-400'
  if (status === 'error') return 'text-red-600 dark:text-red-400'
  return 'text-gray-400 dark:text-gray-500'
}

// Section
// Add / Onboard modal
// Section
function AddDeviceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: sites = [] } = useQuery({
    queryKey: ['device-sites'],
    queryFn: () => devicesApi.listSites().then((r) => r.data),
  })

  const [form, setForm] = useState({
    name: '', ip_address: '', site: '',
    vendor: 'Cisco', os: 'IOS',
    ssh_port: 22, ssh_username: '', ssh_password: '',
    tags: [] as string[],
  })
  const [formError, setFormError] = useState('')

  // Onboarding state
  const [phase, setPhase] = useState<'form' | 'onboarding' | 'done'>('form')
  const [createdDevice, setCreatedDevice] = useState<Device | null>(null)
  const [pulledConfig, setPulledConfig] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[]>([
    { label: 'Registering device', status: 'idle' },
    { label: 'Testing SSH connection', status: 'idle' },
    { label: 'Pulling running configuration', status: 'idle' },
    { label: 'Saving golden config', status: 'idle' },
  ])

  const setStep = (i: number, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const field = (key: keyof typeof form, value: string | number | string[]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const runOnboarding = async (device: Device) => {
    setPhase('onboarding')

    // Step 0 already done (device created)
    setStep(0, { status: 'success' })

    // Step 1 , test SSH
    const hasSsh = !!form.ssh_username && !!form.ssh_password
    if (!hasSsh) {
      setStep(1, { status: 'skipped', detail: 'No SSH credentials' })
      setStep(2, { status: 'skipped' })
      setStep(3, { status: 'skipped' })
      setPhase('done')
      return
    }

    setStep(1, { status: 'running' })
    try {
      await devicesApi.testConnection(device.id)
      setStep(1, { status: 'success' })
    } catch {
      setStep(1, { status: 'error', detail: 'Could not connect' })
      setStep(2, { status: 'skipped' })
      setStep(3, { status: 'skipped' })
      setPhase('done')
      return
    }

    // Step 2 , pull config
    setStep(2, { status: 'running' })
    let config: string | null = null
    try {
      const res = await devicesApi.onboard(device.id)
      config = res.data.config
      setPulledConfig(config)
      setStep(2, { status: 'success', detail: `${config.split('\n').length} lines` })
    } catch {
      setStep(2, { status: 'error', detail: 'Could not pull config (device may not support show running-config)' })
      setStep(3, { status: 'skipped' })
      setPhase('done')
      return
    }

    // Step 3 , already saved by the onboard endpoint
    setStep(3, { status: 'success', detail: 'Saved as golden config v1' })
    setPhase('done')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setStep(0, { status: 'running' })

    let device: Device
    try {
      const res = await devicesApi.create({
        ...form,
        site: form.site || undefined,
        ssh_username: form.ssh_username || undefined,
        ssh_password: form.ssh_password || undefined,
        tags: form.tags,
      })
      device = res.data
      setCreatedDevice(device)
      qc.invalidateQueries({ queryKey: ['devices'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to create device'
      setFormError(msg)
      setStep(0, { status: 'idle' })
      return
    }

    await runOnboarding(device)
  }

  // Form
  if (phase === 'form') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">Add Device</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form className="p-6 space-y-4" onSubmit={handleSubmit}>
            {formError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                {formError}
              </div>
            )}
            {(
              [
                ['name', 'Device Name', 'Core Router 1', true],
                ['ip_address', 'IP Address / Hostname', '10.0.0.1 or core-rtr-01.corp.local', true],
              ] as [keyof typeof form, string, string, boolean][]
            ).map(([key, label, placeholder, required]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                <input
                  type="text" required={required} value={form[key] as string}
                  onChange={(e) => field(key, e.target.value)}
                  placeholder={placeholder} className={inputCls}
                />
              </div>
            ))}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Site</label>
                <Link to="/sites-tags" onClick={onClose} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                  Manage
                </Link>
              </div>
              <select value={form.site} onChange={(e) => field('site', e.target.value)} className={inputCls}>
                <option value="">No site</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.name}>{site.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {([['vendor', 'Vendor', VENDORS], ['os', 'OS', OS_OPTIONS]] as [keyof typeof form, string, string[]][]).map(
                ([key, label, opts]) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                    <select value={form[key] as string} onChange={(e) => field(key, e.target.value)} className={inputCls}>
                      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                )
              )}
            </div>
            <div className="pt-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                SSH Access <span className="font-normal normal-case">(optional , enables deploy &amp; onboarding)</span>
              </p>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                    <input type="text" value={form.ssh_username} onChange={(e) => field('ssh_username', e.target.value)} placeholder="admin" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                    <input type="number" min={1} max={65535} value={form.ssh_port} onChange={(e) => field('ssh_port', parseInt(e.target.value) || 22)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                  <input type="password" value={form.ssh_password} onChange={(e) => field('ssh_password', e.target.value)} placeholder="••••••••" className={inputCls} />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags</label>
              <TagPicker selected={form.tags} onChange={(tags) => field('tags', tags)} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                Cancel
              </button>
              <button type="submit" className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                Add Device
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Onboarding and done
  const allDone = phase === 'done'
  const overallSuccess = allDone && steps.every((s) => s.status === 'success' || s.status === 'skipped')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              allDone ? (overallSuccess ? 'bg-green-100 dark:bg-green-900/40' : 'bg-amber-100 dark:bg-amber-900/40') : 'bg-blue-100 dark:bg-blue-900/40'
            }`}>
              {allDone
                ? overallSuccess
                  ? <CheckCircle className="w-5 h-5 text-green-600" />
                  : <Shield className="w-5 h-5 text-amber-600" />
                : <Loader className="w-5 h-5 text-blue-600 animate-spin" />
              }
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">
                {allDone ? 'Onboarding complete' : 'Onboarding device...'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{form.name}</p>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="px-6 py-5 space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-0.5">
                <StepIcon status={step.status} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium transition-colors ${stepTextColor(step.status)}`}>
                  {step.label}
                </p>
                {step.detail && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{step.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Config preview */}
        {pulledConfig && (
          <div className="px-6 pb-2">
            <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <Shield className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Initial golden config</span>
                <span className="ml-auto text-xs text-gray-400">{pulledConfig.split('\n').length} lines</span>
              </div>
              <pre className="bg-gray-900 text-green-400 text-xs font-mono p-3 overflow-x-auto max-h-40 overflow-y-auto leading-relaxed">
                {pulledConfig}
              </pre>
            </div>
          </div>
        )}

        {/* Actions */}
        {allDone && (
          <div className="px-6 py-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              Close
            </button>
            {createdDevice && (
              <Link
                to={`/devices/${createdDevice.id}`}
                onClick={onClose}
                className="flex-1 py-2 text-center bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                View Device
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Section
// Health status dot
// Section
function HealthDot({ health }: { health: DeviceHealth | undefined }) {
  if (!health) {
    return <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 inline-block" title="Not checked" />
  }
  if (health.reachable) {
    const tip = health.latency_ms != null ? `Reachable , ${health.latency_ms}ms` : 'Reachable'
    return <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-none" title={tip} />
  }
  return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" title={health.error ?? 'Unreachable'} />
}

// Section
// OS badge colors
// Section
const osColors: Record<string, string> = {
  'ios': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'ios-xe': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'ios-xr': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'nx-os': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'junos': 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'eos': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'pan-os': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'fortios': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'tmos': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}

function ExportButton() {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('themis-token')
      const res = await fetch('/api/golden-configs/export', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'golden-configs.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      title="Download latest golden config for every device as a zip"
      className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 transition-colors"
    >
      <Download className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
      {loading ? 'Exporting...' : 'Export Golden Configs'}
    </button>
  )
}

// Section
// Main page
// Section
export default function Devices() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [showModal, setShowModal] = useState(false)
  const [filters, setFilters] = useState({
    site: 'all',
    tag: 'all',
    sort: 'name',
  })
  const isViewer = user?.role === 'viewer'
  const isAdmin = user?.role === 'admin'

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list().then((r) => r.data),
  })

  const siteOptions = useMemo(
    () => Array.from(new Set(devices.map((device) => device.site).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [devices],
  )
  const tagOptions = useMemo(
    () => Array.from(new Set(devices.flatMap((device) => device.tags ?? []))).sort((a, b) => a.localeCompare(b)),
    [devices],
  )
  const visibleDevices = useMemo(() => {
    const filtered = devices.filter((device) => {
      const matchesSite = filters.site === 'all' || device.site === filters.site
      const matchesTag = filters.tag === 'all' || (device.tags ?? []).includes(filters.tag)
      return matchesSite && matchesTag
    })

    return [...filtered].sort((a, b) => {
      if (filters.sort === 'site') {
        return (a.site || '').localeCompare(b.site || '') || a.name.localeCompare(b.name)
      }
      if (filters.sort === 'tag') {
        const aTag = (a.tags ?? [])[0] ?? ''
        const bTag = (b.tags ?? [])[0] ?? ''
        return aTag.localeCompare(bTag) || a.name.localeCompare(b.name)
      }
      return a.name.localeCompare(b.name)
    })
  }, [devices, filters])

  const healthQueries = useQueries({
    queries: devices.map((device) => ({
      queryKey: ['device-health', device.id],
      queryFn: () => devicesApi.healthCheck(device.id).then((r) => r.data),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      enabled: devices.length > 0,
    })),
  })
  const healthChecking = healthQueries.some((q) => q.isFetching)
  const healthMap = Object.fromEntries(
    healthQueries
      .map((q) => q.data)
      .filter((h): h is DeviceHealth => Boolean(h))
      .map((h) => [h.device_id, h]),
  )
  const recheckHealth = () => {
    healthQueries.forEach((q) => q.refetch())
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => devicesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['changes'] })
    },
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Devices</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {visibleDevices.length === devices.length
              ? `${devices.length} device(s) registered`
              : `${visibleDevices.length} of ${devices.length} device(s) shown`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={recheckHealth}
            disabled={healthChecking}
            title="Re-run SSH health checks"
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${healthChecking ? 'animate-spin' : ''}`} />
            {healthChecking ? 'Checking...' : 'Check Health'}
          </button>
          <ExportButton />
          <button
            onClick={() => setShowModal(true)}
            disabled={isViewer}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Device
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : devices.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-dashed py-16 text-center">
          <Server className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No devices yet</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Add your first network device to get started</p>
          <button disabled={isViewer} onClick={() => setShowModal(true)} className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            Add Device
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
            <select
              value={filters.site}
              onChange={(e) => setFilters((f) => ({ ...f, site: e.target.value }))}
              className="min-w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All sites</option>
              {siteOptions.map((site) => (
                <option key={site} value={site}>{site}</option>
              ))}
            </select>
            <select
              value={filters.tag}
              onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}
              className="min-w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All tags</option>
              {tagOptions.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <select
              value={filters.sort}
              onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
              className="min-w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="name">Sort by name</option>
              <option value="site">Sort by site</option>
              <option value="tag">Sort by tag</option>
            </select>
            {(filters.site !== 'all' || filters.tag !== 'all' || filters.sort !== 'name') && (
              <button
                type="button"
                onClick={() => setFilters({ site: 'all', tag: 'all', sort: 'name' })}
                className="ml-auto rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/50"
              >
                Clear
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">Device</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">OS</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">Vendor</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">Site</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">IP Address</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                  <span className="flex items-center gap-1.5">
                    <Wifi className="w-3 h-3" />
                    SSH
                  </span>
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {visibleDevices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">
                    No devices match these filters.
                  </td>
                </tr>
              ) : visibleDevices.map((device) => {
                const health = healthMap[device.id]
                return (
                <tr key={device.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-6 py-4">
                    <Link to={`/devices/${device.id}`} className="flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <Server className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">{device.name}</p>
                        <p className="text-xs text-gray-400">{device.ip_address}</p>
                        {device.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {device.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                                {tag}
                              </span>
                            ))}
                            {device.tags.length > 3 && (
                              <span className="text-[10px] text-gray-400">+{device.tags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${osColors[device.os.toLowerCase()] ?? osColors.other}`}>
                      {device.os || ','}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{device.vendor}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{device.site || '-'}</td>
                  <td className="px-6 py-4 font-mono text-gray-600 dark:text-gray-300 text-xs">{device.ip_address}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <HealthDot health={health} />
                      {health && (
                        <span className={`text-xs ${health.reachable ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          {health.reachable
                            ? health.latency_ms != null ? `${health.latency_ms}ms` : 'Up'
                            : 'Down'}
                        </span>
                      )}
                      {healthChecking && !health && (
                        <Loader className="w-3 h-3 text-gray-400 animate-spin" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link to={`/devices/${device.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="View details">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => {
                          const message = isAdmin
                            ? `Force delete ${device.name}?`
                            : `Submit a delete review request for ${device.name}?`
                          if (confirm(message)) deleteMutation.mutate(device.id)
                        }}
                        disabled={isViewer}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title={isAdmin ? 'Force delete device' : 'Request device deletion review'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <AddDeviceModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
