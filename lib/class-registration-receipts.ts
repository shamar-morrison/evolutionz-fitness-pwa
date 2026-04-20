import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import {
  GYM_ADDRESS,
  GYM_CONTACT,
  GYM_NAME,
} from '@/lib/business-constants'
import {
  formatClassRegistrationFeeTypeLabel,
  formatOptionalJmd,
} from '@/lib/classes'
import {
  JAMAICA_TIME_ZONE,
} from '@/lib/pt-scheduling'
import type { ClassRegistrationFeeType } from '@/types'

const classRegistrationReceiptSchema = z.object({
  registrationId: z.string().trim().min(1),
  gymName: z.string().trim().min(1),
  gymAddress: z.string().trim().min(1),
  gymContact: z.string().trim().min(1),
  receiptNumber: z.string().trim().min(1).nullable(),
  receiptSentAt: z.string().trim().nullable(),
  registrantName: z.string().trim().min(1),
  recipientEmail: z.string().trim().nullable(),
  className: z.string().trim().min(1),
  feeType: z.enum(['monthly', 'per_session', 'custom']).nullable(),
  feeTypeLabel: z.string().trim().min(1),
  amountPaid: z.number().finite(),
  paymentDate: z.string().trim().nullable(),
  notes: z.string().trim().nullable(),
})

const classRegistrationReceiptPreviewResponseSchema = z.object({
  ok: z.literal(true),
  receipt: classRegistrationReceiptSchema,
  canSend: z.boolean(),
  disabledReason: z.string().trim().nullable(),
  receiptSentAt: z.string().trim().nullable(),
})

const sendClassRegistrationReceiptResponseSchema = z.object({
  ok: z.literal(true),
  alreadySent: z.boolean().optional(),
  receiptSentAt: z.string().trim().nullable(),
})

export type ClassRegistrationReceipt = z.infer<typeof classRegistrationReceiptSchema>
export type ClassRegistrationReceiptPreviewResponse = z.infer<
  typeof classRegistrationReceiptPreviewResponseSchema
>
export type SendClassRegistrationReceiptResponse = z.infer<
  typeof sendClassRegistrationReceiptResponseSchema
>

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function escapeHtml(value: string | null | undefined) {
  return normalizeText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatDateValue(value: string | null) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return 'N/A'
  }

  const timestamp = new Date(normalizedValue)

  if (Number.isNaN(timestamp.getTime())) {
    return normalizedValue
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(timestamp)
}

function formatTimestampValue(value: string | null) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return 'N/A'
  }

  const timestamp = new Date(normalizedValue)

  if (Number.isNaN(timestamp.getTime())) {
    return normalizedValue
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp)
}

export function buildClassRegistrationReceipt(input: {
  registrationId: string
  receiptNumber: string | null
  receiptSentAt: string | null
  registrantName: string
  recipientEmail: string | null
  className: string
  feeType: ClassRegistrationFeeType | null
  amountPaid: number
  paymentDate: string | null
  notes: string | null
}): ClassRegistrationReceipt {
  return {
    registrationId: input.registrationId,
    gymName: GYM_NAME,
    gymAddress: GYM_ADDRESS,
    gymContact: GYM_CONTACT,
    receiptNumber: normalizeText(input.receiptNumber) || null,
    receiptSentAt: normalizeText(input.receiptSentAt) || null,
    registrantName: normalizeText(input.registrantName) || 'Unknown registrant',
    recipientEmail: normalizeText(input.recipientEmail) || null,
    className: normalizeText(input.className) || 'Unknown class',
    feeType: input.feeType,
    feeTypeLabel: formatClassRegistrationFeeTypeLabel(input.feeType),
    amountPaid: input.amountPaid,
    paymentDate: normalizeText(input.paymentDate) || null,
    notes: normalizeText(input.notes) || null,
  }
}

export function buildClassRegistrationReceiptEmailBody(receipt: ClassRegistrationReceipt) {
  const notesMarkup = receipt.notes
    ? `
      <tr>
        <td style="padding:8px 0;font-weight:600;vertical-align:top;">Notes</td>
        <td style="padding:8px 0;">${escapeHtml(receipt.notes)}</td>
      </tr>
    `
    : ''

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h1 style="margin:0 0 12px;font-size:24px;">${escapeHtml(receipt.gymName)}</h1>
      <p style="margin:0 0 4px;">${escapeHtml(receipt.gymAddress)}</p>
      <p style="margin:0 0 24px;">${escapeHtml(receipt.gymContact)}</p>

      <h2 style="margin:0 0 16px;font-size:20px;">Class Registration Receipt</h2>

      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Receipt Number</td>
            <td style="padding:8px 0;">${escapeHtml(receipt.receiptNumber ?? 'Not available')}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Registrant</td>
            <td style="padding:8px 0;">${escapeHtml(receipt.registrantName)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Class</td>
            <td style="padding:8px 0;">${escapeHtml(receipt.className)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Fee Type</td>
            <td style="padding:8px 0;">${escapeHtml(receipt.feeTypeLabel)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Amount Paid</td>
            <td style="padding:8px 0;">${escapeHtml(formatOptionalJmd(receipt.amountPaid))}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Payment Date</td>
            <td style="padding:8px 0;">${escapeHtml(formatDateValue(receipt.paymentDate))}</td>
          </tr>
          ${notesMarkup}
        </tbody>
      </table>

      <p style="margin:24px 0 0;">Thank you for training with ${escapeHtml(receipt.gymName)}.</p>
    </div>
  `
}

export async function fetchClassRegistrationReceiptPreview(
  registrationId: string,
): Promise<ClassRegistrationReceiptPreviewResponse> {
  return apiFetch(
    `/api/classes/registrations/${encodeURIComponent(registrationId)}/receipt`,
    {
      method: 'GET',
      cache: 'no-store',
    },
    classRegistrationReceiptPreviewResponseSchema,
    'Failed to load the class registration receipt preview.',
  )
}

export async function sendClassRegistrationReceipt(
  registrationId: string,
): Promise<SendClassRegistrationReceiptResponse> {
  return apiFetch(
    `/api/classes/registrations/${encodeURIComponent(registrationId)}/receipt/send`,
    {
      method: 'POST',
    },
    sendClassRegistrationReceiptResponseSchema,
    'Failed to send the class registration receipt.',
  )
}

export function formatClassRegistrationReceiptDateValue(value: string | null) {
  return formatDateValue(value)
}

export function formatClassRegistrationReceiptTimestampValue(value: string | null) {
  return formatTimestampValue(value)
}
