// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  applySessionMemberOverrideMock,
  applySessionMemberOverridesMock,
  createClientMock,
  getSessionMemberOverridesMock,
  invalidateQueriesMock,
  keepPreviousDataToken,
  removeChannelMock,
  subscribeMock,
  subscribeToSessionMemberOverridesMock,
  useAuthMock,
  useQueryClientMock,
  useQueryMock,
} = vi.hoisted(() => ({
  applySessionMemberOverrideMock: vi.fn(),
  applySessionMemberOverridesMock: vi.fn(),
  createClientMock: vi.fn(),
  getSessionMemberOverridesMock: vi.fn(),
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
  keepPreviousDataToken: Symbol('keepPreviousData'),
  removeChannelMock: vi.fn().mockResolvedValue(undefined),
  subscribeMock: vi.fn(),
  subscribeToSessionMemberOverridesMock: vi.fn(),
  useAuthMock: vi.fn(),
  useQueryClientMock: vi.fn(),
  useQueryMock: vi.fn(),
}))

type MembersInsertPayload = {
  [key: string]: unknown
}

let insertCallback: ((payload: MembersInsertPayload) => void) | null = null

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: keepPreviousDataToken,
  useQuery: useQueryMock,
  useQueryClient: useQueryClientMock,
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: useAuthMock,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/member-session-store', () => ({
  applySessionMemberOverride: applySessionMemberOverrideMock,
  applySessionMemberOverrides: applySessionMemberOverridesMock,
  getSessionMemberOverrides: getSessionMemberOverridesMock,
  subscribeToSessionMemberOverrides: subscribeToSessionMemberOverridesMock,
}))

import { useMembers } from '@/hooks/use-members'

function TestComponent() {
  useMembers()

  return null
}

async function renderComponent(root: Root) {
  await act(async () => {
    root.render(<TestComponent />)
  })
}

async function emitInsert(payload: MembersInsertPayload = {}) {
  if (!insertCallback) {
    throw new Error('Insert callback was not registered.')
  }

  await act(async () => {
    insertCallback?.(payload)
  })
}

describe('useMembers', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    insertCallback = null

    useQueryMock.mockReset()
    useQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    useQueryClientMock.mockReset()
    useQueryClientMock.mockReturnValue({
      invalidateQueries: invalidateQueriesMock,
    })

    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({
      user: {
        id: 'user-1',
      },
    })

    getSessionMemberOverridesMock.mockReset()
    getSessionMemberOverridesMock.mockReturnValue([])

    subscribeToSessionMemberOverridesMock.mockReset()
    subscribeToSessionMemberOverridesMock.mockImplementation(() => vi.fn())

    applySessionMemberOverridesMock.mockReset()
    applySessionMemberOverridesMock.mockImplementation((members) => members)

    applySessionMemberOverrideMock.mockReset()
    applySessionMemberOverrideMock.mockImplementation((member) => member)

    invalidateQueriesMock.mockClear()
    removeChannelMock.mockClear()
    subscribeMock.mockReset()

    const subscribedChannel = { topic: 'members-inserts-user-1' }
    subscribeMock.mockImplementation(() => subscribedChannel)

    createClientMock.mockReset()
    const channelMock = {
      on: vi.fn(),
      subscribe: subscribeMock,
    }

    channelMock.on.mockImplementation(
      (_event: string, filter: Record<string, string>, callback: (payload: MembersInsertPayload) => void) => {
        if (filter.event === 'INSERT') {
          insertCallback = callback
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

  it('enables keepPreviousData for members list refetches', async () => {
    await renderComponent(root)

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['members', 'all'],
        placeholderData: keepPreviousDataToken,
      }),
    )
  })

  it('subscribes to members insert realtime events for authenticated users only', async () => {
    await renderComponent(root)

    const supabase = createClientMock.mock.results[0]?.value as {
      channel: ReturnType<typeof vi.fn>
    }
    const channelMock = supabase.channel.mock.results[0]?.value as {
      on: ReturnType<typeof vi.fn>
    }

    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(supabase.channel).toHaveBeenCalledWith('members-inserts-user-1')
    expect(subscribeMock).toHaveBeenCalledTimes(1)
    expect(channelMock.on).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'members',
      },
      expect.any(Function),
    )
    expect(channelMock.on).toHaveBeenCalledTimes(1)
  })

  it('invalidates members query when an insert event is received', async () => {
    await renderComponent(root)
    await emitInsert()

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ['members', 'all'],
    })
  })

  it('does not open members realtime subscription when user is not authenticated', async () => {
    useAuthMock.mockReturnValue({
      user: null,
    })

    await renderComponent(root)

    expect(createClientMock).not.toHaveBeenCalled()
    expect(subscribeMock).not.toHaveBeenCalled()
  })

  it('removes members realtime channel when the hook unmounts', async () => {
    await renderComponent(root)

    const subscribedChannel = subscribeMock.mock.results[0]?.value

    await act(async () => {
      root.unmount()
    })

    expect(removeChannelMock).toHaveBeenCalledWith(subscribedChannel)
  })
})
