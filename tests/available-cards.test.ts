import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createManualAccessCard,
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

  it('creates a manual access card through the manual cards route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          card: {
            cardNo: '1234567890',
            cardCode: 'N39',
          },
        },
        201,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createManualAccessCard({
        cardNo: ' 1234567890 ',
        cardCode: ' N39 ',
      }),
    ).resolves.toEqual({
      cardNo: '1234567890',
      cardCode: 'N39',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/cards/manual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        card_no: '1234567890',
        card_code: 'N39',
      }),
    })
  })

  it('throws when manual card creation fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: false,
          error: 'A card with this number already exists.',
        },
        409,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createManualAccessCard({
        cardNo: '1234567890',
        cardCode: 'N39',
      }),
    ).rejects.toThrow('A card with this number already exists.')
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
