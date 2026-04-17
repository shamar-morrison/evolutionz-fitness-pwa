'use client'

import { AuthenticatedHomeRedirect } from '@/components/authenticated-home-redirect'
import { DashboardSignupsChartCard } from '@/components/dashboard-signups-chart-card'
import {
  ExpiringThisWeekCard,
  RecentlyAddedMembersCard,
} from '@/components/dashboard-member-panels'
import { QuickActions } from '@/components/quick-actions'
import { RoleGuard } from '@/components/role-guard'
import { StatCard } from '@/components/stat-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { CalendarX2, Clock3, UserX, Users } from 'lucide-react'

function formatMonthOverMonthTrend(currentValue: number, previousValue: number) {
  const delta = currentValue - previousValue

  if (delta === 0) {
    return {
      direction: 'neutral' as const,
      label: '0 (0.0%)',
    }
  }

  const direction = delta > 0 ? ('up' as const) : ('down' as const)
  const signedDelta = `${delta > 0 ? '+' : ''}${delta.toLocaleString()}`

  if (previousValue === 0) {
    return {
      direction,
      label: `${signedDelta} (New)`,
    }
  }

  const percentageChange = (delta / previousValue) * 100
  const signedPercentage = `${percentageChange > 0 ? '+' : ''}${percentageChange.toFixed(1)}%`

  return {
    direction,
    label: `${signedDelta} (${signedPercentage})`,
  }
}

export default function DashboardPage() {
  return (
    <RoleGuard role="admin" fallback={<AuthenticatedHomeRedirect />}>
      <DashboardPageContent />
    </RoleGuard>
  )
}

function DashboardPageContent() {
  const { data: stats, isLoading: isStatsLoading, error: statsError } = useDashboardStats()

  if (statsError) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <p className="text-destructive">Failed to load dashboard data</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here&apos;s what&apos;s happening at Evolutionz Fitness.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isStatsLoading ? (
          <>
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </>
        ) : (
          <>
            <StatCard
              title="Active Members"
              value={stats.activeMembers}
              icon={Users}
              variant="success"
              iconClassName="h-4 w-4"
              trend={formatMonthOverMonthTrend(
                stats.activeMembers,
                stats.activeMembersLastMonth,
              )}
              trendTooltip="Compared to last month's active member count"
            />
            <StatCard
              title="Total Expired Members"
              value={stats.totalExpiredMembers}
              icon={UserX}
              variant="destructive"
              iconClassName="h-4 w-4"
            />
            <StatCard
              title="Expired This Month"
              value={stats.expiredThisMonth}
              icon={CalendarX2}
              variant="destructive"
              iconClassName="h-4 w-4"
              href="/reports/members?tab=expired&period=this-month"
              trend={formatMonthOverMonthTrend(
                stats.expiredThisMonth,
                stats.expiredThisMonthLastMonth,
              )}
              trendTooltip="Compared to last month's expiry count"
            />
            <StatCard
              title="Expiring Soon (7 days)"
              value={stats.expiringSoon}
              icon={Clock3}
              variant="warning"
              iconClassName="h-4 w-4"
              href="/dashboard/expiring-members"
            />
          </>
        )}
      </div>

      <div>
        {isStatsLoading ? (
          <Skeleton className="h-80" />
        ) : (
          <DashboardSignupsChartCard
            signupsByMonth={stats.signupsByMonth}
            currentMonthCount={stats.signedUpThisMonth}
            href="/reports/members?tab=signups&period=this-month"
          />
        )}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
        <QuickActions />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RecentlyAddedMembersCard />
        <ExpiringThisWeekCard />
      </div>
    </div>
  )
}
