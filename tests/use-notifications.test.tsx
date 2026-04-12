// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClientMock,
  invalidateQueriesMock,
  removeChannelMock,
  subscribeMock,
  useQueryMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  removeChannelMock: vi.fn().mockResolvedValue(undefined),
  subscribeMock: vi.fn(),
  useQueryMock: vi.fn(),
}))

let insertCallback: ((payload: { new: { type?: string } | null }) => void) | null = null
let subscribedChannel: { topic: string } | null = null

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}))

import { useNotifications } from '@/hooks/use-notifications'

function TestComponent() {
  useNotifications('user-1')

  return null
}

describe('useNotifications', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    insertCallback = null
    subscribedChannel = { topic: 'notifications:user-1' }
    useQueryMock.mockReset()
    useQueryMock
      .mockReturnValueOnce({
        data: [],
        error: null,
      })
      .mockReturnValueOnce({
        data: 0,
        error: null,
      })
    invalidateQueriesMock.mockClear()
    removeChannelMock.mockClear()
    subscribeMock.mockReset()
    subscribeMock.mockImplementation(() => subscribedChannel)
    createClientMock.mockReset()
    createClientMock.mockReturnValue({
      channel: vi.fn(() => ({
        on: vi.fn(
          (
            _event: string,
            _filter: Record<string, string>,
            callback: (payload: { new: { type?: string } | null }) => void,
          ) => {
            insertCallback = callback

            return {
              subscribe: subscribeMock,
            }
          },
        ),
      })),
      removeChannel: removeChannelMock,
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    document.body.innerHTML = ''
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      false
    vi.clearAllMocks()
  })

  it('invalidates member edit request queries when a member edit notification arrives', async () => {
    await act(async () => {
      root.render(<TestComponent />)
    })

    if (!insertCallback) {
      throw new Error('Insert callback was not registered.')
    }

    await act(async () => {
      insertCallback?.({
        new: {
          type: 'member_edit_request',
        },
      })
    })

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1', 'unread-count'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberEditRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberEditRequests', 'pending'],
    })
  })

  it('invalidates member payment request queries when a member payment notification arrives', async () => {
    await act(async () => {
      root.render(<TestComponent />)
    })

    if (!insertCallback) {
      throw new Error('Insert callback was not registered.')
    }

    await act(async () => {
      insertCallback?.({
        new: {
          type: 'member_payment_request',
        },
      })
    })

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['notifications', 'user-1', 'unread-count'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberPaymentRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberPaymentRequests', 'pending'],
    })
  })
})
