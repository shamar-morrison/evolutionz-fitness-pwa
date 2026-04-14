import { NextResponse } from 'next/server'
import {
  buildMemberPaymentReceipt,
  buildMemberPaymentReceiptEmailBody,
} from '@/lib/member-payment-receipts'
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
import type {
  MemberPaymentMethod,
  MemberPaymentType,
} from '@/types'

const MEMBER_PAYMENT_RECEIPT_SELECT = [
  'id',
  'member_id',
  'member_type_id',
  'payment_type',
  'payment_method',
  'amount_paid',
  'payment_date',
  'notes',
  'receipt_number',
  'receipt_sent_at',
  'membership_begin_time',
  'membership_end_time',
  'member:members!member_payments_member_id_fkey(id, name, email)',
  'memberType:member_types!member_payments_member_type_id_fkey(name)',
  'recordedByProfile:profiles!member_payments_recorded_by_fkey(name)',
].join(', ')

export const runtime = 'nodejs'
export const maxDuration = 60

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type MemberPaymentReceiptRow = {
  id: string
  member_id: string
  member_type_id: string | null
  payment_type: MemberPaymentType
  payment_method: MemberPaymentMethod
  amount_paid: number | string
  payment_date: string
  notes: string | null
  receipt_number: string | null
  receipt_sent_at: string | null
  membership_begin_time: string | null
  membership_end_time: string | null
  member?: {
    id: string
    name: string
    email: string | null
  } | null
  memberType?: {
    name: string | null
  } | null
  recordedByProfile?: {
    name: string | null
  } | null
}

type MemberPaymentReceiptRouteClient = {
  from(table: 'member_payments'): {
    select(columns: string): {
      eq(column: 'id', value: string): {
        eq(column: 'member_id', value: string): {
          maybeSingle(): QueryResult<MemberPaymentReceiptRow>
        }
      }
    }
    update(values: {
      receipt_sent_at: string
    }): {
      eq(column: 'id', value: string): {
        select(columns: 'id'): {
          maybeSingle(): QueryResult<{
            id: string
          }>
        }
      }
    }
  }
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

async function readReceiptPayment(
  supabase: MemberPaymentReceiptRouteClient,
  memberId: string,
  paymentId: string,
) {
  const { data, error } = await supabase
    .from('member_payments')
    .select(MEMBER_PAYMENT_RECEIPT_SELECT)
    .eq('id', paymentId)
    .eq('member_id', memberId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read member payment ${paymentId}: ${error.message}`)
  }

  if (!data) {
    return null
  }

  return buildMemberPaymentReceipt({
    paymentId: data.id,
    receiptNumber: normalizeText(data.receipt_number) || null,
    receiptSentAt: normalizeText(data.receipt_sent_at) || null,
    memberName: normalizeText(data.member?.name) || 'Unknown member',
    recipientEmail: normalizeText(data.member?.email) || null,
    paymentDate: normalizeText(data.payment_date),
    membershipBeginTime: normalizeText(data.membership_begin_time) || null,
    membershipEndTime: normalizeText(data.membership_end_time) || null,
    paymentType: data.payment_type,
    memberTypeName: normalizeText(data.memberType?.name) || null,
    amountPaid: normalizeAmount(data.amount_paid),
    paymentMethod: data.payment_method,
    recordedByName: normalizeText(data.recordedByProfile?.name) || null,
    notes: normalizeText(data.notes) || null,
  })
}

async function syncReceiptSentAt(
  supabase: MemberPaymentReceiptRouteClient,
  paymentId: string,
  receiptSentAt: string,
) {
  const { error } = await supabase
    .from('member_payments')
    .update({
      receipt_sent_at: receiptSentAt,
    })
    .eq('id', paymentId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to update receipt delivery status for ${paymentId}: ${error.message}`)
  }
}

