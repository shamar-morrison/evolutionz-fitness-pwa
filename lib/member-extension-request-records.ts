import type {
  MemberExtensionRequest,
  MemberExtensionRequestStatus,
} from '@/types'

export const MEMBER_EXTENSION_REQUEST_SELECT = [
  'id',
  'member_id',
  'requested_by',
  'duration_days',
  'status',
  'reviewed_by',
  'review_timestamp',
  'created_at',
  'member:members!member_extension_requests_member_id_fkey(id, name, end_time)',
  'requestedByProfile:profiles!member_extension_requests_requested_by_fkey(name)',
  'reviewedByProfile:profiles!member_extension_requests_reviewed_by_fkey(name)',
].join(', ')

export type MemberExtensionRequestRecord = {
  id: string
  member_id: string
  requested_by: string
  duration_days: number
  status: MemberExtensionRequestStatus
  reviewed_by: string | null
  review_timestamp: string | null
  created_at: string
  member?: {
    id: string
    name: string
    end_time: string | null
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

export function mapMemberExtensionRequestRecord(
  record: MemberExtensionRequestRecord,
): MemberExtensionRequest {
  return {
    id: normalizeText(record.id),
    memberId: normalizeText(record.member_id),
    memberName: normalizeText(record.member?.name),
    currentEndTime: normalizeTimestamp(record.member?.end_time),
    durationDays: Number.isFinite(record.duration_days) ? record.duration_days : 0,
    status: record.status,
    requestedBy: normalizeText(record.requested_by),
    requestedByName: normalizeNullableText(record.requestedByProfile?.name),
    reviewedBy: normalizeNullableText(record.reviewed_by),
    reviewedByName: normalizeNullableText(record.reviewedByProfile?.name),
    reviewedAt: normalizeTimestamp(record.review_timestamp),
    createdAt: normalizeTimestamp(record.created_at) ?? record.created_at,
  }
}
