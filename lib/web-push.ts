import webpush, { type WebPushError } from 'web-push'
import { getRequiredServerEnv } from '@/lib/server-env'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type PushPayload = {
  title: string
  body: string
  url?: string
}

type PushSubscriptionRow = {
  id: string
  profile_id: string
  endpoint: string
  p256dh: string
  auth: string
}

let configured = false

function ensureConfigured() {
  if (configured) return
  webpush.setVapidDetails(
    getRequiredServerEnv('VAPID_SUBJECT'),
    getRequiredServerEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    getRequiredServerEnv('VAPID_PRIVATE_KEY'),
  )
  configured = true
}

function isStaleSubscriptionError(error: unknown): boolean {
  const status = (error as WebPushError)?.statusCode
  return status === 404 || status === 410
}

export async function sendPushToProfiles(profileIds: string[], payload: PushPayload) {
  if (profileIds.length === 0) return

  ensureConfigured()

  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, profile_id, endpoint, p256dh, auth')
    .in('profile_id', profileIds)

  if (error) {
    console.error('[web-push] failed to read push_subscriptions:', error.message)
    return
  }

  const rows = (data ?? []) as PushSubscriptionRow[]
  if (rows.length === 0) return

  const payloadString = JSON.stringify(payload)

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payloadString,
        )
      } catch (err) {
        if (isStaleSubscriptionError(err)) {
          const { error: deleteError } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', row.id)
          if (deleteError) {
            console.error(
              '[web-push] failed to delete stale subscription:',
              deleteError.message,
            )
          }
          return
        }
        console.error('[web-push] push send failed:', err)
      }
    }),
  )
}
