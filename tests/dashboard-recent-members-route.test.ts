import { afterEach, describe, expect, it, vi } from 'vitest'
import { DASHBOARD_MEMBER_SELECT } from '@/lib/dashboard-members'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { GET } from '@/app/api/dashboard/recent-members/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function createRecentDashboardAdminClient({
  memberRows = [
    {
      id: 'member-1',
      employee_no: '000611',
      name: ' A18 Jane Doe ',
      card_no: '0102857149',
      type: 'General',
      status: 'Active',
      end_time: '2026-04-09T23:59:59Z',
      created_at: '2026-04-01T10:00:00Z',
    },
  ],
  memberError = null,
  cardRows = [{ card_no: '0102857149', card_code: 'A18', status: 'assigned', lost_at: null }],
  cardsError = null,
}: {
  memberRows?: Array<Record<string, unknown>>
  memberError?: { message: string } | null
  cardRows?: Array<Record<string, unknown>>
  cardsError?: { message: string } | null
} = {}) {
  const recorded = {
    order: null as null | { column: string; ascending: boolean },
    limit: null as number | null,
    cardNos: [] as string[],
  }

  return {
    recorded,
    from(table: string) {
      if (table === 'members') {
        return {
          select(columns: string) {
            expect(columns).toBe(DASHBOARD_MEMBER_SELECT)

            return {
              order(column: string, options: { ascending: boolean }) {
                recorded.order = {
                  column,
                  ascending: options.ascending,
                }

                return {
                  limit(value: number) {
                    recorded.limit = value

                    return Promise.resolve({
                      data: memberRows,
                      error: memberError,
                    } satisfies QueryResult<Array<Record<string, unknown>>>)
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'cards') {
        return {
          select(columns: string) {
            expect(columns).toBe('card_no, card_code, status, lost_at')

            return {
              in(column: string, values: string[]) {
                expect(column).toBe('card_no')
                recorded.cardNos = values

                return Promise.resolve({
                  data: cardRows,
                  error: cardsError,
                } satisfies QueryResult<Array<Record<string, unknown>>>)
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe('GET /api/dashboard/recent-members', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('returns the most recently created members with clean names and an 8-row limit', async () => {
    const supabase = createRecentDashboardAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(supabase)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      members: [
        {
          id: 'member-1',
          name: 'Jane Doe',
          type: 'General',
          status: 'Active',
          endTime: '2026-04-09T23:59:59.000Z',
        },
      ],
    })
    expect(supabase.recorded.order).toEqual({
      column: 'created_at',
      ascending: false,
    })
    expect(supabase.recorded.limit).toBe(8)
    expect(supabase.recorded.cardNos).toEqual(['0102857149'])
  })

  it('returns 500 when the members query fails', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createRecentDashboardAdminClient({
        memberError: { message: 'select exploded' },
      }),
    )

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to read recent dashboard members: select exploded',
    })
  })
})
