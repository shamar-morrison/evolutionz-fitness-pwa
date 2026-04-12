import type { Notification } from '@/lib/pt-scheduling'
import type { UserRole } from '@/types'

export const ARCHIVABLE_NOTIFICATION_TYPES = [
  'reschedule_approved',
  'reschedule_denied',
  'status_change_approved',
  'status_change_denied',
  'client_assigned',
] as const satisfies ReadonlyArray<Notification['type']>

export const ADMIN_REQUEST_ARCHIVABLE_NOTIFICATION_TYPES = [
  'reschedule_request',
  'status_change_request',
  'member_create_request',
  'member_edit_request',
  'member_payment_request',
] as const satisfies ReadonlyArray<Notification['type']>

export function getArchivableNotificationTypes(role: UserRole | null) {
  if (role === 'admin') {
    return [...ARCHIVABLE_NOTIFICATION_TYPES, ...ADMIN_REQUEST_ARCHIVABLE_NOTIFICATION_TYPES]
  }

  return [...ARCHIVABLE_NOTIFICATION_TYPES]
}

export function isNotificationArchivable(
  notification: Pick<Notification, 'type' | 'read'>,
  role: UserRole | null,
) {
  return notification.read && getArchivableNotificationTypes(role).includes(notification.type)
}
