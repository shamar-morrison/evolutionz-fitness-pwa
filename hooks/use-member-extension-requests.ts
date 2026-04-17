'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchMemberExtensionRequests } from '@/lib/member-extension-requests'
import { queryKeys } from '@/lib/query-keys'
import type { MemberExtensionRequest } from '@/types'

export function useMemberExtensionRequests(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.memberExtensionRequests.pending,
    queryFn: fetchMemberExtensionRequests,
    enabled: options.enabled ?? true,
    staleTime: 0,
  })

  return {
    requests: (query.data ?? []) as MemberExtensionRequest[],
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
