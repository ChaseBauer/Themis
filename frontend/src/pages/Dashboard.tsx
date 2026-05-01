import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Server, Clock, CheckCircle, Rocket, AlertTriangle, RefreshCw } from 'lucide-react'
import { statsApi, devicesApi, driftApi } from '../api'
import StatusBadge from '../components/StatusBadge'
import type { ChangeStatus, Device, DeviceHealth } from '../types'

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  to,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-colors"
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </Link>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function DeviceHealthPanel() {
  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list().then((r) => r.data),
  })

  const healthQueries = useQueries({
    queries: devices.map((device: Device) => ({
      queryKey: ['device-health', device.id],
      queryFn: () => devicesApi.healthCheck(device.id).then((r) => r.data),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      enabled: devices.length > 0,
    })),
  })

  const isFetching = healthQueries.some((q) => q.isFetching)
  const healthLoading = healthQueries.length > 0 && healthQueries.every((q) => q.isLoading)
  const healthMap = Object.fromEntries(
    healthQueries
      .map((q) => q.data)
      .filter((h): h is DeviceHealth => Boolean(h))
      .map((h) => [h.device_id, h]),
  )
  const checked = devices.filter((d: Device) => healthMap[d.id] !== undefined)
  const upCount = checked.filter((d: Device) => healthMap[d.id]?.reachable).length
  const downCount = checked.filter((d: Device) => !healthMap[d.id]?.reachable).length
  const allUp = checked.length > 0 && downCount === 0

  const latestCheckedAt = Math.max(0, ...healthQueries.map((q) => q.dataUpdatedAt ?? 0))
  const checkedAt = latestCheckedAt
    ? new Date(latestCheckedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Device Health</h2>
          {!healthLoading && checked.length > 0 && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
              allUp
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}>
              {allUp ? `${upCount} up` : `${downCount} down`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {checkedAt && !isFetching && (
            <span className="text-xs text-gray-400">checked {checkedAt}</span>
          )}
          <button
            onClick={() => healthQueries.forEach((q) => q.refetch())}
            disabled={isFetching}
            title="Refresh health"
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-10 text-gray-400 text-xs">
          No devices registered
        </div>
      ) : healthLoading ? (
        <div className="flex-1 flex items-center justify-center py-10 text-gray-400 text-xs">
          Checking...
        </div>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-gray-700/40 overflow-y-auto max-h-72">
          {devices.map((device: Device) => {
            const h: DeviceHealth | undefined = healthMap[device.id]
            const reachable = h?.reachable
            const pending = !h

            return (
              <Link
                key={device.id}
                to={`/devices/${device.id}`}
                className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  pending ? 'bg-gray-300 dark:bg-gray-600' :
                  reachable ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{device.name}</p>
                  <p className="text-xs text-gray-400 truncate font-mono">{device.ip_address}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  {pending ? (
                    <span className="text-xs text-gray-400">,</span>
                  ) : reachable ? (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      {h.latency_ms != null ? `${h.latency_ms}ms` : 'Up'}
                    </span>
                  ) : (
                    <span className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate max-w-[80px]" title={h?.error ?? 'Unreachable'}>
                        {h?.error?.includes('Authentication') ? 'Auth failed' :
                         h?.error?.includes('timeout') || h?.error?.includes('refused') ? 'Unreachable' :
                         'Down'}
                      </span>
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { data: openDrift = [] } = useQuery({
    queryKey: ['drift'],
    queryFn: () => driftApi.listOpen().then((r) => r.data),
    refetchInterval: 15 * 1000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => statsApi.get().then((r) => r.data),
    refetchInterval: (query) => {
      const current = query.state.data
      const needsRefresh = current?.recent_changes.some(
        (change) =>
          change.status === 'deploying' ||
          (change.status === 'approved' && Boolean(change.scheduled_at)),
      )
      return needsRefresh ? 3000 : false
    },
    refetchIntervalInBackground: true,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Overview of your network configuration activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Devices" value={stats.device_count} icon={Server} color="bg-blue-500" to="/devices" />
        <StatCard label="Pending Changes" value={stats.pending_changes} icon={Clock} color="bg-amber-500" to="/changes?status=pending" />
        <StatCard label="Approved" value={stats.approved_changes} icon={CheckCircle} color="bg-green-500" to="/changes?status=approved" />
        <StatCard label="Deployed" value={stats.deployed_changes} icon={Rocket} color="bg-purple-500" to="/changes?status=deployed" />
        <StatCard label="Config Drift" value={openDrift.length} icon={AlertTriangle} color={openDrift.length > 0 ? 'bg-amber-500' : 'bg-gray-400'} to="/drift" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DeviceHealthPanel />

        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Recent Changes</h2>
            <Link to="/changes" className="text-sm text-blue-600 hover:underline">
              View all
            </Link>
          </div>

          {stats.recent_changes.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              No changes yet. Add a device and submit a change to get started.
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {stats.recent_changes.map((change) => (
                <Link
                  key={change.id}
                  to={`/changes/${change.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{change.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {change.device_name} · by {change.submitted_by_username} ·{' '}
                      {formatDate(change.updated_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusBadge status={change.status as ChangeStatus} />
                    <span className="text-xs text-gray-400">
                      {change.approval_count}/{change.required_approvals}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
