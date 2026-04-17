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

describe('dashboard stats helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes dashboard stats responses', () => {
    expect(
      normalizeDashboardStats({
        activeMembers: 247,
        expiredMembers: 38,
        expiringSoon: 12,
        signedUpThisMonth: 19,
        expiredThisMonth: 16,
      }),
    ).toEqual({
      activeMembers: 247,
      expiredMembers: 38,
      expiringSoon: 12,
      signedUpThisMonth: 19,
      expiredThisMonth: 16,
    })
  })

  it('fetches dashboard stats from the dashboard route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          activeMembers: 247,
          expiredMembers: 38,
          expiringSoon: 12,
          signedUpThisMonth: 19,
          expiredThisMonth: 16,
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchDashboardStats()).resolves.toEqual({
      activeMembers: 247,
      expiredMembers: 38,
      expiringSoon: 12,
      signedUpThisMonth: 19,
      expiredThisMonth: 16,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/stats', {
      method: 'GET',
      cache: 'no-store',
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
