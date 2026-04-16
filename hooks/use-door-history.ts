'use client'

import { useQuery } from '@tanstack/react-query'
import {
  DOOR_HISTORY_QUERY_STALE_TIME_MS,
  fetchDoorHistory,
} from '@/lib/door-history'
import { queryKeys } from '@/lib/query-keys'
import type { DoorHistoryResponse } from '@/types'

export function useDoorHistory(date: string) {
  return useQuery<DoorHistoryResponse, Error>({
    queryKey: queryKeys.doorHistory.byDate(date),
    queryFn: () => fetchDoorHistory(date),
    staleTime: DOOR_HISTORY_QUERY_STALE_TIME_MS,
    enabled: Boolean(date),
  })
}
