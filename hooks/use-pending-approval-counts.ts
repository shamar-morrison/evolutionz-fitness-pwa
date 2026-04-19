'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchPendingApprovalCounts } from '@/lib/pending-approval-counts'
import { queryKeys } from '@/lib/query-keys'
import type { PendingApprovalCounts } from '@/types'

const THREE_MINUTES_MS = 3 * 60 * 1000

const EMPTY_PENDING_APPROVAL_COUNTS: PendingApprovalCounts = {
  member_approval_requests: 0,
  member_edit_requests: 0,
  member_payment_requests: 0,
  member_extension_requests: 0,
  member_pause_requests: 0,
  member_pause_resume_requests: 0,
  pt_reschedule_requests: 0,
  pt_session_update_requests: 0,
}

export function usePendingApprovalCounts(options: { enabled?: boolean } = {}) {
  const query = useQuery<PendingApprovalCounts, Error>({
    queryKey: queryKeys.pendingApprovalCounts.all,
    queryFn: fetchPendingApprovalCounts,
    enabled: options.enabled ?? true,
    staleTime: THREE_MINUTES_MS,
    refetchOnWindowFocus: false,
  })

  return {
    counts: query.data ?? EMPTY_PENDING_APPROVAL_COUNTS,
    isLoading: query.isLoading && !query.data,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
