import type { MemberActivePause, MemberPauseRequestStatus } from '@/types'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type QueryRowsResult<T> = PromiseLike<{
  data: T[] | null
  error: { message: string } | null
}>

export type MemberPauseReadClient = {
  from(table: string): any
}

type ActivePauseRow = {
  id: string
  member_id: string
  pause_start_date: string
  planned_resume_date: string
  original_end_time: string
  status: 'active'
}

type PendingResumeRequestRow = {
  id: string
  status: MemberPauseRequestStatus
}

type ActivePauseWithMemberRow = ActivePauseRow & {
  member?: {
    id: string
    name: string
    employee_no: string
    card_no: string | null
  } | null
}

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
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

function mapActivePauseRow(
  row: ActivePauseRow,
  pendingRequest: PendingResumeRequestRow | null,
): MemberActivePause {
  return {
    id: normalizeText(row.id),
    pauseStartDate: normalizeText(row.pause_start_date),
    plannedResumeDate: normalizeText(row.planned_resume_date),
    originalEndTime: normalizeTimestamp(row.original_end_time) ?? row.original_end_time,
    status: 'active',
    pendingEarlyResumeRequest: pendingRequest
      ? {
          id: normalizeText(pendingRequest.id),
          status: pendingRequest.status,
        }
      : null,
  }
}

export async function readActiveMemberPause(
  supabase: MemberPauseReadClient,
  memberId: string,
): Promise<MemberActivePause | null> {
  const { data: pauseRow, error: pauseError } = await supabase
    .from('member_pauses')
    .select('id, member_id, pause_start_date, planned_resume_date, original_end_time, status')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .maybeSingle()

  if (pauseError) {
    throw new Error(`Failed to read active member pause: ${pauseError.message}`)
  }

  if (!pauseRow) {
    return null
  }

  const { data: pendingRows, error: pendingError } = await supabase
    .from('member_pause_resume_requests')
    .select('id, status')
    .eq('pause_id', pauseRow.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)

  if (pendingError) {
    throw new Error(`Failed to read pending early resume requests: ${pendingError.message}`)
  }

  return mapActivePauseRow(
    pauseRow as ActivePauseRow,
    ((pendingRows ?? []) as PendingResumeRequestRow[])[0] ?? null,
  )
}

export async function readActivePauseById(
  supabase: MemberPauseReadClient,
  pauseId: string,
): Promise<ActivePauseWithMemberRow | null> {
  const { data, error } = await supabase
    .from('member_pauses')
    .select(
      'id, member_id, pause_start_date, planned_resume_date, original_end_time, status, member:members!member_pauses_member_id_fkey(id, name, employee_no, card_no)',
    )
    .eq('id', pauseId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read active pause ${pauseId}: ${error.message}`)
  }

  return (data as ActivePauseWithMemberRow | null) ?? null
}

export async function readPendingEarlyResumeRequestForPause(
  supabase: MemberPauseReadClient,
  pauseId: string,
): Promise<PendingResumeRequestRow | null> {
  const { data, error } = await supabase
    .from('member_pause_resume_requests')
    .select('id, status')
    .eq('pause_id', pauseId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) {
    throw new Error(`Failed to read pending early resume request: ${error.message}`)
  }

  return ((data ?? []) as PendingResumeRequestRow[])[0] ?? null
}
