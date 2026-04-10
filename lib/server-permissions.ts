import {
  resolvePermissions,
  requiresApproval,
  type Permission,
} from '@/lib/permissions'

type Profile = {
  titles: string[] | null
  role: string | null
}

export function resolvePermissionsForProfile(profile: Profile) {
  const role = profile.titles?.includes('Owner') ? 'admin' : 'staff'
  const titles = profile.titles ?? []
  const permissions = resolvePermissions(role, titles)

  return {
    can: (permission: Permission): boolean => permissions.has(permission),
    requiresApproval: (permission: Permission): boolean =>
      requiresApproval(permission, role),
    role,
  }
}
