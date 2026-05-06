import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { devicesApi } from '../api'

const inputCls =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function TagPicker({
  selected,
  onChange,
  disabled = false,
  allowCreate = false,
}: {
  selected: string[]
  onChange: (tags: string[]) => void
  disabled?: boolean
  allowCreate?: boolean
}) {
  const qc = useQueryClient()
  const [newTag, setNewTag] = useState('')
  const [error, setError] = useState('')

  const { data: tags = [] } = useQuery({
    queryKey: ['device-tags'],
    queryFn: () => devicesApi.listTags().then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => devicesApi.createTag(name),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['device-tags'] })
      onChange(Array.from(new Set([...selected, res.data.name])))
      setNewTag('')
      setError('')
    },
    onError: (err: unknown) => {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to create tag',
      )
    },
  })

  const toggle = (name: string) => {
    if (selected.some((tag) => tag.toLowerCase() === name.toLowerCase())) {
      onChange(selected.filter((tag) => tag.toLowerCase() !== name.toLowerCase()))
    } else {
      onChange([...selected, name])
    }
  }

  const createTag = () => {
    const name = newTag.trim()
    if (!name) return
    createMutation.mutate(name)
  }

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const active = selected.some((selectedTag) => selectedTag.toLowerCase() === tag.name.toLowerCase())
            return (
              <button
                key={tag.id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(tag.name)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700/60'
                }`}
              >
                {tag.name}
                {active && <X className="h-3 w-3" />}
              </button>
            )
          })}
        </div>
      )}
      {allowCreate && (
        <div className="flex gap-2">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                createTag()
              }
            }}
            disabled={disabled}
            placeholder="Create a tag"
            className={inputCls}
          />
          <button
            type="button"
            onClick={createTag}
            disabled={disabled || createMutation.isPending || !newTag.trim()}
            title="Create tag"
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
