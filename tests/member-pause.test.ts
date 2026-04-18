import { describe, expect, it } from 'vitest'
import {
  calculatePlannedPauseResumeDate,
  calculateProjectedPausedMemberEndTime,
  getMemberPauseDurationValue,
  isMemberPauseEligible,
  isSupportedMemberPauseDurationDays,
} from '@/lib/member-pause'

describe('member pause helpers', () => {
  it('accepts only supported pause durations', () => {
    expect(isSupportedMemberPauseDurationDays(7)).toBe(true)
    expect(isSupportedMemberPauseDurationDays(336)).toBe(true)
    expect(isSupportedMemberPauseDurationDays(1)).toBe(false)
    expect(isSupportedMemberPauseDurationDays(364)).toBe(false)
  })

  it('maps supported pause durations back to duration selector values', () => {
    expect(getMemberPauseDurationValue(84)).toBe('3_months')
    expect(getMemberPauseDurationValue(14)).toBe('2_weeks')
    expect(getMemberPauseDurationValue(365)).toBeNull()
  })

  it('calculates the planned resume date from a Jamaica-local start date', () => {
    expect(calculatePlannedPauseResumeDate(14, '2026-04-18')).toBe('2026-05-02')
    expect(calculatePlannedPauseResumeDate(84, '2026-01-01')).toBe('2026-03-26')
  })

  it('extends the member end time by the paused duration', () => {
    const projectedEndTime = calculateProjectedPausedMemberEndTime(
      '2026-06-30T23:59:59-05:00',
      14,
    )

    expect(projectedEndTime?.toISOString()).toBe('2026-07-15T04:59:59.000Z')
  })

  it('requires an active membership to allow a pause', () => {
    expect(
      isMemberPauseEligible(
        '2026-05-01T00:00:00-05:00',
        'Active',
        new Date('2026-04-18T12:00:00-05:00'),
      ),
    ).toBe(true)
    expect(
      isMemberPauseEligible(
        '2026-05-01T00:00:00-05:00',
        'Paused',
        new Date('2026-04-18T12:00:00-05:00'),
      ),
    ).toBe(false)
    expect(
      isMemberPauseEligible(
        '2026-04-01T00:00:00-05:00',
        'Active',
        new Date('2026-04-18T12:00:00-05:00'),
      ),
    ).toBe(false)
    expect(isMemberPauseEligible(null, 'Active', new Date('2026-04-18T12:00:00-05:00'))).toBe(
      false,
    )
  })
})
