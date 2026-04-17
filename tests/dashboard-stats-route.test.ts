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
  | 'activeMembers'
  | 'totalExpiredMembers'
  | 'expiringSoon'
  | 'signupsByMonth'
  | 'expiryCounts'
  | 'activeMembersLastMonth'

type RecordedQuery = {
  signature: QuerySignature
  table: 'members'
  columns: string
  head: boolean
  filters: {
    eq: Array<[string, string]>
    gte: Array<[string, string]>
    lte: Array<[string, string]>
    lt: Array<[string, string]>
    not: Array<[string, string, null]>
  }
}

function compareValues(left: unknown, right: string, operator: 'gte' | 'lte' | 'lt') {
  if (left === null || left === undefined) {
    return false
  }

  const normalizedLeft = String(left)

  if (operator === 'gte') {
    return normalizedLeft >= right
  }

  if (operator === 'lte') {
    return normalizedLeft <= right
  }

  return normalizedLeft < right
}

function getQuerySignature({
  columns,
  head,
  filters,
}: Omit<RecordedQuery, 'signature'>): QuerySignature {
  if (head) {
    const statusFilter = filters.eq.find(([column]) => column === 'status')?.[1]
    const hasEndTimeWindow =
      filters.gte.some(([column]) => column === 'end_time') &&
      filters.lt.some(([column]) => column === 'end_time')

    if (statusFilter === 'Active' && hasEndTimeWindow) {
      return 'expiringSoon'
    }

    if (statusFilter === 'Expired') {
      return 'totalExpiredMembers'
    }

    return 'activeMembers'
  }

  if (columns === 'joined_at') {
    return 'signupsByMonth'
  }

  if (columns === 'end_time') {
    return 'expiryCounts'
  }

  return 'activeMembersLastMonth'
}

