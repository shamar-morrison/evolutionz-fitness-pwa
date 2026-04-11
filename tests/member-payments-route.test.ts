import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockForbidden,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const {
  getSupabaseAdminClientMock,
} = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { POST } from '@/app/api/members/[id]/payments/route'

const MEMBER_TYPE_ID_GENERAL = '11111111-1111-4111-8111-111111111111'
const MEMBER_TYPE_ID_CIVIL_SERVANT = '22222222-2222-4222-8222-222222222222'

function createPaymentsRouteClient({
  existingMemberRow = {
    id: 'member-1',
    type: 'General',
    member_type_id: MEMBER_TYPE_ID_GENERAL,
  },
  memberTypeRow = {
    id: MEMBER_TYPE_ID_CIVIL_SERVANT,
    name: 'Civil Servant',
    monthly_rate: 7500,
    is_active: true,
    created_at: '2026-04-01T00:00:00.000Z',
  },
  insertedPaymentRow = {
    id: 'payment-1',
    member_id: 'member-1',
    member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
    payment_method: 'cash',
    amount_paid: 7500,
    promotion: null,
    recorded_by: 'profile-1',
    payment_date: '2026-04-09',
    notes: null,
    created_at: '2026-04-09T12:00:00.000Z',
  },
}: {
  existingMemberRow?: {
    id: string
    type: string
    member_type_id: string | null
  } | null
  memberTypeRow?: Record<string, unknown> | null
  insertedPaymentRow?: Record<string, unknown> | null
} = {}) {
  const memberUpdates: Array<Record<string, unknown>> = []
  const paymentInserts: Array<Record<string, unknown>> = []

  return {
    memberUpdates,
    paymentInserts,
    client: {
      from(table: string) {
        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, type, member_type_id')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('member-1')

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: existingMemberRow,
                        error: null,
                      })
                    },
                  }
                },
              }
            },
            update(values: Record<string, unknown>) {
              memberUpdates.push(values)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('member-1')

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

        if (table === 'member_types') {
          return {
            select(columns: string) {
              expect(columns).toBe('*')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe(MEMBER_TYPE_ID_CIVIL_SERVANT)

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: memberTypeRow,
                        error: null,
                      })
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
                        data: insertedPaymentRow,
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

describe('POST /api/members/[id]/payments', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('records a payment and syncs the member type from the authenticated profile', async () => {
    const { client, memberUpdates, paymentInserts } = createPaymentsRouteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      user: { id: 'auth-user-1' },
      profile: {
        id: 'profile-1',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
          payment_method: 'cash',
          amount_paid: 7500,
          promotion: null,
          payment_date: '2026-04-09',
          notes: null,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(memberUpdates).toEqual([
      {
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        type: 'Civil Servant',
      },
    ])
    expect(paymentInserts).toEqual([
      {
        member_id: 'member-1',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        payment_method: 'cash',
        amount_paid: 7500,
        promotion: null,
        recorded_by: 'profile-1',
        payment_date: '2026-04-09',
        notes: null,
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      payment: {
        id: 'payment-1',
        member_id: 'member-1',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        payment_method: 'cash',
        amount_paid: 7500,
        promotion: null,
        recorded_by: 'profile-1',
        payment_date: '2026-04-09',
        notes: null,
        created_at: '2026-04-09T12:00:00.000Z',
      },
    })
  })

  it('rejects non-admin staff from recording payments directly', async () => {
    mockForbidden()

    const response = await POST(
      new Request('http://localhost/api/members/member-1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
          payment_method: 'cash',
          amount_paid: 7500,
          promotion: null,
          payment_date: '2026-04-09',
          notes: null,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('skips the member update when the submitted type already matches the current member', async () => {
    const { client, memberUpdates, paymentInserts } = createPaymentsRouteClient({
      existingMemberRow: {
        id: 'member-1',
        type: 'Civil Servant',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser({
      profile: {
        id: 'profile-9',
        role: 'admin',
        titles: ['Owner'],
      },
    })

    const response = await POST(
      new Request('http://localhost/api/members/member-1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
          payment_method: 'fygaro',
          amount_paid: 7500,
          promotion: 'Promo',
          payment_date: '2026-04-09',
          notes: 'Paid online',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(memberUpdates).toEqual([])
    expect(paymentInserts).toEqual([
      {
        member_id: 'member-1',
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        payment_method: 'fygaro',
        amount_paid: 7500,
        promotion: 'Promo',
        recorded_by: 'profile-9',
        payment_date: '2026-04-09',
        notes: 'Paid online',
      },
    ])
    expect(response.status).toBe(200)
  })
})
