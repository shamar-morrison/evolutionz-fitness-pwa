import type { MemberDurationValue } from '@/lib/member-access-time'
import type { Member, MemberType, MemberTypeRecord } from '@/types'

export const DAY_PASS_MEMBER_TYPE = 'Day Pass' satisfies MemberType
export const MEMBER_TYPE_VALUES = [
  'General',
  'Civil Servant',
  'Student/BPO',
  DAY_PASS_MEMBER_TYPE,
] as const satisfies readonly MemberType[]
export const CARDLESS_MEMBER_DURATION_VALUES = ['1_day'] as const satisfies readonly MemberDurationValue[]
export const CARD_ACCESS_TO_CARDLESS_ERROR =
  'Cannot switch a member with card access to a cardless membership type.'
const CARDLESS_MEMBER_TYPE_CHANGE_ERROR =
  'Cardless member types can only be assigned after card access has been fully removed from the member.'

type MemberTypeRequiresCardLike = Pick<MemberTypeRecord, 'requires_card'> | null | undefined
type MemberRequiresCardLike = Pick<Member, 'requiresCard'> | null | undefined
type MemberCardIdentityLike = Pick<Member, 'cardNo' | 'employeeNo'> | null | undefined

export function isMemberType(value: string | null | undefined): value is MemberType {
  if (!value) {
    return false
  }

  return MEMBER_TYPE_VALUES.includes(value as MemberType)
}

export function memberTypeRequiresCard(memberType: MemberTypeRequiresCardLike) {
  return memberType?.requires_card !== false
}

export function memberRequiresCard(member: MemberRequiresCardLike) {
  return member?.requiresCard !== false
}

export function isCardlessMemberType(memberType: MemberTypeRequiresCardLike) {
  return !memberTypeRequiresCard(memberType)
}

export function isCardlessMember(member: MemberRequiresCardLike) {
  return !memberRequiresCard(member)
}

export function getAllowedDurationsForMemberType(memberType: MemberTypeRequiresCardLike) {
  return isCardlessMemberType(memberType) ? CARDLESS_MEMBER_DURATION_VALUES : null
}

export function getAllowedDurationsForMember(member: MemberRequiresCardLike) {
  return isCardlessMember(member) ? CARDLESS_MEMBER_DURATION_VALUES : null
}

export function isDayPassMemberTypeName(value: string | null | undefined) {
  return value?.trim() === DAY_PASS_MEMBER_TYPE
}

export function getCardlessMemberTypeChangeError(
  memberType: MemberTypeRequiresCardLike,
  member: MemberCardIdentityLike,
) {
  if (!isCardlessMemberType(memberType)) {
    return null
  }

  if (member?.cardNo || member?.employeeNo) {
    return CARDLESS_MEMBER_TYPE_CHANGE_ERROR
  }

  return null
}
