import { describe, expect, it } from 'vitest'
import { getAssignedCardNo, hasAssignedCard } from '@/lib/member-card'
import { mapMemberRecordToMemberWithCardCode } from '@/lib/members'

describe('member normalization', () => {
  it('maps null card_no values to a null client cardNo', () => {
    const member = mapMemberRecordToMemberWithCardCode({
      id: 'member-1',
      employee_no: '000611',
      name: 'Jane Doe',
      card_no: null,
      type: 'General',
      status: 'Suspended',
      gender: null,
      email: null,
      phone: null,
      remark: null,
      photo_url: null,
      begin_time: '2026-03-30T00:00:00Z',
      end_time: '2026-07-15T23:59:59Z',
      balance: 0,
      created_at: '2026-03-30T14:15:16Z',
      updated_at: '2026-03-30T14:15:16Z',
    })

    expect(member.cardNo).toBeNull()
    expect(member.cardCode).toBeNull()
  })

  it('keeps assigned cards as trimmed strings', () => {
    const member = mapMemberRecordToMemberWithCardCode(
      {
        id: 'member-1',
        employee_no: '000611',
        name: 'P42 Jane Doe',
        card_no: ' 0102857149 ',
        type: 'General',
        status: 'Active',
        gender: null,
        email: null,
        phone: null,
        remark: null,
        photo_url: null,
        begin_time: '2026-03-30T00:00:00Z',
        end_time: '2026-07-15T23:59:59Z',
        balance: 0,
        created_at: '2026-03-30T14:15:16Z',
        updated_at: '2026-03-30T14:15:16Z',
      },
      new Map([['0102857149', 'P42']]),
    )

    expect(member.cardNo).toBe('0102857149')
    expect(member.cardCode).toBe('P42')
  })

  it('treats null and empty card numbers as unassigned', () => {
    expect(getAssignedCardNo(null)).toBeNull()
    expect(getAssignedCardNo('')).toBeNull()
    expect(getAssignedCardNo('   ')).toBeNull()
    expect(hasAssignedCard(null)).toBe(false)
    expect(hasAssignedCard('')).toBe(false)
    expect(hasAssignedCard(' 0102857149 ')).toBe(true)
  })
})
