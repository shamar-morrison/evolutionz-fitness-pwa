'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchMemberEditRequests } from '@/lib/member-edit-requests'
import { queryKeys } from '@/lib/query-keys'
import type { MemberEditRequest } from '@/types'

export function useMemberEditRequests(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.memberEditRequests.pending,
    queryFn: fetchMemberEditRequests,
    enabled: options.enabled ?? true,
    staleTime: 0,
  })

  return {
    requests: (query.data ?? []) as MemberEditRequest[],
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
