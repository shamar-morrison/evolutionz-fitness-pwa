'use client'

import { useQuery } from '@tanstack/react-query'
import {
  fetchMemberPickerMembers,
  type FetchMemberPickerOptions,
  type MemberPickerMember,
} from '@/lib/member-picker'
import { queryKeys } from '@/lib/query-keys'
import type { MemberStatus } from '@/types'

const TWO_MINUTES_MS = 2 * 60 * 1000
const EMPTY_MEMBER_PICKER_MEMBERS: MemberPickerMember[] = []

type UseMemberPickerOptions = FetchMemberPickerOptions & {
  enabled?: boolean
}

function getMemberPickerQueryKey(status: MemberStatus | undefined, hasEmail: boolean) {
  return queryKeys.memberPicker.list(status ?? 'all', hasEmail)
}

export function useMemberPicker(options: UseMemberPickerOptions = {}) {
  const enabled = options.enabled ?? true
  const hasEmail = options.hasEmail === true
  const query = useQuery({
    queryKey: getMemberPickerQueryKey(options.status, hasEmail),
    queryFn: () =>
      fetchMemberPickerMembers({
        status: options.status,
        hasEmail,
      }),
    enabled,
    staleTime: TWO_MINUTES_MS,
    refetchOnWindowFocus: false,
  })

  return {
    members: (query.data ?? EMPTY_MEMBER_PICKER_MEMBERS) as MemberPickerMember[],
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
