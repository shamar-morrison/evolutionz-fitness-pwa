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
  | { table: string; type: 'gte' | 'lte' | 'lt'; column: string; value: string }
  | { table: string; type: 'in'; column: string; values: string[] }
  | { table: string; type: 'order'; column: string; ascending: boolean }

function createSupabaseMemberSignupsReportClient({
  members = [],
  memberPayments = [],
  memberTypes = [],
}: {
  members?: Array<Record<string, unknown>>
  memberPayments?: Array<Record<string, unknown>>
  memberTypes?: Array<Record<string, unknown>>
} = {}) {
  const operations: QueryOperation[] = []
  const datasets = {
    members,
    member_payments: memberPayments,
    member_types: memberTypes,
  }

  function createQueryBuilder(table: keyof typeof datasets) {
    let data = [...datasets[table]]

    const builder = {
      select(columns: string) {
        operations.push({ table, type: 'select', columns })
        return builder
      },
      not(column: string, operator: string, value: null) {
        operations.push({ table, type: 'not', column, operator, value })

        if (operator === 'is' && value === null) {
          data = data.filter((row) => row[column] !== null)
        }

        return builder
      },
      gte(column: string, value: string) {
        operations.push({ table, type: 'gte', column, value })
        data = data.filter((row) => String(row[column]) >= value)
        return builder
      },
      lte(column: string, value: string) {
        operations.push({ table, type: 'lte', column, value })
        data = data.filter((row) => String(row[column]) <= value)
        return builder
      },
      lt(column: string, value: string) {
        operations.push({ table, type: 'lt', column, value })
        data = data.filter((row) => String(row[column]) < value)
        return builder
      },
      in(column: string, values: string[]) {
        operations.push({ table, type: 'in', column, values })
        data = data.filter((row) => values.includes(String(row[column])))
        return builder
      },
      order(column: string, options: { ascending: boolean }) {
        operations.push({ table, type: 'order', column, ascending: options.ascending })
        return Promise.resolve({
          data,
          error: null,
        })
      },
      then<TResult1, TResult2>(
        onfulfilled?:
          | ((value: { data: Array<Record<string, unknown>>; error: null }) => TResult1 | PromiseLike<TResult1>)
          | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve({
          data,
          error: null,
        }).then(onfulfilled, onrejected)
      },
    }

    return builder
  }

  return {
    operations,
    client: {
      from(table: string) {
        if (!(table in datasets)) {
          throw new Error(`Unexpected table: ${table}`)
        }

        return createQueryBuilder(table as keyof typeof datasets)
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

  it('returns a zeroed revenue breakdown when no members match the selected range', async () => {
    const { client, operations } = createSupabaseMemberSignupsReportClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request(
        'http://localhost/api/reports/members/signups?startDate=2026-04-01&endDate=2026-04-30',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      members: [],
      revenueBreakdown: {
        byType: [],
        total: 0,
        hasEstimates: false,
      },
    })

    expect(operations).toEqual([
      {
        table: 'members',
        type: 'select',
        columns: 'id, name, type, status, joined_at, member_type_id',
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

  it('combines actual revenue, card fees, and estimated fallback into the revenue breakdown', async () => {
    const { client, operations } = createSupabaseMemberSignupsReportClient({
      members: [
        {
          id: 'member-3',
          name: 'Card Fee Only',
          type: 'Student/BPO',
          status: 'Active',
          joined_at: '2026-04-20',
          member_type_id: 'type-student',
        },
        {
          id: 'member-2',
          name: 'Estimate Only',
          type: 'Civil Servant',
          status: 'Active',
          joined_at: '2026-04-18',
          member_type_id: 'type-civil',
        },
        {
          id: 'member-1',
          name: 'Paid Member',
          type: 'General',
          status: 'Active',
          joined_at: '2026-04-15',
          member_type_id: 'type-general',
        },
        {
          id: 'member-4',
          name: 'Ignored Null Join',
          type: 'General',
          status: 'Expired',
          joined_at: null,
          member_type_id: 'type-general',
        },
      ],
      memberPayments: [
        {
          member_id: 'member-1',
          member_type_id: 'type-general',
          payment_type: 'membership',
          amount_paid: 12000,
          payment_date: '2026-04-16',
        },
        {
          member_id: 'member-3',
          member_type_id: null,
          payment_type: 'card_fee',
          amount_paid: 3500,
          payment_date: '2026-04-21',
        },
        {
          member_id: 'member-1',
          member_type_id: 'type-general',
          payment_type: 'membership',
          amount_paid: 9999,
          payment_date: '2026-05-01',
        },
      ],
      memberTypes: [
        { id: 'type-general', name: 'General', monthly_rate: 12000 },
        { id: 'type-civil', name: 'Civil Servant', monthly_rate: 7500 },
        { id: 'type-student', name: 'Student/BPO', monthly_rate: 7500 },
      ],
    })
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
          id: 'member-3',
          name: 'Card Fee Only',
          type: 'Student/BPO',
          status: 'Active',
          joinedAt: '2026-04-20',
        },
        {
          id: 'member-2',
          name: 'Estimate Only',
          type: 'Civil Servant',
          status: 'Active',
          joinedAt: '2026-04-18',
        },
        {
          id: 'member-1',
          name: 'Paid Member',
          type: 'General',
          status: 'Active',
          joinedAt: '2026-04-15',
        },
      ],
      revenueBreakdown: {
        byType: [
          { label: 'General', total: 12000, isEstimate: false },
          { label: 'Card Fees', total: 3500, isEstimate: false },
          { label: 'Estimated (no payment recorded)', total: 7500, isEstimate: true },
        ],
        total: 23000,
        hasEstimates: true,
      },
    })

    expect(operations).toEqual([
      {
        table: 'members',
        type: 'select',
        columns: 'id, name, type, status, joined_at, member_type_id',
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
      {
        table: 'member_payments',
        type: 'select',
        columns: 'member_id, member_type_id, payment_type, amount_paid, payment_date',
      },
      {
        table: 'member_payments',
        type: 'in',
        column: 'member_id',
        values: ['member-3', 'member-2', 'member-1'],
      },
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
        table: 'member_types',
        type: 'select',
        columns: 'id, name, monthly_rate',
      },
      {
        table: 'member_types',
        type: 'in',
        column: 'id',
        values: ['type-general', 'type-student', 'type-civil'],
      },
    ])
  })

  it('does not estimate members with recorded payments and excludes members without payments and no member type', async () => {
    const { client } = createSupabaseMemberSignupsReportClient({
      members: [
        {
          id: 'member-1',
          name: 'Card Fee Member',
          type: 'General',
          status: 'Active',
          joined_at: '2026-04-05',
          member_type_id: 'type-general',
        },
        {
          id: 'member-2',
          name: 'No Type Member',
          type: 'General',
          status: 'Active',
          joined_at: '2026-04-06',
          member_type_id: null,
        },
      ],
      memberPayments: [
        {
          member_id: 'member-1',
          member_type_id: null,
          payment_type: 'card_fee',
          amount_paid: 2500,
          payment_date: '2026-04-09',
        },
      ],
      memberTypes: [{ id: 'type-general', name: 'General', monthly_rate: 12000 }],
    })
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
          name: 'Card Fee Member',
          type: 'General',
          status: 'Active',
          joinedAt: '2026-04-05',
        },
        {
          id: 'member-2',
          name: 'No Type Member',
          type: 'General',
          status: 'Active',
          joinedAt: '2026-04-06',
        },
      ],
      revenueBreakdown: {
        byType: [{ label: 'Card Fees', total: 2500, isEstimate: false }],
        total: 2500,
        hasEstimates: false,
      },
    })
  })
})
