import type {
  MemberPaymentHistoryItem,
  MemberPaymentMethod,
} from '@/types'

export const MEMBER_PAYMENT_RECORD_SELECT = [
  'id',
  'member_id',
  'member_type_id',
  'payment_method',
  'amount_paid',
  'promotion',
  'recorded_by',
  'payment_date',
  'notes',
  'created_at',
  'memberType:member_types!member_payments_member_type_id_fkey(name)',
  'recordedByProfile:profiles!member_payments_recorded_by_fkey(name)',
].join(', ')

export type MemberPaymentRecord = {
  id: string
  member_id: string
  member_type_id: string
  payment_method: MemberPaymentMethod
  amount_paid: number | string
  promotion: string | null
  recorded_by: string | null
  payment_date: string
  notes: string | null
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
    memberTypeId: normalizeText(record.member_type_id),
    memberTypeName: normalizeNullableText(record.memberType?.name),
    paymentMethod: record.payment_method,
    amountPaid: normalizeAmount(record.amount_paid),
    promotion: normalizeNullableText(record.promotion),
    recordedBy: normalizeNullableText(record.recorded_by),
    recordedByName: normalizeNullableText(record.recordedByProfile?.name),
    paymentDate: normalizeText(record.payment_date),
    notes: normalizeNullableText(record.notes),
    createdAt: normalizeTimestamp(record.created_at) ?? record.created_at,
  }
}
