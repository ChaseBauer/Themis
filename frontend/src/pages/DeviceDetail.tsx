import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Server, Plus, GitCommit, Shield, ChevronRight, Wifi, WifiOff, Loader, Terminal, Pencil, X, Download, CheckCircle, AlertCircle, Columns, Eye, AlertTriangle, RotateCcw } from 'lucide-react'
import { devicesApi, changesApi, goldenConfigsApi, driftApi } from '../api'
import StatusBadge from '../components/StatusBadge'
import TerminalPane from '../components/TerminalPane'
import type { ChangeStatus, ConfigChange, ConfigDrift, Device, GoldenConfig } from '../types'
import { useAuthStore } from '../store'
import TagPicker from '../components/TagPicker'

const inputCls =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'

const OS_OPTIONS = ['IOS', 'IOS-XE', 'IOS-XR', 'NX-OS', 'JunOS', 'EOS', 'PAN-OS', 'FortiOS', 'TMOS', 'RouterOS', 'Comware', 'Other']
const VENDORS = ['Cisco', 'Juniper', 'Arista', 'Palo Alto', 'F5', 'HPE', 'Fortinet', 'MikroTik', 'Other']
const DRIFT_REFETCH_MS = 15 * 1000

const VENDOR_DEFAULT_COMMANDS: Record<string, string> = {
  Cisco: 'show running-config',
  Juniper: 'show configuration | no-more',
  Arista: 'show running-config',
  'Palo Alto': 'show config running',
  F5: 'list /all',
  HPE: 'display current-configuration',
  Fortinet: 'show full-configuration',
  MikroTik: 'export verbose',
}

