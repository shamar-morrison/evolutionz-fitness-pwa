import type {
  MemberPaymentHistoryItem,
  MemberPaymentMethod,
  MemberPaymentType,
} from '@/types'

export const MEMBER_PAYMENT_RECORD_SELECT = [
  'id',
  'member_id',
  'member_type_id',
  'payment_type',
  'payment_method',
  'amount_paid',
  'promotion',
  'recorded_by',
  'payment_date',
  'notes',
  'receipt_number',
  'receipt_sent_at',
  'created_at',
  'memberType:member_types!member_payments_member_type_id_fkey(name)',
  'recordedByProfile:profiles!member_payments_recorded_by_fkey(name)',
].join(', ')

export type MemberPaymentRecord = {
  id: string
  member_id: string
  member_type_id: string | null
  payment_type: MemberPaymentType
  payment_method: MemberPaymentMethod
  amount_paid: number | string
  promotion: string | null
  recorded_by: string | null
  payment_date: string
  notes: string | null
  receipt_number: string | null
  receipt_sent_at: string | null
  created_at: string
  memberType?: {
    name: string | null
  } | null
  recordedByProfile?: {
    name: string | null
  } | null
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
}

function normalizeAmount(value: number | string) {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value
    }

    throw new Error(`Invalid amount: ${String(value)}`)
  }

  const parsedValue = Number(value)

  if (Number.isFinite(parsedValue)) {
    return parsedValue
  }

  throw new Error(`Invalid amount: ${String(value)}`)
}

function normalizeTimestamp(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  const timestamp = new Date(normalizedValue)

  if (Number.isNaN(timestamp.getTime())) {
    return normalizedValue
  }

  return timestamp.toISOString()
}

export function mapMemberPaymentRecord(
  record: MemberPaymentRecord,
): MemberPaymentHistoryItem {
  return {
    id: normalizeText(record.id),
    memberId: normalizeText(record.member_id),
    memberTypeId: normalizeNullableText(record.member_type_id),
    memberTypeName: normalizeNullableText(record.memberType?.name),
    paymentType: record.payment_type,
    paymentMethod: record.payment_method,
    amountPaid: normalizeAmount(record.amount_paid),
    promotion: normalizeNullableText(record.promotion),
    recordedBy: normalizeNullableText(record.recorded_by),
    recordedByName: normalizeNullableText(record.recordedByProfile?.name),
    paymentDate: normalizeText(record.payment_date),
    notes: normalizeNullableText(record.notes),
    receiptNumber: normalizeNullableText(record.receipt_number),
    receiptSentAt: normalizeTimestamp(record.receipt_sent_at),
    createdAt: normalizeTimestamp(record.created_at) ?? record.created_at,
  }
}
