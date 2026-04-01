import { describe, expect, it } from 'vitest'
import {
  findMatchingMemberDuration,
  getAccessDateInputValue,
  getAccessTimeInputValue,
} from '@/lib/member-access-time'

describe('member access time helpers', () => {
  it('extracts date and time input values from persisted timestamps', () => {
    expect(getAccessDateInputValue('2026-03-30T00:00:00.000Z')).toBe('2026-03-30')
    expect(getAccessTimeInputValue('2026-03-30T00:00:00.000Z')).toBe('00:00:00')
  })

  it('matches a persisted access window back to a supported duration', () => {
    expect(
      findMatchingMemberDuration(
        '2026-03-30T08:00:00.000Z',
        '2026-04-29T23:59:59.000Z',
      ),
    ).toBe('1_month')
  })

  it('returns null when the persisted end date does not map to a supported duration', () => {
    expect(
      findMatchingMemberDuration(
        '2026-03-30T08:00:00.000Z',
        '2026-04-30T23:59:59.000Z',
      ),
    ).toBeNull()
  })
})
