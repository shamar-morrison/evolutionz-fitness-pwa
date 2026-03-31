import { afterEach, describe, expect, it, vi } from 'vitest'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { GET } from '@/app/api/access/cards/available/route'

function createCardsAdminClient({
  rows = [],
  error = null,
}: {
  rows?: Array<{ card_no: string }>
  error?: { message: string } | null
} = {}) {
  return {
    from(table: string) {
      if (table !== 'cards') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select(columns: string) {
          expect(columns).toBe('card_no')

          return {
            eq(column: string, value: string) {
              expect(column).toBe('status')
              expect(value).toBe('available')

              return {
                order(orderColumn: string, options: { ascending: boolean }) {
                  expect(orderColumn).toBe('card_no')
                  expect(options).toEqual({ ascending: true })

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
}

describe('GET /api/access/cards/available', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('returns normalized available cards from Supabase', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createCardsAdminClient({
        rows: [
          { card_no: '0104620061' },
          { card_no: '0102857149' },
          { card_no: '0102857149' },
        ],
      }),
    )

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      cards: [
        { cardNo: '0102857149' },
        { cardNo: '0104620061' },
      ],
    })
  })

  it('returns 500 when reading available cards fails', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createCardsAdminClient({
        error: { message: 'select exploded' },
      }),
    )

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to read available cards: select exploded',
    })
  })
})
