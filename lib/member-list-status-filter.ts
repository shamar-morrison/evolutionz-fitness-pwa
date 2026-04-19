import { isWithinJamaicaExpiringWindow } from '@/lib/member-access-time'
import type { Member } from '@/types'

export type MembersListStatusFilter = Member['status'] | 'All' | 'Expiring'

export const MEMBERS_LIST_STATUS_OPTIONS: MembersListStatusFilter[] = [
  'All',
  'Active',
  'Expired',
  'Suspended',
  'Paused',
  'Expiring',
]

export function isMembersListStatusFilter(
  value: string | null | undefined,
): value is MembersListStatusFilter {
  return (
    value === 'All' ||
    value === 'Active' ||
    value === 'Expired' ||
    value === 'Suspended' ||
    value === 'Paused' ||
    value === 'Expiring'
  )
}

export function isMemberInStatusFilter(
  member: Pick<Member, 'status' | 'endTime'>,
  filter: MembersListStatusFilter,
  now: Date = new Date(),
) {
  if (filter === 'All') {
    return true
  }

  if (filter === 'Expiring') {
    return member.status === 'Active' && isWithinJamaicaExpiringWindow(member.endTime, now)
  }

  return member.status === filter
}
