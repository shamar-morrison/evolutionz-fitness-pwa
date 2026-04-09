'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchMemberApprovalRequests } from '@/lib/member-approval-requests'
import { queryKeys } from '@/lib/query-keys'
import type { MemberApprovalRequest, MemberApprovalRequestStatus } from '@/types'

const TWO_MINUTES_MS = 2 * 60 * 1000

export function useMemberApprovalRequests(
  status: MemberApprovalRequestStatus = 'pending',
  options: {
    enabled?: boolean
  } = {},
) {
  const query = useQuery({
    queryKey:
      status === 'pending'
        ? queryKeys.memberApprovalRequests.pending
        : queryKeys.memberApprovalRequests.status(status),
    queryFn: () => fetchMemberApprovalRequests(status),
    enabled: options.enabled ?? true,
    staleTime: TWO_MINUTES_MS,
  })

  return {
    requests: (query.data ?? []) as MemberApprovalRequest[],
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
