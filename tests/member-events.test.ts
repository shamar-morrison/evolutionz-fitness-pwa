import { describe, expect, it } from 'vitest'
import {
  convertHikEventTimeToJamaicaIso,
  formatMemberEventTime,
  mapMinorCodeToMemberEventStatus,
} from '@/lib/member-events'

describe('member event helpers', () => {
  it('maps Hik minor codes to member event statuses', () => {
    expect(mapMinorCodeToMemberEventStatus(1)).toBe('success')
    expect(mapMinorCodeToMemberEventStatus(2)).toBe('denied_invalid_card')
    expect(mapMinorCodeToMemberEventStatus(3)).toBe('denied_expired')
    expect(mapMinorCodeToMemberEventStatus(75)).toBe('denied_not_in_whitelist')
    expect(mapMinorCodeToMemberEventStatus(999)).toBe('denied')
  })

  it('converts Hik +08 timestamps to Jamaica ISO timestamps', () => {
    expect(convertHikEventTimeToJamaicaIso('2026-04-02T14:17:00')).toBe(
      '2026-04-02T01:17:00-05:00',
    )
  })

  it('formats member event times exactly like the member detail table', () => {
    expect(formatMemberEventTime('2026-04-02T13:17:00-05:00')).toBe(
      '2 Apr 2026, 01:17 pm',
    )
  })
})
