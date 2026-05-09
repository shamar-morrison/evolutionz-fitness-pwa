'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchCardInventory } from '@/lib/card-inventory'
import { queryKeys } from '@/lib/query-keys'
import type { CardInventoryItem } from '@/types'

const EMPTY_CARD_INVENTORY: CardInventoryItem[] = []
const CARD_INVENTORY_STALE_TIME_MS = 15 * 60 * 1000 // 15 minutes

export function useCardInventory() {
  const query = useQuery<CardInventoryItem[], Error>({
    queryKey: queryKeys.cards.inventory,
    queryFn: fetchCardInventory,
    staleTime: CARD_INVENTORY_STALE_TIME_MS,
  })

  return {
    cards: query.data ?? EMPTY_CARD_INVENTORY,
    isLoading: query.isLoading || query.isFetching,
    error: query.error ? query.error.message : null,
    refetch: () => query.refetch(),
  }
}
