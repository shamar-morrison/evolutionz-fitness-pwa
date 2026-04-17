import { parseDateInputValue } from '@/lib/member-access-time'
import { normalizeTimeInputValue } from '@/lib/member-access-time'
import type { MemberEditRequest, MemberGender, MemberApprovalRequestStatus } from '@/types'

export const MEMBER_EDIT_REQUEST_SELECT = [
  'id',
  'member_id',
  'requested_by',
  'status',
  'proposed_name',
  'proposed_gender',
  'proposed_phone',
  'proposed_email',
  'proposed_member_type_id',
  'proposed_join_date',
  'proposed_start_date',
  'proposed_start_time',
  'proposed_duration',
  'reviewed_by',
  'reviewed_at',
  'rejection_reason',
  'created_at',
  'updated_at',
  'member:members!member_edit_requests_member_id_fkey(id, name, gender, phone, email, member_type_id, joined_at, begin_time, end_time, memberType:member_types(name))',
  'requestedByProfile:profiles!member_edit_requests_requested_by_fkey(name)',
  'reviewedByProfile:profiles!member_edit_requests_reviewed_by_fkey(name)',
  'proposedMemberType:member_types!member_edit_requests_proposed_member_type_id_fkey(name)',
].join(', ')

export type MemberEditRequestRecord = {
  id: string
  member_id: string
  requested_by: string
  status: MemberApprovalRequestStatus
  proposed_name: string | null
  proposed_gender: MemberGender | null
  proposed_phone: string | null
  proposed_email: string | null
  proposed_member_type_id: string | null
  proposed_join_date: string | null
  proposed_start_date: string | null
  proposed_start_time: string | null
  proposed_duration: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  member?: {
    id: string
    name: string
    gender: MemberGender | null
    phone: string | null
    email: string | null
    member_type_id: string | null
    joined_at: string | null
    begin_time: string | null
    end_time: string | null
    memberType?: {
      name: string | null
    } | null
  } | null
  requestedByProfile?: {
    name: string | null
  } | null
  reviewedByProfile?: {
    name: string | null
  } | null
  proposedMemberType?: {
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

function normalizeNullableTime(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  return normalizeTimeInputValue(normalizedValue) ?? normalizedValue
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

function normalizeDate(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return null
  }

  return parseDateInputValue(normalizedValue) ? normalizedValue : null
}

export function mapMemberEditRequestRecord(record: MemberEditRequestRecord): MemberEditRequest {
  const currentName = normalizeText(record.member?.name)

  return {
    id: normalizeText(record.id),
    memberId: normalizeText(record.member_id),
    memberName: currentName,
    currentName,
    currentGender: record.member?.gender ?? null,
    currentPhone: normalizeNullableText(record.member?.phone),
    currentEmail: normalizeNullableText(record.member?.email),
    currentMemberTypeId: normalizeNullableText(record.member?.member_type_id),
    currentMemberTypeName: normalizeNullableText(record.member?.memberType?.name),
    currentJoinDate: normalizeDate(record.member?.joined_at),
    currentBeginTime: normalizeTimestamp(record.member?.begin_time),
    currentEndTime: normalizeTimestamp(record.member?.end_time),
    proposedName: normalizeNullableText(record.proposed_name),
    proposedGender: record.proposed_gender ?? null,
    proposedPhone: normalizeNullableText(record.proposed_phone),
    proposedEmail: normalizeNullableText(record.proposed_email),
    proposedMemberTypeId: normalizeNullableText(record.proposed_member_type_id),
    proposedMemberTypeName: normalizeNullableText(record.proposedMemberType?.name),
    proposedJoinDate: normalizeDate(record.proposed_join_date),
    proposedStartDate: normalizeNullableText(record.proposed_start_date),
    proposedStartTime: normalizeNullableTime(record.proposed_start_time),
    proposedDuration: normalizeNullableText(record.proposed_duration),
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
