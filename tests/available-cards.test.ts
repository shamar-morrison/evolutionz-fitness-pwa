import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchAvailableAccessCards,
  formatAvailableAccessCardLabel,
  normalizeAvailableAccessCards,
} from '@/lib/available-cards'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('available card helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes, dedupes, and sorts available card results', () => {
    expect(
      normalizeAvailableAccessCards({
        cards: [
          { cardNo: '0104620061' },
          { cardNo: ' 0102857149 ' },
          { cardNo: '0102857149' },
        ],
      }),
    ).toEqual([
      { cardNo: '0102857149' },
      { cardNo: '0104620061' },
    ])
  })

  it('formats a card label for staff-facing selectors', () => {
    expect(
      formatAvailableAccessCardLabel({
        cardNo: '0102857149',
      }),
    ).toBe('0102857149')
  })

  it('fetches available cards from the PWA route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          cards: [
            { cardNo: '0104620061' },
            { cardNo: '0102857149' },
          ],
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchAvailableAccessCards()).resolves.toEqual([
      { cardNo: '0102857149' },
      { cardNo: '0104620061' },
    ])
    expect(fetchMock).toHaveBeenCalledWith('/api/access/cards/available', {
      method: 'GET',
      cache: 'no-store',
    })
  })
})