function getReceiptDisabledReason(input: {
  receiptNumber: string | null
  recipientEmail: string | null
  receiptSentAt: string | null
}) {
  if (!input.receiptNumber) {
    return 'Receipts are unavailable for payments recorded before receipt tracking was added.'
  }

  if (!input.recipientEmail) {
    return 'Add an email address to the member profile before sending a receipt.'
  }

  if (input.receiptSentAt) {
    return 'This receipt has already been sent.'
  }

  return null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id, paymentId } = await params
    const supabase = getSupabaseAdminClient() as unknown as MemberPaymentReceiptRouteClient
    const receipt = await readReceiptPayment(supabase, id, paymentId)

    if (!receipt) {
      return createErrorResponse('Member payment not found.', 404)
    }

    const deliveryStore = createSupabaseAdminEmailDeliveryStore(supabase)
    const existingDelivery = await deliveryStore.readReceiptDelivery({
      paymentId,
    })
    const receiptSentAt =
      normalizeText(existingDelivery?.sentAt) || normalizeText(receipt.receiptSentAt) || null
    const disabledReason = getReceiptDisabledReason({
      receiptNumber: receipt.receiptNumber,
      recipientEmail: receipt.recipientEmail,
      receiptSentAt,
    })

    return NextResponse.json({
      ok: true,
      receipt,
      canSend: disabledReason === null,
      disabledReason,
      receiptSentAt,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading the payment receipt.',
      500,
    )
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id, paymentId } = await params
    const supabase = getSupabaseAdminClient() as unknown as MemberPaymentReceiptRouteClient
    const receipt = await readReceiptPayment(supabase, id, paymentId)

    if (!receipt) {
      return createErrorResponse('Member payment not found.', 404)
    }

    const deliveryStore = createSupabaseAdminEmailDeliveryStore(supabase)
    const existingDelivery = await deliveryStore.readReceiptDelivery({
      paymentId,
    })
    const knownReceiptSentAt =
      normalizeText(existingDelivery?.sentAt) || normalizeText(receipt.receiptSentAt) || null

    if (knownReceiptSentAt) {
      if (!receipt.receiptSentAt) {
        await syncReceiptSentAt(supabase, paymentId, knownReceiptSentAt)
      }

      return NextResponse.json({
        ok: true,
        alreadySent: true,
        receiptSentAt: knownReceiptSentAt,
      })
    }

    const disabledReason = getReceiptDisabledReason({
      receiptNumber: receipt.receiptNumber,
      recipientEmail: receipt.recipientEmail,
      receiptSentAt: null,
    })

    if (disabledReason) {
      return createErrorResponse(disabledReason, 400)
    }

    const sendDate = getJamaicaDateInputValue(new Date())
    const shouldReserveQuota =
      !existingDelivery || existingDelivery.isStale === true

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
      paymentId,
      recipientEmail: receipt.recipientEmail!,
      idempotencyKey: paymentId,
    })

    if (reservationState === 'sent' || reservationState === 'pending') {
      const sentAt =
        normalizeText((await deliveryStore.readReceiptDelivery({ paymentId }))?.sentAt) || null

      if (reservationState === 'sent' && sentAt && !receipt.receiptSentAt) {
        await syncReceiptSentAt(supabase, paymentId, sentAt)
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
        draftIdempotencyKey: paymentId,
        subject: `${GYM_NAME} receipt ${receipt.receiptNumber}`,
        body: buildMemberPaymentReceiptEmailBody(receipt),
      })
      sendAccepted = true
      await deliveryStore.markReceiptDeliverySent({
        paymentId,
        providerMessageId,
        sentAt,
      })
      await syncReceiptSentAt(supabase, paymentId, sentAt)
    } catch (error) {
      if (sendAccepted || providerMessageId !== null) {
        await deliveryStore.markReceiptDeliverySent({
          paymentId,
          providerMessageId,
          sentAt,
        })
        await syncReceiptSentAt(supabase, paymentId, sentAt)
      } else if (isDefinitiveAdminEmailSendError(error)) {
        await deliveryStore.releasePendingReceiptDelivery({
          paymentId,
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
        : 'Unexpected server error while sending the payment receipt.',
      status,
    )
  }
}
