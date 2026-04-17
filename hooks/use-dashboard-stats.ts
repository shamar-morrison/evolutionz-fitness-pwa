'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchDashboardStats } from '@/lib/dashboard-stats'
import { queryKeys } from '@/lib/query-keys'
import type { DashboardMembershipStats } from '@/types'

const EMPTY_DASHBOARD_STATS: DashboardMembershipStats = {
  activeMembers: 0,
  activeMembersLastMonth: 0,
  totalExpiredMembers: 0,
  expiringSoon: 0,
  signedUpThisMonth: 0,
  signupsByMonth: [],
  expiredThisMonth: 0,
  expiredThisMonthLastMonth: 0,
}

export function useDashboardStats() {
  const dashboardStatsQuery = useQuery<DashboardMembershipStats, Error>({
    queryKey: queryKeys.dashboard.stats,
    queryFn: fetchDashboardStats,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  return {
    data: dashboardStatsQuery.data ?? EMPTY_DASHBOARD_STATS,
    isLoading: dashboardStatsQuery.isLoading && !dashboardStatsQuery.data,
    error: dashboardStatsQuery.error ?? null,
    refetch: () => dashboardStatsQuery.refetch(),
  }
}
