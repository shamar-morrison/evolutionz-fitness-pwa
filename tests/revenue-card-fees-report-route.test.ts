import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAdminUser,
  mockForbidden,
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
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET } from '@/app/api/reports/revenue/card-fees/route'

function createSupabaseCardFeeRevenueClient(
  overrides: Partial<Record<string, Array<Record<string, unknown>>>> = {},
) {
  const datasets = {
    member_payments: [] as Array<Record<string, unknown>>,
    members: [] as Array<Record<string, unknown>>,
    ...overrides,
  }

  return {
    client: {
      from(table: string) {
        const builder = {
          data: [...(datasets[table as keyof typeof datasets] ?? [])],
          error: null as { message: string } | null,
          select() {
            return this
          },
          eq(column: string, value: string) {
            this.data = this.data.filter((row) => String(row[column]) === value)
            return this
          },
          gte(column: string, value: string) {
            this.data = this.data.filter((row) => String(row[column]) >= value)
            return this
          },
          lte(column: string, value: string) {
            this.data = this.data.filter((row) => String(row[column]) <= value)
            return this
          },
          in(column: string, values: string[]) {
            this.data = this.data.filter((row) => values.includes(String(row[column])))
            return this
          },
          order() {
            return this
          },
        }

        return builder
      },
    },
  }
}

describe('GET /api/reports/revenue/card-fees', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the auth response when the user is forbidden', async () => {
    mockForbidden()

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/card-fees?from=2026-04-01&to=2026-04-30'),
    )

    expect(response.status).toBe(403)
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the required query params are missing', async () => {
    mockAdminUser()

    const response = await GET(new Request('http://localhost/api/reports/revenue/card-fees'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'From and to dates are required.',
    })
  })

  it('aggregates card fee revenue totals and monthly breakdowns', async () => {
    mockAdminUser()
    const { client } = createSupabaseCardFeeRevenueClient({
      member_payments: [
        {
          id: 'payment-1',
          member_id: 'member-1',
          member_type_id: null,
          payment_type: 'card_fee',
          payment_method: 'cash',
          amount_paid: 2500,
          payment_date: '2026-04-12',
          notes: 'Replacement card',
        },
        {
          id: 'payment-2',
          member_id: 'member-2',
          member_type_id: null,
          payment_type: 'card_fee',
          payment_method: 'fygaro',
          amount_paid: 2500,
          payment_date: '2026-04-03',
          notes: null,
        },
        {
          id: 'payment-3',
          member_id: 'member-1',
          member_type_id: null,
          payment_type: 'card_fee',
          payment_method: 'cash',
          amount_paid: 2500,
          payment_date: '2026-03-28',
          notes: null,
        },
      ],
      members: [
        { id: 'member-1', name: 'Member One' },
        { id: 'member-2', name: 'Member Two' },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/card-fees?from=2026-04-01&to=2026-04-30'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      summary: {
        totalRevenue: 5000,
        totalPayments: 2,
      },
      payments: [
        {
          id: 'payment-1',
          memberName: 'Member One',
          amount: 2500,
          paymentMethod: 'cash',
          paymentDate: '2026-04-12',
          notes: 'Replacement card',
        },
        {
          id: 'payment-2',
          memberName: 'Member Two',
          amount: 2500,
          paymentMethod: 'fygaro',
          paymentDate: '2026-04-03',
          notes: null,
        },
      ],
      monthlyBreakdown: [
        {
          month: '2026-04',
          totalRevenue: 5000,
          paymentCount: 2,
        },
      ],
    })
  })

  it('returns zeroed totals when no card fee payments match the selected range', async () => {
    mockAdminUser()
    const { client } = createSupabaseCardFeeRevenueClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/card-fees?from=2026-04-01&to=2026-04-30'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      summary: {
        totalRevenue: 0,
        totalPayments: 0,
      },
      payments: [],
      monthlyBreakdown: [],
    })
  })
})
