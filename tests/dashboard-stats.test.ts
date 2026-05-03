import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDashboardStats, normalizeDashboardStats } from '@/lib/dashboard-stats'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

const dashboardStatsPayload = {
  activeMembers: 247,
  activeMembersLastMonth: 231,
  totalExpiredMembers: 38,
  expiringSoon: 12,
  signedUpThisMonth: 19,
  signupsByMonth: [
    { month: '2025-11', count: 0 },
    { month: '2025-12', count: 2 },
    { month: '2026-01', count: 4 },
    { month: '2026-02', count: 6 },
    { month: '2026-03', count: 8 },
    { month: '2026-04', count: 19 },
  ],
  expiredThisMonth: 16,
  expiredThisMonthLastMonth: 9,
}

describe('dashboard stats helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes dashboard stats responses', () => {
    expect(normalizeDashboardStats(dashboardStatsPayload)).toEqual(dashboardStatsPayload)
  })

  it('fetches dashboard stats from the dashboard route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(dashboardStatsPayload, 200))

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchDashboardStats()).resolves.toEqual(dashboardStatsPayload)
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/stats', {
      method: 'GET',
    })
  })

  it('throws the route error when fetching dashboard stats fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          error: 'Failed to read active member count: select exploded',
        },
        500,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchDashboardStats()).rejects.toThrow(
      'Failed to read active member count: select exploded',
    )
  })
})
