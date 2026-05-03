import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetServerAuthMocks } from '@/tests/support/server-auth'
import {
  calculateLegacyDashboardStats,
  type DashboardStatsLegacyMemberRow,
} from '@/tests/support/dashboard-stats-legacy'

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

import { GET } from '@/app/api/dashboard/stats/route'

const FIXTURE_NOW = new Date('2026-04-02T10:15:30.000Z')
const FIXTURE_MEMBERS: DashboardStatsLegacyMemberRow[] = [
  {
    id: 'member-a',
    status: 'Active',
    begin_time: '2026-01-10T00:00:00Z',
    end_time: '2026-06-15T23:59:59Z',
    joined_at: '2025-11-10',
  },
  {
    id: 'member-b',
    status: 'Active',
    begin_time: '2026-03-15T00:00:00Z',
    end_time: '2026-04-05T00:00:00-05:00',
    joined_at: '2026-03-15',
  },
  {
    id: 'member-c',
    status: 'Active',
    begin_time: '2026-04-01T08:00:00Z',
    end_time: '2026-07-01T00:00:00Z',
    joined_at: '2026-04-01',
  },
  {
    id: 'member-d',
    status: 'Expired',
    begin_time: '2026-02-01T00:00:00Z',
    end_time: '2026-04-15T12:00:00Z',
    joined_at: '2026-02-10',
  },
  {
    id: 'member-e',
    status: 'Expired',
    begin_time: '2026-03-01T00:00:00Z',
    end_time: '2026-04-01T03:30:00Z',
    joined_at: '2026-03-20',
  },
  {
    id: 'member-f',
    status: 'Active',
    begin_time: '2026-01-20T00:00:00Z',
    end_time: '2026-04-12T00:00:00-05:00',
    joined_at: null,
  },
]

const EXPECTED_STATS = calculateLegacyDashboardStats(FIXTURE_MEMBERS, FIXTURE_NOW)
const RPC_DASHBOARD_STATS_PAYLOAD = {
  activeMembers: 4,
  activeMembersLastMonth: 5,
  totalExpiredMembers: 2,
  expiringSoon: 1,
  signedUpThisMonth: 1,
  signupsByMonth: [
    { month: '2025-11', count: 1 },
    { month: '2025-12', count: 0 },
    { month: '2026-01', count: 0 },
    { month: '2026-02', count: 1 },
    { month: '2026-03', count: 2 },
    { month: '2026-04', count: 1 },
  ],
  expiredThisMonth: 3,
  expiredThisMonthLastMonth: 1,
}

function createDashboardStatsAdminClient({
  payload = RPC_DASHBOARD_STATS_PAYLOAD,
  error = null,
}: {
  payload?: unknown
  error?: { message: string } | null
} = {}) {
  const rpcMock = vi.fn().mockResolvedValue({
    data: payload,
    error,
  })

  return {
    rpc: rpcMock,
  }
}

describe('GET /api/dashboard/stats', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    getSupabaseAdminClientMock.mockReset()
    resetServerAuthMocks()
  })

  it('calls get_dashboard_stats once with Jamaica-local rpc parameters and returns validated stats', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXTURE_NOW)

    const supabase = createDashboardStatsAdminClient()
    getSupabaseAdminClientMock.mockReturnValue(supabase)

    const response = await GET()

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('get_dashboard_stats', {
      p_now: '2026-04-02T05:15:30-05:00',
      p_timezone_offset: '-05:00',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(
      'private, max-age=60, stale-while-revalidate=300',
    )
    await expect(response.json()).resolves.toEqual(RPC_DASHBOARD_STATS_PAYLOAD)
  })

  it('pins the rpc payload to the legacy JS aggregation semantics for dashboard deltas and signup buckets', () => {
    expect({
      expiredThisMonth: RPC_DASHBOARD_STATS_PAYLOAD.expiredThisMonth,
      expiredThisMonthLastMonth: RPC_DASHBOARD_STATS_PAYLOAD.expiredThisMonthLastMonth,
      activeMembersLastMonth: RPC_DASHBOARD_STATS_PAYLOAD.activeMembersLastMonth,
      signupsByMonth: RPC_DASHBOARD_STATS_PAYLOAD.signupsByMonth,
    }).toStrictEqual({
      expiredThisMonth: EXPECTED_STATS.expiredThisMonth,
      expiredThisMonthLastMonth: EXPECTED_STATS.expiredThisMonthLastMonth,
      activeMembersLastMonth: EXPECTED_STATS.activeMembersLastMonth,
      signupsByMonth: EXPECTED_STATS.signupsByMonth,
    })
  })

  it('returns 500 when the dashboard stats rpc fails', async () => {
    const supabase = createDashboardStatsAdminClient({
      error: { message: 'rpc exploded' },
    })
    getSupabaseAdminClientMock.mockReturnValue(supabase)

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to load dashboard stats: rpc exploded',
    })
  })
})
