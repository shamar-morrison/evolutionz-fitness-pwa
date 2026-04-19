import { describe, expect, it } from 'vitest'
import {
  dedupeRecipientsByEmail,
  getResendDailyEmailLimit,
  getServerResendDailyEmailLimit,
  hasMeaningfulHtmlContent,
  resolveDraftEmailRecipients,
  toEmailRecipient,
} from '@/lib/admin-email'
import type { Member } from '@/types'

const MEMBER_TYPE_ID = '123e4567-e89b-12d3-a456-426614174100'

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

    process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = '180'
    process.env.RESEND_DAILY_EMAIL_LIMIT = '250'
    expect(getResendDailyEmailLimit()).toBe(180)

    process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = 'invalid'
    process.env.RESEND_DAILY_EMAIL_LIMIT = 'invalid'
    expect(getResendDailyEmailLimit()).toBe(100)

    delete process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT
    process.env.RESEND_DAILY_EMAIL_LIMIT = '250'
    expect(getResendDailyEmailLimit()).toBe(250)

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
  })

  it('keeps the server resend daily limit on the server-only env value', () => {
    const originalPublicLimit = process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT
    const originalLimit = process.env.RESEND_DAILY_EMAIL_LIMIT

    process.env.NEXT_PUBLIC_RESEND_DAILY_EMAIL_LIMIT = '180'
    process.env.RESEND_DAILY_EMAIL_LIMIT = '250'
    expect(getServerResendDailyEmailLimit()).toBe(250)

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

  it('resolves selected recipients and deduplicates by email for live counts', () => {
    const members = [
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Active Member',
        email: 'active@example.com',
        status: 'Active',
        endTime: '2026-04-30T00:00:00.000Z',
      }),
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174002',
        name: 'Expiring Member',
        email: 'expire@example.com',
        status: 'Active',
        endTime: '2026-04-15T03:00:00.000Z',
      }),
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174003',
        name: 'Type Match',
        email: 'type@example.com',
        status: 'Active',
        memberTypeId: MEMBER_TYPE_ID,
        endTime: '2026-04-30T00:00:00.000Z',
      }),
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174004',
        name: 'Duplicate Email',
        email: 'TYPE@example.com',
        status: 'Expired',
        endTime: '2026-04-01T00:00:00.000Z',
      }),
    ]

    const recipients = resolveDraftEmailRecipients(members, {
      activeMembers: true,
      expiringMembers: true,
      expiredMembers: false,
      includeMemberTypes: true,
      memberTypeIds: [MEMBER_TYPE_ID],
      individualIds: ['123e4567-e89b-12d3-a456-426614174004'],
      now: new Date('2026-04-11T12:00:00.000Z'),
    })

    expect(recipients.map((recipient) => recipient.id)).toEqual([
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
      '123e4567-e89b-12d3-a456-426614174003',
      '123e4567-e89b-12d3-a456-426614174004',
    ])
    expect(dedupeRecipientsByEmail(recipients).map((recipient) => recipient.email)).toEqual([
      'active@example.com',
      'expire@example.com',
      'type@example.com',
    ])
  })

  it('includes expired members only when the expired filter is selected', () => {
    const members = [
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174010',
        name: 'Active Member',
        email: 'shared@example.com',
        status: 'Active',
      }),
      createMember({
        id: '123e4567-e89b-12d3-a456-426614174011',
        name: 'Expired Member',
        email: 'shared@example.com',
        status: 'Expired',
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
        includeMemberTypes: false,
        memberTypeIds: [],
        individualIds: [],
      }),
    ).toEqual([])

    const expiredRecipients = resolveDraftEmailRecipients(members, {
      activeMembers: true,
      expiringMembers: false,
      expiredMembers: true,
      includeMemberTypes: false,
      memberTypeIds: [],
      individualIds: [],
    })

    expect(expiredRecipients.map((recipient) => recipient.id)).toEqual([
      '123e4567-e89b-12d3-a456-426614174010',
      '123e4567-e89b-12d3-a456-426614174011',
    ])
    expect(dedupeRecipientsByEmail(expiredRecipients).map((recipient) => recipient.email)).toEqual([
      'shared@example.com',
    ])
  })
})
