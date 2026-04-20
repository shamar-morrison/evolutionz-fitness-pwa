import type { Notification } from '@/lib/pt-scheduling'

type SupabaseAdminLike = {
  from(table: string): any
}

type NotificationInsert = {
  recipientId: string
  type: Notification['type']
  title: string
  body: string
  metadata?: Record<string, unknown> | null
}

type RequestNotificationType = Extract<
  Notification['type'],
  | 'reschedule_request'
  | 'status_change_request'
  | 'member_create_request'
  | 'member_edit_request'
  | 'member_payment_request'
  | 'member_extension_request'
  | 'member_pause_request'
  | 'class_registration_edit_request'
  | 'class_registration_removal_request'
>

type AdminRecipient = {
  id: string
  name: string
}

export async function readAdminNotificationRecipients(
  supabase: SupabaseAdminLike,
): Promise<AdminRecipient[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name')
    .contains('titles', ['Owner'])

  if (error) {
    throw new Error(`Failed to read admin notification recipients: ${error.message}`)
  }

  return (data ?? []) as AdminRecipient[]
}

export async function insertNotifications(
  supabase: SupabaseAdminLike,
  notifications: NotificationInsert[],
) {
  if (notifications.length === 0) {
    return
  }

  const { error } = await supabase.from('notifications').insert(
    notifications.map((notification) => ({
      recipient_id: notification.recipientId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      metadata: notification.metadata ?? null,
    })),
  )

  if (error) {
    throw new Error(`Failed to create notifications: ${error.message}`)
  }
}

export async function archiveResolvedRequestNotifications(
  supabase: SupabaseAdminLike,
  input: {
    requestId: string
    type: RequestNotificationType
    archivedAt?: string
  },
) {
  const requestId = input.requestId.trim()

  if (!requestId) {
    return
  }

  const { error } = await supabase
    .from('notifications')
    .update({ archived_at: input.archivedAt ?? new Date().toISOString() })
    .eq('type', input.type)
    .eq('metadata->>requestId', requestId)
    .is('archived_at', null)

  if (error) {
    throw new Error(`Failed to archive notifications: ${error.message}`)
  }
}
