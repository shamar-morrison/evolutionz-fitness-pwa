import { calculatePlannedPauseResumeDate } from '@/lib/member-pause'
import { getJamaicaDateValue } from '@/lib/pt-scheduling'
import type {
  MemberPauseRequest,
  MemberPauseRequestStatus,
  MemberPauseResumeRequest,
  MemberStatus,
} from '@/types'

export const MEMBER_PAUSE_REQUEST_SELECT = [
  'id',
  'member_id',
  'requested_by',
  'duration_days',
  'status',
  'reviewed_by',
  'review_timestamp',
  'created_at',
  'member:members!member_pause_requests_member_id_fkey(id, name, status, end_time)',
  'requestedByProfile:profiles!member_pause_requests_requested_by_fkey(name)',
  'reviewedByProfile:profiles!member_pause_requests_reviewed_by_fkey(name)',
].join(', ')

export const MEMBER_PAUSE_RESUME_REQUEST_SELECT = [
  'id',
  'pause_id',
  'requested_by',
  'status',
  'reviewed_by',
  'review_timestamp',
  'created_at',
  'pause:member_pauses!member_pause_resume_requests_pause_id_fkey(id, member_id, pause_start_date, planned_resume_date, original_end_time)',
  'member:members!member_pause_resume_requests_member_id_fkey(id, name)',
  'requestedByProfile:profiles!member_pause_resume_requests_requested_by_fkey(name)',
  'reviewedByProfile:profiles!member_pause_resume_requests_reviewed_by_fkey(name)',
].join(', ')

export type MemberPauseRequestRecord = {
  id: string
  member_id: string
  requested_by: string
  duration_days: number
  status: MemberPauseRequestStatus
  reviewed_by: string | null
  review_timestamp: string | null
  created_at: string
  member?: {
    id: string
    name: string
    status: MemberStatus
    end_time: string | null
  } | null
  requestedByProfile?: {
    name: string | null
  } | null
  reviewedByProfile?: {
    name: string | null
  } | null
}

export type MemberPauseResumeRequestRecord = {
  id: string
  pause_id: string
  requested_by: string
  status: MemberPauseRequestStatus
  reviewed_by: string | null
  review_timestamp: string | null
  created_at: string
  member?: {
    id: string
    name: string
  } | null
  pause?: {
    id: string
    member_id: string
    pause_start_date: string
    planned_resume_date: string
    original_end_time: string
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

  const normalizedDateTimeValue = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/u.test(
    normalizedValue,
  )
    ? `${normalizedValue}Z`
    : normalizedValue
  const timestamp = new Date(normalizedDateTimeValue)

  if (Number.isNaN(timestamp.getTime())) {
    return normalizedValue
  }

  return timestamp.toISOString()
}

function normalizeDate(value: string | null | undefined) {
  const normalizedValue = normalizeText(value)
  return normalizedValue || null
}

export function mapMemberPauseRequestRecord(
  record: MemberPauseRequestRecord,
): MemberPauseRequest {
  const currentEndTime = normalizeTimestamp(record.member?.end_time)
  const createdAt = normalizeTimestamp(record.created_at) ?? record.created_at
  const plannedResumeDate = calculatePlannedPauseResumeDate(
    Number.isFinite(record.duration_days) ? record.duration_days : 0,
    getJamaicaDateValue(createdAt) ?? undefined,
  )

  return {
    id: normalizeText(record.id),
    memberId: normalizeText(record.member_id),
    memberName: normalizeText(record.member?.name),
    currentEndTime,
    currentStatus: record.member?.status ?? null,
    durationDays: Number.isFinite(record.duration_days) ? record.duration_days : 0,
    plannedResumeDate: plannedResumeDate ?? '',
    status: record.status,
    requestedBy: normalizeText(record.requested_by),
    requestedByName: normalizeNullableText(record.requestedByProfile?.name),
    reviewedBy: normalizeNullableText(record.reviewed_by),
    reviewedByName: normalizeNullableText(record.reviewedByProfile?.name),
    reviewedAt: normalizeTimestamp(record.review_timestamp),
    createdAt,
  }
}

export function mapMemberPauseRequestRecordWithPlannedResumeDate(
  record: MemberPauseRequestRecord,
  plannedResumeDate: string,
): MemberPauseRequest {
  return {
    ...mapMemberPauseRequestRecord(record),
    plannedResumeDate,
  }
}

export function mapMemberPauseResumeRequestRecord(
  record: MemberPauseResumeRequestRecord,
): MemberPauseResumeRequest {
  return {
    id: normalizeText(record.id),
    pauseId: normalizeText(record.pause_id),
    memberId: normalizeText(record.pause?.member_id ?? record.member?.id),
    memberName: normalizeText(record.member?.name),
    pauseStartDate: normalizeDate(record.pause?.pause_start_date) ?? '',
    plannedResumeDate: normalizeDate(record.pause?.planned_resume_date) ?? '',
    originalEndTime: normalizeTimestamp(record.pause?.original_end_time) ?? '',
    status: record.status,
    requestedBy: normalizeText(record.requested_by),
    requestedByName: normalizeNullableText(record.requestedByProfile?.name),
    reviewedBy: normalizeNullableText(record.reviewed_by),
    reviewedByName: normalizeNullableText(record.reviewedByProfile?.name),
    reviewedAt: normalizeTimestamp(record.review_timestamp),
    createdAt: normalizeTimestamp(record.created_at) ?? record.created_at,
  }
}
