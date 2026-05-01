import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckSquare, Layers, Search, Square } from 'lucide-react'
import { changesApi, devicesApi } from '../api'

const inputCls =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function BatchChange() {
  const navigate = useNavigate()
  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => devicesApi.list().then((r) => r.data),
  })

  const [selected, setSelected] = useState<string[]>([])
  const [filters, setFilters] = useState({
    search: '',
    os: 'all',
    tag: 'all',
  })
  const [form, setForm] = useState({
    title: '',
    description: '',
    config_diff: '',
    scheduled_at: '',
    scheduled_save_as_golden: true,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const field = (key: keyof typeof form, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }))

  const osOptions = useMemo(
    () => Array.from(new Set(devices.map((d) => d.os || 'Unspecified'))).sort(),
    [devices],
  )
  const tagOptions = useMemo(
    () => Array.from(new Set(devices.flatMap((d) => d.tags ?? []))).sort((a, b) => a.localeCompare(b)),
    [devices],
  )
  const selectedDevices = useMemo(
    () => devices.filter((device) => selected.includes(device.id)),
    [devices, selected],
  )
  const selectedOs = useMemo(
    () => Array.from(new Set(selectedDevices.map((device) => device.os || 'Unspecified'))),
    [selectedDevices],
  )
  const lockedOs = selectedOs.length === 1 ? selectedOs[0] : null
  const mixedOsSelected = selectedOs.length > 1
  const filteredDevices = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return devices.filter((device) => {
      const deviceOs = device.os || 'Unspecified'
      const tags = device.tags ?? []
      const matchesSearch =
        !q ||
        device.name.toLowerCase().includes(q) ||
        device.ip_address.toLowerCase().includes(q) ||
        device.vendor.toLowerCase().includes(q) ||
        deviceOs.toLowerCase().includes(q) ||
        tags.some((tag) => tag.toLowerCase().includes(q))
      const matchesOs = filters.os === 'all' || deviceOs === filters.os
      const matchesTag = filters.tag === 'all' || tags.includes(filters.tag)
      return matchesSearch && matchesOs && matchesTag
    })
  }, [devices, filters])

  const toggle = (id: string) => {
    const device = devices.find((d) => d.id === id)
    if (!device) return
    const deviceOs = device.os || 'Unspecified'
    const alreadySelected = selected.includes(id)
    if (!alreadySelected && lockedOs && deviceOs !== lockedOs) {
      setError(`Batch changes can only include one OS. Current batch is locked to ${lockedOs}.`)
      return
    }
    setError('')
    setSelected((prev) => (alreadySelected ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  const selectVisible = () => {
    const next = new Set(selected)
    const osLock = lockedOs ?? (filteredDevices[0]?.os || 'Unspecified')
    for (const device of filteredDevices) {
      const deviceOs = device.os || 'Unspecified'
      if (!osLock || deviceOs === osLock) next.add(device.id)
    }
    setSelected(Array.from(next))
  }

  const clearSelected = () => setSelected([])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selected.length === 0) {
      setError('Select at least one device')
      return
    }
    if (!form.config_diff.trim()) {
      setError('Config changes are required')
      return
    }
    if (mixedOsSelected) {
      setError(`Batch changes can only include one OS. Selected: ${selectedOs.join(', ')}`)
      return
    }

    setError('')
    setLoading(true)
    try {
      const res = await changesApi.createBatch({
        device_ids: selected,
        title: form.title,
        description: form.description || undefined,
        config_diff: form.config_diff,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : undefined,
        scheduled_save_as_golden: form.scheduled_save_as_golden,
      })
      navigate(res.data[0] ? `/changes/${res.data[0].id}` : '/changes')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to create batch change'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <Link
        to="/changes"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        All Changes
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <Layers className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Batch Config Change</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create one approval request for devices running the same OS.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden self-start">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Devices</h2>
              <span className="text-xs text-gray-400">{selected.length} selected</span>
            </div>
            {lockedOs && (
              <p className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                Locked to {lockedOs}
              </p>
            )}
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <input
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  placeholder="Search devices"
                  className={`${inputCls} pl-8`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={filters.os}
                  onChange={(e) => setFilters((f) => ({ ...f, os: e.target.value }))}
                  className={inputCls}
                >
                  <option value="all">All OS</option>
                  {osOptions.map((os) => (
                    <option key={os} value={os}>{os}</option>
                  ))}
                </select>
                <select
                  value={filters.tag}
                  onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}
                  className={inputCls}
                >
                  <option value="all">All tags</option>
                  {tagOptions.map((tag) => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectVisible}
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/50"
                >
                  Select visible
                </button>
                <button
                  type="button"
                  onClick={clearSelected}
                  className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/50"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
          <div className="max-h-[540px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700/50">
            {isLoading ? (
              <div className="p-4 text-sm text-gray-400">Loading...</div>
            ) : filteredDevices.length === 0 ? (
              <div className="p-4 text-sm text-gray-400">No devices match these filters.</div>
            ) : (
              filteredDevices.map((device) => {
                const checked = selected.includes(device.id)
                const deviceOs = device.os || 'Unspecified'
                const disabled = !checked && !!lockedOs && deviceOs !== lockedOs
                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => toggle(device.id)}
                    disabled={disabled}
                    title={disabled ? `Batch is locked to ${lockedOs}` : undefined}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-gray-700/40"
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {device.name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {device.ip_address} · {deviceOs}
                      </p>
                      {(device.tags ?? []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {device.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.title}
              onChange={(e) => field('title', e.target.value)}
              className={inputCls}
              placeholder="e.g. Add firewall deny rule to branch edge devices"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => field('description', e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder="Why this change is needed"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Config Changes <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              value={form.config_diff}
              onChange={(e) => field('config_diff', e.target.value)}
              rows={12}
              className={`${inputCls} font-mono`}
              placeholder="Paste the commands to apply to every selected device"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Scheduled Deploy Time
              </label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => field('scheduled_at', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.scheduled_save_as_golden}
              onChange={(e) => field('scheduled_save_as_golden', e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Pull latest config as golden after scheduled deploy
          </label>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : `Create ${selected.length || ''} Change${selected.length === 1 ? '' : 's'}`}
            </button>
            <Link
              to="/changes"
              className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
  )
}
