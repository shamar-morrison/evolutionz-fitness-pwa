import type { StaffRemoval, StaffRemovalHistory } from '@/lib/staff'

type QueryRowsResult = PromiseLike<{
  data: Array<{ id: string }> | null
  error: { message: string } | null
}>

export type StaffRemovalReadClient = {
  from(table: string): any
}

type EqFilters = ReadonlyArray<readonly [string, string]>

async function readIdRows(
  supabase: StaffRemovalReadClient,
  table: string,
  filters: EqFilters,
) {
  let query = supabase.from(table).select('id')

  for (const [column, value] of filters) {
    query = query.eq(column, value)
  }

  const { data, error } = (await query) as Awaited<QueryRowsResult>

  if (error) {
    throw new Error(`Failed to read ${table}: ${error.message}`)
  }

  return Array.isArray(data) ? data : []
}

export async function readStaffRemovalState(
  supabase: StaffRemovalReadClient,
  profileId: string,
): Promise<StaffRemoval> {
  const [
    trainerAssignments,
    activeAssignments,
    ptSessions,
    sessionChanges,
    rescheduleRequestsRequested,
    rescheduleRequestsReviewed,
    sessionUpdateRequestsRequested,
    sessionUpdateRequestsReviewed,
    memberApprovalRequestsSubmitted,
    memberEditRequestsReviewed,
    memberPaymentRequestsReviewed,
    memberExtensionRequestsRequested,
    memberExtensionRequestsReviewed,
    memberPauseRequestsRequested,
    memberPauseRequestsReviewed,
    memberPauseResumeRequestsRequested,
    memberPauseResumeRequestsReviewed,
  ] = await Promise.all([
    readIdRows(supabase, 'trainer_clients', [['trainer_id', profileId]]),
    readIdRows(supabase, 'trainer_clients', [
      ['trainer_id', profileId],
      ['status', 'active'],
    ]),
    readIdRows(supabase, 'pt_sessions', [['trainer_id', profileId]]),
    readIdRows(supabase, 'pt_session_changes', [['changed_by', profileId]]),
    readIdRows(supabase, 'pt_reschedule_requests', [['requested_by', profileId]]),
    readIdRows(supabase, 'pt_reschedule_requests', [['reviewed_by', profileId]]),
    readIdRows(supabase, 'pt_session_update_requests', [['requested_by', profileId]]),
    readIdRows(supabase, 'pt_session_update_requests', [['reviewed_by', profileId]]),
    readIdRows(supabase, 'member_approval_requests', [['submitted_by', profileId]]),
    readIdRows(supabase, 'member_edit_requests', [['reviewed_by', profileId]]),
    readIdRows(supabase, 'member_payment_requests', [['reviewed_by', profileId]]),
    readIdRows(supabase, 'member_extension_requests', [['requested_by', profileId]]),
    readIdRows(supabase, 'member_extension_requests', [['reviewed_by', profileId]]),
    readIdRows(supabase, 'member_pause_requests', [['requested_by', profileId]]),
    readIdRows(supabase, 'member_pause_requests', [['reviewed_by', profileId]]),
    readIdRows(supabase, 'member_pause_resume_requests', [['requested_by', profileId]]),
    readIdRows(supabase, 'member_pause_resume_requests', [['reviewed_by', profileId]]),
  ])

  const history: StaffRemovalHistory = {
    trainerAssignments: trainerAssignments.length,
    ptSessions: ptSessions.length,
    sessionChanges: sessionChanges.length,
    rescheduleRequestsRequested: rescheduleRequestsRequested.length,
    rescheduleRequestsReviewed: rescheduleRequestsReviewed.length,
    sessionUpdateRequestsRequested: sessionUpdateRequestsRequested.length,
    sessionUpdateRequestsReviewed: sessionUpdateRequestsReviewed.length,
    memberApprovalRequestsSubmitted: memberApprovalRequestsSubmitted.length,
    memberEditRequestsReviewed: memberEditRequestsReviewed.length,
    memberPaymentRequestsReviewed: memberPaymentRequestsReviewed.length,
    memberExtensionRequestsRequested: memberExtensionRequestsRequested.length,
    memberExtensionRequestsReviewed: memberExtensionRequestsReviewed.length,
    memberPauseRequestsRequested: memberPauseRequestsRequested.length,
    memberPauseRequestsReviewed: memberPauseRequestsReviewed.length,
    memberPauseResumeRequestsRequested: memberPauseResumeRequestsRequested.length,
    memberPauseResumeRequestsReviewed: memberPauseResumeRequestsReviewed.length,
    total:
      trainerAssignments.length +
      ptSessions.length +
      sessionChanges.length +
      rescheduleRequestsRequested.length +
      rescheduleRequestsReviewed.length +
      sessionUpdateRequestsRequested.length +
      sessionUpdateRequestsReviewed.length +
      memberApprovalRequestsSubmitted.length +
      memberEditRequestsReviewed.length +
      memberPaymentRequestsReviewed.length +
      memberExtensionRequestsRequested.length +
      memberExtensionRequestsReviewed.length +
      memberPauseRequestsRequested.length +
      memberPauseRequestsReviewed.length +
      memberPauseResumeRequestsRequested.length +
      memberPauseResumeRequestsReviewed.length,
  }

  return {
    mode:
      activeAssignments.length > 0
        ? 'blocked'
        : history.total > 0
          ? 'archive'
          : 'delete',
    activeAssignments: activeAssignments.length,
    history,
  }
}
