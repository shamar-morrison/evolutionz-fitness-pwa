import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockUnauthorized, resetServerAuthMocks } from '@/tests/support/server-auth'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
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

import { GET, POST } from '@/app/api/cards/route'

function createCardsInventoryAdminClient({
  rows = [],
  error = null,
}: {
  rows?: Array<{ card_no: string | null; card_code: string | null; created_at: string | null }>
  error?: { message: string } | null
} = {}) {
  const orderCalls: Array<[string, { ascending: boolean }]> = []

  return {
    orderCalls,
    client: {
      from(table: string) {
        expect(table).toBe('cards')

        return {
          select(columns: string) {
            expect(columns).toBe('card_no, card_code, created_at')

            return {
              eq(column: string, value: string) {
                expect(column).toBe('status')
                expect(value).toBe('available')

                return {
                  order(orderColumn: string, options: { ascending: boolean }) {
                    orderCalls.push([orderColumn, options])

                    if (orderColumn !== 'created_at') {
                      throw new Error(`Unexpected first order column: ${orderColumn}`)
                    }

                    return {
                      order(secondOrderColumn: string, secondOptions: { ascending: boolean }) {
                        orderCalls.push([secondOrderColumn, secondOptions])

                        return Promise.resolve({
                          data: rows,
                          error,
                        })
                      },
                    }
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

function createCardsCreateAdminClient({
  result = {
    data: {
      card_no: '1234567890',
      card_code: 'N39',
    },
    error: null,
  },
}: {
  result?: {
    data: { card_no: string; card_code: string | null } | null
    error: { message: string; code?: string | null } | null
  }
} = {}) {
  const insertedRows: Array<{
    card_no: string
    card_code: string
    status: 'available'
    employee_no: null
    lost_at: null
  }> = []

  return {
    insertedRows,
    client: {
      from(table: string) {
        expect(table).toBe('cards')

        return {
          insert(values: {
            card_no: string
            card_code: string
            status: 'available'
            employee_no: null
            lost_at: null
          }) {
            insertedRows.push(values)

            return {
              select(columns: string) {
                expect(columns).toBe('card_no, card_code')

                return {
                  maybeSingle() {
                    return Promise.resolve(result)
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

describe('/api/cards', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  describe('GET', () => {
    it('returns available cards ordered by created_at desc then card_no asc', async () => {
      const { client, orderCalls } = createCardsInventoryAdminClient({
        rows: [
          {
            card_no: ' 0102857149 ',
            card_code: ' A18 ',
            created_at: '2026-05-01T10:00:00.000Z',
          },
          {
            card_no: '0104620061',
            card_code: null,
            created_at: '2026-04-30T10:00:00.000Z',
          },
          {
            card_no: '',
            card_code: 'N39',
            created_at: '2026-04-29T10:00:00.000Z',
          },
        ],
      })
      getSupabaseAdminClientMock.mockReturnValue(client)

      const response = await GET()

      expect(response.status).toBe(200)
      expect(orderCalls).toEqual([
        ['created_at', { ascending: false }],
        ['card_no', { ascending: true }],
      ])
      await expect(response.json()).resolves.toEqual({
        ok: true,
        cards: [
          {
            cardNo: '0102857149',
            cardCode: 'A18',
            createdAt: '2026-05-01T10:00:00.000Z',
          },
          {
            cardNo: '0104620061',
            cardCode: null,
            createdAt: '2026-04-30T10:00:00.000Z',
          },
        ],
      })
    })

    it('passes through auth failures', async () => {
      mockUnauthorized()

      const response = await GET()

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({
        error: 'Unauthorized',
      })
    })

    it('returns 500 when reading cards fails', async () => {
      getSupabaseAdminClientMock.mockReturnValue(
        createCardsInventoryAdminClient({
          error: { message: 'select exploded' },
        }).client,
      )

      const response = await GET()

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: 'Failed to read cards: select exploded',
      })
    })
  })

  describe('POST', () => {
    it('creates an available manual card for admins', async () => {
      const { client, insertedRows } = createCardsCreateAdminClient()
      getSupabaseAdminClientMock.mockReturnValue(client)

      const response = await POST(
        new Request('http://localhost/api/cards', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            card_no: ' 1234567890 ',
            card_code: ' N39 ',
          }),
        }),
      )

      expect(response.status).toBe(201)
      expect(insertedRows).toEqual([
        {
          card_no: '1234567890',
          card_code: 'N39',
          status: 'available',
          employee_no: null,
          lost_at: null,
        },
      ])
      await expect(response.json()).resolves.toEqual({
        ok: true,
        card: {
          cardNo: '1234567890',
          cardCode: 'N39',
        },
      })
    })

    it('returns 409 when the card number already exists', async () => {
      getSupabaseAdminClientMock.mockReturnValue(
        createCardsCreateAdminClient({
          result: {
            data: null,
            error: {
              message: 'duplicate key value violates unique constraint',
              code: '23505',
            },
          },
        }).client,
      )

      const response = await POST(
        new Request('http://localhost/api/cards', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            card_no: '1234567890',
            card_code: 'N39',
          }),
        }),
      )

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: 'A card with this number already exists.',
      })
    })

    it('returns 400 for blank card fields', async () => {
      const response = await POST(
        new Request('http://localhost/api/cards', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            card_no: '   ',
            card_code: '   ',
          }),
        }),
      )

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toMatchObject({
        ok: false,
      })
      expect(body.error).toContain('Card number is required.')
      expect(body.error).toContain('Card code is required.')
    })

    it('passes through auth failures', async () => {
      mockUnauthorized()

      const response = await POST(
        new Request('http://localhost/api/cards', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            card_no: '1234567890',
            card_code: 'N39',
          }),
        }),
      )

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({
        error: 'Unauthorized',
      })
    })
  })
})
