import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchAvailableAccessCards,
  formatAvailableAccessCardLabel,
  normalizeAvailableAccessCards,
  normalizeSyncedAvailableAccessCards,
  syncAvailableAccessCards,
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

  it('normalizes synced bridge card results and prefers card codes', () => {
    expect(
      normalizeSyncedAvailableAccessCards([
        { cardNo: '0104620061', card_code: null },
        { cardNo: ' 0102857149 ', card_code: null },
        { cardNo: '0102857149', card_code: ' A18 ' },
      ]),
    ).toEqual([
      { cardNo: '0102857149', cardCode: 'A18' },
      { cardNo: '0104620061', cardCode: null },
    ])
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

  it('syncs available cards through the PWA route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          syncedCards: 12,
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(syncAvailableAccessCards()).resolves.toBe(12)
    expect(fetchMock).toHaveBeenCalledWith('/api/access/cards/available', {
      method: 'POST',
      cache: 'no-store',
    })
  })

  it('throws when syncing available cards fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: false,
          error: 'Bridge sync failed.',
        },
        502,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(syncAvailableAccessCards()).rejects.toThrow('Bridge sync failed.')
  })
})
