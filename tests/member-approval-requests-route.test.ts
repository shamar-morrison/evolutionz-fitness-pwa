import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockAuthenticatedProfile,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  archiveResolvedRequestNotificationsMock,
  getSupabaseAdminClientMock,
  insertNotificationsMock,
  moveMemberPhotoObjectMock,
  provisionMemberAccessMock,
  readAdminNotificationRecipientsMock,
} = vi.hoisted(() => ({
  archiveResolvedRequestNotificationsMock: vi.fn().mockResolvedValue(undefined),
  getSupabaseAdminClientMock: vi.fn(),
  insertNotificationsMock: vi.fn().mockResolvedValue(undefined),
  moveMemberPhotoObjectMock: vi.fn(),
  provisionMemberAccessMock: vi.fn(),
  readAdminNotificationRecipientsMock: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/pt-notifications-server', () => ({
  archiveResolvedRequestNotifications: archiveResolvedRequestNotificationsMock,
  insertNotifications: insertNotificationsMock,
  readAdminNotificationRecipients: readAdminNotificationRecipientsMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedProfile: mod.requireAuthenticatedProfileMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

vi.mock('@/lib/member-provisioning-server', () => ({
  provisionMemberAccess: provisionMemberAccessMock,
}))

vi.mock('@/lib/member-photo-storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/member-photo-storage')>(
    '@/lib/member-photo-storage',
  )

  return {
    ...actual,
    moveMemberPhotoObject: moveMemberPhotoObjectMock,
  }
})

import { GET, POST } from '@/app/api/member-approval-requests/route'
import { PATCH } from '@/app/api/member-approval-requests/[id]/route'
import {
  MEMBER_APPROVAL_REQUEST_SELECT,
  type MemberApprovalRequestRecord,
} from '@/lib/member-approval-request-records'
import type { Member, MemberTypeRecord } from '@/types'

const MEMBER_TYPE_ID_GENERAL = '11111111-1111-4111-8111-111111111111'
const MEMBER_TYPE_ID_CIVIL_SERVANT = '22222222-2222-4222-8222-222222222222'

function createMemberTypeRecord(
  overrides: Partial<MemberTypeRecord> = {},
): MemberTypeRecord {
  return {
    id: overrides.id ?? MEMBER_TYPE_ID_GENERAL,
    name: overrides.name ?? 'General',
    monthly_rate: overrides.monthly_rate ?? 12000,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? '2026-04-01T00:00:00.000Z',
  }
}

function createRequestRecord(
  overrides: Partial<MemberApprovalRequestRecord> = {},
): MemberApprovalRequestRecord {
  return {
    id: overrides.id ?? 'request-1',
    name: overrides.name ?? 'Jane Doe',
    gender: overrides.gender ?? 'Female',
    email: overrides.email ?? 'jane@example.com',
    phone: overrides.phone ?? '876-555-1111',
    remark: overrides.remark ?? 'Wants mornings only',
    begin_time: overrides.begin_time ?? '2026-04-09T14:00:00.000Z',
    end_time: overrides.end_time ?? '2026-05-09T04:59:59.000Z',
    card_no: overrides.card_no ?? '0102857149',
    card_code: overrides.card_code ?? 'A18',
    member_type_id: overrides.member_type_id ?? MEMBER_TYPE_ID_GENERAL,
    photo_url: overrides.photo_url ?? null,
    submitted_by: overrides.submitted_by ?? 'staff-1',
    status: overrides.status ?? 'pending',
    reviewed_by: overrides.reviewed_by ?? null,
    reviewed_at: overrides.reviewed_at ?? null,
    review_note: overrides.review_note ?? null,
    member_id: overrides.member_id ?? null,
    created_at: overrides.created_at ?? '2026-04-09T10:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-04-09T10:00:00.000Z',
    memberType: overrides.memberType ?? { name: 'General' },
    submittedByProfile: overrides.submittedByProfile ?? { name: 'Jordan Staff' },
    reviewedByProfile: overrides.reviewedByProfile ?? null,
  }
}

function createApprovedMember(overrides: Partial<Member> = {}): Member {
  return {
    id: overrides.id ?? 'member-77',
    employeeNo: overrides.employeeNo ?? '000777',
    name: overrides.name ?? 'Jane Doe',
    cardNo: overrides.cardNo ?? '0102857149',
    cardCode: overrides.cardCode ?? 'A18',
    cardStatus: overrides.cardStatus ?? 'assigned',
    cardLostAt: overrides.cardLostAt ?? null,
    type: overrides.type ?? 'Civil Servant',
    memberTypeId: overrides.memberTypeId ?? MEMBER_TYPE_ID_CIVIL_SERVANT,
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender ?? 'Female',
    email: overrides.email ?? 'jane@example.com',
    phone: overrides.phone ?? '876-555-1111',
    remark: overrides.remark ?? 'Wants mornings only',
    photoUrl: overrides.photoUrl ?? null,
    beginTime: overrides.beginTime ?? '2026-04-09T09:00:00.000Z',
    endTime: overrides.endTime ?? '2026-05-08T23:59:59.000Z',
  }
}

function createMemberApprovalRequestsClient({
  requestRows = [createRequestRecord()],
  existingRequestRow = createRequestRecord(),
  insertedRequestRow = createRequestRecord(),
  deniedRequestRow = createRequestRecord({ status: 'denied' }),
  claimedApprovedRequestRow = createRequestRecord({ status: 'approved' }),
  finalizedApprovedRequestRow = createRequestRecord({ status: 'approved' }),
  memberTypeRow = createMemberTypeRecord(),
  selectedCardRow = { card_no: '0102857149', card_code: 'A18' },
  approveClaimMatches = true,
  denyUpdateMatches = true,
  requestUpdateError = null,
  finalizeUpdateMatches = true,
  finalizeUpdateError = null,
}: {
  requestRows?: MemberApprovalRequestRecord[]
  existingRequestRow?: MemberApprovalRequestRecord | null
  insertedRequestRow?: MemberApprovalRequestRecord
  deniedRequestRow?: MemberApprovalRequestRecord
  claimedApprovedRequestRow?: MemberApprovalRequestRecord
  finalizedApprovedRequestRow?: MemberApprovalRequestRecord
  memberTypeRow?: MemberTypeRecord | null
  selectedCardRow?: { card_no: string; card_code: string | null } | null
  approveClaimMatches?: boolean
  denyUpdateMatches?: boolean
  requestUpdateError?: { message: string } | null
  finalizeUpdateMatches?: boolean
  finalizeUpdateError?: { message: string } | null
} = {}) {
  const requestInserts: Array<Record<string, unknown>> = []
  const denyUpdates: Array<Record<string, unknown>> = []
  const approvalClaimUpdates: Array<Record<string, unknown>> = []
  const approvalFinalizeUpdates: Array<Record<string, unknown>> = []
  const memberPhotoUpdates: Array<Record<string, unknown>> = []
  const operations: string[] = []

  return {
    requestInserts,
    denyUpdates,
    approvalClaimUpdates,
    approvalFinalizeUpdates,
    memberPhotoUpdates,
    operations,
    client: {
      from(table: string) {
        if (table === 'member_types') {
          return {
            select(columns: string) {
              expect(columns).toBe('*')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: memberTypeRow && memberTypeRow.id === value ? memberTypeRow : null,
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'cards') {
          return {
            select(columns: string) {
              expect(columns).toBe('card_no, card_code')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('card_no')

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('status')
                      expect(nextValue).toBe('available')

                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: selectedCardRow && selectedCardRow.card_no === value ? selectedCardRow : null,
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
        }

        if (table === 'member_approval_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe(MEMBER_APPROVAL_REQUEST_SELECT)

              return {
                eq(column: string, value: string) {
                  if (column === 'status') {
                    expect(value).toBe('pending')

                    return {
                      order(orderColumn: string, options: { ascending: boolean }) {
                        expect(orderColumn).toBe('created_at')
                        expect(options).toEqual({ ascending: false })

                        return Promise.resolve({
                          data: requestRows,
                          error: null,
                        })
                      },
                    }
                  }

                  expect(column).toBe('id')
                  expect(value).toBe('request-1')

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
            insert(values: Record<string, unknown>) {
              requestInserts.push(values)

              return {
                select(columns: string) {
                  expect(columns).toBe(MEMBER_APPROVAL_REQUEST_SELECT)

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
            update(values: Record<string, unknown>) {
              const isStatusUpdate = typeof values.status === 'string'

              if (isStatusUpdate) {
                if (values.status === 'approved') {
                  approvalClaimUpdates.push(values)
                  operations.push('approval-claim')
                } else {
                  denyUpdates.push(values)
                  operations.push('deny-update')
                }

                return {
                  eq(column: string, value: string) {
                    expect(column).toBe('id')
                    expect(value).toBe('request-1')

                    return {
                      eq(nextColumn: string, nextValue: string) {
                        expect(nextColumn).toBe('status')
                        expect(nextValue).toBe('pending')

                        return {
                          select(columns: string) {
                            expect(columns).toBe(MEMBER_APPROVAL_REQUEST_SELECT)

                            const updateMatches =
                              values.status === 'approved'
                                ? approveClaimMatches
                                : denyUpdateMatches
                            const updatedRow =
                              values.status === 'approved'
                                ? claimedApprovedRequestRow
                                : deniedRequestRow

                            return Promise.resolve({
                              data:
                                updateMatches && updatedRow
                                  ? [
                                      {
                                        ...updatedRow,
                                        ...values,
                                      } as MemberApprovalRequestRecord,
                                    ]
                                  : [],
                              error: requestUpdateError,
                            })
                          },
                        }
                      },
                    }
                  },
                }
              }

              approvalFinalizeUpdates.push(values)
              operations.push('approval-finalize')
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('request-1')

                  return {
                    select(columns: string) {
                      expect(columns).toBe(MEMBER_APPROVAL_REQUEST_SELECT)

                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data:
                              finalizeUpdateMatches && finalizedApprovedRequestRow
                                ? ({
                                    ...finalizedApprovedRequestRow,
                                    ...values,
                                  } as MemberApprovalRequestRecord)
                                : null,
                            error: finalizeUpdateError,
                          })
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'members') {
          return {
            update(values: Record<string, unknown>) {
              memberPhotoUpdates.push(values)
              operations.push('member-photo-update')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('member-77')

                  return {
                    select(columns: string) {
                      expect(columns).toBe('id')

                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: { id: value },
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
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('member approval request routes', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    archiveResolvedRequestNotificationsMock.mockReset()
    archiveResolvedRequestNotificationsMock.mockResolvedValue(undefined)
    getSupabaseAdminClientMock.mockReset()
    insertNotificationsMock.mockReset()
    insertNotificationsMock.mockResolvedValue(undefined)
    moveMemberPhotoObjectMock.mockReset()
    provisionMemberAccessMock.mockReset()
    readAdminNotificationRecipientsMock.mockReset()
    readAdminNotificationRecipientsMock.mockResolvedValue([])
    resetServerAuthMocks()
  })

  it('returns pending member approval requests for admins', async () => {
    const { client } = createMemberApprovalRequestsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/member-approval-requests?status=pending'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      requests: [
        {
          id: 'request-1',
          name: 'Jane Doe',
          gender: 'Female',
          email: 'jane@example.com',
          phone: '876-555-1111',
          remark: 'Wants mornings only',
          beginTime: '2026-04-09T14:00:00.000Z',
          endTime: '2026-05-09T04:59:59.000Z',
          cardNo: '0102857149',
          cardCode: 'A18',
          memberTypeId: MEMBER_TYPE_ID_GENERAL,
          memberTypeName: 'General',
          photoUrl: null,
          status: 'pending',
          submittedBy: 'staff-1',
          submittedByName: 'Jordan Staff',
          reviewedBy: null,
          reviewedAt: null,
          reviewNote: null,
          memberId: null,
          createdAt: '2026-04-09T10:00:00.000Z',
          updatedAt: '2026-04-09T10:00:00.000Z',
        },
      ],
    })
  })

  it('creates a pending request for the authenticated profile and uses the synced card code', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 9, 12, 0, 0))

    const { client, requestInserts } = createMemberApprovalRequestsClient({
      insertedRequestRow: createRequestRecord({
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        memberType: { name: 'General' },
        card_code: 'A18',
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readAdminNotificationRecipientsMock.mockResolvedValue([
      { id: 'admin-1' },
      { id: 'admin-2' },
    ])
    mockAuthenticatedProfile({
      user: { id: 'staff-auth-1' },
      profile: { id: 'staff-1', role: 'staff', name: 'Jordan Staff' },
    })

    const response = await POST(
      new Request('http://localhost/api/member-approval-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          member_type_id: MEMBER_TYPE_ID_GENERAL,
          gender: 'Female',
          email: 'jane@example.com',
          phone: '876-555-1111',
          remark: 'Wants mornings only',
          beginTime: '2026-04-10T09:00:00',
          endTime: '2026-05-09T23:59:59',
          cardNo: '0102857149',
          cardCode: 'LOCAL-CODE',
        }),
      }),
    )

    expect(requestInserts).toEqual([
      {
        name: 'Jane Doe',
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1111',
        remark: 'Wants mornings only',
        begin_time: '2026-04-10T09:00:00',
        end_time: '2026-05-09T23:59:59',
        card_no: '0102857149',
        card_code: 'A18',
        submitted_by: 'staff-1',
      },
    ])
    expect(insertNotificationsMock).toHaveBeenCalledWith(client, [
      {
        recipientId: 'admin-1',
        type: 'member_create_request',
        title: 'New Member Request',
        body: 'New member request submitted by Jordan Staff for Jane Doe.',
        metadata: {
          requestId: 'request-1',
          memberName: 'Jane Doe',
          requestedBy: 'Jordan Staff',
        },
      },
      {
        recipientId: 'admin-2',
        type: 'member_create_request',
        title: 'New Member Request',
        body: 'New member request submitted by Jordan Staff for Jane Doe.',
        metadata: {
          requestId: 'request-1',
          memberName: 'Jane Doe',
          requestedBy: 'Jordan Staff',
        },
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: expect.objectContaining({
        id: 'request-1',
        memberTypeId: MEMBER_TYPE_ID_GENERAL,
        memberTypeName: 'General',
        cardCode: 'A18',
        submittedBy: 'staff-1',
      }),
    })
  })

  it('logs and ignores member create notification delivery failures after create', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 9, 12, 0, 0))

    const { client } = createMemberApprovalRequestsClient({
      insertedRequestRow: createRequestRecord({
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        memberType: { name: 'General' },
        card_code: 'A18',
      }),
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    insertNotificationsMock.mockRejectedValueOnce(new Error('Notification insert failed.'))
    getSupabaseAdminClientMock.mockReturnValue(client)
    readAdminNotificationRecipientsMock.mockResolvedValue([{ id: 'admin-1' }])
    mockAuthenticatedProfile({
      user: { id: 'staff-auth-1' },
      profile: { id: 'staff-1', role: 'staff', name: 'Jordan Staff' },
    })

    const response = await POST(
      new Request('http://localhost/api/member-approval-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          member_type_id: MEMBER_TYPE_ID_GENERAL,
          gender: 'Female',
          email: 'jane@example.com',
          phone: '876-555-1111',
          remark: 'Wants mornings only',
          beginTime: '2026-04-10T09:00:00',
          endTime: '2026-05-09T23:59:59',
          cardNo: '0102857149',
          cardCode: 'LOCAL-CODE',
        }),
      }),
    )

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to send member create request notifications:',
      expect.any(Error),
    )
    expect(response.status).toBe(200)
  })

  it('returns 400 when required profile fields are missing on a new request', async () => {
    const { client } = createMemberApprovalRequestsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAuthenticatedProfile({
      user: { id: 'staff-auth-1' },
      profile: { id: 'staff-1', role: 'staff', name: 'Jordan Staff' },
    })

    const response = await POST(
      new Request('http://localhost/api/member-approval-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          member_type_id: MEMBER_TYPE_ID_GENERAL,
          gender: 'Female',
          email: 'jane@example.com',
          phone: '',
          beginTime: '2026-04-10T09:00:00',
          endTime: '2026-05-09T23:59:59',
          cardNo: '0102857149',
          cardCode: 'LOCAL-CODE',
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('Phone is required.'),
    })
  })

  it('denies a pending member approval request and archives matching notifications', async () => {
    const deniedRequest = createRequestRecord({
      status: 'denied',
      reviewed_by: 'admin-1',
      reviewed_at: '2026-04-09T15:00:00.000Z',
      review_note: 'Missing ID verification.',
      reviewedByProfile: { name: 'Admin User' },
    })
    const { client, denyUpdates } = createMemberApprovalRequestsClient({
      deniedRequestRow: deniedRequest,
    })

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: { id: 'admin-1', role: 'admin', name: 'Admin User' },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-approval-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'denied',
          review_note: 'Missing ID verification.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(denyUpdates).toEqual([
      expect.objectContaining({
        status: 'denied',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
        review_note: 'Missing ID verification.',
        updated_at: expect.any(String),
      }),
    ])
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'request-1',
      type: 'member_create_request',
      archivedAt: expect.any(String),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: expect.objectContaining({
        id: 'request-1',
        status: 'denied',
        reviewNote: 'Missing ID verification.',
      }),
    })
  })

  it('returns 400 when a deny race finds the request already reviewed', async () => {
    const { client } = createMemberApprovalRequestsClient({
      denyUpdateMatches: false,
    })

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: { id: 'admin-1', role: 'admin', name: 'Admin User' },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-approval-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'denied',
          review_note: 'Missing ID verification.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(archiveResolvedRequestNotificationsMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This request has already been reviewed.',
    })
  })

  it('approves a pending member approval request and archives matching notifications', async () => {
    const existingRequest = createRequestRecord({
      member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      memberType: { name: 'Civil Servant' },
    })
    const finalizedApprovedRequest = createRequestRecord({
      status: 'approved',
      member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      member_id: 'member-77',
      reviewed_by: 'admin-1',
      reviewed_at: '2026-04-09T15:00:00.000Z',
      review_note: 'Approved after verification.',
      memberType: { name: 'Civil Servant' },
      reviewedByProfile: { name: 'Admin User' },
    })
    const {
      client,
      approvalClaimUpdates,
      approvalFinalizeUpdates,
      operations,
    } = createMemberApprovalRequestsClient({
      existingRequestRow: existingRequest,
      finalizedApprovedRequestRow: finalizedApprovedRequest,
      memberTypeRow: createMemberTypeRecord({
        id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        name: 'Civil Servant',
        monthly_rate: 7500,
      }),
    })

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: { id: 'admin-1', role: 'admin', name: 'Admin User' },
    })
    provisionMemberAccessMock.mockImplementation(async () => {
      operations.push('provision')

      return {
        ok: true,
        member: createApprovedMember(),
      }
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-approval-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'approved',
          selected_card_no: '0102857149',
          review_note: 'Approved after verification.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(provisionMemberAccessMock).toHaveBeenCalledWith({
      name: 'Jane Doe',
      type: 'Civil Servant',
      memberTypeId: MEMBER_TYPE_ID_CIVIL_SERVANT,
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1111',
      remark: 'Wants mornings only',
      beginTime: '2026-04-09T14:00:00',
      endTime: '2026-05-09T04:59:59',
      cardNo: '0102857149',
      cardCode: 'A18',
    })
    expect(approvalClaimUpdates).toEqual([
      expect.objectContaining({
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
        review_note: 'Approved after verification.',
        updated_at: expect.any(String),
      }),
    ])
    expect(approvalFinalizeUpdates).toEqual([
      expect.objectContaining({
        card_no: '0102857149',
        card_code: 'A18',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        member_id: 'member-77',
        photo_url: null,
        updated_at: expect.any(String),
      }),
    ])
    expect(operations).toEqual([
      'approval-claim',
      'provision',
      'approval-finalize',
    ])
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'request-1',
      type: 'member_create_request',
      archivedAt: expect.any(String),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: expect.objectContaining({
        id: 'request-1',
        status: 'approved',
        memberId: 'member-77',
        memberTypeId: MEMBER_TYPE_ID_CIVIL_SERVANT,
      }),
    })
  })

  it('returns 400 when an approve race finds the request already reviewed', async () => {
    const existingRequest = createRequestRecord({
      member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      memberType: { name: 'Civil Servant' },
    })
    const { client, approvalClaimUpdates, approvalFinalizeUpdates } =
      createMemberApprovalRequestsClient({
        existingRequestRow: existingRequest,
        approveClaimMatches: false,
        memberTypeRow: createMemberTypeRecord({
          id: MEMBER_TYPE_ID_CIVIL_SERVANT,
          name: 'Civil Servant',
          monthly_rate: 7500,
        }),
      })

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: { id: 'admin-1', role: 'admin', name: 'Admin User' },
    })
    provisionMemberAccessMock.mockResolvedValue({
      ok: true,
      member: createApprovedMember(),
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-approval-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'approved',
          selected_card_no: '0102857149',
          review_note: 'Approved after verification.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(approvalClaimUpdates).toEqual([
      expect.objectContaining({
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
        review_note: 'Approved after verification.',
        updated_at: expect.any(String),
      }),
    ])
    expect(provisionMemberAccessMock).not.toHaveBeenCalled()
    expect(approvalFinalizeUpdates).toEqual([])
    expect(archiveResolvedRequestNotificationsMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This request has already been reviewed.',
    })
  })

  it('returns 400 when the requested member type is not supported for provisioning', async () => {
    const existingRequest = createRequestRecord({
      member_type_id: MEMBER_TYPE_ID_GENERAL,
      memberType: { name: 'Corporate' },
    })
    const { client, approvalClaimUpdates, approvalFinalizeUpdates } =
      createMemberApprovalRequestsClient({
        existingRequestRow: existingRequest,
        memberTypeRow: createMemberTypeRecord({
          id: MEMBER_TYPE_ID_GENERAL,
          name: 'Corporate',
        }),
      })

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: { id: 'admin-1', role: 'admin', name: 'Admin User' },
    })
    provisionMemberAccessMock.mockResolvedValue({
      ok: true,
      member: createApprovedMember(),
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-approval-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'approved',
          selected_card_no: '0102857149',
          review_note: 'Approved after verification.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(provisionMemberAccessMock).not.toHaveBeenCalled()
    expect(approvalClaimUpdates).toEqual([])
    expect(approvalFinalizeUpdates).toEqual([])
    expect(archiveResolvedRequestNotificationsMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Membership type is not supported for provisioning.',
    })
  })

  it('logs and ignores member create notification archive failures after denial', async () => {
    const deniedRequest = createRequestRecord({
      status: 'denied',
      reviewed_by: 'admin-1',
      reviewed_at: '2026-04-09T15:00:00.000Z',
      review_note: 'Missing ID verification.',
      reviewedByProfile: { name: 'Admin User' },
    })
    const { client } = createMemberApprovalRequestsClient({
      deniedRequestRow: deniedRequest,
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    archiveResolvedRequestNotificationsMock.mockRejectedValueOnce(new Error('Archive failed.'))
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: { id: 'admin-1', role: 'admin', name: 'Admin User' },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-approval-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'denied',
          review_note: 'Missing ID verification.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to archive resolved member create request notifications:',
      expect.any(Error),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: expect.objectContaining({
        id: 'request-1',
        status: 'denied',
      }),
    })
  })

  it('returns a warning when approval finalization fails after provisioning succeeds', async () => {
    const existingRequest = createRequestRecord({
      member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      memberType: { name: 'Civil Servant' },
    })
    const {
      client,
      approvalClaimUpdates,
      approvalFinalizeUpdates,
      operations,
    } = createMemberApprovalRequestsClient({
      existingRequestRow: existingRequest,
      memberTypeRow: createMemberTypeRecord({
        id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        name: 'Civil Servant',
        monthly_rate: 7500,
      }),
      finalizeUpdateError: { message: 'update failed' },
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: { id: 'admin-1', role: 'admin', name: 'Admin User' },
    })
    provisionMemberAccessMock.mockImplementation(async () => {
      operations.push('provision')

      return {
        ok: true,
        member: createApprovedMember(),
      }
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-approval-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'approved',
          selected_card_no: '0102857149',
          review_note: 'Approved after verification.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(approvalClaimUpdates).toEqual([
      expect.objectContaining({
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
        review_note: 'Approved after verification.',
        updated_at: expect.any(String),
      }),
    ])
    expect(approvalFinalizeUpdates).toEqual([
      expect.objectContaining({
        card_no: '0102857149',
        card_code: 'A18',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        member_id: 'member-77',
        photo_url: null,
        updated_at: expect.any(String),
      }),
    ])
    expect(operations).toEqual([
      'approval-claim',
      'provision',
      'approval-finalize',
    ])
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to finalize approved member request request-1: update failed',
    )
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'request-1',
      type: 'member_create_request',
      archivedAt: expect.any(String),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      warning:
        'Member was approved and provisioned successfully, but the request record could not be fully updated. Please verify the member details manually.',
    })
  })

  it('returns a warning when approval finalization does not return the updated row', async () => {
    const existingRequest = createRequestRecord({
      member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      memberType: { name: 'Civil Servant' },
    })
    const {
      client,
      approvalClaimUpdates,
      approvalFinalizeUpdates,
      operations,
    } = createMemberApprovalRequestsClient({
      existingRequestRow: existingRequest,
      memberTypeRow: createMemberTypeRecord({
        id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        name: 'Civil Servant',
        monthly_rate: 7500,
      }),
      finalizeUpdateMatches: false,
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: { id: 'admin-1', role: 'admin', name: 'Admin User' },
    })
    provisionMemberAccessMock.mockImplementation(async () => {
      operations.push('provision')

      return {
        ok: true,
        member: createApprovedMember(),
      }
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-approval-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'approved',
          selected_card_no: '0102857149',
          review_note: 'Approved after verification.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(approvalClaimUpdates).toEqual([
      expect.objectContaining({
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
        review_note: 'Approved after verification.',
        updated_at: expect.any(String),
      }),
    ])
    expect(approvalFinalizeUpdates).toEqual([
      expect.objectContaining({
        card_no: '0102857149',
        card_code: 'A18',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        member_id: 'member-77',
        photo_url: null,
        updated_at: expect.any(String),
      }),
    ])
    expect(operations).toEqual([
      'approval-claim',
      'provision',
      'approval-finalize',
    ])
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to finalize approved member request request-1: missing updated row',
    )
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'request-1',
      type: 'member_create_request',
      archivedAt: expect.any(String),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      warning:
        'Member was approved and provisioned successfully, but the request record could not be fully updated. Please verify the member details manually.',
    })
  })

  it('moves the staged request photo and uses the stored membership type when approving', async () => {
    const existingRequest = createRequestRecord({
      photo_url: 'pending-member-requests/request-1.jpg',
      member_type_id: MEMBER_TYPE_ID_GENERAL,
      memberType: { name: 'General' },
    })
    const finalizedApprovedRequest = createRequestRecord({
      status: 'approved',
      member_type_id: MEMBER_TYPE_ID_GENERAL,
      member_id: 'member-77',
      photo_url: null,
      reviewed_by: 'admin-1',
      reviewed_at: '2026-04-09T15:00:00.000Z',
      review_note: 'Approved after verification.',
      memberType: { name: 'General' },
      reviewedByProfile: { name: 'Admin User' },
    })
    const {
      client,
      memberPhotoUpdates,
      approvalClaimUpdates,
      approvalFinalizeUpdates,
    } = createMemberApprovalRequestsClient({
      existingRequestRow: existingRequest,
      finalizedApprovedRequestRow: finalizedApprovedRequest,
      memberTypeRow: createMemberTypeRecord({
        id: MEMBER_TYPE_ID_GENERAL,
        name: 'General',
        monthly_rate: 12000,
      }),
    })

    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: { id: 'admin-1', role: 'admin', name: 'Admin User' },
    })
    moveMemberPhotoObjectMock.mockResolvedValue('members/member-77.jpg')
    provisionMemberAccessMock.mockResolvedValue({
      ok: true,
      member: createApprovedMember(),
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-approval-requests/request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'approved',
          selected_card_no: '0102857149',
          review_note: 'Approved after verification.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'request-1' }),
      },
    )

    expect(provisionMemberAccessMock).toHaveBeenCalledWith({
      name: 'Jane Doe',
      type: 'General',
      memberTypeId: MEMBER_TYPE_ID_GENERAL,
      gender: 'Female',
      email: 'jane@example.com',
      phone: '876-555-1111',
      remark: 'Wants mornings only',
      beginTime: '2026-04-09T14:00:00',
      endTime: '2026-05-09T04:59:59',
      cardNo: '0102857149',
      cardCode: 'A18',
    })
    expect(moveMemberPhotoObjectMock).toHaveBeenCalledWith(
      client,
      'pending-member-requests/request-1.jpg',
      'member-77.jpg',
    )
    expect(memberPhotoUpdates).toEqual([
      {
        photo_url: 'members/member-77.jpg',
      },
    ])
    expect(approvalClaimUpdates).toEqual([
      expect.objectContaining({
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
        review_note: 'Approved after verification.',
        updated_at: expect.any(String),
      }),
    ])
    expect(approvalFinalizeUpdates).toEqual([
      expect.objectContaining({
        card_no: '0102857149',
        card_code: 'A18',
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        member_id: 'member-77',
        photo_url: null,
        updated_at: expect.any(String),
      }),
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: expect.objectContaining({
        id: 'request-1',
        status: 'approved',
        memberId: 'member-77',
        memberTypeId: MEMBER_TYPE_ID_GENERAL,
      }),
    })
  })
})
