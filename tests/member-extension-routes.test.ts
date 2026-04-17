import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockAuthenticatedUser,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  applyPreparedMemberExtensionMock,
  archiveResolvedRequestNotificationsMock,
  createClientMock,
  getSupabaseAdminClientMock,
  insertNotificationsMock,
  prepareMemberExtensionMock,
  readAdminNotificationRecipientsMock,
  readMemberWithCardCodeMock,
  readStaffProfileMock,
  sendPushToProfilesMock,
  syncPreparedMemberExtensionAccessWindowMock,
} = vi.hoisted(() => ({
  applyPreparedMemberExtensionMock: vi.fn(),
  archiveResolvedRequestNotificationsMock: vi.fn().mockResolvedValue(undefined),
  createClientMock: vi.fn(),
  getSupabaseAdminClientMock: vi.fn(),
  insertNotificationsMock: vi.fn().mockResolvedValue(undefined),
  prepareMemberExtensionMock: vi.fn(),
  readAdminNotificationRecipientsMock: vi.fn().mockResolvedValue([]),
  readMemberWithCardCodeMock: vi.fn(),
  readStaffProfileMock: vi.fn(),
  sendPushToProfilesMock: vi.fn().mockResolvedValue(undefined),
  syncPreparedMemberExtensionAccessWindowMock: vi.fn(),
}))

vi.mock('@/lib/member-extension-server', () => ({
  applyPreparedMemberExtension: applyPreparedMemberExtensionMock,
  prepareMemberExtension: prepareMemberExtensionMock,
  MEMBER_EXTENSION_SYNC_WARNING:
    'Membership extended but device sync failed. Please try again.',
  MEMBER_EXTENSION_NO_BEGIN_TIME_WARNING:
    'Membership extended but access window is not configured for device sync.',
  syncPreparedMemberExtensionAccessWindow: syncPreparedMemberExtensionAccessWindowMock,
}))

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

import { POST as postMemberExtensionRequest } from '@/app/api/members/[id]/extension-requests/route'
import { POST as postDirectMemberExtension } from '@/app/api/members/[id]/extend/route'
import {
  PATCH as patchMemberExtensionRequest,
} from '@/app/api/members/extension-requests/[requestId]/route'
import { GET as getPendingMemberExtensionRequests } from '@/app/api/members/extension-requests/route'
import {
  MEMBER_EXTENSION_REQUEST_SELECT,
  type MemberExtensionRequestRecord,
} from '@/lib/member-extension-request-records'
import { MEMBER_EXTENSION_INACTIVE_ERROR } from '@/lib/member-extension'
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

function createExtensionRequestRecord(
  overrides: Partial<MemberExtensionRequestRecord> = {},
): MemberExtensionRequestRecord {
  return {
    id: overrides.id ?? 'extension-request-1',
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
      overrides.requestedByProfile === undefined
        ? {
            name: 'Jordan Staff',
          }
        : overrides.requestedByProfile,
    reviewedByProfile:
      overrides.reviewedByProfile === undefined ? null : overrides.reviewedByProfile,
  }
}

