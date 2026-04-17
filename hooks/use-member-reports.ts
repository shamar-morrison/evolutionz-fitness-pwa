'use client'

import { useQuery } from '@tanstack/react-query'
import {
  fetchMemberExpiredReport,
  fetchMemberSignupsReport,
  type MemberExpiredReport,
  type MemberSignupsReport,
} from '@/lib/member-reports'
import { queryKeys } from '@/lib/query-keys'

const FIVE_MINUTES_MS = 5 * 60 * 1000

export function useMemberSignupsReport(
  startDate: string,
  endDate: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(startDate) && Boolean(endDate) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.reports.memberSignups(startDate, endDate),
    queryFn: () => fetchMemberSignupsReport(startDate, endDate),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    report: (query.data ?? null) as MemberSignupsReport | null,
    isLoading: enabled ? query.isFetching && !query.data : false,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useMemberExpiredReport(
  startDate: string,
  endDate: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(startDate) && Boolean(endDate) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.reports.memberExpired(startDate, endDate),
    queryFn: () => fetchMemberExpiredReport(startDate, endDate),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    report: (query.data ?? null) as MemberExpiredReport | null,
    isLoading: enabled ? query.isFetching && !query.data : false,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
