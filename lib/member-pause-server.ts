import {
  type AccessControlJobOutcome,
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
} from '@/lib/access-control-jobs'
import { buildAddCardPayload } from '@/lib/member-job'
import { readActiveMemberPause, type MemberPauseReadClient } from '@/lib/member-pause-records'
import {
  getMemberPauseJamaicaNow,
  isMemberPauseEligible,
  MEMBER_PAUSE_ACTIVE_ERROR,
  MEMBER_PAUSE_INACTIVE_ERROR,
} from '@/lib/member-pause'
import { readMemberWithCardCode, type MembersReadClient } from '@/lib/members'
import { getBaseRpcErrorStatus } from '@/lib/rpc-error-status'

const REVOKE_CARD_TIMEOUT_ERROR = 'Revoke card request timed out after 10 seconds.'
const ISSUE_CARD_TIMEOUT_ERROR = 'Issue card request timed out after 10 seconds.'

export type MemberPauseServerClient = MembersReadClient &
  MemberPauseReadClient &
  AccessControlJobsClient & {
    from(table: string): any
    rpc(fn: string, args: Record<string, unknown>): PromiseLike<{
      data: unknown
      error: { message: string } | null
    }>
  }

export function createErrorResponseBody(error: string) {
  return {
    ok: false as const,
    error,
  }
}

export function getMemberPauseRpcErrorStatus(message: string) {
  const baseStatus = getBaseRpcErrorStatus(message)

  if (baseStatus !== null) {
    return baseStatus
  }

  if (
    message === 'Member pause not found.' ||
    message === 'Member pause request not found.' ||
    message === 'Early resume request not found.'
  ) {
    return 404
  }

  if (
    message === MEMBER_PAUSE_ACTIVE_ERROR ||
    message === 'Pause duration is required.' ||
    message === 'Current timestamp is required.' ||
    message === 'Resume date is required.' ||
    message === 'Resume date cannot be in the future.' ||
    message === 'Duration must be between 7 and 364 days.' ||
    message === 'Duration must match a supported membership option.' ||
    message === 'This pause is no longer active.' ||
    message === 'Resume date cannot be before the pause start date.'
  ) {
    return 400
  }

  return null
}

export function getMemberPauseRequestNotificationTitle(requestKind: 'pause' | 'early_resume') {
  return requestKind === 'pause' ? 'Membership Pause Request' : 'Early Resume Request'
}

export function getMemberPauseCardSyncWarning(action: 'pause' | 'resume', error: string) {
  return action === 'pause'
    ? `Membership paused, but card sync failed: ${error}`
    : `Membership resumed, but card sync failed: ${error}`
}

export async function getMemberPauseEligibilityError(
  client: MemberPauseServerClient,
  memberId: string,
  now = new Date(),
) {
  const member = await readMemberWithCardCode(client, memberId)

  if (!member) {
    return {
      member: null,
      error: 'Member not found.',
      status: 404,
    } as const
  }

  const activePause = await readActiveMemberPause(client, memberId)

  if (activePause || member.status === 'Paused') {
    return {
      member,
      error: MEMBER_PAUSE_ACTIVE_ERROR,
      status: 400,
    } as const
  }

  if (!isMemberPauseEligible(member.endTime, member.status, now)) {
    return {
      member,
      error: MEMBER_PAUSE_INACTIVE_ERROR,
      status: 400,
    } as const
  }

  return {
    member,
    error: null,
    status: 200,
  } as const
}

export function getMemberPauseReviewTimestamp(now = new Date()) {
  return getMemberPauseJamaicaNow(now).timestampWithOffset
}

export function getMemberPauseTodayDate(now = new Date()) {
  return getMemberPauseJamaicaNow(now).dateValue
}

export async function maybeQueuePauseRevokeCard(
  member: Awaited<ReturnType<typeof readMemberWithCardCode>>,
  supabase: MemberPauseServerClient,
): Promise<AccessControlJobOutcome | null> {
  if (!member?.cardNo || member.cardStatus !== 'assigned') {
    return null
  }

  return createAndWaitForAccessControlJob({
    jobType: 'revoke_card',
    payload: {
      employeeNo: member.employeeNo,
      cardNo: member.cardNo,
    },
    messages: {
      createErrorPrefix: 'Failed to create revoke card job',
      missingJobIdMessage: 'Failed to create revoke card job: missing job id in response',
      readErrorPrefix: (jobId) => `Failed to read revoke card job ${jobId}`,
      missingJobMessage: (jobId) => `Revoke card job ${jobId} was not found after creation.`,
      failedJobMessage: 'Revoke card job failed.',
      timeoutMessage: REVOKE_CARD_TIMEOUT_ERROR,
    },
    supabase,
  })
}

export async function maybeQueuePauseAddCard(
  member: Awaited<ReturnType<typeof readMemberWithCardCode>>,
  supabase: MemberPauseServerClient,
): Promise<AccessControlJobOutcome | null> {
  if (!member?.cardNo || member.cardStatus !== 'assigned') {
    return null
  }

  return createAndWaitForAccessControlJob({
    jobType: 'add_card',
    payload: buildAddCardPayload({
      employeeNo: member.employeeNo,
      cardNo: member.cardNo,
    }),
    messages: {
      createErrorPrefix: 'Failed to create add card job',
      missingJobIdMessage: 'Failed to create add card job: missing job id in response',
      readErrorPrefix: (jobId) => `Failed to read add card job ${jobId}`,
      missingJobMessage: (jobId) => `Add card job ${jobId} was not found after creation.`,
      failedJobMessage: 'Add card job failed.',
      timeoutMessage: ISSUE_CARD_TIMEOUT_ERROR,
    },
    supabase,
  })
}
