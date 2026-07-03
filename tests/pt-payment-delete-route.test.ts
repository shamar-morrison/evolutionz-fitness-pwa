import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockForbidden,
  requireAdminUserMock,
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

const paymentId = '55555555-5555-4555-8555-555555555555'

function createDeletePtPaymentRouteClient({
  paymentRow = {
    id: paymentId,
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
                expect(value).toBe(paymentId)

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
                expect(value).toBe(paymentId)
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
        id: paymentId,
      }),
    })

    expect(response.status).toBe(200)
    expect(deletes).toEqual([paymentId])
    await expect(response.json()).resolves.toEqual({
      ok: true,
    })
  })

  it('returns 400 before auth and Supabase when the id is not a UUID', async () => {
    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: 'pt-payment-1',
      }),
    })

    expect(response.status).toBe(400)
    expect(requireAdminUserMock).not.toHaveBeenCalled()
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'id must be a valid UUID.',
    })
  })

  it('rejects non-admin users', async () => {
    mockForbidden()

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({
        id: paymentId,
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
        id: paymentId,
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
        id: paymentId,
      }),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: `Failed to read PT payment ${paymentId}: select failed`,
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
        id: paymentId,
      }),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: `Failed to delete PT payment ${paymentId}: delete failed`,
    })
  })
})
