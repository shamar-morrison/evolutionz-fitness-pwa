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

import { GET } from '@/app/api/reports/revenue/membership/route'

type QueryOperation =
  | { table: string; type: 'select'; columns: string }
  | { table: string; type: 'gte' | 'lte'; column: string; value: string }
  | { table: string; type: 'in'; column: string; values: string[] }
  | { table: string; type: 'order'; column: string; ascending: boolean }

function createSupabaseMembershipRevenueClient(
  overrides: Partial<Record<string, Array<Record<string, unknown>>>> = {},
) {
  const operations: QueryOperation[] = []
  const datasets = {
    member_payments: [] as Array<Record<string, unknown>>,
    members: [] as Array<Record<string, unknown>>,
    member_types: [] as Array<Record<string, unknown>>,
    ...overrides,
  }

  return {
    operations,
    client: {
      from(table: string) {
        const builder = {
          data: datasets[table as keyof typeof datasets] ?? [],
          error: null as { message: string } | null,
          select(columns: string) {
            operations.push({ table, type: 'select', columns })
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
          in(column: string, values: string[]) {
            operations.push({ table, type: 'in', column, values })
            return this
          },
          order(column: string, options?: { ascending?: boolean }) {
            operations.push({
              table,
              type: 'order',
              column,
              ascending: options?.ascending ?? true,
            })
            return this
          },
        }

        return builder
      },
    },
  }
}

describe('GET /api/reports/revenue/membership', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the admin auth response when the user is forbidden', async () => {
    mockForbidden()

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/membership?from=2026-04-01&to=2026-04-30'),
    )

    expect(response.status).toBe(403)
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the required query params are missing', async () => {
    const response = await GET(new Request('http://localhost/api/reports/revenue/membership'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'From and to dates are required.',
    })
  })

  it('returns 400 for invalid or reversed date ranges', async () => {
    const invalidResponse = await GET(
      new Request(
        'http://localhost/api/reports/revenue/membership?from=2026-02-31&to=2026-04-30',
      ),
    )
    const reversedResponse = await GET(
      new Request(
        'http://localhost/api/reports/revenue/membership?from=2026-05-01&to=2026-04-30',
      ),
    )

    expect(invalidResponse.status).toBe(400)
    await expect(invalidResponse.json()).resolves.toEqual({
      ok: false,
      error: 'From and to dates must be valid calendar dates.',
    })
    expect(reversedResponse.status).toBe(400)
    await expect(reversedResponse.json()).resolves.toEqual({
      ok: false,
      error: 'From date must be on or before to date.',
    })
  })

  it('filters member payments by the inclusive payment_date range', async () => {
    const { client, operations } = createSupabaseMembershipRevenueClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/membership?from=2026-04-01&to=2026-04-30'),
    )

    expect(response.status).toBe(200)
    expect(operations).toEqual(
      expect.arrayContaining([
        {
          table: 'member_payments',
          type: 'gte',
          column: 'payment_date',
          value: '2026-04-01',
        },
        {
          table: 'member_payments',
          type: 'lte',
          column: 'payment_date',
          value: '2026-04-30',
        },
        {
          table: 'member_payments',
          type: 'order',
          column: 'payment_date',
          ascending: false,
        },
      ]),
    )
  })

  it('aggregates totals by member type and payment method', async () => {
    const { client } = createSupabaseMembershipRevenueClient({
      member_payments: [
        {
          id: 'payment-1',
          member_id: 'member-1',
          member_type_id: 'type-general',
          payment_method: 'cash',
          amount_paid: 12000,
          payment_date: '2026-04-10',
          notes: 'April renewal',
        },
        {
          id: 'payment-2',
          member_id: 'member-2',
          member_type_id: 'type-student',
          payment_method: 'fygaro',
          amount_paid: 9000,
          payment_date: '2026-04-09',
          notes: null,
        },
        {
          id: 'payment-3',
          member_id: 'member-1',
          member_type_id: 'type-general',
          payment_method: 'cash',
          amount_paid: 12000,
          payment_date: '2026-04-02',
          notes: null,
        },
      ],
      members: [
        { id: 'member-1', name: 'Member One' },
        { id: 'member-2', name: 'Member Two' },
      ],
      member_types: [
        { id: 'type-general', name: 'General' },
        { id: 'type-student', name: 'Student/BPO' },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/membership?from=2026-04-01&to=2026-04-30'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.summary).toEqual({
      totalRevenue: 33000,
      totalPayments: 3,
    })
    expect(body.payments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'payment-1',
          memberName: 'Member One',
          memberTypeName: 'General',
          amount: 12000,
          paymentMethod: 'cash',
          paymentDate: '2026-04-10',
        }),
        expect.objectContaining({
          id: 'payment-2',
          memberName: 'Member Two',
          memberTypeName: 'Student/BPO',
          amount: 9000,
          paymentMethod: 'fygaro',
          paymentDate: '2026-04-09',
        }),
      ]),
    )
    expect(body.totalsByMemberType).toEqual([
      {
        memberTypeName: 'General',
        totalRevenue: 24000,
        paymentCount: 2,
      },
      {
        memberTypeName: 'Civil Servant',
        totalRevenue: 0,
        paymentCount: 0,
      },
      {
        memberTypeName: 'Student/BPO',
        totalRevenue: 9000,
        paymentCount: 1,
      },
    ])
    expect(body.totalsByPaymentMethod).toEqual([
      {
        paymentMethod: 'cash',
        totalRevenue: 24000,
        paymentCount: 2,
      },
      {
        paymentMethod: 'fygaro',
        totalRevenue: 9000,
        paymentCount: 1,
      },
      {
        paymentMethod: 'bank_transfer',
        totalRevenue: 0,
        paymentCount: 0,
      },
      {
        paymentMethod: 'point_of_sale',
        totalRevenue: 0,
        paymentCount: 0,
      },
    ])
  })

  it('returns zeroed totals when no payments match the selected range', async () => {
    const { client } = createSupabaseMembershipRevenueClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/membership?from=2026-04-01&to=2026-04-30'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.summary).toEqual({
      totalRevenue: 0,
      totalPayments: 0,
    })
    expect(body.payments).toEqual([])
    expect(body.totalsByMemberType).toEqual([
      {
        memberTypeName: 'General',
        totalRevenue: 0,
        paymentCount: 0,
      },
      {
        memberTypeName: 'Civil Servant',
        totalRevenue: 0,
        paymentCount: 0,
      },
      {
        memberTypeName: 'Student/BPO',
        totalRevenue: 0,
        paymentCount: 0,
      },
    ])
    expect(body.totalsByPaymentMethod).toHaveLength(4)
  })
})
