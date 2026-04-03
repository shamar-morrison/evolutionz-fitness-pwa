import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { GET } from '@/app/api/members/[id]/events/route'

type FakeAccessControlClientOptions = NonNullable<
  Parameters<typeof createFakeAccessControlClient>[0]
>

function createMemberEventsAdminClient({
  memberRow = { employee_no: '000611' },
  memberError = null,
  insertResult,
  pollResults,
}: {
  memberRow?: { employee_no: string | null } | null
  memberError?: { message: string } | null
  insertResult?: FakeAccessControlClientOptions['insertResult']
  pollResults?: FakeAccessControlClientOptions['pollResults']
} = {}) {
  const { client: accessControlClient, insertedJobs } = createFakeAccessControlClient({
    insertResult,
    pollResults,
  })

  return {
    insertedJobs,
    client: {
      from(table: string) {
        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe('employee_no')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBeDefined()

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: memberRow,
                        error: memberError,
                      })
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'access_control_jobs') {
          return accessControlClient.from('access_control_jobs')
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('GET /api/members/[id]/events', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('queues probe and fetch get_member_events jobs for page 0 and returns member events latest-first', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    const { client, insertedJobs } = createMemberEventsAdminClient({
      memberRow: { employee_no: ' 000611 ' },
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: {
              events: [],
              totalMatches: 41,
            },
            error: null,
          },
          error: null,
        },
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: {
              events: [
                {
                  time: '2025-03-01T10:00:00+08:00',
                  major: 5,
                  minor: 1,
                  cardNo: '0102857147',
                },
                {
                  time: '2025-03-03T16:25:49+08:00',
                  major: 5,
                  minor: 1,
                  cardNo: '0102857149',
                },
                {
                  time: '2025-03-04T18:00:00+08:00',
                  major: 5,
                  minor: 75,
                  cardNo: '0100000001',
                },
                {
                  time: 'not-a-date',
                  major: 5,
                  minor: 2,
                  cardNo: '0100000000',
                },
              ],
              totalMatches: 41,
            },
            error: null,
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/members/member-1/events?page=0&limit=10'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'get_member_events',
        payload: {
          employeeNoString: '000611',
          maxResults: 1,
          searchResultPosition: 0,
          searchID: '1700000000000',
        },
      },
      {
        type: 'get_member_events',
        payload: {
          employeeNoString: '000611',
          maxResults: 10,
          searchResultPosition: 31,
          searchID: '1700000000000',
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      events: [
        {
          time: '2025-03-04T18:00:00-05:00',
          status: 'denied_not_in_whitelist',
          major: 5,
          minor: 75,
          cardNo: '0100000001',
        },
        {
          time: '2025-03-03T16:25:49-05:00',
          status: 'success',
          major: 5,
          minor: 1,
          cardNo: '0102857149',
        },
        {
          time: '2025-03-01T10:00:00-05:00',
          status: 'success',
          major: 5,
          minor: 1,
          cardNo: '0102857147',
        },
      ],
      totalMatches: 41,
    })
  })

  it('queues probe and fetch get_member_events jobs for later pages using reverse pagination offsets', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    const { client, insertedJobs } = createMemberEventsAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: {
              events: [],
              totalMatches: 41,
            },
            error: null,
          },
          error: null,
        },
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: {
              events: [
                {
                  time: '2025-03-01T09:00:00+08:00',
                  major: 5,
                  minor: 1,
                  cardNo: '0102857149',
                },
                {
                  time: '2025-03-01T09:30:00+08:00',
                  major: 5,
                  minor: 3,
                  cardNo: '0100000002',
                },
              ],
              totalMatches: 41,
            },
            error: null,
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/members/member-1/events?page=1&limit=10'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'get_member_events',
        payload: {
          employeeNoString: '000611',
          maxResults: 1,
          searchResultPosition: 0,
          searchID: '1700000000000',
        },
      },
      {
        type: 'get_member_events',
        payload: {
          employeeNoString: '000611',
          maxResults: 10,
          searchResultPosition: 21,
          searchID: '1700000000000',
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      events: [
        {
          time: '2025-03-01T09:30:00-05:00',
          status: 'denied_expired',
          major: 5,
          minor: 3,
          cardNo: '0100000002',
        },
        {
          time: '2025-03-01T09:00:00-05:00',
          status: 'success',
          major: 5,
          minor: 1,
          cardNo: '0102857149',
        },
      ],
      totalMatches: 41,
    })
  })

  it('uses a partial reverse page fetch when the last page has fewer than the page size', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    const { client, insertedJobs } = createMemberEventsAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: {
              events: [],
              totalMatches: 25,
            },
            error: null,
          },
          error: null,
        },
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: {
              events: [
                {
                  time: '2025-03-01T06:00:00+08:00',
                  major: 5,
                  minor: 1,
                  cardNo: '0100000005',
                },
                {
                  time: '2025-03-01T07:00:00+08:00',
                  major: 5,
                  minor: 2,
                  cardNo: '0100000006',
                },
              ],
              totalMatches: 25,
            },
            error: null,
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/members/member-1/events?page=2&limit=10'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'get_member_events',
        payload: {
          employeeNoString: '000611',
          maxResults: 1,
          searchResultPosition: 0,
          searchID: '1700000000000',
        },
      },
      {
        type: 'get_member_events',
        payload: {
          employeeNoString: '000611',
          maxResults: 5,
          searchResultPosition: 0,
          searchID: '1700000000000',
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      events: [
        {
          time: '2025-03-01T07:00:00-05:00',
          status: 'denied_invalid_card',
          major: 5,
          minor: 2,
          cardNo: '0100000006',
        },
        {
          time: '2025-03-01T06:00:00-05:00',
          status: 'success',
          major: 5,
          minor: 1,
          cardNo: '0100000005',
        },
      ],
      totalMatches: 25,
    })
  })

  it('returns empty events for out-of-range pages after the shared-searchID probe', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    const { client, insertedJobs } = createMemberEventsAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: {
              events: [],
              totalMatches: 25,
            },
            error: null,
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/members/member-1/events?page=3&limit=10'),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'get_member_events',
        payload: {
          employeeNoString: '000611',
          maxResults: 1,
          searchResultPosition: 0,
          searchID: '1700000000000',
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      events: [],
      totalMatches: 25,
    })
  })

  it('returns 404 when the member does not exist', async () => {
    const { client, insertedJobs } = createMemberEventsAdminClient({
      memberRow: null,
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request('http://localhost/api/members/missing/events'), {
      params: Promise.resolve({ id: 'missing' }),
    })

    expect(insertedJobs).toEqual([])
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Member not found.',
    })
  })

  it('returns 400 when page or limit are invalid', async () => {
    const response = await GET(new Request('http://localhost/api/members/member-1/events?page=-1&limit=abc'), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'page and limit must be non-negative integers.',
    })
  })

  it('returns 502 when get_member_events fails', async () => {
    const { client } = createMemberEventsAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Member event search failed.',
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request('http://localhost/api/members/member-1/events'), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      jobId: 'job-123',
      error: 'Member event search failed.',
    })
  })

  it('returns 504 when get_member_events times out', async () => {
    vi.useFakeTimers()

    const { client } = createMemberEventsAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'pending',
            result: null,
            error: null,
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const responsePromise = GET(new Request('http://localhost/api/members/member-1/events'), {
      params: Promise.resolve({ id: 'member-1' }),
    })
    let resolvedResponse: Response | null = null

    responsePromise.then((response) => {
      resolvedResponse = response
    })

    await vi.advanceTimersByTimeAsync(10_500)
    expect(resolvedResponse).toBeNull()

    await vi.advanceTimersByTimeAsync(60_500)

    const response = await responsePromise

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({
      jobId: 'job-123',
      error: 'Fetch member events request timed out after 60 seconds.',
    })
  })
})
