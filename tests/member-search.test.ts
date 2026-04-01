import { describe, expect, it } from 'vitest'
import { buildMemberDisplayName, getCleanMemberName } from '@/lib/member-name'
import { matchesMemberSearch } from '@/lib/member-search'

const member = {
  id: 'member-1',
  employeeNo: '000611',
  name: 'Kimberly Connell',
  cardNo: '3583058668',
  cardCode: 'A1',
  type: 'General' as const,
  status: 'Active' as const,
  deviceAccessState: 'ready' as const,
  gender: null,
  email: null,
  phone: null,
  remark: null,
  photoUrl: null,
  beginTime: '2026-03-30T00:00:00.000Z',
  endTime: '2026-07-15T23:59:59.000Z',
  balance: 0,
  createdAt: '2026-03-30T14:15:16.000Z',
}

describe('member search helpers', () => {
  it('normalizes stale prefixed names before display', () => {
    expect(getCleanMemberName('J11 Trishana Baker', 'J11')).toBe('Trishana Baker')
    expect(buildMemberDisplayName('J11 Trishana Baker', 'J11')).toBe('J11 Trishana Baker')
  })

  it('matches prefixed display names and core member identifiers', () => {
    expect(matchesMemberSearch(member, 'A1 Kimberly')).toBe(true)
    expect(matchesMemberSearch(member, 'A1')).toBe(true)
    expect(matchesMemberSearch(member, 'Kimberly')).toBe(true)
    expect(matchesMemberSearch(member, '3583058668')).toBe(true)
    expect(matchesMemberSearch(member, '000611')).toBe(true)
    expect(matchesMemberSearch(member, 'B3')).toBe(false)
  })

  it('does not throw when cardNo is null', () => {
    expect(
      matchesMemberSearch(
        {
          ...member,
          cardNo: null,
        },
        '3583058668',
      ),
    ).toBe(false)
  })
})
