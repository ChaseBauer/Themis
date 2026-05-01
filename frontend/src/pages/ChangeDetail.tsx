import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle,
  XCircle,
  Rocket,
  ArrowLeft,
  User,
  Clock,
  Server,
  AlertCircle,
  Loader2,
  Pencil,
  Trash2,
  GitBranch,
  RefreshCw,
} from 'lucide-react'
import { changesApi, usersApi, driftApi } from '../api'
import { useAuthStore } from '../store'
import StatusBadge from '../components/StatusBadge'
import DiffViewer from '../components/DiffViewer'
import type { ChangeDetail as ChangeDetailType, ChangeStatus } from '../types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toLocalDateTimeValue(iso?: string) {
  if (!iso) return ''
  const date = new Date(iso)
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function configChangesOnly(configDiff: string) {
  const lines = configDiff.split('\n')
  const nonEmpty = lines.filter((line) => line.trim().length > 0)
  const looksLikeStoredDiff =
    nonEmpty.length > 0 &&
    nonEmpty.every((line) => /^[ +-]/.test(line)) &&
    nonEmpty.some((line) => line.startsWith('+') || line.startsWith('-'))

  if (!looksLikeStoredDiff) return configDiff

  return lines
    .filter((line) => line.startsWith('+') || line.startsWith('-'))
    .join('\n')
}

