'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchStaff, fetchStaffProfile } from '@/lib/staff'
import { queryKeys } from '@/lib/query-keys'

const STAFF_QUERY_STALE_TIME_MS = 60 * 60 * 5000 // 5 hours

export function useStaff(options: { archived?: boolean } = {}) {
  const staffQuery = useQuery({
    queryKey: options.archived ? queryKeys.staff.archived : queryKeys.staff.all,
    queryFn: () => fetchStaff(options),
    staleTime: STAFF_QUERY_STALE_TIME_MS,
  })

  return {
    staff: staffQuery.data ?? [],
    isLoading: staffQuery.isLoading,
    error: staffQuery.error ?? null,
    refetch: () => staffQuery.refetch(),
  }
}

export function useStaffProfile(id: string) {
  const profileQuery = useQuery({
    queryKey: queryKeys.staff.detail(id),
    queryFn: () => fetchStaffProfile(id),
    enabled: Boolean(id),
    staleTime: STAFF_QUERY_STALE_TIME_MS,
  })

  return {
    profile: profileQuery.data?.profile ?? null,
    removal: profileQuery.data?.removal ?? null,
    isLoading: id ? profileQuery.isLoading : false,
    error: profileQuery.error ?? null,
    refetch: () => profileQuery.refetch(),
  }
}
