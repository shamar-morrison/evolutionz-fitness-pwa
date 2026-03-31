import { afterEach, describe, expect, it, vi } from 'vitest'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

import { GET as getMembers } from '@/app/api/members/route'
import { GET as getMember } from '@/app/api/members/[id]/route'

function createMembersAdminClient({
  listRows = [],
  listError = null,
  detailRow = null,
  detailError = null,
}: {
  listRows?: Array<Record<string, unknown>>
  listError?: { message: string } | null
  detailRow?: Record<string, unknown> | null
  detailError?: { message: string } | null
} = {}) {
  return {
    from(table: string) {
      if (table !== 'members') {
        throw new Error(`Unexpected table: ${table}`)
      }

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
            name: ' Jane Doe ',
            card_no: null,
            type: 'General',
            status: 'Expired',
            expiry: null,
            balance: 2500,
            created_at: '2026-03-30T14:15:16Z',
            updated_at: '2026-03-30T14:15:16Z',
          },
        ],
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
          cardNo: '',
          type: 'General',
          status: 'Expired',
          deviceAccessState: 'ready',
          expiry: null,
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
          name: 'Marcus Brown',
          card_no: '0102857149',
          type: 'Student/BPO',
          status: 'Active',
          expiry: '2026-07-15T23:59:59Z',
          balance: 0,
          created_at: '2026-03-01T10:00:00Z',
          updated_at: '2026-03-01T10:00:00Z',
        },
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
        type: 'Student/BPO',
        status: 'Active',
        deviceAccessState: 'ready',
        expiry: '2026-07-15T23:59:59.000Z',
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
})
