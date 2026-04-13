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
  paymentError = null,
  deleteError = null,
}: {
  paymentRow?: { id: string; member_id: string } | null
  paymentError?: { message: string } | null
  deleteError?: { message: string } | null
} = {}) {
  const deleteFilters: Array<{ column: string; value: string }> = []

  return {
    deleteFilters,
    client: {
      from(table: string) {
        if (table !== 'member_payments') {
          throw new Error(`Unexpected table: ${table}`)
        }

        return {
          select(columns: string) {
            expect(columns).toBe('id, member_id')

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

  it('deletes a matching member payment for admins', async () => {
    const { client, deleteFilters } = createDeletePaymentsRouteClient()
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
