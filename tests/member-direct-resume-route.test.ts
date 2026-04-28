import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  getMemberPauseReviewTimestampMock,
  getMemberPauseTodayDateMock,
  getSupabaseAdminClientMock,
  maybeQueuePauseAddCardMock,
  readActivePauseByIdMock,
  readMemberWithCardCodeMock,
  resolvePermissionsForProfileMock,
} = vi.hoisted(() => ({
  getMemberPauseReviewTimestampMock: vi.fn(() => '2026-04-18T12:00:00-05:00'),
  getMemberPauseTodayDateMock: vi.fn(() => '2026-04-18'),
  getSupabaseAdminClientMock: vi.fn(),
  maybeQueuePauseAddCardMock: vi.fn(),
  readActivePauseByIdMock: vi.fn(),
  readMemberWithCardCodeMock: vi.fn(),
  resolvePermissionsForProfileMock: vi.fn(),
}))

vi.mock('@/lib/member-pause-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-pause-server')>(
    '@/lib/member-pause-server',
  )

  return {
    ...actual,
    getMemberPauseReviewTimestamp: getMemberPauseReviewTimestampMock,
    getMemberPauseTodayDate: getMemberPauseTodayDateMock,
    maybeQueuePauseAddCard: maybeQueuePauseAddCardMock,
  }
})

vi.mock('@/lib/member-pause-records', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-pause-records')>(
    '@/lib/member-pause-records',
  )

  return {
    ...actual,
    readActivePauseById: readActivePauseByIdMock,
  }
})

vi.mock('@/lib/members', async () => {
  const actual = await vi.importActual<typeof import('@/lib/members')>('@/lib/members')

  return {
    ...actual,
    readMemberWithCardCode: readMemberWithCardCodeMock,
  }
})

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

vi.mock('@/lib/server-permissions', () => ({
  resolvePermissionsForProfile: resolvePermissionsForProfileMock,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { POST } from '@/app/api/members/pauses/[pauseId]/resume/route'

function createPermissions(allowed = true) {
  return {
    role: 'admin' as const,
    can: (permission: string) => permission === 'members.pauseMembership' && allowed,
  }
}

function createMemberWithCard(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'member-1',
    employeeNo: '000611',
    name: 'Jane Doe',
    cardNo: '0102857149',
    cardCode: 'A18',
    cardStatus: 'assigned',
    ...overrides,
  }
}

function createRpcClient(options: {
  rpcResult?: string | null
  rpcError?: { message: string } | null
} = {}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []

  return {
    rpcCalls,
    client: {
      rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args })

        return Promise.resolve({
          data: options.rpcResult ?? '2026-09-30T23:59:59',
          error: options.rpcError ?? null,
        })
      },
    },
  }
}

describe('POST /api/members/pauses/[pauseId]/resume', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getMemberPauseReviewTimestampMock.mockReset()
    getMemberPauseReviewTimestampMock.mockReturnValue('2026-04-18T12:00:00-05:00')
    getMemberPauseTodayDateMock.mockReset()
    getMemberPauseTodayDateMock.mockReturnValue('2026-04-18')
    getSupabaseAdminClientMock.mockReset()
    maybeQueuePauseAddCardMock.mockReset()
    readActivePauseByIdMock.mockReset()
    readMemberWithCardCodeMock.mockReset()
    resolvePermissionsForProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('resumes the member pause directly for admins on the happy path', async () => {
    const { client, rpcCalls } = createRpcClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readActivePauseByIdMock.mockResolvedValue({
      id: 'pause-1',
      member_id: 'member-1',
    })
    readMemberWithCardCodeMock.mockResolvedValue(createMemberWithCard())
    maybeQueuePauseAddCardMock.mockResolvedValue(null)
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/pauses/pause-1/resume', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(rpcCalls).toEqual([
      {
        fn: 'resume_member_pause',
        args: {
          p_pause_id: 'pause-1',
          p_actual_resume_date: '2026-04-18',
          p_now: '2026-04-18T12:00:00-05:00',
        },
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      new_end_time: '2026-09-30T23:59:59',
    })
  })

  it('returns 401 when the user is unauthenticated', async () => {
    mockUnauthorized()

    const response = await POST(
      new Request('http://localhost/api/members/pauses/pause-1/resume', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when the admin lacks the resume permission', async () => {
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(false))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/pauses/pause-1/resume', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(readActivePauseByIdMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('returns 404 when the active pause is not found', async () => {
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    readActivePauseByIdMock.mockResolvedValue(null)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/pauses/pause-1/resume', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Active pause not found.',
    })
  })

  it('maps RPC errors to the correct HTTP status', async () => {
    const { client } = createRpcClient({
      rpcResult: null,
      rpcError: {
        message: 'This pause is no longer active.',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readActivePauseByIdMock.mockResolvedValue({
      id: 'pause-1',
      member_id: 'member-1',
    })
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/pauses/pause-1/resume', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This pause is no longer active.',
    })
  })

  it('returns success with a warning when card sync fails after the resume RPC succeeds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = createRpcClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readActivePauseByIdMock.mockResolvedValue({
      id: 'pause-1',
      member_id: 'member-1',
    })
    readMemberWithCardCodeMock.mockResolvedValue(createMemberWithCard())
    maybeQueuePauseAddCardMock.mockRejectedValue(
      new Error('Failed to create add card job: timeout'),
    )
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/pauses/pause-1/resume', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      new_end_time: '2026-09-30T23:59:59',
      warning: 'Membership resumed, but card sync failed: Failed to create add card job: timeout',
    })
  })
})
