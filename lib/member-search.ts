import { buildMemberDisplayName } from '@/lib/member-name'
import { getAssignedCardNo } from '@/lib/member-card'
import type { Member } from '@/types'

function normalizeSearchValue(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

export function matchesMemberSearch(member: Member, query: string) {
  const normalizedQuery = normalizeSearchValue(query).trim()

  if (!normalizedQuery) {
    return true
  }

  const haystacks = [
    normalizeSearchValue(member.name),
    normalizeSearchValue(buildMemberDisplayName(member.name, member.cardCode)),
    normalizeSearchValue(member.cardCode),
    normalizeSearchValue(getAssignedCardNo(member.cardNo)),
    normalizeSearchValue(member.employeeNo),
  ]

  // Fast path: exact substring preserves existing single-term behavior
  // (e.g. "Kimberly", "A1 Kimberly", card numbers).
  if (haystacks.some((haystack) => haystack.includes(normalizedQuery))) {
    return true
  }

  // Order-independent matching: every token (split on whitespace/commas)
  // must appear somewhere across the searchable fields. This makes
  // "Connell Kimberly" and "Connell, Kimberly" match "Kimberly Connell".
  const tokens = normalizedQuery.split(/[\s,]+/).filter(Boolean)

  if (tokens.length <= 1) {
    return false
  }

  return tokens.every((token) => haystacks.some((haystack) => haystack.includes(token)))
}
