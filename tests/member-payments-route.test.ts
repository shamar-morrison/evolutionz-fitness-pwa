import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEMBER_PAYMENT_RECORD_SELECT } from '@/lib/member-payment-records'
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

import { GET, POST } from '@/app/api/members/[id]/payments/route'

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

function createGetPaymentsRouteClient({
  paymentRows = [
    {
      id: 'payment-1',
      member_id: 'member-1',
      member_type_id: MEMBER_TYPE_ID_GENERAL,
      payment_method: 'cash',
      amount_paid: '12000',
      promotion: 'Promo',
      recorded_by: 'admin-1',
      payment_date: '2026-04-10',
      notes: 'April renewal',
      created_at: '2026-04-10T12:00:00.000Z',
      memberType: { name: 'General' },
      recordedByProfile: { name: 'Admin User' },
    },
  ],
  count = paymentRows.length,
  memberCount = 1,
  paymentError = null,
  countError = null,
  memberError = null,
}: {
  paymentRows?: Array<Record<string, unknown>>
  count?: number | null
  memberCount?: number | null
  paymentError?: { message: string } | null
  countError?: { message: string } | null
  memberError?: { message: string } | null
} = {}) {
  const orderCalls: Array<{ column: string; ascending: boolean }> = []
  const querySequence: string[] = []
  let rangeArguments: [number, number] | null = null

  return {
    getRangeArguments: () => rangeArguments,
    getQuerySequence: () => querySequence,
    orderCalls,
    client: {
      from(table: string) {
        if (table === 'members') {
          return {
            select(columns: string, options?: { count?: 'exact'; head?: boolean }) {
              expect(columns).toBe('id')
              expect(options).toEqual({ count: 'exact', head: true })

              const builder = {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('member-1')
                  querySequence.push('members')
                  return builder
                },
                then(
                  onFulfilled: (value: unknown) => unknown,
                  onRejected?: (reason: unknown) => unknown,
                ) {
                  return Promise.resolve({
                    count: memberCount,
                    error: memberError,
                  }).then(onFulfilled, onRejected)
                },
              }

              return builder
            },
          }
        }

        if (table === 'member_payments') {
          return {
            select(columns: string, options?: { count?: 'exact'; head?: boolean }) {
              if (columns === 'id') {
                expect(options).toEqual({ count: 'exact', head: true })

                const builder = {
                  eq(column: string, value: string) {
                    expect(column).toBe('member_id')
                    expect(value).toBe('member-1')
                    querySequence.push('payments-count')
                    return builder
                  },
                  then(
                    onFulfilled: (value: unknown) => unknown,
                    onRejected?: (reason: unknown) => unknown,
                  ) {
                    return Promise.resolve({
                      count,
                      error: countError,
                    }).then(onFulfilled, onRejected)
                  },
                }

                return builder
              }

              expect(columns).toBe(MEMBER_PAYMENT_RECORD_SELECT)
              expect(options).toEqual({ count: 'exact' })

              const query = {
                eq(column: string, value: string) {
                  expect(column).toBe('member_id')
                  expect(value).toBe('member-1')
                  return query
                },
                order(column: string, orderOptions: { ascending: boolean }) {
                  orderCalls.push({ column, ascending: orderOptions.ascending })
                  return query
                },
                range(from: number, to: number) {
                  rangeArguments = [from, to]
                  querySequence.push('payments-page')

                  return Promise.resolve({
                    data: paymentRows,
                    error: paymentError,
                    count,
                  })
                },
              }

              return query
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

describe('GET /api/members/[id]/payments', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns paginated payment history for admins', async () => {
    const { client, getQuerySequence, getRangeArguments, orderCalls } = createGetPaymentsRouteClient(
      {
      paymentRows: [
        {
          id: 'payment-2',
          member_id: 'member-1',
          member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
          payment_method: 'fygaro',
          amount_paid: '7500',
          promotion: null,
          recorded_by: 'admin-1',
          payment_date: '2026-04-12',
          notes: null,
          created_at: '2026-04-12T15:30:00.000Z',
          memberType: { name: 'Civil Servant' },
          recordedByProfile: { name: 'Admin User' },
        },
        {
          id: 'payment-1',
          member_id: 'member-1',
          member_type_id: MEMBER_TYPE_ID_GENERAL,
          payment_method: 'cash',
          amount_paid: 12000,
          promotion: 'Promo',
          recorded_by: null,
          payment_date: '2026-04-10',
          notes: 'April renewal',
          created_at: '2026-04-10T12:00:00.000Z',
          memberType: { name: 'General' },
          recordedByProfile: null,
        },
      ],
      count: 12,
      },
    )
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await GET(
      new Request('http://localhost/api/members/member-1/payments?page=1&limit=999'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(getQuerySequence()).toEqual(['members', 'payments-page'])
    expect(getRangeArguments()).toEqual([10, 19])
    expect(orderCalls).toEqual([
      { column: 'payment_date', ascending: false },
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ])
    await expect(response.json()).resolves.toEqual({
      payments: [
        {
          id: 'payment-2',
          memberId: 'member-1',
          memberTypeId: MEMBER_TYPE_ID_CIVIL_SERVANT,
          memberTypeName: 'Civil Servant',
          paymentMethod: 'fygaro',
          amountPaid: 7500,
          promotion: null,
          recordedBy: 'admin-1',
          recordedByName: 'Admin User',
          paymentDate: '2026-04-12',
          notes: null,
          createdAt: '2026-04-12T15:30:00.000Z',
        },
        {
          id: 'payment-1',
          memberId: 'member-1',
          memberTypeId: MEMBER_TYPE_ID_GENERAL,
          memberTypeName: 'General',
          paymentMethod: 'cash',
          amountPaid: 12000,
          promotion: 'Promo',
          recordedBy: null,
          recordedByName: null,
          paymentDate: '2026-04-10',
          notes: 'April renewal',
          createdAt: '2026-04-10T12:00:00.000Z',
        },
      ],
      totalMatches: 12,
    })
  })

  it('returns the count-only response when limit is zero', async () => {
    const { client, getQuerySequence, getRangeArguments, orderCalls } =
      createGetPaymentsRouteClient({
      count: 42,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await GET(
      new Request('http://localhost/api/members/member-1/payments?page=0&limit=0'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(getQuerySequence()).toEqual(['members', 'payments-count'])
    expect(getRangeArguments()).toBeNull()
    expect(orderCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      payments: [],
      totalMatches: 42,
    })
  })

  it('rejects invalid page and limit values', async () => {
    mockAdminUser()

    const response = await GET(
      new Request('http://localhost/api/members/member-1/payments?page=-1&limit=abc'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'page and limit must be non-negative integers.',
    })
  })

  it('rejects page values that would overflow the query range', async () => {
    const { client, getQuerySequence, getRangeArguments, orderCalls } = createGetPaymentsRouteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await GET(
      new Request(
        'http://localhost/api/members/member-1/payments?page=900719925474099&limit=10',
      ),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(getSupabaseAdminClientMock).toHaveBeenCalledTimes(1)
    expect(getQuerySequence()).toEqual([])
    expect(getRangeArguments()).toBeNull()
    expect(orderCalls).toEqual([])
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Requested member payments page is too large.',
    })
  })

  it('returns 404 when the parent member does not exist', async () => {
    const { client, getQuerySequence, getRangeArguments, orderCalls } = createGetPaymentsRouteClient(
      {
        memberCount: 0,
      },
    )
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await GET(
      new Request('http://localhost/api/members/member-1/payments?page=0&limit=10'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(404)
    expect(getQuerySequence()).toEqual(['members'])
    expect(getRangeArguments()).toBeNull()
    expect(orderCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member not found.',
    })
  })

  it('returns 500 when reading the parent member fails', async () => {
    const { client, getQuerySequence, getRangeArguments, orderCalls } = createGetPaymentsRouteClient(
      {
        memberError: { message: 'member select failed' },
      },
    )
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await GET(
      new Request('http://localhost/api/members/member-1/payments?page=0&limit=10'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(500)
    expect(getQuerySequence()).toEqual(['members'])
    expect(getRangeArguments()).toBeNull()
    expect(orderCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to read member member-1: member select failed',
    })
  })

  it('returns 500 when reading paginated payments fails', async () => {
    const { client, getQuerySequence, getRangeArguments, orderCalls } = createGetPaymentsRouteClient(
      {
        paymentError: { message: 'payments select failed' },
      },
    )
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await GET(
      new Request('http://localhost/api/members/member-1/payments?page=1&limit=10'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(500)
    expect(getQuerySequence()).toEqual(['members', 'payments-page'])
    expect(getRangeArguments()).toEqual([10, 19])
    expect(orderCalls).toEqual([
      { column: 'payment_date', ascending: false },
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to read member payments for member-1: payments select failed',
    })
  })

  it('returns 500 when reading the count-only payments query fails', async () => {
    const { client, getQuerySequence, getRangeArguments, orderCalls } =
      createGetPaymentsRouteClient({
        countError: { message: 'payments count failed' },
      })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await GET(
      new Request('http://localhost/api/members/member-1/payments?page=0&limit=0'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(500)
    expect(getQuerySequence()).toEqual(['members', 'payments-count'])
    expect(getRangeArguments()).toBeNull()
    expect(orderCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to read member payments for member-1: payments count failed',
    })
  })

  it('returns 500 when a payment row contains an invalid amount', async () => {
    const { client } = createGetPaymentsRouteClient({
      paymentRows: [
        {
          id: 'payment-1',
          member_id: 'member-1',
          member_type_id: MEMBER_TYPE_ID_GENERAL,
          payment_method: 'cash',
          amount_paid: 'not-a-number',
          promotion: null,
          recorded_by: 'admin-1',
          payment_date: '2026-04-10',
          notes: null,
          created_at: '2026-04-10T12:00:00.000Z',
          memberType: { name: 'General' },
          recordedByProfile: { name: 'Admin User' },
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await GET(
      new Request('http://localhost/api/members/member-1/payments?page=0&limit=10'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid amount: not-a-number',
    })
  })

  it('rejects non-admin users from reading member payments', async () => {
    mockForbidden()

    const response = await GET(
      new Request('http://localhost/api/members/member-1/payments?page=0&limit=10'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })
})
