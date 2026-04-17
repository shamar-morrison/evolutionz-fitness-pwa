import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockForbidden, resetServerAuthMocks } from '@/tests/support/server-auth'

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

import { GET } from '@/app/api/reports/members/signups/route'

type QueryOperation =
  | { table: string; type: 'select'; columns: string }
  | { table: string; type: 'not'; column: string; operator: string; value: null }
  | { table: string; type: 'gte' | 'lte'; column: string; value: string }
  | { table: string; type: 'order'; column: string; ascending: boolean }

function createSupabaseMemberSignupsReportClient(
  members: Array<Record<string, unknown>> = [],
  error: { message: string } | null = null,
) {
  const operations: QueryOperation[] = []

  return {
    operations,
    client: {
      from(table: string) {
        return {
          select(columns: string) {
            operations.push({ table, type: 'select', columns })
            return this
          },
          not(column: string, operator: string, value: null) {
            operations.push({ table, type: 'not', column, operator, value })
            return this
          },
          gte(column: string, value: string) {
            operations.push({ table, type: 'gte', column, value })
            return this
          },
          lte(column: string, value: string) {
            operations.push({ table, type: 'lte', column, value })
            return this
          },
          order(column: string, options: { ascending: boolean }) {
            operations.push({ table, type: 'order', column, ascending: options.ascending })
            return Promise.resolve({
              data: members,
              error,
            })
          },
        }
      },
    },
  }
}

describe('GET /api/reports/members/signups', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the admin auth response when the user is forbidden', async () => {
    mockForbidden()

    const response = await GET(
      new Request(
        'http://localhost/api/reports/members/signups?startDate=2026-04-01&endDate=2026-04-30',
      ),
    )

    expect(response.status).toBe(403)
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('returns 400 when required query params are missing', async () => {
    const response = await GET(new Request('http://localhost/api/reports/members/signups'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Start date and end date are required.',
    })
  })

  it('returns 400 for invalid or reversed date ranges', async () => {
    const invalidResponse = await GET(
      new Request(
        'http://localhost/api/reports/members/signups?startDate=2026-02-31&endDate=2026-04-30',
      ),
    )
    const reversedResponse = await GET(
      new Request(
        'http://localhost/api/reports/members/signups?startDate=2026-05-01&endDate=2026-04-30',
      ),
    )

    expect(invalidResponse.status).toBe(400)
    await expect(invalidResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Start date and end date must be valid calendar dates.',
    })
    expect(reversedResponse.status).toBe(400)
    await expect(reversedResponse.json()).resolves.toEqual({
      ok: false,
      error: 'Start date must be on or before end date.',
    })
  })

  it('filters by joined_at, excludes null join dates, and returns normalized members', async () => {
    const { client, operations } = createSupabaseMemberSignupsReportClient([
      {
        id: 'member-2',
        name: 'Member Two',
        type: 'Student/BPO',
        status: 'Expired',
        joined_at: null,
      },
      {
        id: 'member-1',
        name: 'Member One',
        type: 'General',
        status: 'Active',
        joined_at: '2026-04-18',
      },
    ])
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request(
        'http://localhost/api/reports/members/signups?startDate=2026-04-01&endDate=2026-04-30',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      members: [
        {
          id: 'member-1',
          name: 'Member One',
          type: 'General',
          status: 'Active',
          joinedAt: '2026-04-18',
        },
      ],
    })

    expect(operations).toEqual([
      {
        table: 'members',
        type: 'select',
        columns: 'id, name, type, status, joined_at',
      },
      {
        table: 'members',
        type: 'not',
        column: 'joined_at',
        operator: 'is',
        value: null,
      },
      {
        table: 'members',
        type: 'gte',
        column: 'joined_at',
        value: '2026-04-01',
      },
      {
        table: 'members',
        type: 'lte',
        column: 'joined_at',
        value: '2026-04-30',
      },
      {
        table: 'members',
        type: 'order',
        column: 'joined_at',
        ascending: false,
      },
    ])
  })
})
