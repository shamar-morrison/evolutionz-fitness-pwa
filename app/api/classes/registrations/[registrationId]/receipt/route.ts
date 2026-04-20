import { NextResponse } from 'next/server'
import {
  buildClassRegistrationReceipt,
} from '@/lib/class-registration-receipts'
import {
  createSupabaseAdminEmailDeliveryStore,
} from '@/lib/admin-email-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { ClassRegistrationFeeType } from '@/types'

const CLASS_REGISTRATION_RECEIPT_SELECT = [
  'id',
  'class_id',
  'status',
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
  status: 'pending' | 'approved' | 'denied'
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

  return {
    status: row.status,
    receipt: buildClassRegistrationReceipt({
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
    }),
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

export async function GET(
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
    const receiptResult = await readRegistrationReceipt(supabase, registrationId)

    if (!receiptResult) {
      return createErrorResponse('Class registration not found.', 404)
    }

    if (receiptResult.status !== 'approved') {
      return createErrorResponse('Only approved registrations can send a receipt.', 400)
    }

    const receipt = receiptResult.receipt

    const deliveryStore = createSupabaseAdminEmailDeliveryStore(supabase)
    const existingDelivery = await deliveryStore.readReceiptDelivery({
      classRegistrationId: registrationId,
    })
    const receiptSentAt =
      normalizeText(existingDelivery?.sentAt) || normalizeText(receipt.receiptSentAt) || null
    const disabledReason = getReceiptDisabledReason({
      receiptNumber: receipt.receiptNumber,
      amountPaid: receipt.amountPaid,
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
        : 'Unexpected server error while loading the class registration receipt.',
      500,
    )
  }
}
