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

import { DELETE } from '@/app/api/pt/payments/[id]/route'

function createDeletePtPaymentRouteClient({
  paymentRow = {
    id: 'pt-payment-1',
  },
  paymentError = null,
  deleteError = null,
}: {
  paymentRow?: { id: string } | null
  paymentError?: { message: string } | null
  deleteError?: { message: string } | null
} = {}) {
  const deletes: string[] = []

  return {
    deletes,
    client: {
      from(table: string) {
        expect(table).toBe('pt_payments')

        return {
          select(columns: string) {
            expect(columns).toBe('id')

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('pt-payment-1')

                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: paymentRow,
                      error: paymentError,
                    })
                  },
                }
              },
            }
          },
          delete() {
            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('pt-payment-1')
                deletes.push(value)

                return Promise.resolve({
                  data: null,
                  error: deleteError,
                })
              },
            }
          },
        }
      },
    },
  }
}

describe('DELETE /api/pt/payments/[id]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('deletes the PT payment', async () => {
    const { client, deletes } = createDeletePtPaymentRouteClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'pt-payment-1',
      }),
    })

    expect(response.status).toBe(200)
    expect(deletes).toEqual(['pt-payment-1'])
    await expect(response.json()).resolves.toEqual({
      ok: true,
    })
  })

  it('rejects non-admin users', async () => {
    mockForbidden()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'pt-payment-1',
      }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('returns 404 when the PT payment is missing', async () => {
    const { client, deletes } = createDeletePtPaymentRouteClient({
      paymentRow: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'pt-payment-1',
      }),
    })

    expect(deletes).toEqual([])
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'PT payment not found.',
    })
  })

  it('returns 500 when reading the PT payment fails', async () => {
    const { client } = createDeletePtPaymentRouteClient({
      paymentError: { message: 'select failed' },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'pt-payment-1',
      }),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to read PT payment pt-payment-1: select failed',
    })
  })

  it('returns 500 when deleting the PT payment fails', async () => {
    const { client } = createDeletePtPaymentRouteClient({
      deleteError: { message: 'delete failed' },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAdminUser()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'pt-payment-1',
      }),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to delete PT payment pt-payment-1: delete failed',
    })
  })
})
