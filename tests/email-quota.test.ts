import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchEmailQuota } from '@/lib/email-quota'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('email quota helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetches email quota without forcing no-store', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          sent: 12,
          limit: 100,
          remaining: 88,
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchEmailQuota()).resolves.toEqual({
      sent: 12,
      limit: 100,
      remaining: 88,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/email/quota', {
      method: 'GET',
    })
  })
})
