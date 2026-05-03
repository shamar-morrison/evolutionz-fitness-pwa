import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetServerAuthMocks, mockUnauthorized } from '@/tests/support/server-auth'

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
  }
})

import { GET } from '@/app/api/members/picker/route'

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function createMemberPickerClient({
  memberRows = [
    {
      id: 'member-1',
      employee_no: '000777',
      name: 'A1 Marcus Brown',
      email: 'Marcus@Example.com',
      card_no: '0102857149',
      status: 'Active',
      created_at: '2026-03-01T10:00:00Z',
    },
    {
      id: 'member-2',
      employee_no: '000778',
      name: 'No Email',
      email: null,
      card_no: null,
      status: 'Active',
      created_at: '2026-03-02T10:00:00Z',
    },
  ],
  memberError = null,
  cardRows = [{ card_no: '0102857149', card_code: 'A1', status: 'assigned', lost_at: null }],
  cardsError = null,
}: {
  memberRows?: Array<Record<string, unknown>>
  memberError?: { message: string } | null
  cardRows?: Array<Record<string, unknown>>
  cardsError?: { message: string } | null
} = {}) {
  const recorded = {
    eq: [] as Array<[string, string]>,
    not: [] as Array<[string, string, null]>,
    order: [] as Array<[string, { ascending: boolean }]>,
    cardNos: [] as string[],
  }

  return {
    recorded,
    client: {
      from(table: string) {
        if (table === 'members') {
          return {
            select(columns: string) {
              expect(columns).toBe('id, employee_no, name, email, card_no, status, created_at')

              const builder = {
                order(column: string, options: { ascending: boolean }) {
                  recorded.order.push([column, options])
                  return builder
                },
                eq(column: string, value: string) {
                  recorded.eq.push([column, value])
                  return builder
                },
                not(column: string, operator: string, value: null) {
                  recorded.not.push([column, operator, value])
                  return builder
                },
                then(onfulfilled: (value: QueryResult<Array<Record<string, unknown>>>) => unknown) {
                  const filteredMemberRows =
                    recorded.not.some(
                      ([column, operator, value]) =>
                        column === 'email' && operator === 'is' && value === null,
                    )
                      ? memberRows.filter((row) => row.email !== null)
                      : memberRows

                  return Promise.resolve({
                    data: filteredMemberRows,
                    error: memberError,
                  } satisfies QueryResult<Array<Record<string, unknown>>>).then(onfulfilled)
                },
              }

              return builder
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
                  recorded.cardNos = values

                  return Promise.resolve({
                    data: cardRows,
                    error: cardsError,
                  } satisfies QueryResult<Array<Record<string, unknown>>>)
                },
              }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    },
  }
}

describe('GET /api/members/picker', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns a stripped picker payload and applies filters', async () => {
    const client = createMemberPickerClient()
    getSupabaseAdminClientMock.mockReturnValue(client.client)

    const response = await GET(
      new Request('http://localhost/api/members/picker?status=Active&hasEmail=true'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      members: [
        {
          id: 'member-1',
          name: 'Marcus Brown',
          email: 'marcus@example.com',
        },
      ],
    })
    expect(client.recorded.eq).toEqual([['status', 'Active']])
    expect(client.recorded.not).toEqual([['email', 'is', null]])
    expect(client.recorded.order).toEqual([['created_at', { ascending: false }]])
    expect(client.recorded.cardNos).toEqual(['0102857149'])
  })

  it('excludes empty normalized emails when hasEmail is true', async () => {
    const client = createMemberPickerClient({
      memberRows: [
        {
          id: 'member-1',
          employee_no: '000777',
          name: 'A1 Marcus Brown',
          email: 'Marcus@Example.com',
          card_no: '0102857149',
          status: 'Active',
          created_at: '2026-03-01T10:00:00Z',
        },
        {
          id: 'member-2',
          employee_no: '000778',
          name: 'Empty Email',
          email: '',
          card_no: null,
          status: 'Active',
          created_at: '2026-03-02T10:00:00Z',
        },
        {
          id: 'member-3',
          employee_no: '000779',
          name: 'Whitespace Email',
          email: '   ',
          card_no: null,
          status: 'Active',
          created_at: '2026-03-03T10:00:00Z',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client.client)

    const response = await GET(new Request('http://localhost/api/members/picker?hasEmail=true'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      members: [
        {
          id: 'member-1',
          name: 'Marcus Brown',
          email: 'marcus@example.com',
        },
      ],
    })
    expect(client.recorded.not).toEqual([['email', 'is', null]])
  })

  it('returns 400 when the status filter is invalid', async () => {
    const response = await GET(
      new Request('http://localhost/api/members/picker?status=Expiring'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('Invalid enum value'),
    })
  })

  it('returns 401 when authentication fails', async () => {
    mockUnauthorized()

    const response = await GET(new Request('http://localhost/api/members/picker'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
  })
})
