'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchMemberPauseRequests } from '@/lib/member-pause-requests'
import { queryKeys } from '@/lib/query-keys'
import type { MemberPauseRequest, MemberPauseResumeRequest } from '@/types'

export function useMemberPauseRequests(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.memberPauseRequests.pending,
    queryFn: fetchMemberPauseRequests,
    enabled: options.enabled ?? true,
    staleTime: 0,
  })

  return {
    pauseRequests: (query.data?.pauseRequests ?? []) as MemberPauseRequest[],
    earlyResumeRequests: (query.data?.earlyResumeRequests ?? []) as MemberPauseResumeRequest[],
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
