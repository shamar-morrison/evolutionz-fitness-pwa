'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchPtPayments, type PtPaymentHistoryItem } from '@/lib/pt-payments'
import { queryKeys } from '@/lib/query-keys'

export function usePtPayments(memberId: string) {
  const query = useQuery<PtPaymentHistoryItem[], Error>({
    queryKey: queryKeys.ptPayments.member(memberId),
    queryFn: () => fetchPtPayments(memberId),
    enabled: Boolean(memberId),
  })

  return {
    payments: query.data ?? [],
    isLoading: memberId ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
