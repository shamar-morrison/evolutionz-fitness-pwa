import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockAuthenticatedUser,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  archiveResolvedRequestNotificationsMock,
  createClientMock,
  getMemberPauseEligibilityErrorMock,
  getMemberPauseReviewTimestampMock,
  getMemberPauseTodayDateMock,
  getSupabaseAdminClientMock,
  insertNotificationsMock,
  maybeQueuePauseAddCardMock,
  maybeQueuePauseRevokeCardMock,
  readActivePauseByIdMock,
  readAdminNotificationRecipientsMock,
  readMemberWithCardCodeMock,
  readPendingEarlyResumeRequestForPauseMock,
  readStaffProfileMock,
  sendPushToProfilesMock,
} = vi.hoisted(() => ({
  archiveResolvedRequestNotificationsMock: vi.fn().mockResolvedValue(undefined),
  createClientMock: vi.fn(),
  getMemberPauseEligibilityErrorMock: vi.fn(),
  getMemberPauseReviewTimestampMock: vi.fn(() => '2026-04-18T12:00:00-05:00'),
  getMemberPauseTodayDateMock: vi.fn(() => '2026-04-18'),
  getSupabaseAdminClientMock: vi.fn(),
  insertNotificationsMock: vi.fn().mockResolvedValue(undefined),
  maybeQueuePauseAddCardMock: vi.fn(),
  maybeQueuePauseRevokeCardMock: vi.fn(),
  readActivePauseByIdMock: vi.fn(),
  readAdminNotificationRecipientsMock: vi.fn().mockResolvedValue([]),
  readMemberWithCardCodeMock: vi.fn(),
  readPendingEarlyResumeRequestForPauseMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
  sendPushToProfilesMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/member-pause-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-pause-server')>(
    '@/lib/member-pause-server',
  )

  return {
    ...actual,
    getMemberPauseEligibilityError: getMemberPauseEligibilityErrorMock,
    getMemberPauseReviewTimestamp: getMemberPauseReviewTimestampMock,
    getMemberPauseTodayDate: getMemberPauseTodayDateMock,
    maybeQueuePauseRevokeCard: maybeQueuePauseRevokeCardMock,
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
    readPendingEarlyResumeRequestForPause: readPendingEarlyResumeRequestForPauseMock,
  }
})

vi.mock('@/lib/members', async () => {
  const actual = await vi.importActual<typeof import('@/lib/members')>('@/lib/members')

  return {
    ...actual,
    readMemberWithCardCode: readMemberWithCardCodeMock,
  }
})

