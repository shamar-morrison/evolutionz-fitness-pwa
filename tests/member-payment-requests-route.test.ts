import { afterEach, describe, expect, it, vi } from 'vitest'
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
import * as memberTypeSync from '@/lib/member-type-sync'
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
    payment_method: overrides.payment_method ?? 'cash',
    payment_date: overrides.payment_date ?? '2026-04-11',
    member_type_id: overrides.member_type_id ?? MEMBER_TYPE_ID_GENERAL,
    notes: overrides.notes ?? 'Paid in full',
    reviewed_by: overrides.reviewed_by ?? null,
    reviewed_at: overrides.reviewed_at ?? null,
    rejection_reason: overrides.rejection_reason ?? null,
    created_at: overrides.created_at ?? '2026-04-11T10:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-04-11T10:00:00.000Z',
    member: overrides.member ?? {
      id: MEMBER_ID,
      name: 'Jane Doe',
    },
    memberType: overrides.memberType ?? {
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
  requestLookupRow = existingRequestRow,
  insertedRequestRow = createPaymentRequestRecord(),
  existingMemberRow = {
    id: MEMBER_ID,
    type: 'General' as MemberType,
    member_type_id: MEMBER_TYPE_ID_GENERAL,
  },
  memberTypeRow = createMemberTypeRecord({
    id: MEMBER_TYPE_ID_CIVIL_SERVANT,
    name: 'Civil Servant',
    monthly_rate: 7500,
  }),
  approveUpdateMatches = true,
  approveUpdateError = null,
  requestUpdateError = null,
}: {
  requestRows?: MemberPaymentRequestRecord[]
  existingRequestRow?: MemberPaymentRequestRecord | null
  requestLookupRow?: MemberPaymentRequestRecord | null
  insertedRequestRow?: MemberPaymentRequestRecord
  existingMemberRow?: {
    id: string
    type: MemberType
    member_type_id: string | null
  } | null
  memberTypeRow?: MemberTypeRecord | null
  approveUpdateMatches?: boolean
  approveUpdateError?: { message: string } | null
  requestUpdateError?: { message: string } | null
} = {}) {
  const memberUpdates: Array<Record<string, unknown>> = []
  const operations: string[] = []
  const paymentInserts: Array<Record<string, unknown>> = []
  const requestInserts: Array<Record<string, unknown>> = []
  const requestUpdates: Array<Record<string, unknown>> = []

  return {
    memberUpdates,
    operations,
    paymentInserts,
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
                        data: requestLookupRow,
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
              operations.push('request-update')

              return {
                eq(column: string, value: string) {
                  if (column === 'status') {
                    expect(value).toBe('pending')

                    return {
                      eq(nextColumn: string, nextValue: string) {
                        expect(nextColumn).toBe('id')
                        expect(nextValue).toBe('payment-request-1')

                        return {
                          select(columns: string) {
                            expect(columns).toBe(MEMBER_PAYMENT_REQUEST_SELECT)

                            return Promise.resolve({
                              data:
                                approveUpdateMatches && existingRequestRow
                                  ? [
                                      {
                                        ...existingRequestRow,
                                        ...values,
                                      },
                                    ]
                                  : [],
                              error: approveUpdateError,
                            })
                          },
                        }
                      },
                    }
                  }

                  expect(column).toBe('id')
                  expect(value).toBe('payment-request-1')

                  return Promise.resolve({
                    data: null,
                    error: requestUpdateError,
                  })
                },
              }
            },
          }
        }

        if (table === 'members') {
          return {
            select(columns: string) {
              expect(['id, member_type_id', 'id, type, member_type_id']).toContain(columns)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe(MEMBER_ID)

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data:
                          columns === 'id, member_type_id'
                            ? existingMemberRow
                              ? {
                                  id: existingMemberRow.id,
                                  member_type_id: existingMemberRow.member_type_id,
                                }
                              : null
                            : existingMemberRow,
                        error: null,
                      })
                    },
                  }
                },
              }
            },
            update(values: Record<string, unknown>) {
              memberUpdates.push(values)
              operations.push('member-update')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe(MEMBER_ID)

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

        if (table === 'member_payments') {
          return {
            insert(values: Record<string, unknown>) {
              paymentInserts.push(values)
              operations.push('payment-insert')

              return {
                select(columns: string) {
                  expect(columns).toBe('*')

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: { id: 'payment-1' },
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
        payment_method: 'cash',
        payment_date: '2026-04-12',
        member_type_id: MEMBER_TYPE_ID_GENERAL,
      },
    ])
    expect(response.status).toBe(200)
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

  it('approves a pending member payment request and syncs the member type when provided', async () => {
    const existingRequestRow = createPaymentRequestRecord({
      member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      memberType: {
        name: 'Civil Servant',
      },
    })
    const { client, memberUpdates, operations, paymentInserts, requestUpdates } = createPaymentRequestsClient({
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

    expect(memberUpdates).toEqual([
      {
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        type: 'Civil Servant',
      },
    ])
    expect(operations).toEqual(['request-update', 'member-update', 'payment-insert'])
    expect(paymentInserts).toEqual([
      {
        member_id: MEMBER_ID,
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        payment_method: 'cash',
        amount_paid: 12000,
        promotion: null,
        recorded_by: 'admin-1',
        payment_date: '2026-04-11',
        notes: 'Paid in full',
      },
    ])
    expect(requestUpdates).toEqual([
      {
        status: 'approved',
        reviewed_by: 'admin-1',
        reviewed_at: expect.any(String),
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

  it('uses the final resolved member type id when recording an approved payment request', async () => {
    const resolvedMemberTypeId = '44444444-4444-4444-8444-444444444444'
    const memberTypeSyncSpy = vi
      .spyOn(memberTypeSync, 'buildMemberTypeUpdateValues')
      .mockResolvedValue({
        member_type_id: resolvedMemberTypeId,
        type: 'Student/BPO',
      })
    const existingRequestRow = createPaymentRequestRecord({
      member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      memberType: {
        name: 'Civil Servant',
      },
    })
    const { client, memberUpdates, paymentInserts } = createPaymentRequestsClient({
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

    expect(memberTypeSyncSpy).toHaveBeenCalled()
    expect(memberUpdates).toEqual([
      {
        member_type_id: resolvedMemberTypeId,
        type: 'Student/BPO',
      },
    ])
    expect(paymentInserts).toEqual([
      expect.objectContaining({
        member_type_id: resolvedMemberTypeId,
      }),
    ])
    expect(response.status).toBe(200)
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

  it('approves a payment request with the current member type when no new type is requested', async () => {
    const existingRequestRow = createPaymentRequestRecord({
      member_type_id: null,
      memberType: null,
    })
    const { client, memberUpdates, operations, paymentInserts } = createPaymentRequestsClient({
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

    expect(memberUpdates).toEqual([])
    expect(operations).toEqual(['request-update', 'payment-insert'])
    expect(paymentInserts).toEqual([
      {
        member_id: MEMBER_ID,
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        payment_method: 'cash',
        amount_paid: 12000,
        promotion: null,
        recorded_by: 'admin-1',
        payment_date: '2026-04-11',
        notes: 'Paid in full',
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('returns 400 when an approve race finds the request already reviewed', async () => {
    const { client } = createPaymentRequestsClient({
      approveUpdateMatches: false,
      requestLookupRow: createPaymentRequestRecord({
        status: 'approved',
      }),
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
      error: 'This request has already been reviewed.',
    })
  })

  it('returns 404 when an approve race finds the request missing', async () => {
    const { client } = createPaymentRequestsClient({
      approveUpdateMatches: false,
      requestLookupRow: null,
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
  })
})
