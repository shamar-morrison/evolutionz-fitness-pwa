import type { MemberApprovalRequest, MemberApprovalRequestStatus, MemberGender } from '@/types'

export const MEMBER_APPROVAL_REQUEST_SELECT = [
  'id',
  'name',
  'gender',
  'email',
  'phone',
  'remark',
  'begin_time',
  'end_time',
  'card_no',
  'card_code',
  'member_type_id',
  'photo_url',
  'submitted_by',
  'status',
  'reviewed_by',
  'reviewed_at',
  'review_note',
  'member_id',
  'created_at',
  'updated_at',
  'memberType:member_types(name)',
  'submittedByProfile:profiles!member_approval_requests_submitted_by_fkey(name)',
  'reviewedByProfile:profiles!member_approval_requests_reviewed_by_fkey(name)',
].join(', ')

export type MemberApprovalRequestRecord = {
  id: string
  name: string
  gender: MemberGender | null
  email: string | null
  phone: string | null
  remark: string | null
  begin_time: string
  end_time: string
  card_no: string
  card_code: string
  member_type_id: string
  photo_url: string | null
  submitted_by: string
  status: MemberApprovalRequestStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  member_id: string | null
  created_at: string
  updated_at: string
  memberType?: {
    name: string | null
  } | null
  submittedByProfile?: {
    name: string | null
  } | null
  reviewedByProfile?: {
    name: string | null
  } | null
}

export type MemberApprovalRequestsReadClient = {
  from(table: 'member_approval_requests'): {
    select(columns: string): {
      order(
        column: 'created_at',
        options: {
          ascending: boolean
        },
      ): PromiseLike<{
        data: MemberApprovalRequestRecord[] | null
        error: {
          message: string
        } | null
      }>
      eq(column: 'status' | 'id', value: string): {
        order(
          column: 'created_at',
          options: {
            ascending: boolean
          },
        ): PromiseLike<{
          data: MemberApprovalRequestRecord[] | null
          error: {
            message: string
          } | null
        }>
        maybeSingle(): PromiseLike<{
          data: MemberApprovalRequestRecord | null
          error: {
            message: string
          } | null
        }>
      }
    }
  }
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

export function mapMemberApprovalRequestRecord(
  record: MemberApprovalRequestRecord,
): MemberApprovalRequest {
  return {
    id: normalizeText(record.id),
    name: normalizeText(record.name),
    gender: record.gender ?? null,
    email: normalizeNullableText(record.email),
    phone: normalizeNullableText(record.phone),
    remark: normalizeNullableText(record.remark),
    beginTime: normalizeTimestamp(record.begin_time) ?? record.begin_time,
    endTime: normalizeTimestamp(record.end_time) ?? record.end_time,
    cardNo: normalizeText(record.card_no),
    cardCode: normalizeText(record.card_code),
    memberTypeId: normalizeText(record.member_type_id),
    memberTypeName:
      normalizeText(record.memberType?.name) || normalizeText(record.member_type_id),
    photoUrl: normalizeNullableText(record.photo_url),
    status: record.status,
    submittedBy: normalizeText(record.submitted_by),
    submittedByName: normalizeNullableText(record.submittedByProfile?.name),
    reviewedBy: normalizeNullableText(record.reviewed_by),
    reviewedAt: normalizeTimestamp(record.reviewed_at),
    reviewNote: normalizeNullableText(record.review_note),
    memberId: normalizeNullableText(record.member_id),
    createdAt: normalizeTimestamp(record.created_at) ?? record.created_at,
    updatedAt: normalizeTimestamp(record.updated_at) ?? record.updated_at,
  }
}

export async function readMemberApprovalRequests(
  supabase: MemberApprovalRequestsReadClient,
  status: MemberApprovalRequestStatus,
) {
  const { data, error } = await supabase
    .from('member_approval_requests')
    .select(MEMBER_APPROVAL_REQUEST_SELECT)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to read member approval requests: ${error.message}`)
  }

  return ((data ?? []) as MemberApprovalRequestRecord[]).map(mapMemberApprovalRequestRecord)
}

export async function readMemberApprovalRequestById(
  supabase: MemberApprovalRequestsReadClient,
  id: string,
) {
  const { data, error } = await supabase
    .from('member_approval_requests')
    .select(MEMBER_APPROVAL_REQUEST_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read member approval request ${id}: ${error.message}`)
  }

  if (!data) {
    return null
  }

  return mapMemberApprovalRequestRecord(data as MemberApprovalRequestRecord)
}
