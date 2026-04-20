import { NextResponse } from 'next/server'
import {
  buildClassRegistrationReceiptEmailBody,
  buildClassRegistrationReceipt,
} from '@/lib/class-registration-receipts'
import {
  AdminEmailQuotaError,
  createSupabaseAdminEmailDeliveryStore,
  isDefinitiveAdminEmailSendError,
  sendAdminResendEmailToRecipient,
} from '@/lib/admin-email-server'
import { GYM_NAME } from '@/lib/business-constants'
import { getJamaicaDateInputValue } from '@/lib/member-access-time'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { ClassRegistrationFeeType } from '@/types'

const CLASS_REGISTRATION_RECEIPT_SELECT = [
  'id',
  'class_id',
  'member_id',
  'guest_profile_id',
  'fee_type',
  'amount_paid',
  'payment_recorded_at',
  'notes',
  'receipt_number',
  'receipt_sent_at',
  'class:classes!class_registrations_class_id_fkey(id, name)',
  'member:members!class_registrations_member_id_fkey(id, name, email)',
  'guest:guest_profiles!class_registrations_guest_profile_id_fkey(id, name, email)',
].join(', ')

type ClassRegistrationReceiptRow = {
  id: string
  class_id: string
  member_id: string | null
  guest_profile_id: string | null
  fee_type: ClassRegistrationFeeType | null
  amount_paid: number | string
  payment_recorded_at: string | null
  notes: string | null
  receipt_number: string | null
  receipt_sent_at: string | null
  class?: {
    id: string
    name: string | null
  } | null
  member?: {
    id: string
    name: string | null
    email: string | null
  } | null
  guest?: {
    id: string
    name: string | null
    email: string | null
  } | null
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

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeAmount(value: number | string) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const parsedAmount = Number(value)
  return Number.isFinite(parsedAmount) ? parsedAmount : 0
}

