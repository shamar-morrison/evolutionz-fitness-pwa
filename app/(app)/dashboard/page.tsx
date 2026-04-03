'use client'

import { useDashboard } from '@/hooks/use-dashboard'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { StatCard } from '@/components/stat-card'
import { RecentActivity } from '@/components/recent-activity'
import { QuickActions } from '@/components/quick-actions'
import { Users, UserX, Clock3 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardPage() {
  const { data: dashboardData, isLoading: isDashboardLoading, error: dashboardError } = useDashboard()
  const { data: stats, isLoading: isStatsLoading, error: statsError } = useDashboardStats()

  if (dashboardError || statsError) {
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

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-3">
        {isStatsLoading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : (
          <>
            <StatCard
              title="Active Members"
              value={stats.activeMembers}
              icon={Users}
              variant="success"
            />
            <StatCard
              title="Expired Members"
              value={stats.expiredMembers}
              icon={UserX}
              variant="destructive"
            />
            <StatCard
              title="Expiring Soon (7 days)"
              value={stats.expiringSoon}
              icon={Clock3}
              variant="warning"
            />
          </>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
        <QuickActions />
      </div>

      {/* Recent Activity */}
      {isDashboardLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <RecentActivity events={dashboardData?.recentActivity ?? []} />
      )}
    </div>
  )
}
