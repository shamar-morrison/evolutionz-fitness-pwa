import { afterEach, describe, expect, it, vi } from 'vitest'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { GET as getMembers } from '@/app/api/members/route'
import { GET as getMember, PATCH as patchMember } from '@/app/api/members/[id]/route'

function createMembersAdminClient({
  listRows = [],
  listError = null,
  detailRow = null,
  detailError = null,
  cardRows = [],
  cardsError = null,
}: {
  listRows?: Array<Record<string, unknown>>
  listError?: { message: string } | null
  detailRow?: Record<string, unknown> | null
  detailError?: { message: string } | null
  cardRows?: Array<Record<string, unknown>>
  cardsError?: { message: string } | null
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
            expect(columns).toBe('card_no, card_code')

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
  }
}

describe('members API routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
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
        cardRows: [{ card_no: '0102857149', card_code: 'A18' }],
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
          type: 'General',
          status: 'Expired',
          deviceAccessState: 'ready',
          gender: 'Female',
          email: 'jane@example.com',
          phone: '876-555-1212',
          remark: 'Prefers morning sessions',
          photoUrl: null,
          beginTime: '2026-03-30T00:00:00.000Z',
          endTime: null,
          balance: 2500,
          createdAt: '2026-03-30T14:15:16.000Z',
        },
      ],
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
        cardRows: [{ card_no: '0102857149', card_code: 'A1' }],
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
        type: 'Student/BPO',
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: 'Requires weekend access',
        photoUrl: null,
        beginTime: '2026-03-01T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
        balance: 0,
        createdAt: '2026-03-01T10:00:00.000Z',
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

  it('reactivates a member and returns the updated detail row', async () => {
    const memberUpdates: Array<{ status: 'Active'; id: string }> = []

    getSupabaseAdminClientMock.mockReturnValue({
      from(table: string) {
        if (table === 'members') {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle() {
                      return Promise.resolve({
                        data: {
                          id: 'member-2',
                          employee_no: '000777',
                          name: 'Marcus Brown',
                          card_no: null,
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
                      expect(columns).toBe(
                        'id, employee_no, name, card_no, type, status, gender, email, phone, remark, photo_url, begin_time, end_time, balance, created_at, updated_at',
                      )

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
        status: 'Active',
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
        type: 'Student/BPO',
        status: 'Active',
        deviceAccessState: 'ready',
        gender: null,
        email: null,
        phone: null,
        remark: 'Requires weekend access',
        photoUrl: null,
        beginTime: '2026-03-01T00:00:00.000Z',
        endTime: '2026-07-15T23:59:59.000Z',
        balance: 0,
        createdAt: '2026-03-01T10:00:00.000Z',
      },
    })
  })
})
