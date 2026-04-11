import { Buffer } from 'node:buffer'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ADMIN_EMAIL_ATTACHMENT_MAX_BYTES,
  dedupeRecipientsByEmail,
  emailRecipientSchema,
  hasMeaningfulHtmlContent,
  stripHtmlToText,
} from '@/lib/admin-email'
import { getRequiredServerEnv } from '@/lib/server-env'
import { requireAdminUser } from '@/lib/server-auth'

const RESEND_SEND_BATCH_SIZE = 10
const RESEND_API_URL = 'https://api.resend.com/emails'

const sendEmailFormSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required.'),
  body: z.string().trim().min(1, 'Body is required.'),
  recipients: z.string().trim().min(1, 'At least one recipient is required.'),
})

export const runtime = 'nodejs'
export const maxDuration = 60

type ResendAttachment = {
  filename: string
  content: string
  content_type?: string
}

type ResendErrorResponse = {
  error?: {
    message?: string
  }
  message?: string
}

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

function getResendDailyEmailLimit() {
  const configuredLimit = parseInt(process.env.RESEND_DAILY_EMAIL_LIMIT ?? '100', 10)

  if (!Number.isFinite(configuredLimit) || configuredLimit <= 0) {
    return 100
  }

  return configuredLimit
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

async function parseResendError(response: Response) {
  let responseBody: ResendErrorResponse | null = null

  try {
    responseBody = (await response.json()) as ResendErrorResponse
  } catch {
    responseBody = null
  }

  return getResendErrorMessage(responseBody) ?? 'Failed to send the email.'
}

async function sendResendEmailToRecipient(input: {
  apiKey: string
  from: string
  recipientEmail: string
  subject: string
  body: string
  attachments?: ResendAttachment[]
}) {
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.recipientEmail],
      subject: input.subject,
      html: input.body,
      text: stripHtmlToText(input.body),
      attachments: input.attachments,
    }),
  })

  if (!response.ok) {
    throw new Error(await parseResendError(response))
  }
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
    const recipients = dedupeRecipientsByEmail(parsedRecipients).slice(0, getResendDailyEmailLimit())

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

    const apiKey = getRequiredServerEnv('RESEND_API_KEY')
    const fromAddress = getRequiredServerEnv('MEMBERSHIP_EXPIRY_EMAIL_FROM')
    const attachments = await buildAttachment(attachmentValue instanceof File ? attachmentValue : null)
    let sentCount = 0
    let failedCount = 0
    let lastErrorMessage = 'Failed to send the email.'

    for (let startIndex = 0; startIndex < recipients.length; startIndex += RESEND_SEND_BATCH_SIZE) {
      const batch = recipients.slice(startIndex, startIndex + RESEND_SEND_BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async (recipient) => {
          try {
            await sendResendEmailToRecipient({
              apiKey,
              from: fromAddress,
              recipientEmail: recipient.email,
              subject: parsedForm.subject,
              body: parsedForm.body,
              attachments,
            })

            return { ok: true as const }
          } catch (error) {
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
      )
    }

    return NextResponse.json({
      ok: true,
      sentCount,
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
