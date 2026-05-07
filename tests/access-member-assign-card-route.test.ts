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

import { POST } from '@/app/api/access/members/[id]/assign-card/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

const FIXED_NOW = new Date('2026-03-30T14:15:16.000Z')
const EXPECTED_INCREMENTED_EMPLOYEE_NO = '912'
const validAssignCardRequestBody = {
  cardNo: '0102857149',
  beginTime: '2026-04-01T00:00:00',
  endTime: '2026-08-31T23:59:59',
}
const DEFAULT_MEMBER_ROWS = [
  { employee_no: '611' },
  { employee_no: '00000911' },
  { employee_no: '20260330141516593046' },
]

function createDoneJobResult(result: unknown = { accepted: true }) {
  return {
    data: {
      id: 'job-123',
      status: 'done' as const,
      result,
      error: null,
    },
    error: null,
  }
}

function createFailedJobResult(error: string) {
  return {
    data: {
      id: 'job-123',
      status: 'failed' as const,
      result: null,
      error,
    },
    error: null,
  }
}

function createAssignCardAdminClient({
  pollResults = [
    createDoneJobResult({
      CardInfoSearch: {
        CardInfo: [],
      },
    }),
    createDoneJobResult(),
  ],
  detailRows = [
    {
      id: 'member-1',
      employee_no: '000611',
      name: 'Jane Doe',
      card_no: null,
      type: 'General',
      status: 'Active',
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
      name: 'Jane Doe',
      card_no: '0102857149',
      type: 'General',
      status: 'Active',
      gender: null,
      email: null,
      phone: null,
      remark: null,
      photo_url: null,
      begin_time: '2026-04-01T00:00:00Z',
      end_time: '2026-08-31T23:59:59Z',
      updated_at: '2026-04-01T05:05:00Z',
    },
  ],
  cardLookupResults = [
    [{ card_no: '0102857149', card_code: 'A18', status: 'assigned', lost_at: null }],
  ],
  memberRows = DEFAULT_MEMBER_ROWS,
  memberRowsResult = {
    data: memberRows,
    error: null,
  } satisfies QueryResult<Array<{ employee_no: string | null }>>,
  selectedCardResult = {
    data: {
      card_no: '0102857149',
      card_code: 'A18',
    },
    error: null,
  } satisfies QueryResult<{ card_no: string; card_code: string | null }>,
  provisionMemberUpdateResult,
  rpcResult = {
    data: null,
    error: null,
  } satisfies QueryResult<null>,
}: {
  pollResults?: Array<QueryResult<{
    id: string
    status: 'pending' | 'processing' | 'done' | 'failed'
    result: unknown
    error: string | null
  }>>
  detailRows?: Array<Record<string, unknown> | null>
  cardLookupResults?: Array<Array<Record<string, unknown>>>
  memberRows?: Array<{ employee_no: string | null }>
  memberRowsResult?: QueryResult<Array<{ employee_no: string | null }>>
  selectedCardResult?: QueryResult<{ card_no: string; card_code: string | null }>
  provisionMemberUpdateResult?: QueryResult<Record<string, unknown>>
  rpcResult?: QueryResult<null>
} = {}) {
  const { client: accessControlClient, insertedJobs } = createFakeAccessControlClient({
    pollResults,
  })
  const rpcCalls: Array<{
    p_member_id: string
    p_employee_no: string
    p_card_no: string
  }> = []
  const memberUpdateCalls: Array<{
    begin_time: string
    end_time: string
    status: 'Active' | 'Expired'
    id: string
    employee_no: string
  }> = []
  const provisionMemberUpdateCalls: Array<{
    employee_no: string
    name: string
    begin_time: string
    end_time: string
    status: 'Active' | 'Expired'
    id: string
  }> = []
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
            if (columns === 'employee_no') {
              return Promise.resolve(memberRowsResult)
            }

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
            return {
              eq(column: string, value: string) {
                expect(column).toBe('id')

                if ('employee_no' in values && 'name' in values) {
                  return {
                    is(nextColumn: string, nextValue: null) {
                      expect(nextColumn).toBe('employee_no')
                      expect(nextValue).toBeNull()

                      return {
                        select(columns: string) {
                          expect(columns).toBe(MEMBER_RECORD_SELECT)
                          provisionMemberUpdateCalls.push({
                            employee_no: values.employee_no as string,
                            name: values.name as string,
                            begin_time: values.begin_time as string,
                            end_time: values.end_time as string,
                            status: values.status as 'Active' | 'Expired',
                            id: value,
                          })

                          return {
                            maybeSingle() {
                              if (provisionMemberUpdateResult) {
                                return Promise.resolve(provisionMemberUpdateResult)
                              }

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

                return {
                  eq(nextColumn: string, nextValue: string) {
                    expect(nextColumn).toBe('employee_no')

                    return {
                      select(columns: string) {
                        expect(columns).toBe(MEMBER_RECORD_SELECT)
                        memberUpdateCalls.push({
                          begin_time: values.begin_time as string,
                          end_time: values.end_time as string,
                          status: values.status as 'Active' | 'Expired',
                          id: value,
                          employee_no: nextValue,
                        })

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
              },
            }
          },
        }
      }

      if (table === 'cards') {
        return {
          select(columns: string) {
            if (columns === 'card_no, card_code') {
              return {
                eq(column: string, value: string) {
                  expect(column).toBe('card_no')
                  expect(value).toBe('0102857149')

                  return {
                    eq(nextColumn: string, nextValue: string) {
                      expect(nextColumn).toBe('status')
                      expect(nextValue).toBe('available')

                      return {
                        maybeSingle() {
                          return Promise.resolve(selectedCardResult)
                        },
                      }
                    },
                  }
                },
              }
            }

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
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
    rpc(
      fn: 'assign_member_card',
      args: {
        p_member_id: string
        p_employee_no: string
        p_card_no: string
      },
    ) {
      expect(fn).toBe('assign_member_card')
      rpcCalls.push(args)
      return Promise.resolve(rpcResult)
    },
  }

  return {
    client,
    insertedJobs,
    memberUpdateCalls,
    provisionMemberUpdateCalls,
    rpcCalls,
  }
}

describe('POST /api/access/members/[id]/assign-card', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('assigns an available card and returns the updated member', async () => {
    const { client, insertedJobs, memberUpdateCalls, rpcCalls } = createAssignCardAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_card',
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
    expect(memberUpdateCalls).toEqual([
      {
        begin_time: '2026-04-01T00:00:00',
        end_time: '2026-08-31T23:59:59',
        status: 'Active',
        id: 'member-1',
        employee_no: '000611',
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
        joinedAt: null,
        memberTypeId: null,
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: null,
        photoUrl: null,
        beginTime: '2026-04-01T00:00:00.000Z',
        endTime: '2026-08-31T23:59:59.000Z',
      },
    })
  })

  it('provisions a Hik user before assigning a card to a member without an employee number', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const {
      client,
      insertedJobs,
      memberUpdateCalls,
      provisionMemberUpdateCalls,
      rpcCalls,
    } = createAssignCardAdminClient({
      detailRows: [
        {
          id: 'member-1',
          employee_no: null,
          name: 'Jane Doe',
          card_no: null,
          type: 'General',
          status: 'Active',
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
          employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          card_no: null,
          type: 'General',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: '2026-04-01T00:00:00Z',
          end_time: '2026-08-31T23:59:59Z',
          updated_at: '2026-04-01T05:03:00Z',
        },
        {
          id: 'member-1',
          employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          card_no: '0102857149',
          type: 'General',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: '2026-04-01T00:00:00Z',
          end_time: '2026-08-31T23:59:59Z',
          updated_at: '2026-04-01T05:05:00Z',
        },
        {
          id: 'member-1',
          employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          card_no: '0102857149',
          type: 'General',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: '2026-04-01T00:00:00Z',
          end_time: '2026-08-31T23:59:59Z',
          updated_at: '2026-04-01T05:05:00Z',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          userType: 'normal',
          beginTime: '2026-04-01T00:00:00',
          endTime: '2026-08-31T23:59:59',
        },
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          cardNo: '0102857149',
        },
      },
    ])
    expect(provisionMemberUpdateCalls).toEqual([
      {
        employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        name: 'A18 Jane Doe',
        begin_time: '2026-04-01T00:00:00',
        end_time: '2026-08-31T23:59:59',
        status: 'Active',
        id: 'member-1',
      },
    ])
    expect(rpcCalls).toEqual([
      {
        p_member_id: 'member-1',
        p_employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        p_card_no: '0102857149',
      },
    ])
    expect(memberUpdateCalls).toEqual([
      {
        begin_time: '2026-04-01T00:00:00',
        end_time: '2026-08-31T23:59:59',
        status: 'Active',
        id: 'member-1',
        employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-1',
        employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        name: 'Jane Doe',
        cardNo: '0102857149',
        cardCode: 'A18',
        cardStatus: 'assigned',
        cardLostAt: null,
        type: 'General',
        joinedAt: null,
        memberTypeId: null,
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: null,
        photoUrl: null,
        beginTime: '2026-04-01T00:00:00.000Z',
        endTime: '2026-08-31T23:59:59.000Z',
      },
    })
  })

  it('revokes a placeholder-held card before provisioning and assigning it to a member without an employee number', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const {
      client,
      insertedJobs,
      memberUpdateCalls,
      provisionMemberUpdateCalls,
      rpcCalls,
    } = createAssignCardAdminClient({
      detailRows: [
        {
          id: 'member-1',
          employee_no: null,
          name: 'Jane Doe',
          card_no: null,
          type: 'General',
          status: 'Active',
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
          employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          card_no: null,
          type: 'General',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: '2026-04-01T00:00:00Z',
          end_time: '2026-08-31T23:59:59Z',
          updated_at: '2026-04-01T05:03:00Z',
        },
        {
          id: 'member-1',
          employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          card_no: '0102857149',
          type: 'General',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: '2026-04-01T00:00:00Z',
          end_time: '2026-08-31T23:59:59Z',
          updated_at: '2026-04-01T05:05:00Z',
        },
        {
          id: 'member-1',
          employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          card_no: '0102857149',
          type: 'General',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: '2026-04-01T00:00:00Z',
          end_time: '2026-08-31T23:59:59Z',
          updated_at: '2026-04-01T05:05:00Z',
        },
      ],
      pollResults: [
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [
              {
                cardNo: '0102857149',
                employeeNo: '136',
              },
            ],
          },
        }),
        createDoneJobResult({
          UserInfoSearch: {
            UserInfo: [
              {
                employeeNo: '136',
                name: 'P42',
              },
            ],
          },
        }),
        createDoneJobResult(),
        createDoneJobResult(),
        createDoneJobResult(),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const responsePromise = POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'get_user',
        payload: {
          employeeNo: '136',
        },
      },
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '136',
          cardNo: '0102857149',
        },
      },
    ])

    await vi.advanceTimersByTimeAsync(1_999)

    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'get_user',
        payload: {
          employeeNo: '136',
        },
      },
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '136',
          cardNo: '0102857149',
        },
      },
    ])

    await vi.advanceTimersByTimeAsync(1)

    const response = await responsePromise

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'get_user',
        payload: {
          employeeNo: '136',
        },
      },
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '136',
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          userType: 'normal',
          beginTime: '2026-04-01T00:00:00',
          endTime: '2026-08-31T23:59:59',
        },
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          cardNo: '0102857149',
        },
      },
    ])
    expect(provisionMemberUpdateCalls).toEqual([
      {
        employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        name: 'A18 Jane Doe',
        begin_time: '2026-04-01T00:00:00',
        end_time: '2026-08-31T23:59:59',
        status: 'Active',
        id: 'member-1',
      },
    ])
    expect(rpcCalls).toEqual([
      {
        p_member_id: 'member-1',
        p_employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        p_card_no: '0102857149',
      },
    ])
    expect(memberUpdateCalls).toEqual([
      {
        begin_time: '2026-04-01T00:00:00',
        end_time: '2026-08-31T23:59:59',
        status: 'Active',
        id: 'member-1',
        employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
      },
    ])
  })

  it('reactivates an expired member when the assigned access window ends in the future', async () => {
    const { client, memberUpdateCalls } = createAssignCardAdminClient({
      detailRows: [
        {
          id: 'member-1',
          employee_no: '000611',
          name: 'Jane Doe',
          card_no: null,
          type: 'General',
          status: 'Expired',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: '2026-03-01T00:00:00Z',
          end_time: '2026-03-31T23:59:59Z',
          updated_at: '2026-04-01T05:00:00Z',
        },
        {
          id: 'member-1',
          employee_no: '000611',
          name: 'Jane Doe',
          card_no: '0102857149',
          type: 'General',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: '2026-04-01T00:00:00Z',
          end_time: '2026-08-31T23:59:59Z',
          updated_at: '2026-04-01T05:05:00Z',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(memberUpdateCalls).toEqual([
      {
        begin_time: '2026-04-01T00:00:00',
        end_time: '2026-08-31T23:59:59',
        status: 'Active',
        id: 'member-1',
        employee_no: '000611',
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: expect.objectContaining({
        status: 'Active',
      }),
    })
  })

  it('revokes a placeholder-held card before assigning it to the member', async () => {
    vi.useFakeTimers()

    const { client, insertedJobs, memberUpdateCalls, rpcCalls } = createAssignCardAdminClient({
      pollResults: [
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [
              {
                cardNo: '0102857149',
                employeeNo: '136',
              },
            ],
          },
        }),
        createDoneJobResult({
          UserInfoSearch: {
            UserInfo: [
              {
                employeeNo: '136',
                name: 'P42',
              },
            ],
          },
        }),
        createDoneJobResult(),
        createDoneJobResult(),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const responsePromise = POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    await vi.advanceTimersByTimeAsync(0)

    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'get_user',
        payload: {
          employeeNo: '136',
        },
      },
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '136',
          cardNo: '0102857149',
        },
      },
    ])

    await vi.advanceTimersByTimeAsync(1_999)

    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'get_user',
        payload: {
          employeeNo: '136',
        },
      },
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '136',
          cardNo: '0102857149',
        },
      },
    ])

    await vi.advanceTimersByTimeAsync(1)

    const response = await responsePromise

    expect(response.status).toBe(200)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'get_user',
        payload: {
          employeeNo: '136',
        },
      },
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '136',
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_card',
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
    expect(memberUpdateCalls).toEqual([
      {
        begin_time: '2026-04-01T00:00:00',
        end_time: '2026-08-31T23:59:59',
        status: 'Active',
        id: 'member-1',
        employee_no: '000611',
      },
    ])
  })

  it('returns 400 when the card is held by a non-placeholder device user', async () => {
    const { client, insertedJobs, rpcCalls } = createAssignCardAdminClient({
      pollResults: [
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [
              {
                cardNo: '0102857149',
                employeeNo: '136',
              },
            ],
          },
        }),
        createDoneJobResult({
          UserInfoSearch: {
            UserInfo: [
              {
                employeeNo: '136',
                name: 'Jane Doe',
              },
            ],
          },
        }),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'get_user',
        payload: {
          employeeNo: '136',
        },
      },
    ])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Card 0102857149 is assigned on the Hik device to employee 136 (Jane Doe). Only placeholder-held cards can be reassigned automatically.',
    })
  })

  it('returns 400 when the current holder cannot be confirmed as a placeholder', async () => {
    const { client, insertedJobs, rpcCalls } = createAssignCardAdminClient({
      pollResults: [
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [
              {
                cardNo: '0102857149',
                employeeNo: '136',
              },
            ],
          },
        }),
        createDoneJobResult({
          UserInfoSearch: {
            UserInfo: [
              {
                employeeNo: '136',
                name: '   ',
              },
            ],
          },
        }),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'get_user',
        payload: {
          employeeNo: '136',
        },
      },
    ])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Card 0102857149 is assigned on the Hik device to employee 136, but that device user could not be confirmed as a placeholder slot.',
    })
  })

  it('returns 400 when the member already has a card assigned', async () => {
    const { client, insertedJobs } = createAssignCardAdminClient({
      detailRows: [
        {
          id: 'member-1',
          employee_no: '000611',
          name: 'Jane Doe',
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
          updated_at: '2026-04-01T05:00:00Z',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    expect(insertedJobs).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'This member already has a card assigned.',
    })
  })

  it('returns the standardized add_user failure when provisioning a missing Hik person id fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const {
      client,
      insertedJobs,
      memberUpdateCalls,
      provisionMemberUpdateCalls,
      rpcCalls,
    } = createAssignCardAdminClient({
      detailRows: [
        {
          id: 'member-1',
          employee_no: null,
          name: 'Jane Doe',
          card_no: null,
          type: 'General',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: '2026-03-30T00:00:00Z',
          end_time: '2026-07-15T23:59:59Z',
          updated_at: '2026-04-01T05:00:00Z',
        },
      ],
      pollResults: [
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [],
          },
        }),
        createFailedJobResult(
          'Device returned 400 for PUT /ISAPI/AccessControl/UserInfo/Modify?format=json: {"subStatusCode":"illegalEmployeeNo"}',
        ),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          userType: 'normal',
          beginTime: '2026-04-01T00:00:00',
          endTime: '2026-08-31T23:59:59',
        },
      },
    ])
    expect(provisionMemberUpdateCalls).toEqual([])
    expect(memberUpdateCalls).toEqual([])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Failed to create the Hik user before card assignment: The Hik device rejected the generated person ID. Please try again. Card assignment was not attempted because Hik user creation failed first.',
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[access] Hik rejected generated person ID:',
      'Device returned 400 for PUT /ISAPI/AccessControl/UserInfo/Modify?format=json: {"subStatusCode":"illegalEmployeeNo"}',
    )
  })

  it('rolls back the newly created Hik user when first-time member provisioning cannot be persisted', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const {
      client,
      insertedJobs,
      memberUpdateCalls,
      provisionMemberUpdateCalls,
      rpcCalls,
    } = createAssignCardAdminClient({
      detailRows: [
        {
          id: 'member-1',
          employee_no: null,
          name: 'Jane Doe',
          card_no: null,
          type: 'General',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: '2026-03-30T00:00:00Z',
          end_time: '2026-07-15T23:59:59Z',
          updated_at: '2026-04-01T05:00:00Z',
        },
      ],
      pollResults: [
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [],
          },
        }),
        createDoneJobResult(),
        createDoneJobResult(),
      ],
      provisionMemberUpdateResult: {
        data: null,
        error: { message: 'update exploded' },
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(500)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
          name: 'A18 Jane Doe',
          userType: 'normal',
          beginTime: '2026-04-01T00:00:00',
          endTime: '2026-08-31T23:59:59',
        },
      },
      {
        type: 'delete_user',
        payload: {
          employeeNo: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        },
      },
    ])
    expect(provisionMemberUpdateCalls).toEqual([
      {
        employee_no: EXPECTED_INCREMENTED_EMPLOYEE_NO,
        name: 'A18 Jane Doe',
        begin_time: '2026-04-01T00:00:00',
        end_time: '2026-08-31T23:59:59',
        status: 'Active',
        id: 'member-1',
      },
    ])
    expect(memberUpdateCalls).toEqual([])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to update member member-1: update exploded. The created Hik user was rolled back.',
    })
  })

  it('returns 400 when the selected card is missing its synced card code during first-time provisioning', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)

    const { client, insertedJobs, provisionMemberUpdateCalls, rpcCalls } = createAssignCardAdminClient(
      {
        detailRows: [
          {
            id: 'member-1',
            employee_no: null,
            name: 'Jane Doe',
            card_no: null,
            type: 'General',
            status: 'Active',
            gender: null,
            email: null,
            phone: null,
            remark: null,
            photo_url: null,
            begin_time: '2026-03-30T00:00:00Z',
            end_time: '2026-07-15T23:59:59Z',
            updated_at: '2026-04-01T05:00:00Z',
          },
        ],
        selectedCardResult: {
          data: {
            card_no: '0102857149',
            card_code: '   ',
          },
          error: null,
        },
      },
    )
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
    ])
    expect(provisionMemberUpdateCalls).toEqual([])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Selected card is missing its synced card code.',
    })
  })

  it('returns a bridge error when get_card fails', async () => {
    const { client, insertedJobs, rpcCalls } = createAssignCardAdminClient({
      pollResults: [createFailedJobResult('Card lookup failed.')],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
    ])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Card lookup failed.',
    })
  })

  it('returns a bridge error when get_user fails', async () => {
    const { client, insertedJobs, rpcCalls } = createAssignCardAdminClient({
      pollResults: [
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [
              {
                cardNo: '0102857149',
                employeeNo: '136',
              },
            ],
          },
        }),
        createFailedJobResult('User lookup failed.'),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'get_user',
        payload: {
          employeeNo: '136',
        },
      },
    ])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'User lookup failed.',
    })
  })

  it('returns a timeout error when revoke_card does not complete', async () => {
    vi.useFakeTimers()

    const { client, insertedJobs, rpcCalls } = createAssignCardAdminClient({
      pollResults: [
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [
              {
                cardNo: '0102857149',
                employeeNo: '136',
              },
            ],
          },
        }),
        createDoneJobResult({
          UserInfoSearch: {
            UserInfo: [
              {
                employeeNo: '136',
                name: 'P42',
              },
            ],
          },
        }),
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
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
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
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'get_user',
        payload: {
          employeeNo: '136',
        },
      },
      {
        type: 'revoke_card',
        payload: {
          employeeNo: '136',
          cardNo: '0102857149',
        },
      },
    ])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Release card request timed out after 10 seconds.',
    })
  })

  it('returns a timeout error when add_card does not complete', async () => {
    vi.useFakeTimers()

    const { client, insertedJobs, rpcCalls } = createAssignCardAdminClient({
      pollResults: [
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [],
          },
        }),
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
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
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
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: '000611',
          cardNo: '0102857149',
        },
      },
    ])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Issue card request timed out after 10 seconds.',
    })
  })

  it('returns 502 when add_card completes with a Hik failure response', async () => {
    const { client, insertedJobs, rpcCalls } = createAssignCardAdminClient({
      pollResults: [
        createDoneJobResult({
          CardInfoSearch: {
            CardInfo: [],
          },
        }),
        createDoneJobResult({
          type: 'ResponseStatus',
          statusCode: 6,
          statusString: 'Invalid Content',
          subStatusCode: 'badParameters',
          errorMsg: '0x60000001',
        }),
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(502)
    expect(insertedJobs).toEqual([
      {
        type: 'get_card',
        payload: {
          cardNo: '0102857149',
        },
      },
      {
        type: 'add_card',
        payload: {
          employeeNo: '000611',
          cardNo: '0102857149',
        },
      },
    ])
    expect(rpcCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error:
        'Failed to issue card 0102857149: Device reported unsuccessful card assignment response (statusCode=6, statusString=Invalid Content, subStatusCode=badParameters, errorMsg=0x60000001).',
    })
  })

  it('returns 500 when the assign_member_card RPC fails after device success', async () => {
    const { client, memberUpdateCalls, rpcCalls } = createAssignCardAdminClient({
      rpcResult: {
        data: null,
        error: {
          message: 'transaction exploded',
        },
      },
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
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
    expect(memberUpdateCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Failed to assign card 0102857149: transaction exploded',
    })
  })

  it('returns 400 when the member is suspended', async () => {
    const { client, insertedJobs, memberUpdateCalls, rpcCalls } = createAssignCardAdminClient({
      detailRows: [
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
          begin_time: null,
          end_time: null,
          updated_at: '2026-04-01T05:00:00Z',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validAssignCardRequestBody),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    expect(insertedJobs).toEqual([])
    expect(rpcCalls).toEqual([])
    expect(memberUpdateCalls).toEqual([])
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Suspended members must be reactivated before a card can be assigned.',
    })
  })

  it('uses the request access window even when the stored member window is missing', async () => {
    const { client, memberUpdateCalls } = createAssignCardAdminClient({
      detailRows: [
        {
          id: 'member-1',
          employee_no: '000611',
          name: 'Jane Doe',
          card_no: null,
          type: 'General',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: null,
          end_time: null,
          updated_at: '2026-04-01T05:00:00Z',
        },
        {
          id: 'member-1',
          employee_no: '000611',
          name: 'Jane Doe',
          card_no: '0102857149',
          type: 'General',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: null,
          photo_url: null,
          begin_time: '2099-04-05T00:00:00Z',
          end_time: '2099-04-30T23:59:59Z',
          updated_at: '2026-04-01T05:05:00Z',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cardNo: '0102857149',
          beginTime: '2099-04-05T00:00:00',
          endTime: '2099-04-30T23:59:59',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(200)
    expect(memberUpdateCalls).toEqual([
      {
        begin_time: '2099-04-05T00:00:00',
        end_time: '2099-04-30T23:59:59',
        status: 'Active',
        id: 'member-1',
        employee_no: '000611',
      },
    ])
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: expect.objectContaining({
        beginTime: '2099-04-05T00:00:00.000Z',
        endTime: '2099-04-30T23:59:59.000Z',
      }),
    })
  })

  it('returns 400 when cardNo is missing', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createAssignCardAdminClient().client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
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

  it('returns 400 when beginTime is missing', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createAssignCardAdminClient().client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cardNo: '0102857149',
          endTime: '2026-08-31T23:59:59',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('Begin time is required.'),
    })
  })

  it('returns 400 when endTime is missing', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createAssignCardAdminClient().client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cardNo: '0102857149',
          beginTime: '2026-04-01T00:00:00',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('End time is required.'),
    })
  })

  it('returns 400 when beginTime is malformed', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createAssignCardAdminClient().client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cardNo: '0102857149',
          beginTime: '2026-04-01',
          endTime: '2026-08-31T23:59:59',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('Begin time must be valid.'),
    })
  })

  it('returns 400 when endTime is malformed', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createAssignCardAdminClient().client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cardNo: '0102857149',
          beginTime: '2026-04-01T00:00:00',
          endTime: '2026-08-31',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('End time must be valid.'),
    })
  })

  it('returns 400 when endTime is not after beginTime', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createAssignCardAdminClient().client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cardNo: '0102857149',
          beginTime: '2026-04-01T00:00:00',
          endTime: '2026-04-01T00:00:00',
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

  it('returns 400 when the request body is invalid JSON', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createAssignCardAdminClient().client)

    const response = await POST(
      new Request('http://localhost/api/access/members/member-1/assign-card', {
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
