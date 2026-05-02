import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAuthenticatedProfile,
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
    requireAuthenticatedProfile: mod.requireAuthenticatedProfileMock,
  }
})

import { GET } from '@/app/api/reports/revenue/overall/route'

function createSupabaseOverallRevenueClient(
  overrides: Partial<Record<string, Array<Record<string, unknown>>>> = {},
) {
  const datasets = {
    member_payments: [] as Array<Record<string, unknown>>,
    member_types: [] as Array<Record<string, unknown>>,
    members: [] as Array<Record<string, unknown>>,
    pt_sessions: [] as Array<Record<string, unknown>>,
    trainer_clients: [] as Array<Record<string, unknown>>,
    profiles: [] as Array<Record<string, unknown>>,
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
          gte() {
            if (arguments.length >= 2) {
              const [column, value] = arguments as unknown as [string, string]
              this.data = this.data.filter((row) => String(row[column]) >= value)
            }
            return this
          },
          lte() {
            if (arguments.length >= 2) {
              const [column, value] = arguments as unknown as [string, string]
              this.data = this.data.filter((row) => String(row[column]) <= value)
            }
            return this
          },
          lt() {
            if (arguments.length >= 2) {
              const [column, value] = arguments as unknown as [string, string]
              this.data = this.data.filter((row) => String(row[column]) < value)
            }
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

describe('GET /api/reports/revenue/overall', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the auth response when the user is forbidden', async () => {
    mockForbidden()

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/overall?from=2026-04-01&to=2026-04-30'),
    )

    expect(response.status).toBe(403)
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('returns 403 when the authenticated profile lacks report permissions', async () => {
    mockAuthenticatedProfile({
      profile: {
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/overall?from=2026-04-01&to=2026-04-30'),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the required query params are missing', async () => {
    const response = await GET(new Request('http://localhost/api/reports/revenue/overall'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'From and to dates are required.',
    })
  })

  it('returns 400 for invalid or reversed date ranges', async () => {
    const invalidResponse = await GET(
      new Request('http://localhost/api/reports/revenue/overall?from=2026-02-31&to=2026-04-30'),
    )
    const reversedResponse = await GET(
      new Request('http://localhost/api/reports/revenue/overall?from=2026-05-01&to=2026-04-30'),
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

  it('returns a stable validation error payload for malformed query params', async () => {
    const response = await GET(
      new Request('http://localhost/api/reports/revenue/overall?from=bad&to=2026-04-30'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Revenue report filters are invalid.',
      details: [
        {
          field: 'from',
          message: 'From date must use YYYY-MM-DD format.',
        },
      ],
    })
  })

  it('combines membership and PT totals into a single overall report', async () => {
    const { client } = createSupabaseOverallRevenueClient({
      member_payments: [
        {
          id: 'payment-1',
          member_id: 'member-1',
          member_type_id: 'type-general',
          payment_type: 'membership',
          payment_method: 'cash',
          amount_paid: 12000,
          payment_date: '2026-04-02',
          notes: null,
        },
      ],
      member_types: [{ id: 'type-general', name: 'General' }],
      members: [{ id: 'member-1', name: 'Member One' }],
      pt_sessions: [
        {
          id: 'session-1',
          assignment_id: 'assignment-1',
          trainer_id: 'trainer-1',
          member_id: 'member-1',
          scheduled_at: '2026-04-10T09:00:00-05:00',
          status: 'completed',
        },
      ],
      trainer_clients: [{ id: 'assignment-1', pt_fee: 15000 }],
      profiles: [{ id: 'trainer-1', name: 'Jordan Trainer' }],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/overall?from=2026-04-01&to=2026-04-30'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.summary).toEqual({
      grandTotal: 27000,
      membershipRevenue: 12000,
      cardFeeRevenue: 0,
      ptRevenue: 15000,
    })
    expect(body.breakdown).toHaveLength(3)
    expect(body.breakdown[0]).toEqual(
      expect.objectContaining({
        revenueStream: 'Membership',
        amount: 12000,
      }),
    )
    expect(body.breakdown[1]).toEqual(
      expect.objectContaining({
        revenueStream: 'Card Fees',
        amount: 0,
      }),
    )
    expect(body.breakdown[2]).toEqual(
      expect.objectContaining({
        revenueStream: 'PT Revenue',
        amount: 15000,
      }),
    )
    expect(body.breakdown[0].percentageOfTotal).toBeCloseTo(44.444, 2)
    expect(body.breakdown[1].percentageOfTotal).toBeCloseTo(0, 2)
    expect(body.breakdown[2].percentageOfTotal).toBeCloseTo(55.555, 2)
  })

  it('excludes PT sessions tied to null PT fees from the overall PT revenue totals', async () => {
    const { client } = createSupabaseOverallRevenueClient({
      member_payments: [
        {
          id: 'payment-1',
          member_id: 'member-1',
          member_type_id: 'type-general',
          payment_type: 'membership',
          payment_method: 'cash',
          amount_paid: 12000,
          payment_date: '2026-04-02',
          notes: null,
        },
      ],
      member_types: [{ id: 'type-general', name: 'General' }],
      members: [
        { id: 'member-1', name: 'Member One' },
        { id: 'member-2', name: 'Member Two' },
      ],
      pt_sessions: [
        {
          id: 'session-1',
          assignment_id: 'assignment-1',
          trainer_id: 'trainer-1',
          member_id: 'member-1',
          scheduled_at: '2026-04-10T09:00:00-05:00',
          status: 'completed',
        },
        {
          id: 'session-2',
          assignment_id: 'assignment-2',
          trainer_id: 'trainer-1',
          member_id: 'member-2',
          scheduled_at: '2026-04-12T09:00:00-05:00',
          status: 'completed',
        },
      ],
      trainer_clients: [
        { id: 'assignment-1', pt_fee: 15000 },
        { id: 'assignment-2', pt_fee: null },
      ],
      profiles: [{ id: 'trainer-1', name: 'Jordan Trainer' }],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/overall?from=2026-04-01&to=2026-04-30'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.summary).toEqual({
      grandTotal: 27000,
      membershipRevenue: 12000,
      cardFeeRevenue: 0,
      ptRevenue: 15000,
    })
    expect(body.breakdown).toHaveLength(3)
    expect(body.breakdown[0]).toEqual(
      expect.objectContaining({
        revenueStream: 'Membership',
        amount: 12000,
      }),
    )
    expect(body.breakdown[1]).toEqual(
      expect.objectContaining({
        revenueStream: 'Card Fees',
        amount: 0,
      }),
    )
    expect(body.breakdown[2]).toEqual(
      expect.objectContaining({
        revenueStream: 'PT Revenue',
        amount: 15000,
      }),
    )
    expect(body.breakdown[0].percentageOfTotal).toBeCloseTo(44.444, 2)
    expect(body.breakdown[1].percentageOfTotal).toBeCloseTo(0, 2)
    expect(body.breakdown[2].percentageOfTotal).toBeCloseTo(55.555, 2)
  })

  it('returns zeroed summary values when there is no revenue in range', async () => {
    const { client } = createSupabaseOverallRevenueClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/overall?from=2026-04-01&to=2026-04-30'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      summary: {
        grandTotal: 0,
        membershipRevenue: 0,
        cardFeeRevenue: 0,
        ptRevenue: 0,
      },
      breakdown: [
        {
          revenueStream: 'Membership',
          amount: 0,
          percentageOfTotal: 0,
        },
        {
          revenueStream: 'Card Fees',
          amount: 0,
          percentageOfTotal: 0,
        },
        {
          revenueStream: 'PT Revenue',
          amount: 0,
          percentageOfTotal: 0,
        },
      ],
    })
  })

  it('returns a generic 500 response when an unexpected error occurs', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    getSupabaseAdminClientMock.mockImplementation(() => {
      throw new Error('secret overall failure')
    })

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/overall?from=2026-04-01&to=2026-04-30'),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Unexpected server error while loading the overall revenue report.',
    })
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
