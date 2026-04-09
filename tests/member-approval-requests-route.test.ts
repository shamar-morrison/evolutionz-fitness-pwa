import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockAuthenticatedProfile,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  getSupabaseAdminClientMock,
  moveMemberPhotoObjectMock,
  provisionMemberAccessMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  moveMemberPhotoObjectMock: vi.fn(),
  provisionMemberAccessMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
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
    begin_time: overrides.begin_time ?? '2026-04-09T09:00:00',
    end_time: overrides.end_time ?? '2026-05-08T23:59:59',
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
  updatedRequestRow = createRequestRecord(),
  memberTypeRow = createMemberTypeRecord(),
  selectedCardRow = { card_no: '0102857149', card_code: 'A18' },
  paymentInsertError = null,
}: {
  requestRows?: MemberApprovalRequestRecord[]
  existingRequestRow?: MemberApprovalRequestRecord | null
  insertedRequestRow?: MemberApprovalRequestRecord
  updatedRequestRow?: MemberApprovalRequestRecord
  memberTypeRow?: MemberTypeRecord | null
  selectedCardRow?: { card_no: string; card_code: string | null } | null
  paymentInsertError?: { message: string } | null
} = {}) {
  const requestInserts: Array<Record<string, unknown>> = []
  const requestUpdates: Array<Record<string, unknown>> = []
  const paymentInserts: Array<Record<string, unknown>> = []
  const memberPhotoUpdates: Array<Record<string, unknown>> = []

  return {
    requestInserts,
    requestUpdates,
    paymentInserts,
    memberPhotoUpdates,
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
              requestUpdates.push(values)

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
                            data: updatedRequestRow,
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

        if (table === 'member_payments') {
          return {
            insert(values: Record<string, unknown>) {
              paymentInserts.push(values)

              return {
                select(columns: string) {
                  expect(columns).toBe('*')

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: paymentInsertError ? null : { id: 'payment-1' },
                        error: paymentInsertError,
                      })
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
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    moveMemberPhotoObjectMock.mockReset()
    provisionMemberAccessMock.mockReset()
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
    const { client, requestInserts } = createMemberApprovalRequestsClient({
      insertedRequestRow: createRequestRecord({
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        memberType: { name: 'General' },
        card_code: 'A18',
      }),
    })
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
          phone: '876-555-1111',
          remark: 'Wants mornings only',
          beginTime: '2026-04-09T09:00:00',
          endTime: '2026-05-08T23:59:59',
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
        begin_time: '2026-04-09T09:00:00',
        end_time: '2026-05-08T23:59:59',
        card_no: '0102857149',
        card_code: 'A18',
        submitted_by: 'staff-1',
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

  it('approves the request, updates the photo, and logs payment failures without failing approval', async () => {
    const existingRequest = createRequestRecord({
      photo_url: 'pending-member-requests/request-1.jpg',
      member_type_id: MEMBER_TYPE_ID_GENERAL,
      memberType: { name: 'General' },
    })
    const updatedRequest = createRequestRecord({
      status: 'approved',
      member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      member_id: 'member-77',
      photo_url: null,
      reviewed_by: 'admin-1',
      reviewed_at: '2026-04-09T15:00:00.000Z',
      review_note: 'Approved after payment.',
      memberType: { name: 'Civil Servant' },
      reviewedByProfile: { name: 'Admin User' },
    })
    const { client, memberPhotoUpdates, paymentInserts, requestUpdates } =
      createMemberApprovalRequestsClient({
        existingRequestRow: existingRequest,
        updatedRequestRow: updatedRequest,
        memberTypeRow: createMemberTypeRecord({
          id: MEMBER_TYPE_ID_CIVIL_SERVANT,
          name: 'Civil Servant',
          monthly_rate: 7500,
        }),
        paymentInsertError: { message: 'Insert failed.' },
      })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

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
          member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
          payment_method: 'cash',
          amount_paid: 7500,
          promotion: 'Promo',
          payment_date: '2026-04-09',
          notes: 'Collected at front desk',
          review_note: 'Approved after payment.',
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
      beginTime: '2026-04-09T09:00:00',
      endTime: '2026-05-08T23:59:59',
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
    expect(paymentInserts).toEqual([
      {
        member_id: 'member-77',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        payment_method: 'cash',
        amount_paid: 7500,
        promotion: 'Promo',
        recorded_by: 'admin-1',
        payment_date: '2026-04-09',
        notes: 'Collected at front desk',
      },
    ])
    expect(requestUpdates[0]).toEqual(
      expect.objectContaining({
        status: 'approved',
        card_no: '0102857149',
        card_code: 'A18',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        member_id: 'member-77',
        photo_url: null,
        reviewed_by: 'admin-1',
        review_note: 'Approved after payment.',
      }),
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to record member approval payment:',
      expect.any(Error),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: expect.objectContaining({
        id: 'request-1',
        status: 'approved',
        memberTypeId: MEMBER_TYPE_ID_CIVIL_SERVANT,
        memberId: 'member-77',
      }),
    })
  })
})
