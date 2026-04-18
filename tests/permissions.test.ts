import { describe, expect, it } from 'vitest'
import {
  ROLE_PRESETS,
  resolvePermissions,
  requiresApproval,
  type Permission,
} from '@/lib/permissions'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'

function sortPermissions(permissions: Iterable<Permission>) {
  return Array.from(permissions).sort()
}

describe('permissions', () => {
  it('gives admins every permission', () => {
    const permissions = resolvePermissions('admin', ['Owner'])

    expect(sortPermissions(permissions)).toEqual(sortPermissions(ROLE_PRESETS.admin))
    expect(permissions.has('door.unlock')).toBe(true)
    expect(permissions.has('pt.assign')).toBe(true)
    expect(permissions.has('classes.manage')).toBe(true)
    expect(permissions.has('staff.suspend')).toBe(true)
    expect(permissions.has('members.extendMembership')).toBe(true)
  })

  it('never requires approval for admins', () => {
    for (const permission of ROLE_PRESETS.admin) {
      expect(requiresApproval(permission, 'admin')).toBe(false)
    }
  })

  it('gives trainers the correct permission set', () => {
    const permissions = resolvePermissions('staff', ['Trainer'])

    expect(sortPermissions(permissions)).toEqual(sortPermissions(ROLE_PRESETS.trainer))
    expect(permissions.has('door.unlock')).toBe(false)
  })

  it('requires trainer approval for marking and rescheduling PT sessions', () => {
    expect(requiresApproval('pt.markSession', 'staff')).toBe(true)
    expect(requiresApproval('pt.requestReschedule', 'staff')).toBe(true)
  })

  it('does not let trainers access member, report, or dashboard permissions', () => {
    const permissions = resolvePermissions('staff', ['Trainer'])

    expect(permissions.has('members.view')).toBe(false)
    expect(permissions.has('pt.assign')).toBe(false)
    expect(permissions.has('classes.register')).toBe(false)
    expect(permissions.has('classes.manage')).toBe(false)
    expect(permissions.has('reports.view')).toBe(false)
    expect(permissions.has('dashboard.view')).toBe(false)
  })

  it('gives administrative assistants the correct permission set', () => {
    const permissions = resolvePermissions('staff', ['Administrative Assistant'])

    expect(sortPermissions(permissions)).toEqual(
      sortPermissions(ROLE_PRESETS.administrativeAssistant),
    )
    expect(permissions.has('classes.view')).toBe(true)
    expect(permissions.has('classes.register')).toBe(true)
    expect(permissions.has('classes.manage')).toBe(false)
    expect(permissions.has('door.unlock')).toBe(true)
  })

  it('requires administrative assistant approval for member creation, edits, and payments', () => {
    expect(requiresApproval('members.create', 'staff')).toBe(true)
    expect(requiresApproval('members.edit', 'staff')).toBe(true)
    expect(requiresApproval('members.extendMembership', 'staff')).toBe(true)
    expect(requiresApproval('members.pauseMembership', 'staff')).toBe(true)
    expect(requiresApproval('members.recordPayment', 'staff')).toBe(true)
  })

  it('requires staff approval for class registrations', () => {
    expect(requiresApproval('classes.register', 'staff')).toBe(true)
  })

  it('never requires approval to unlock the door', () => {
    expect(requiresApproval('door.unlock', 'admin')).toBe(false)
    expect(requiresApproval('door.unlock', 'staff')).toBe(false)
  })

  it('does not let administrative assistants access staff management, reports, or member delete permissions', () => {
    const permissions = resolvePermissions('staff', ['Administrative Assistant'])

    expect(permissions.has('staff.manage')).toBe(false)
    expect(permissions.has('pt.assign')).toBe(false)
    expect(permissions.has('classes.manage')).toBe(false)
    expect(permissions.has('classes.markAttendance')).toBe(true)
    expect(permissions.has('reports.view')).toBe(false)
    expect(permissions.has('members.delete')).toBe(false)
  })

  it('gives assistants the same permissions as administrative assistants', () => {
    expect(sortPermissions(resolvePermissions('staff', ['Assistant']))).toEqual(
      sortPermissions(ROLE_PRESETS.administrativeAssistant),
    )
  })

  it('gives placeholder titles no permissions', () => {
    expect(sortPermissions(resolvePermissions('staff', ['Medical']))).toEqual([])
    expect(sortPermissions(resolvePermissions('staff', ['Physiotherapist/Nutritionist']))).toEqual(
      [],
    )
  })

  it('gives owner plus trainer the full admin permissions', () => {
    const permissions = resolvePermissions('admin', ['Owner', 'Trainer'])

    expect(sortPermissions(permissions)).toEqual(sortPermissions(ROLE_PRESETS.admin))
  })

  it('unions permissions for multiple non-owner staff titles', () => {
    const permissions = resolvePermissions('staff', ['Trainer', 'Administrative Assistant'])

    expect(sortPermissions(permissions)).toEqual(
      sortPermissions([
        'classes.view',
        'classes.register',
        'classes.markAttendance',
        'pt.viewOwnSchedule',
        'pt.markSession',
        'pt.requestReschedule',
        'members.view',
        'members.create',
        'members.edit',
        'members.extendMembership',
        'members.pauseMembership',
        'members.recordPayment',
        'door.unlock',
      ]),
    )
  })

  it('returns no permissions for unknown titles without throwing', () => {
    expect(sortPermissions(resolvePermissions('staff', ['Unknown Title']))).toEqual([])
  })
})

