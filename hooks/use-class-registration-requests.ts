'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchClassRegistrationRequests } from '@/lib/class-registration-requests'
import { queryKeys } from '@/lib/query-keys'

const TWO_MINUTES_MS = 2 * 60 * 1000

export function useClassRegistrationRequests(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const query = useQuery({
    queryKey: queryKeys.classRegistrationRequests.all,
    queryFn: fetchClassRegistrationRequests,
    enabled,
    staleTime: TWO_MINUTES_MS,
  })

  return {
    editRequests: query.data?.editRequests ?? [],
    removalRequests: query.data?.removalRequests ?? [],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
