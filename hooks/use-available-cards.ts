'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchAvailableAccessCards } from '@/lib/available-cards'
import { queryKeys } from '@/lib/query-keys'
import type { AvailableAccessCard } from '@/types'

type UseAvailableCardsOptions = {
  enabled?: boolean
}

const EMPTY_AVAILABLE_CARDS: AvailableAccessCard[] = []

export function useAvailableCards({ enabled = true }: UseAvailableCardsOptions = {}) {
  const availableCardsQuery = useQuery<AvailableAccessCard[], Error>({
    queryKey: queryKeys.cards.available,
    queryFn: fetchAvailableAccessCards,
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  return {
    cards: availableCardsQuery.data ?? EMPTY_AVAILABLE_CARDS,
    isLoading: enabled ? availableCardsQuery.isLoading || availableCardsQuery.isFetching : false,
    error: availableCardsQuery.error ? availableCardsQuery.error.message : null,
    refetch: () => availableCardsQuery.refetch(),
  }
}
