import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  getMemberPauseEligibilityErrorMock,
  getMemberPauseReviewTimestampMock,
  getSupabaseAdminClientMock,
  maybeQueuePauseRevokeCardMock,
  resolvePermissionsForProfileMock,
} = vi.hoisted(() => ({
  getMemberPauseEligibilityErrorMock: vi.fn(),
  getMemberPauseReviewTimestampMock: vi.fn(() => '2026-04-18T12:00:00-05:00'),
  getSupabaseAdminClientMock: vi.fn(),
  maybeQueuePauseRevokeCardMock: vi.fn(),
  resolvePermissionsForProfileMock: vi.fn(),
}))

vi.mock('@/lib/member-pause-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-pause-server')>(
    '@/lib/member-pause-server',
  )

  return {
    ...actual,
    getMemberPauseEligibilityError: getMemberPauseEligibilityErrorMock,
    getMemberPauseReviewTimestamp: getMemberPauseReviewTimestampMock,
    maybeQueuePauseRevokeCard: maybeQueuePauseRevokeCardMock,
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

import { POST } from '@/app/api/members/[id]/pause/route'
import { MEMBER_PAUSE_ACTIVE_ERROR, MEMBER_PAUSE_INACTIVE_ERROR } from '@/lib/member-pause'

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

function createPermissions(allowed = true) {
  return {
    role: 'admin' as const,
    can: (permission: string) => permission === 'members.pauseMembership' && allowed,
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
          data: options.rpcResult ?? 'pause-1',
          error: options.rpcError ?? null,
        })
      },
    },
  }
}

describe('POST /api/members/[id]/pause', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getMemberPauseEligibilityErrorMock.mockReset()
    getMemberPauseReviewTimestampMock.mockReset()
    getMemberPauseReviewTimestampMock.mockReturnValue('2026-04-18T12:00:00-05:00')
    getSupabaseAdminClientMock.mockReset()
    maybeQueuePauseRevokeCardMock.mockReset()
    resolvePermissionsForProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('pauses the member directly for admins on the happy path', async () => {
    const { client, rpcCalls } = createRpcClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    getMemberPauseEligibilityErrorMock.mockResolvedValue({
      member: createMemberWithCard(),
      error: null,
      status: 200,
    })
    maybeQueuePauseRevokeCardMock.mockResolvedValue(null)
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(rpcCalls).toEqual([
      {
        fn: 'apply_member_pause',
        args: {
          p_member_id: 'member-1',
          p_duration_days: 84,
          p_applied_by: 'admin-1',
          p_now: '2026-04-18T12:00:00-05:00',
        },
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      pause_id: 'pause-1',
    })
  })

  it('returns 401 when the user is unauthenticated', async () => {
    mockUnauthorized()

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns 403 when the admin lacks the pause permission', async () => {
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(false))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(getMemberPauseEligibilityErrorMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('returns 400 when the duration is unsupported', async () => {
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 999,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(getMemberPauseEligibilityErrorMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Duration must match a supported membership option.',
    })
  })

  it('returns 400 when the member has no active membership', async () => {
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    getMemberPauseEligibilityErrorMock.mockResolvedValue({
      member: createMemberWithCard(),
      error: MEMBER_PAUSE_INACTIVE_ERROR,
      status: 400,
    })
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_PAUSE_INACTIVE_ERROR,
    })
  })

  it('returns 400 when the member is already paused', async () => {
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    getMemberPauseEligibilityErrorMock.mockResolvedValue({
      member: createMemberWithCard(),
      error: MEMBER_PAUSE_ACTIVE_ERROR,
      status: 400,
    })
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_PAUSE_ACTIVE_ERROR,
    })
  })

  it('maps RPC errors to the correct HTTP status', async () => {
    const { client } = createRpcClient({
      rpcResult: null,
      rpcError: {
        message: MEMBER_PAUSE_ACTIVE_ERROR,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    getMemberPauseEligibilityErrorMock.mockResolvedValue({
      member: createMemberWithCard(),
      error: null,
      status: 200,
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
      new Request('http://localhost/api/members/member-1/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_PAUSE_ACTIVE_ERROR,
    })
  })

  it('returns success with a warning when card sync fails after the pause RPC succeeds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = createRpcClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    getMemberPauseEligibilityErrorMock.mockResolvedValue({
      member: createMemberWithCard(),
      error: null,
      status: 200,
    })
    maybeQueuePauseRevokeCardMock.mockResolvedValue({
      status: 'failed',
      jobId: 'job-1',
      error: 'Failed to revoke card.',
      httpStatus: 502,
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
      new Request('http://localhost/api/members/member-1/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      pause_id: 'pause-1',
      warning: 'Membership paused, but card sync failed: Failed to revoke card.',
    })
  })
})
