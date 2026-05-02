import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockForbidden, resetServerAuthMocks } from '@/tests/support/server-auth'
import { TRAINER_PAYOUT_PER_CLIENT_JMD } from '@/lib/pt-scheduling'

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

import { GET } from '@/app/api/reports/pt-payments/route'

type QueryOperation =
  | { table: string; type: 'select'; columns: string }
  | { table: string; type: 'eq' | 'lte' | 'gte' | 'lt'; column: string; value: string }
  | { table: string; type: 'in'; column: string; values: string[] }

function createSupabaseReportClient(overrides: Partial<Record<string, Array<Record<string, unknown>>>> = {}) {
  const operations: QueryOperation[] = []
  const datasets = {
    trainer_clients: [] as Array<Record<string, unknown>>,
    pt_sessions: [] as Array<Record<string, unknown>>,
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
          lte(column: string, value: string) {
            operations.push({ table, type: 'lte', column, value })
            return this
          },
          in(column: string, values: string[]) {
            operations.push({ table, type: 'in', column, values })
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
        }

        return builder
      },
    },
  }
}

describe('GET /api/reports/pt-payments', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('returns the admin auth response when the user is forbidden', async () => {
    mockForbidden()

    const response = await GET(
      new Request(
        'http://localhost/api/reports/pt-payments?startDate=2026-04-01&endDate=2026-04-30',
      ),
    )

    expect(response.status).toBe(403)
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the required query params are missing', async () => {
    const response = await GET(new Request('http://localhost/api/reports/pt-payments'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Start date and end date are required.',
    })
  })

  it('returns 400 for invalid or reversed date ranges', async () => {
    const invalidResponse = await GET(
      new Request(
        'http://localhost/api/reports/pt-payments?startDate=2026-02-31&endDate=2026-04-30',
      ),
    )
    const reversedResponse = await GET(
      new Request(
        'http://localhost/api/reports/pt-payments?startDate=2026-05-01&endDate=2026-04-30',
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

  it('uses Jamaica-local assignment and session boundaries for the report queries', async () => {
    const { client, operations } = createSupabaseReportClient({
      trainer_clients: [
        {
          id: 'assignment-1',
          trainer_id: 'trainer-1',
          member_id: 'member-1',
          pt_fee: 15000,
          created_at: '2026-04-10T12:00:00.000Z',
        },
      ],
      profiles: [
        {
          id: 'trainer-1',
          name: 'Jordan Trainer',
          titles: ['Trainer'],
        },
      ],
      members: [
        {
          id: 'member-1',
          name: 'Member One',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request(
        'http://localhost/api/reports/pt-payments?startDate=2026-04-01&endDate=2026-04-30',
      ),
    )

    expect(response.status).toBe(200)
    expect(operations).toEqual(
      expect.arrayContaining([
        {
          table: 'trainer_clients',
          type: 'eq',
          column: 'status',
          value: 'active',
        },
        {
          table: 'trainer_clients',
          type: 'lte',
          column: 'created_at',
          value: '2026-04-30T23:59:59.999-05:00',
        },
        {
          table: 'pt_sessions',
          type: 'gte',
          column: 'scheduled_at',
          value: '2026-04-01T00:00:00-05:00',
        },
        {
          table: 'pt_sessions',
          type: 'lt',
          column: 'scheduled_at',
          value: '2026-05-01T00:00:00-05:00',
        },
      ]),
    )
  })

  it('groups assignments and session activity by trainer and uses the shared payout constant', async () => {
    const { client } = createSupabaseReportClient({
      trainer_clients: [
        {
          id: 'assignment-1',
          trainer_id: 'trainer-1',
          member_id: 'member-1',
          pt_fee: 15000,
          created_at: '2026-03-20T12:00:00.000Z',
        },
        {
          id: 'assignment-2',
          trainer_id: 'trainer-1',
          member_id: 'member-2',
          pt_fee: 18000,
          created_at: '2026-04-05T12:00:00.000Z',
        },
        {
          id: 'assignment-3',
          trainer_id: 'trainer-2',
          member_id: 'member-3',
          pt_fee: 20000,
          created_at: '2026-04-08T12:00:00.000Z',
        },
      ],
      pt_sessions: [
        { assignment_id: 'assignment-1', status: 'completed' },
        { assignment_id: 'assignment-1', status: 'completed' },
        { assignment_id: 'assignment-1', status: 'missed' },
        { assignment_id: 'assignment-1', status: 'scheduled' },
        { assignment_id: 'assignment-2', status: 'missed' },
        { assignment_id: 'assignment-2', status: 'cancelled' },
        { assignment_id: 'assignment-3', status: 'completed' },
        { assignment_id: 'assignment-3', status: 'rescheduled' },
      ],
      profiles: [
        {
          id: 'trainer-1',
          name: 'Alex Trainer',
          titles: ['Trainer'],
        },
        {
          id: 'trainer-2',
          name: 'Blake Coach',
          titles: ['Trainer', 'Medical'],
        },
      ],
      members: [
        {
          id: 'member-1',
          name: 'Member One',
        },
        {
          id: 'member-2',
          name: 'Member Two',
        },
        {
          id: 'member-3',
          name: 'Member Three',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request(
        'http://localhost/api/reports/pt-payments?startDate=2026-04-01&endDate=2026-04-30',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      summary: {
        totalAssignments: 3,
        totalSessionsCompleted: 3,
        totalPayout: 3 * TRAINER_PAYOUT_PER_CLIENT_JMD,
      },
      trainers: [
        {
          trainerId: 'trainer-1',
          trainerName: 'Alex Trainer',
          trainerTitles: ['Trainer'],
          activeClients: 2,
          monthlyPayout: 2 * TRAINER_PAYOUT_PER_CLIENT_JMD,
          clients: [
            {
              memberId: 'member-1',
              memberName: 'Member One',
              ptFee: 15000,
              sessionsCompleted: 2,
              sessionsMissed: 1,
              attendanceRate: 67,
            },
            {
              memberId: 'member-2',
              memberName: 'Member Two',
              ptFee: 18000,
              sessionsCompleted: 0,
              sessionsMissed: 1,
              attendanceRate: 0,
            },
          ],
        },
        {
          trainerId: 'trainer-2',
          trainerName: 'Blake Coach',
          trainerTitles: ['Trainer', 'Medical'],
          activeClients: 1,
          monthlyPayout: TRAINER_PAYOUT_PER_CLIENT_JMD,
          clients: [
            {
              memberId: 'member-3',
              memberName: 'Member Three',
              ptFee: 20000,
              sessionsCompleted: 1,
              sessionsMissed: 0,
              attendanceRate: 100,
            },
          ],
        },
      ],
    })
  })

  it('keeps active assignments with a null PT fee in the PT payments report', async () => {
    const { client } = createSupabaseReportClient({
      trainer_clients: [
        {
          id: 'assignment-1',
          trainer_id: 'trainer-1',
          member_id: 'member-1',
          pt_fee: null,
          created_at: '2026-04-05T12:00:00.000Z',
        },
      ],
      pt_sessions: [
        { assignment_id: 'assignment-1', status: 'completed' },
        { assignment_id: 'assignment-1', status: 'missed' },
      ],
      profiles: [
        {
          id: 'trainer-1',
          name: 'Alex Trainer',
          titles: ['Trainer'],
        },
      ],
      members: [
        {
          id: 'member-1',
          name: 'Member One',
        },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request(
        'http://localhost/api/reports/pt-payments?startDate=2026-04-01&endDate=2026-04-30',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      summary: {
        totalAssignments: 1,
        totalSessionsCompleted: 1,
        totalPayout: TRAINER_PAYOUT_PER_CLIENT_JMD,
      },
      trainers: [
        {
          trainerId: 'trainer-1',
          trainerName: 'Alex Trainer',
          trainerTitles: ['Trainer'],
          activeClients: 1,
          monthlyPayout: TRAINER_PAYOUT_PER_CLIENT_JMD,
          clients: [
            {
              memberId: 'member-1',
              memberName: 'Member One',
              ptFee: null,
              sessionsCompleted: 1,
              sessionsMissed: 1,
              attendanceRate: 50,
            },
          ],
        },
      ],
    })
  })

  it('returns an empty report when there are no active trainer assignments in the period', async () => {
    const { client } = createSupabaseReportClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request(
        'http://localhost/api/reports/pt-payments?startDate=2026-04-01&endDate=2026-04-30',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      summary: {
        totalAssignments: 0,
        totalSessionsCompleted: 0,
        totalPayout: 0,
      },
      trainers: [],
    })
  })
})
