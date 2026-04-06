import type { UserRole } from '@/types'

export function getAuthenticatedHomePath(role: UserRole | null | undefined) {
  return role === 'staff' ? '/trainer/schedule' : '/dashboard'
}
