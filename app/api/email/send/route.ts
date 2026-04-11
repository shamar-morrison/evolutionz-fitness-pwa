import { Buffer } from 'node:buffer'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ADMIN_EMAIL_ATTACHMENT_MAX_BYTES,
  dedupeRecipientsByEmail,
  emailRecipientSchema,
  getResendDailyEmailLimit,
  hasMeaningfulHtmlContent,
} from '@/lib/admin-email'
import {
  createSupabaseAdminEmailDeliveryStore,
  sendAdminResendEmailToRecipient,
} from '@/lib/admin-email-server'
import { getJamaicaDateInputValue } from '@/lib/member-access-time'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const RESEND_SEND_BATCH_SIZE = 10

const sendEmailFormSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required.'),
  body: z.string().trim().min(1, 'Body is required.'),
  recipients: z.string().trim().min(1, 'At least one recipient is required.'),
  idempotencyKey: z.string().trim().uuid('Idempotency key must be a valid UUID.'),
})

export const runtime = 'nodejs'
export const maxDuration = 60

type ResendAttachment = {
  filename: string
  content: string
  content_type?: string
}

type SendResponseCounts = {
  sentCount?: number
  alreadySentCount?: number
  skippedDueToQuotaCount?: number
}

function createErrorResponse(error: string, status: number, counts: SendResponseCounts = {}) {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...counts,
    },
    { status },
  )
}

async function buildAttachment(file: File | null) {
  if (!file || file.size === 0) {
    return undefined
  }

  const encodedContent = Buffer.from(await file.arrayBuffer()).toString('base64')
  const attachment = {
    filename: file.name || 'attachment',
    content: encodedContent,
  } satisfies ResendAttachment

  if (!file.type) {
    return [attachment]
  }

  return [
    {
      ...attachment,
      content_type: file.type,
    },
  ]
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const formData = await request.formData()
    const parsedForm = sendEmailFormSchema.parse({
      subject: formData.get('subject'),
      body: formData.get('body'),
      recipients: formData.get('recipients'),
      idempotencyKey: formData.get('idempotencyKey'),
    })

    if (!hasMeaningfulHtmlContent(parsedForm.body)) {
      return createErrorResponse('Body is required.', 400)
    }

    let rawRecipients: unknown

    try {
      rawRecipients = JSON.parse(parsedForm.recipients)
    } catch {
      return createErrorResponse('Recipients must be a valid JSON array.', 400)
    }

    const parsedRecipients = z.array(emailRecipientSchema).min(1).parse(rawRecipients)
    const recipients = dedupeRecipientsByEmail(parsedRecipients)

    if (recipients.length === 0) {
      return createErrorResponse('At least one recipient is required.', 400)
    }

    const attachmentValue = formData.get('attachment')

    if (attachmentValue !== null && !(attachmentValue instanceof File)) {
      return createErrorResponse('Attachment must be a file.', 400)
    }

    if (attachmentValue instanceof File && attachmentValue.size > ADMIN_EMAIL_ATTACHMENT_MAX_BYTES) {
      return createErrorResponse('Attachment must be 15MB or under.', 400)
    }

    const attachments = await buildAttachment(attachmentValue instanceof File ? attachmentValue : null)
    const sendDate = getJamaicaDateInputValue(new Date())
    const senderProfileId = authResult.profile.id
    const deliveryStore = createSupabaseAdminEmailDeliveryStore(getSupabaseAdminClient())
    const alreadySentRecipients = new Set(
      await deliveryStore.readSentRecipientEmails({
        senderProfileId,
        idempotencyKey: parsedForm.idempotencyKey,
      }),
    )
    const pendingRecipients = recipients.filter(
      (recipient) => !alreadySentRecipients.has(recipient.email),
    )
    const sentTodayCount = await deliveryStore.countSentDeliveriesForDate({
      senderProfileId,
      sendDate,
    })
    const remainingQuota = Math.max(0, getResendDailyEmailLimit() - sentTodayCount)
    const recipientsToAttempt = pendingRecipients.slice(0, remainingQuota)
    const skippedDueToQuotaCount = Math.max(0, pendingRecipients.length - recipientsToAttempt.length)
    let sentCount = 0
    let alreadySentCount = alreadySentRecipients.size
    let failedCount = 0
    let lastErrorMessage = 'Failed to send the email.'

    for (
      let startIndex = 0;
      startIndex < recipientsToAttempt.length;
      startIndex += RESEND_SEND_BATCH_SIZE
    ) {
      const batch = recipientsToAttempt.slice(startIndex, startIndex + RESEND_SEND_BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async (recipient) => {
          const reserved = await deliveryStore.reserveDelivery({
            senderProfileId,
            sendDate,
            idempotencyKey: parsedForm.idempotencyKey,
            recipientEmail: recipient.email,
          })

          if (!reserved) {
            return { ok: true as const, alreadySent: true as const }
          }

          try {
            const providerMessageId = await sendAdminResendEmailToRecipient({
              recipientEmail: recipient.email,
              subject: parsedForm.subject,
              body: parsedForm.body,
              attachments,
            })
            await deliveryStore.markDeliverySent({
              senderProfileId,
              idempotencyKey: parsedForm.idempotencyKey,
              recipientEmail: recipient.email,
              providerMessageId,
              sentAt: new Date().toISOString(),
            })

            return { ok: true as const, alreadySent: false as const }
          } catch (error) {
            await deliveryStore.releasePendingDelivery({
              senderProfileId,
              idempotencyKey: parsedForm.idempotencyKey,
              recipientEmail: recipient.email,
            })

            return {
              ok: false as const,
              error:
                error instanceof Error ? error.message : 'Unexpected error while sending the email.',
            }
          }
        }),
      )

      for (const result of results) {
        if (result.ok) {
          if (result.alreadySent) {
            alreadySentCount += 1
            continue
          }

          sentCount += 1
          continue
        }

        failedCount += 1
        lastErrorMessage = result.error
      }
    }

    if (failedCount > 0) {
      return createErrorResponse(
        `${lastErrorMessage} ${sentCount} email${sentCount === 1 ? '' : 's'} sent, ${failedCount} failed.`,
        502,
        {
          sentCount,
          alreadySentCount,
          skippedDueToQuotaCount,
        },
      )
    }

    return NextResponse.json({
      ok: true,
      sentCount,
      alreadySentCount,
      skippedDueToQuotaCount,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while sending the email.',
      500,
    )
  }
}
