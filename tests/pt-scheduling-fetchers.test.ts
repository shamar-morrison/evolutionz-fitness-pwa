import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPtAssignments } from '@/lib/pt-scheduling'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('PT scheduling fetchers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetches PT assignments without forcing no-store', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          assignments: [],
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPtAssignments({ status: 'active' })).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledWith('/api/pt/assignments?status=active', {
      method: 'GET',
    })
  })
})
