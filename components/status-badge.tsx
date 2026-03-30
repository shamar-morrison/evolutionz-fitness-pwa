import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { MemberStatus, CheckInStatus } from '@/types'

type StatusBadgeProps = {
  status: MemberStatus | CheckInStatus
  className?: string
}

const statusConfig: Record<MemberStatus | CheckInStatus, { label: string; className: string }> = {
  Active: {
    label: 'Active',
    className: 'bg-green-500/15 text-green-600 hover:bg-green-500/25',
  },
  Expired: {
    label: 'Expired',
    className: 'bg-red-500/15 text-red-600 hover:bg-red-500/25',
  },
  Suspended: {
    label: 'Suspended',
    className: 'bg-gray-500/15 text-gray-600 hover:bg-gray-500/25',
  },
  success: {
    label: 'checked in (success)',
    className: 'bg-green-500/15 text-green-600 hover:bg-green-500/25',
  },
  not_found: {
    label: 'checked in (not_found)',
    className: 'bg-red-500/15 text-red-600 hover:bg-red-500/25',
  },
  expired: {
    label: 'checked in (expired)',
    className: 'bg-orange-500/15 text-orange-600 hover:bg-orange-500/25',
  },
  suspended: {
    label: 'checked in (suspended)',
    className: 'bg-gray-500/15 text-gray-600 hover:bg-gray-500/25',
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status]

  return (
    <Badge variant="secondary" className={cn('font-medium', config.className, className)}>
      {config.label}
    </Badge>
  )
}
