import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockUnauthorized, resetServerAuthMocks } from '@/tests/support/server-auth'

const { getSupabaseAdminClientMock } = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: getSupabaseAdminClientMock,
}))

vi.mock('@/lib/server-auth', async () => {
  const mod = await import('@/tests/support/server-auth')

  return {
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET } from '@/app/api/email/recipients/route'

type MemberRow = {
  id: string
  name: string
  email: string | null
  status: 'Active' | 'Expired' | 'Suspended'
  member_type_id: string | null
  end_time: string | null
}

function createMembersQuery(rows: MemberRow[]) {
  const filters: Array<(row: MemberRow) => boolean> = []
  let orderBy: { column: keyof MemberRow; ascending: boolean } | null = null

  const builder = {
    eq(column: keyof MemberRow, value: unknown) {
      filters.push((row) => row[column] === value)
      return builder
    },
    in(column: keyof MemberRow, values: string[]) {
      filters.push((row) => {
        const rowValue = row[column]
        return typeof rowValue === 'string' && values.includes(rowValue)
      })
      return builder
    },
    gte(column: keyof MemberRow, value: string) {
      filters.push((row) => {
        const rowValue = row[column]
        return typeof rowValue === 'string' && rowValue >= value
      })
      return builder
    },
    lt(column: keyof MemberRow, value: string) {
      filters.push((row) => {
        const rowValue = row[column]
        return typeof rowValue === 'string' && rowValue < value
      })
      return builder
    },
    order(column: keyof MemberRow, options: { ascending: boolean }) {
      orderBy = {
        column,
        ascending: options.ascending,
      }
      return builder
    },
    then(onfulfilled: (value: unknown) => unknown, onrejected?: (reason: unknown) => unknown) {
      let data = rows.filter((row) => filters.every((filter) => filter(row)))

      if (orderBy) {
        const currentOrder = orderBy
        data = [...data].sort((left, right) => {
          const leftValue = left[currentOrder.column] ?? ''
          const rightValue = right[currentOrder.column] ?? ''
          const comparison = String(leftValue).localeCompare(String(rightValue))
          return currentOrder.ascending ? comparison : -comparison
        })
      }

      return Promise.resolve({
        data: data.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
        })),
        error: null,
      }).then(onfulfilled, onrejected)
    },
  }

  return builder
}

function createMembersClient(rows: MemberRow[]) {
  return {
    from(table: string) {
      expect(table).toBe('members')

      return {
        select(columns: string) {
          expect(columns).toBe('id, name, email')
          return createMembersQuery(rows)
        },
      }
    },
  }
}

describe('GET /api/email/recipients', () => {
  afterEach(() => {
    vi.useRealTimers()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the union of matching recipients and removes duplicates by member id', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T12:00:00.000Z'))
    const activeMemberTypeId = '123e4567-e89b-12d3-a456-426614174100'
    const expiringMemberTypeId = '123e4567-e89b-12d3-a456-426614174101'
    const expiredMemberTypeId = '123e4567-e89b-12d3-a456-426614174102'
    const directMemberId = '123e4567-e89b-12d3-a456-426614174004'

    getSupabaseAdminClientMock.mockReturnValue(
      createMembersClient([
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'Active Member',
          email: 'active@example.com',
          status: 'Active',
          member_type_id: activeMemberTypeId,
          end_time: '2026-05-01T00:00:00-05:00',
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          name: 'Expiring Member',
          email: 'expiring@example.com',
          status: 'Active',
          member_type_id: expiringMemberTypeId,
          end_time: '2026-04-16T00:00:00-05:00',
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174003',
          name: 'Type Match',
          email: 'type@example.com',
          status: 'Active',
          member_type_id: expiredMemberTypeId,
          end_time: '2026-05-15T00:00:00-05:00',
        },
        {
          id: directMemberId,
          name: 'Expired Direct',
          email: 'direct@example.com',
          status: 'Expired',
          member_type_id: expiredMemberTypeId,
          end_time: '2026-04-01T00:00:00-05:00',
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174005',
          name: 'Blank Email',
          email: '',
          status: 'Active',
          member_type_id: expiringMemberTypeId,
          end_time: '2026-04-17T00:00:00-05:00',
        },
      ]),
    )

    const response = await GET(
      new Request(
        `http://localhost/api/email/recipients?activeMembers=true&expiringMembers=true&expiredMembers=true&activeMemberTypeIds=${activeMemberTypeId}&expiringMemberTypeIds=${expiringMemberTypeId}&expiredMemberTypeIds=${expiredMemberTypeId}&individualIds=${directMemberId}`,
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      recipients: [
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'Active Member',
          email: 'active@example.com',
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          name: 'Expiring Member',
          email: 'expiring@example.com',
        },
        {
          id: directMemberId,
          name: 'Expired Direct',
          email: 'direct@example.com',
        },
      ],
    })
  })

  it('returns 400 when the filters contain invalid ids', async () => {
    const response = await GET(
      new Request('http://localhost/api/email/recipients?activeMemberTypeIds=not-a-uuid'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('Recipient filters must use valid IDs.'),
    })
  })

  it('returns 401 when the user is not authenticated as an admin', async () => {
    mockUnauthorized()

    const response = await GET(new Request('http://localhost/api/email/recipients'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })
})
