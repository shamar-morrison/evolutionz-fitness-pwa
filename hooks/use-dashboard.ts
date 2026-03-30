'use client'

import { useState, useEffect } from 'react'
import type { DashboardData, CheckInEvent } from '@/types'

// TODO: Replace with Supabase queries
const MOCK_RECENT_ACTIVITY: CheckInEvent[] = [
  {
    id: '1',
    memberId: '1',
    memberName: 'Damion Williams',
    status: 'success',
    timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: '2',
    memberId: '2',
    memberName: 'Keisha Brown',
    status: 'success',
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
  },
  {
    id: '3',
    memberId: 'unknown',
    memberName: 'Unknown Card #4521',
    status: 'not_found',
    timestamp: new Date(Date.now() - 25 * 60000).toISOString(),
  },
  {
    id: '4',
    memberId: '3',
    memberName: 'Marcus Thompson',
    status: 'expired',
    timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
  },
  {
    id: '5',
    memberId: '4',
    memberName: 'Andre Campbell',
    status: 'success',
    timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
  },
  {
    id: '6',
    memberId: '5',
    memberName: 'Shanique Mighty',
    status: 'success',
    timestamp: new Date(Date.now() - 90 * 60000).toISOString(),
  },
  {
    id: '7',
    memberId: '6',
    memberName: 'Robert Grant',
    status: 'suspended',
    timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
  },
]

const MOCK_DASHBOARD_DATA: DashboardData = {
  stats: {
    activeMembers: 247,
    expiredMembers: 38,
    checkInsToday: 89,
  },
  recentActivity: MOCK_RECENT_ACTIVITY,
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // TODO: Replace with Supabase query
    const fetchData = async () => {
      setIsLoading(true)
      try {
        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 500))
        setData(MOCK_DASHBOARD_DATA)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch dashboard data'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  return { data, isLoading, error }
}
