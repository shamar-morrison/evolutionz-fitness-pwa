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

import { GET } from '@/app/api/reports/class-payments/route'

type QueryOperation =
  | { table: string; type: 'select'; columns: string }
  | { table: string; type: 'eq' | 'gte' | 'lt'; column: string; value: string }
  | { table: string; type: 'in'; column: string; values: string[] }

function createSupabaseClassPaymentsReportClient(
  overrides: Partial<Record<string, Array<Record<string, unknown>>>> = {},
) {
  const operations: QueryOperation[] = []
  const datasets = {
    class_trainers: [] as Array<Record<string, unknown>>,
    class_registrations: [] as Array<Record<string, unknown>>,
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
          in(column: string, values: string[]) {
            operations.push({ table, type: 'in', column, values })
            return this
          },
        }

        return builder
      },
    },
  }
}

describe('GET /api/reports/class-payments', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the admin auth response when the user is forbidden', async () => {
    mockForbidden()

    const response = await GET(
      new Request(
        'http://localhost/api/reports/class-payments?start=2026-04-01&end=2026-04-30&status=approved',
      ),
    )

    expect(response.status).toBe(403)
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the required query params are missing', async () => {
    const response = await GET(new Request('http://localhost/api/reports/class-payments'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Start date, end date, and status are required.',
    })
  })

  it('returns 400 for invalid or reversed date ranges', async () => {
    const invalidResponse = await GET(
      new Request(
        'http://localhost/api/reports/class-payments?start=2026-02-31&end=2026-04-30&status=approved',
      ),
    )
    const reversedResponse = await GET(
      new Request(
        'http://localhost/api/reports/class-payments?start=2026-05-01&end=2026-04-30&status=approved',
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

  it('uses Jamaica-local registration created_at bounds and pending-inclusive status filters', async () => {
    const { client, operations } = createSupabaseClassPaymentsReportClient({
      class_trainers: [
        {
          class_id: 'class-1',
          profile_id: 'trainer-1',
          profiles: {
            id: 'trainer-1',
            name: 'Jordan Trainer',
            titles: ['Trainer'],
          },
          classes: {
            id: 'class-1',
            name: 'Dance Cardio',
            trainer_compensation_pct: 40,
          },
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request(
        'http://localhost/api/reports/class-payments?start=2026-04-01&end=2026-04-30&status=include-pending&includeZero=true',
      ),
    )

    expect(response.status).toBe(200)
    expect(operations).toEqual(
      expect.arrayContaining([
        {
          table: 'class_registrations',
          type: 'gte',
          column: 'created_at',
          value: '2026-04-01T00:00:00-05:00',
        },
        {
          table: 'class_registrations',
          type: 'lt',
          column: 'created_at',
          value: '2026-05-01T00:00:00-05:00',
        },
        {
          table: 'class_registrations',
          type: 'in',
          column: 'status',
          values: ['approved', 'pending'],
        },
      ]),
    )
  })

  it('groups classes by trainer, excludes zero-amount registrations by default, and splits payouts equally', async () => {
    const { client } = createSupabaseClassPaymentsReportClient({
      class_trainers: [
        {
          class_id: 'class-1',
          profile_id: 'trainer-1',
          profiles: {
            id: 'trainer-1',
            name: 'Alex Coach',
            titles: ['Medical'],
          },
          classes: {
            id: 'class-1',
            name: 'Dance Cardio',
            trainer_compensation_pct: 40,
          },
        },
        {
          class_id: 'class-1',
          profile_id: 'trainer-2',
          profiles: {
            id: 'trainer-2',
            name: 'Jordan Trainer',
            titles: ['Trainer'],
          },
          classes: {
            id: 'class-1',
            name: 'Dance Cardio',
            trainer_compensation_pct: 40,
          },
        },
        {
          class_id: 'class-2',
          profile_id: 'trainer-2',
          profiles: {
            id: 'trainer-2',
            name: 'Jordan Trainer',
            titles: ['Trainer'],
          },
          classes: {
            id: 'class-2',
            name: 'Bootcamp',
            trainer_compensation_pct: 30,
          },
        },
      ],
      class_registrations: [
        {
          class_id: 'class-1',
          amount_paid: 10000,
          status: 'approved',
          created_at: '2026-04-10T12:00:00.000Z',
        },
        {
          class_id: 'class-1',
          amount_paid: 10000,
          status: 'approved',
          created_at: '2026-04-11T12:00:00.000Z',
        },
        {
          class_id: 'class-2',
          amount_paid: 0,
          status: 'approved',
          created_at: '2026-04-12T12:00:00.000Z',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request(
        'http://localhost/api/reports/class-payments?start=2026-04-01&end=2026-04-30&status=approved',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      {
        trainerId: 'trainer-1',
        trainerName: 'Alex Coach',
        trainerTitles: ['Medical'],
        classes: [
          {
            classId: 'class-1',
            className: 'Dance Cardio',
            registrationCount: 2,
            totalCollected: 20000,
            compensationPct: 40,
            trainerCount: 2,
            payout: 4000,
          },
        ],
        totalPayout: 4000,
      },
      {
        trainerId: 'trainer-2',
        trainerName: 'Jordan Trainer',
        trainerTitles: ['Trainer'],
        classes: [
          {
            classId: 'class-2',
            className: 'Bootcamp',
            registrationCount: 0,
            totalCollected: 0,
            compensationPct: 30,
            trainerCount: 1,
            payout: 0,
          },
          {
            classId: 'class-1',
            className: 'Dance Cardio',
            registrationCount: 2,
            totalCollected: 20000,
            compensationPct: 40,
            trainerCount: 2,
            payout: 4000,
          },
        ],
        totalPayout: 4000,
      },
    ])
  })

  it('includes pending and zero-amount registrations when requested', async () => {
    const { client, operations } = createSupabaseClassPaymentsReportClient({
      class_trainers: [
        {
          class_id: 'class-1',
          profile_id: 'trainer-1',
          profiles: {
            id: 'trainer-1',
            name: 'Jordan Trainer',
            titles: ['Trainer'],
          },
          classes: {
            id: 'class-1',
            name: 'Dance Cardio',
            trainer_compensation_pct: 40,
          },
        },
        {
          class_id: 'class-1',
          profile_id: 'trainer-2',
          profiles: {
            id: 'trainer-2',
            name: 'Alex Coach',
            titles: ['Medical'],
          },
          classes: {
            id: 'class-1',
            name: 'Dance Cardio',
            trainer_compensation_pct: 40,
          },
        },
        {
          class_id: 'class-2',
          profile_id: 'trainer-1',
          profiles: {
            id: 'trainer-1',
            name: 'Jordan Trainer',
            titles: ['Trainer'],
          },
          classes: {
            id: 'class-2',
            name: 'Bootcamp',
            trainer_compensation_pct: 30,
          },
        },
      ],
      class_registrations: [
        {
          class_id: 'class-1',
          amount_paid: 10000,
          status: 'approved',
          created_at: '2026-04-10T12:00:00.000Z',
        },
        {
          class_id: 'class-1',
          amount_paid: 10000,
          status: 'approved',
          created_at: '2026-04-11T12:00:00.000Z',
        },
        {
          class_id: 'class-1',
          amount_paid: 5000,
          status: 'pending',
          created_at: '2026-04-12T12:00:00.000Z',
        },
        {
          class_id: 'class-2',
          amount_paid: 0,
          status: 'approved',
          created_at: '2026-04-13T12:00:00.000Z',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request(
        'http://localhost/api/reports/class-payments?start=2026-04-01&end=2026-04-30&status=include-pending&includeZero=true',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      {
        trainerId: 'trainer-2',
        trainerName: 'Alex Coach',
        trainerTitles: ['Medical'],
        classes: [
          {
            classId: 'class-1',
            className: 'Dance Cardio',
            registrationCount: 3,
            totalCollected: 25000,
            compensationPct: 40,
            trainerCount: 2,
            payout: 5000,
          },
        ],
        totalPayout: 5000,
      },
      {
        trainerId: 'trainer-1',
        trainerName: 'Jordan Trainer',
        trainerTitles: ['Trainer'],
        classes: [
          {
            classId: 'class-2',
            className: 'Bootcamp',
            registrationCount: 1,
            totalCollected: 0,
            compensationPct: 30,
            trainerCount: 1,
            payout: 0,
          },
          {
            classId: 'class-1',
            className: 'Dance Cardio',
            registrationCount: 3,
            totalCollected: 25000,
            compensationPct: 40,
            trainerCount: 2,
            payout: 5000,
          },
        ],
        totalPayout: 5000,
      },
    ])
    expect(operations).toEqual(
      expect.arrayContaining([
        {
          table: 'class_registrations',
          type: 'in',
          column: 'status',
          values: ['approved', 'pending'],
        },
      ]),
    )
  })
})
