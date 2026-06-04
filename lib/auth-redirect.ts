import type { UserRole } from '@/types'
import { hasStaffTitle, isFrontDeskStaff } from '@/lib/staff'

export function getAuthenticatedHomePath(
  role: UserRole | null | undefined,
  titles: ReadonlyArray<string> | null | undefined = [],
) {
  if (role === 'admin' || hasStaffTitle(titles, 'Owner')) {
    return '/dashboard'
  }

  if (hasStaffTitle(titles, 'Trainer')) {
    return '/trainer/schedule'
  }

  if (hasStaffTitle(titles, 'Medical/Consultant')) {
    return '/medical'
  }

  if (isFrontDeskStaff(titles)) {
    return '/members'
  }

  return role === null || role === undefined ? '/login' : '/unauthorized'
}
