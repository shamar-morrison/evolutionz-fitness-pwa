import { describe, expect, it } from 'vitest'
import {
  buildAssignmentSchedule,
  buildJamaicaScheduledAt,
  buildJamaicaScheduledAtFromLocalInput,
  calculateAttendanceRate,
  formatOptionalJmdCurrency,
  formatScheduleSummary,
  formatSessionTime,
  formatPtSessionStatusLabel,
  getCurrentMonthDateRangeInJamaica,
  getDateRangeBoundsInJamaica,
  getPtSessionStatusBadgeClassName,
  getIsoWeekKey,
  getMonthRange,
  getScheduledDateValuesForMonth,
  normalizeScheduledSessions,
  normalizeSessionTimeValue,
  TRAINER_PAYOUT_PER_CLIENT_JMD,
} from '@/lib/pt-scheduling'

describe('PT scheduling helpers', () => {
  it('normalizes HH:MM session times', () => {
    expect(normalizeSessionTimeValue('07:00')).toBe('07:00')
    expect(normalizeSessionTimeValue('7:00')).toBeNull()
  })

  it('builds Jamaica-local scheduled timestamps from a date and time', () => {
    expect(buildJamaicaScheduledAt('2026-04-06', '07:00')).toBe('2026-04-06T07:00:00-05:00')
  })

  it('converts datetime-local input values into Jamaica-local timestamps', () => {
    expect(buildJamaicaScheduledAtFromLocalInput('2026-04-06T07:00')).toBe(
      '2026-04-06T07:00:00-05:00',
    )
  })

  it('finds every matching scheduled weekday in a month', () => {
    expect(getScheduledDateValuesForMonth(4, 2026, ['Monday', 'Wednesday', 'Friday'])).toEqual([
      '2026-04-01',
      '2026-04-03',
      '2026-04-06',
      '2026-04-08',
      '2026-04-10',
      '2026-04-13',
      '2026-04-15',
      '2026-04-17',
      '2026-04-20',
      '2026-04-22',
      '2026-04-24',
      '2026-04-27',
      '2026-04-29',
    ])
  })

  it('normalizes scheduled sessions in weekday order with normalized times', () => {
    expect(
      normalizeScheduledSessions([
        { day: 'Friday', sessionTime: '08:45:00' },
        { day: 'Monday', sessionTime: '06:30' },
      ]),
    ).toEqual([
      { day: 'Monday', sessionTime: '06:30' },
      { day: 'Friday', sessionTime: '08:45' },
    ])
  })

  it('builds assignment schedules by merging session times with training plan days', () => {
    expect(
      buildAssignmentSchedule(
        [
          { day: 'Monday', sessionTime: '06:30' },
          { day: 'Wednesday', sessionTime: '07:15' },
        ],
        [
          { day: 'Wednesday', trainingTypeName: 'Upper Body' },
        ],
      ),
    ).toEqual([
      {
        day: 'Monday',
        sessionTime: '06:30',
        trainingTypeName: null,
        isCustom: false,
      },
      {
        day: 'Wednesday',
        sessionTime: '07:15',
        trainingTypeName: 'Upper Body',
        isCustom: false,
      },
    ])
  })

  it('builds ISO week keys from Jamaica calendar dates', () => {
    expect(getIsoWeekKey('2026-04-01')).toBe('2026-W14')
    expect(getIsoWeekKey('2026-04-06')).toBe('2026-W15')
  })

  it('builds Jamaica month ranges with explicit -05:00 offsets', () => {
    expect(getMonthRange(4, 2026)).toEqual({
      startInclusive: '2026-04-01T00:00:00-05:00',
      endExclusive: '2026-05-01T00:00:00-05:00',
    })
  })

  it('builds Jamaica date ranges with an exclusive next-day end boundary', () => {
    expect(getDateRangeBoundsInJamaica('2026-04-01', '2026-04-30')).toEqual({
      startInclusive: '2026-04-01T00:00:00-05:00',
      endExclusive: '2026-05-01T00:00:00-05:00',
    })
  })

  it('formats mixed per-day schedules with each day time', () => {
    expect(
      formatScheduleSummary(
        [
          { day: 'Monday', sessionTime: '06:30' },
          { day: 'Wednesday', sessionTime: '07:15' },
        ],
        2,
      ),
    ).toBe(`Mon ${formatSessionTime('06:30')}, Wed ${formatSessionTime('07:15')} (2x/week)`)
  })

  it('resolves the current Jamaica month date range for date inputs', () => {
    expect(getCurrentMonthDateRangeInJamaica(new Date('2026-04-15T10:00:00Z'))).toEqual({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    })
  })

  it('calculates attendance as a whole-number percentage', () => {
    expect(calculateAttendanceRate(0, 0)).toBe(0)
    expect(calculateAttendanceRate(2, 1)).toBe(67)
    expect(calculateAttendanceRate(1, 0)).toBe(100)
  })

  it('formats the cancelled session status with a muted badge style', () => {
    expect(formatPtSessionStatusLabel('cancelled')).toBe('Cancelled')
    expect(getPtSessionStatusBadgeClassName('cancelled')).toContain('text-zinc-700')
  })

  it('exposes the trainer payout constant used by reporting', () => {
    expect(TRAINER_PAYOUT_PER_CLIENT_JMD).toBe(10500)
  })

  it('formats a missing PT fee label for non-revenue displays', () => {
    expect(formatOptionalJmdCurrency(null)).toBe('Not set')
  })
})