vi.mock('@/lib/pt-notifications-server', () => ({
  archiveResolvedRequestNotifications: archiveResolvedRequestNotificationsMock,
  insertNotifications: insertNotificationsMock,
  readAdminNotificationRecipients: readAdminNotificationRecipientsMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

vi.mock('@/lib/staff', async () => {
  const actual = await vi.importActual<typeof import('@/lib/staff')>('@/lib/staff')

  return {
    ...actual,
    readStaffProfile: readStaffProfileMock,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/web-push', () => ({
  sendPushToProfiles: sendPushToProfilesMock,
}))

import { POST as postDirectPause } from '@/app/api/members/[id]/pause/route'
import { POST as postPauseRequest } from '@/app/api/members/[id]/pause-requests/route'
import {
  PATCH as patchPauseResumeRequest,
} from '@/app/api/members/pause-resume-requests/[requestId]/route'
import {
  PATCH as patchPauseRequest,
} from '@/app/api/members/pause-requests/[requestId]/route'
import {
  POST as postDirectResume,
} from '@/app/api/members/pauses/[pauseId]/resume/route'
import {
  POST as postPauseResumeRequest,
} from '@/app/api/members/pauses/[pauseId]/resume-requests/route'
import {
  MEMBER_PAUSE_REQUEST_SELECT,
  MEMBER_PAUSE_RESUME_REQUEST_SELECT,
  type MemberPauseRequestRecord,
  type MemberPauseResumeRequestRecord,
} from '@/lib/member-pause-request-records'
import {
  MEMBER_PAUSE_EARLY_RESUME_PENDING_ERROR,
  MEMBER_PAUSE_REQUEST_PENDING_ERROR,
} from '@/lib/member-pause'
import type { Profile } from '@/types'

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: overrides.id ?? 'staff-1',
    name: overrides.name ?? 'Jordan Staff',
    email: overrides.email ?? 'jordan@evolutionzfitness.com',
    role: overrides.role ?? 'staff',
    titles: overrides.titles ?? ['Administrative Assistant'],
    isSuspended: overrides.isSuspended ?? false,
    phone: overrides.phone ?? null,
    gender: overrides.gender ?? null,
    remark: overrides.remark ?? null,
    specialties: overrides.specialties ?? [],
    photoUrl: overrides.photoUrl ?? null,
    archivedAt: overrides.archivedAt ?? null,
    created_at: overrides.created_at ?? '2026-04-03T00:00:00.000Z',
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

function createPauseRequestRecord(
  overrides: Partial<MemberPauseRequestRecord> = {},
): MemberPauseRequestRecord {
  return {
    id: overrides.id ?? 'pause-request-1',
    member_id: overrides.member_id ?? 'member-1',
    requested_by: overrides.requested_by ?? 'staff-1',
    duration_days: overrides.duration_days ?? 84,
    status: overrides.status ?? 'pending',
    reviewed_by: overrides.reviewed_by ?? null,
    review_timestamp: overrides.review_timestamp ?? null,
    created_at: overrides.created_at ?? '2026-04-11T10:00:00.000Z',
    member:
      overrides.member === undefined
        ? {
            id: 'member-1',
            name: 'Jane Doe',
            status: 'Active',
            end_time: '2026-06-30T23:59:59.000Z',
          }
        : overrides.member,
    requestedByProfile:
      overrides.requestedByProfile === undefined ? { name: 'Jordan Staff' } : overrides.requestedByProfile,
    reviewedByProfile:
      overrides.reviewedByProfile === undefined ? null : overrides.reviewedByProfile,
  }
}

function createPauseResumeRequestRecord(
  overrides: Partial<MemberPauseResumeRequestRecord> = {},
): MemberPauseResumeRequestRecord {
  return {
    id: overrides.id ?? 'resume-request-1',
    pause_id: overrides.pause_id ?? 'pause-1',
    requested_by: overrides.requested_by ?? 'staff-1',
    status: overrides.status ?? 'pending',
    reviewed_by: overrides.reviewed_by ?? null,
    review_timestamp: overrides.review_timestamp ?? null,
    created_at: overrides.created_at ?? '2026-04-11T10:00:00.000Z',
    member:
      overrides.member === undefined
        ? {
            id: 'member-1',
            name: 'Jane Doe',
          }
        : overrides.member,
    pause:
      overrides.pause === undefined
        ? {
            id: 'pause-1',
            member_id: 'member-1',
            pause_start_date: '2026-04-10',
            planned_resume_date: '2026-07-03',
            original_end_time: '2026-09-30T23:59:59.000Z',
          }
        : overrides.pause,
    requestedByProfile:
      overrides.requestedByProfile === undefined ? { name: 'Jordan Staff' } : overrides.requestedByProfile,
    reviewedByProfile:
      overrides.reviewedByProfile === undefined ? null : overrides.reviewedByProfile,
  }
}

function createRpcClient({
  rpcResult,
  rpcError = null,
}: {
  rpcResult: string | null
  rpcError?: { message: string } | null
}) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []

  return {
    rpcCalls,
    client: {
      rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args })

        return Promise.resolve({
          data: rpcResult,
          error: rpcError,
        })
      },
    },
  }
}

