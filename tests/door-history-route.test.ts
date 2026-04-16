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

import { GET } from '@/app/api/door-history/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

type DoorHistoryCacheRow = {
  cache_date: string | null
  events: unknown
  fetched_at: string | null
  total_matches: number | null
}

type CardRow = {
  card_no: string | null
  card_code: string | null
}

type MemberRow = {
  card_no: string | null
  name: string | null
}

function createDoorHistoryReadClient({
  cacheRow = {
    cache_date: '2026-04-14',
    events: [
      {
        cardNo: '0102857149',
        cardCode: null,
        memberName: null,
        time: '2026-04-14T07:15:00-05:00',
        accessGranted: false,
        doorName: null,
        eventType: 'Invalid card',
      },
      {
        cardNo: '0102857149',
        cardCode: null,
        memberName: null,
        time: '2026-04-14T09:30:00-05:00',
        accessGranted: true,
        doorName: 'Main Door',
        eventType: 'Access granted',
      },
    ],
    fetched_at: '2026-04-15T12:34:56.000Z',
    total_matches: 2,
  } satisfies DoorHistoryCacheRow | null,
  cacheError = null,
  cards = [{ card_no: '0102857149', card_code: 'A18' }] satisfies CardRow[],
  cardsError = null,
  members = [{ card_no: '0102857149', name: 'A18 Jordan Miles' }] satisfies MemberRow[],
  membersError = null,
}: {
  cacheRow?: DoorHistoryCacheRow | null
  cacheError?: { message: string } | null
  cards?: CardRow[]
  cardsError?: { message: string } | null
  members?: MemberRow[]
  membersError?: { message: string } | null
} = {}) {
  const recorded = {
    cacheDates: [] as string[],
    cardNos: [] as string[][],
  }

  return {
    recorded,
    client: {
      from(table: string) {
        if (table === 'door_history_cache') {
          return {
            select(columns: string) {
              expect(columns).toBe('cache_date, events, fetched_at, total_matches')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('cache_date')
                  recorded.cacheDates.push(value)

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: cacheRow,
                        error: cacheError,
                      } satisfies QueryResult<DoorHistoryCacheRow>)
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
              expect(columns).toBe('card_no, card_code')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('card_no')
                  recorded.cardNos.push(values)

                  return Promise.resolve({
                    data: cards,
                    error: cardsError,
                  } satisfies QueryResult<CardRow[]>)
                },
              }
            },
          }
        }

        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe('card_no, name')

              return {
                in(column: string, values: string[]) {
                  expect(column).toBe('card_no')
                  recorded.cardNos.push(values)

                  return Promise.resolve({
                    data: members,
                    error: membersError,
                  } satisfies QueryResult<MemberRow[]>)
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('GET /api/door-history', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns cached events enriched with card codes and cleaned member names', async () => {
    const { client, recorded } = createDoorHistoryReadClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request('http://localhost/api/door-history?date=2026-04-14'))

    expect(response.status).toBe(200)
    expect(recorded.cacheDates).toEqual(['2026-04-14'])
    expect(recorded.cardNos).toEqual([['0102857149'], ['0102857149']])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      events: [
        {
          cardNo: '0102857149',
          cardCode: 'A18',
          memberName: 'Jordan Miles',
          time: '2026-04-14T09:30:00-05:00',
          accessGranted: true,
          doorName: 'Main Door',
          eventType: 'Access granted',
        },
        {
          cardNo: '0102857149',
          cardCode: 'A18',
          memberName: 'Jordan Miles',
          time: '2026-04-14T07:15:00-05:00',
          accessGranted: false,
          doorName: null,
          eventType: 'Invalid card',
        },
      ],
      fetchedAt: '2026-04-15T12:34:56.000Z',
      totalMatches: 2,
      cacheDate: '2026-04-14',
    })
  })

  it('returns an empty payload when no cache exists and defaults to today in Jamaica', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T13:00:00.000Z'))

    const { client, recorded } = createDoorHistoryReadClient({
      cacheRow: null,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request('http://localhost/api/door-history'))

    expect(response.status).toBe(200)
    expect(recorded.cacheDates).toEqual(['2026-04-15'])
    expect(recorded.cardNos).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      events: [],
      fetchedAt: null,
      totalMatches: 0,
      cacheDate: '2026-04-15',
    })
  })

  it('returns 400 for invalid date filters', async () => {
    const response = await GET(new Request('http://localhost/api/door-history?date=not-a-date'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'date must use YYYY-MM-DD format.',
    })
  })
})