async function readRegistrationReceipt(
  supabase: any,
  registrationId: string,
) {
  const { data, error } = await supabase
    .from('class_registrations')
    .select(CLASS_REGISTRATION_RECEIPT_SELECT)
    .eq('id', registrationId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read class registration ${registrationId}: ${error.message}`)
  }

  const row = (data ?? null) as ClassRegistrationReceiptRow | null

  if (!row) {
    return null
  }

  const registrant = row.member ?? row.guest ?? null

  return buildClassRegistrationReceipt({
    registrationId: row.id,
    receiptNumber: normalizeText(row.receipt_number) || null,
    receiptSentAt: normalizeText(row.receipt_sent_at) || null,
    registrantName: normalizeText(registrant?.name) || 'Unknown registrant',
    recipientEmail: normalizeText(registrant?.email) || null,
    className: normalizeText(row.class?.name) || 'Unknown class',
    feeType: row.fee_type,
    amountPaid: normalizeAmount(row.amount_paid),
    paymentDate: normalizeText(row.payment_recorded_at) || null,
    notes: normalizeText(row.notes) || null,
  })
}

async function syncReceiptSentAt(
  supabase: any,
  registrationId: string,
  receiptSentAt: string,
) {
  const { error } = await supabase
    .from('class_registrations')
    .update({
      receipt_sent_at: receiptSentAt,
    })
    .eq('id', registrationId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(
      `Failed to update receipt delivery status for class registration ${registrationId}: ${error.message}`,
    )
  }
}

function getReceiptDisabledReason(input: {
  receiptNumber: string | null
  amountPaid: number
  recipientEmail: string | null
  receiptSentAt: string | null
}) {
  if (!input.receiptNumber) {
    return 'Receipts are unavailable for registrations recorded before receipt tracking was added.'
  }

  if (input.amountPaid <= 0) {
    return 'Only paid registrations can send a receipt.'
  }

  if (!input.recipientEmail) {
    return 'Add an email address to the registrant profile before sending a receipt.'
  }

  if (input.receiptSentAt) {
    return 'This receipt has already been sent.'
  }

  return null
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { registrationId } = await params
    const supabase = getSupabaseAdminClient() as any
    const receipt = await readRegistrationReceipt(supabase, registrationId)

    if (!receipt) {
      return createErrorResponse('Class registration not found.', 404)
    }

    const deliveryStore = createSupabaseAdminEmailDeliveryStore(supabase)
    const existingDelivery = await deliveryStore.readReceiptDelivery({
      classRegistrationId: registrationId,
    })
    const knownReceiptSentAt =
      normalizeText(existingDelivery?.sentAt) || normalizeText(receipt.receiptSentAt) || null

    if (knownReceiptSentAt) {
      if (!receipt.receiptSentAt) {
        await syncReceiptSentAt(supabase, registrationId, knownReceiptSentAt)
      }

      return NextResponse.json({
        ok: true,
        alreadySent: true,
        receiptSentAt: knownReceiptSentAt,
      })
    }

    const disabledReason = getReceiptDisabledReason({
      receiptNumber: receipt.receiptNumber,
      amountPaid: receipt.amountPaid,
      recipientEmail: receipt.recipientEmail,
      receiptSentAt: null,
    })

    if (disabledReason) {
      return createErrorResponse(disabledReason, 400)
    }

    const sendDate = getJamaicaDateInputValue(new Date())
    const shouldReserveQuota = !existingDelivery || existingDelivery.isStale === true

    if (shouldReserveQuota) {
      const availableQuotaCount = await deliveryStore.reserveDailyQuota({
        senderProfileId: authResult.profile.id,
        sendDate,
        requestedCount: 1,
      })

      if (availableQuotaCount < 1) {
        throw new AdminEmailQuotaError('Daily email limit reached for today.')
      }
    }

    const reservationState = await deliveryStore.reserveReceiptDelivery({
      senderProfileId: authResult.profile.id,
      sendDate,
      classRegistrationId: registrationId,
      recipientEmail: receipt.recipientEmail!,
      idempotencyKey: registrationId,
    })

    if (reservationState === 'sent' || reservationState === 'pending') {
      const sentAt =
        normalizeText(
          (
            await deliveryStore.readReceiptDelivery({
              classRegistrationId: registrationId,
            })
          )?.sentAt,
        ) || null

      if (reservationState === 'sent' && sentAt && !receipt.receiptSentAt) {
        await syncReceiptSentAt(supabase, registrationId, sentAt)
      }

      return NextResponse.json({
        ok: true,
        alreadySent: true,
        receiptSentAt: sentAt,
      })
    }

    let providerMessageId: string | null = null
    let sendAccepted = false
    const sentAt = new Date().toISOString()

    try {
      providerMessageId = await sendAdminResendEmailToRecipient({
        recipientEmail: receipt.recipientEmail!,
        draftIdempotencyKey: registrationId,
        subject: `${GYM_NAME} receipt ${receipt.receiptNumber}`,
        body: buildClassRegistrationReceiptEmailBody(receipt),
      })
      sendAccepted = true
      await deliveryStore.markReceiptDeliverySent({
        classRegistrationId: registrationId,
        providerMessageId,
        sentAt,
      })
      await syncReceiptSentAt(supabase, registrationId, sentAt)
    } catch (error) {
      if (sendAccepted || providerMessageId !== null) {
        await deliveryStore.markReceiptDeliverySent({
          classRegistrationId: registrationId,
          providerMessageId,
          sentAt,
        })
        await syncReceiptSentAt(supabase, registrationId, sentAt)
      } else if (isDefinitiveAdminEmailSendError(error)) {
        await deliveryStore.releasePendingReceiptDelivery({
          classRegistrationId: registrationId,
        })
      }

      if (!(sendAccepted || providerMessageId !== null)) {
        throw error
      }
    }

    return NextResponse.json({
      ok: true,
      alreadySent: false,
      receiptSentAt: sentAt,
    })
  } catch (error) {
    const status =
      error instanceof AdminEmailQuotaError
        ? 429
        : isDefinitiveAdminEmailSendError(error)
          ? 502
          : 500

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while sending the class registration receipt.',
      status,
    )
  }
}
