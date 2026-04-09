import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEMBER_RECORD_SELECT } from '@/lib/members'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'
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

import { POST } from '@/app/api/access/members/[id]/recover-card/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function createRecoverCardAdminClient({
  pollResults,
  detailRows = [
    {
      id: 'member-1',
      employee_no: '000611',
      name: 'A18 Jane Doe',
      card_no: '0102857149',
      type: 'General',
      status: 'Suspended',
      gender: null,
      email: null,
      phone: null,
      remark: null,
      photo_url: null,
      begin_time: '2026-03-30T00:00:00Z',
      end_time: '2026-07-15T23:59:59Z',
      updated_at: '2026-04-01T05:00:00Z',
    },
    {
      id: 'member-1',
      employee_no: '000611',
      name: 'A18 Jane Doe',
      card_no: '0102857149',
      type: 'General',
      status: 'Active',
      gender: null,
      email: null,
      phone: null,
      remark: null,
      photo_url: null,
      begin_time: '2026-03-30T00:00:00Z',
      end_time: '2026-07-15T23:59:59Z',
      updated_at: '2026-04-01T05:05:00Z',
    },
  ],
  cardLookupResults = [
    [
      {
        card_no: '0102857149',
        card_code: 'A18',
        status: 'suspended_lost',
        lost_at: '2026-04-01T05:00:00Z',
      },
    ],
    [{ card_no: '0102857149', card_code: 'A18', status: 'assigned', lost_at: null }],
  ],
  cardUpdateResult = {
    data: { card_no: '0102857149' },
    error: null,
  } satisfies QueryResult<{ card_no: string }>,
  memberUpdateResult = {
    data: { id: 'member-1' },
    error: null,
  } satisfies QueryResult<{ id: string }>,
}: {
  pollResults?: Array<QueryResult<{
    id: string
    status: 'pending' | 'processing' | 'done' | 'failed'
    result: unknown
    error: string | null
  }>>
  detailRows?: Array<Record<string, unknown> | null>
  cardLookupResults?: Array<Array<Record<string, unknown>>>
  cardUpdateResult?: QueryResult<{ card_no: string }>
  memberUpdateResult?: QueryResult<{ id: string }>
} = {}) {
  const { client: accessControlClient, insertedJobs } = createFakeAccessControlClient({
    pollResults,
  })
  const cardUpdates: Record<string, unknown>[] = []
  const memberUpdates: Record<string, unknown>[] = []
  let detailReadIndex = 0
  let cardLookupIndex = 0

  const client = {
    from(table: string) {
      if (table === 'access_control_jobs') {
        return accessControlClient.from('access_control_jobs')
      }

      if (table === 'members') {
        return {
          select(columns: string) {
            expect(columns).toBe(MEMBER_RECORD_SELECT)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('member-1')

                return {
                  maybeSingle() {
                    const detailRow =
                      detailRows[Math.min(detailReadIndex, detailRows.length - 1)] ?? null
                    detailReadIndex += 1

                    return Promise.resolve({
                      data: detailRow,
                      error: null,
                    })
                  },
                }
              },
            }
          },
          update(values: Record<string, unknown>) {
            memberUpdates.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('member-1')

                return {
                  eq(secondColumn: string, secondValue: string) {
                    expect(secondColumn).toBe('employee_no')
                    expect(secondValue).toBe('000611')

                    return {
                      select(columns: string) {
                        expect(columns).toBe(MEMBER_RECORD_SELECT)

                        return {
                          maybeSingle() {
                            return Promise.resolve(memberUpdateResult)
                          },
                        }
                      },
                    }
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
                expect(values).toEqual(['0102857149'])

                const rows =
                  cardLookupResults[Math.min(cardLookupIndex, cardLookupResults.length - 1)] ?? []
                cardLookupIndex += 1

                return Promise.resolve({
                  data: rows,
                  error: null,
                })
              },
            }
          },
          update(values: Record<string, unknown>) {
            cardUpdates.push(values)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('card_no')
                expect(value).toBe('0102857149')

                return {
                  eq(secondColumn: string, secondValue: string) {
                    expect(secondColumn).toBe('employee_no')
                    expect(secondValue).toBe('000611')

                    return {
                      eq(thirdColumn: string, thirdValue: string) {
                        expect(thirdColumn).toBe('status')
                        expect(thirdValue).toBe('suspended_lost')

                        return {
                          select(columns: string) {
                            expect(columns).toBe('card_no')

                            return {
                              maybeSingle() {
                                return Promise.resolve(cardUpdateResult)
                              },
                            }
                          },
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return {
    client,
    insertedJobs,
    cardUpdates,
    memberUpdates,
  }
}

describe('POST /api/access/members/[id]/recover-card', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('reissues the card, clears lost_at, and reactivates the member', async () => {
    const { client, insertedJobs, cardUpdates, memberUpdates } = createRecoverCardAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/recover-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '000611',
          cardNo: '0102857149',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'add_card',
        payload: {
          employeeNo: '000611',
          cardNo: '0102857149',
        },
      },
    ])
    expect(cardUpdates).toEqual([
      {
        status: 'assigned',
        lost_at: null,
      },
    ])
    expect(memberUpdates).toEqual([{ status: 'Active' }])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-1',
        employeeNo: '000611',
        name: 'Jane Doe',
        cardNo: '0102857149',
        cardCode: 'A18',
        cardStatus: 'assigned',
        cardLostAt: null,
        type: 'General',
        memberTypeId: null,
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: null,
        photoUrl: null,
        beginTime: '2026-03-30T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
      },
    })
  })

  it('returns 400 when the card is not in suspended_lost state', async () => {
    const { client, insertedJobs } = createRecoverCardAdminClient({
      cardLookupResults: [
        [{ card_no: '0102857149', card_code: 'A18', status: 'assigned', lost_at: null }],
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/recover-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '000611',
          cardNo: '0102857149',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    expect(insertedJobs).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Only suspended lost cards can be recovered.',
    })
  })

  it('returns 400 when the card is permanently disabled', async () => {
    const { client, insertedJobs } = createRecoverCardAdminClient({
      cardLookupResults: [
        [
          {
            card_no: '0102857149',
            card_code: 'A18',
            status: 'disabled',
            lost_at: '2026-03-25T05:00:00Z',
          },
        ],
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/recover-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '000611',
          cardNo: '0102857149',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    expect(insertedJobs).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Disabled cards cannot be recovered.',
    })
  })

  it('returns a timeout error when the add_card job does not complete', async () => {
    vi.useFakeTimers()

    const { client, insertedJobs, cardUpdates, memberUpdates } = createRecoverCardAdminClient({
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

    const responsePromise = POST(
      new Request('http://localhost/api/access/members/member-1/recover-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '000611',
          cardNo: '0102857149',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    await vi.advanceTimersByTimeAsync(10_500)

    const response = await responsePromise

    expect(response.status).toBe(504)
    expect(insertedJobs).toEqual([
      {
        type: 'add_card',
        payload: {
          employeeNo: '000611',
          cardNo: '0102857149',
        },
      },
    ])
    expect(cardUpdates).toEqual([])
    expect(memberUpdates).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Issue card request timed out after 10 seconds.',
    })
  })
})
