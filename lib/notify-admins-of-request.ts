import type { Notification } from '@/lib/pt-scheduling'
import {
  insertNotifications,
  readAdminNotificationRecipients,
} from '@/lib/pt-notifications-server'
import { sendPushToProfiles } from '@/lib/web-push'

type SupabaseNotificationsClient = {
  from(table: string): any
}

export type NotificationType = Extract<
  Notification['type'],
  | 'member_create_request'
  | 'member_edit_request'
  | 'member_payment_request'
  | 'member_extension_request'
  | 'member_pause_request'
  | 'class_registration_edit_request'
  | 'class_registration_removal_request'
>

export async function notifyAdminsOfRequest(
  supabase: SupabaseNotificationsClient,
  notification: {
    type: NotificationType
    title: string
    body: string
    url: string
    metadata: Record<string, unknown>
    pushTitle?: string
    pushBody?: string
    logMessage: string
  },
): Promise<void> {
  try {
    const adminRecipients = await readAdminNotificationRecipients(supabase)
    const recipientIds = adminRecipients.map((recipient) => recipient.id)

    await insertNotifications(
      supabase,
      adminRecipients.map((recipient) => ({
        recipientId: recipient.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        metadata: notification.metadata,
      })),
    )

    await sendPushToProfiles(recipientIds, {
      title: notification.pushTitle ?? notification.title,
      body: notification.pushBody ?? notification.body,
      url: notification.url,
    })
  } catch (error) {
    console.error(notification.logMessage, error)
  }
}