function createPauseRequestReviewClient({
  existingRequestRow = createPauseRequestRecord(),
  approvalRpcResult = 'pause-request-1',
  approvalRpcError = null,
}: {
  existingRequestRow?: MemberPauseRequestRecord | null
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
        expect(table).toBe('member_pause_requests')

        return {
          select(columns: string) {
            expect(columns).toBe(MEMBER_PAUSE_REQUEST_SELECT)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('pause-request-1')

                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: existingRequestRow,
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

                        return Promise.resolve({
                          data: existingRequestRow ? [{ ...existingRequestRow, ...values }] : [],
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
          data: approvalRpcResult,
          error: approvalRpcError,
        })
      },
    },
  }
}

function createPauseResumeRequestReviewClient({
  existingRequestRow = createPauseResumeRequestRecord(),
  approvalRpcResult = 'resume-request-1',
  approvalRpcError = null,
}: {
  existingRequestRow?: MemberPauseResumeRequestRecord | null
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
        expect(table).toBe('member_pause_resume_requests')

        return {
          select(columns: string) {
            expect(columns).toBe(MEMBER_PAUSE_RESUME_REQUEST_SELECT)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('resume-request-1')

                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: existingRequestRow,
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

                        return Promise.resolve({
                          data: existingRequestRow ? [{ ...existingRequestRow, ...values }] : [],
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
          data: approvalRpcResult,
          error: approvalRpcError,
        })
      },
    },
  }
}

function createPauseRequestInsertClient({
  insertError,
}: {
  insertError: { message: string; code?: string | null; details?: string | null } | null
}) {
  const inserts: Array<Record<string, unknown>> = []

  return {
    inserts,
    client: {
      from(table: string) {
        expect(table).toBe('member_pause_requests')

        return {
          insert(values: Record<string, unknown>) {
            inserts.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe('id')

                return {
                  single() {
                    return Promise.resolve({
                      data: null,
                      error: insertError,
                    })
                  },
                }
              },
            }
          },
        }
      },
    },
  }
}

function createPauseResumeRequestInsertClient({
  insertError,
}: {
  insertError: { message: string; code?: string | null; details?: string | null } | null
}) {
  const inserts: Array<Record<string, unknown>> = []

  return {
    inserts,
    client: {
      from(table: string) {
        expect(table).toBe('member_pause_resume_requests')

        return {
          insert(values: Record<string, unknown>) {
            inserts.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe('id')

                return {
                  single() {
                    return Promise.resolve({
                      data: null,
                      error: insertError,
                    })
                  },
                }
              },
            }
          },
        }
      },
    },
  }
}