function createPendingRequestsClient({
  requestRows = [createExtensionRequestRecord()],
}: {
  requestRows?: MemberExtensionRequestRecord[]
} = {}) {
  return {
    client: {
      from(table: string) {
        expect(table).toBe('member_extension_requests')

        return {
          select(columns: string) {
            expect(columns).toBe(MEMBER_EXTENSION_REQUEST_SELECT)

            return {
              eq(column: string, value: 'pending') {
                expect(column).toBe('status')
                expect(value).toBe('pending')

                return {
                  order(orderColumn: string, options: { ascending: boolean }) {
                    expect(orderColumn).toBe('created_at')
                    expect(options).toEqual({ ascending: true })

                    return Promise.resolve({
                      data: requestRows,
                      error: null,
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

function createRequestInsertClient({
  insertedRequestRow = createExtensionRequestRecord(),
}: {
  insertedRequestRow?: MemberExtensionRequestRecord
} = {}) {
  const requestInserts: Array<Record<string, unknown>> = []

  return {
    requestInserts,
    client: {
      from(table: string) {
        expect(table).toBe('member_extension_requests')

        return {
          insert(values: Record<string, unknown>) {
            requestInserts.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe(MEMBER_EXTENSION_REQUEST_SELECT)

                return {
                  single() {
                    return Promise.resolve({
                      data: insertedRequestRow,
                      error: null,
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

function createReviewClient({
  existingRequestRow = createExtensionRequestRecord(),
  rejectUpdateMatches = true,
  approvalRpcResult = 'extension-request-1',
  approvalRpcError = null,
  approvedRequestRow,
}: {
  existingRequestRow?: MemberExtensionRequestRecord | null
  rejectUpdateMatches?: boolean
  approvalRpcResult?: string | null
  approvalRpcError?: { message: string } | null
  approvedRequestRow?: MemberExtensionRequestRecord | null
} = {}) {
  const requestUpdates: Array<Record<string, unknown>> = []
  const rpcCalls: Array<{
    fn: string
    args: Record<string, unknown>
  }> = []
  let readCount = 0

  const nextApprovedRequestRow =
    approvedRequestRow ??
    (existingRequestRow
      ? {
          ...existingRequestRow,
          status: 'approved',
        }
      : null)

  return {
    requestUpdates,
    rpcCalls,
    client: {
      from(table: string) {
        expect(table).toBe('member_extension_requests')

        return {
          select(columns: string) {
            expect(columns).toBe(MEMBER_EXTENSION_REQUEST_SELECT)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')

                return {
                  maybeSingle() {
                    const data =
                      readCount === 0 || value !== approvalRpcResult
                        ? existingRequestRow
                        : nextApprovedRequestRow
                    readCount += 1

                    return Promise.resolve({
                      data,
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
                    expect(nextValue).toBe('extension-request-1')

                    return {
                      select(columns: string) {
                        expect(columns).toBe(MEMBER_EXTENSION_REQUEST_SELECT)

                        return Promise.resolve({
                          data:
                            rejectUpdateMatches && existingRequestRow
                              ? [{ ...existingRequestRow, ...values }]
                              : [],
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

describe('member extension routes', () => {
  afterEach(() => {
    applyPreparedMemberExtensionMock.mockReset()
    archiveResolvedRequestNotificationsMock.mockReset()
    archiveResolvedRequestNotificationsMock.mockResolvedValue(undefined)
    createClientMock.mockReset()
    getSupabaseAdminClientMock.mockReset()
    insertNotificationsMock.mockReset()
    insertNotificationsMock.mockResolvedValue(undefined)
    prepareMemberExtensionMock.mockReset()
    readAdminNotificationRecipientsMock.mockReset()
    readAdminNotificationRecipientsMock.mockResolvedValue([])
    readMemberWithCardCodeMock.mockReset()
    readStaffProfileMock.mockReset()
    sendPushToProfilesMock.mockReset()
    sendPushToProfilesMock.mockResolvedValue(undefined)
    syncPreparedMemberExtensionAccessWindowMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns pending member extension requests for admins ordered oldest first', async () => {
    const { client } = createPendingRequestsClient({
      requestRows: [
        createExtensionRequestRecord({ id: 'extension-request-1' }),
        createExtensionRequestRecord({ id: 'extension-request-2' }),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await getPendingMemberExtensionRequests()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      requests: [
        expect.objectContaining({ id: 'extension-request-1', currentStatus: 'Active' }),
        expect.objectContaining({ id: 'extension-request-2', currentStatus: 'Active' }),
      ],
    })
  })

  it('extends a member directly for admins and returns the sync warning when present', async () => {
    prepareMemberExtensionMock.mockResolvedValue({
      ok: true,
      extension: {
        member: { id: 'member-1' },
        newEndTime: '2026-07-23T23:59:59',
      },
    })
    applyPreparedMemberExtensionMock.mockResolvedValue({
      ok: true,
      newEndTime: '2026-07-23T23:59:59',
      warning: 'Membership extended but device sync failed. Please try again.',
    })
    getSupabaseAdminClientMock.mockReturnValue({})

    const response = await postDirectMemberExtension(
      new Request('http://localhost/api/members/member-1/extend', {
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

    expect(prepareMemberExtensionMock).toHaveBeenCalledWith('member-1', 84, {})
    expect(applyPreparedMemberExtensionMock).toHaveBeenCalledWith(
      {
        member: { id: 'member-1' },
        newEndTime: '2026-07-23T23:59:59',
      },
      {},
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      new_end_time: '2026-07-23T23:59:59',
      warning: 'Membership extended but device sync failed. Please try again.',
    })
  })

  it('returns the inactive-member error for direct admin extensions', async () => {
    prepareMemberExtensionMock.mockResolvedValue({
      ok: false,
      error: MEMBER_EXTENSION_INACTIVE_ERROR,
      status: 400,
    })
    getSupabaseAdminClientMock.mockReturnValue({})

    const response = await postDirectMemberExtension(
      new Request('http://localhost/api/members/member-1/extend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 28,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_EXTENSION_INACTIVE_ERROR,
    })
  })

  it('creates a pending member extension request for authorized staff and notifies admins', async () => {
    const { client, requestInserts } = createRequestInsertClient({
      insertedRequestRow: createExtensionRequestRecord({
        member_id: 'member-canonical',
        member: {
          id: 'member-canonical',
          name: 'Jane Doe',
          status: 'Active',
          end_time: '2026-06-30T23:59:59.000Z',
        },
      }),
    })
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue(client)
    readStaffProfileMock.mockResolvedValue(createProfile())
    readMemberWithCardCodeMock.mockResolvedValue({
      id: 'member-canonical',
      status: 'Active',
      endTime: '2026-06-30T23:59:59.000Z',
    })
    readAdminNotificationRecipientsMock.mockResolvedValue([{ id: 'admin-1' }])
    mockAuthenticatedUser({ id: 'staff-1' })

    const response = await postMemberExtensionRequest(
      new Request('http://localhost/api/members/card-123/extension-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 84,
        }),
      }),
      {
        params: Promise.resolve({ id: 'card-123' }),
      },
    )

    expect(requestInserts).toEqual([
      {
        member_id: 'member-canonical',
        requested_by: 'staff-1',
        duration_days: 84,
        status: 'pending',
      },
    ])
    expect(insertNotificationsMock).toHaveBeenCalledWith(client, [
      {
        recipientId: 'admin-1',
        type: 'member_extension_request',
        title: 'Membership Extension Request',
        body: 'New membership extension request from Jordan Staff for Jane Doe.',
        metadata: {
          requestId: 'extension-request-1',
          memberId: 'member-canonical',
          memberName: 'Jane Doe',
          requestedBy: 'Jordan Staff',
          durationDays: 84,
        },
      },
    ])
    expect(sendPushToProfilesMock).toHaveBeenCalledWith(['admin-1'], {
      title: 'Membership Extension Request',
      body: 'A staff member submitted a membership extension request.',
      url: '/pending-approvals/extension-requests',
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      id: 'extension-request-1',
    })
  })

  it('rejects staff extension requests from profiles without the new permission', async () => {
    createClientMock.mockResolvedValue({})
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        titles: ['Trainer'],
      }),
    )
    mockAuthenticatedUser({ id: 'trainer-1' })

    const response = await postMemberExtensionRequest(
      new Request('http://localhost/api/members/member-1/extension-requests', {
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

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('rejects admin callers from the staff extension-request route', async () => {
    createClientMock.mockResolvedValue({})
    readStaffProfileMock.mockResolvedValue(
      createProfile({
        role: 'admin',
        titles: ['Owner'],
      }),
    )
    mockAuthenticatedUser({ id: 'admin-1' })

    const response = await postMemberExtensionRequest(
      new Request('http://localhost/api/members/member-1/extension-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 28,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Admins should extend memberships directly.',
    })
  })

  it('rejects extension requests for inactive memberships', async () => {
    createClientMock.mockResolvedValue({})
    getSupabaseAdminClientMock.mockReturnValue({})
    readStaffProfileMock.mockResolvedValue(createProfile())
    readMemberWithCardCodeMock.mockResolvedValue({
      id: 'member-1',
      status: 'Active',
      endTime: '2026-01-01T00:00:00.000Z',
    })
    mockAuthenticatedUser({ id: 'staff-1' })

    const response = await postMemberExtensionRequest(
      new Request('http://localhost/api/members/member-1/extension-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duration_days: 28,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_EXTENSION_INACTIVE_ERROR,
    })
  })

  it('rejects approval requests from admins without the extend-membership permission', async () => {
    const { client, rpcCalls, requestUpdates } = createReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Trainer'],
      },
    })

    const response = await patchMemberExtensionRequest(
      new Request('http://localhost/api/members/extension-requests/extension-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'extension-request-1' }),
      },
    )

    expect(requestUpdates).toEqual([])
    expect(rpcCalls).toEqual([])
    expect(syncPreparedMemberExtensionAccessWindowMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
  })

  it('rejects a pending member extension request', async () => {
    const { client, requestUpdates } = createReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await patchMemberExtensionRequest(
      new Request('http://localhost/api/members/extension-requests/extension-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reject',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'extension-request-1' }),
      },
    )

    expect(requestUpdates).toEqual([
      {
        status: 'rejected',
        reviewed_by: 'admin-1',
        review_timestamp: expect.any(String),
      },
    ])
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'extension-request-1',
      type: 'member_extension_request',
      archivedAt: expect.any(String),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      success: true,
    })
  })

  it('approves a pending member extension request and returns sync warnings', async () => {
    const { client, requestUpdates, rpcCalls } = createReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    prepareMemberExtensionMock.mockResolvedValue({
      ok: true,
      extension: {
        member: { id: 'member-1' },
        newEndTime: '2026-09-22T23:59:59',
      },
    })
    syncPreparedMemberExtensionAccessWindowMock.mockResolvedValue({
      ok: true,
      newEndTime: '2026-09-22T23:59:59',
      warning: 'Membership extended but device sync failed. Please try again.',
    })
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await patchMemberExtensionRequest(
      new Request('http://localhost/api/members/extension-requests/extension-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'extension-request-1' }),
      },
    )

    expect(prepareMemberExtensionMock).toHaveBeenCalledWith('member-1', 84, client)
    expect(requestUpdates).toEqual([])
    expect(rpcCalls).toEqual([
      {
        fn: 'approve_member_extension_request',
        args: {
          p_request_id: 'extension-request-1',
          p_reviewer_id: 'admin-1',
          p_review_timestamp: expect.any(String),
          p_new_end_time: '2026-09-22T23:59:59',
        },
      },
    ])
    expect(syncPreparedMemberExtensionAccessWindowMock).toHaveBeenCalledWith(
      {
        member: { id: 'member-1' },
        newEndTime: '2026-09-22T23:59:59',
      },
      client,
    )
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'extension-request-1',
      type: 'member_extension_request',
      archivedAt: expect.any(String),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      success: true,
      warning: 'Membership extended but device sync failed. Please try again.',
    })
  })

  it('returns the inactive-member error while approving a request before any update occurs', async () => {
    const { client, requestUpdates, rpcCalls } = createReviewClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    prepareMemberExtensionMock.mockResolvedValue({
      ok: false,
      error: MEMBER_EXTENSION_INACTIVE_ERROR,
      status: 400,
    })
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await patchMemberExtensionRequest(
      new Request('http://localhost/api/members/extension-requests/extension-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'extension-request-1' }),
      },
    )

    expect(requestUpdates).toEqual([])
    expect(rpcCalls).toEqual([])
    expect(syncPreparedMemberExtensionAccessWindowMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: MEMBER_EXTENSION_INACTIVE_ERROR,
    })
  })

  it('returns 400 when an approval race finds the request already reviewed', async () => {
    const { client, rpcCalls } = createReviewClient({
      approvalRpcError: {
        message: 'This request has already been reviewed.',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    prepareMemberExtensionMock.mockResolvedValue({
      ok: true,
      extension: {
        member: { id: 'member-1' },
        newEndTime: '2026-09-22T23:59:59',
      },
    })
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await patchMemberExtensionRequest(
      new Request('http://localhost/api/members/extension-requests/extension-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ requestId: 'extension-request-1' }),
      },
    )

    expect(rpcCalls).toEqual([
      {
        fn: 'approve_member_extension_request',
        args: {
          p_request_id: 'extension-request-1',
          p_reviewer_id: 'admin-1',
          p_review_timestamp: expect.any(String),
          p_new_end_time: '2026-09-22T23:59:59',
        },
      },
    ])
    expect(syncPreparedMemberExtensionAccessWindowMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This request has already been reviewed.',
    })
  })
})
