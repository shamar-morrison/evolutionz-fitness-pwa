import { describe, expect, it } from 'vitest'
import { isMemberInStatusFilter } from '@/lib/member-list-status-filter'
import type { Member } from '@/types'

function createMember(overrides: Partial<Pick<Member, 'status' | 'endTime'>> = {}) {
  return {
    status: overrides.status ?? 'Active',
    endTime: 'endTime' in overrides ? (overrides.endTime ?? null) : '2026-04-05T23:59:59.000Z',
  } satisfies Pick<Member, 'status' | 'endTime'>
}

describe('member list status filter', () => {
  const now = new Date('2026-04-02T10:15:30.000Z')

  it('includes active members at both Jamaica expiring-window boundaries', () => {
    expect(
      isMemberInStatusFilter(
        createMember({
          endTime: '2026-04-02T05:00:00.000Z',
        }),
        'Expiring',
        now,
      ),
    ).toBe(true)

    expect(
      isMemberInStatusFilter(
        createMember({
          endTime: '2026-04-10T04:59:59.000Z',
        }),
        'Expiring',
        now,
      ),
    ).toBe(true)
  })

  it('excludes members after the Jamaica end-exclusive boundary', () => {
    expect(
      isMemberInStatusFilter(
        createMember({
          endTime: '2026-04-10T05:00:00.000Z',
        }),
        'Expiring',
        now,
      ),
    ).toBe(false)
  })

  it('excludes non-active members even when their end time is in range', () => {
    expect(
      isMemberInStatusFilter(
        createMember({
          status: 'Expired',
          endTime: '2026-04-05T23:59:59.000Z',
        }),
        'Expiring',
        now,
      ),
    ).toBe(false)
  })

  it('excludes null or invalid end times', () => {
    expect(
      isMemberInStatusFilter(
        createMember({
          endTime: null,
        }),
        'Expiring',
        now,
      ),
    ).toBe(false)

    expect(
      isMemberInStatusFilter(
        createMember({
          endTime: 'not-a-date',
        }),
        'Expiring',
        now,
      ),
    ).toBe(false)
  })
})
