import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MEMBER_EVENTS_PAGE_SIZE,
  convertHikEventTimeToJamaicaIso,
  fetchMemberEvents,
  formatMemberEventTime,
  mapMinorCodeToMemberEventStatus,
} from '@/lib/member-events'

function createJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('member event helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('maps Hik minor codes to member event statuses', () => {
    expect(mapMinorCodeToMemberEventStatus(1)).toBe('success')
    expect(mapMinorCodeToMemberEventStatus(2)).toBe('denied_invalid_card')
    expect(mapMinorCodeToMemberEventStatus(3)).toBe('denied_expired')
    expect(mapMinorCodeToMemberEventStatus(8)).toBe('denied')
    expect(mapMinorCodeToMemberEventStatus(75)).toBe('denied_not_in_whitelist')
    expect(mapMinorCodeToMemberEventStatus(999)).toBe('denied')
  })

  it('keeps the Hik wall-clock time and ignores the bogus timezone offset', () => {
    expect(convertHikEventTimeToJamaicaIso('2025-03-03T16:25:49+08:00')).toBe(
      '2025-03-03T16:25:49-05:00',
    )
  })

  it('formats member event times exactly like the member detail table', () => {
    expect(formatMemberEventTime('2025-03-03T16:25:49-05:00')).toBe(
      '3 Mar 2025, 04:25 pm',
    )
  })

  it('fetches member events using only page and limit query params', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createJsonResponse(
        {
          events: [],
          totalMatches: 0,
        },
        200,
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMemberEvents('member-1', 2)).resolves.toEqual({
      events: [],
      totalMatches: 0,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/members/member-1/events?page=2&limit=${MEMBER_EVENTS_PAGE_SIZE}`,
      {
        method: 'GET',
        cache: 'no-store',
      },
    )
  })
})
