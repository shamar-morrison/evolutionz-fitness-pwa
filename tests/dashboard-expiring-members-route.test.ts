import { afterEach, describe, expect, it, vi } from 'vitest'
import { DASHBOARD_MEMBER_SELECT } from '@/lib/dashboard-members'
import { resetServerAuthMocks } from '@/tests/support/server-auth'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAuthenticatedUser: mod.requireAuthenticatedUserMock,
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET } from '@/app/api/dashboard/expiring-members/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function createExpiringDashboardAdminClient({
  memberRows = [
    {
      id: 'member-2',
      employee_no: '000777',
      name: 'A1 Marcus Brown',
      card_no: '0102857149',
      type: 'Student/BPO',
      status: 'Active',
      end_time: '2026-04-05T23:59:59Z',
      created_at: '2026-03-01T10:00:00Z',
    },
  ],
  memberError = null,
  cardRows = [{ card_no: '0102857149', card_code: 'A1', status: 'assigned', lost_at: null }],
  cardsError = null,
}: {
  memberRows?: Array<Record<string, unknown>>
  memberError?: { message: string } | null
  cardRows?: Array<Record<string, unknown>>
  cardsError?: { message: string } | null
} = {}) {
  const recorded = {
    eq: [] as Array<[string, string]>,
    gte: [] as Array<[string, string]>,
    lt: [] as Array<[string, string]>,
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

            const builder = {
              eq(column: string, value: string) {
                recorded.eq.push([column, value])
                return builder
              },
              gte(column: string, value: string) {
                recorded.gte.push([column, value])
                return builder
              },
              lt(column: string, value: string) {
                recorded.lt.push([column, value])
                return builder
              },
              order(column: string, options: { ascending: boolean }) {
                recorded.order = {
                  column,
                  ascending: options.ascending,
                }
                return builder
              },
              limit(value: number) {
                recorded.limit = value

                return Promise.resolve({
                  data: memberRows,
                  error: memberError,
                } satisfies QueryResult<Array<Record<string, unknown>>>)
              },
            }

            return builder
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

describe('GET /api/dashboard/expiring-members', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns active members expiring in the next 7 days ordered by expiry date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T10:15:30.000Z'))

    const supabase = createExpiringDashboardAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(supabase)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      members: [
        {
          id: 'member-2',
          name: 'Marcus Brown',
          type: 'Student/BPO',
          status: 'Active',
          endTime: '2026-04-05T23:59:59Z',
        },
      ],
    })
    expect(supabase.recorded.eq).toEqual([['status', 'Active']])
    expect(supabase.recorded.gte).toEqual([['end_time', '2026-04-02T00:00:00-05:00']])
    expect(supabase.recorded.lt).toEqual([['end_time', '2026-04-10T00:00:00-05:00']])
    expect(supabase.recorded.order).toEqual({
      column: 'end_time',
      ascending: true,
    })
    expect(supabase.recorded.limit).toBe(8)
    expect(supabase.recorded.cardNos).toEqual(['0102857149'])
  })

  it('returns 500 when the members query fails', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createExpiringDashboardAdminClient({
        memberError: { message: 'select exploded' },
      }),
    )

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to read expiring dashboard members: select exploded',
    })
  })
})
