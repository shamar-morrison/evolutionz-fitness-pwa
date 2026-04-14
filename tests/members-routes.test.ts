import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockForbidden,
  mockUnauthorized,
  resetServerAuthMocks,
} from '@/tests/support/server-auth'

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

import { GET as getMembers } from '@/app/api/members/route'
import { GET as getMember, PATCH as patchMember } from '@/app/api/members/[id]/route'
import { MEMBER_RECORD_SELECT } from '@/lib/members'

const MEMBER_TYPE_ID_CIVIL_SERVANT = '22222222-2222-4222-8222-222222222222'

function createMembersAdminClient({
  listRows = [],
  listError = null,
  detailRow = null,
  detailError = null,
  cardRows = [],
  cardsError = null,
  publicUrl = 'https://public.example.com/member-photos/member-2.jpg',
}: {
  listRows?: Array<Record<string, unknown>>
  listError?: { message: string } | null
  detailRow?: Record<string, unknown> | null
  detailError?: { message: string } | null
  cardRows?: Array<Record<string, unknown>>
  cardsError?: { message: string } | null
  publicUrl?: string
} = {}) {
  return {
    from(table: string) {
      if (table === 'members') {
        return {
          select() {
            return {
              order() {
                return Promise.resolve({
                  data: listRows,
                  error: listError,
                })
              },
              eq() {
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
                expect(values).toBeDefined()

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
    storage: {
      from(bucket: string) {
        expect(bucket).toBe('member-photos')

        return {
          getPublicUrl(path: string) {
            expect(path).toBeDefined()

            return {
              data: { publicUrl },
            }
          },
        }
      },
    },
  }
}

describe('members API routes', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns mapped members from Supabase rows', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createMembersAdminClient({
        listRows: [
          {
            id: 'member-1',
            employee_no: ' 000611 ',
            name: ' A18 Jane Doe ',
            card_no: '0102857149',
            type: 'General',
            status: 'Expired',
            gender: 'Female',
            email: 'jane@example.com',
            phone: '876-555-1212',
            remark: 'Prefers morning sessions',
            photo_url: null,
            begin_time: '2026-03-30T00:00:00Z',
            end_time: null,
            balance: 2500,
            created_at: '2026-03-30T14:15:16Z',
            updated_at: '2026-03-30T14:15:16Z',
          },
        ],
        cardRows: [{ card_no: '0102857149', card_code: 'A18', status: 'assigned', lost_at: null }],
      }),
    )

    const response = await getMembers()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      members: [
        {
          id: 'member-1',
          employeeNo: '000611',
          name: 'Jane Doe',
          cardNo: '0102857149',
          cardCode: 'A18',
          cardStatus: 'assigned',
          cardLostAt: null,
          type: 'General',
          memberTypeId: null,
          status: 'Expired',
          deviceAccessState: 'ready',
          gender: 'Female',
          email: 'jane@example.com',
          phone: '876-555-1212',
          remark: 'Prefers morning sessions',
          photoUrl: null,
          beginTime: '2026-03-30T00:00:00.000Z',
          endTime: null,
        },
      ],
    })
  })

  it('returns 401 when the members list is requested without a session', async () => {
    mockUnauthorized()

    const response = await getMembers()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })

  it('returns a mapped member detail row', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createMembersAdminClient({
        detailRow: {
          id: 'member-2',
          employee_no: '000777',
          name: 'A1 Marcus Brown',
          card_no: '0102857149',
          type: 'Student/BPO',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: 'Requires weekend access',
          photo_url: null,
          begin_time: '2026-03-01T00:00:00Z',
          end_time: '2026-07-15T23:59:59Z',
          balance: 0,
          created_at: '2026-03-01T10:00:00Z',
          updated_at: '2026-03-01T10:00:00Z',
        },
        cardRows: [{ card_no: '0102857149', card_code: 'A1', status: 'assigned', lost_at: null }],
      }),
    )

    const response = await getMember(new Request('http://localhost/api/members/member-2'), {
      params: Promise.resolve({ id: 'member-2' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-2',
        employeeNo: '000777',
        name: 'Marcus Brown',
        cardNo: '0102857149',
        cardCode: 'A1',
        cardStatus: 'assigned',
        cardLostAt: null,
        type: 'Student/BPO',
        memberTypeId: null,
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: 'Requires weekend access',
        photoUrl: null,
        beginTime: '2026-03-01T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
      },
    })
  })

  it('hydrates the member photo with a public URL on detail reads', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createMembersAdminClient({
        detailRow: {
          id: 'member-2',
          employee_no: '000777',
          name: 'A1 Marcus Brown',
          card_no: '0102857149',
          type: 'Student/BPO',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: 'Requires weekend access',
          photo_url: 'member-2.jpg',
          begin_time: '2026-03-01T00:00:00Z',
          end_time: '2026-07-15T23:59:59Z',
          created_at: '2026-03-01T10:00:00Z',
          updated_at: '2026-03-01T10:00:00Z',
        },
        cardRows: [{ card_no: '0102857149', card_code: 'A1', status: 'assigned', lost_at: null }],
      }),
    )

    const response = await getMember(new Request('http://localhost/api/members/member-2'), {
      params: Promise.resolve({ id: 'member-2' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-2',
        employeeNo: '000777',
        name: 'Marcus Brown',
        cardNo: '0102857149',
        cardCode: 'A1',
        cardStatus: 'assigned',
        cardLostAt: null,
        type: 'Student/BPO',
        memberTypeId: null,
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: 'Requires weekend access',
        photoUrl: 'https://public.example.com/member-photos/member-2.jpg',
        beginTime: '2026-03-01T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
      },
    })
  })

  it('returns 403 when the member patch is requested by a non-admin user', async () => {
    mockForbidden()

    const response = await patchMember(
      new Request('http://localhost/api/members/member-2', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshStatus: true,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-2' }),
      },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
  })

  it('returns the public member photo when one is stored', async () => {
    getSupabaseAdminClientMock.mockReturnValue(
      createMembersAdminClient({
        detailRow: {
          id: 'member-2',
          employee_no: '000777',
          name: 'A1 Marcus Brown',
          card_no: '0102857149',
          type: 'Student/BPO',
          status: 'Active',
          gender: null,
          email: null,
          phone: null,
          remark: 'Requires weekend access',
          photo_url: 'member-2.jpg',
          begin_time: '2026-03-01T00:00:00Z',
          end_time: '2026-07-15T23:59:59Z',
          created_at: '2026-03-01T10:00:00Z',
          updated_at: '2026-03-01T10:00:00Z',
        },
        cardRows: [{ card_no: '0102857149', card_code: 'A1', status: 'assigned', lost_at: null }],
      }),
    )

    const response = await getMember(new Request('http://localhost/api/members/member-2'), {
      params: Promise.resolve({ id: 'member-2' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-2',
        employeeNo: '000777',
        name: 'Marcus Brown',
        cardNo: '0102857149',
        cardCode: 'A1',
        cardStatus: 'assigned',
        cardLostAt: null,
        type: 'Student/BPO',
        memberTypeId: null,
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: 'Requires weekend access',
        photoUrl: 'https://public.example.com/member-photos/member-2.jpg',
        beginTime: '2026-03-01T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
      },
    })
  })

  it('returns 404 when the member does not exist', async () => {
    getSupabaseAdminClientMock.mockReturnValue(createMembersAdminClient())

    const response = await getMember(new Request('http://localhost/api/members/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Member not found.',
    })
  })

  it('rejects the legacy status trigger field on PATCH', async () => {
    const response = await patchMember(
      new Request('http://localhost/api/members/member-2', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'Active',
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-2' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('status'),
    })
  })

  it('reactivates a member and returns the updated detail row', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T00:00:00Z'))

    const memberUpdates: Array<{ status: 'Active' | 'Expired'; id: string }> = []
    let memberReadCount = 0

    getSupabaseAdminClientMock.mockReturnValue({
      from(table: string) {
        if (table === 'members') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle() {
                      memberReadCount += 1

                      return Promise.resolve({
                        data: {
                          id: 'member-2',
                          employee_no: '000777',
                          name: 'Marcus Brown',
                          card_no: null,
                          type: 'Student/BPO',
                          status: memberReadCount === 1 ? 'Suspended' : 'Active',
                          gender: null,
                          email: null,
                          phone: null,
                          remark: 'Requires weekend access',
                          photo_url: null,
                          begin_time: '2026-03-01T00:00:00Z',
                          end_time: '2026-07-15T23:59:59Z',
                          balance: 0,
                          created_at: '2026-03-01T10:00:00Z',
                          updated_at: '2026-03-01T10:05:00Z',
                        },
                        error: null,
                      })
                    },
                  }
                },
              }
            },
            update(values: { status: 'Active' }) {
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
                          return Promise.resolve({
                            data: {
                              id: 'member-2',
                            },
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
        }

        if (table === 'cards') {
          return {
            select() {
              return {
                in() {
                  return Promise.resolve({
                    data: [],
                    error: null,
                  })
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    })

    const response = await patchMember(new Request('http://localhost/api/members/member-2', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshStatus: true,
      }),
    }), {
      params: Promise.resolve({ id: 'member-2' }),
    })

    expect(memberUpdates).toEqual([{ status: 'Active', id: 'member-2' }])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-2',
        employeeNo: '000777',
        name: 'Marcus Brown',
        cardNo: null,
        cardCode: null,
        cardStatus: null,
        cardLostAt: null,
        type: 'Student/BPO',
        memberTypeId: null,
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: 'Requires weekend access',
        photoUrl: null,
        beginTime: '2026-03-01T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
      },
    })
  })

  it('reactivates a suspended member as expired when the stored end time is already in the past', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T00:00:00Z'))

    const memberUpdates: Array<{ status: 'Active' | 'Expired'; id: string }> = []
    let memberReadCount = 0

    getSupabaseAdminClientMock.mockReturnValue({
      from(table: string) {
        if (table === 'members') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle() {
                      memberReadCount += 1

                      return Promise.resolve({
                        data: {
                          id: 'member-2',
                          employee_no: '000777',
                          name: 'Marcus Brown',
                          card_no: null,
                          type: 'Student/BPO',
                          status: memberReadCount === 1 ? 'Suspended' : 'Expired',
                          gender: null,
                          email: null,
                          phone: null,
                          remark: 'Requires weekend access',
                          photo_url: null,
                          begin_time: '2026-03-01T00:00:00Z',
                          end_time: '2026-03-15T23:59:59Z',
                          balance: 0,
                          created_at: '2026-03-01T10:00:00Z',
                          updated_at: '2026-03-01T10:05:00Z',
                        },
                        error: null,
                      })
                    },
                  }
                },
              }
            },
            update(values: { status: 'Active' | 'Expired' }) {
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
                          return Promise.resolve({
                            data: {
                              id: 'member-2',
                            },
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
        }

        if (table === 'cards') {
          return {
            select() {
              return {
                in() {
                  return Promise.resolve({
                    data: [],
                    error: null,
                  })
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    })

    const response = await patchMember(new Request('http://localhost/api/members/member-2', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshStatus: true,
      }),
    }), {
      params: Promise.resolve({ id: 'member-2' }),
    })

    expect(memberUpdates).toEqual([{ status: 'Expired', id: 'member-2' }])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-2',
        employeeNo: '000777',
        name: 'Marcus Brown',
        cardNo: null,
        cardCode: null,
        cardStatus: null,
        cardLostAt: null,
        type: 'Student/BPO',
        memberTypeId: null,
        status: 'Expired',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: 'Requires weekend access',
        photoUrl: null,
        beginTime: '2026-03-01T00:00:00.000Z',
        endTime: '2026-03-15T23:59:59.000Z',
      },
    })
  })

  it('updates the member type and keeps the legacy type field in sync on PATCH', async () => {
    const memberUpdates: Array<Record<string, unknown>> = []
    let memberReadCount = 0

    getSupabaseAdminClientMock.mockReturnValue({
      from(table: string) {
        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe(MEMBER_RECORD_SELECT)

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe('member-2')

                  return {
                    maybeSingle() {
                      memberReadCount += 1

                      return Promise.resolve({
                        data:
                          memberReadCount === 1
                            ? {
                                id: 'member-2',
                                employee_no: '000777',
                                name: 'A1 Marcus Brown',
                                card_no: '0102857149',
                                type: 'General',
                                member_type_id: null,
                                status: 'Active',
                                gender: null,
                                email: null,
                                phone: null,
                                remark: 'Requires weekend access',
                                photo_url: null,
                                begin_time: '2026-03-01T00:00:00Z',
                                end_time: '2026-07-15T23:59:59Z',
                                updated_at: '2026-03-01T10:00:00Z',
                              }
                            : {
                                id: 'member-2',
                                employee_no: '000777',
                                name: 'A1 Marcus Brown',
                                card_no: '0102857149',
                                type: 'Civil Servant',
                                member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
                                status: 'Active',
                                gender: null,
                                email: null,
                                phone: null,
                                remark: 'Requires weekend access',
                                photo_url: null,
                                begin_time: '2026-03-01T00:00:00Z',
                                end_time: '2026-07-15T23:59:59Z',
                                updated_at: '2026-03-01T10:05:00Z',
                              },
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
                  expect(value).toBe('member-2')

                  return {
                    select(columns: string) {
                      expect(columns).toBe(MEMBER_RECORD_SELECT)

                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: { id: 'member-2' },
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
        }

        if (table === 'member_types') {
          return {
            select(columns: string) {
              expect(columns).toBe('*')

              return {
                eq(column: string, value: string) {
                  expect(column).toBe('id')
                  expect(value).toBe(MEMBER_TYPE_ID_CIVIL_SERVANT)

                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: {
                          id: MEMBER_TYPE_ID_CIVIL_SERVANT,
                          name: 'Civil Servant',
                          monthly_rate: 7500,
                          is_active: true,
                          created_at: '2026-04-01T00:00:00.000Z',
                        },
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
                    data: [
                      {
                        card_no: '0102857149',
                        card_code: 'A1',
                        status: 'assigned',
                        lost_at: null,
                      },
                    ],
                    error: null,
                  })
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    })

    const response = await patchMember(
      new Request('http://localhost/api/members/member-2', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        }),
      }),
      {
        params: Promise.resolve({ id: 'member-2' }),
      },
    )

    expect(memberUpdates).toEqual([
      {
        member_type_id: MEMBER_TYPE_ID_CIVIL_SERVANT,
        type: 'Civil Servant',
      },
    ])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      member: {
        id: 'member-2',
        employeeNo: '000777',
        name: 'Marcus Brown',
        cardNo: '0102857149',
        cardCode: 'A1',
        cardStatus: 'assigned',
        cardLostAt: null,
        type: 'Civil Servant',
        memberTypeId: MEMBER_TYPE_ID_CIVIL_SERVANT,
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: 'Requires weekend access',
        photoUrl: null,
        beginTime: '2026-03-01T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
      },
    })
  })
})
