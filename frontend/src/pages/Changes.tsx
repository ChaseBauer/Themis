import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  GitBranch,
  Layers,
  Search,
  Server,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import { changesApi } from '../api'
import StatusBadge from '../components/StatusBadge'
import type { ChangeStatus } from '../types'
import type { ChangesPage } from '../types'
import { useAuthStore } from '../store'

const PAGE_SIZE = 20

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Deploying', value: 'deploying' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Deployed', value: 'deployed' },
  { label: 'Failed', value: 'failed' },
]

export default function Changes() {
  const isViewer = useAuthStore((s) => s.user?.role === 'viewer')
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? 'all')
  const [page, setPage] = useState(1)

  // Debounce search input , wait 300 ms before querying
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter])

  useEffect(() => {
    setStatusFilter(searchParams.get('status') ?? 'all')
  }, [searchParams])

  const applyStatusFilter = (value: string) => {
    setStatusFilter(value)
    setSearchParams(value === 'all' ? {} : { status: value })
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['changes', { status: statusFilter, search: debouncedSearch, page }],
    queryFn: () =>
      changesApi
        .listAll({ status: statusFilter, search: debouncedSearch, page, limit: PAGE_SIZE })
        .then((r) => r.data),
    placeholderData: (prev) => prev,
    refetchInterval: (query) => {
      const page = query.state.data as ChangesPage | undefined
      const needsRefresh = page?.items.some(
        (change) =>
          change.status === 'deploying' ||
          (change.status === 'approved' && Boolean(change.scheduled_at)),
      )
      return needsRefresh ? 3000 : false
    },
    refetchIntervalInBackground: true,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 1

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
          <GitBranch className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">All Changes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isLoading ? 'Loading...' : `${total} change${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        {!isViewer && <Link
          to="/changes/batch/new"
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Layers className="w-4 h-4" />
          Batch Change
        </Link>}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title, device, or author..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex-shrink-0">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => applyStatusFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === f.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className={`transition-opacity duration-150 ${isFetching && !isLoading ? 'opacity-60' : 'opacity-100'}`}>
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <GitBranch className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No changes found</p>
            {(debouncedSearch || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setStatusFilter('all') }}
                className="mt-2 text-xs text-blue-500 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Change
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">
                    Device
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    Author
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    Last Activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {items.map((change) => (
                  <tr
                    key={change.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <Link
                        to={`/changes/${change.id}`}
                        className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1"
                      >
                        {change.title}
                      </Link>
                      {change.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                          {change.description}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <Server className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                        {change.batch_id ? (
                          <Link
                            to={`/changes/${change.id}`}
                            className="truncate max-w-[140px] hover:text-blue-600 dark:hover:text-blue-400"
                            title="View devices in this batch"
                          >
                            {change.device_name}
                          </Link>
                        ) : (
                          <Link
                            to={`/devices/${change.device_id}`}
                            className="truncate max-w-[140px] hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            {change.device_name}
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        <User className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                        {change.submitted_by_username}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={change.status as ChangeStatus} />
                        {change.status === 'pending' && (
                          <span className="text-xs text-gray-400">
                            {change.approval_count}/{change.required_approvals}
                          </span>
                        )}
                        {change.scheduled_at && change.status === 'approved' && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            Scheduled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <div
                        className="flex items-center gap-1.5 text-xs text-gray-400"
                        title={`Submitted ${formatDate(change.created_at)}`}
                      >
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        {formatDate(change.updated_at)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Showing{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)}
                  </span>{' '}
                  of <span className="font-medium text-gray-700 dark:text-gray-200">{total}</span>
                </p>
                <div className="flex items-center gap-1">
                  <PageBtn onClick={() => setPage(1)} disabled={page === 1} title="First page">
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </PageBtn>
                  <PageBtn onClick={() => setPage((p) => p - 1)} disabled={page === 1} title="Previous page">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </PageBtn>

                  {pageNumbers(page, totalPages).map((n, i) =>
                    n === null ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-xs">...</span>
                    ) : (
                      <button
                        key={n}
                        onClick={() => setPage(n)}
                        className={`w-7 h-7 text-xs rounded-md font-medium transition-colors ${
                          n === page
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {n}
                      </button>
                    ),
                  )}

                  <PageBtn onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} title="Next page">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </PageBtn>
                  <PageBtn onClick={() => setPage(totalPages)} disabled={page === totalPages} title="Last page">
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </PageBtn>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PageBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  disabled: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  )
}

function pageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | null)[] = [1]

  if (current > 3) pages.push(null)

  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i)
  }

  if (current < total - 2) pages.push(null)

  pages.push(total)
  return pages
}
