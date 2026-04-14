'use client'

import { useQuery } from '@tanstack/react-query'
import {
  fetchCardFeeRevenueReport,
  fetchMembershipRevenueReport,
  fetchOverallRevenueReport,
  fetchPtRevenueReport,
  type CardFeeRevenueReport,
  type MembershipRevenueReport,
  type OverallRevenueReport,
  type PtRevenueReport,
} from '@/lib/revenue-reports'
import { queryKeys } from '@/lib/query-keys'

const FIVE_MINUTES_MS = 5 * 60 * 1000

export function useMembershipRevenueReport(
  from: string,
  to: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(from) && Boolean(to) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.reports.membershipRevenue(from, to),
    queryFn: () => fetchMembershipRevenueReport(from, to),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    report: (query.data ?? null) as MembershipRevenueReport | null,
    isLoading: enabled ? query.isFetching && !query.data : false,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useCardFeeRevenueReport(
  from: string,
  to: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(from) && Boolean(to) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.reports.cardFeeRevenue(from, to),
    queryFn: () => fetchCardFeeRevenueReport(from, to),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    report: (query.data ?? null) as CardFeeRevenueReport | null,
    isLoading: enabled ? query.isFetching && !query.data : false,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function usePtRevenueReport(
  from: string,
  to: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(from) && Boolean(to) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.reports.ptRevenue(from, to),
    queryFn: () => fetchPtRevenueReport(from, to),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    report: (query.data ?? null) as PtRevenueReport | null,
    isLoading: enabled ? query.isFetching && !query.data : false,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useOverallRevenueReport(
  from: string,
  to: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(from) && Boolean(to) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.reports.overallRevenue(from, to),
    queryFn: () => fetchOverallRevenueReport(from, to),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    report: (query.data ?? null) as OverallRevenueReport | null,
    isLoading: enabled ? query.isFetching && !query.data : false,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
