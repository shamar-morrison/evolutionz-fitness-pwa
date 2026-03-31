import { buildMemberDisplayName } from '@/lib/member-name'
import type { Member } from '@/types'

function normalizeSearchValue(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

export function matchesMemberSearch(member: Member, query: string) {
  const normalizedQuery = normalizeSearchValue(query)

  if (!normalizedQuery) {
    return true
  }

  return (
    normalizeSearchValue(member.name).includes(normalizedQuery) ||
    normalizeSearchValue(buildMemberDisplayName(member.name, member.cardCode)).includes(normalizedQuery) ||
    normalizeSearchValue(member.cardCode).includes(normalizedQuery) ||
    normalizeSearchValue(member.cardNo).includes(normalizedQuery) ||
    normalizeSearchValue(member.employeeNo).includes(normalizedQuery)
  )
}
