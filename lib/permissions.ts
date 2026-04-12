export type Permission =
  | 'members.view'
  | 'members.create'
  | 'members.edit'
  | 'members.delete'
  | 'members.suspend'
  | 'members.recordPayment'
  | 'door.unlock'
  | 'pt.assign'
  | 'pt.viewOwnSchedule'
  | 'pt.viewAllSchedules'
  | 'pt.markSession'
  | 'pt.requestReschedule'
  | 'classes.view'
  | 'classes.register'
  | 'classes.markAttendance'
  | 'classes.manage'
  | 'classes.manageSchedule'
  | 'staff.view'
  | 'staff.manage'
  | 'reports.view'
  | 'settings.manage'
  | 'dashboard.view'

export const ROLE_PRESETS: Record<string, Permission[]> = {
  admin: [
    'members.view',
    'members.create',
    'members.edit',
    'members.delete',
    'members.suspend',
    'members.recordPayment',
    'door.unlock',
    'pt.assign',
    'pt.viewOwnSchedule',
    'pt.viewAllSchedules',
    'pt.markSession',
    'pt.requestReschedule',
    'classes.view',
    'classes.register',
    'classes.markAttendance',
    'classes.manage',
    'classes.manageSchedule',
    'staff.view',
    'staff.manage',
    'reports.view',
    'settings.manage',
    'dashboard.view',
  ],
  trainer: [
    'pt.viewOwnSchedule',
    'pt.markSession',
    'pt.requestReschedule',
    'classes.view',
  ],
  administrativeAssistant: [
    'members.view',
    'members.create',
    'members.edit',
    'members.recordPayment',
    'classes.view',
    'classes.register',
    'classes.markAttendance',
    'door.unlock',
  ],
  medical: [],
  assistant: [
    'members.view',
    'members.create',
    'members.edit',
    'members.recordPayment',
    'classes.view',
    'classes.register',
    'classes.markAttendance',
    'door.unlock',
  ],
  physiotherapistNutritionist: [],
}

const APPROVAL_REQUIRED: Set<Permission> = new Set([
  'classes.register',
  'members.create',
  'members.edit',
  'members.recordPayment',
  'pt.markSession',
  'pt.requestReschedule',
])

export function resolvePermissions(
  role: 'admin' | 'staff',
  titles: string[],
): Set<Permission> {
  if (role === 'admin') {
    return new Set(ROLE_PRESETS.admin)
  }

  const permissions = new Set<Permission>()

  for (const title of titles) {
    const normalizedTitle = normalizeTitle(title)
    const preset = ROLE_PRESETS[normalizedTitle]

    if (preset) {
      for (const permission of preset) {
        permissions.add(permission)
      }
    }
  }

  return permissions
}

export function requiresApproval(
  permission: Permission,
  role: 'admin' | 'staff',
): boolean {
  if (role === 'admin') {
    return false
  }

  return APPROVAL_REQUIRED.has(permission)
}

function normalizeTitle(title: string): string {
  const map: Record<string, string> = {
    Owner: 'admin',
    Trainer: 'trainer',
    'Administrative Assistant': 'administrativeAssistant',
    Assistant: 'assistant',
    Medical: 'medical',
    'Physiotherapist/Nutritionist': 'physiotherapistNutritionist',
  }

  return map[title.trim()] ?? ''
}
