'use client'

import { useQuery } from '@tanstack/react-query'
import {
  fetchMemberPayments,
  MEMBER_PAYMENTS_PAGE_SIZE,
} from '@/lib/member-payments'
import { queryKeys } from '@/lib/query-keys'
import type { MemberPaymentHistoryResponse } from '@/types'

export function useMemberPayments(memberId: string, page: number) {
  return useQuery<MemberPaymentHistoryResponse, Error>({
    queryKey: queryKeys.memberPayments.page(memberId, page),
    queryFn: () => fetchMemberPayments(memberId, page, MEMBER_PAYMENTS_PAGE_SIZE),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: Boolean(memberId),
  })
}
