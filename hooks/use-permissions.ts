'use client'

import { useAuth } from '@/contexts/auth-context'
import {
  resolvePermissions,
  requiresApproval,
  type Permission,
} from '@/lib/permissions'

export function usePermissions() {
  const { profile } = useAuth()

  const role = profile?.titles?.includes('Owner') ? 'admin' : 'staff'
  const titles = profile?.titles ?? []
  const permissions = resolvePermissions(role, titles)

  return {
    can: (permission: Permission): boolean => permissions.has(permission),
    requiresApproval: (permission: Permission): boolean =>
      requiresApproval(permission, role),
    role,
    permissions,
  }
}
