import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  archiveResolvedRequestNotificationsMock,
  getMemberPauseReviewTimestampMock,
  getMemberPauseTodayDateMock,
  getSupabaseAdminClientMock,
  maybeQueuePauseAddCardMock,
  readMemberWithCardCodeMock,
  resolvePermissionsForProfileMock,
} = vi.hoisted(() => ({
  archiveResolvedRequestNotificationsMock: vi.fn().mockResolvedValue(undefined),
  getMemberPauseReviewTimestampMock: vi.fn(() => '2026-04-18T12:00:00-05:00'),
  getMemberPauseTodayDateMock: vi.fn(() => '2026-04-18'),
  getSupabaseAdminClientMock: vi.fn(),
  maybeQueuePauseAddCardMock: vi.fn(),
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

import { PATCH } from '@/app/api/members/pause-resume-requests/[requestId]/route'
import { MEMBER_PAUSE_RESUME_REQUEST_SELECT } from '@/lib/member-pause-request-records'

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

function createPauseResumeRequestRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'resume-request-1',
    pause_id: 'pause-1',
    requested_by: 'staff-1',
    status: 'pending',
    reviewed_by: null,
    review_timestamp: null,
    created_at: '2026-04-11T10:00:00.000Z',
    member: {
      id: 'member-1',
      name: 'Jane Doe',
    },
    pause: {
      id: 'pause-1',
      member_id: 'member-1',
      pause_start_date: '2026-04-10',
      planned_resume_date: '2026-07-03',
      original_end_time: '2026-09-30T23:59:59.000Z',
    },
    requestedByProfile: { name: 'Jordan Staff' },
    reviewedByProfile: null,
    ...overrides,
  }
}

function createPauseResumeRequestReviewClient(options: {
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
        if (table !== 'member_pause_resume_requests') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select(columns: string) {
            expect(columns).toBe(MEMBER_PAUSE_RESUME_REQUEST_SELECT)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('resume-request-1')

                return {
                  maybeSingle() {
                    const existingRequest =
                      options.existingRequest === undefined
                        ? createPauseResumeRequestRecord()
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
                    expect(nextValue).toBe('resume-request-1')

                    return {
                      select(columns: string) {
                        expect(columns).toBe(MEMBER_PAUSE_RESUME_REQUEST_SELECT)

                        const existingRequest =
                          options.existingRequest === undefined
                            ? createPauseResumeRequestRecord()
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
          data: options.approvalRpcResult ?? 'resume-request-1',
          error: options.approvalRpcError ?? null,
        })
      },
    },
  }
}

describe('PATCH /api/members/pause-resume-requests/[requestId]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    archiveResolvedRequestNotificationsMock.mockReset()
    archiveResolvedRequestNotificationsMock.mockResolvedValue(undefined)
    getMemberPauseReviewTimestampMock.mockReset()
    getMemberPauseReviewTimestampMock.mockReturnValue('2026-04-18T12:00:00-05:00')
    getMemberPauseTodayDateMock.mockReset()
    getMemberPauseTodayDateMock.mockReturnValue('2026-04-18')
    getSupabaseAdminClientMock.mockReset()
    maybeQueuePauseAddCardMock.mockReset()
    readMemberWithCardCodeMock.mockReset()
    resolvePermissionsForProfileMock.mockReset()
    resetServerAuthMocks()
  })

  it('approves the early resume request on the happy path', async () => {
    const { client, rpcCalls, requestUpdates } = createPauseResumeRequestReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
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

    const response = await PATCH(
      new Request('http://localhost/api/members/pause-resume-requests/resume-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'resume-request-1' }),
      },
    )

    expect(requestUpdates).toEqual([])
    expect(rpcCalls).toEqual([
      {
        fn: 'approve_member_pause_resume_request',
        args: {
          p_request_id: 'resume-request-1',
          p_reviewer_id: 'admin-1',
          p_review_timestamp: '2026-04-18T12:00:00-05:00',
          p_actual_resume_date: '2026-04-18',
        },
      },
    ])
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'resume-request-1',
      type: 'member_pause_request',
      archivedAt: '2026-04-18T12:00:00-05:00',
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      success: true,
    })
  })

  it('rejects the early resume request on the happy path', async () => {
    const { client, requestUpdates } = createPauseResumeRequestReviewClient()
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
      new Request('http://localhost/api/members/pause-resume-requests/resume-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reject',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'resume-request-1' }),
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
      new Request('http://localhost/api/members/pause-resume-requests/resume-request-1', {
        method: 'PATCH',
      }),
      {
        params: Promise.resolve({ requestId: 'resume-request-1' }),
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
      new Request('http://localhost/api/members/pause-resume-requests/resume-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'resume-request-1' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('returns 404 when the early resume request is not found', async () => {
    const { client } = createPauseResumeRequestReviewClient({
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
      new Request('http://localhost/api/members/pause-resume-requests/resume-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'resume-request-1' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Early resume request not found.',
    })
  })

  it('returns 400 when the early resume request has already been reviewed', async () => {
    const { client } = createPauseResumeRequestReviewClient({
      existingRequest: createPauseResumeRequestRecord({
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
      new Request('http://localhost/api/members/pause-resume-requests/resume-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'resume-request-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This request has already been reviewed.',
    })
  })

  it('maps RPC errors to the correct HTTP status', async () => {
    const { client } = createPauseResumeRequestReviewClient({
      approvalRpcResult: null,
      approvalRpcError: {
        message: 'This pause is no longer active.',
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
      new Request('http://localhost/api/members/pause-resume-requests/resume-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'resume-request-1' }),
      },
    )

    expect(maybeQueuePauseAddCardMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This pause is no longer active.',
    })
  })

  it('returns success with a warning when card sync fails after approval', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = createPauseResumeRequestReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readMemberWithCardCodeMock.mockResolvedValue(createMemberWithCard())
    maybeQueuePauseAddCardMock.mockResolvedValue({
      status: 'failed',
      jobId: 'job-2',
      error: 'Add card job failed.',
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
      new Request('http://localhost/api/members/pause-resume-requests/resume-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'resume-request-1' }),
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      success: true,
      warning: 'Membership resumed, but card sync failed: Add card job failed.',
    })
  })
})
