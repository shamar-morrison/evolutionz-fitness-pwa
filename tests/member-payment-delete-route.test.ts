import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockForbidden,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

const MEMBER_TYPE_ID_GENERAL = '11111111-1111-4111-8111-111111111111'
const MEMBER_TYPE_ID_CIVIL_SERVANT = '22222222-2222-4222-8222-222222222222'

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

import { DELETE } from '@/app/api/members/[id]/payments/[paymentId]/route'

function createDeletePaymentsRouteClient({
  paymentRow = {
    id: 'payment-1',
    member_id: 'member-1',
  },
  existingMemberRow = {
    id: 'member-1',
    type: 'Civil Servant',
    member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
  },
  latestPaymentRows = [
    {
      id: 'payment-1',
      member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
    },
    {
      id: 'payment-0',
      member_type_id: MEMBER_TYPE_ID_GENERAL,
    },
  ],
  memberTypeRowsById = {
    [MEMBER_TYPE_ID_GENERAL]: {
      id: MEMBER_TYPE_ID_GENERAL,
      name: 'General',
    },
    [MEMBER_TYPE_ID_CIVIL_SERVANT]: {
      id: MEMBER_TYPE_ID_CIVIL_SERVANT,
      name: 'Civil Servant',
    },
  },
  paymentError = null,
  deleteError = null,
  memberError = null,
  updateError = null,
}: {
  paymentRow?: { id: string; member_id: string } | null
  existingMemberRow?: {
    id: string
    type: string
    member_type_id: string | null
  } | null
  latestPaymentRows?: Array<{ id: string; member_type_id: string } | null>
  memberTypeRowsById?: Record<string, { id: string; name: string } | null>
  paymentError?: { message: string } | null
  deleteError?: { message: string } | null
  memberError?: { message: string } | null
  updateError?: { message: string } | null
} = {}) {
  const deleteFilters: Array<{ column: string; value: string }> = []
  const latestPaymentRowsQueue = [...latestPaymentRows]
  const memberUpdates: Array<Record<string, unknown>> = []
  const latestPaymentQueryOrders: Array<Array<{ column: string; ascending: boolean }>> = []

  return {
    deleteFilters,
    memberUpdates,
    latestPaymentQueryOrders,
    client: {
      from(table: string) {
        if (table === 'member_payments') {
          return {
            select(columns: string) {
              if (columns === 'id, member_id') {
                const query = {
                  eq(column: string, value: string) {
                    expect(['id', 'member_id']).toContain(column)
                    expect(value).toBe(column === 'id' ? 'payment-1' : 'member-1')
                    return query
                  },
                  maybeSingle() {
                    return Promise.resolve({
                      data: paymentRow,
                      error: paymentError,
                    })
                  },
                }

                return query
              }

              if (columns === 'id, member_type_id') {
                const orderCalls: Array<{ column: string; ascending: boolean }> = []
                latestPaymentQueryOrders.push(orderCalls)

                const query = {
                  eq(column: string, value: string) {
                    expect(column).toBe('member_id')
                    expect(value).toBe('member-1')
                    return query
                  },
                  order(column: string, options: { ascending: boolean }) {
                    orderCalls.push({ column, ascending: options.ascending })
                    return query
                  },
                  limit(value: number) {
                    expect(value).toBe(1)
                    return query
                  },
                  maybeSingle() {
                    return Promise.resolve({
                      data: latestPaymentRowsQueue.shift() ?? null,
                      error: null,
                    })
                  },
                }

                return query
              }

              throw new Error(`Unexpected member_payments select: ${columns}`)
            },
            delete() {
              return {
                eq(column: string, value: string) {
                  deleteFilters.push({ column, value })

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      deleteFilters.push({ column: nextColumn, value: nextValue })

                      return Promise.resolve({
                        error: deleteError,
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
                        error: memberError,
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
                        data: memberTypeRowsById[value] ?? null,
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

describe('DELETE /api/members/[id]/payments/[paymentId]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('deletes the latest payment and syncs the member to the next remaining payment type', async () => {
    const { client, deleteFilters, latestPaymentQueryOrders, memberUpdates } =
      createDeletePaymentsRouteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'member-1',
        paymentId: 'payment-1',
      }),
    })

    expect(response.status).toBe(200)
    expect(deleteFilters).toEqual([
      { column: 'id', value: 'payment-1' },
      { column: 'member_id', value: 'member-1' },
    ])
    expect(latestPaymentQueryOrders).toEqual([
      [
        { column: 'payment_date', ascending: false },
        { column: 'created_at', ascending: false },
        { column: 'id', ascending: false },
      ],
      [
        { column: 'payment_date', ascending: false },
        { column: 'created_at', ascending: false },
        { column: 'id', ascending: false },
      ],
    ])
    expect(memberUpdates).toEqual([
      {
        member_type_id: MEMBER_TYPE_ID_GENERAL,
        type: 'General',
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
    })
  })

  it('clears member_type_id when deleting the last remaining payment', async () => {
    const { client, memberUpdates } = createDeletePaymentsRouteClient({
      latestPaymentRows: [
        {
          id: 'payment-1',
          member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        },
        null,
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'member-1',
        paymentId: 'payment-1',
      }),
    })

    expect(response.status).toBe(200)
    expect(memberUpdates).toEqual([
      {
        member_type_id: null,
        type: 'Civil Servant',
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
    })
  })

  it('returns 404 when the payment is missing or belongs to another member', async () => {
    const { client } = createDeletePaymentsRouteClient({
      paymentRow: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'member-1',
        paymentId: 'payment-1',
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member payment not found.',
    })
  })

  it('returns 500 when reading the target payment fails', async () => {
    const { client } = createDeletePaymentsRouteClient({
      paymentError: { message: 'payment select failed' },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'member-1',
        paymentId: 'payment-1',
      }),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to read member payment payment-1: payment select failed',
    })
  })

  it('returns 500 when deleting the payment fails', async () => {
    const { client } = createDeletePaymentsRouteClient({
      deleteError: { message: 'delete failed' },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'member-1',
        paymentId: 'payment-1',
      }),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to delete member payment payment-1: delete failed',
    })
  })

  it('rejects non-admin users from deleting member payments', async () => {
    mockForbidden()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'member-1',
        paymentId: 'payment-1',
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })
})
