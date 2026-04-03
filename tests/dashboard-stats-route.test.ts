import { afterEach, describe, expect, it, vi } from 'vitest'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { GET } from '@/app/api/dashboard/stats/route'

type QuerySignature = 'active' | 'expired' | 'expiringSoon'

type RecordedQuery = {
  signature: QuerySignature
  filters: {
    eq: Array<[string, string]>
    gte: Array<[string, string]>
    lte: Array<[string, string]>
  }
}

function createDashboardStatsAdminClient({
  counts = {},
  errorFor = null,
}: {
  counts?: Partial<Record<QuerySignature, number | null>>
  errorFor?: QuerySignature | null
} = {}) {
  const queries: RecordedQuery[] = []

  return {
    queries,
    from(table: string) {
      if (table !== 'members') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select(columns: string, options: { count: 'exact'; head: true }) {
          expect(columns).toBe('id')
          expect(options).toEqual({ count: 'exact', head: true })

          const filters: RecordedQuery['filters'] = {
            eq: [],
            gte: [],
            lte: [],
          }

          const builder = {
            eq(column: string, value: string) {
              filters.eq.push([column, value])
              return builder
            },
            gte(column: string, value: string) {
              filters.gte.push([column, value])
              return builder
            },
            lte(column: string, value: string) {
              filters.lte.push([column, value])
              return builder
            },
            then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
              const signature = getQuerySignature(filters)
              queries.push({
                signature,
                filters: {
                  eq: [...filters.eq],
                  gte: [...filters.gte],
                  lte: [...filters.lte],
                },
              })

              const result =
                errorFor === signature
                  ? {
                      count: null,
                      error: { message: 'select exploded' },
                    }
                  : {
                      count: counts[signature] ?? null,
                      error: null,
                    }

              return Promise.resolve(result).then(onFulfilled, onRejected)
            },
          }

          return builder
        },
      }
    },
  }
}

function getQuerySignature(filters: RecordedQuery['filters']): QuerySignature {
  const statusFilter = filters.eq.find(([column]) => column === 'status')?.[1]
  const hasExpiringWindow =
    filters.gte.some(([column]) => column === 'end_time') &&
    filters.lte.some(([column]) => column === 'end_time')

  if (statusFilter === 'Expired') {
    return 'expired'
  }

  if (statusFilter === 'Active' && hasExpiringWindow) {
    return 'expiringSoon'
  }

  return 'active'
}

describe('GET /api/dashboard/stats', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('returns aggregated member counts and applies the 7-day expiring window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T10:15:30.000Z'))

    const supabase = createDashboardStatsAdminClient({
      counts: {
        active: 247,
        expired: 38,
        expiringSoon: 12,
      },
    })

    getSupabaseAdminClientMock.mockReturnValue(supabase)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      activeMembers: 247,
      expiredMembers: 38,
      expiringSoon: 12,
    })

    expect(supabase.queries).toHaveLength(3)

    const activeQuery = supabase.queries.find((query) => query.signature === 'active')
    const expiredQuery = supabase.queries.find((query) => query.signature === 'expired')
    const expiringSoonQuery = supabase.queries.find((query) => query.signature === 'expiringSoon')

    expect(activeQuery?.filters.eq).toEqual([['status', 'Active']])
    expect(expiredQuery?.filters.eq).toEqual([['status', 'Expired']])
    expect(expiringSoonQuery?.filters.eq).toEqual([['status', 'Active']])
    expect(expiringSoonQuery?.filters.gte).toEqual([['end_time', '2026-04-02T10:15:30.000Z']])
    expect(expiringSoonQuery?.filters.lte).toEqual([['end_time', '2026-04-09T10:15:30.000Z']])
  })

  it('coerces null Supabase counts to zero', async () => {
    const supabase = createDashboardStatsAdminClient()

    getSupabaseAdminClientMock.mockReturnValue(supabase)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      activeMembers: 0,
      expiredMembers: 0,
      expiringSoon: 0,
    })
  })

  it('returns 500 when any count query fails', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createDashboardStatsAdminClient({
        errorFor: 'expired',
      }),
    )

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to read expired member count: select exploded',
    })
  })
})
