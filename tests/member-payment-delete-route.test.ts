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

import { DELETE } from '@/app/api/members/[id]/payments/[paymentId]/route'

function createDeletePaymentsRouteClient({
  paymentRow = {
    id: 'payment-1',
    member_id: 'member-1',
  },
  existingMemberRow = {
    id: 'member-1',
  },
  paymentError = null,
  memberError = null,
  rpcError = null,
}: {
  paymentRow?: { id: string; member_id: string } | null
  existingMemberRow?: {
    id: string
  } | null
  paymentError?: { message: string } | null
  memberError?: { message: string } | null
  rpcError?: { message: string } | null
} = {}) {
  const rpcCalls: Array<{
    fn: string
    args: Record<string, unknown>
  }> = []

  return {
    rpcCalls,
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

              throw new Error(`Unexpected member_payments select: ${columns}`)
            },
          }
        }

        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe('id')

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
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
      rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args })

        return Promise.resolve({
          data: null,
          error: rpcError,
        })
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

  it('deletes the payment and syncs the member inside the RPC', async () => {
    const { client, rpcCalls } = createDeletePaymentsRouteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'member-1',
        paymentId: 'payment-1',
      }),
    })

    expect(response.status).toBe(200)
    expect(rpcCalls).toEqual([
      {
        fn: 'delete_member_payment_and_sync_member_type',
        args: {
          p_payment_id: 'payment-1',
          p_member_id: 'member-1',
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
    })
  })

  it('returns 404 when the member is missing', async () => {
    const { client, rpcCalls } = createDeletePaymentsRouteClient({
      existingMemberRow: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'member-1',
        paymentId: 'payment-1',
      }),
    })

    expect(rpcCalls).toEqual([])
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member not found.',
    })
  })

  it('returns 404 when the payment is missing or belongs to another member', async () => {
    const { client, rpcCalls } = createDeletePaymentsRouteClient({
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

    expect(rpcCalls).toEqual([])
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

  it('returns 500 when the RPC delete fails', async () => {
    const { client } = createDeletePaymentsRouteClient({
      rpcError: { message: 'delete failed' },
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