describe('member pause routes', () => {
  afterEach(() => {
    archiveResolvedRequestNotificationsMock.mockReset()
    archiveResolvedRequestNotificationsMock.mockResolvedValue(undefined)
    createClientMock.mockReset()
    getMemberPauseEligibilityErrorMock.mockReset()
    getMemberPauseReviewTimestampMock.mockReset()
    getMemberPauseReviewTimestampMock.mockReturnValue('2026-04-18T12:00:00-05:00')
    getMemberPauseTodayDateMock.mockReset()
    getMemberPauseTodayDateMock.mockReturnValue('2026-04-18')
    getSupabaseAdminClientMock.mockReset()
    insertNotificationsMock.mockReset()
    insertNotificationsMock.mockResolvedValue(undefined)
    maybeQueuePauseAddCardMock.mockReset()
    maybeQueuePauseRevokeCardMock.mockReset()
    readActivePauseByIdMock.mockReset()
    readAdminNotificationRecipientsMock.mockReset()
    readAdminNotificationRecipientsMock.mockResolvedValue([])
    readMemberWithCardCodeMock.mockReset()
    readPendingEarlyResumeRequestForPauseMock.mockReset()
    readStaffProfileMock.mockReset()
    sendPushToProfilesMock.mockReset()
    sendPushToProfilesMock.mockResolvedValue(undefined)
    vi.restoreAllMocks()
    resetServerAuthMocks()
  })

  it('returns success with a warning when direct pause card sync fails after the rpc commits', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, rpcCalls } = createRpcClient({
      rpcResult: 'pause-1',
    })
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
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await postDirectPause(
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
      warning: 'Membership paused, but card sync failed: Failed to revoke card.',
    })
  })

  it('returns success with a warning when direct resume card sync fails after the rpc commits', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, rpcCalls } = createRpcClient({
      rpcResult: '2026-09-30T23:59:59',
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readActivePauseByIdMock.mockResolvedValue({
      id: 'pause-1',
      member_id: 'member-1',
    })
    readMemberWithCardCodeMock.mockResolvedValue(createMemberWithCard())
    maybeQueuePauseAddCardMock.mockRejectedValue(
      new Error('Failed to create add card job: timeout'),
    )
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await postDirectResume(
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
      warning: 'Membership resumed, but card sync failed: Failed to create add card job: timeout',
    })
  })

  it('approves a pause request through the atomic rpc and returns a sync warning', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, requestUpdates, rpcCalls } = createPauseRequestReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readMemberWithCardCodeMock.mockResolvedValue(createMemberWithCard())
    maybeQueuePauseRevokeCardMock.mockResolvedValue({
      status: 'timeout',
      jobId: 'job-1',
      error: 'Revoke card request timed out after 10 seconds.',
      httpStatus: 504,
    })
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await patchPauseRequest(
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
      warning:
        'Membership paused, but card sync failed: Revoke card request timed out after 10 seconds.',
    })
  })

  it('approves an early resume request through the atomic rpc and returns a sync warning', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, requestUpdates, rpcCalls } = createPauseResumeRequestReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    readMemberWithCardCodeMock.mockResolvedValue(createMemberWithCard())
    maybeQueuePauseAddCardMock.mockResolvedValue({
      status: 'failed',
      jobId: 'job-2',
      error: 'Add card job failed.',
      httpStatus: 502,
    })
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await patchPauseResumeRequest(
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
      warning: 'Membership resumed, but card sync failed: Add card job failed.',
    })
  })

  it('maps pause request insert conflicts to the pending-request error', async () => {
    const { client, inserts } = createPauseRequestInsertClient({
      insertError: {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      },
    })
    createClientMock.mockReturnValue({})
    getSupabaseAdminClientMock.mockReturnValue(client)
    getMemberPauseEligibilityErrorMock.mockResolvedValue({
      member: createMemberWithCard({
        name: 'Jane Doe',
      }),
      error: null,
      status: 200,
    })
    readStaffProfileMock.mockResolvedValue(createProfile())
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await postPauseRequest(
      new Request('http://localhost/api/members/member-1/pause-requests', {
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

    expect(inserts).toEqual([
      {
        member_id: 'member-1',
        requested_by: 'staff-1',
        duration_days: 84,
        status: 'pending',
      },
    ])
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_PAUSE_REQUEST_PENDING_ERROR,
    })
  })

  it('maps early resume insert conflicts to the pending-request error', async () => {
    const { client, inserts } = createPauseResumeRequestInsertClient({
      insertError: {
        message: 'duplicate key value violates unique constraint',
        details:
          'Key (pause_id)=(pause-1) already exists in index member_pause_resume_requests_pending_pause_idx.',
      },
    })
    createClientMock.mockReturnValue({})
    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(createProfile())
    readActivePauseByIdMock.mockResolvedValue({
      id: 'pause-1',
      member_id: 'member-1',
      member: {
        name: 'Jane Doe',
      },
    })
    readPendingEarlyResumeRequestForPauseMock.mockResolvedValue(null)
    mockAuthenticatedUser({
      id: 'staff-1',
      email: 'staff@evolutionzfitness.com',
    })

    const response = await postPauseResumeRequest(
      new Request('http://localhost/api/members/pauses/pause-1/resume-requests', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ pauseId: 'pause-1' }),
      },
    )

    expect(inserts).toEqual([
      {
        pause_id: 'pause-1',
        member_id: 'member-1',
        requested_by: 'staff-1',
        status: 'pending',
      },
    ])
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_PAUSE_EARLY_RESUME_PENDING_ERROR,
    })
  })
})
