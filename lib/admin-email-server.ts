import { createHash } from 'node:crypto'
import { getServerResendDailyEmailLimit, stripHtmlToText } from '@/lib/admin-email'
import { getRequiredServerEnv } from '@/lib/server-env'

const ADMIN_EMAIL_DELIVERIES_TABLE = 'admin_email_deliveries'
const RESEND_API_URL = 'https://api.resend.com/emails'
const RESEND_IDEMPOTENCY_KEY_MAX_LENGTH = 256

export const ADMIN_EMAIL_PENDING_DELIVERY_TTL_MS = 15 * 60 * 1000

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
  payment_id?: string | null
  class_registration_id?: string | null
  status: 'pending' | 'sent'
  provider_message_id?: string | null
  sent_at?: string | null
  created_at?: string | null
}

type AdminEmailDeliveryLookupRow = Pick<
  AdminEmailDeliveryRow,
  'id' | 'status' | 'created_at' | 'provider_message_id' | 'sent_at'
>

type AdminEmailSendFailureKind = 'definitive' | 'ambiguous'

export class AdminEmailSendError extends Error {
  readonly failureKind: AdminEmailSendFailureKind
  override readonly cause: unknown

  constructor(message: string, options: { failureKind: AdminEmailSendFailureKind; cause?: unknown }) {
    super(message)
    this.name = 'AdminEmailSendError'
    this.failureKind = options.failureKind
    this.cause = options.cause
  }
}

export class AdminEmailQuotaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminEmailQuotaError'
  }
}

function normalizeRecipientEmail(value: string) {
  return value.trim().toLowerCase()
}

function getReceiptTargetColumn(input: {
  paymentId?: string
  classRegistrationId?: string
}) {
  if (typeof input.paymentId === 'string' && input.paymentId.trim()) {
    return {
      column: 'payment_id',
      value: input.paymentId,
    } as const
  }

  if (
    typeof input.classRegistrationId === 'string' &&
    input.classRegistrationId.trim()
  ) {
    return {
      column: 'class_registration_id',
      value: input.classRegistrationId,
    } as const
  }

  throw new Error('Receipt delivery target is required.')
}

export function createAdminEmailProviderIdempotencyKey(input: {
  draftIdempotencyKey: string
  recipientEmail: string
}) {
  const normalizedRecipientEmail = normalizeRecipientEmail(input.recipientEmail)
  const recipientDigest = createHash('sha256')
    .update(`${input.draftIdempotencyKey}:${normalizedRecipientEmail}`)
    .digest('hex')

  return `admin-email:${input.draftIdempotencyKey}:${recipientDigest}`.slice(
    0,
    RESEND_IDEMPOTENCY_KEY_MAX_LENGTH,
  )
}

export function isDefinitiveAdminEmailSendError(error: unknown) {
  return error instanceof AdminEmailSendError && error.failureKind === 'definitive'
}

function createAdminEmailSendError(
  message: string,
  options: { failureKind: AdminEmailSendFailureKind; cause?: unknown },
) {
  return new AdminEmailSendError(message, options)
}