function EditDeviceModal({ device, onClose }: { device: Device; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: sites = [] } = useQuery({
    queryKey: ['device-sites'],
    queryFn: () => devicesApi.listSites().then((r) => r.data),
  })
  const [form, setForm] = useState({
    name: device.name,
    ip_address: device.ip_address,
    site: device.site ?? '',
    vendor: device.vendor,
    os: device.os,
    ssh_port: device.ssh_port,
    ssh_username: device.ssh_username ?? '',
    ssh_password: '',
    config_pull_command: device.config_pull_command ?? '',
    ssh_options: device.ssh_options ?? '',
    tags: device.tags,
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      devicesApi.update(device.id, {
        name: form.name,
        ip_address: form.ip_address,
        site: form.site || null,
        vendor: form.vendor,
        os: form.os,
        ssh_port: form.ssh_port,
        ssh_username: form.ssh_username || undefined,
        ssh_password: form.ssh_password || undefined,
        config_pull_command: form.config_pull_command || undefined,
        ssh_options: form.ssh_options || undefined,
        tags: form.tags,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices', device.id] })
      qc.invalidateQueries({ queryKey: ['devices'] })
      onClose()
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to update device',
      )
    },
  })

  const field = (key: keyof typeof form, value: string | number | string[]) =>
    setForm((f) => ({ ...f, [key]: value }))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Edit Device</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form className="p-6 space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
          {(
            [
              ['name', 'Device Name', true],
              ['ip_address', 'IP Address / Hostname', true],
            ] as [keyof typeof form, string, boolean][]
          ).map(([key, label, required]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
              <input
                type="text" required={required} value={form[key] as string}
                onChange={(e) => field(key, e.target.value)}
                className={inputCls}
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor</label>
              <select value={form.vendor} onChange={(e) => field('vendor', e.target.value)} className={inputCls}>
                {VENDORS.map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OS</label>
              <select value={form.os} onChange={(e) => field('os', e.target.value)} className={inputCls}>
                {OS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="pt-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">SSH Access</p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                  <input type="text" value={form.ssh_username} onChange={(e) => field('ssh_username', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                  <input type="number" min={1} max={65535} value={form.ssh_port} onChange={(e) => field('ssh_port', parseInt(e.target.value) || 22)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password <span className="text-gray-400 font-normal">(leave blank to keep existing)</span>
                </label>
                <input type="password" value={form.ssh_password} onChange={(e) => field('ssh_password', e.target.value)} placeholder="••••••••" className={inputCls} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags</label>
            <TagPicker selected={form.tags} onChange={(tags) => field('tags', tags)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Config Pull Command
              {form.vendor !== 'Other' && (
                <span className="ml-1 font-normal text-gray-400">(optional override)</span>
              )}
            </label>
            <input
              type="text"
              value={form.config_pull_command}
              onChange={(e) => field('config_pull_command', e.target.value)}
              placeholder={VENDOR_DEFAULT_COMMANDS[form.vendor] ?? 'e.g. show running-config'}
              className={inputCls}
              required={form.vendor === 'Other'}
            />
            {form.vendor !== 'Other' && (
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Default: <code className="font-mono">{VENDOR_DEFAULT_COMMANDS[form.vendor]}</code>
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              SSH Options <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={form.ssh_options}
              onChange={(e) => field('ssh_options', e.target.value)}
              placeholder={`HostKeyAlgorithms=+ssh-dss\nKexAlgorithms=+diffie-hellman-group1-sha1`}
              className={inputCls + ' font-mono text-xs resize-none'}
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              One option per line. Supports <code className="font-mono">Key=value</code> or <code className="font-mono">-oKey=value</code> format.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {mutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ChangesTab({ deviceId }: { deviceId: string }) {
  const { data: changes = [], isLoading } = useQuery({
    queryKey: ['devices', deviceId, 'changes'],
    queryFn: () => changesApi.listForDevice(deviceId).then((r) => r.data),
    refetchInterval: (query) => {
      const current = query.state.data as ConfigChange[] | undefined
      const needsRefresh = current?.some(
        (change) =>
          change.status === 'deploying' ||
          (change.status === 'approved' && Boolean(change.scheduled_at)),
      )
      return needsRefresh ? 3000 : false
    },
    refetchIntervalInBackground: true,
  })

  if (isLoading) return <div className="py-10 text-center text-gray-400 text-sm">Loading...</div>

  if (changes.length === 0) {
    return (
      <div className="py-16 text-center">
        <GitCommit className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">No changes yet</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Submit a change to start building the ledger</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
      {changes.map((change) => (
        <Link
          key={change.id}
          to={`/changes/${change.id}?device_view=1`}
          className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{change.title}</p>
            {change.description && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{change.description}</p>
            )}
            <p className="text-xs text-gray-400 mt-1" title={`Submitted ${formatDate(change.created_at)}`}>
              by {change.submitted_by_username} · {formatDate(change.updated_at)}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <StatusBadge status={change.status as ChangeStatus} />
            <span className="text-xs text-gray-400">
              {change.approval_count}/{change.required_approvals}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
          </div>
        </Link>
      ))}
    </div>
  )
}

// Section
// Diff utilities
// Section

type DiffLine =
  | { type: 'context'; text: string }
  | { type: 'added'; text: string }
  | { type: 'removed'; text: string }
  | { type: 'spacer'; count: number }

function isIgnoredDriftLine(line: string) {
  const lower = line.trim().toLowerCase()
  return (
    lower.startsWith('!time:') ||
    lower.startsWith('! time:') ||
    lower.startsWith('! last configuration change at ') ||
    lower.startsWith('! nvram config last updated at ') ||
    lower === '!no configuration change since last restart' ||
    lower === '! no configuration change since last restart' ||
    lower.startsWith('!running configuration') ||
    lower.startsWith('! running configuration') ||
    lower === 'building configuration...' ||
    (lower.startsWith('current configuration : ') && lower.endsWith(' bytes')) ||
    lower.startsWith('## ')
  )
}

function normalizeConfigForDrift(text: string) {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !isIgnoredDriftLine(line))
}

function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = normalizeConfigForDrift(oldText)
  const b = normalizeConfigForDrift(newText)
  const m = a.length
  const n = b.length

  // LCS via DP (fine for typical config sizes < 2000 lines)
  const W = n + 1
  const dp = new Uint16Array((m + 1) * W)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i * W + j] =
        a[i - 1] === b[j - 1]
          ? dp[(i - 1) * W + (j - 1)] + 1
          : Math.max(dp[(i - 1) * W + j], dp[i * W + (j - 1)])
    }
  }

  // Backtrack
  const raw: Array<{ type: 'context' | 'added' | 'removed'; text: string }> = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.unshift({ type: 'context', text: a[i - 1] })
      i -= 1
      j -= 1
    } else if (j > 0 && (i === 0 || dp[i * W + (j - 1)] >= dp[(i - 1) * W + j])) {
      raw.unshift({ type: 'added', text: b[j - 1] })
      j -= 1
    } else {
      raw.unshift({ type: 'removed', text: a[i - 1] })
      i -= 1
    }
  }

  // Collapse unchanged runs longer than CTX*2 into a spacer
  const CTX = 3
  const out: DiffLine[] = []
  let ci = 0
  while (ci < raw.length) {
    const entry = raw[ci]
    if (entry.type !== 'context') { out.push(entry); ci++; continue }
    // Count the context run
    let runEnd = ci
    while (runEnd < raw.length && raw[runEnd].type === 'context') runEnd++
    const runLen = runEnd - ci
    if (runLen <= CTX * 2) {
      for (let k = ci; k < runEnd; k++) out.push(raw[k])
    } else {
      for (let k = ci; k < ci + CTX; k++) out.push(raw[k])
      out.push({ type: 'spacer', count: runLen - CTX * 2 })
      for (let k = runEnd - CTX; k < runEnd; k++) out.push(raw[k])
    }
    ci = runEnd
  }
  return out
}

function DiffViewer({ oldConfig, newConfig }: { oldConfig: string; newConfig: string }) {
  const lines = useMemo(() => diffLines(oldConfig, newConfig), [oldConfig, newConfig])

  const added   = lines.filter(l => l.type === 'added').length
  const removed = lines.filter(l => l.type === 'removed').length

  if (added === 0 && removed === 0) {
    return (
      <div className="flex-1 bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Configs are identical</p>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-gray-900 overflow-auto">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-700 text-xs font-mono">
        <span className="text-green-400">+{added} added</span>
        <span className="text-red-400">−{removed} removed</span>
      </div>
      <table className="w-full text-xs font-mono border-collapse">
        <tbody>
          {lines.map((line, idx) => {
            if (line.type === 'spacer') {
              return (
                <tr key={idx} className="bg-gray-800/60">
                  <td colSpan={2} className="px-4 py-1 text-gray-500 select-none">
                    ··· {line.count} unchanged lines
                  </td>
                </tr>
              )
            }
            const bg =
              line.type === 'added'   ? 'bg-green-950'  :
              line.type === 'removed' ? 'bg-red-950'    : ''
            const marker =
              line.type === 'added'   ? <span className="text-green-500 select-none">+</span> :
              line.type === 'removed' ? <span className="text-red-500 select-none">−</span>   :
                                        <span className="text-gray-600 select-none"> </span>
            const textColor =
              line.type === 'added'   ? 'text-green-300' :
              line.type === 'removed' ? 'text-red-300'   : 'text-gray-400'
            return (
              <tr key={idx} className={`${bg} leading-relaxed`}>
                <td className="w-6 pl-3 pr-1 py-0 text-center align-top">{marker}</td>
                <td className={`pl-1 pr-4 py-0 whitespace-pre-wrap break-all align-top ${textColor}`}>
                  {line.text}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Section
// Golden configs tab
// Section

function GoldenConfigsTab({ deviceId, hasSsh }: { deviceId: string; hasSsh: boolean }) {
  const qc = useQueryClient()
  const isViewer = useAuthStore((s) => s.user?.role === 'viewer')
  const [mode, setMode] = useState<'view' | 'diff'>('view')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [diffFromId, setDiffFromId] = useState<string | null>(null)
  const [diffToId, setDiffToId] = useState<string | null>(null)
  const [pullResult, setPullResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [revertOutput, setRevertOutput] = useState<string | null>(null)
  const [revertPhase, setRevertPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const revertOutputRef = useRef<HTMLPreElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['devices', deviceId, 'golden-configs'],
    queryFn: () => goldenConfigsApi.listForDevice(deviceId).then((r) => r.data),
  })

  // Auto-set diff defaults: from = second-latest, to = latest
  useEffect(() => {
    if (configs.length >= 2 && !diffToId) {
      setDiffToId(configs[0].id)
      setDiffFromId(configs[1].id)
    }
  }, [configs, diffToId])

  const pullMutation = useMutation({
    mutationFn: () => devicesApi.onboard(deviceId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['devices', deviceId, 'golden-configs'] })
      setPullResult({ ok: true, msg: `Saved as v${res.data.version} , ${res.data.config.split('\n').length} lines` })
      setSelectedId(null)
      setDiffToId(null)
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to pull config'
      setPullResult({ ok: false, msg })
    },
  })

  const startRevert = () => {
    if (revertPhase === 'running') return
    setPullResult(null)
    setRevertOutput('')
    setRevertPhase('running')

    const ws = devicesApi.revertGoldenWs(deviceId, selected?.id)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'output') {
          setRevertOutput((prev) => {
            const next = (prev ?? '') + (msg.chunk ?? '')
            requestAnimationFrame(() => {
              if (revertOutputRef.current)
                revertOutputRef.current.scrollTop = revertOutputRef.current.scrollHeight
            })
            return next
          })
        } else if (msg.type === 'done') {
          setRevertPhase(msg.ok ? 'done' : 'error')
          qc.invalidateQueries({ queryKey: ['changes'] })
          qc.invalidateQueries({ queryKey: ['devices', deviceId, 'changes'] })
          qc.invalidateQueries({ queryKey: ['drift', deviceId] })
          ws.close()
        } else if (msg.type === 'error') {
          setRevertPhase('error')
          setRevertOutput((prev) => (prev ?? '') + `\n[error] ${msg.message}\n`)
          ws.close()
        }
      } catch {
        setRevertOutput((prev) => (prev ?? '') + e.data)
      }
    }
    ws.onerror = () => {
      setRevertPhase('error')
      setRevertOutput((prev) => (prev ?? '') + '\n[error] WebSocket connection failed\n')
    }
  }

  const selected = (selectedId ? configs.find((c) => c.id === selectedId) : null) ?? configs[0]
  const diffFrom = diffFromId ? configs.find((c) => c.id === diffFromId) : configs[1]
  const diffTo   = diffToId   ? configs.find((c) => c.id === diffToId)   : configs[0]

  if (isLoading) return <div className="py-10 text-center text-gray-400 text-sm">Loading...</div>

  if (configs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-center">
          <Shield className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No golden configs</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Pull the running config from the device or save one when deploying a change
          </p>
        </div>
        {!isViewer && <button
          onClick={() => { setPullResult(null); pullMutation.mutate() }}
          disabled={pullMutation.isPending || revertPhase === 'running' || !hasSsh}
          title={hasSsh ? undefined : 'Add SSH credentials to enable'}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pullMutation.isPending ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {pullMutation.isPending ? 'Pulling...' : 'Pull Golden Config'}
        </button>}
        {!isViewer && <button
          disabled
          title="Pull a golden config first"
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white opacity-50 cursor-not-allowed"
        >
          <RotateCcw className="w-4 h-4" />
          Revert to Golden
        </button>}
        {pullResult && !pullResult.ok && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5" />{pullResult.msg}
          </span>
        )}
      </div>
    )
  }

  const selectCls = 'bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500'

  return (
    <div className="flex" style={{ minHeight: '480px' }}>
      {/* Main pane */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-gray-100 dark:border-gray-700">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900">
          <div className="flex items-center gap-2">
            {/* View / Compare toggle */}
            <div className="flex rounded-md overflow-hidden border border-gray-600">
              <button
                onClick={() => setMode('view')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'view' ? 'bg-purple-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <Eye className="w-3 h-3" /> View
              </button>
              <button
                onClick={() => setMode('diff')}
                disabled={configs.length < 2}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${mode === 'diff' ? 'bg-purple-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                <Columns className="w-3 h-3" /> Compare
              </button>
            </div>

            {mode === 'diff' ? (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <select
                  value={diffFrom?.id ?? ''}
                  onChange={e => setDiffFromId(e.target.value)}
                  className={selectCls}
                >
                  {configs.map(c => (
                    <option key={c.id} value={c.id}>v{c.version}</option>
                  ))}
                </select>
                <span>→</span>
                <select
                  value={diffTo?.id ?? ''}
                  onChange={e => setDiffToId(e.target.value)}
                  className={selectCls}
                >
                  {configs.map(c => (
                    <option key={c.id} value={c.id}>v{c.version}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-medium text-gray-300">
                  {selected ? `Version ${selected.version}` : ','}
                </span>
                {selected && (
                  <span className="text-xs text-gray-500">{selected.config.split('\n').length} lines</span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            {!isViewer && <button
              onClick={() => { setPullResult(null); pullMutation.mutate() }}
              disabled={pullMutation.isPending || revertPhase === 'running' || !hasSsh}
              title={hasSsh ? 'Pull current running config from device' : 'Add SSH credentials to enable'}
              className="flex items-center gap-1.5 rounded-md border border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pullMutation.isPending ? <Loader className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Pull
            </button>}
            {!isViewer && <button
              onClick={startRevert}
              disabled={revertPhase === 'running' || pullMutation.isPending || !hasSsh || configs.length === 0}
              title={
                !hasSsh
                  ? 'Add SSH credentials to enable'
                  : configs.length === 0
                    ? 'Pull a golden config first'
                    : `Push golden config v${selected?.version ?? '?'} back to the device`
              }
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {revertPhase === 'running' ? <Loader className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              {revertPhase === 'running' ? 'Reverting...' : `Revert to v${selected?.version ?? '?'}`}
            </button>}
            {pullResult && (
              <span className={`truncate flex items-center gap-1.5 text-xs font-medium ${pullResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                {pullResult.ok ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                {pullResult.msg}
              </span>
            )}
          </div>
        </div>

        {revertOutput !== null && (
          <div className="border-b border-gray-800">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-950">
              <span className={`text-xs font-semibold flex items-center gap-1.5 ${revertPhase === 'done' ? 'text-green-400' : revertPhase === 'error' ? 'text-red-400' : 'text-gray-300'}`}>
                {revertPhase === 'running' && <Loader className="w-3 h-3 animate-spin" />}
                {revertPhase === 'done' && <CheckCircle className="w-3 h-3" />}
                {revertPhase === 'error' && <AlertCircle className="w-3 h-3" />}
                {revertPhase === 'running' ? 'Reverting...' : revertPhase === 'done' ? 'Revert complete' : revertPhase === 'error' ? 'Revert failed' : 'Revert output'}
              </span>
              <button onClick={() => { setRevertOutput(null); setRevertPhase('idle') }} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
            </div>
            <pre ref={revertOutputRef} className="max-h-72 overflow-auto whitespace-pre-wrap bg-gray-950 px-4 py-3 text-xs leading-relaxed text-gray-200 font-mono">
              {revertOutput || ' '}
            </pre>
          </div>
        )}

        {/* Content */}
        {mode === 'diff' && diffFrom && diffTo ? (
          <DiffViewer oldConfig={diffFrom.config} newConfig={diffTo.config} />
        ) : (
          <pre className="flex-1 bg-gray-900 text-green-400 text-xs font-mono p-5 overflow-auto leading-relaxed">
            {selected?.config ?? ''}
          </pre>
        )}
      </div>

      {/* Version sidebar */}
      <div className="w-52 flex-shrink-0 flex flex-col bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Versions</span>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/50">
          {configs.map((cfg, i) => {
            const isActive = mode === 'diff'
              ? cfg.id === diffFrom?.id || cfg.id === diffTo?.id
              : cfg.id === (selected?.id ?? '')
            const isFrom = mode === 'diff' && cfg.id === diffFrom?.id
            const isTo   = mode === 'diff' && cfg.id === diffTo?.id
            return (
              <button
                key={cfg.id}
                onClick={() => {
                  if (mode === 'view') {
                    setSelectedId(cfg.id)
                  } else {
                    // In diff mode, clicking cycles: neither → from → to → from
                    if (!isFrom && !isTo) setDiffFromId(cfg.id)
                    else if (isFrom) { setDiffFromId(null); setDiffToId(cfg.id) }
                    else setDiffToId(null)
                  }
                }}
                className={`w-full text-left px-3 py-3 transition-colors ${
                  isActive
                    ? 'bg-purple-50 dark:bg-purple-900/20 border-l-2 border-purple-500'
                    : 'border-l-2 border-transparent hover:bg-white dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-sm font-semibold ${isActive ? 'text-purple-700 dark:text-purple-300' : 'text-gray-800 dark:text-gray-200'}`}>
                    v{cfg.version}
                  </span>
                  <div className="flex items-center gap-1">
                    {mode === 'diff' && isFrom && (
                      <span className="text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded">from</span>
                    )}
                    {mode === 'diff' && isTo && (
                      <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded">to</span>
                    )}
                    {i === 0 && mode === 'view' && (
                      <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded">latest</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 leading-tight">
                  {new Date(cfg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                {cfg.created_by_username && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{cfg.created_by_username}</p>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Section
// Drift tab
// Section
function DriftDiffView({ drift, golden }: { drift: ConfigDrift; golden: GoldenConfig }) {
  const lines = useMemo(() => diffLines(golden.config, drift.current_config), [golden.config, drift.current_config])
  const addCount = lines.filter((l) => l.type === 'added').length
  const removeCount = lines.filter((l) => l.type === 'removed').length
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs font-medium text-green-600 dark:text-green-400">+{addCount} added</span>
        <span className="text-xs font-medium text-red-500 dark:text-red-400">−{removeCount} removed</span>
      </div>
      <div className="overflow-auto max-h-96 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-900 font-mono text-xs">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => {
              if (line.type === 'spacer') return (
                <tr key={idx} className="bg-blue-950/30">
                  <td colSpan={2} className="px-3 py-0.5 text-blue-400 select-none">··· {line.count} unchanged lines ···</td>
                </tr>
              )
              const cls = line.type === 'added' ? 'bg-green-900/30 text-green-300'
                : line.type === 'removed' ? 'bg-red-900/30 text-red-300'
                : 'text-gray-500'
              const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '
              return (
                <tr key={idx} className={cls}>
                  <td className="pl-3 pr-2 py-0.5 select-none w-4 text-center opacity-60">{prefix}</td>
                  <td className="pr-3 py-0.5 whitespace-pre">{line.text || ' '}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DriftTab({ deviceId }: { deviceId: string }) {
  const qc = useQueryClient()
  const isViewer = useAuthStore((s) => s.user?.role === 'viewer')
  const [acceptTitle, setAcceptTitle] = useState('')
  const [showAcceptForm, setShowAcceptForm] = useState(false)
  const [revertOutput, setRevertOutput] = useState<string | null>(null)
  const [revertPhase, setRevertPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const revertOutputRef = useRef<HTMLPreElement>(null)

  const startRevert = () => {
    if (revertPhase === 'running') return
    setRevertOutput('')
    setRevertPhase('running')
    const ws = devicesApi.revertGoldenWs(deviceId)
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'output') {
          setRevertOutput((prev) => {
            const next = (prev ?? '') + (msg.chunk ?? '')
            requestAnimationFrame(() => {
              if (revertOutputRef.current)
                revertOutputRef.current.scrollTop = revertOutputRef.current.scrollHeight
            })
            return next
          })
        } else if (msg.type === 'done') {
          setRevertPhase(msg.ok ? 'done' : 'error')
          if (msg.ok) {
            qc.invalidateQueries({ queryKey: ['drift', deviceId] })
            qc.invalidateQueries({ queryKey: ['drift'] })
            qc.invalidateQueries({ queryKey: ['devices', deviceId, 'changes'] })
            qc.invalidateQueries({ queryKey: ['changes'] })
          }
          ws.close()
        } else if (msg.type === 'error') {
          setRevertPhase('error')
          setRevertOutput((prev) => (prev ?? '') + `\n[error] ${msg.message}\n`)
          ws.close()
        }
      } catch {
        setRevertOutput((prev) => (prev ?? '') + e.data)
      }
    }
    ws.onerror = () => {
      setRevertPhase('error')
      setRevertOutput((prev) => (prev ?? '') + '\n[error] WebSocket connection failed\n')
    }
  }

  const { data: drift, isLoading } = useQuery({
    queryKey: ['drift', deviceId],
    queryFn: () => driftApi.getForDevice(deviceId).then((r) => r.data),
    refetchInterval: DRIFT_REFETCH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const { data: goldens = [] } = useQuery({
    queryKey: ['golden-configs', deviceId],
    queryFn: () => goldenConfigsApi.listForDevice(deviceId).then((r) => r.data),
    enabled: !!drift,
  })
  const golden = drift ? (goldens.find((g) => g.id === drift.golden_config_id) ?? goldens[0]) : undefined

  const acceptMutation = useMutation({
    mutationFn: () => driftApi.accept(drift!.id, acceptTitle || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drift', deviceId] })
      qc.invalidateQueries({ queryKey: ['golden-configs', deviceId] })
      qc.invalidateQueries({ queryKey: ['devices', deviceId, 'changes'] })
      setShowAcceptForm(false)
    },
  })

  const dismissMutation = useMutation({
    mutationFn: () => driftApi.dismiss(drift!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drift', deviceId] }),
  })


  if (isLoading) return <div className="py-10 text-center text-gray-400 text-sm">Checking...</div>

  if (!drift) {
    return (
      <div className="py-16 text-center">
        <CheckCircle className="w-10 h-10 mx-auto text-green-400 mb-3" />
        <p className="text-gray-600 dark:text-gray-300 font-medium">No drift detected</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Running config matches the golden config</p>
      </div>
    )
  }

  const detectedAt = new Date(drift.detected_at).toLocaleString()
  const checkedAt = new Date(drift.last_checked_at).toLocaleString()

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-300">Config drift detected</p>
          <p className="text-amber-700 dark:text-amber-400 mt-0.5 text-xs">
            First detected {detectedAt} · Last checked {checkedAt}
          </p>
        </div>
      </div>

      {golden ? (
        <DriftDiffView drift={drift} golden={golden} />
      ) : (
        <p className="text-sm text-gray-400 py-4 text-center">Loading golden config...</p>
      )}

      {!isViewer && showAcceptForm ? (
        <div className="space-y-2 pt-2">
          <input
            type="text"
            value={acceptTitle}
            onChange={(e) => setAcceptTitle(e.target.value)}
            placeholder="Change title (optional)"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-60"
            >
              {acceptMutation.isPending ? 'Accepting...' : 'Confirm , Accept as Golden'}
            </button>
            <button onClick={() => setShowAcceptForm(false)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50">
              Cancel
            </button>
          </div>
        </div>
      ) : !isViewer ? (
        <div className="flex gap-2 pt-2">
          <button
            onClick={startRevert}
            disabled={revertPhase === 'running'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60"
          >
            {revertPhase === 'running' ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            {revertPhase === 'running' ? 'Reverting...' : 'Revert to Golden'}
          </button>
          <button
            onClick={() => setShowAcceptForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Accept as Golden
          </button>
          <button
            onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm rounded-lg disabled:opacity-60"
          >
            <X className="w-3.5 h-3.5" />
            Dismiss
          </button>
        </div>
      ) : null}
      {revertOutput !== null && (
        <div className="rounded-lg border border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-950">
            <span className={`text-xs font-semibold flex items-center gap-1.5 ${revertPhase === 'done' ? 'text-green-400' : revertPhase === 'error' ? 'text-red-400' : 'text-gray-300'}`}>
              {revertPhase === 'running' && <Loader className="w-3 h-3 animate-spin" />}
              {revertPhase === 'done' && <CheckCircle className="w-3 h-3" />}
              {revertPhase === 'error' && <AlertCircle className="w-3 h-3" />}
              {revertPhase === 'running' ? 'Reverting...' : revertPhase === 'done' ? 'Revert complete' : revertPhase === 'error' ? 'Revert failed' : 'Revert output'}
            </span>
            <button onClick={() => { setRevertOutput(null); setRevertPhase('idle') }} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
          </div>
          <pre ref={revertOutputRef} className="max-h-72 overflow-auto whitespace-pre-wrap bg-gray-950 px-3 py-2 text-xs leading-relaxed text-gray-200 font-mono">
            {revertOutput || ' '}
          </pre>
        </div>
      )}
    </div>
  )
}

type Tab = 'changes' | 'golden' | 'drift' | 'terminal'

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.user)
  const isViewer = user?.role === 'viewer'
  const [tab, setTab] = useState<Tab>('changes')
  const [connResult, setConnResult] = useState<{ ok: boolean; steps: { label: string; ok: boolean; detail?: string }[] } | null>(null)
  const [showConnDetail, setShowConnDetail] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const { data: device, isLoading } = useQuery({
    queryKey: ['devices', id],
    queryFn: () => devicesApi.get(id!).then((r) => r.data),
    enabled: !!id,
  })

  const testMutation = useMutation({
    mutationFn: () => devicesApi.testConnection(id!),
    onSuccess: (res) => setConnResult({ ok: res.data.success, steps: res.data.steps }),
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Connection failed'
      setConnResult({ ok: false, steps: [{ label: msg, ok: false }] })
    },
  })

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading...</div>
  }

  if (!device) {
    return <div className="p-8 text-gray-500 dark:text-gray-400">Device not found.</div>
  }

  const hasSsh = !!device.ssh_username

  const tabs: { id: Tab; icon: React.ElementType; label: string }[] = [
    { id: 'changes', icon: GitCommit, label: 'Change Ledger' },
    { id: 'golden', icon: Shield, label: 'Golden Configs' },
    { id: 'drift', icon: AlertTriangle, label: 'Config Drift' },
    ...(!isViewer ? [{ id: 'terminal' as Tab, icon: Terminal, label: 'Terminal' }] : []),
  ]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
            <Server className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{device.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-mono">{device.ip_address}</span>
              <span>·</span>
              <span>{device.vendor}{device.os ? ` · ${device.os}` : ''}</span>
              {device.site && (
                <>
                  <span>·</span>
                  <span>{device.site}</span>
                </>
              )}
            </div>
            {device.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {device.tags.map((tag) => (
                  <span key={tag} className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => { setConnResult(null); testMutation.mutate() }}
              disabled={testMutation.isPending || !hasSsh}
              title={hasSsh ? 'Test SSH connectivity' : 'Add SSH credentials to enable'}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testMutation.isPending ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Wifi className="w-4 h-4" />
              )}
              Test Connection
            </button>
            {connResult && connResult.ok && (
              <span className="text-xs font-medium flex items-center gap-1 text-green-600 dark:text-green-400">
                <Wifi className="w-3 h-3" /> Connected
              </span>
            )}
            {connResult && !connResult.ok && (
              <button
                onClick={() => setShowConnDetail(true)}
                className="text-xs font-medium flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline"
              >
                <WifiOff className="w-3 h-3" /> Connection failed , details
              </button>
            )}
          </div>

          {!isViewer && (
            <>
              <button
                onClick={() => setShowEdit(true)}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </button>

              <Link
                to={`/devices/${id}/changes/new`}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Submit Change
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Tabs + content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex border-b border-gray-100 dark:border-gray-700">
          {tabs.map(({ id: tabId, icon: Icon, label }) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={`relative flex items-center gap-2 px-6 py-3.5 text-sm font-medium transition-colors border-b-2 ${
                tab === tabId
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'changes' && <ChangesTab deviceId={id!} />}
        {tab === 'golden' && <GoldenConfigsTab deviceId={id!} hasSsh={hasSsh} />}
        {tab === 'drift' && <div className="p-6"><DriftTab deviceId={id!} /></div>}
        {tab === 'terminal' && (
          <div className="p-4">
            {hasSsh ? (
              <TerminalPane deviceId={id!} active={tab === 'terminal'} />
            ) : (
              <div className="py-16 text-center">
                <Terminal className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">No SSH credentials</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                  Add SSH credentials to this device to open a terminal session
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {showEdit && device && (
        <EditDeviceModal device={device} onClose={() => setShowEdit(false)} />
      )}

      {showConnDetail && connResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">Connection Failure Details</h2>
              <button onClick={() => setShowConnDetail(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {connResult.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 ${step.ok ? 'text-green-500' : 'text-red-500'}`}>
                    {step.ok ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${step.ok ? 'text-gray-800 dark:text-gray-200' : 'text-red-700 dark:text-red-400'}`}>
                      {step.label}
                    </p>
                    {step.detail && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{step.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 pb-5">
              <button
                onClick={() => setShowConnDetail(false)}
                className="w-full py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
