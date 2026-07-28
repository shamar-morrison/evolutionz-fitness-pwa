'use client'

import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { syncAvailableAccessCards } from '@/lib/available-cards'
import { queryKeys } from '@/lib/query-keys'

const CARD_SYNC_TOAST_ID = 'card-sync'

type CardSyncContextValue = {
  isSyncing: boolean
  triggerSync: () => Promise<void>
}

const CardSyncContext = createContext<CardSyncContextValue | undefined>(undefined)

type CardSyncProviderProps = {
  children: ReactNode
}

export function CardSyncProvider({ children }: CardSyncProviderProps) {
  const queryClient = useQueryClient()
  const [isSyncing, setIsSyncing] = useState(false)
  const isSyncingRef = useRef(false)

  const triggerSync = useCallback(async () => {
    if (isSyncingRef.current) {
      return
    }

    isSyncingRef.current = true
    setIsSyncing(true)
    toast.loading('Syncing cards...', { id: CARD_SYNC_TOAST_ID })

    try {
      const syncedCards = await syncAvailableAccessCards()

      toast.success('Cards synced', {
        id: CARD_SYNC_TOAST_ID,
        description: `Sync complete — ${syncedCards} cards synced`,
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.cards.available })
    } catch (syncError) {
      toast.error('Card sync failed', {
        id: CARD_SYNC_TOAST_ID,
        description:
          syncError instanceof Error ? syncError.message : 'Failed to sync cards from the device.',
      })
    } finally {
      isSyncingRef.current = false
      setIsSyncing(false)
    }
  }, [queryClient])

  return (
    <CardSyncContext.Provider value={{ isSyncing, triggerSync }}>
      {children}
    </CardSyncContext.Provider>
  )
}

export function useCardSync() {
  const context = useContext(CardSyncContext)

  if (!context) {
    throw new Error('useCardSync must be used within a CardSyncProvider.')
  }

  return context
}
