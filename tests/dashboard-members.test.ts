import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchExpiringDashboardMembers,
  fetchRecentDashboardMembers,
} from '@/lib/dashboard-members'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

const RECENT_MEMBER = {
  id: 'member-1',
  name: 'Jane Doe',
  type: 'General' as const,
  status: 'Active' as const,
  endTime: '2026-04-09T23:59:59.000Z',
}

const EXPIRING_MEMBER = {
  id: 'member-2',
  name: 'Marcus Brown',
  type: 'Student/BPO' as const,
  status: 'Active' as const,
  endTime: '2026-04-05T23:59:59Z',
}

describe('dashboard member helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetches recent dashboard members from the recent route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          members: [RECENT_MEMBER],
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchRecentDashboardMembers()).resolves.toEqual([RECENT_MEMBER])
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/recent-members', {
      method: 'GET',
    })
  })

  it('fetches expiring dashboard members from the expiring route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          members: [EXPIRING_MEMBER],
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchExpiringDashboardMembers()).resolves.toEqual([EXPIRING_MEMBER])
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/expiring-members', {
      method: 'GET',
    })
  })

  it('throws the route error when recent dashboard members fail', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          error: 'Failed to read recent dashboard members: select exploded',
        },
        500,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchRecentDashboardMembers()).rejects.toThrow(
      'Failed to read recent dashboard members: select exploded',
    )
  })

  it('throws the route error when expiring dashboard members fail', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          error: 'Failed to read expiring dashboard members: select exploded',
        },
        500,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchExpiringDashboardMembers()).rejects.toThrow(
      'Failed to read expiring dashboard members: select exploded',
    )
  })
})
