import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Hash, Plus, Trash2 } from 'lucide-react'
import { devicesApi } from '../api'
import { useAuthStore } from '../store'
import type { DeviceSite, DeviceTag } from '../types'

const inputCls =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'

type Tab = 'sites' | 'tags'

function CatalogPanel<T extends DeviceSite | DeviceTag>({
  title,
  icon: Icon,
  items,
  isLoading,
  isViewer,
  value,
  setValue,
  createLabel,
  createPending,
  deletePendingId,
  onCreate,
  onDelete,
}: {
  title: string
  icon: React.ElementType
  items: T[]
  isLoading: boolean
  isViewer: boolean
  value: string
  setValue: (value: string) => void
  createLabel: string
  createPending: boolean
  deletePendingId?: string
  onCreate: () => void
  onDelete: (item: T) => void
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
          <span className="ml-auto text-xs text-gray-400">{items.length}</span>
        </div>
      </div>

      {!isViewer && (
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              onCreate()
            }}
          >
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={createLabel}
              className={inputCls}
            />
            <button
              type="submit"
              disabled={createPending || !value.trim()}
              title={createLabel}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
        {isLoading ? (
          <div className="p-5 text-sm text-gray-400">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-5 text-sm text-gray-400">Nothing created yet.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                <p className="text-xs text-gray-400">Created {new Date(item.created_at).toLocaleDateString()}</p>
              </div>
              {!isViewer && (
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  disabled={deletePendingId === item.id}
                  title={`Delete ${item.name}`}
                  className="ml-auto rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function SitesTags() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isViewer = user?.role === 'viewer'
  const [tab, setTab] = useState<Tab>('sites')
  const [siteName, setSiteName] = useState('')
  const [tagName, setTagName] = useState('')

  const { data: sites = [], isLoading: sitesLoading } = useQuery({
    queryKey: ['device-sites'],
    queryFn: () => devicesApi.listSites().then((r) => r.data),
  })
  const { data: tags = [], isLoading: tagsLoading } = useQuery({
    queryKey: ['device-tags'],
    queryFn: () => devicesApi.listTags().then((r) => r.data),
  })

  const createSite = useMutation({
    mutationFn: (name: string) => devicesApi.createSite(name),
    onSuccess: () => {
      setSiteName('')
      qc.invalidateQueries({ queryKey: ['device-sites'] })
    },
  })
  const createTag = useMutation({
    mutationFn: (name: string) => devicesApi.createTag(name),
    onSuccess: () => {
      setTagName('')
      qc.invalidateQueries({ queryKey: ['device-tags'] })
    },
  })
  const deleteSite = useMutation({
    mutationFn: (site: DeviceSite) => devicesApi.deleteSite(site.id).then(() => site.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device-sites'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
    },
  })
  const deleteTag = useMutation({
    mutationFn: (tag: DeviceTag) => devicesApi.deleteTag(tag.id).then(() => tag.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device-tags'] })
      qc.invalidateQueries({ queryKey: ['devices'] })
    },
  })

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sites & Tags</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Create device organization values here, then assign them from device forms.
        </p>
      </div>

      <div className="mb-5 inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
        {[
          ['sites', Building2, 'Sites'],
          ['tags', Hash, 'Tags'],
        ].map(([id, Icon, label]) => (
          <button
            key={id as string}
            type="button"
            onClick={() => setTab(id as Tab)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/60'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label as string}
          </button>
        ))}
      </div>

      {tab === 'sites' ? (
        <CatalogPanel
          title="Sites"
          icon={Building2}
          items={sites}
          isLoading={sitesLoading}
          isViewer={isViewer}
          value={siteName}
          setValue={setSiteName}
          createLabel="Create a site"
          createPending={createSite.isPending}
          deletePendingId={deleteSite.variables?.id}
          onCreate={() => createSite.mutate(siteName)}
          onDelete={(site) => {
            if (confirm(`Delete site ${site.name}? Devices assigned to it will become unassigned.`)) {
              deleteSite.mutate(site)
            }
          }}
        />
      ) : (
        <CatalogPanel
          title="Tags"
          icon={Hash}
          items={tags}
          isLoading={tagsLoading}
          isViewer={isViewer}
          value={tagName}
          setValue={setTagName}
          createLabel="Create a tag"
          createPending={createTag.isPending}
          deletePendingId={deleteTag.variables?.id}
          onCreate={() => createTag.mutate(tagName)}
          onDelete={(tag) => {
            if (confirm(`Delete tag ${tag.name}? It will be removed from assigned devices.`)) {
              deleteTag.mutate(tag)
            }
          }}
        />
      )}
    </div>
  )
}
