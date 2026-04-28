import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  archiveResolvedRequestNotificationsMock,
  getMemberPauseReviewTimestampMock,
  getSupabaseAdminClientMock,
  maybeQueuePauseRevokeCardMock,
  readMemberWithCardCodeMock,
  resolvePermissionsForProfileMock,
} = vi.hoisted(() => ({
  archiveResolvedRequestNotificationsMock: vi.fn().mockResolvedValue(undefined),
  getMemberPauseReviewTimestampMock: vi.fn(() => '2026-04-18T12:00:00-05:00'),
  getSupabaseAdminClientMock: vi.fn(),
  maybeQueuePauseRevokeCardMock: vi.fn(),
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
    maybeQueuePauseRevokeCard: maybeQueuePauseRevokeCardMock,
  }
})

vi.mock('@/lib/pt-notifications-server', () => ({
  archiveResolvedRequestNotifications: archiveResolvedRequestNotificationsMock,
}))

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

import { PATCH } from '@/app/api/members/pause-requests/[requestId]/route'
import { MEMBER_PAUSE_REQUEST_SELECT } from '@/lib/member-pause-request-records'

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

function createPauseRequestRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pause-request-1',
    member_id: 'member-1',
    requested_by: 'staff-1',
    duration_days: 84,
    status: 'pending',
    reviewed_by: null,
    review_timestamp: null,
    created_at: '2026-04-11T10:00:00.000Z',
    member: {
      id: 'member-1',
      name: 'Jane Doe',
      status: 'Active',
      end_time: '2026-06-30T23:59:59.000Z',
    },
    requestedByProfile: { name: 'Jordan Staff' },
    reviewedByProfile: null,
    ...overrides,
  }
}

function createPauseRequestReviewClient(options: {
  existingRequest?: Record<string, unknown> | null
  approvalRpcResult?: string | null
  approvalRpcError?: { message: string } | null
} = {}) {
  const requestUpdates: Array<Record<string, unknown>> = []
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []

  return {
    requestUpdates,
    rpcCalls,
    client: {
      from(table: string) {
        if (table !== 'member_pause_requests') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select(columns: string) {
            expect(columns).toBe(MEMBER_PAUSE_REQUEST_SELECT)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('pause-request-1')

                return {
                  maybeSingle() {
                    const existingRequest =
                      options.existingRequest === undefined
                        ? createPauseRequestRecord()
                        : options.existingRequest

                    return Promise.resolve({
                      data: existingRequest,
                      error: null,
                    })
                  },
                }
              },
            }
          },
          update(values: Record<string, unknown>) {
            requestUpdates.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('status')
                expect(value).toBe('pending')

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('id')
                    expect(nextValue).toBe('pause-request-1')

                    return {
                      select(columns: string) {
                        expect(columns).toBe(MEMBER_PAUSE_REQUEST_SELECT)

                        const existingRequest =
                          options.existingRequest === undefined
                            ? createPauseRequestRecord()
                            : options.existingRequest

                        return Promise.resolve({
                          data: existingRequest ? [{ ...existingRequest, ...values }] : [],
                          error: null,
                        })
                      },
                    }
                  },
                }
              },
            }
          },
        }
      },
      rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args })

        return Promise.resolve({
          data: options.approvalRpcResult ?? 'pause-request-1',
          error: options.approvalRpcError ?? null,
        })
      },
    },
  }
}

describe('PATCH /api/members/pause-requests/[requestId]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    archiveResolvedRequestNotificationsMock.mockReset()
    archiveResolvedRequestNotificationsMock.mockResolvedValue(undefined)
    getMemberPauseReviewTimestampMock.mockReset()
    getMemberPauseReviewTimestampMock.mockReturnValue('2026-04-18T12:00:00-05:00')
    getSupabaseAdminClientMock.mockReset()
    maybeQueuePauseRevokeCardMock.mockReset()
    readMemberWithCardCodeMock.mockReset()
    resolvePermissionsForProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('approves the pause request on the happy path', async () => {
    const { client, rpcCalls, requestUpdates } = createPauseRequestReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readMemberWithCardCodeMock.mockResolvedValue(createMemberWithCard())
    maybeQueuePauseRevokeCardMock.mockResolvedValue(null)
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/members/pause-requests/pause-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'pause-request-1' }),
      },
    )

    expect(requestUpdates).toEqual([])
    expect(rpcCalls).toEqual([
      {
        fn: 'approve_member_pause_request',
        args: {
          p_request_id: 'pause-request-1',
          p_reviewer_id: 'admin-1',
          p_review_timestamp: '2026-04-18T12:00:00-05:00',
        },
      },
    ])
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'pause-request-1',
      type: 'member_pause_request',
      archivedAt: '2026-04-18T12:00:00-05:00',
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      success: true,
    })
  })

  it('rejects the pause request on the happy path', async () => {
    const { client, requestUpdates } = createPauseRequestReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/members/pause-requests/pause-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reject',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'pause-request-1' }),
      },
    )

    expect(requestUpdates).toEqual([
      expect.objectContaining({
        status: 'rejected',
        reviewed_by: 'admin-1',
        review_timestamp: '2026-04-18T12:00:00-05:00',
      }),
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      success: true,
    })
  })

  it('returns 401 when the user is unauthenticated', async () => {
    mockUnauthorized()

    const response = await PATCH(
      new Request('http://localhost/api/members/pause-requests/pause-request-1', {
        method: 'PATCH',
      }),
      {
        params: Promise.resolve({ requestId: 'pause-request-1' }),
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

    const response = await PATCH(
      new Request('http://localhost/api/members/pause-requests/pause-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'pause-request-1' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('returns 404 when the pause request is not found', async () => {
    const { client } = createPauseRequestReviewClient({
      existingRequest: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/members/pause-requests/pause-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'pause-request-1' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member pause request not found.',
    })
  })

  it('returns 400 when the pause request has already been reviewed', async () => {
    const { client } = createPauseRequestReviewClient({
      existingRequest: createPauseRequestRecord({
        status: 'approved',
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/members/pause-requests/pause-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'pause-request-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This request has already been reviewed.',
    })
  })

  it('returns 400 when approval fails because the member is inactive', async () => {
    const { client } = createPauseRequestReviewClient({
      approvalRpcResult: null,
      approvalRpcError: {
        message: 'Member has no active membership.',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    resolvePermissionsForProfileMock.mockReturnValue(createPermissions(true))
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/members/pause-requests/pause-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'pause-request-1' }),
      },
    )

    expect(maybeQueuePauseRevokeCardMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member has no active membership.',
    })
  })

  it('returns success with a warning when card sync fails after approval', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = createPauseRequestReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readMemberWithCardCodeMock.mockResolvedValue(createMemberWithCard())
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

    const response = await PATCH(
      new Request('http://localhost/api/members/pause-requests/pause-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'pause-request-1' }),
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      success: true,
      warning: 'Membership paused, but card sync failed: Failed to revoke card.',
    })
  })
})