function createDashboardStatsAdminClient({
  members = [],
  errorFor = null,
}: {
  members?: Array<Record<string, unknown>>
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
        select(columns: string, options?: { count: 'exact'; head: true }) {
          let data = [...members]
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
              data = data.filter((row) => String(row[column]) === value)
              return builder
            },
            gte(column: string, value: string) {
              filters.gte.push([column, value])
              data = data.filter((row) => compareValues(row[column], value, 'gte'))
              return builder
            },
            lte(column: string, value: string) {
              filters.lte.push([column, value])
              data = data.filter((row) => compareValues(row[column], value, 'lte'))
              return builder
            },
            lt(column: string, value: string) {
              filters.lt.push([column, value])
              data = data.filter((row) => compareValues(row[column], value, 'lt'))
              return builder
            },
            not(column: string, operator: string, value: null) {
              filters.not.push([column, operator, value])

              if (operator === 'is' && value === null) {
                data = data.filter((row) => row[column] !== null && row[column] !== undefined)
              }
              return builder
            },
            then(
              onFulfilled: (value: unknown) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) {
              const query = {
                table,
                columns,
                head: Boolean(options?.head),
                filters: {
                  eq: [...filters.eq],
                  gte: [...filters.gte],
                  lte: [...filters.lte],
                  lt: [...filters.lt],
                  not: [...filters.not],
                },
              } satisfies Omit<RecordedQuery, 'signature'>

              const signature = getQuerySignature(query)
              queries.push({
                signature,
                ...query,
              })

              const result =
                errorFor === signature
                  ? {
                      data: null,
                      count: null,
                      error: { message: 'select exploded' },
                    }
                  : options?.head
                    ? {
                        count: data.length,
                        error: null,
                      }
                    : {
                        data,
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

describe('GET /api/dashboard/stats', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns dashboard metrics with Jamaica-aware month bucketing', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T10:15:30.000Z'))

    const supabase = createDashboardStatsAdminClient({
      members: [
        {
          id: 'member-a',
          status: 'Active',
          begin_time: '2026-01-10T00:00:00Z',
          end_time: '2026-06-15T23:59:59Z',
          joined_at: '2025-11-10',
        },
        {
          id: 'member-b',
          status: 'Active',
          begin_time: '2026-03-15T00:00:00Z',
          end_time: '2026-04-05T00:00:00-05:00',
          joined_at: '2026-03-15',
        },
        {
          id: 'member-c',
          status: 'Active',
          begin_time: '2026-04-01T08:00:00Z',
          end_time: '2026-07-01T00:00:00Z',
          joined_at: '2026-04-01',
        },
        {
          id: 'member-d',
          status: 'Expired',
          begin_time: '2026-02-01T00:00:00Z',
          end_time: '2026-04-15T12:00:00Z',
          joined_at: '2026-02-10',
        },
        {
          id: 'member-e',
          status: 'Expired',
          begin_time: '2026-03-01T00:00:00Z',
          end_time: '2026-04-01T03:30:00Z',
          joined_at: '2026-03-20',
        },
        {
          id: 'member-f',
          status: 'Active',
          begin_time: '2026-01-20T00:00:00Z',
          end_time: '2026-04-12T00:00:00-05:00',
          joined_at: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(supabase)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      activeMembers: 4,
      activeMembersLastMonth: 5,
      totalExpiredMembers: 2,
      expiringSoon: 1,
      signedUpThisMonth: 1,
      signupsByMonth: [
        { month: '2025-11', count: 1 },
        { month: '2025-12', count: 0 },
        { month: '2026-01', count: 0 },
        { month: '2026-02', count: 1 },
        { month: '2026-03', count: 2 },
        { month: '2026-04', count: 1 },
      ],
      expiredThisMonth: 3,
      expiredThisMonthLastMonth: 1,
    })

    expect(supabase.queries).toHaveLength(6)

    const activeQuery = supabase.queries.find((query) => query.signature === 'activeMembers')
    const totalExpiredQuery = supabase.queries.find(
      (query) => query.signature === 'totalExpiredMembers',
    )
    const expiringSoonQuery = supabase.queries.find((query) => query.signature === 'expiringSoon')
    const signupsQuery = supabase.queries.find((query) => query.signature === 'signupsByMonth')
    const expiryCountsQuery = supabase.queries.find((query) => query.signature === 'expiryCounts')
    const activeLastMonthQuery = supabase.queries.find(
      (query) => query.signature === 'activeMembersLastMonth',
    )

    expect(activeQuery?.filters.eq).toEqual([['status', 'Active']])
    expect(totalExpiredQuery?.filters.eq).toEqual([['status', 'Expired']])
    expect(expiringSoonQuery?.filters.eq).toEqual([['status', 'Active']])
    expect(expiringSoonQuery?.filters.gte).toEqual([['end_time', '2026-04-02T00:00:00-05:00']])
    expect(expiringSoonQuery?.filters.lt).toEqual([['end_time', '2026-04-10T00:00:00-05:00']])
    expect(signupsQuery?.filters.not).toEqual([['joined_at', 'is', null]])
    expect(signupsQuery?.filters.gte).toEqual([['joined_at', '2025-11-01']])
    expect(signupsQuery?.filters.lte).toEqual([['joined_at', '2026-04-30']])
    expect(expiryCountsQuery?.filters.gte).toEqual([['end_time', '2026-03-01T00:00:00-05:00']])
    expect(expiryCountsQuery?.filters.lt).toEqual([['end_time', '2026-05-01T00:00:00-05:00']])
    expect(activeLastMonthQuery?.filters.not).toEqual([['begin_time', 'is', null]])
    expect(activeLastMonthQuery?.filters.lt).toEqual([['begin_time', '2026-04-01T00:00:00-05:00']])
  })

  it('returns zeroed counts and six empty signup buckets when no rows match', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T10:15:30.000Z'))

    getSupabaseAdminClientMock.mockReturnValue(createDashboardStatsAdminClient())

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      activeMembers: 0,
      activeMembersLastMonth: 0,
      totalExpiredMembers: 0,
      expiringSoon: 0,
      signedUpThisMonth: 0,
      signupsByMonth: [
        { month: '2025-11', count: 0 },
        { month: '2025-12', count: 0 },
        { month: '2026-01', count: 0 },
        { month: '2026-02', count: 0 },
        { month: '2026-03', count: 0 },
        { month: '2026-04', count: 0 },
      ],
      expiredThisMonth: 0,
      expiredThisMonthLastMonth: 0,
    })
  })

  it('returns 500 when any dashboard query fails', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createDashboardStatsAdminClient({
        errorFor: 'totalExpiredMembers',
      }),
    )

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to read expired member count: select exploded',
    })
  })
})
