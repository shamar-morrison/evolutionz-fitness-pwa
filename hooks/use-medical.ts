'use client'

import { useQuery } from '@tanstack/react-query'
import {
  fetchMedicalAssignment,
  fetchMedicalAssignments,
  fetchMedicalVisitNotes,
  type MedicalAssignmentFilters,
} from '@/lib/medical'
import { queryKeys } from '@/lib/query-keys'

const TWO_MINUTES_MS = 2 * 60 * 1000

function toAssignmentQueryKeyFilters(filters: MedicalAssignmentFilters = {}) {
  const nextFilters: Record<string, string> = {}

  if (filters.memberId) {
    nextFilters.memberId = filters.memberId
  }

  if (filters.staffId) {
    nextFilters.staffId = filters.staffId
  }

  if (filters.status) {
    nextFilters.status = filters.status
  }

  return nextFilters
}

export function useMedicalAssignments(filters: MedicalAssignmentFilters = {}) {
  return useQuery({
    queryKey: queryKeys.medical.assignments(toAssignmentQueryKeyFilters(filters)),
    queryFn: () => fetchMedicalAssignments(filters),
    staleTime: TWO_MINUTES_MS,
    refetchOnWindowFocus: false,
  })
}

export function useMedicalAssignment(id: string) {
  const query = useQuery({
    queryKey: queryKeys.medical.assignment(id),
    queryFn: () => fetchMedicalAssignment(id),
    enabled: Boolean(id),
    staleTime: TWO_MINUTES_MS,
    refetchOnWindowFocus: false,
  })

  return {
    assignment: query.data ?? null,
    isLoading: id ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useMedicalVisitNotes(assignmentId: string) {
  const query = useQuery({
    queryKey: queryKeys.medical.notes(assignmentId),
    queryFn: () => fetchMedicalVisitNotes(assignmentId),
    enabled: Boolean(assignmentId),
    staleTime: TWO_MINUTES_MS,
    refetchOnWindowFocus: false,
  })

  return {
    notes: query.data ?? [],
    isLoading: assignmentId ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
