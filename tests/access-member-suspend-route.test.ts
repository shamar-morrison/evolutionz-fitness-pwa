import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEMBER_RECORD_SELECT } from '@/lib/members'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { POST } from '@/app/api/access/members/[id]/suspend/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function createSuspendAdminClient({
  pollResults,
  updateResult = {
    data: { id: 'member-1' },
    error: null,
  } satisfies QueryResult<{ id: string }>,
  detailRow = {
    id: 'member-1',
    employee_no: '000611',
    name: 'P42 Jane Doe',
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
    balance: 0,
    created_at: '2026-03-30T14:15:16Z',
    updated_at: '2026-03-30T14:20:16Z',
  },
  detailError = null,
  cardRows = [{ card_no: '0102857149', card_code: 'P42', status: 'assigned', lost_at: null }],
  cardsError = null,
}: {
  pollResults?: Array<QueryResult<{
    id: string
    status: 'pending' | 'processing' | 'done' | 'failed'
    result: unknown
    error: string | null
  }>>
  updateResult?: QueryResult<{ id: string }>
  detailRow?: Record<string, unknown> | null
  detailError?: { message: string } | null
  cardRows?: Array<Record<string, unknown>>
  cardsError?: { message: string } | null
} = {}) {
  const { client: accessControlClient, insertedJobs } = createFakeAccessControlClient({
    pollResults,
  })
  const memberUpdates: Array<{ status: 'Suspended'; id: string }> = []
  const cardLookups: string[][] = []

  const client = {
    from(table: string) {
      if (table === 'access_control_jobs') {
        return accessControlClient.from('access_control_jobs')
      }

      if (table === 'members') {
        return {
          update(values: { status: 'Suspended' }) {
            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                memberUpdates.push({
                  status: values.status,
                  id: value,
                })

                return {
                  select(columns: string) {
                    expect(columns).toBe(MEMBER_RECORD_SELECT)

                    return {
                      maybeSingle() {
                        return Promise.resolve(updateResult)
                      },
                    }
                  },
                }
              },
            }
          },
          select(columns: string) {
            expect(columns).toBe(MEMBER_RECORD_SELECT)

            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')
                expect(value).toBe('member-1')

                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: detailRow,
                      error: detailError,
                    })
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
                cardLookups.push(values)

                return Promise.resolve({
                  data: cardRows,
                  error: cardsError,
                })
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
    memberUpdates,
    cardLookups,
  }
}

describe('POST /api/access/members/[id]/suspend', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('queues revoke_card and updates the member status', async () => {
    const { client, insertedJobs, memberUpdates, cardLookups } = createSuspendAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/suspend', {
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
        type: 'revoke_card',
        payload: {
          employeeNo: '000611',
          cardNo: '0102857149',
        },
      },
    ])
    expect(memberUpdates).toEqual([{ status: 'Suspended', id: 'member-1' }])
    expect(cardLookups).toEqual([['0102857149'], ['0102857149']])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-1',
        employeeNo: '000611',
        name: 'Jane Doe',
        cardNo: '0102857149',
        cardCode: 'P42',
        cardStatus: 'assigned',
        cardLostAt: null,
        type: 'General',
        status: 'Suspended',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: null,
        photoUrl: null,
        beginTime: '2026-03-30T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
        balance: 0,
        createdAt: '2026-03-30T14:15:16.000Z',
      },
    })
  })

  it('skips revoke_card when the member has no assigned card', async () => {
    const { client, insertedJobs, memberUpdates, cardLookups } = createSuspendAdminClient({
      detailRow: {
        id: 'member-1',
        employee_no: '000611',
        name: 'Jane Doe',
        card_no: null,
        type: 'General',
        status: 'Suspended',
        gender: null,
        email: null,
        phone: null,
        remark: null,
        photo_url: null,
        begin_time: '2026-03-30T00:00:00Z',
        end_time: '2026-07-15T23:59:59Z',
        balance: 0,
        created_at: '2026-03-30T14:15:16Z',
        updated_at: '2026-03-30T14:20:16Z',
      },
      cardRows: [],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '000611',
          cardNo: null,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([])
    expect(memberUpdates).toEqual([{ status: 'Suspended', id: 'member-1' }])
    expect(cardLookups).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-1',
        employeeNo: '000611',
        name: 'Jane Doe',
        cardNo: null,
        cardCode: null,
        cardStatus: null,
        cardLostAt: null,
        type: 'General',
        status: 'Suspended',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: null,
        photoUrl: null,
        beginTime: '2026-03-30T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
        balance: 0,
        createdAt: '2026-03-30T14:15:16.000Z',
      },
    })
  })

  it('returns a bridge error and does not update the member when revoke_card fails', async () => {
    const { client, insertedJobs, memberUpdates } = createSuspendAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Card revoke failed.',
          },
          error: null,
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/suspend', {
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

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '000611',
          cardNo: '0102857149',
        },
      },
    ])
    expect(memberUpdates).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Card revoke failed.',
    })
  })

  it('returns 400 for invalid JSON bodies', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createSuspendAdminClient().client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/suspend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{',
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Invalid JSON body.',
    })
  })
})
