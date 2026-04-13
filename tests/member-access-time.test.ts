import { describe, expect, it } from 'vitest'
import {
  calculateInclusiveEndDate,
  findMatchingMemberDuration,
  formatAccessDate,
  getAccessDateInputValue,
  getAccessTimeInputValue,
  getJamaicaDayWindow,
  getJamaicaExpiringWindow,
  isWithinJamaicaExpiringWindow,
} from '@/lib/member-access-time'

describe('member access time helpers', () => {
  it('extracts date and time input values from persisted timestamps', () => {
    expect(getAccessDateInputValue('2026-03-30T00:00:00.000Z')).toBe('2026-03-30')
    expect(getAccessTimeInputValue('2026-03-30T00:00:00.000Z')).toBe('00:00:00')
  })

  it('calculates fixed-day inclusive end dates for supported durations', () => {
    expect(calculateInclusiveEndDate('2026-03-30', '1_day')).toBe('2026-03-30')
    expect(calculateInclusiveEndDate('2026-03-30', '1_month')).toBe('2026-04-26')
    expect(calculateInclusiveEndDate('2026-03-30', '13_months')).toBe('2027-03-28')
  })

  it('matches a persisted access window back to a supported duration', () => {
    expect(
      findMatchingMemberDuration(
        '2026-03-30T08:00:00.000Z',
        '2026-04-12T23:59:59.000Z',
      ),
    ).toBe('2_weeks')
  })

  it('returns null when the persisted end date does not map to a supported duration', () => {
    expect(
      findMatchingMemberDuration(
        '2026-03-30T08:00:00.000Z',
        '2026-04-13T23:59:59.000Z',
      ),
    ).toBeNull()
  })

  it('builds the expiring-members window from Jamaica calendar dates', () => {
    expect(getJamaicaExpiringWindow(new Date('2026-04-02T10:15:30.000Z'))).toEqual({
      startInclusive: '2026-04-02T00:00:00-05:00',
      endExclusive: '2026-04-10T00:00:00-05:00',
    })
  })

  it('matches timestamps against the Jamaica expiring-members window boundaries', () => {
    const now = new Date('2026-04-02T10:15:30.000Z')

    expect(isWithinJamaicaExpiringWindow('2026-04-02T05:00:00.000Z', now)).toBe(true)
    expect(isWithinJamaicaExpiringWindow('2026-04-10T04:59:59.000Z', now)).toBe(true)
    expect(isWithinJamaicaExpiringWindow('2026-04-10T05:00:00.000Z', now)).toBe(false)
    expect(isWithinJamaicaExpiringWindow('not-a-date', now)).toBe(false)
    expect(isWithinJamaicaExpiringWindow(null, now)).toBe(false)
  })

  it('builds a single Jamaica-local day window for a specific reminder offset', () => {
    expect(getJamaicaDayWindow(new Date('2026-04-10T13:15:30.000Z'), 7)).toEqual({
      targetDateValue: '2026-04-17',
      startInclusive: '2026-04-17T00:00:00-05:00',
      endExclusive: '2026-04-18T00:00:00-05:00',
    })
  })

  it('formats membership dates from the stored calendar date instead of shifting by timezone', () => {
    expect(formatAccessDate('2026-04-04T00:00:00Z', 'short')).toBe('4 Apr 2026')
  })
})
