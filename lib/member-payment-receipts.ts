import { z } from 'zod'
import { apiFetch } from '@/lib/api-fetch'
import {
  GYM_ADDRESS,
  GYM_CONTACT,
  GYM_NAME,
} from '@/lib/business-constants'
import { getMemberPaymentTypeLabel } from '@/lib/member-payments'
import {
  formatJmdCurrency,
  JAMAICA_OFFSET,
  JAMAICA_TIME_ZONE,
} from '@/lib/pt-scheduling'
import { paymentMethodSchema } from '@/lib/validation-schemas'
import type {
  MemberPaymentMethod,
  MemberPaymentType,
} from '@/types'

const memberPaymentReceiptSchema = z.object({
  paymentId: z.string().trim().min(1),
  gymName: z.string().trim().min(1),
  gymAddress: z.string().trim().min(1),
  gymContact: z.string().trim().min(1),
  receiptNumber: z.string().trim().min(1).nullable(),
  receiptSentAt: z.string().trim().nullable(),
  memberName: z.string().trim().min(1),
  recipientEmail: z.string().trim().nullable(),
  paymentDate: z.string().trim().min(1),
  membershipBeginTime: z.string().trim().nullable(),
  membershipEndTime: z.string().trim().nullable(),
  paymentType: z.enum(['membership', 'card_fee']),
  paymentLabel: z.string().trim().min(1),
  amountPaid: z.number().finite(),
  paymentMethod: paymentMethodSchema,
  recordedByName: z.string().trim().nullable(),
  notes: z.string().trim().nullable(),
})

const memberPaymentReceiptPreviewResponseSchema = z.object({
  ok: z.literal(true),
  receipt: memberPaymentReceiptSchema,
  canSend: z.boolean(),
  disabledReason: z.string().trim().nullable(),
  receiptSentAt: z.string().trim().nullable(),
})

const sendMemberPaymentReceiptResponseSchema = z.object({
  ok: z.literal(true),
  alreadySent: z.boolean().optional(),
  receiptSentAt: z.string().trim().nullable(),
})

export type MemberPaymentReceipt = z.infer<typeof memberPaymentReceiptSchema>
export type MemberPaymentReceiptPreviewResponse = z.infer<
  typeof memberPaymentReceiptPreviewResponseSchema
>
export type SendMemberPaymentReceiptResponse = z.infer<
  typeof sendMemberPaymentReceiptResponseSchema
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

function formatDateInJamaica(value: string) {
  const date = new Date(`${value}T00:00:00${JAMAICA_OFFSET}`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-JM', {
    timeZone: JAMAICA_TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function formatTimestampInJamaica(value: string | null) {
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

export function formatMemberPaymentMethodLabel(paymentMethod: MemberPaymentMethod) {
  switch (paymentMethod) {
    case 'cash':
      return 'Cash'
    case 'fygaro':
      return 'Fygaro'
    case 'bank_transfer':
      return 'Bank Transfer'
    case 'point_of_sale':
      return 'Point of Sale'
    default:
      return paymentMethod
  }
}

export function buildMemberPaymentReceipt(input: {
  paymentId: string
  receiptNumber: string | null
  receiptSentAt: string | null
  memberName: string
  recipientEmail: string | null
  paymentDate: string
  membershipBeginTime: string | null
  membershipEndTime: string | null
  paymentType: MemberPaymentType
  memberTypeName: string | null
  amountPaid: number
  paymentMethod: MemberPaymentMethod
  recordedByName: string | null
  notes: string | null
}): MemberPaymentReceipt {
  return {
    paymentId: input.paymentId,
    gymName: GYM_NAME,
    gymAddress: GYM_ADDRESS,
    gymContact: GYM_CONTACT,
    receiptNumber: input.receiptNumber,
    receiptSentAt: normalizeText(input.receiptSentAt) || null,
    memberName: normalizeText(input.memberName) || 'Unknown member',
    recipientEmail: normalizeText(input.recipientEmail) || null,
    paymentDate: input.paymentDate,
    membershipBeginTime: input.membershipBeginTime,
    membershipEndTime: input.membershipEndTime,
    paymentType: input.paymentType,
    paymentLabel: getMemberPaymentTypeLabel(input.paymentType, input.memberTypeName),
    amountPaid: input.amountPaid,
    paymentMethod: input.paymentMethod,
    recordedByName: normalizeText(input.recordedByName) || null,
    notes: normalizeText(input.notes) || null,
  }
}

export function buildMemberPaymentReceiptEmailBody(receipt: MemberPaymentReceipt) {
  const membershipDatesMarkup =
    receipt.paymentType === 'membership'
      ? `
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Membership Start</td>
            <td style="padding:8px 0;">${escapeHtml(formatTimestampInJamaica(receipt.membershipBeginTime))}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Membership End</td>
            <td style="padding:8px 0;">${escapeHtml(formatTimestampInJamaica(receipt.membershipEndTime))}</td>
          </tr>
        `
      : ''
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

      <h2 style="margin:0 0 16px;font-size:20px;">Payment Receipt</h2>

      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Receipt Number</td>
            <td style="padding:8px 0;">${escapeHtml(receipt.receiptNumber ?? 'Not available')}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Member Name</td>
            <td style="padding:8px 0;">${escapeHtml(receipt.memberName)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Payment Date</td>
            <td style="padding:8px 0;">${escapeHtml(formatDateInJamaica(receipt.paymentDate))}</td>
          </tr>
          ${membershipDatesMarkup}
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Payment Type</td>
            <td style="padding:8px 0;">${escapeHtml(receipt.paymentLabel)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Amount Paid</td>
            <td style="padding:8px 0;">${escapeHtml(formatJmdCurrency(receipt.amountPaid))}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Payment Method</td>
            <td style="padding:8px 0;">${escapeHtml(formatMemberPaymentMethodLabel(receipt.paymentMethod))}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;vertical-align:top;">Recorded By</td>
            <td style="padding:8px 0;">${escapeHtml(receipt.recordedByName ?? 'Unknown')}</td>
          </tr>
          ${notesMarkup}
        </tbody>
      </table>

      <p style="margin:24px 0 0;">Thank you for training with ${escapeHtml(receipt.gymName)}.</p>
    </div>
  `
}

export async function fetchMemberPaymentReceiptPreview(
  memberId: string,
  paymentId: string,
): Promise<MemberPaymentReceiptPreviewResponse> {
  return apiFetch(
    `/api/members/${encodeURIComponent(memberId)}/payments/${encodeURIComponent(paymentId)}/receipt`,
    {
      method: 'GET',
      cache: 'no-store',
    },
    memberPaymentReceiptPreviewResponseSchema,
    'Failed to load the payment receipt preview.',
  )
}

export async function sendMemberPaymentReceipt(
  memberId: string,
  paymentId: string,
): Promise<SendMemberPaymentReceiptResponse> {
  return apiFetch(
    `/api/members/${encodeURIComponent(memberId)}/payments/${encodeURIComponent(paymentId)}/receipt`,
    {
      method: 'POST',
    },
    sendMemberPaymentReceiptResponseSchema,
    'Failed to send the payment receipt.',
  )
}

export function formatReceiptDateValue(value: string) {
  return formatDateInJamaica(value)
}

export function formatReceiptTimestampValue(value: string | null) {
  return formatTimestampInJamaica(value)
}
