import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCardFeeSettings } from '@/lib/card-fee-settings'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('card fee settings helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fetches card fee settings without forcing no-store', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          settings: {
            amountJmd: 3200,
          },
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCardFeeSettings()).resolves.toEqual({
      amountJmd: 3200,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/card-fee', {
      method: 'GET',
    })
  })
})
