import { describe, expect, it } from 'vitest'
import { getThisMonthRange, getThisWeekRange, getThisYearRange } from '@/lib/date-utils'

describe('date utils', () => {
  it('returns Monday-to-Sunday week ranges for Jamaica-local dates', () => {
    expect(getThisWeekRange(new Date('2026-04-16T15:00:00.000Z'))).toEqual({
      startDate: '2026-04-13',
      endDate: '2026-04-19',
    })
  })

  it('uses the Jamaica-local month at UTC boundaries', () => {
    expect(getThisMonthRange(new Date('2026-01-01T02:00:00.000Z'))).toEqual({
      startDate: '2025-12-01',
      endDate: '2025-12-31',
    })
  })

  it('uses the Jamaica-local year at UTC boundaries', () => {
    expect(getThisYearRange(new Date('2026-01-01T02:00:00.000Z'))).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    })
  })
})
