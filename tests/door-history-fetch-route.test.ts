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

import { POST, maxDuration } from '@/app/api/door-history/fetch/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

type JobRecord = {
  id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  result: unknown
  error: string | null
}

function createDoorHistoryFetchClient({
  insertResult = {
    data: { id: 'job-123' },
    error: null,
  } satisfies QueryResult<{ id: string }>,
  pollResults = [
    {
      data: {
        id: 'job-123',
        status: 'done',
        result: {
          totalMatches: '2',
          events: [
            {
              time: '2026-04-14T09:30:00+08:00',
              cardNo: '0102857149',
              minor: '1',
              doorName: 'Main Door',
            },
            {
              time: '2026-04-14T07:15:00+08:00',
              cardNo: '0100000001',
              minor: '2',
            },
          ],
        },
        error: null,
      },
      error: null,
    } satisfies QueryResult<JobRecord>,
  ],
  upsertResult = {
    error: null,
  },
}: {
  insertResult?: QueryResult<{ id: string }>
  pollResults?: QueryResult<JobRecord>[]
  upsertResult?: { error: { message: string } | null }
} = {}) {
  const insertedJobs: Array<{ type: string; payload: unknown }> = []
  const upserts: Array<{
    values: {
      cache_date: string
      events: unknown
      fetched_at: string
      total_matches: number
    }
    options: { onConflict: 'cache_date' }
  }> = []
  let pollIndex = 0

  return {
    insertedJobs,
    upserts,
    client: {
      from(table: string) {
        if (table === 'access_control_jobs') {
          return {
            insert(values: { type: string; payload: unknown }) {
              insertedJobs.push(values)

              return {
                select() {
                  return {
                    single() {
                      return Promise.resolve(insertResult)
                    },
                  }
                },
              }
            },
            select() {
              return {
                eq() {
                  return {
                    maybeSingle() {
                      const result =
                        pollResults[Math.min(pollIndex, pollResults.length - 1)] ?? null

                      pollIndex += 1

                      if (!result) {
                        throw new Error('No poll result configured.')
                      }

                      return Promise.resolve(result)
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'door_history_cache') {
          return {
            upsert(
              values: {
                cache_date: string
                events: unknown
                fetched_at: string
                total_matches: number
              },
              options: { onConflict: 'cache_date' },
            ) {
              upserts.push({ values, options })
              return Promise.resolve(upsertResult)
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('POST /api/door-history/fetch', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('exports maxDuration = 60', () => {
    expect(maxDuration).toBe(60)
  })

  it('creates get_door_history with exact Jamaica bounds, caches normalized events, and returns the parsed payload', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:34:56.000Z'))

    const { client, insertedJobs, upserts } = createDoorHistoryFetchClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/door-history/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: '2026-04-14' }),
      }),
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'get_door_history',
        payload: {
          startTime: '2026-04-14T00:00:00-05:00',
          endTime: '2026-04-15T00:00:00-05:00',
        },
      },
    ])
    expect(upserts).toEqual([
      {
        values: {
          cache_date: '2026-04-14',
          events: [
            {
              cardNo: '0102857149',
              cardCode: null,
              memberName: null,
              time: '2026-04-14T09:30:00-05:00',
              accessGranted: true,
              doorName: 'Main Door',
              eventType: 'Access granted',
            },
            {
              cardNo: '0100000001',
              cardCode: null,
              memberName: null,
              time: '2026-04-14T07:15:00-05:00',
              accessGranted: false,
              doorName: null,
              eventType: 'Invalid card',
            },
          ],
          fetched_at: '2026-04-15T12:34:56.000Z',
          total_matches: 2,
        },
        options: {
          onConflict: 'cache_date',
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      events: [
        {
          cardNo: '0102857149',
          cardCode: null,
          memberName: null,
          time: '2026-04-14T09:30:00-05:00',
          accessGranted: true,
          doorName: 'Main Door',
          eventType: 'Access granted',
        },
        {
          cardNo: '0100000001',
          cardCode: null,
          memberName: null,
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

  it('warns when a bridge refresh takes longer than 45 seconds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:34:56.000Z'))

    const consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pollResults: QueryResult<JobRecord>[] = [
      ...Array.from({ length: 90 }, () => ({
        data: {
          id: 'job-123',
          status: 'processing' as const,
          result: null,
          error: null,
        },
        error: null,
      })),
      {
        data: {
          id: 'job-123',
          status: 'done',
          result: {
            totalMatches: '0',
            events: [],
          },
          error: null,
        },
        error: null,
      },
    ]
    const { client } = createDoorHistoryFetchClient({
      pollResults,
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const responsePromise = POST(
      new Request('http://localhost/api/door-history/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: '2026-04-14' }),
      }),
    )

    await vi.advanceTimersByTimeAsync(45_000)

    const response = await responsePromise

    expect(response.status).toBe(200)
    expect(consoleWarnMock).toHaveBeenCalledWith(
      '[door-history] Refresh bridge job job-123 for 2026-04-14 took 45.0s.',
    )
  })

  it('returns 400 for invalid JSON bodies', async () => {
    const response = await POST(
      new Request('http://localhost/api/door-history/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{',
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid JSON body.',
    })
  })

  it('returns 400 for malformed calendar dates', async () => {
    const response = await POST(
      new Request('http://localhost/api/door-history/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: '2026-02-30' }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'date must be a valid calendar date.',
    })
  })

  it('returns 400 for future dates relative to Jamaica local time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T13:00:00.000Z'))

    const response = await POST(
      new Request('http://localhost/api/door-history/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: '2026-04-16' }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'date cannot be in the future.',
    })
  })

  it('propagates failed bridge jobs without writing cache rows', async () => {
    const { client, insertedJobs, upserts } = createDoorHistoryFetchClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Bridge failed.',
          },
          error: null,
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/door-history/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: '2026-04-14' }),
      }),
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toHaveLength(1)
    expect(upserts).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Bridge failed.',
    })
  })

  it('propagates timed out bridge jobs without writing cache rows', async () => {
    const consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client, upserts } = createDoorHistoryFetchClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'processing',
            result: null,
            error: null,
          },
          error: null,
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:34:56.000Z'))

    const responsePromise = POST(
      new Request('http://localhost/api/door-history/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: '2026-04-14' }),
      }),
    )

    await vi.advanceTimersByTimeAsync(56_000)

    const response = await responsePromise

    expect(response.status).toBe(504)
    expect(upserts).toEqual([])
    expect(consoleWarnMock).toHaveBeenCalledWith(
      '[door-history] Refresh bridge job job-123 for 2026-04-14 took 55.5s and timed out.',
    )
    await expect(response.json()).resolves.toEqual({
      ok: false,
      jobId: 'job-123',
      error: 'Fetch door history request timed out after 55 seconds.',
    })
  })
})
