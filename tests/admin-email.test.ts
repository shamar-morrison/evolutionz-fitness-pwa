import { describe, expect, it } from 'vitest'
import {
  dedupeRecipientsByEmail,
  getResendDailyEmailLimit,
  getServerResendDailyEmailLimit,
  hasMeaningfulHtmlContent,
  resolveDraftEmailRecipients,
  sortEmailRecipientsByLastName,
  toEmailRecipient,
} from '@/lib/admin-email'
import type { Member } from '@/types'

const MEMBER_TYPE_ID = '123e4567-e89b-12d3-a456-426614174100'
const OTHER_MEMBER_TYPE_ID = '123e4567-e89b-12d3-a456-426614174101'

function createMember(overrides: Partial<Member> = {}): Member {
  return {
    id: overrides.id ?? '123e4567-e89b-12d3-a456-426614174000',
    employeeNo: overrides.employeeNo ?? 'EMP-001',
    name: overrides.name ?? 'Member One',
    cardNo: overrides.cardNo ?? null,
    cardCode: overrides.cardCode ?? null,
    cardStatus: overrides.cardStatus ?? null,
    cardLostAt: overrides.cardLostAt ?? null,
    type: overrides.type ?? 'General',
    memberTypeId: overrides.memberTypeId ?? null,
    status: overrides.status ?? 'Active',
    deviceAccessState: overrides.deviceAccessState ?? 'ready',
    gender: overrides.gender ?? null,
    email: overrides.email ?? 'member@example.com',
    phone: overrides.phone ?? null,
    remark: overrides.remark ?? null,
    photoUrl: overrides.photoUrl ?? null,
    joinedAt: overrides.joinedAt ?? null,
    beginTime: overrides.beginTime ?? null,
    endTime: overrides.endTime ?? null,
  }
}

