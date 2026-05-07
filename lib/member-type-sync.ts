import { readMemberTypeById, type MemberTypesReadClient } from '@/lib/member-types-server'
import { isMemberType } from '@/lib/member-type-utils'
import type { MemberType } from '@/types'

export async function readMemberTypeNameById(
  supabase: MemberTypesReadClient,
  memberTypeId: string,
): Promise<MemberType> {
  const memberType = await readMemberTypeById(supabase, memberTypeId)

  if (!memberType) {
    throw new Error('Membership type not found.')
  }

  if (!isMemberType(memberType.name)) {
    throw new Error('Membership type is not supported.')
  }

  return memberType.name
}

export async function buildMemberTypeUpdateValues(
  supabase: MemberTypesReadClient,
  memberTypeId: string | null | undefined,
  currentType: MemberType,
) {
  if (memberTypeId === undefined) {
    return {}
  }

  if (memberTypeId === null) {
    return {
      member_type_id: null,
      type: currentType,
    } as const
  }

  const memberTypeName = await readMemberTypeNameById(supabase, memberTypeId)

  return {
    member_type_id: memberTypeId,
    type: memberTypeName,
  } as const
}
