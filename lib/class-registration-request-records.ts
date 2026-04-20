import type {
  ClassRegistrationEditRequest,
  ClassRegistrationFeeType,
  ClassRegistrationRemovalRequest,
  ClassRegistrationRequestStatus,
} from '@/types'

export const CLASS_REGISTRATION_EDIT_REQUEST_SELECT = [
  'id',
  'registration_id',
  'class_id',
  'requested_by',
  'proposed_fee_type',
  'proposed_amount_paid',
  'proposed_period_start',
  'proposed_payment_received',
  'proposed_notes',
  'status',
  'reviewed_by',
  'review_timestamp',
  'created_at',
  'class:classes!class_registration_edit_requests_class_id_fkey(name)',
  'registration:class_registrations!class_registration_edit_requests_registration_id_fkey(id, member_id, guest_profile_id, month_start, fee_type, amount_paid, notes)',
  'requestedByProfile:profiles!class_registration_edit_requests_requested_by_fkey(name)',
  'reviewedByProfile:profiles!class_registration_edit_requests_reviewed_by_fkey(name)',
].join(', ')

export const CLASS_REGISTRATION_REMOVAL_REQUEST_SELECT = [
  'id',
  'registration_id',
  'class_id',
  'requested_by',
  'amount_paid_at_request',
  'status',
  'reviewed_by',
  'review_timestamp',
  'created_at',
  'class:classes!class_registration_removal_requests_class_id_fkey(name)',
  'registration:class_registrations!class_registration_removal_requests_registration_id_fkey(id, member_id, guest_profile_id)',
  'requestedByProfile:profiles!class_registration_removal_requests_requested_by_fkey(name)',
  'reviewedByProfile:profiles!class_registration_removal_requests_reviewed_by_fkey(name)',
].join(', ')

export type HydratedRegistrantRecord = {
  id: string
  name: string
  email: string | null
}

export type ClassRegistrationEditRequestRecord = {
  id: string
  registration_id: string
  class_id: string
  requested_by: string
  proposed_fee_type: ClassRegistrationFeeType | null
  proposed_amount_paid: number | string
  proposed_period_start: string
  proposed_payment_received: boolean
  proposed_notes: string | null
  status: ClassRegistrationRequestStatus
  reviewed_by: string | null
  review_timestamp: string | null
  created_at: string
  class?: {
    name: string | null
  } | null
  registration?: {
    id: string
    member_id: string | null
    guest_profile_id: string | null
    month_start: string
    fee_type: ClassRegistrationFeeType | null
    amount_paid: number | string
    notes: string | null
  } | null
  requestedByProfile?: {
    name: string | null
  } | null
  reviewedByProfile?: {
    name: string | null
  } | null
}

export type ClassRegistrationRemovalRequestRecord = {
  id: string
  registration_id: string
  class_id: string
  requested_by: string
  amount_paid_at_request: number | string
  status: ClassRegistrationRequestStatus
  reviewed_by: string | null
  review_timestamp: string | null
  created_at: string
  class?: {
    name: string | null
  } | null
  registration?: {
    id: string
    member_id: string | null
    guest_profile_id: string | null
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

function normalizeNumber(value: number | string) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

export function mapClassRegistrationEditRequestRecord(
  record: ClassRegistrationEditRequestRecord,
  registrant: HydratedRegistrantRecord | null,
): ClassRegistrationEditRequest {
  return {
    id: normalizeText(record.id),
    registrationId: normalizeText(record.registration_id),
    classId: normalizeText(record.class_id),
    className: normalizeText(record.class?.name) || 'Unknown class',
    memberId: normalizeNullableText(record.registration?.member_id),
    guestProfileId: normalizeNullableText(record.registration?.guest_profile_id),
    registrantName: normalizeText(registrant?.name) || 'Unknown registrant',
    registrantEmail: normalizeNullableText(registrant?.email),
    currentFeeType: record.registration?.fee_type ?? null,
    currentAmountPaid: normalizeNumber(record.registration?.amount_paid ?? 0),
    currentPeriodStart: normalizeText(record.registration?.month_start),
    currentPaymentReceived: normalizeNumber(record.registration?.amount_paid ?? 0) > 0,
    currentNotes: normalizeNullableText(record.registration?.notes),
    proposedFeeType: record.proposed_fee_type,
    proposedAmountPaid: normalizeNumber(record.proposed_amount_paid),
    proposedPeriodStart: normalizeText(record.proposed_period_start),
    proposedPaymentReceived: record.proposed_payment_received,
    proposedNotes: normalizeNullableText(record.proposed_notes),
    requestedBy: normalizeText(record.requested_by),
    requestedByName: normalizeNullableText(record.requestedByProfile?.name),
    reviewedBy: normalizeNullableText(record.reviewed_by),
    reviewedByName: normalizeNullableText(record.reviewedByProfile?.name),
    reviewedAt: normalizeNullableText(record.review_timestamp),
    status: record.status,
    createdAt: normalizeText(record.created_at),
  }
}

export function mapClassRegistrationRemovalRequestRecord(
  record: ClassRegistrationRemovalRequestRecord,
  registrant: HydratedRegistrantRecord | null,
): ClassRegistrationRemovalRequest {
  return {
    id: normalizeText(record.id),
    registrationId: normalizeText(record.registration_id),
    classId: normalizeText(record.class_id),
    className: normalizeText(record.class?.name) || 'Unknown class',
    memberId: normalizeNullableText(record.registration?.member_id),
    guestProfileId: normalizeNullableText(record.registration?.guest_profile_id),
    registrantName: normalizeText(registrant?.name) || 'Unknown registrant',
    registrantEmail: normalizeNullableText(registrant?.email),
    amountPaidAtRequest: normalizeNumber(record.amount_paid_at_request),
    requestedBy: normalizeText(record.requested_by),
    requestedByName: normalizeNullableText(record.requestedByProfile?.name),
    reviewedBy: normalizeNullableText(record.reviewed_by),
    reviewedByName: normalizeNullableText(record.reviewedByProfile?.name),
    reviewedAt: normalizeNullableText(record.review_timestamp),
    status: record.status,
    createdAt: normalizeText(record.created_at),
  }
}
