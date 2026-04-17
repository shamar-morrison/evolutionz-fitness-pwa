import { afterEach, describe, expect, it, vi } from 'vitest'
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
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET } from '@/app/api/dashboard/stats/route'

type QuerySignature =
  | 'active'
  | 'expired'
  | 'expiringSoon'
  | 'signedUpThisMonth'
  | 'expiredThisMonth'

type RecordedQuery = {
  signature: QuerySignature
  filters: {
    eq: Array<[string, string]>
    gte: Array<[string, string]>
    lte: Array<[string, string]>
    lt: Array<[string, string]>
    not: Array<[string, string, null]>
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
            lt: [],
            not: [],
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
            lt(column: string, value: string) {
              filters.lt.push([column, value])
              return builder
            },
            not(column: string, operator: string, value: null) {
              filters.not.push([column, operator, value])
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
                  lt: [...filters.lt],
                  not: [...filters.not],
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
  const hasJoinedAtRange =
    filters.gte.some(([column]) => column === 'joined_at') &&
    filters.lte.some(([column]) => column === 'joined_at')
  const hasExpiringWindow =
    filters.gte.some(([column]) => column === 'end_time') &&
    filters.lt.some(([column]) => column === 'end_time')

  if (hasJoinedAtRange) {
    return 'signedUpThisMonth'
  }

  if (statusFilter === 'Expired') {
    return 'expired'
  }

  if (statusFilter === 'Active' && hasExpiringWindow) {
    return 'expiringSoon'
  }

  if (hasExpiringWindow) {
    return 'expiredThisMonth'
  }

  return 'active'
}

describe('GET /api/dashboard/stats', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns aggregated member counts and applies the 7-day expiring window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T10:15:30.000Z'))

    const supabase = createDashboardStatsAdminClient({
      counts: {
        active: 247,
        expired: 38,
        expiringSoon: 12,
        signedUpThisMonth: 19,
        expiredThisMonth: 16,
      },
    })

    getSupabaseAdminClientMock.mockReturnValue(supabase)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      activeMembers: 247,
      expiredMembers: 38,
      expiringSoon: 12,
      signedUpThisMonth: 19,
      expiredThisMonth: 16,
    })

    expect(supabase.queries).toHaveLength(5)

    const activeQuery = supabase.queries.find((query) => query.signature === 'active')
    const expiredQuery = supabase.queries.find((query) => query.signature === 'expired')
    const expiringSoonQuery = supabase.queries.find((query) => query.signature === 'expiringSoon')
    const signedUpThisMonthQuery = supabase.queries.find(
      (query) => query.signature === 'signedUpThisMonth',
    )
    const expiredThisMonthQuery = supabase.queries.find(
      (query) => query.signature === 'expiredThisMonth',
    )

    expect(activeQuery?.filters.eq).toEqual([['status', 'Active']])
    expect(expiredQuery?.filters.eq).toEqual([['status', 'Expired']])
    expect(expiringSoonQuery?.filters.eq).toEqual([['status', 'Active']])
    expect(expiringSoonQuery?.filters.gte).toEqual([['end_time', '2026-04-02T00:00:00-05:00']])
    expect(expiringSoonQuery?.filters.lt).toEqual([['end_time', '2026-04-10T00:00:00-05:00']])
    expect(signedUpThisMonthQuery?.filters.not).toEqual([['joined_at', 'is', null]])
    expect(signedUpThisMonthQuery?.filters.gte).toEqual([['joined_at', '2026-04-01']])
    expect(signedUpThisMonthQuery?.filters.lte).toEqual([['joined_at', '2026-04-30']])
    expect(expiredThisMonthQuery?.filters.gte).toEqual([['end_time', '2026-04-01T00:00:00-05:00']])
    expect(expiredThisMonthQuery?.filters.lt).toEqual([['end_time', '2026-05-01T00:00:00-05:00']])
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
      signedUpThisMonth: 0,
      expiredThisMonth: 0,
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
