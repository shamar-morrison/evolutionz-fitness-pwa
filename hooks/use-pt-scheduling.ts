'use client'

import { useQuery } from '@tanstack/react-query'
import {
  fetchPtAssignments,
  fetchPtPaymentsReport,
  fetchPtSessionDetail,
  fetchPtSessions,
  type PtAssignmentFilters,
  type PtPaymentsReport,
  type PtSessionFilters,
} from '@/lib/pt-scheduling'
import { queryKeys } from '@/lib/query-keys'

const FIVE_MINUTES_MS = 5 * 60 * 1000
const TWO_MINUTES_MS = 2 * 60 * 1000

function toSessionQueryKeyFilters(filters: PtSessionFilters = {}) {
  const nextFilters: Record<string, string> = {}

  if (filters.trainerId) {
    nextFilters.trainerId = filters.trainerId
  }

  if (filters.memberId) {
    nextFilters.memberId = filters.memberId
  }

  if (filters.assignmentId) {
    nextFilters.assignmentId = filters.assignmentId
  }

  if (filters.month) {
    nextFilters.month = filters.month
  }

  if (filters.status) {
    nextFilters.status = filters.status
  }

  if (filters.past) {
    nextFilters.past = filters.past
  }

  return nextFilters
}

export function usePtAssignments(filters: PtAssignmentFilters = {}) {
  return useQuery({
    queryKey: [...queryKeys.ptScheduling.assignments, filters] as const,
    queryFn: () => fetchPtAssignments(filters),
  })
}

export function useMemberPtAssignment(memberId: string) {
  const query = useQuery({
    queryKey: queryKeys.ptScheduling.memberAssignment(memberId),
    queryFn: async () => {
      const assignments = await fetchPtAssignments({
        memberId,
        status: 'active',
      })

      return assignments[0] ?? null
    },
    enabled: Boolean(memberId),
  })

  return {
    assignment: query.data ?? null,
    isLoading: memberId ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useTrainerPtAssignments(trainerId: string) {
  const query = useQuery({
    queryKey: queryKeys.ptScheduling.trainerAssignments(trainerId),
    queryFn: () =>
      fetchPtAssignments({
        trainerId,
        status: 'active',
      }),
    enabled: Boolean(trainerId),
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    assignments: query.data ?? [],
    isLoading: trainerId ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function usePtSessions(filters: PtSessionFilters = {}) {
  const query = useQuery({
    queryKey: queryKeys.ptScheduling.sessions(toSessionQueryKeyFilters(filters)),
    queryFn: () => fetchPtSessions(filters),
    staleTime: TWO_MINUTES_MS,
  })

  return {
    sessions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function usePtSessionDetail(id: string, enabled = true) {
  const query = useQuery({
    queryKey: ['pt-sessions', 'detail', id] as const,
    queryFn: () => fetchPtSessionDetail(id),
    enabled: enabled && Boolean(id),
    staleTime: TWO_MINUTES_MS,
  })

  return {
    detail: query.data ?? null,
    isLoading: enabled && Boolean(id) ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function usePtPaymentsReport(startDate: string, endDate: string) {
  const query = useQuery({
    queryKey: queryKeys.reports.ptPayments(startDate, endDate),
    queryFn: () => fetchPtPaymentsReport(startDate, endDate),
    enabled: Boolean(startDate) && Boolean(endDate),
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    report: (query.data ?? null) as PtPaymentsReport | null,
    isLoading: query.isFetching && !query.data,
    isFetching: query.isFetching,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
