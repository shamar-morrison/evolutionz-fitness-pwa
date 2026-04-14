import { afterEach, describe, expect, it, vi } from 'vitest'
import { CARD_FEE_AMOUNT_JMD } from '@/lib/business-constants'
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockForbidden,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  archiveResolvedRequestNotificationsMock,
  getSupabaseAdminClientMock,
  insertNotificationsMock,
  readAdminNotificationRecipientsMock,
} = vi.hoisted(() => ({
  archiveResolvedRequestNotificationsMock: vi.fn().mockResolvedValue(undefined),
  getSupabaseAdminClientMock: vi.fn(),
  insertNotificationsMock: vi.fn().mockResolvedValue(undefined),
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
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET, POST } from '@/app/api/member-payment-requests/route'
import { PATCH } from '@/app/api/member-payment-requests/[id]/route'
import {
  MEMBER_PAYMENT_REQUEST_SELECT,
  type MemberPaymentRequestRecord,
} from '@/lib/member-payment-request-records'
import type { MemberType, MemberTypeRecord } from '@/types'

const MEMBER_TYPE_ID_GENERAL = '11111111-1111-4111-8111-111111111111'
const MEMBER_TYPE_ID_CIVIL_SERVANT = '22222222-2222-4222-8222-222222222222'
const MEMBER_ID = '33333333-3333-4333-8333-333333333333'

function createMemberTypeRecord(overrides: Partial<MemberTypeRecord> = {}): MemberTypeRecord {
  return {
    id: overrides.id ?? MEMBER_TYPE_ID_GENERAL,
    name: overrides.name ?? 'General',
    monthly_rate: overrides.monthly_rate ?? 12000,
    is_active: overrides.is_active ?? true,
    created_at: overrides.created_at ?? '2026-04-01T00:00:00.000Z',
  }
}

function createPaymentRequestRecord(
  overrides: Partial<MemberPaymentRequestRecord> = {},
): MemberPaymentRequestRecord {
  return {
    id: overrides.id ?? 'payment-request-1',
    member_id: overrides.member_id ?? MEMBER_ID,
    requested_by: overrides.requested_by ?? 'staff-1',
    status: overrides.status ?? 'pending',
    amount: overrides.amount ?? 12000,
    payment_type: overrides.payment_type ?? 'membership',
    payment_method: overrides.payment_method ?? 'cash',
    payment_date: overrides.payment_date ?? '2026-04-11',
    member_type_id:
      overrides.member_type_id !== undefined
        ? overrides.member_type_id
        : MEMBER_TYPE_ID_GENERAL,
    notes: overrides.notes !== undefined ? overrides.notes : 'Paid in full',
    reviewed_by: overrides.reviewed_by ?? null,
    reviewed_at: overrides.reviewed_at ?? null,
    rejection_reason: overrides.rejection_reason ?? null,
    created_at: overrides.created_at ?? '2026-04-11T10:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-04-11T10:00:00.000Z',
    member: overrides.member ?? {
      id: MEMBER_ID,
      name: 'Jane Doe',
      email: 'jane@example.com',
    },
    memberType:
      overrides.memberType !== undefined
        ? overrides.memberType
        : {
            name: 'General',
          },
    requestedByProfile: overrides.requestedByProfile ?? {
      name: 'Jordan Staff',
    },
    reviewedByProfile: overrides.reviewedByProfile ?? null,
  }
}

function createPaymentRequestsClient({
  requestRows = [createPaymentRequestRecord()],
  existingRequestRow = createPaymentRequestRecord(),
  insertedRequestRow = createPaymentRequestRecord(),
  existingMemberRow = {
    id: MEMBER_ID,
    type: 'General' as MemberType,
    member_type_id: MEMBER_TYPE_ID_GENERAL,
    email: 'jane@example.com',
    begin_time: '2026-04-01T00:00:00.000Z',
    end_time: '2026-04-30T23:59:59.000Z',
  },
  memberTypeRow = createMemberTypeRecord({
    id: MEMBER_TYPE_ID_CIVIL_SERVANT,
    name: 'Civil Servant',
    monthly_rate: 7500,
  }),
  denyUpdateMatches = true,
  requestUpdateError = null,
  approvalRpcResult = 'payment-1',
  approvalRpcError = null,
}: {
  requestRows?: MemberPaymentRequestRecord[]
  existingRequestRow?: MemberPaymentRequestRecord | null
  insertedRequestRow?: MemberPaymentRequestRecord
  existingMemberRow?: {
    id: string
    type: MemberType
    member_type_id: string | null
    email: string | null
    begin_time: string | null
    end_time: string | null
  } | null
  memberTypeRow?: MemberTypeRecord | null
  denyUpdateMatches?: boolean
  requestUpdateError?: { message: string } | null
  approvalRpcResult?: string | null
  approvalRpcError?: { message: string } | null
} = {}) {
  const rpcCalls: Array<{
    fn: string
    args: Record<string, unknown>
  }> = []
  const requestInserts: Array<Record<string, unknown>> = []
  const requestUpdates: Array<Record<string, unknown>> = []

  return {
    rpcCalls,
    requestInserts,
    requestUpdates,
    client: {
      from(table: string) {
        if (table === 'member_payment_requests') {
          return {
            select(columns: string) {
              expect(columns).toBe(MEMBER_PAYMENT_REQUEST_SELECT)

              return {
                eq(column: string, value: string) {
                  if (column === 'status') {
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
                  }

                  expect(column).toBe('id')
                  expect(value).toBe('payment-request-1')

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
                  expect(columns).toBe(MEMBER_PAYMENT_REQUEST_SELECT)

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
                  expect(column).toBe('status')
                  expect(value).toBe('pending')

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('id')
                      expect(nextValue).toBe('payment-request-1')

                      return {
                        select(columns: string) {
                          expect(columns).toBe(MEMBER_PAYMENT_REQUEST_SELECT)

                          const updateMatches =
                            values.status === 'denied' ? denyUpdateMatches : false
                          const updateError = requestUpdateError

                          return Promise.resolve({
                            data:
                              updateMatches && existingRequestRow
                                ? [
                                    {
                                      ...existingRequestRow,
                                      ...values,
                                    },
                                  ]
                                : [],
                            error: updateError,
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
            select(columns: string) {
              expect([
                'id, member_type_id, email',
                'id, email, begin_time, end_time',
              ]).toContain(columns)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe(MEMBER_ID)

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data:
                          columns === 'id, member_type_id, email'
                            ? existingMemberRow
                              ? {
                                  id: existingMemberRow.id,
                                  member_type_id: existingMemberRow.member_type_id,
                                  email: existingMemberRow.email,
                                }
                              : null
                            : existingMemberRow
                              ? {
                                  id: existingMemberRow.id,
                                  email: existingMemberRow.email,
                                  begin_time: existingMemberRow.begin_time,
                                  end_time: existingMemberRow.end_time,
                                }
                              : null,
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }
        }

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

        throw new Error(`Unexpected table: ${table}`)
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

describe('member payment request routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    archiveResolvedRequestNotificationsMock.mockReset()
    archiveResolvedRequestNotificationsMock.mockResolvedValue(undefined)
    getSupabaseAdminClientMock.mockReset()
    insertNotificationsMock.mockClear()
    readAdminNotificationRecipientsMock.mockReset()
    readAdminNotificationRecipientsMock.mockResolvedValue([])
    resetServerAuthMocks()
  })

  it('returns pending member payment requests for admins ordered oldest first', async () => {
    const requestRows = [
      createPaymentRequestRecord({
        id: 'payment-request-1',
        created_at: '2026-04-11T09:00:00.000Z',
      }),
      createPaymentRequestRecord({
        id: 'payment-request-2',
        created_at: '2026-04-11T10:00:00.000Z',
      }),
    ]
    const { client } = createPaymentRequestsClient({ requestRows })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      requests: [
        expect.objectContaining({ id: 'payment-request-1' }),
        expect.objectContaining({ id: 'payment-request-2' }),
      ],
    })
  })

  it('rejects non-admin users from reading pending member payment requests', async () => {
    mockForbidden()

    const response = await GET()

    expect(response.status).toBe(403)
  })

  it('creates a pending member payment request for the authenticated user', async () => {
    const { client, requestInserts } = createPaymentRequestsClient({
      insertedRequestRow: createPaymentRequestRecord({
        amount: 7500,
        payment_method: 'fygaro',
        payment_date: '2026-04-12',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        memberType: {
          name: 'Civil Servant',
        },
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readAdminNotificationRecipientsMock.mockResolvedValue([
      { id: 'admin-1' },
      { id: 'admin-2' },
    ])
    mockAuthenticatedUser({ id: 'staff-auth-1' })

    const response = await POST(
      new Request('http://localhost/api/member-payment-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          payment_type: 'membership',
          amount: 7500,
          payment_method: 'fygaro',
          payment_date: '2026-04-12',
          member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
          notes: 'Card machine payment',
        }),
      }),
    )

    expect(requestInserts).toEqual([
      {
        member_id: MEMBER_ID,
        requested_by: 'staff-auth-1',
        status: 'pending',
        amount: 7500,
        payment_type: 'membership',
        payment_method: 'fygaro',
        payment_date: '2026-04-12',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        notes: 'Card machine payment',
      },
    ])
    expect(insertNotificationsMock).toHaveBeenCalledWith(client, [
      {
        recipientId: 'admin-1',
        type: 'member_payment_request',
        title: 'Member Payment Request',
        body: 'New payment request from Jordan Staff for Jane Doe.',
        metadata: {
          requestId: 'payment-request-1',
          memberId: MEMBER_ID,
          memberName: 'Jane Doe',
          requestedBy: 'Jordan Staff',
          amount: 7500,
          paymentMethod: 'fygaro',
          paymentType: 'membership',
        },
      },
      {
        recipientId: 'admin-2',
        type: 'member_payment_request',
        title: 'Member Payment Request',
        body: 'New payment request from Jordan Staff for Jane Doe.',
        metadata: {
          requestId: 'payment-request-1',
          memberId: MEMBER_ID,
          memberName: 'Jane Doe',
          requestedBy: 'Jordan Staff',
          amount: 7500,
          paymentMethod: 'fygaro',
          paymentType: 'membership',
        },
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: expect.objectContaining({
        id: 'payment-request-1',
        amount: 7500,
        paymentMethod: 'fygaro',
        paymentDate: '2026-04-12',
      }),
    })
  })

  it('uses the member current type when creating a payment request without an explicit type', async () => {
    const { client, requestInserts } = createPaymentRequestsClient({
      insertedRequestRow: createPaymentRequestRecord({
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        memberType: {
          name: 'General',
        },
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readAdminNotificationRecipientsMock.mockResolvedValue([])
    mockAuthenticatedUser({ id: 'staff-auth-1' })

    const response = await POST(
      new Request('http://localhost/api/member-payment-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          payment_type: 'membership',
          amount: 12000,
          payment_method: 'cash',
          payment_date: '2026-04-12',
        }),
      }),
    )

    expect(requestInserts).toEqual([
      {
        member_id: MEMBER_ID,
        requested_by: 'staff-auth-1',
        status: 'pending',
        amount: 12000,
        payment_type: 'membership',
        payment_method: 'cash',
        payment_date: '2026-04-12',
        member_type_id: MEMBER_TYPE_ID_GENERAL,
      },
    ])
    expect(response.status).toBe(200)
  })

  it('creates a pending card fee request with the fixed amount and no membership type', async () => {
    const { client, requestInserts } = createPaymentRequestsClient({
      insertedRequestRow: createPaymentRequestRecord({
        amount: CARD_FEE_AMOUNT_JMD,
        payment_type: 'card_fee',
        payment_date: '2026-04-12',
        member_type_id: null,
        memberType: null,
        notes: 'Replacement card',
      }),
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    readAdminNotificationRecipientsMock.mockResolvedValue([{ id: 'admin-1' }])
    mockAuthenticatedUser({ id: 'staff-auth-1' })

    const response = await POST(
      new Request('http://localhost/api/member-payment-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          payment_type: 'card_fee',
          payment_method: 'cash',
          payment_date: '2026-04-12',
          notes: 'Replacement card',
        }),
      }),
    )

    expect(requestInserts).toEqual([
      {
        member_id: MEMBER_ID,
        requested_by: 'staff-auth-1',
        status: 'pending',
        amount: CARD_FEE_AMOUNT_JMD,
        payment_type: 'card_fee',
        payment_method: 'cash',
        payment_date: '2026-04-12',
        member_type_id: null,
        notes: 'Replacement card',
      },
    ])
    expect(insertNotificationsMock).toHaveBeenCalledWith(client, [
      expect.objectContaining({
        metadata: expect.objectContaining({
          paymentType: 'card_fee',
        }),
      }),
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      request: expect.objectContaining({
        amount: CARD_FEE_AMOUNT_JMD,
        paymentType: 'card_fee',
        memberTypeId: null,
      }),
    })
  })

  it('returns 400 when the member has no email on file for a payment request', async () => {
    const { client, requestInserts } = createPaymentRequestsClient({
      existingMemberRow: {
        id: MEMBER_ID,
        type: 'General',
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        email: null,
        begin_time: '2026-04-01T00:00:00.000Z',
        end_time: '2026-04-30T23:59:59.000Z',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAuthenticatedUser({ id: 'staff-auth-1' })

    const response = await POST(
      new Request('http://localhost/api/member-payment-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          payment_type: 'membership',
          amount: 12000,
          payment_method: 'cash',
          payment_date: '2026-04-12',
        }),
      }),
    )

    expect(requestInserts).toEqual([])
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Add an email address to the member profile before submitting a payment.',
    })
  })

  it('returns 400 when the amount is not greater than zero', async () => {
    const { client } = createPaymentRequestsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAuthenticatedUser({ id: 'staff-auth-1' })

    const response = await POST(
      new Request('http://localhost/api/member-payment-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          payment_type: 'membership',
          amount: 0,
          payment_method: 'cash',
          payment_date: '2026-04-12',
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('Amount must be greater than 0.'),
    })
  })

  it('returns 400 when a payment request cannot resolve a membership type', async () => {
    const { client } = createPaymentRequestsClient({
      existingMemberRow: {
        id: MEMBER_ID,
        type: 'General',
        member_type_id: null,
        email: 'jane@example.com',
        begin_time: '2026-04-01T00:00:00.000Z',
        end_time: '2026-04-30T23:59:59.000Z',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAuthenticatedUser({ id: 'staff-auth-1' })

    const response = await POST(
      new Request('http://localhost/api/member-payment-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          payment_type: 'membership',
          amount: 12000,
          payment_method: 'cash',
          payment_date: '2026-04-12',
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Membership type is required for this payment request.',
    })
  })

  it('logs and ignores member payment notification delivery failures after create', async () => {
    const { client } = createPaymentRequestsClient({
      insertedRequestRow: createPaymentRequestRecord({
        amount: 7500,
        payment_method: 'fygaro',
        payment_date: '2026-04-12',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        memberType: {
          name: 'Civil Servant',
        },
      }),
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    insertNotificationsMock.mockRejectedValueOnce(new Error('Notification insert failed.'))
    getSupabaseAdminClientMock.mockReturnValue(client)
    readAdminNotificationRecipientsMock.mockResolvedValue([{ id: 'admin-1' }])
    mockAuthenticatedUser({ id: 'staff-auth-1' })

    const response = await POST(
      new Request('http://localhost/api/member-payment-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: MEMBER_ID,
          payment_type: 'membership',
          amount: 7500,
          payment_method: 'fygaro',
          payment_date: '2026-04-12',
          member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        }),
      }),
    )

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to send member payment request notifications:',
      expect.any(Error),
    )
    expect(response.status).toBe(200)
  })

  it('denies a pending member payment request', async () => {
    const { client, requestUpdates } = createPaymentRequestsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-payment-requests/payment-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'deny',
          rejectionReason: 'Amount does not match the receipt.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'payment-request-1' }),
      },
    )

    expect(requestUpdates).toEqual([
      {
        status: 'denied',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
        rejection_reason: 'Amount does not match the receipt.',
      },
    ])
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'payment-request-1',
      type: 'member_payment_request',
      archivedAt: expect.any(String),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('returns 400 when a deny race finds the request already reviewed', async () => {
    const { client } = createPaymentRequestsClient({
      denyUpdateMatches: false,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-payment-requests/payment-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'deny',
          rejectionReason: 'Amount does not match the receipt.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'payment-request-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This request has already been reviewed.',
    })
  })

  it('approves a pending member payment request through the RPC', async () => {
    const existingRequestRow = createPaymentRequestRecord({
      member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      memberType: {
        name: 'Civil Servant',
      },
    })
    const { client, requestUpdates, rpcCalls } = createPaymentRequestsClient({
      existingRequestRow,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-payment-requests/payment-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ id: 'payment-request-1' }),
      },
    )

    expect(requestUpdates).toEqual([])
    expect(rpcCalls).toEqual([
      {
        fn: 'approve_member_payment_request',
        args: {
          p_request_id: 'payment-request-1',
          p_reviewer_id: 'admin-1',
          p_review_timestamp: expect.any(String),
          p_membership_begin_time: '2026-04-01T00:00:00.000Z',
          p_membership_end_time: '2026-04-30T23:59:59.000Z',
        },
      },
    ])
    expect(archiveResolvedRequestNotificationsMock).toHaveBeenCalledWith(client, {
      requestId: 'payment-request-1',
      type: 'member_payment_request',
      archivedAt: expect.any(String),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, paymentId: 'payment-1' })
  })

  it('logs and ignores member payment notification archive failures after denial', async () => {
    const { client } = createPaymentRequestsClient()
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    archiveResolvedRequestNotificationsMock.mockRejectedValueOnce(new Error('Archive failed.'))
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-payment-requests/payment-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'deny',
          rejectionReason: 'Amount does not match the receipt.',
        }),
      }),
      {
        params: Promise.resolve({ id: 'payment-request-1' }),
      },
    )

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to archive resolved member payment request notifications:',
      expect.any(Error),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('returns 400 when the member email is missing before approval', async () => {
    const { client, rpcCalls } = createPaymentRequestsClient({
      existingMemberRow: {
        id: MEMBER_ID,
        type: 'General',
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        email: '   ',
        begin_time: '2026-04-01T00:00:00.000Z',
        end_time: '2026-04-30T23:59:59.000Z',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-payment-requests/payment-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ id: 'payment-request-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member email is required to approve this payment request.',
    })
    expect(rpcCalls).toEqual([])
  })

  it('returns 400 when the approval RPC reports the request already reviewed', async () => {
    const { client, rpcCalls } = createPaymentRequestsClient({
      approvalRpcError: {
        message: 'This request has already been reviewed.',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-payment-requests/payment-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ id: 'payment-request-1' }),
      },
    )

    expect(rpcCalls).toHaveLength(1)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This request has already been reviewed.',
    })
  })

  it('returns 404 when the approval RPC reports the request missing', async () => {
    const { client, rpcCalls } = createPaymentRequestsClient({
      approvalRpcError: {
        message: 'Member payment request not found.',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-payment-requests/payment-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ id: 'payment-request-1' }),
      },
    )

    expect(rpcCalls).toHaveLength(1)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member payment request not found.',
    })
  })

  it('returns 404 when the approval RPC reports the membership type missing', async () => {
    const { client, rpcCalls } = createPaymentRequestsClient({
      approvalRpcError: {
        message: 'Membership type not found.',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-payment-requests/payment-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ id: 'payment-request-1' }),
      },
    )

    expect(rpcCalls).toHaveLength(1)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Membership type not found.',
    })
  })

  it('returns 404 when the request is missing before approval starts', async () => {
    const { client, rpcCalls } = createPaymentRequestsClient({
      existingRequestRow: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'admin-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await PATCH(
      new Request('http://localhost/api/member-payment-requests/payment-request-1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'approve',
        }),
      }),
      {
        params: Promise.resolve({ id: 'payment-request-1' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member payment request not found.',
    })
    expect(rpcCalls).toEqual([])
  })
})
