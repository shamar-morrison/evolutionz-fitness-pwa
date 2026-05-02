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
  | { table: string; type: 'eq' | 'gte' | 'lt'; column: string; value: string }
  | { table: string; type: 'in'; column: string; values: string[] }
  | { table: string; type: 'order'; column: string; ascending: boolean }

function createSupabasePtRevenueClient(
  overrides: Partial<Record<string, Array<Record<string, unknown>>>> = {},
) {
  const operations: QueryOperation[] = []
  const datasets = {
    pt_sessions: [] as Array<Record<string, unknown>>,
    trainer_clients: [] as Array<Record<string, unknown>>,
    members: [] as Array<Record<string, unknown>>,
    profiles: [] as Array<Record<string, unknown>>,
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

  it('uses Jamaica-local scheduled_at bounds and only includes completed sessions', async () => {
    const { client, operations } = createSupabasePtRevenueClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/pt?from=2026-04-01&to=2026-04-30'),
    )

    expect(response.status).toBe(200)
    expect(operations).toEqual(
      expect.arrayContaining([
        {
          table: 'pt_sessions',
          type: 'eq',
          column: 'status',
          value: 'completed',
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
        {
          table: 'pt_sessions',
          type: 'order',
          column: 'scheduled_at',
          ascending: false,
        },
      ]),
    )
  })

  it('aggregates PT revenue by session and trainer', async () => {
    const { client } = createSupabasePtRevenueClient({
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
          assignment_id: 'assignment-1',
          trainer_id: 'trainer-1',
          member_id: 'member-1',
          scheduled_at: '2026-04-08T09:00:00-05:00',
          status: 'completed',
        },
        {
          id: 'session-3',
          assignment_id: 'assignment-2',
          trainer_id: 'trainer-1',
          member_id: 'member-2',
          scheduled_at: '2026-04-05T09:00:00-05:00',
          status: 'completed',
        },
        {
          id: 'session-4',
          assignment_id: 'assignment-3',
          trainer_id: 'trainer-2',
          member_id: 'member-3',
          scheduled_at: '2026-04-03T09:00:00-05:00',
          status: 'completed',
        },
      ],
      trainer_clients: [
        { id: 'assignment-1', pt_fee: 15000 },
        { id: 'assignment-2', pt_fee: 18000 },
        { id: 'assignment-3', pt_fee: 20000 },
      ],
      members: [
        { id: 'member-1', name: 'Member One' },
        { id: 'member-2', name: 'Member Two' },
        { id: 'member-3', name: 'Member Three' },
      ],
      profiles: [
        { id: 'trainer-1', name: 'Jordan Trainer' },
        { id: 'trainer-2', name: 'Alex Coach' },
      ],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/pt?from=2026-04-01&to=2026-04-30'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.summary).toEqual({
      totalRevenue: 68000,
      totalSessionsCompleted: 4,
    })
    expect(body.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'session-1',
          memberId: 'member-1',
          memberName: 'Member One',
          trainerName: 'Jordan Trainer',
          ptFee: 15000,
        }),
        expect.objectContaining({
          id: 'session-4',
          memberId: 'member-3',
          memberName: 'Member Three',
          trainerName: 'Alex Coach',
          ptFee: 20000,
        }),
      ]),
    )
    expect(body.totalsByTrainer).toEqual([
      {
        trainerId: 'trainer-2',
        trainerName: 'Alex Coach',
        totalRevenue: 20000,
        sessionCount: 1,
      },
      {
        trainerId: 'trainer-1',
        trainerName: 'Jordan Trainer',
        totalRevenue: 48000,
        sessionCount: 3,
      },
    ])
  })

  it('excludes completed sessions tied to null PT fees from PT revenue rows and totals', async () => {
    const { client } = createSupabasePtRevenueClient({
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
          scheduled_at: '2026-04-08T09:00:00-05:00',
          status: 'completed',
        },
      ],
      trainer_clients: [
        { id: 'assignment-1', pt_fee: 15000 },
        { id: 'assignment-2', pt_fee: null },
      ],
      members: [
        { id: 'member-1', name: 'Member One' },
        { id: 'member-2', name: 'Member Two' },
      ],
      profiles: [{ id: 'trainer-1', name: 'Jordan Trainer' }],
    })
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/reports/revenue/pt?from=2026-04-01&to=2026-04-30'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      summary: {
        totalRevenue: 15000,
        totalSessionsCompleted: 1,
      },
      sessions: [
        {
          id: 'session-1',
          memberId: 'member-1',
          memberName: 'Member One',
          trainerName: 'Jordan Trainer',
          ptFee: 15000,
          sessionDate: '2026-04-10T09:00:00-05:00',
        },
      ],
      totalsByTrainer: [
        {
          trainerId: 'trainer-1',
          trainerName: 'Jordan Trainer',
          totalRevenue: 15000,
          sessionCount: 1,
        },
      ],
    })
  })

  it('returns an empty PT report when no sessions are completed in range', async () => {
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
