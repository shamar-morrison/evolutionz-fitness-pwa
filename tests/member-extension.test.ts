import { describe, expect, it } from 'vitest'
import {
  getMemberDurationDays,
  getMemberDurationLabelFromDays,
  getMemberDurationValueFromDays,
} from '@/lib/member-access-time'
import {
  buildExtendedMemberEndTimeValue,
  calculateProjectedMemberEndTime,
  formatMemberExtensionDate,
  formatMemberExtensionDuration,
  isMemberExtensionEligible,
} from '@/lib/member-extension'

describe('member extension helpers', () => {
  it('maps reusable membership duration values to the fixed-day options', () => {
    expect(getMemberDurationDays('1_day')).toBe(1)
    expect(getMemberDurationDays('3_months')).toBe(84)
    expect(getMemberDurationDays('13_months')).toBe(364)
    expect(getMemberDurationValueFromDays(84)).toBe('3_months')
    expect(getMemberDurationLabelFromDays(252)).toBe('9 Months')
  })

  it('calculates projected extension timestamps using fixed-day arithmetic', () => {
    const projectedEndTime = calculateProjectedMemberEndTime(
      '2026-04-30T23:59:59.000Z',
      28,
    )

    expect(projectedEndTime?.toISOString()).toBe('2026-05-28T23:59:59.000Z')
    expect(buildExtendedMemberEndTimeValue('2026-04-30T23:59:59.000Z', 28)).toBe(
      '2026-05-28T23:59:59',
    )
  })

  it('formats extension summaries using Jamaica local dates', () => {
    expect(formatMemberExtensionDate('2026-05-29T04:59:59.000Z')).toBe('28 May 2026')
    expect(formatMemberExtensionDuration(84)).toBe('3 Months (84 days)')
  })

  it('treats only active memberships as eligible for extension', () => {
    expect(
      isMemberExtensionEligible(
        '2026-04-30T23:59:59.000Z',
        'Active',
        new Date('2026-04-29T12:00:00.000Z'),
      ),
    ).toBe(true)
    expect(
      isMemberExtensionEligible(
        '2026-04-30T23:59:59.000Z',
        'Active',
        new Date('2026-05-01T12:00:00.000Z'),
      ),
    ).toBe(false)
    expect(
      isMemberExtensionEligible(
        '2026-04-30T23:59:59.000Z',
        'Suspended',
        new Date('2026-04-29T12:00:00.000Z'),
      ),
    ).toBe(false)
    expect(
      isMemberExtensionEligible(null, 'Active', new Date('2026-04-29T12:00:00.000Z')),
    ).toBe(false)
  })
})
