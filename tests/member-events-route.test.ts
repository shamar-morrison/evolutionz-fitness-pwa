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

  it('queues get_member_events and returns normalized member events', async () => {
    const { client, insertedJobs } = createMemberEventsAdminClient({
      memberRow: { employee_no: ' 000611 ' },
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'done',
            result: {
              events: [
                {
                  time: '2025-03-03T16:25:49+08:00',
                  major: 5,
                  minor: 1,
                  cardNo: '0102857149',
                },
                {
                  time: 'not-a-date',
                  major: 5,
                  minor: 2,
                  cardNo: '0100000000',
                },
              ],
              totalMatches: 2,
            },
            error: null,
          },
          error: null,
        },
      ],
    })

    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(new Request('http://localhost/api/members/member-1/events?page=1&limit=20'), {
      params: Promise.resolve({ id: 'member-1' }),
    })

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'get_member_events',
        payload: {
          employeeNoString: '000611',
          maxResults: 20,
          searchResultPosition: 20,
        },
      },
    ])
    await expect(response.json()).resolves.toEqual({
      events: [
        {
          time: '2025-03-03T16:25:49-05:00',
          status: 'success',
          major: 5,
          minor: 1,
          cardNo: '0102857149',
        },
      ],
      totalMatches: 2,
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