function isPendingDeliveryStale(
  delivery: Pick<AdminEmailDeliveryLookupRow, 'status' | 'created_at'> | null,
  now = new Date(),
) {
  if (!delivery || delivery.status !== 'pending') {
    return false
  }

  const createdAtMs = Date.parse(delivery.created_at ?? '')

  if (!Number.isFinite(createdAtMs)) {
    return true
  }

  return now.getTime() - createdAtMs >= ADMIN_EMAIL_PENDING_DELIVERY_TTL_MS
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
  draftIdempotencyKey: string
  recipientEmail: string
  subject: string
  body: string
  attachments?: ResendAttachment[]
}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)
  const providerIdempotencyKey = createAdminEmailProviderIdempotencyKey({
    draftIdempotencyKey: input.draftIdempotencyKey,
    recipientEmail: input.recipientEmail,
  })
  let apiKey: string
  let fromAddress: string
  let response: Response

  try {
    apiKey = input.apiKey ?? getRequiredServerEnv('RESEND_API_KEY')
    fromAddress = input.from ?? getRequiredServerEnv('MEMBERSHIP_EXPIRY_EMAIL_FROM')
  } catch (error) {
    throw createAdminEmailSendError(
      error instanceof Error ? error.message : 'Failed to send the email.',
      {
        failureKind: 'definitive',
        cause: error,
      },
    )
  }

  try {
    response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': providerIdempotencyKey,
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
      throw createAdminEmailSendError('Timed out while sending the email.', {
        failureKind: 'ambiguous',
        cause: error,
      })
    }

    throw createAdminEmailSendError(
      error instanceof Error ? error.message : 'Failed to send the email.',
      {
        failureKind: 'ambiguous',
        cause: error,
      },
    )
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    throw createAdminEmailSendError(await parseResendError(response), {
      failureKind: 'definitive',
    })
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
  async function readDelivery(input: {
    senderProfileId: string
    idempotencyKey: string
    recipientEmail: string
  }) {
    const { data, error } = await supabase
      .from(ADMIN_EMAIL_DELIVERIES_TABLE)
      .select('id,status,created_at,provider_message_id,sent_at')
      .eq('sender_profile_id', input.senderProfileId)
      .eq('idempotency_key', input.idempotencyKey)
      .eq('recipient_email', normalizeRecipientEmail(input.recipientEmail))
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to read admin email delivery reservation: ${error.message}`)
    }

    return (data as AdminEmailDeliveryLookupRow | null) ?? null
  }

  async function readReceiptDeliveryRow(input: {
    paymentId?: string
    classRegistrationId?: string
  }) {
    const target = getReceiptTargetColumn(input)
    const { data, error } = await supabase
      .from(ADMIN_EMAIL_DELIVERIES_TABLE)
      .select('id,status,created_at,provider_message_id,sent_at')
      .eq(target.column, target.value)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to read receipt email delivery reservation: ${error.message}`)
    }

    return (data as AdminEmailDeliveryLookupRow | null) ?? null
  }

  async function insertPendingDelivery(input: {
    senderProfileId: string
    sendDate: string
    idempotencyKey: string
    recipientEmail: string
  }) {
    return supabase
      .from(ADMIN_EMAIL_DELIVERIES_TABLE)
      .insert({
        sender_profile_id: input.senderProfileId,
        send_date: input.sendDate,
        idempotency_key: input.idempotencyKey,
        recipient_email: normalizeRecipientEmail(input.recipientEmail),
        status: 'pending',
      } satisfies AdminEmailDeliveryRow)
      .select('id')
      .maybeSingle()
  }

  async function insertPendingReceiptDelivery(input: {
    senderProfileId: string
    sendDate: string
    paymentId?: string
    classRegistrationId?: string
    recipientEmail: string
    idempotencyKey: string
  }) {
    return supabase
      .from(ADMIN_EMAIL_DELIVERIES_TABLE)
      .insert({
        sender_profile_id: input.senderProfileId,
        send_date: input.sendDate,
        idempotency_key: input.idempotencyKey,
        recipient_email: normalizeRecipientEmail(input.recipientEmail),
        payment_id: input.paymentId ?? null,
        class_registration_id: input.classRegistrationId ?? null,
        status: 'pending',
      } satisfies AdminEmailDeliveryRow)
      .select('id')
      .maybeSingle()
  }

  return {
    async reserveDailyQuota(input: {
      senderProfileId: string
      sendDate: string
      requestedCount: number
    }) {
      const { data, error } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .select('status,created_at')
        .eq('sender_profile_id', input.senderProfileId)
        .eq('send_date', input.sendDate)

      if (error) {
        throw new Error(`Failed to read admin email delivery counts: ${error.message}`)
      }

      const usedCount = ((data ?? []) as Array<Pick<AdminEmailDeliveryRow, 'status' | 'created_at'>>)
        .filter((row) => row.status === 'sent' || isPendingDeliveryStale(row) === false).length

      return Math.min(
        input.requestedCount,
        Math.max(0, getServerResendDailyEmailLimit() - usedCount),
      )
    },
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
      const { data, error } = await insertPendingDelivery(input)

      if (!error) {
        return Boolean(data)
      }

      if (error.code !== '23505') {
        throw new Error(`Failed to reserve admin email delivery: ${error.message}`)
      }

      const existingDelivery = await readDelivery({
        senderProfileId: input.senderProfileId,
        idempotencyKey: input.idempotencyKey,
        recipientEmail: input.recipientEmail,
      })

      if (!existingDelivery) {
        const retryInsertResult = await insertPendingDelivery(input)

        if (!retryInsertResult.error) {
          return Boolean(retryInsertResult.data)
        }

        if (retryInsertResult.error.code !== '23505') {
          throw new Error(
            `Failed to reserve admin email delivery: ${retryInsertResult.error.message}`,
          )
        }

        const retryExistingDelivery = await readDelivery({
          senderProfileId: input.senderProfileId,
          idempotencyKey: input.idempotencyKey,
          recipientEmail: input.recipientEmail,
        })

        if (!retryExistingDelivery) {
          throw new Error('Failed to reserve admin email delivery: reservation not found.')
        }

        if (retryExistingDelivery.status === 'pending' && !isPendingDeliveryStale(retryExistingDelivery)) {
          return false
        }

        return retryExistingDelivery.status !== 'sent'
      }

      if (existingDelivery.status === 'sent') {
        return false
      }

      if (!isPendingDeliveryStale(existingDelivery)) {
        return true
      }

      const { error: deleteError } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .delete()
        .eq('id', existingDelivery.id)
        .eq('sender_profile_id', input.senderProfileId)
        .eq('status', 'pending')

      if (deleteError) {
        throw new Error(`Failed to recycle stale admin email delivery: ${deleteError.message}`)
      }

      const retryInsertResult = await insertPendingDelivery(input)

      if (!retryInsertResult.error) {
        return Boolean(retryInsertResult.data)
      }

      if (retryInsertResult.error.code !== '23505') {
        throw new Error(
          `Failed to reserve admin email delivery: ${retryInsertResult.error.message}`,
        )
      }

      const retryExistingDelivery = await readDelivery({
        senderProfileId: input.senderProfileId,
        idempotencyKey: input.idempotencyKey,
        recipientEmail: input.recipientEmail,
      })

      if (!retryExistingDelivery) {
        throw new Error('Failed to reserve admin email delivery: reservation not found.')
      }

      if (retryExistingDelivery.status === 'pending' && !isPendingDeliveryStale(retryExistingDelivery)) {
        return false
      }

      return retryExistingDelivery.status !== 'sent'
    },
    async markDeliverySent(input: {
      senderProfileId: string
      idempotencyKey: string
      recipientEmail: string
      providerMessageId: string | null
      sentAt: string
    }) {
      const normalizedRecipientEmail = input.recipientEmail.trim().toLowerCase()
      const { data, error } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .update({
          provider_message_id: input.providerMessageId,
          sent_at: input.sentAt,
          status: 'sent',
        })
        .eq('sender_profile_id', input.senderProfileId)
        .eq('idempotency_key', input.idempotencyKey)
        .eq('recipient_email', normalizedRecipientEmail)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to mark admin email delivery as sent: ${error.message}`)
      }

      if (!data) {
        const existingDelivery = await readDelivery({
          senderProfileId: input.senderProfileId,
          idempotencyKey: input.idempotencyKey,
          recipientEmail: input.recipientEmail,
        })

        if (existingDelivery?.status === 'sent') {
          return
        }

        throw new Error('Failed to mark admin email delivery as sent: reservation not found.')
      }
    },
    async releasePendingDelivery(input: {
      senderProfileId: string
      idempotencyKey: string
      recipientEmail: string
    }) {
      const normalizedRecipientEmail = input.recipientEmail.trim().toLowerCase()
      const { error } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .delete()
        .eq('sender_profile_id', input.senderProfileId)
        .eq('idempotency_key', input.idempotencyKey)
        .eq('recipient_email', normalizedRecipientEmail)
        .eq('status', 'pending')

      if (error) {
        throw new Error(`Failed to release admin email delivery reservation: ${error.message}`)
      }
    },
    async readReceiptDelivery(input: {
      paymentId?: string
      classRegistrationId?: string
    }) {
      const delivery = await readReceiptDeliveryRow(input)

      if (!delivery) {
        return null
      }

      return {
        status: delivery.status,
        createdAt: delivery.created_at ?? null,
        sentAt: delivery.sent_at ?? null,
        isStale: isPendingDeliveryStale(delivery),
      }
    },
    async reserveReceiptDelivery(input: {
      senderProfileId: string
      sendDate: string
      paymentId?: string
      classRegistrationId?: string
      recipientEmail: string
      idempotencyKey: string
    }) {
      const target = getReceiptTargetColumn(input)
      const { data, error } = await insertPendingReceiptDelivery(input)

      if (!error) {
        return data ? 'reserved' : 'pending'
      }

      if (error.code !== '23505') {
        throw new Error(`Failed to reserve receipt email delivery: ${error.message}`)
      }

      const existingDelivery = await readReceiptDeliveryRow(input)

      if (!existingDelivery) {
        const retryInsertResult = await insertPendingReceiptDelivery(input)

        if (!retryInsertResult.error) {
          return retryInsertResult.data ? 'reserved' : 'pending'
        }

        if (retryInsertResult.error.code !== '23505') {
          throw new Error(
            `Failed to reserve receipt email delivery: ${retryInsertResult.error.message}`,
          )
        }

        const retryExistingDelivery = await readReceiptDeliveryRow(input)

        if (!retryExistingDelivery) {
          throw new Error('Failed to reserve receipt email delivery: reservation not found.')
        }

        if (retryExistingDelivery.status === 'pending' && !isPendingDeliveryStale(retryExistingDelivery)) {
          return 'pending'
        }

        return retryExistingDelivery.status === 'sent' ? 'sent' : 'pending'
      }

      if (existingDelivery.status === 'sent') {
        return 'sent'
      }

      if (!isPendingDeliveryStale(existingDelivery)) {
        return 'pending'
      }

      const { error: deleteError } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .delete()
        .eq('id', existingDelivery.id)
        .eq(target.column, target.value)
        .eq('status', 'pending')

      if (deleteError) {
        throw new Error(`Failed to recycle stale receipt email delivery: ${deleteError.message}`)
      }

      const retryInsertResult = await insertPendingReceiptDelivery(input)

      if (!retryInsertResult.error) {
        return retryInsertResult.data ? 'reserved' : 'pending'
      }

      if (retryInsertResult.error.code !== '23505') {
        throw new Error(
          `Failed to reserve receipt email delivery: ${retryInsertResult.error.message}`,
        )
      }

      const retryExistingDelivery = await readReceiptDeliveryRow(input)

      if (!retryExistingDelivery) {
        throw new Error('Failed to reserve receipt email delivery: reservation not found.')
      }

      if (retryExistingDelivery.status === 'pending' && !isPendingDeliveryStale(retryExistingDelivery)) {
        return 'pending'
      }

      return retryExistingDelivery.status === 'sent' ? 'sent' : 'pending'
    },
    async markReceiptDeliverySent(input: {
      paymentId?: string
      classRegistrationId?: string
      providerMessageId: string | null
      sentAt: string
    }) {
      const target = getReceiptTargetColumn(input)
      const { data, error } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .update({
          provider_message_id: input.providerMessageId,
          sent_at: input.sentAt,
          status: 'sent',
        })
        .eq(target.column, target.value)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to mark receipt email delivery as sent: ${error.message}`)
      }

      if (!data) {
        const existingDelivery = await readReceiptDeliveryRow(input)

        if (existingDelivery?.status === 'sent') {
          return
        }

        throw new Error('Failed to mark receipt email delivery as sent: reservation not found.')
      }
    },
    async releasePendingReceiptDelivery(input: {
      paymentId?: string
      classRegistrationId?: string
    }) {
      const target = getReceiptTargetColumn(input)
      const { error } = await supabase
        .from(ADMIN_EMAIL_DELIVERIES_TABLE)
        .delete()
        .eq(target.column, target.value)
        .eq('status', 'pending')

      if (error) {
        throw new Error(`Failed to release receipt email delivery reservation: ${error.message}`)
      }
    },
  }
}
