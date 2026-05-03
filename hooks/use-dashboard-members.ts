'use client'

import { useQuery } from '@tanstack/react-query'
import {
  fetchExpiringDashboardMembers,
  fetchRecentDashboardMembers,
} from '@/lib/dashboard-members'
import { queryKeys } from '@/lib/query-keys'
import type { DashboardMemberListItem } from '@/types'

const EMPTY_DASHBOARD_MEMBERS: DashboardMemberListItem[] = []
const DASHBOARD_MEMBER_STALE_TIME = 60 * 60 * 1000

function useDashboardMembersQuery(
  queryKey: readonly unknown[],
  queryFn: () => Promise<DashboardMemberListItem[]>,
) {
  const dashboardMembersQuery = useQuery<DashboardMemberListItem[], Error>({
    queryKey,
    queryFn,
    staleTime: DASHBOARD_MEMBER_STALE_TIME,
    refetchOnWindowFocus: false,
  })

  return {
    data: dashboardMembersQuery.data ?? EMPTY_DASHBOARD_MEMBERS,
    isLoading: dashboardMembersQuery.isLoading && !dashboardMembersQuery.data,
    error: dashboardMembersQuery.error ?? null,
    refetch: () => dashboardMembersQuery.refetch(),
  }
}

export function useRecentDashboardMembers() {
  return useDashboardMembersQuery(
    queryKeys.dashboard.recentMembers,
    fetchRecentDashboardMembers,
  )
}

export function useExpiringDashboardMembers(options: { limit?: number } = {}) {
  return useDashboardMembersQuery(
    [...queryKeys.dashboard.expiringMembers, options.limit ?? 'all'] as const,
    () => fetchExpiringDashboardMembers(options),
  )
}
