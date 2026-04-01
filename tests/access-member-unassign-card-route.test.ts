import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEMBER_RECORD_SELECT } from '@/lib/members'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { POST } from '@/app/api/access/members/[id]/unassign-card/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function createUnassignAdminClient({
  pollResults,
  rpcResult = {
    data: null,
    error: null,
  } satisfies QueryResult<null>,
  detailRows = [
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
      balance: 0,
      created_at: '2026-03-30T14:15:16Z',
      updated_at: '2026-03-30T14:20:16Z',
    },
    {
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
  ],
  cardRows = [{ card_no: '0102857149', card_code: 'A18', status: 'assigned', lost_at: null }],
}: {
  pollResults?: Array<QueryResult<{
    id: string
    status: 'pending' | 'processing' | 'done' | 'failed'
    result: unknown
    error: string | null
  }>>
  rpcResult?: QueryResult<null>
  detailRows?: Array<Record<string, unknown> | null>
  cardRows?: Array<Record<string, unknown>>
} = {}) {
  const { client: accessControlClient, insertedJobs } = createFakeAccessControlClient({
    pollResults,
  })
  const rpcCalls: Array<{
    p_member_id: string
    p_employee_no: string
    p_card_no: string
  }> = []
  let detailReadIndex = 0

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

                return Promise.resolve({
                  data: cardRows,
                  error: null,
                })
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
    rpc(
      fn: 'unassign_member_card',
      args: {
        p_member_id: string
        p_employee_no: string
        p_card_no: string
      },
    ) {
      expect(fn).toBe('unassign_member_card')
      rpcCalls.push(args)
      return Promise.resolve(rpcResult)
    },
  }

  return {
    client,
    insertedJobs,
    rpcCalls,
  }
}

describe('POST /api/access/members/[id]/unassign-card', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('revokes the card, runs the RPC, and returns the updated member', async () => {
    const { client, insertedJobs, rpcCalls } = createUnassignAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/unassign-card', {
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
    expect(rpcCalls).toEqual([
      {
        p_member_id: 'member-1',
        p_employee_no: '000611',
        p_card_no: '0102857149',
      },
    ])
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

  it('returns 400 when cardNo is missing', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createUnassignAdminClient().client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/unassign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeNo: '000611',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('Card number is required.'),
    })
  })

  it('returns a bridge error and does not call the RPC when revoke_card fails', async () => {
    const { client, insertedJobs, rpcCalls } = createUnassignAdminClient({
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
      new Request('http://localhost/api/access/members/member-1/unassign-card', {
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
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Card revoke failed.',
    })
  })

  it('returns 400 when the current card is not in assigned status', async () => {
    const { client, insertedJobs, rpcCalls } = createUnassignAdminClient({
      cardRows: [
        {
          card_no: '0102857149',
          card_code: 'A18',
          status: 'suspended_lost',
          lost_at: '2026-04-01T05:00:00Z',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/unassign-card', {
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
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Only assigned cards can be unassigned.',
    })
  })

  it('returns 500 when the RPC fails after revoke_card succeeds', async () => {
    const { client, rpcCalls } = createUnassignAdminClient({
      rpcResult: {
        data: null,
        error: {
          message: 'transaction exploded',
        },
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/unassign-card', {
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

    expect(response.status).toBe(500)
    expect(rpcCalls).toEqual([
      {
        p_member_id: 'member-1',
        p_employee_no: '000611',
        p_card_no: '0102857149',
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to unassign card 0102857149: transaction exploded',
    })
  })
})
