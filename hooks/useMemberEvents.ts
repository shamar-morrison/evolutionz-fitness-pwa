'use client'

import { useQuery } from '@tanstack/react-query'
import {
  MEMBER_EVENTS_PAGE_SIZE,
  fetchMemberEvents,
  type MemberEventsResponse,
} from '@/lib/member-events'
import { queryKeys } from '@/lib/query-keys'

export function useMemberEvents(id: string, page: number) {
  return useQuery<MemberEventsResponse, Error>({
    queryKey: queryKeys.members.events(id, page),
    queryFn: () => fetchMemberEvents(id, page, MEMBER_EVENTS_PAGE_SIZE),
    staleTime: 2 * 60 * 1000,
    enabled: Boolean(id),
  })
}
