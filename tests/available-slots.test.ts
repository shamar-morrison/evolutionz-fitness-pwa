import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchAvailableAccessSlots,
  formatAvailableAccessSlotLabel,
  normalizeAvailableAccessSlots,
} from '@/lib/available-slots'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('available slot helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes, dedupes, and sorts available slot results', () => {
    expect(
      normalizeAvailableAccessSlots({
        slots: [
          { employeeNo: '00000612', cardNo: '0104620061', placeholderName: ' P43 ' },
          { employeeNo: '00000611', cardNo: '0102857149', placeholderName: 'P42' },
          { employeeNo: '00000611', cardNo: '0102857149', placeholderName: 'P42' },
        ],
        diagnostics: {
          matchedJoinedSlots: 2,
          droppedSlots: {
            withoutCard: 5,
          },
        },
      }),
    ).toEqual([
      { employeeNo: '00000611', cardNo: '0102857149', placeholderName: 'P42' },
      { employeeNo: '00000612', cardNo: '0104620061', placeholderName: 'P43' },
    ])
  })

  it('formats a slot label for staff-facing selectors', () => {
    expect(
      formatAvailableAccessSlotLabel({
        employeeNo: '00000611',
        cardNo: '0102857149',
        placeholderName: 'P42',
      }),
    ).toBe('P42 • 00000611 • 0102857149')
  })

  it('fetches available slots from the PWA route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          ok: true,
          slots: [
            { employeeNo: '00000612', cardNo: '0104620061', placeholderName: 'P43' },
            { employeeNo: '00000611', cardNo: '0102857149', placeholderName: 'P42' },
          ],
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchAvailableAccessSlots()).resolves.toEqual([
      { employeeNo: '00000611', cardNo: '0102857149', placeholderName: 'P42' },
      { employeeNo: '00000612', cardNo: '0104620061', placeholderName: 'P43' },
    ])
    expect(fetchMock).toHaveBeenCalledWith('/api/access/slots/available', {
      method: 'GET',
      cache: 'no-store',
    })
  })
})
