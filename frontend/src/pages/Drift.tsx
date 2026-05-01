import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle, X, ChevronRight, Clock, RefreshCw, RotateCcw } from 'lucide-react'
import { devicesApi, driftApi, goldenConfigsApi } from '../api'
import type { ConfigDrift, GoldenConfig } from '../types'

const DRIFT_REFETCH_MS = 15 * 1000

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

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
  const m = a.length, n = b.length
  const W = n + 1
  const dp = new Uint16Array((m + 1) * W)
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i * W + j] = a[i-1] === b[j-1] ? dp[(i-1)*W+(j-1)]+1 : Math.max(dp[(i-1)*W+j], dp[i*W+(j-1)])

  const raw: Array<{ type: 'context' | 'added' | 'removed'; text: string }> = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) { raw.unshift({ type: 'context', text: a[i-1] }); i -= 1; j -= 1 }
    else if (j > 0 && (i === 0 || dp[i*W+(j-1)] >= dp[(i-1)*W+j])) { raw.unshift({ type: 'added', text: b[j-1] }); j -= 1 }
    else { raw.unshift({ type: 'removed', text: a[i-1] }); i -= 1 }
  }

  const CTX = 3
  const out: DiffLine[] = []
  let ci = 0
  while (ci < raw.length) {
    const entry = raw[ci]
    if (entry.type !== 'context') { out.push(entry); ci++; continue }
    let runEnd = ci
    while (runEnd < raw.length && raw[runEnd].type === 'context') runEnd++
    const runLen = runEnd - ci
    if (runLen <= CTX * 2) { for (let k = ci; k < runEnd; k++) out.push(raw[k]) }
    else {
      for (let k = ci; k < ci + CTX; k++) out.push(raw[k])
      out.push({ type: 'spacer', count: runLen - CTX * 2 })
      for (let k = runEnd - CTX; k < runEnd; k++) out.push(raw[k])
    }
    ci = runEnd
  }
  return out
}

function DriftDiff({ drift, golden }: { drift: ConfigDrift; golden: GoldenConfig }) {
  const lines = diffLines(golden.config, drift.current_config)
  const addCount = lines.filter((l) => l.type === 'added').length
  const removeCount = lines.filter((l) => l.type === 'removed').length

  return (
    <div className="mt-3">
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
                  <td colSpan={2} className="px-3 py-0.5 text-blue-400 select-none">··· {line.count} unchanged ···</td>
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

function DriftCard({ drift }: { drift: ConfigDrift }) {
  const qc = useQueryClient()
  const [acceptTitle, setAcceptTitle] = useState('')
  const [showAcceptForm, setShowAcceptForm] = useState(false)
  const [revertOutput, setRevertOutput] = useState<string | null>(null)
  const [revertPhase, setRevertPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const revertOutputRef = useRef<HTMLPreElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const { data: goldens = [] } = useQuery({
    queryKey: ['golden-configs', drift.device_id],
    queryFn: () => goldenConfigsApi.listForDevice(drift.device_id).then((r) => r.data),
  })
  const golden = goldens.find((g) => g.id === drift.golden_config_id) ?? goldens[0]

  const acceptMutation = useMutation({
    mutationFn: () => driftApi.accept(drift.id, acceptTitle || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drift'] })
      qc.invalidateQueries({ queryKey: ['golden-configs', drift.device_id] })
      qc.invalidateQueries({ queryKey: ['changes', drift.device_id] })
    },
  })

  const dismissMutation = useMutation({
    mutationFn: () => driftApi.dismiss(drift.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drift'] }),
  })

  function startRevert() {
    if (wsRef.current) wsRef.current.close()
    setRevertOutput('')
    setRevertPhase('running')
    const ws = devicesApi.revertGoldenWs(drift.device_id)
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
          if (msg.ok) {
            qc.invalidateQueries({ queryKey: ['drift'] })
            qc.invalidateQueries({ queryKey: ['changes'] })
            qc.invalidateQueries({ queryKey: ['devices', drift.device_id, 'changes'] })
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-amber-200 dark:border-amber-800/50 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/50">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <Link
            to={`/devices/${drift.device_id}`}
            className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 transition-colors"
          >
            {drift.device_name}
          </Link>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              First detected {timeAgo(drift.detected_at)}
            </span>
            <span>·</span>
            <span>Last checked {timeAgo(drift.last_checked_at)}</span>
          </div>
        </div>
        <Link
          to={`/devices/${drift.device_id}`}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Diff */}
      <div className="px-5 py-4">
        {golden ? (
          <DriftDiff drift={drift} golden={golden} />
        ) : (
          <p className="text-sm text-gray-400">Loading diff...</p>
        )}

        {/* Actions */}
        {showAcceptForm ? (
          <div className="mt-4 space-y-2">
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
              <button
                onClick={() => setShowAcceptForm(false)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => startRevert()}
              disabled={revertPhase === 'running'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60"
            >
              {revertPhase === 'running' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
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
        )}
        {revertPhase !== 'idle' && revertOutput !== null && (
          <div className={`mt-3 rounded-lg border ${revertPhase === 'error' ? 'border-red-200 dark:border-red-800/50' : revertPhase === 'done' ? 'border-green-200 dark:border-green-800/50' : 'border-blue-200 dark:border-blue-800/50'} overflow-hidden`}>
            <div className={`flex items-center justify-between px-3 py-2 text-xs font-semibold ${revertPhase === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : revertPhase === 'done' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'}`}>
              <span>{revertPhase === 'running' ? 'Reverting...' : revertPhase === 'done' ? 'Revert complete' : 'Revert failed'}</span>
              {revertPhase !== 'running' && (
                <button onClick={() => { setRevertPhase('idle'); setRevertOutput(null) }} className="ml-2 opacity-60 hover:opacity-100">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <pre ref={revertOutputRef} className="max-h-72 overflow-auto whitespace-pre-wrap bg-gray-950 px-3 py-2 text-xs leading-relaxed text-gray-200">
              {revertOutput}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DriftPage() {
  const qc = useQueryClient()
  const { data: drifts = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['drift'],
    queryFn: () => driftApi.listOpen().then((r) => r.data),
    refetchInterval: DRIFT_REFETCH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Config Drift</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Devices whose running config no longer matches their golden config.
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['drift'] })}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Checking devices...</div>
      ) : drifts.length === 0 ? (
        <div className="text-center py-20">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300">All configs match golden</p>
          <p className="text-sm text-gray-400 mt-1">
            {dataUpdatedAt
              ? `Last checked ${timeAgo(new Date(dataUpdatedAt).toISOString())}`
              : 'No drift detected'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {drifts.map((d) => (
            <DriftCard key={d.id} drift={d} />
          ))}
        </div>
      )}
    </div>
  )
}
