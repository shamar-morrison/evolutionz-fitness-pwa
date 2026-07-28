// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'

const { invalidateQueriesMock, syncAvailableAccessCardsMock, toastErrorMock, toastLoadingMock, toastSuccessMock } =
  vi.hoisted(() => ({
    invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
    syncAvailableAccessCardsMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastLoadingMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  }))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    loading: toastLoadingMock,
    success: toastSuccessMock,
  },
}))

vi.mock('@/lib/available-cards', () => ({
  syncAvailableAccessCards: syncAvailableAccessCardsMock,
}))

import { CardSyncProvider, useCardSync } from '@/components/providers/card-sync-provider'

type Deferred<T> = {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

let cardSyncContext: ReturnType<typeof useCardSync> | null = null

function CardSyncProbe() {
  cardSyncContext = useCardSync()

  return <span>{cardSyncContext.isSyncing ? 'syncing' : 'idle'}</span>
}

describe('CardSyncProvider', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    cardSyncContext = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.clearAllMocks()
  })

  async function renderProvider() {
    await act(async () => {
      root.render(
        <CardSyncProvider>
          <CardSyncProbe />
        </CardSyncProvider>,
      )
    })
  }

  it('updates one loading toast to success and invalidates available cards', async () => {
    const deferred = createDeferred<number>()
    syncAvailableAccessCardsMock.mockReturnValueOnce(deferred.promise)
    await renderProvider()

    let syncPromise: Promise<void>
    await act(async () => {
      syncPromise = cardSyncContext!.triggerSync()
      await Promise.resolve()
    })

    expect(container.textContent).toBe('syncing')
    expect(toastLoadingMock).toHaveBeenCalledWith('Syncing cards...', { id: 'card-sync' })

    await act(async () => {
      deferred.resolve(12)
      await syncPromise
    })

    expect(container.textContent).toBe('idle')
    expect(toastSuccessMock).toHaveBeenCalledWith('Cards synced', {
      id: 'card-sync',
      description: 'Sync complete — 12 cards synced',
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.cards.available })
  })

  it('updates the loading toast to the existing error message', async () => {
    const deferred = createDeferred<number>()
    syncAvailableAccessCardsMock.mockReturnValueOnce(deferred.promise)
    await renderProvider()

    let syncPromise: Promise<void>
    await act(async () => {
      syncPromise = cardSyncContext!.triggerSync()
      await Promise.resolve()
    })

    await act(async () => {
      deferred.reject(new Error('Bridge sync failed.'))
      await syncPromise
    })

    expect(container.textContent).toBe('idle')
    expect(toastErrorMock).toHaveBeenCalledWith('Card sync failed', {
      id: 'card-sync',
      description: 'Bridge sync failed.',
    })
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })

  it('suppresses duplicate triggers while a sync is already running', async () => {
    const deferred = createDeferred<number>()
    syncAvailableAccessCardsMock.mockReturnValueOnce(deferred.promise)
    await renderProvider()

    let firstSync: Promise<void>
    await act(async () => {
      firstSync = cardSyncContext!.triggerSync()
      await cardSyncContext!.triggerSync()
    })

    expect(syncAvailableAccessCardsMock).toHaveBeenCalledTimes(1)
    expect(toastLoadingMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      deferred.resolve(3)
      await firstSync
    })
  })
})
