import { afterEach, describe, expect, it, vi } from 'vitest'
import { MEMBER_RECORD_SELECT } from '@/lib/members'
import { createFakeAccessControlClient } from '@/tests/support/access-control-client'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { PATCH } from '@/app/api/members/[id]/edit/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function createEditAdminClient({
  pollResults,
  currentMemberRow = {
    id: 'member-1',
    employee_no: '000611',
    name: 'A18 Jane Doe',
    card_no: '0102857149',
    type: 'General',
    status: 'Active',
    gender: 'Female',
    email: 'jane@example.com',
    phone: '876-555-1212',
    remark: 'Original remark',
    photo_url: null,
    begin_time: '2026-03-30T00:00:00Z',
    end_time: '2026-04-29T23:59:59Z',
    balance: 0,
    created_at: '2026-03-30T14:15:16Z',
    updated_at: '2026-03-30T14:15:16Z',
  },
  updatedMemberRow = {
    id: 'member-1',
    employee_no: '000611',
    name: 'A18 Jane Updated',
    card_no: '0102857149',
    type: 'Civil Servant',
    status: 'Active',
    gender: 'Female',
    email: 'jane@example.com',
    phone: '876-555-1212',
    remark: 'Updated remark',
    photo_url: null,
    begin_time: '2026-03-30T00:00:00Z',
    end_time: '2026-04-29T23:59:59Z',
    balance: 0,
    created_at: '2026-03-30T14:15:16Z',
    updated_at: '2026-03-30T14:15:16Z',
  },
  cardRows = [{ card_no: '0102857149', card_code: 'A18', status: 'assigned', lost_at: null }],
  cardsError = null,
  updateResult = {
    data: updatedMemberRow,
    error: null,
  } satisfies QueryResult<Record<string, unknown>>,
}: {
  pollResults?: Array<QueryResult<{
    id: string
    status: 'pending' | 'processing' | 'done' | 'failed'
    result: unknown
    error: string | null
  }>>
  currentMemberRow?: Record<string, unknown> | null
  updatedMemberRow?: Record<string, unknown> | null
  cardRows?: Array<Record<string, unknown>>
  cardsError?: { message: string } | null
  updateResult?: QueryResult<Record<string, unknown>>
} = {}) {
  const { client: accessControlClient, insertedJobs } = createFakeAccessControlClient({
    pollResults,
  })
  const memberUpdates: Record<string, unknown>[] = []

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
                    return Promise.resolve({
                      data: currentMemberRow,
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
  }
}

describe('PATCH /api/members/[id]/edit', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
  })

  it('updates Supabase only when the access window has not changed', async () => {
    const { client, insertedJobs, memberUpdates } = createEditAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await PATCH(
      new Request('http://localhost/api/members/member-1/edit', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Updated',
          type: 'Civil Servant',
          gender: 'Female',
          email: 'jane@example.com',
          phone: '876-555-1212',
          remark: 'Updated remark',
          beginTime: '2026-03-30T00:00:00',
          endTime: '2026-04-29T23:59:59',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([])
    expect(memberUpdates).toEqual([
      {
        name: 'A18 Jane Updated',
        type: 'Civil Servant',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        remark: 'Updated remark',
        begin_time: '2026-03-30T00:00:00',
        end_time: '2026-04-29T23:59:59',
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-1',
        employeeNo: '000611',
        name: 'Jane Updated',
        cardNo: '0102857149',
        cardCode: 'A18',
        cardStatus: 'assigned',
        cardLostAt: null,
        type: 'Civil Servant',
        status: 'Active',
        deviceAccessState: 'ready',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        remark: 'Updated remark',
        photoUrl: null,
        beginTime: '2026-03-30T00:00:00.000Z',
        endTime: '2026-04-29T23:59:59.000Z',
      },
    })
  })

  it('queues add_user when the access window changes', async () => {
    const { client, insertedJobs } = createEditAdminClient({
      updatedMemberRow: {
        id: 'member-1',
        employee_no: '000611',
        name: 'A18 Jane Doe',
        card_no: '0102857149',
        type: 'General',
        status: 'Active',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        remark: 'Original remark',
        photo_url: null,
        begin_time: '2026-03-30T08:00:00Z',
        end_time: '2026-05-29T23:59:59Z',
        balance: 0,
        created_at: '2026-03-30T14:15:16Z',
        updated_at: '2026-03-30T14:15:16Z',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await PATCH(
      new Request('http://localhost/api/members/member-1/edit', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          type: 'General',
          gender: 'Female',
          email: 'jane@example.com',
          phone: '876-555-1212',
          remark: 'Original remark',
          beginTime: '2026-03-30T08:00:00',
          endTime: '2026-05-29T23:59:59',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: {
          employeeNo: '000611',
          name: 'A18 Jane Doe',
          userType: 'normal',
          beginTime: '2026-03-30T08:00:00',
          endTime: '2026-05-29T23:59:59',
        },
      },
    ])
  })

  it('returns a warning when the device sync fails after the member row is updated', async () => {
    const { client, insertedJobs, memberUpdates } = createEditAdminClient({
      pollResults: [
        {
          data: {
            id: 'job-123',
            status: 'failed',
            result: null,
            error: 'Device rejected request.',
          },
          error: null,
        },
      ],
      updatedMemberRow: {
        id: 'member-1',
        employee_no: '000611',
        name: 'A18 Jane Doe',
        card_no: '0102857149',
        type: 'General',
        status: 'Active',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        remark: 'Updated remark',
        photo_url: null,
        begin_time: '2026-03-30T08:00:00Z',
        end_time: '2026-05-29T23:59:59Z',
        balance: 0,
        created_at: '2026-03-30T14:15:16Z',
        updated_at: '2026-03-30T14:15:16Z',
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await PATCH(
      new Request('http://localhost/api/members/member-1/edit', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          type: 'General',
          gender: 'Female',
          email: 'jane@example.com',
          phone: '876-555-1212',
          remark: 'Updated remark',
          beginTime: '2026-03-30T08:00:00',
          endTime: '2026-05-29T23:59:59',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(memberUpdates).toHaveLength(1)
    expect(insertedJobs).toEqual([
      {
        type: 'add_user',
        payload: {
          employeeNo: '000611',
          name: 'A18 Jane Doe',
          userType: 'normal',
          beginTime: '2026-03-30T08:00:00',
          endTime: '2026-05-29T23:59:59',
        },
      },
    ])
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
        status: 'Active',
        deviceAccessState: 'ready',
        gender: 'Female',
        email: 'jane@example.com',
        phone: '876-555-1212',
        remark: 'Updated remark',
        photoUrl: null,
        beginTime: '2026-03-30T08:00:00.000Z',
        endTime: '2026-05-29T23:59:59.000Z',
      },
      warning: 'Member updated but device sync failed. Please try again.',
    })
  })

  it('returns 400 for invalid access windows', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createEditAdminClient().client)

    const response = await PATCH(
      new Request('http://localhost/api/members/member-1/edit', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Jane Doe',
          type: 'General',
          gender: 'Female',
          email: 'jane@example.com',
          phone: '876-555-1212',
          remark: 'Updated remark',
          beginTime: '2026-03-30T08:00:00',
          endTime: '2026-03-30T08:00:00',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'End time must be after begin time.',
    })
  })
})