function EditChangeModal({
  initial,
  mode = 'edit',
  onSave,
  onClose,
  isSaving,
}: {
  initial: ChangeDetailType
  mode?: 'edit' | 'revise'
  onSave: (data: {
    title: string
    description?: string
    config_diff: string
    scheduled_at?: string
    scheduled_save_as_golden?: boolean
  }) => void
  onClose: () => void
  isSaving: boolean
}) {
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description ?? '')
  const [configDiff, setConfigDiff] = useState(initial.config_diff)
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTimeValue(initial.scheduled_at))
  const [scheduledSaveAsGolden, setScheduledSaveAsGolden] = useState(initial.scheduled_save_as_golden)

  const inputCls =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      config_diff: configDiff,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      scheduled_save_as_golden: scheduledSaveAsGolden,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {mode === 'revise' ? 'Revise Config' : 'Edit Change'}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {mode === 'revise'
              ? 'Saving sends the failed change back to pending review and keeps prior attempts in the audit.'
              : 'Saving will reset any existing approvals.'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className={inputCls}
                placeholder="e.g. Update OSPF timers"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={`${inputCls} resize-none`}
                placeholder="Optional context for reviewers"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Config Commands <span className="text-red-500">*</span>
              </label>
              <textarea
                value={configDiff}
                onChange={(e) => setConfigDiff(e.target.value)}
                required
                rows={8}
                className={`${inputCls} font-mono text-xs resize-y`}
                placeholder="Enter config commands, one per line"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Scheduled Deploy Time
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className={inputCls}
                />
              </div>
              <label className="flex items-center gap-2.5 pt-7 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={scheduledSaveAsGolden}
                  onChange={(e) => setScheduledSaveAsGolden(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Pull latest config as golden after scheduled deploy
              </label>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !title.trim() || !configDiff.trim()}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteConfirmModal({
  title,
  onConfirm,
  onClose,
  isDeleting,
}: {
  title: string
  onConfirm: () => void
  onClose: () => void
  isDeleting: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="p-6">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mb-4">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Delete Change</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Are you sure you want to delete{' '}
            <span className="font-medium text-gray-700 dark:text-gray-200">"{title}"</span>? This
            cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ChangeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const deviceView = searchParams.get('device_view') === '1'
  const qc = useQueryClient()
  const { user } = useAuthStore()

  const [modal, setModal] = useState<'edit' | 'delete' | null>(null)
  const [selectedBatchChangeId, setSelectedBatchChangeId] = useState<string | null>(null)

  // Inline deploy state , replaces the DeployModal
  const [deployPhase, setDeployPhase] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [liveOutput, setLiveOutput] = useState('')
  const [deployError, setDeployError] = useState('')
  const [saveAsGolden, setSaveAsGolden] = useState(true)
  const [deployMode, setDeployMode] = useState<'single' | 'batch' | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const { data: detail, isLoading } = useQuery({
    queryKey: ['changes', id],
    queryFn: () => changesApi.get(id!).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (query) => {
      const change = query.state.data as ChangeDetailType | undefined
      if (!change) return false
      return change.status === 'deploying' ||
        (change.status === 'approved' && Boolean(change.scheduled_at))
        ? 3000
        : false
    },
    refetchIntervalInBackground: true,
  })

  const { data: comments = [] } = useQuery({
    queryKey: ['changes', id, 'comments'],
    queryFn: () => changesApi.listComments(id!).then((r) => r.data),
    enabled: !!id,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data),
  })

  const { data: deviceDrift } = useQuery({
    queryKey: ['drift', 'device', detail?.device_id],
    queryFn: () => driftApi.getForDevice(detail!.device_id).then((r) => r.data),
    enabled: !!detail?.device_id && !detail?.batch_id,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['changes', id] })
    qc.invalidateQueries({ queryKey: ['changes', id, 'comments'] })
    qc.invalidateQueries({ queryKey: ['changes'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
  }

  const approveMutation = useMutation({
    mutationFn: () => changesApi.approve(id!),
    onSuccess: () => {
      invalidate()
    },
  })

  const unapproveMutation = useMutation({
    mutationFn: () => changesApi.unapprove(id!),
    onSuccess: () => {
      invalidate()
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof changesApi.update>[1]) => changesApi.update(id!, data),
    onSuccess: () => {
      invalidate()
      setModal(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => changesApi.delete(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changes'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      navigate('/changes')
    },
  })

  const createCommentMutation = useMutation({
    mutationFn: (data: {
      content: string
      parent_comment_id?: string
      line_start?: number
      line_end?: number
      line_snapshot?: string
    }) => changesApi.createComment(id!, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['changes', id, 'comments'] }),
  })

  const resolveCommentMutation = useMutation({
    mutationFn: (commentId: string) => changesApi.resolveComment(id!, commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['changes', id, 'comments'] }),
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => changesApi.deleteComment(id!, commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['changes', id, 'comments'] }),
  })

  const handleDeployed = (updated: ChangeDetailType) => {
    qc.setQueryData(['changes', id], updated)
    qc.invalidateQueries({ queryKey: ['changes'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
  }

  const startDeploy = (options?: {
    batch?: boolean
    targetChangeId?: string
    failedOnly?: boolean
  }) => {
    setDeployPhase('streaming')
    setDeployMode(options?.batch ? 'batch' : 'single')
    setLiveOutput('')
    setDeployError('')

    const token = localStorage.getItem('themis-token')
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const params = new URLSearchParams({ token: token ?? '' })
    params.set('save_as_golden', saveAsGolden ? 'true' : 'false')
    if (options?.batch) params.set('batch', 'true')
    if (options?.targetChangeId) params.set('target_change_id', options.targetChangeId)
    if (options?.failedOnly) params.set('failed_only', 'true')

    const ws = new WebSocket(
      `${proto}//${window.location.host}/api/changes/${id}/deploy?${params}`,
    )
    wsRef.current = ws

    ws.onmessage = (e) => {
      const text = typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data)

      if (text.trimStart().startsWith('{')) {
        try {
          const msg = JSON.parse(text)
          if (msg.type === 'error') {
            setDeployError(msg.message ?? 'Unknown error')
            setDeployPhase('error')
            setDeployMode(null)
            ws.close()
            return
          }
          if (msg.type === 'progress') {
            if (msg.change) handleDeployed(msg.change as ChangeDetailType)
            return
          }
          if (msg.type === 'output') {
            if (!options?.batch) {
              const chunk = msg.chunk ?? ''
              setLiveOutput((prev) => {
                const next = prev + chunk
                requestAnimationFrame(() => {
                  if (outputRef.current)
                    outputRef.current.scrollTop = outputRef.current.scrollHeight
                })
                return next
              })
            }
            return
          }
          if (msg.type === 'device_error') {
            return
          }
          if (msg.type === 'done') {
            if (msg.change) handleDeployed(msg.change as ChangeDetailType)
            setDeployPhase('done')
            setDeployMode(null)
            ws.close()
            return
          }
        } catch {
          // not JSON
        }
      }

      // Raw text chunk
      if (!options?.batch) {
        setLiveOutput((prev) => {
          const next = prev + text
          requestAnimationFrame(() => {
            if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
          })
          return next
        })
      }
    }

    ws.onerror = () => {
      setDeployError('WebSocket connection failed')
      setDeployPhase('error')
      setDeployMode(null)
    }

    ws.onclose = (e) => {
      if (e.code !== 1000 && e.code !== 1001 && e.code !== 1005) {
        setDeployError(`Connection closed unexpectedly (code ${e.code})`)
        setDeployPhase((p) => (p === 'streaming' ? 'error' : p))
        setDeployMode(null)
      }
    }
  }

  const cancelDeploy = () => {
    wsRef.current?.close(1000)
    setDeployPhase('idle')
    setDeployMode(null)
  }

  useEffect(() => {
    const firstBatchDevice = detail?.batch_devices[0]
    if (!selectedBatchChangeId && firstBatchDevice) {
      setSelectedBatchChangeId(firstBatchDevice.change_id)
    }
  }, [detail?.batch_devices, selectedBatchChangeId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading...</div>
    )
  }
  if (!detail) return <div className="p-8 text-gray-500 dark:text-gray-400">Change not found.</div>

  const isPending = detail.status === 'pending'
  const isApproved = detail.status === 'approved'
  const isScheduled = Boolean(detail.scheduled_at)
  const isAuthor = detail.submitted_by === user?.id
  const isViewer = user?.role === 'viewer'
  const isAdmin = user?.role === 'admin'
  const hasFailedBatchDevices = detail.batch_devices.some((device) => device.status === 'failed')
  const pendingBatchDeviceCount = detail.batch_devices.filter(
    (device) => device.status === 'pending',
  ).length
  const canApprove = !isViewer && (!isAuthor || isAdmin) && (isPending || (!deviceView && pendingBatchDeviceCount > 0))
  const canEdit =
    !isViewer &&
    isAuthor &&
    (isPending || detail.status === 'failed' || hasFailedBatchDevices || pendingBatchDeviceCount > 0)
  const editMode = detail.status === 'failed' || hasFailedBatchDevices ? 'revise' : 'edit'
  const canDelete = !isViewer && isAuthor && detail.status !== 'deployed'
  const hasUserApproved = detail.approvals.some(
    (a) => a.user_id === user?.id && a.status === 'approved',
  )
  const selectedBatchDevice =
    detail.batch_devices.find((device) => device.change_id === selectedBatchChangeId) ??
    detail.batch_devices[0]
  const savedDeploymentOutput = selectedBatchDevice?.deployment_output ?? detail.deployment_output
  const deploymentOutputTitle = selectedBatchDevice
    ? `Deployment Output , ${selectedBatchDevice.name}`
    : 'Deployment Output'
  const approvedBatchDeviceCount = detail.batch_devices.filter(
    (device) => device.status === 'approved',
  ).length
  const failedBatchDevices = detail.batch_devices.filter((device) => device.status === 'failed')
  const failedBatchDeviceCount = failedBatchDevices.length
  const sortedBatchDevices = [...detail.batch_devices].sort((a, b) => {
    const rank: Record<string, number> = {
      failed: 0,
      deploying: 1,
      approved: 2,
      pending: 3,
      deployed: 4,
    }
    return (rank[a.status] ?? 5) - (rank[b.status] ?? 5) || a.name.localeCompare(b.name)
  })
  const canDeployNow =
    !isViewer &&
    !isScheduled &&
    (isApproved ||
      detail.status === 'failed' ||
      (!deviceView && (approvedBatchDeviceCount > 0 || failedBatchDeviceCount > 0)))
  const isDeploying = deployPhase === 'streaming'
  const unresolvedComments = comments.filter(
    (comment) => !comment.parent_comment_id && !comment.resolved,
  )
  const hasUnresolvedComments = unresolvedComments.length > 0
  const deploymentBlocked = canDeployNow && hasUnresolvedComments

  // What to show in the output pane: live stream takes priority, then DB value
  const hideBatchLiveOutput = isDeploying && deployMode === 'batch'
  const outputToShow = hideBatchLiveOutput ? undefined : liveOutput || savedDeploymentOutput

  return (
    <div className="p-8">
      <Link
        to={deviceView || !detail.batch_id ? `/devices/${detail.device_id}` : '/changes'}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        {deviceView || !detail.batch_id ? detail.device_name : 'All Changes'}
      </Link>

      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{detail.title}</h1>
            <StatusBadge status={detail.status as ChangeStatus} />
          </div>
          {detail.description && (
            <p className="mt-2 text-gray-500 dark:text-gray-400 text-sm">{detail.description}</p>
          )}
        </div>
        {(canEdit || canDelete) && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {canEdit && (
              <button
                onClick={() => setModal('edit')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                {editMode === 'revise' ? 'Revise Config' : 'Edit'}
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => setModal('delete')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-6">
        {/* Main , diff + output */}
        <div className="flex-1 min-w-0 space-y-5">
          {(detail.status === 'failed' || failedBatchDeviceCount > 0) && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-900/60 dark:bg-red-950/30">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-red-800 dark:text-red-200">
                  {failedBatchDeviceCount > 0
                    ? `${failedBatchDeviceCount} of ${detail.batch_devices.length} devices failed deployment`
                    : 'Deployment failed'}
                </p>
                <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">
                  Review the saved output below, then retry the failed devices when the issue is
                  fixed.
                </p>
              </div>
              {!isScheduled && !deviceView && failedBatchDeviceCount > 0 && (
                <button
                  onClick={() => startDeploy({ batch: true, failedOnly: true })}
                  disabled={isDeploying || hasUnresolvedComments}
                  className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Failed
                </button>
              )}
            </div>
          )}

          <DiffViewer
            diff={configChangesOnly(detail.config_diff)}
            title="Config Changes"
            comments={comments}
            users={users}
            currentUserId={user?.id}
            canComment={Boolean(user) && detail.status !== 'deployed'}
            onAddComment={(data) => createCommentMutation.mutate(data)}
            onResolveComment={(commentId) => resolveCommentMutation.mutate(commentId)}
            onDeleteComment={(commentId) => deleteCommentMutation.mutate(commentId)}
          />

          {detail.full_config && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Full Config Snapshot
              </h3>
              <pre className="bg-gray-900 text-green-400 text-xs font-mono p-4 rounded-lg overflow-x-auto max-h-64 overflow-y-auto">
                {detail.full_config}
              </pre>
            </div>
          )}

          {detail.batch_devices.length > 0 && !deviceView && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Devices
                </h3>
                <span className="text-xs text-gray-400">{detail.batch_devices.length} devices</span>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {sortedBatchDevices.map((device) => {
                  const selected = selectedBatchDevice?.change_id === device.change_id
                  const canDeployDevice =
                    (device.status === 'approved' || device.status === 'failed') && !isScheduled
                  return (
                    <div
                      key={device.change_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedBatchChangeId(device.change_id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ')
                          setSelectedBatchChangeId(device.change_id)
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        selected
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                      }`}
                    >
                      <Server
                        className={`w-4 h-4 flex-shrink-0 ${selected ? 'text-blue-500' : 'text-gray-400'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium truncate ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}
                        >
                          {device.name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {device.ip_address}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={device.status as ChangeStatus} />
                        {device.status === 'pending' && (
                          <span className="text-xs text-gray-400">
                            {device.approval_count}/{device.required_approvals}
                          </span>
                        )}
                        {canDeployDevice && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedBatchChangeId(device.change_id)
                              startDeploy({ batch: false, targetChangeId: device.change_id })
                            }}
                            disabled={isDeploying || hasUnresolvedComments}
                            className="inline-flex items-center gap-1 rounded-md border border-purple-200 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/20 disabled:opacity-50"
                          >
                            {isDeploying && selectedBatchDevice?.change_id === device.change_id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : device.status === 'failed' ? (
                              <RefreshCw className="w-3 h-3" />
                            ) : (
                              <Rocket className="w-3 h-3" />
                            )}
                            {device.status === 'failed' ? 'Retry' : 'Deploy'}
                          </button>
                        )}
                        <Link
                          to={`/devices/${device.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Deployment Output , live or saved */}
          {(outputToShow || deployPhase === 'error') && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                {isDeploying ? (
                  <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4 text-purple-500" />
                )}
                {deploymentOutputTitle}
              </h3>

              {deployPhase === 'error' && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-3">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-400">{deployError}</p>
                </div>
              )}

              {outputToShow && (
                <pre
                  ref={outputRef}
                  className="bg-gray-950 text-gray-300 text-xs font-mono p-4 rounded-lg overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap"
                >
                  {outputToShow}
                  {isDeploying && (
                    <span className="inline-block w-2 h-3.5 bg-green-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </pre>
              )}
            </div>
          )}

          {/* Batch deploying , no combined output, just status */}
          {hideBatchLiveOutput && (
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              Deploying to devices. Select a device after it finishes to review its output.
            </div>
          )}

          {detail.deployment_attempts.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Deployment Audit
                </h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {detail.deployment_attempts.map((attempt) => (
                  <details key={attempt.id} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      {attempt.status === 'failed' ? (
                        <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {attempt.device_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDate(attempt.created_at)}
                          {attempt.attempted_by_username
                            ? ` by ${attempt.attempted_by_username}`
                            : ''}
                        </p>
                      </div>
                      <StatusBadge status={attempt.status as ChangeStatus} />
                    </summary>
                    <div className="space-y-3 px-4 pb-4">
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase text-gray-400">
                          Output
                        </p>
                        <pre className="max-h-52 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-300 whitespace-pre-wrap">
                          {attempt.output}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase text-gray-400">
                          Config Snapshot
                        </p>
                        <pre className="max-h-52 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-green-400 whitespace-pre-wrap">
                          {attempt.config_diff_snapshot}
                        </pre>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50">
            <div className="px-4 py-3 flex items-center gap-2 text-sm">
              <Server className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-500 dark:text-gray-400">Device</span>
              {detail.batch_id ? (
                <span className="ml-auto font-medium text-gray-700 dark:text-gray-200 truncate">
                  {detail.device_name}
                </span>
              ) : (
                <Link
                  to={`/devices/${detail.device_id}`}
                  className="ml-auto text-blue-600 hover:underline font-medium truncate"
                >
                  {detail.device_name}
                </Link>
              )}
            </div>
            <div className="px-4 py-3 flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-500 dark:text-gray-400">Author</span>
              <span className="ml-auto font-medium text-gray-700 dark:text-gray-200">
                {detail.submitted_by_username}
              </span>
            </div>
            <div className="px-4 py-3 flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-500 dark:text-gray-400">Submitted</span>
              <span className="ml-auto text-gray-600 dark:text-gray-300 text-xs text-right">
                {formatDate(detail.created_at)}
              </span>
            </div>
            {detail.deployed_at && (
              <div className="px-4 py-3 flex items-center gap-2 text-sm">
                <Rocket className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-500 dark:text-gray-400">Deployed</span>
                <span className="ml-auto text-gray-600 dark:text-gray-300 text-xs text-right">
                  {formatDate(detail.deployed_at)}
                </span>
              </div>
            )}
            {detail.scheduled_at && detail.status !== 'deployed' && (
              <div className="px-4 py-3 flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-gray-500 dark:text-gray-400">Scheduled</span>
                <span className="ml-auto text-gray-600 dark:text-gray-300 text-xs text-right">
                  {formatDate(detail.scheduled_at)}
                </span>
              </div>
            )}
            {detail.batch_id && (
              <div className="px-4 py-3 flex items-center gap-2 text-sm">
                <GitBranch className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-500 dark:text-gray-400">Batch</span>
                <span className="ml-auto font-mono text-gray-500 dark:text-gray-400 text-xs">
                  {detail.batch_id.slice(0, 8)}
                </span>
              </div>
            )}
            {detail.batch_devices.length > 0 && !deviceView && (
              <div className="px-4 py-3 flex items-center gap-2 text-sm">
                <Server className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-500 dark:text-gray-400">Devices</span>
                <span className="ml-auto font-medium text-gray-700 dark:text-gray-200">
                  {detail.batch_devices.length}
                </span>
              </div>
            )}
          </div>

          {comments.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Review Comments</span>
                <span
                  className={`font-medium ${
                    hasUnresolvedComments
                      ? 'text-blue-600 dark:text-blue-300'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {unresolvedComments.length} unresolved
                </span>
              </div>
            </div>
          )}

          {/* Approvals */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Approvals</h3>
                <span className="text-xs text-gray-400">
                  {detail.approval_count} / {detail.required_approvals} required
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (detail.approval_count / detail.required_approvals) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="px-4 py-2 space-y-2">
              {detail.approvals.length === 0 && (
                <p className="text-xs text-gray-400 py-2">No reviews yet</p>
              )}
              {detail.approvals.map((a) => (
                <div key={a.id} className="flex items-start gap-2 py-1.5">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      a.status === 'approved'
                        ? 'bg-green-100 dark:bg-green-900/40'
                        : 'bg-red-100 dark:bg-red-900/40'
                    }`}
                  >
                    {a.status === 'approved' ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                      {a.username}
                    </p>
                    {a.comment && <p className="text-xs text-gray-400 mt-0.5">{a.comment}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          {(canApprove || isApproved || canDeployNow) && (
            <div className="space-y-2">
              {canApprove && !hasUserApproved && (
                <button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Approve
                </button>
              )}
              {hasUserApproved && (canApprove || isApproved) && !isDeploying && (
                <button
                  onClick={() => unapproveMutation.mutate()}
                  disabled={unapproveMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-blue-300 text-blue-700 dark:text-blue-300 text-sm font-medium rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors disabled:opacity-50"
                >
                  {unapproveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  Unapprove
                </button>
              )}
              {canDeployNow && (
                <>
                  {deploymentBlocked && (
                    <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      Resolve all review comments before deploying.
                    </div>
                  )}
                  {deviceDrift?.status === 'open' && (
                    <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>
                        <span className="font-medium">This device has unresolved config drift.</span>{' '}
                        Deploying now will capture the drifted config as the new golden , resolve or accept the drift first to avoid locking in unintended changes.
                      </span>
                    </div>
                  )}
                  {!detail.batch_id && (
                    <label className="flex items-center gap-2.5 cursor-pointer select-none px-1">
                      <input
                        type="checkbox"
                        checked={saveAsGolden}
                        onChange={(e) => setSaveAsGolden(e.target.checked)}
                        disabled={isDeploying}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        Pull latest config as golden after deploy
                      </span>
                    </label>
                  )}
                  {isDeploying ? (
                    <button
                      onClick={cancelDeploy}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cancel Deploy
                    </button>
                  ) : (
                    <>
                      {detail.batch_id && !deviceView && failedBatchDeviceCount > 0 && (
                        <button
                          onClick={() => startDeploy({ batch: true, failedOnly: true })}
                          disabled={deploymentBlocked}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Retry Failed Devices
                        </button>
                      )}
                      {(approvedBatchDeviceCount > 0 || !detail.batch_id || deviceView) && (
                        <button
                          onClick={() =>
                            startDeploy({
                              batch: Boolean(detail.batch_id) && !deviceView,
                            })
                          }
                          disabled={deploymentBlocked}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Rocket className="w-4 h-4" />
                          {detail.batch_id && !deviceView
                            ? 'Deploy Approved Devices'
                            : detail.status === 'failed'
                              ? 'Retry Deploy'
                              : 'Deploy to Device'}
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
              {isApproved && isScheduled && (
                <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-lg px-3 py-2">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  This change will deploy at the scheduled time.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {modal === 'edit' && (
        <EditChangeModal
          initial={detail}
          mode={editMode}
          isSaving={updateMutation.isPending}
          onSave={(data) => updateMutation.mutate(data)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'delete' && (
        <DeleteConfirmModal
          title={detail.title}
          isDeleting={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
