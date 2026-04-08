'use client'

import { useQuery } from '@tanstack/react-query'
import {
  fetchClassDetail,
  fetchClassRegistrations,
  fetchClasses,
  type ClassRegistrationStatus,
} from '@/lib/classes'
import { queryKeys } from '@/lib/query-keys'

const FIVE_MINUTES_MS = 5 * 60 * 1000
const TWO_MINUTES_MS = 2 * 60 * 1000

export function useClasses(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const query = useQuery({
    queryKey: queryKeys.classes.all,
    queryFn: fetchClasses,
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    classes: query.data ?? [],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useClassDetail(id: string, options: { enabled?: boolean } = {}) {
  const enabled = Boolean(id) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.classes.detail(id),
    queryFn: () => fetchClassDetail(id),
    enabled,
    staleTime: FIVE_MINUTES_MS,
  })

  return {
    classItem: query.data ?? null,
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}

export function useClassRegistrations(
  classId: string,
  status?: ClassRegistrationStatus,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(classId) && (options.enabled ?? true)
  const query = useQuery({
    queryKey: queryKeys.classes.registrations(classId, status ?? ''),
    queryFn: () => fetchClassRegistrations(classId, status),
    enabled,
    staleTime: TWO_MINUTES_MS,
  })

  return {
    registrations: query.data ?? [],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
