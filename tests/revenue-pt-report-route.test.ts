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

import { GET } from '@/app/api/reports/revenue/pt/route'

type QueryOperation =
  | { table: string; type: 'select'; columns: string }
  | { table: string; type: 'eq' | 'gte' | 'lte' | 'lt'; column: string; value: string }
  | { table: string; type: 'in'; column: string; values: string[] }
  | { table: string; type: 'order'; column: string; ascending: boolean }

function createSupabasePtRevenueClient(
  overrides: Partial<Record<string, Array<Record<string, unknown>>>> = {},
) {
  const operations: QueryOperation[] = []
  const datasets = {
    pt_payments: [] as Array<Record<string, unknown>>,
    profiles: [] as Array<Record<string, unknown>>,
    members: [] as Array<Record<string, unknown>>,
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
          eq(column: string, value: string) {
            operations.push({ table, type: 'eq', column, value })
            return this
          },
          gte(column: string, value: string) {
            operations.push({ table, type: 'gte', column, value })
            return this
          },
          lt(column: string, value: string) {
            operations.push({ table, type: 'lt', column, value })
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

describe('GET /api/reports/revenue/pt', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the auth response when the user is forbidden', async () => {
    mockForbidden()

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/pt?from=2026-04-01&to=2026-04-30'),
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
      new Request('http://localhost/api/reports/revenue/pt?from=2026-04-01&to=2026-04-30'),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the required query params are missing', async () => {
    const response = await GET(new Request('http://localhost/api/reports/revenue/pt'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'From and to dates are required.',
    })
  })

  it('returns 400 for invalid or reversed date ranges', async () => {
    const invalidResponse = await GET(
      new Request('http://localhost/api/reports/revenue/pt?from=2026-02-31&to=2026-04-30'),
    )
    const reversedResponse = await GET(
      new Request('http://localhost/api/reports/revenue/pt?from=2026-05-01&to=2026-04-30'),
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
      new Request('http://localhost/api/reports/revenue/pt?from=bad&to=2026-04-30'),
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

  it('uses plain payment_date bounds without timezone shifting', async () => {
    const { client, operations } = createSupabasePtRevenueClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/pt?from=2026-04-01&to=2026-04-30'),
    )

    expect(response.status).toBe(200)
    expect(operations).toEqual(
      expect.arrayContaining([
        {
          table: 'pt_payments',
          type: 'gte',
          column: 'payment_date',
          value: '2026-04-01',
        },
        {
          table: 'pt_payments',
          type: 'lte',
          column: 'payment_date',
          value: '2026-04-30',
        },
        {
          table: 'pt_payments',
          type: 'order',
          column: 'payment_date',
          ascending: false,
        },
      ]),
    )
    expect(operations.some((operation) => JSON.stringify(operation).includes('-05:00'))).toBe(false)
  })

  it('aggregates PT revenue by payment and trainer', async () => {
    const { client, operations } = createSupabasePtRevenueClient({
      pt_payments: [
        {
          id: 'payment-1',
          trainer_id: 'trainer-1',
          member_id: 'member-1',
          amount: 15000,
          months_covered: 1,
          payment_method: 'cash',
          notes: null,
          payment_date: '2026-04-10',
        },
        {
          id: 'payment-2',
          trainer_id: 'trainer-1',
          member_id: 'member-2',
          amount: 18000,
          months_covered: 2,
          payment_method: 'bank_transfer',
          notes: 'Paid ahead',
          payment_date: '2026-04-08',
        },
        {
          id: 'payment-3',
          trainer_id: 'trainer-2',
          member_id: 'member-3',
          amount: 20000,
          months_covered: 1,
          payment_method: 'point_of_sale',
          notes: null,
          payment_date: '2026-04-03',
        },
        {
          id: 'payment-4',
          trainer_id: null,
          member_id: 'member-4',
          amount: 12000,
          months_covered: 1,
          payment_method: 'fygaro',
          notes: 'No trainer yet',
          payment_date: '2026-04-01',
        },
      ],
      profiles: [
        { id: 'trainer-1', name: 'Jordan Trainer' },
        { id: 'trainer-2', name: 'Alex Coach' },
      ],
      members: [
        { id: 'member-1', name: 'J11 First Member', card_code: 'J11' },
        { id: 'member-2', name: 'Second Member', card_code: null },
        { id: 'member-3', name: 'Third Member', card_code: null },
        { id: 'member-4', name: 'Fourth Member', card_code: null },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/pt?from=2026-04-01&to=2026-04-30'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.summary).toEqual({
      totalRevenue: 65000,
      totalSessionsCompleted: 0,
    })
    expect(body.sessions).toEqual([])
    expect(body.totalsByTrainer).toEqual([
      {
        trainerId: 'trainer-2',
        trainerName: 'Alex Coach',
        totalRevenue: 20000,
        sessionCount: 0,
        payments: [
          {
            id: 'payment-3',
            memberId: 'member-3',
            memberName: 'Third Member',
            amount: 20000,
            monthsCovered: 1,
            paymentMethod: 'point_of_sale',
            paymentDate: '2026-04-03',
            notes: null,
          },
        ],
      },
      {
        trainerId: 'trainer-1',
        trainerName: 'Jordan Trainer',
        totalRevenue: 33000,
        sessionCount: 0,
        payments: [
          {
            id: 'payment-1',
            memberId: 'member-1',
            memberName: 'First Member',
            amount: 15000,
            monthsCovered: 1,
            paymentMethod: 'cash',
            paymentDate: '2026-04-10',
            notes: null,
          },
          {
            id: 'payment-2',
            memberId: 'member-2',
            memberName: 'Second Member',
            amount: 18000,
            monthsCovered: 2,
            paymentMethod: 'bank_transfer',
            paymentDate: '2026-04-08',
            notes: 'Paid ahead',
          },
        ],
      },
      {
        trainerId: 'unassigned',
        trainerName: 'Unassigned',
        totalRevenue: 12000,
        sessionCount: 0,
        payments: [
          {
            id: 'payment-4',
            memberId: 'member-4',
            memberName: 'Fourth Member',
            amount: 12000,
            monthsCovered: 1,
            paymentMethod: 'fygaro',
            paymentDate: '2026-04-01',
            notes: 'No trainer yet',
          },
        ],
      },
    ])
    expect(
      operations.find((operation) => operation.table === 'profiles' && operation.type === 'in'),
    ).toMatchObject({
      values: ['trainer-1', 'trainer-2'],
    })
  })

  it('does not read trainer_clients or pt_sessions when calculating PT revenue', async () => {
    const { client, operations } = createSupabasePtRevenueClient({
      pt_payments: [
        {
          id: 'payment-1',
          trainer_id: 'trainer-1',
          member_id: 'member-1',
          amount: 15000,
          months_covered: 1,
          payment_method: 'cash',
          notes: null,
          payment_date: '2026-04-10',
        },
      ],
      profiles: [{ id: 'trainer-1', name: 'Jordan Trainer' }],
      members: [{ id: 'member-1', name: 'Member One', card_code: null }],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/pt?from=2026-04-01&to=2026-04-30'),
    )
    await response.json()

    expect(response.status).toBe(200)
    expect(operations.every((operation) => operation.table !== 'pt_sessions')).toBe(true)
    expect(operations.every((operation) => operation.table !== 'trainer_clients')).toBe(true)
  })

  it('returns an empty PT report when no payments are recorded in range', async () => {
    const { client } = createSupabasePtRevenueClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/pt?from=2026-04-01&to=2026-04-30'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      summary: {
        totalRevenue: 0,
        totalSessionsCompleted: 0,
      },
      sessions: [],
      totalsByTrainer: [],
    })
  })

  it('returns a generic 500 response when an unexpected error occurs', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    getSupabaseAdminClientMock.mockImplementation(() => {
      throw new Error('secret pt failure')
    })

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/pt?from=2026-04-01&to=2026-04-30'),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Unexpected server error while loading the PT revenue report.',
    })
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
