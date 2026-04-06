import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockAuthenticatedProfile,
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
    requireAdminUser: mod.requireAdminUserMock,
  }
})

import { GET } from '@/app/api/pt/sessions/route'

type QueryOperation =
  | { type: 'select'; columns: string }
  | { type: 'order'; column: string; ascending: boolean }
  | { type: 'eq'; column: string; value: string }
  | { type: 'in'; column: string; values: string[] }
  | { type: 'lt'; column: string; value: string }

function createPtSessionsClient() {
  const operations: QueryOperation[] = []
  const builder = {
    data: [] as Array<Record<string, unknown>>,
    error: null as { message: string } | null,
    select(columns: string) {
      operations.push({ type: 'select', columns })
      return this
    },
    order(column: string, { ascending }: { ascending: boolean }) {
      operations.push({ type: 'order', column, ascending })
      return this
    },
    eq(column: string, value: string) {
      operations.push({ type: 'eq', column, value })
      return this
    },
    in(column: string, values: string[]) {
      operations.push({ type: 'in', column, values })
      return this
    },
    lt(column: string, value: string) {
      operations.push({ type: 'lt', column, value })
      return this
    },
  }

  return {
    operations,
    client: {
      from(table: string) {
        expect(table).toBe('pt_sessions')
        return builder
      },
    },
  }
}

describe('GET /api/pt/sessions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('maps status=active to all non-cancelled PT statuses', async () => {
    const { client, operations } = createPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/pt/sessions?status=active'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ sessions: [] })
    expect(operations).toContainEqual({
      type: 'in',
      column: 'status',
      values: ['scheduled', 'completed', 'missed', 'rescheduled'],
    })
  })

  it('maps past=true to past sessions only and excludes scheduled status', async () => {
    const { client, operations } = createPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request('http://localhost/api/pt/sessions?past=true'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ sessions: [] })
    expect(operations).toContainEqual({
      type: 'in',
      column: 'status',
      values: ['completed', 'missed', 'rescheduled', 'cancelled'],
    })
    expect(operations).toEqual(
      expect.arrayContaining([
        {
          type: 'lt',
          column: 'scheduled_at',
          value: expect.any(String),
        },
      ]),
    )
  })

  it('composes memberId and past filters in the same PT sessions request', async () => {
    const { client, operations } = createPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)

    const response = await GET(
      new Request(
        'http://localhost/api/pt/sessions?memberId=22222222-2222-4222-8222-222222222222&past=true',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ sessions: [] })
    expect(operations).toEqual(
      expect.arrayContaining([
        {
          type: 'eq',
          column: 'member_id',
          value: '22222222-2222-4222-8222-222222222222',
        },
        {
          type: 'in',
          column: 'status',
          values: ['completed', 'missed', 'rescheduled', 'cancelled'],
        },
        {
          type: 'lt',
          column: 'scheduled_at',
          value: expect.any(String),
        },
      ]),
    )
  })

  it('forces trainerId to the authenticated staff profile when staff omit the filter', async () => {
    const { client, operations } = createPtSessionsClient()
    getSupabaseAdminClientMock.mockReturnValue(client)
    mockAuthenticatedProfile({
      profile: {
        id: '33333333-3333-4333-8333-333333333333',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await GET(new Request('http://localhost/api/pt/sessions'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ sessions: [] })
    expect(operations).toContainEqual({
      type: 'eq',
      column: 'trainer_id',
      value: '33333333-3333-4333-8333-333333333333',
    })
  })

  it('rejects staff requests for another trainerId', async () => {
    mockAuthenticatedProfile({
      profile: {
        id: '33333333-3333-4333-8333-333333333333',
        role: 'staff',
        titles: ['Trainer'],
      },
    })

    const response = await GET(
      new Request(
        'http://localhost/api/pt/sessions?trainerId=44444444-4444-4444-8444-444444444444',
      ),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Forbidden',
    })
    expect(getSupabaseAdminClientMock).not.toHaveBeenCalled()
  })
})
