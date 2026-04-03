'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { CalendarClock, UserPlus, type LucideIcon } from 'lucide-react'
import { useExpiringDashboardMembers, useRecentDashboardMembers } from '@/hooks/use-dashboard-members'
import { cn } from '@/lib/utils'
import { MemberAvatar } from '@/components/member-avatar'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardMemberListItem } from '@/types'

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000
const TWO_DAYS_IN_MS = 2 * ONE_DAY_IN_MS

function PanelRowSkeleton({ trailingBadges = false }: { trailingBadges?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      {trailingBadges ? (
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-md" />
        </div>
      ) : (
        <Skeleton className="h-4 w-24" />
      )}
    </div>
  )
}

function PanelSkeleton({ trailingBadges = false }: { trailingBadges?: boolean }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }, (_, index) => (
        <PanelRowSkeleton key={index} trailingBadges={trailingBadges} />
      ))}
    </div>
  )
}

function DashboardPanelHeader({
  title,
  icon: Icon,
}: {
  title: string
  icon: LucideIcon
}) {
  return (
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className="h-5 w-5 text-muted-foreground" />
    </CardHeader>
  )
}

function getExpiringRowTone(endTime: string | null) {
  if (!endTime) {
    return 'default'
  }

  const timeUntilExpiry = new Date(endTime).getTime() - Date.now()

  if (timeUntilExpiry <= ONE_DAY_IN_MS) {
    return 'critical'
  }

  if (timeUntilExpiry <= TWO_DAYS_IN_MS) {
    return 'warning'
  }

  return 'default'
}

function formatExpiryDate(endTime: string | null) {
  if (!endTime) {
    return 'No expiry date'
  }

  return format(new Date(endTime), 'd MMM yyyy')
}

function RecentMemberRow({ member }: { member: DashboardMemberListItem }) {
  return (
    <Link
      href={`/members/${member.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-3 transition-colors hover:bg-muted/30"
    >
      <div className="flex min-w-0 items-center gap-3">
        <MemberAvatar name={member.name} size="md" />
        <p className="truncate text-sm font-medium">{member.name}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:flex-wrap sm:justify-end">
        <Badge variant="outline">{member.type}</Badge>
        <StatusBadge status={member.status} />
      </div>
    </Link>
  )
}

function ExpiringMemberRow({ member }: { member: DashboardMemberListItem }) {
  const tone = getExpiringRowTone(member.endTime)

  return (
    <Link
      href={`/members/${member.id}`}
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border px-3 py-3 transition-colors',
        tone === 'default' && 'hover:bg-muted/30',
        tone === 'warning' && 'border-orange-200 bg-orange-500/5 hover:bg-orange-500/10',
        tone === 'critical' && 'border-red-200 bg-red-500/5 hover:bg-red-500/10',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <MemberAvatar name={member.name} size="md" />
        <p className="truncate text-sm font-medium">{member.name}</p>
      </div>
      <span
        className={cn(
          'shrink-0 text-sm text-muted-foreground',
          tone === 'warning' && 'font-medium text-orange-600',
          tone === 'critical' && 'font-medium text-red-600',
        )}
      >
        {formatExpiryDate(member.endTime)}
      </span>
    </Link>
  )
}

export function RecentlyAddedMembersCard() {
  const { data: members, isLoading, error } = useRecentDashboardMembers()

  return (
    <Card>
      <DashboardPanelHeader title="Recently Added Members" icon={UserPlus} />
      <CardContent>
        {isLoading ? (
          <PanelSkeleton trailingBadges />
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">Failed to load recent members</p>
        ) : members.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No members yet</p>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <RecentMemberRow key={member.id} member={member} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ExpiringThisWeekCard() {
  const { data: members, isLoading, error } = useExpiringDashboardMembers()

  return (
    <Card>
      <DashboardPanelHeader title="Expiring This Week" icon={CalendarClock} />
      <CardContent>
        {isLoading ? (
          <PanelSkeleton />
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">
            Failed to load expiring members
          </p>
        ) : members.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No memberships expiring this week
          </p>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <ExpiringMemberRow key={member.id} member={member} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
