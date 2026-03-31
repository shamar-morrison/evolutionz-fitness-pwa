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
          { cardNo: '0104620061', cardCode: null },
          { cardNo: ' 0102857149 ', cardCode: null },
          { cardNo: '0102857149', cardCode: ' A18 ' },
        ],
      }),
    ).toEqual([
      { cardNo: '0102857149', cardCode: 'A18' },
      { cardNo: '0104620061', cardCode: null },
    ])
  })

  it('formats a card label for staff-facing selectors', () => {
    expect(
      formatAvailableAccessCardLabel({
        cardNo: '0102857149',
        cardCode: 'A18',
      }),
    ).toBe('A18 — 0102857149')
  })

  it('fetches available cards from the PWA route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          cards: [
            { cardNo: '0104620061', cardCode: null },
            { cardNo: '0102857149', cardCode: 'A18' },
          ],
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchAvailableAccessCards()).resolves.toEqual([
      { cardNo: '0102857149', cardCode: 'A18' },
      { cardNo: '0104620061', cardCode: null },
    ])
    expect(fetchMock).toHaveBeenCalledWith('/api/access/cards/available', {
      method: 'GET',
      cache: 'no-store',
    })
  })
})
