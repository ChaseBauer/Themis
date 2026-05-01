import type { ChangeStatus } from '../types'

const styles: Record<ChangeStatus, string> = {
  pending: 'bg-blue-100 text-blue-800 border border-blue-200',
  approved: 'bg-green-100 text-green-800 border border-green-200',
  rejected: 'bg-red-100 text-red-800 border border-red-200',
  deploying: 'bg-amber-100 text-amber-800 border border-amber-200',
  deployed: 'bg-purple-100 text-purple-800 border border-purple-200',
  failed: 'bg-rose-100 text-rose-800 border border-rose-200',
}

const labels: Record<ChangeStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  deploying: 'Deploying',
  deployed: 'Deployed',
  failed: 'Failed',
}

export default function StatusBadge({ status }: { status: ChangeStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  )
}
