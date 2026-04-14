import type {
  MemberApprovalRequestStatus,
  MemberPaymentMethod,
  MemberPaymentRequest,
  MemberPaymentType,
} from '@/types'

export const MEMBER_PAYMENT_REQUEST_SELECT = [
  'id',
  'member_id',
  'requested_by',
  'status',
  'amount',
  'payment_method',
  'payment_date',
  'member_type_id',
  'payment_type',
  'notes',
  'reviewed_by',
  'reviewed_at',
  'rejection_reason',
  'created_at',
  'updated_at',
  'member:members!member_payment_requests_member_id_fkey(id, name, email)',
  'memberType:member_types!member_payment_requests_member_type_id_fkey(name)',
  'requestedByProfile:profiles!member_payment_requests_requested_by_fkey(name)',
  'reviewedByProfile:profiles!member_payment_requests_reviewed_by_fkey(name)',
].join(', ')

export type MemberPaymentRequestRecord = {
  id: string
  member_id: string
  requested_by: string
  status: MemberApprovalRequestStatus
  amount: number
  payment_method: MemberPaymentMethod
  payment_date: string
  member_type_id: string | null
  payment_type: MemberPaymentType
  notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  member?: {
    id: string
    name: string
    email: string | null
  } | null
  memberType?: {
    name: string | null
  } | null
  requestedByProfile?: {
    name: string | null
  } | null
  reviewedByProfile?: {
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

export function mapMemberPaymentRequestRecord(
  record: MemberPaymentRequestRecord,
): MemberPaymentRequest {
  return {
    id: normalizeText(record.id),
    memberId: normalizeText(record.member_id),
    memberName: normalizeText(record.member?.name),
    memberEmail: normalizeNullableText(record.member?.email),
    amount: typeof record.amount === 'number' ? record.amount : Number(record.amount),
    paymentType: record.payment_type,
    paymentMethod: record.payment_method,
    paymentDate: normalizeText(record.payment_date),
    memberTypeId: normalizeNullableText(record.member_type_id),
    memberTypeName: normalizeNullableText(record.memberType?.name),
    notes: normalizeNullableText(record.notes),
    requestedBy: normalizeText(record.requested_by),
    requestedByName: normalizeNullableText(record.requestedByProfile?.name),
    reviewedBy: normalizeNullableText(record.reviewed_by),
    reviewedByName: normalizeNullableText(record.reviewedByProfile?.name),
    reviewedAt: normalizeTimestamp(record.reviewed_at),
    rejectionReason: normalizeNullableText(record.rejection_reason),
    status: record.status,
    createdAt: normalizeTimestamp(record.created_at) ?? record.created_at,
    updatedAt: normalizeTimestamp(record.updated_at) ?? record.updated_at,
  }
}
