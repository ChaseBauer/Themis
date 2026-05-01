import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Info } from 'lucide-react'
import { devicesApi, changesApi } from '../api'

const inputCls =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function NewChange() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    title: '',
    description: '',
    config_diff: '',
    scheduled_at: '',
    scheduled_save_as_golden: true,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: device } = useQuery({
    queryKey: ['devices', deviceId],
    queryFn: () => devicesApi.get(deviceId!).then((r) => r.data),
    enabled: !!deviceId,
  })

  const field = (key: keyof typeof form, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.config_diff.trim()) {
      setError('Config diff is required')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await changesApi.create(deviceId!, {
        title: form.title,
        description: form.description || undefined,
        config_diff: form.config_diff,
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : undefined,
        scheduled_save_as_golden: form.scheduled_save_as_golden,
      })
      navigate(`/changes/${res.data.id}`)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to submit change'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <Link
        to={`/devices/${deviceId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        {device?.name ?? 'Device'}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Submit Config Change</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Changes require team approval before they can be deployed to{' '}
        <span className="font-medium dark:text-gray-300">{device?.name}</span>.
      </p>

      <form onSubmit={submit} className="space-y-6">
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
            type="text"
            required
            value={form.title}
            onChange={(e) => field('title', e.target.value)}
            className={inputCls}
            placeholder="e.g. Add OSPF to core uplink interface"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => field('description', e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
            placeholder="What does this change do and why is it needed?"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Config Changes <span className="text-red-500">*</span>
            </label>
            <div className="group relative">
              <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
              <div className="absolute left-5 -top-1 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 invisible group-hover:visible z-10">
                Paste the IOS commands that need to be applied to the device , exactly as you would enter them in config mode.
              </div>
            </div>
          </div>
          <textarea
            required
            value={form.config_diff}
            onChange={(e) => field('config_diff', e.target.value)}
            rows={12}
            className={`${inputCls} font-mono`}
            placeholder={`interface GigabitEthernet0/1\n ip ospf 1 area 0\n ip ospf cost 100\n!\nrouter ospf 1\n router-id 10.0.1.2\n network 10.0.1.0 0.0.0.255 area 0`}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Scheduled Deploy Time
            </label>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => field('scheduled_at', e.target.value)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-400">
              After approval, Themis will deploy at this local time.
            </p>
          </div>
          <label className="flex items-center gap-2.5 pt-7 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.scheduled_save_as_golden}
              onChange={(e) => field('scheduled_save_as_golden', e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Pull latest config as golden after scheduled deploy
          </label>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Submitting...' : 'Submit for Review'}
          </button>
          <Link
            to={`/devices/${deviceId}`}
            className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
