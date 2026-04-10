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

import { POST } from '@/app/api/cards/manual/route'

function createManualCardsAdminClient({
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

describe('POST /api/cards/manual', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('creates an available manual card for admins', async () => {
    const { client, insertedRows } = createManualCardsAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/cards/manual', {
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
      createManualCardsAdminClient({
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
      new Request('http://localhost/api/cards/manual', {
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
      new Request('http://localhost/api/cards/manual', {
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
      new Request('http://localhost/api/cards/manual', {
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

  it('returns 500 when the insert fails unexpectedly', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createManualCardsAdminClient({
        result: {
          data: null,
          error: {
            message: 'insert exploded',
          },
        },
      }).client,
    )

    const response = await POST(
      new Request('http://localhost/api/cards/manual', {
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

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to create manual card: insert exploded',
    })
  })
})