describe('admin email helpers', () => {
  it('treats empty rich text markup as empty content', () => {
    expect(hasMeaningfulHtmlContent('<p></p>')).toBe(false)
    expect(hasMeaningfulHtmlContent('<p> &nbsp; </p>')).toBe(false)
    expect(hasMeaningfulHtmlContent('<p>Hello team</p>')).toBe(true)
  })

  it('prefers the public resend daily limit for UI display and falls back to 100 when invalid', () => {
    const originalPublicLimit = process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT
    const originalLimit = process.env.RESEND_DAILY_EMAIL_LIMIT

    try {
      process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = '180'
      process.env.RESEND_DAILY_EMAIL_LIMIT = '250'
      expect(getResendDailyEmailLimit()).toBe(180)

      process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = 'invalid'
      process.env.RESEND_DAILY_EMAIL_LIMIT = '250'
      expect(getResendDailyEmailLimit()).toBe(100)

      process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = '12px'
      expect(getResendDailyEmailLimit()).toBe(100)

      process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = '0'
      expect(getResendDailyEmailLimit()).toBe(100)

      process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = '-5'
      expect(getResendDailyEmailLimit()).toBe(100)

      process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = '+5'
      expect(getResendDailyEmailLimit()).toBe(100)

      delete process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT
      process.env.RESEND_DAILY_EMAIL_LIMIT = '250'
      expect(getResendDailyEmailLimit()).toBe(250)
    } finally {
      if (originalPublicLimit === undefined) {
        delete process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT
      } else {
        process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = originalPublicLimit
      }

      if (originalLimit === undefined) {
        delete process.env.RESEND_DAILY_EMAIL_LIMIT
      } else {
        process.env.RESEND_DAILY_EMAIL_LIMIT = originalLimit
      }
    }
  })

  it('keeps the server resend daily limit on the server-only env value', () => {
    const originalPublicLimit = process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT
    const originalLimit = process.env.RESEND_DAILY_EMAIL_LIMIT

    try {
      process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = '180'
      process.env.RESEND_DAILY_EMAIL_LIMIT = '250'
      expect(getServerResendDailyEmailLimit()).toBe(250)

      process.env.RESEND_DAILY_EMAIL_LIMIT = '12px'
      expect(getServerResendDailyEmailLimit()).toBe(100)

      process.env.RESEND_DAILY_EMAIL_LIMIT = '0'
      expect(getServerResendDailyEmailLimit()).toBe(100)
    } finally {
      if (originalPublicLimit === undefined) {
        delete process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT
      } else {
        process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = originalPublicLimit
      }

      if (originalLimit === undefined) {
        delete process.env.RESEND_DAILY_EMAIL_LIMIT
      } else {
        process.env.RESEND_DAILY_EMAIL_LIMIT = originalLimit
      }
    }
  })

  it('rejects normalized recipients that still fail the shared recipient schema', () => {
    expect(
      toEmailRecipient(
        createMember({
          id: 'member-1',
          name: 'Member One',
          email: 'not-an-email',
        }),
      ),
    ).toBeNull()

    expect(
      toEmailRecipient(
        createMember({
          id: 'member-2',
          name: ' Member Two ',
          email: ' MEMBER2@example.com ',
        }),
      ),
    ).toEqual({
      id: 'member-2',
      name: 'Member Two',
      email: 'member2@example.com',
    })
  })

  it('intersects status filters with their selected membership types', () => {
    const members = [
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Active General',
        email: 'active-general@example.com',
        status: 'Active',
        memberTypeId: MEMBER_TYPE_ID,
        endTime: '2026-04-30T00:00:00.000Z',
      }),
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174002',
        name: 'Expiring Other',
        email: 'expiring-other@example.com',
        status: 'Active',
        memberTypeId: OTHER_MEMBER_TYPE_ID,
        endTime: '2026-04-15T03:00:00.000Z',
      }),
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174003',
        name: 'Expired General',
        email: 'expired-general@example.com',
        status: 'Expired',
        memberTypeId: MEMBER_TYPE_ID,
        endTime: '2026-04-01T00:00:00.000Z',
      }),
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174004',
        name: 'Active Other',
        email: 'active-other@example.com',
        status: 'Active',
        memberTypeId: OTHER_MEMBER_TYPE_ID,
        endTime: '2026-04-30T00:00:00.000Z',
      }),
    ]

    const recipients = resolveDraftEmailRecipients(members, {
      activeMembers: true,
      expiringMembers: true,
      expiredMembers: true,
      activeMemberTypeIds: [MEMBER_TYPE_ID],
      expiringMemberTypeIds: [OTHER_MEMBER_TYPE_ID],
      expiredMemberTypeIds: [MEMBER_TYPE_ID],
      individualIds: [],
      now: new Date('2026-04-11T12:00:00.000Z'),
    })

    expect(recipients.map((recipient) => recipient.id)).toEqual([
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
      '123e4567-e89b-12d3-a456-426614174003',
    ])
  })

  it('requires at least one membership type per status filter but still includes individuals', () => {
    const members = [
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174010',
        name: 'Active Member',
        email: 'shared@example.com',
        status: 'Active',
        memberTypeId: MEMBER_TYPE_ID,
      }),
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174011',
        name: 'Expired Member',
        email: 'shared@example.com',
        status: 'Expired',
        memberTypeId: MEMBER_TYPE_ID,
      }),
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174012',
        name: 'Suspended Member',
        email: 'suspended@example.com',
        status: 'Suspended',
      }),
    ]

    expect(
      resolveDraftEmailRecipients(members, {
        activeMembers: false,
        expiringMembers: false,
        expiredMembers: false,
        activeMemberTypeIds: [],
        expiringMemberTypeIds: [],
        expiredMemberTypeIds: [],
        individualIds: [],
      }),
    ).toEqual([])

    const expiredRecipients = resolveDraftEmailRecipients(members, {
      activeMembers: true,
      expiringMembers: false,
      expiredMembers: true,
      activeMemberTypeIds: [],
      expiringMemberTypeIds: [],
      expiredMemberTypeIds: [],
      individualIds: ['123e4567-e89b-12d3-a456-426614174012'],
    })

    expect(expiredRecipients.map((recipient) => recipient.id)).toEqual([
      '123e4567-e89b-12d3-a456-426614174012',
    ])
  })

  it('deduplicates by email and sorts recipients alphabetically by last name', () => {
    const recipients = [
      { id: '1', name: 'Jordan Smith', email: 'smith@example.com' },
      { id: '2', name: 'Avery Brown', email: 'brown@example.com' },
      { id: '3', name: 'Casey Adams', email: 'SMITH@example.com' },
      { id: '4', name: 'Taylor Brown', email: 'taylor@example.com' },
    ]

    expect(
      dedupeRecipientsByEmail(sortEmailRecipientsByLastName(recipients)).map(
        (recipient) => recipient.name,
      ),
    ).toEqual(['Casey Adams', 'Avery Brown', 'Taylor Brown'])
  })
})
