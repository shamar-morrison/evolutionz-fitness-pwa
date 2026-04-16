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
  id: string
  card_no: string | null
  employee_no: string | null
  name: string | null
}

function createDoorHistoryReadClient({
  cacheRow = {
    cache_date: '2026-04-14',
    events: [
      {
        cardNo: '0102857149',
        employeeNo: null,
        cardCode: null,
        memberName: null,
        time: '2026-04-14T07:15:00-05:00',
        accessGranted: false,
        doorName: null,
        eventType: 'Invalid card',
      },
      {
        cardNo: '0102857149',
        employeeNo: null,
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
  membersByCardNo = [
    { id: 'member-1', card_no: '0102857149', employee_no: '00000611', name: 'A18 Jordan Miles' },
  ] satisfies MemberRow[],
  memberCardLookupError = null,
  membersByEmployeeNo = [] satisfies MemberRow[],
  memberEmployeeLookupError = null,
}: {
  cacheRow?: DoorHistoryCacheRow | null
  cacheError?: { message: string } | null
  cards?: CardRow[]
  cardsError?: { message: string } | null
  membersByCardNo?: MemberRow[]
  memberCardLookupError?: { message: string } | null
  membersByEmployeeNo?: MemberRow[]
  memberEmployeeLookupError?: { message: string } | null
} = {}) {
  const recorded = {
    cacheDates: [] as string[],
    cardNos: [] as string[][],
    memberCardNos: [] as string[][],
    memberEmployeeNos: [] as string[][],
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
              expect(columns).toBe('id, card_no, employee_no, name')

              return {
                in(column: string, values: string[]) {
                  if (column === 'card_no') {
                    recorded.memberCardNos.push(values)

                    return Promise.resolve({
                      data: membersByCardNo,
                      error: memberCardLookupError,
                    } satisfies QueryResult<MemberRow[]>)
                  }

                  if (column === 'employee_no') {
                    recorded.memberEmployeeNos.push(values)

                    return Promise.resolve({
                      data: membersByEmployeeNo,
                      error: memberEmployeeLookupError,
                    } satisfies QueryResult<MemberRow[]>)
                  }

                  throw new Error(`Unexpected members lookup column: ${column}`)
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
    expect(recorded.cardNos).toEqual([['0102857149']])
    expect(recorded.memberCardNos).toEqual([['0102857149']])
    expect(recorded.memberEmployeeNos).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      events: [
        {
          cardNo: '0102857149',
          employeeNo: null,
          cardCode: 'A18',
          memberId: 'member-1',
          memberName: 'Jordan Miles',
          time: '2026-04-14T09:30:00-05:00',
          accessGranted: true,
          doorName: 'Main Door',
          eventType: 'Access granted',
        },
        {
          cardNo: '0102857149',
          employeeNo: null,
          cardCode: 'A18',
          memberId: 'member-1',
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

  it('normalizes older cached events without employeeNo to null', async () => {
    const { client, recorded } = createDoorHistoryReadClient({
      cacheRow: {
        cache_date: '2026-04-14',
        events: [
          {
            cardNo: '',
            cardCode: null,
            memberName: null,
            time: '2026-04-14T09:30:00-05:00',
            accessGranted: true,
            doorName: 'Main Door',
            eventType: 'Access granted',
          },
        ],
        fetched_at: '2026-04-15T12:34:56.000Z',
        total_matches: 1,
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request('http://localhost/api/door-history?date=2026-04-14'))

    expect(response.status).toBe(200)
    expect(recorded.cardNos).toEqual([])
    expect(recorded.memberCardNos).toEqual([])
    expect(recorded.memberEmployeeNos).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      events: [
        {
          cardNo: '',
          employeeNo: null,
          cardCode: null,
          memberId: null,
          memberName: null,
          time: '2026-04-14T09:30:00-05:00',
          accessGranted: true,
          doorName: 'Main Door',
          eventType: 'Access granted',
        },
      ],
      fetchedAt: '2026-04-15T12:34:56.000Z',
      totalMatches: 1,
      cacheDate: '2026-04-14',
    })
  })

  it('falls back to employee number lookups when cardNo is blank and the event employee number is padded', async () => {
    const { client, recorded } = createDoorHistoryReadClient({
      cacheRow: {
        cache_date: '2026-04-14',
        events: [
          {
            cardNo: '',
            employeeNo: '00000302',
            cardCode: null,
            memberName: null,
            time: '2026-04-14T09:30:00-05:00',
            accessGranted: true,
            doorName: 'Main Door',
            eventType: 'Access granted',
          },
        ],
        fetched_at: '2026-04-15T12:34:56.000Z',
        total_matches: 1,
      },
      cards: [],
      membersByCardNo: [],
      membersByEmployeeNo: [{ id: 'member-302', card_no: null, employee_no: '302', name: 'Jordan Miles' }],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request('http://localhost/api/door-history?date=2026-04-14'))

    expect(response.status).toBe(200)
    expect(recorded.cardNos).toEqual([])
    expect(recorded.memberCardNos).toEqual([])
    expect(recorded.memberEmployeeNos).toEqual([['00000302', '302']])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      events: [
        {
          cardNo: '',
          employeeNo: '00000302',
          cardCode: null,
          memberId: 'member-302',
          memberName: 'Jordan Miles',
          time: '2026-04-14T09:30:00-05:00',
          accessGranted: true,
          doorName: 'Main Door',
          eventType: 'Access granted',
        },
      ],
      fetchedAt: '2026-04-15T12:34:56.000Z',
      totalMatches: 1,
      cacheDate: '2026-04-14',
    })
  })

  it('falls back to employee number lookups when cardNo is blank and the event employee number is unpadded', async () => {
    const { client, recorded } = createDoorHistoryReadClient({
      cacheRow: {
        cache_date: '2026-04-14',
        events: [
          {
            cardNo: '',
            employeeNo: '302',
            cardCode: null,
            memberName: null,
            time: '2026-04-14T09:30:00-05:00',
            accessGranted: true,
            doorName: 'Main Door',
            eventType: 'Access granted',
          },
        ],
        fetched_at: '2026-04-15T12:34:56.000Z',
        total_matches: 1,
      },
      cards: [],
      membersByCardNo: [],
      membersByEmployeeNo: [{ id: 'member-302-padded', card_no: null, employee_no: '00000302', name: 'Jordan Miles' }],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request('http://localhost/api/door-history?date=2026-04-14'))

    expect(response.status).toBe(200)
    expect(recorded.cardNos).toEqual([])
    expect(recorded.memberCardNos).toEqual([])
    expect(recorded.memberEmployeeNos).toEqual([['302', '00000302']])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      events: [
        {
          cardNo: '',
          employeeNo: '302',
          cardCode: null,
          memberId: 'member-302-padded',
          memberName: 'Jordan Miles',
          time: '2026-04-14T09:30:00-05:00',
          accessGranted: true,
          doorName: 'Main Door',
          eventType: 'Access granted',
        },
      ],
      fetchedAt: '2026-04-15T12:34:56.000Z',
      totalMatches: 1,
      cacheDate: '2026-04-14',
    })
  })

  it('prefers an exact employee number match over alternate padded forms', async () => {
    const { client, recorded } = createDoorHistoryReadClient({
      cacheRow: {
        cache_date: '2026-04-14',
        events: [
          {
            cardNo: '',
            employeeNo: '00000302',
            cardCode: null,
            memberName: null,
            time: '2026-04-14T09:30:00-05:00',
            accessGranted: true,
            doorName: 'Main Door',
            eventType: 'Access granted',
          },
        ],
        fetched_at: '2026-04-15T12:34:56.000Z',
        total_matches: 1,
      },
      cards: [],
      membersByCardNo: [],
      membersByEmployeeNo: [
        { id: 'member-alt', card_no: null, employee_no: '302', name: 'Alternate Match' },
        { id: 'member-exact', card_no: null, employee_no: '00000302', name: 'Exact Match' },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request('http://localhost/api/door-history?date=2026-04-14'))

    expect(response.status).toBe(200)
    expect(recorded.memberEmployeeNos).toEqual([['00000302', '302']])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      events: [
        {
          cardNo: '',
          employeeNo: '00000302',
          cardCode: null,
          memberId: 'member-exact',
          memberName: 'Exact Match',
          time: '2026-04-14T09:30:00-05:00',
          accessGranted: true,
          doorName: 'Main Door',
          eventType: 'Access granted',
        },
      ],
      fetchedAt: '2026-04-15T12:34:56.000Z',
      totalMatches: 1,
      cacheDate: '2026-04-14',
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
