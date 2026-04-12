'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchMemberPaymentRequests } from '@/lib/member-payment-requests'
import { queryKeys } from '@/lib/query-keys'
import type { MemberPaymentRequest } from '@/types'

export function useMemberPaymentRequests(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.memberPaymentRequests.pending,
    queryFn: fetchMemberPaymentRequests,
    enabled: options.enabled ?? true,
    staleTime: 0,
  })

  return {
    requests: (query.data ?? []) as MemberPaymentRequest[],
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
