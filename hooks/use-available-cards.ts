'use client'

import { useEffect, useState } from 'react'
import { fetchAvailableAccessCards } from '@/lib/available-cards'
import type { AvailableAccessCard } from '@/types'

type UseAvailableCardsOptions = {
  enabled?: boolean
}

export function useAvailableCards({ enabled = true }: UseAvailableCardsOptions = {}) {
  const [cards, setCards] = useState<AvailableAccessCard[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    if (!enabled) {
      return
    }

    let isCancelled = false

    async function loadCards() {
      setIsLoading(true)
      setError(null)

      try {
        const nextCards = await fetchAvailableAccessCards()

        if (!isCancelled) {
          setCards(nextCards)
        }
      } catch (loadError) {
        if (!isCancelled) {
          setCards([])
          setError(
            loadError instanceof Error ? loadError.message : 'Failed to load available cards.',
          )
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadCards()

    return () => {
      isCancelled = true
    }
  }, [enabled, refreshToken])

  return {
    cards,
    isLoading,
    error,
    refetch: () => setRefreshToken((currentToken) => currentToken + 1),
  }
}
