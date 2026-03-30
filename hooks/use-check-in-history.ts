'use client'

import { useState, useEffect } from 'react'
import type { CheckInEvent } from '@/types'

// TODO: Replace with Supabase queries
function generateMockHistory(memberId: string): CheckInEvent[] {
  const statuses: CheckInEvent['status'][] = ['success', 'success', 'success', 'expired', 'success']
  const baseTime = Date.now()

  return Array.from({ length: 15 }, (_, i) => ({
    id: `${memberId}-checkin-${i}`,
    memberId,
    memberName: '', // Not needed for history display
    status: statuses[i % statuses.length],
    timestamp: new Date(baseTime - i * 86400000 - Math.random() * 43200000).toISOString(),
  }))
}

export function useCheckInHistory(memberId: string) {
  const [history, setHistory] = useState<CheckInEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // TODO: Replace with Supabase query
    const fetchHistory = async () => {
      setIsLoading(true)
      try {
        await new Promise((resolve) => setTimeout(resolve, 300))
        setHistory(generateMockHistory(memberId))
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch check-in history'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistory()
  }, [memberId])

  return { history, isLoading, error }
}