describe('resolvePermissionsForProfile', () => {
  it('derives admin role from owner title', () => {
    const permissions = resolvePermissionsForProfile({
      titles: ['Owner'],
      role: 'staff',
    })

    expect(permissions.role).toBe('admin')
    expect(permissions.can('dashboard.view')).toBe(true)
    expect(permissions.requiresApproval('members.create')).toBe(false)
  })

  it('derives staff role when owner title is absent', () => {
    const permissions = resolvePermissionsForProfile({
      titles: ['Trainer'],
      role: 'admin',
    })

    expect(permissions.role).toBe('staff')
    expect(permissions.can('pt.viewOwnSchedule')).toBe(true)
    expect(permissions.can('dashboard.view')).toBe(false)
    expect(permissions.requiresApproval('pt.markSession')).toBe(true)
  })

  it('handles null titles safely', () => {
    const permissions = resolvePermissionsForProfile({
      titles: null,
      role: null,
    })

    expect(permissions.role).toBe('staff')
    expect(permissions.can('classes.view')).toBe(false)
    expect(permissions.requiresApproval('classes.view')).toBe(false)
  })

  it('returns the correct permissions for representative title combinations', () => {
    const scenarios: Array<{
      name: string
      profile: { titles: string[] | null; role: string | null }
      expectedRole: 'admin' | 'staff'
      allowed: Permission[]
      denied: Permission[]
    }> = [
      {
        name: 'owner',
        profile: { titles: ['Owner'], role: 'staff' },
        expectedRole: 'admin',
        allowed: [
          'members.delete',
          'reports.view',
          'dashboard.view',
          'door.unlock',
          'classes.manage',
        ],
        denied: [],
      },
      {
        name: 'trainer',
        profile: { titles: ['Trainer'], role: 'staff' },
        expectedRole: 'staff',
        allowed: ['pt.viewOwnSchedule', 'pt.markSession', 'classes.view'],
        denied: [
          'members.view',
          'reports.view',
          'dashboard.view',
          'door.unlock',
          'classes.register',
          'classes.manage',
        ],
      },
      {
        name: 'administrative assistant',
        profile: { titles: ['Administrative Assistant'], role: 'staff' },
        expectedRole: 'staff',
        allowed: [
          'members.view',
          'members.create',
          'members.edit',
          'members.extendMembership',
          'members.recordPayment',
          'classes.view',
          'classes.register',
          'door.unlock',
        ],
        denied: ['staff.manage', 'members.delete', 'reports.view', 'classes.manage'],
      },
      {
        name: 'trainer plus administrative assistant',
        profile: { titles: ['Trainer', 'Administrative Assistant'], role: 'staff' },
        expectedRole: 'staff',
        allowed: [
          'pt.viewOwnSchedule',
          'pt.markSession',
          'members.view',
          'members.edit',
          'members.extendMembership',
          'members.recordPayment',
          'classes.view',
          'classes.register',
          'door.unlock',
        ],
        denied: ['staff.manage', 'reports.view', 'dashboard.view', 'classes.manage'],
      },
      {
        name: 'unknown title',
        profile: { titles: ['Mystery Role'], role: 'staff' },
        expectedRole: 'staff',
        allowed: [],
        denied: ['classes.view', 'members.view'],
      },
    ]

    for (const scenario of scenarios) {
      const permissions = resolvePermissionsForProfile(scenario.profile)

      expect(permissions.role, scenario.name).toBe(scenario.expectedRole)

      for (const permission of scenario.allowed) {
        expect(permissions.can(permission), `${scenario.name} can ${permission}`).toBe(true)
      }

      for (const permission of scenario.denied) {
        expect(permissions.can(permission), `${scenario.name} cannot ${permission}`).toBe(false)
      }
    }
  })
})
