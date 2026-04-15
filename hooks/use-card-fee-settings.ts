'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchCardFeeSettings } from '@/lib/card-fee-settings'
import { queryKeys } from '@/lib/query-keys'
import type { CardFeeSettings } from '@/types'

export function useCardFeeSettings(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const query = useQuery({
    queryKey: queryKeys.cardFeeSettings.settings,
    queryFn: fetchCardFeeSettings,
    enabled,
    staleTime: Infinity,
  })

  return {
    settings: (query.data ?? null) as CardFeeSettings | null,
    isLoading: enabled ? query.isLoading : false,
    error: query.error ?? null,
    refetch: () => query.refetch(),
  }
}
