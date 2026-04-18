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

type NotificationRealtimeRow = {
  type?: string | null
  archived_at?: string | null
}

type NotificationInsertPayload = {
  new: NotificationRealtimeRow | null
}

type NotificationUpdatePayload = {
  old: NotificationRealtimeRow | null
  new: NotificationRealtimeRow | null
}

let insertCallback: ((payload: NotificationInsertPayload) => void) | null = null
let updateCallback: ((payload: NotificationUpdatePayload) => void) | null = null
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

async function renderComponent(root: Root) {
  await act(async () => {
    root.render(<TestComponent />)
  })
}

async function emitInsert(payload: NotificationInsertPayload) {
  if (!insertCallback) {
    throw new Error('Insert callback was not registered.')
  }

  await act(async () => {
    insertCallback?.(payload)
  })
}

async function emitUpdate(payload: NotificationUpdatePayload) {
  if (!updateCallback) {
    throw new Error('Update callback was not registered.')
  }

  await act(async () => {
    updateCallback?.(payload)
  })
}

function expectNotificationListInvalidation() {
  expect(invalidateQueriesMock).toHaveBeenCalledWith({
    queryKey: ['notifications', 'user-1'],
  })
}

function expectUnreadCountInvalidation() {
  expect(invalidateQueriesMock).toHaveBeenCalledWith({
    queryKey: ['notifications', 'user-1', 'unread-count'],
  })
}

function expectArchivedNotificationsInvalidation() {
  expect(invalidateQueriesMock).toHaveBeenCalledWith({
    queryKey: ['notifications', 'user-1', 'archived'],
  })
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
    updateCallback = null
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
    const channelMock = {
      on: vi.fn(),
      subscribe: subscribeMock,
    }
    channelMock.on.mockImplementation(
      (
        _event: string,
        filter: Record<string, string>,
        callback: ((payload: NotificationInsertPayload) => void) | ((payload: NotificationUpdatePayload) => void),
      ) => {
        if (filter.event === 'INSERT') {
          insertCallback = callback as (payload: NotificationInsertPayload) => void
        }

        if (filter.event === 'UPDATE') {
          updateCallback = callback as (payload: NotificationUpdatePayload) => void
        }

        return channelMock
      },
    )
    createClientMock.mockReturnValue({
      channel: vi.fn(() => channelMock),
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
    await renderComponent(root)
    await emitInsert({
      new: {
        type: 'member_edit_request',
      },
    })

    expectNotificationListInvalidation()
    expectUnreadCountInvalidation()
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberEditRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberEditRequests', 'pending'],
    })
  })

  it('invalidates member approval request queries when a member create notification arrives', async () => {
    await renderComponent(root)
    await emitInsert({
      new: {
        type: 'member_create_request',
      },
    })

    expectNotificationListInvalidation()
    expectUnreadCountInvalidation()
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberApprovalRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberApprovalRequests', 'pending'],
    })
  })

  it('invalidates member payment request queries when a member payment notification arrives', async () => {
    await renderComponent(root)
    await emitInsert({
      new: {
        type: 'member_payment_request',
      },
    })

    expectNotificationListInvalidation()
    expectUnreadCountInvalidation()
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberPaymentRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberPaymentRequests', 'pending'],
    })
  })

  it('invalidates member extension request queries when a member extension notification arrives', async () => {
    await renderComponent(root)
    await emitInsert({
      new: {
        type: 'member_extension_request',
      },
    })

    expectNotificationListInvalidation()
    expectUnreadCountInvalidation()
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberExtensionRequests'],
    })
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['memberExtensionRequests', 'pending'],
    })
  })

  it.each([
    {
      notificationType: 'member_create_request',
      expectedAllKey: ['memberApprovalRequests'],
      expectedPendingKey: ['memberApprovalRequests', 'pending'],
    },
    {
      notificationType: 'member_edit_request',
      expectedAllKey: ['memberEditRequests'],
      expectedPendingKey: ['memberEditRequests', 'pending'],
    },
    {
      notificationType: 'member_payment_request',
      expectedAllKey: ['memberPaymentRequests'],
      expectedPendingKey: ['memberPaymentRequests', 'pending'],
    },
    {
      notificationType: 'member_extension_request',
      expectedAllKey: ['memberExtensionRequests'],
      expectedPendingKey: ['memberExtensionRequests', 'pending'],
    },
    {
      notificationType: 'reschedule_request',
      expectedAllKey: ['reschedule-requests'],
      expectedPendingKey: ['reschedule-requests', 'pending'],
    },
    {
      notificationType: 'status_change_request',
      expectedAllKey: ['session-update-requests'],
      expectedPendingKey: ['session-update-requests', 'pending'],
    },
  ])(
    'invalidates the correct pending queries when an archived $notificationType notification update arrives',
    async ({ notificationType, expectedAllKey, expectedPendingKey }) => {
      await renderComponent(root)

      await emitUpdate({
        old: {
          type: notificationType,
          archived_at: null,
        },
        new: {
          type: notificationType,
          archived_at: '2026-04-13T12:00:00.000Z',
        },
      })

      expectNotificationListInvalidation()
      expectArchivedNotificationsInvalidation()
      expectUnreadCountInvalidation()
      expect(invalidateQueriesMock).toHaveBeenCalledWith({
        queryKey: expectedAllKey,
      })
      expect(invalidateQueriesMock).toHaveBeenCalledWith({
        queryKey: expectedPendingKey,
      })
    },
  )

  it('does not invalidate queries when a notification update does not archive the row', async () => {
    await renderComponent(root)

    await emitUpdate({
      old: {
        type: 'member_create_request',
        archived_at: null,
      },
      new: {
        type: 'member_create_request',
        archived_at: null,
      },
    })

    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })
})
