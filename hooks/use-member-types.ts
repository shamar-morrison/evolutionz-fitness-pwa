'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchMemberTypes } from '@/lib/member-types'
import { queryKeys } from '@/lib/query-keys'
import type { MemberTypeRecord } from '@/types'

const TEN_MINUTES_MS = 10 * 60 * 1000
const EMPTY_MEMBER_TYPES: MemberTypeRecord[] = []

export function useMemberTypes(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const query = useQuery({
    queryKey: queryKeys.memberTypes.all,
    queryFn: fetchMemberTypes,
    enabled,
    staleTime: TEN_MINUTES_MS,
    refetchOnWindowFocus: false,
  })

  return {
    memberTypes: (query.data ?? EMPTY_MEMBER_TYPES) as MemberTypeRecord[],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
