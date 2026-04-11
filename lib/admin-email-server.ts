import { getRequiredServerEnv } from '@/lib/server-env'
import { stripHtmlToText } from '@/lib/admin-email'

const ADMIN_EMAIL_DELIVERIES_TABLE = 'admin_email_deliveries'
const RESEND_API_URL = 'https://api.resend.com/emails'

type ResendAttachment = {
  filename: string
  content: string
  content_type?: string
}

type ResendSuccessResponse = {
  id?: string
}

type ResendErrorResponse = {
  error?: {
    message?: string
  }
  message?: string
}

type AdminEmailDeliveryRow = {
  id?: string
  sender_profile_id: string
  send_date: string
  idempotency_key: string
  recipient_email: string
  status: 'pending' | 'sent'
  provider_message_id?: string | null
  sent_at?: string | null
  created_at?: string
}

function getResendErrorMessage(responseBody: unknown) {
  if (
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'error' in responseBody &&
    responseBody.error &&
    typeof responseBody.error === 'object' &&
    'message' in responseBody.error &&
    typeof responseBody.error.message === 'string'
  ) {
    return responseBody.error.message
  }

  if (
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'message' in responseBody &&
    typeof responseBody.message === 'string'
  ) {
    return responseBody.message
  }

  return null
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

async function parseResendError(response: Response) {
  let responseBody: ResendErrorResponse | null = null

  try {
    responseBody = (await response.json()) as ResendErrorResponse
  } catch {
    responseBody = null
  }

  return getResendErrorMessage(responseBody) ?? 'Failed to send the email.'
}

export async function sendAdminResendEmailToRecipient(input: {
  apiKey?: string
  from?: string
  recipientEmail: string
  subject: string
  body: string
  attachments?: ResendAttachment[]
}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  const apiKey = input.apiKey ?? getRequiredServerEnv('RESEND_API_KEY')
  const fromAddress = input.from ?? getRequiredServerEnv('MEMBERSHIP_EXPIRY_EMAIL_FROM')
  let response: Response

  try {
    response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [input.recipientEmail],
        subject: input.subject,
        html: input.body,
        text: stripHtmlToText(input.body),
        attachments: input.attachments,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('Timed out while sending the email.')
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    throw new Error(await parseResendError(response))
  }

  let responseBody: ResendSuccessResponse | null = null

  try {
    responseBody = (await response.json()) as ResendSuccessResponse
  } catch {
    responseBody = null
  }

  return typeof responseBody?.id === 'string' ? responseBody.id : null
}

export function createSupabaseAdminEmailDeliveryStore(supabase: any) {
  return {
    async countSentDeliveriesForDate(input: { senderProfileId: string; sendDate: string }) {
      const { data, error } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .select('id')
        .eq('sender_profile_id', input.senderProfileId)
        .eq('send_date', input.sendDate)
        .eq('status', 'sent')

      if (error) {
        throw new Error(`Failed to read admin email delivery counts: ${error.message}`)
      }

      return Array.isArray(data) ? data.length : 0
    },
    async readSentRecipientEmails(input: { senderProfileId: string; idempotencyKey: string }) {
      const { data, error } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .select('recipient_email')
        .eq('sender_profile_id', input.senderProfileId)
        .eq('idempotency_key', input.idempotencyKey)
        .eq('status', 'sent')

      if (error) {
        throw new Error(`Failed to read admin email delivery log: ${error.message}`)
      }

      return ((data ?? []) as Array<{ recipient_email: string | null }>).flatMap((row) =>
        typeof row.recipient_email === 'string' && row.recipient_email.trim()
          ? [row.recipient_email.trim().toLowerCase()]
          : [],
      )
    },
    async reserveDelivery(input: {
      senderProfileId: string
      sendDate: string
      idempotencyKey: string
      recipientEmail: string
    }) {
      const { data, error } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .upsert(
          {
            sender_profile_id: input.senderProfileId,
            send_date: input.sendDate,
            idempotency_key: input.idempotencyKey,
            recipient_email: input.recipientEmail,
            status: 'pending',
          } satisfies AdminEmailDeliveryRow,
          {
            onConflict: 'idempotency_key,recipient_email',
            ignoreDuplicates: true,
          },
        )
        .select('id')
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to reserve admin email delivery: ${error.message}`)
      }

      return Boolean(data)
    },
    async markDeliverySent(input: {
      senderProfileId: string
      idempotencyKey: string
      recipientEmail: string
      providerMessageId: string | null
      sentAt: string
    }) {
      const { data, error } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .update({
          provider_message_id: input.providerMessageId,
          sent_at: input.sentAt,
          status: 'sent',
        })
        .eq('sender_profile_id', input.senderProfileId)
        .eq('idempotency_key', input.idempotencyKey)
        .eq('recipient_email', input.recipientEmail)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to mark admin email delivery as sent: ${error.message}`)
      }

      if (!data) {
        throw new Error('Failed to mark admin email delivery as sent: reservation not found.')
      }
    },
    async releasePendingDelivery(input: {
      senderProfileId: string
      idempotencyKey: string
      recipientEmail: string
    }) {
      const { error } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .delete()
        .eq('sender_profile_id', input.senderProfileId)
        .eq('idempotency_key', input.idempotencyKey)
        .eq('recipient_email', input.recipientEmail)
        .eq('status', 'pending')

      if (error) {
        throw new Error(`Failed to release admin email delivery reservation: ${error.message}`)
      }
    },
  }
}
