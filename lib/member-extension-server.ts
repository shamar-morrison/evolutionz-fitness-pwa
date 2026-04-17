import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
} from '@/lib/access-control-jobs'
import { getAccessDateTimeValue } from '@/lib/member-access-time'
import {
  buildExtendedMemberEndTimeValue,
  isMemberExtensionEligible,
  isSupportedMemberExtensionDurationDays,
  MEMBER_EXTENSION_INACTIVE_ERROR,
} from '@/lib/member-extension'
import { buildAddUserPayloadWithAccessWindow } from '@/lib/member-job'
import { buildHikMemberName } from '@/lib/member-name'
import {
  MEMBER_RECORD_SELECT,
  readMemberWithCardCode,
  type MembersReadClient,
} from '@/lib/members'
import { resolveMemberStatusForAccessWindowUpdate } from '@/lib/member-status'
import type { Member, MemberRecord } from '@/types'

export const MEMBER_EXTENSION_SYNC_WARNING =
  'Membership extended but device sync failed. Please try again.'

const MEMBER_EXTENSION_SYNC_TIMEOUT_ERROR =
  'Membership extension request timed out after 10 seconds.'
const MEMBER_EXTENSION_DURATION_ERROR =
  'Duration must match a supported membership option.'
const MEMBER_EXTENSION_END_TIME_ERROR =
  'The member’s current end date could not be extended.'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type MemberExtensionUpdateValues = {
  end_time: string
  status: Member['status']
}

export type MemberExtensionServerClient = MembersReadClient &
  AccessControlJobsClient & {
    from(table: 'members'): {
      update(values: MemberExtensionUpdateValues): {
        eq(column: 'id', value: string): {
          select(columns: typeof MEMBER_RECORD_SELECT): {
            maybeSingle(): QueryResult<MemberRecord>
          }
        }
      }
    }
    from(table: string): unknown
  }

type PreparedMemberExtension = {
  member: NonNullable<Awaited<ReturnType<typeof readMemberWithCardCode>>>
  newEndTime: string
}

export type PreparedMemberExtensionResult =
  | {
      ok: true
      extension: PreparedMemberExtension
    }
  | {
      ok: false
      error: string
      status: number
    }

export type AppliedMemberExtensionResult = {
  ok: true
  newEndTime: string
  warning?: string
}

export async function prepareMemberExtension(
  memberId: string,
  durationDays: number,
  client: MemberExtensionServerClient,
): Promise<PreparedMemberExtensionResult> {
  if (!isSupportedMemberExtensionDurationDays(durationDays)) {
    return {
      ok: false,
      error: MEMBER_EXTENSION_DURATION_ERROR,
      status: 400,
    }
  }

  const member = await readMemberWithCardCode(client, memberId)

  if (!member) {
    return {
      ok: false,
      error: 'Member not found.',
      status: 404,
    }
  }

  if (!isMemberExtensionEligible(member.endTime)) {
    return {
      ok: false,
      error: MEMBER_EXTENSION_INACTIVE_ERROR,
      status: 400,
    }
  }

  const newEndTime = buildExtendedMemberEndTimeValue(member.endTime, durationDays)

  if (!newEndTime) {
    return {
      ok: false,
      error: MEMBER_EXTENSION_END_TIME_ERROR,
      status: 400,
    }
  }

  return {
    ok: true,
    extension: {
      member,
      newEndTime,
    },
  }
}

export async function applyPreparedMemberExtension(
  { member, newEndTime }: PreparedMemberExtension,
  client: MemberExtensionServerClient,
): Promise<AppliedMemberExtensionResult> {
  const { error } = await client
    .from('members')
    .update({
      end_time: newEndTime,
      status: resolveMemberStatusForAccessWindowUpdate({
        currentStatus: member.status,
        endTime: newEndTime,
      }),
    })
    .eq('id', member.id)
    .select(MEMBER_RECORD_SELECT)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to extend member ${member.id}: ${error.message}`)
  }

  const beginTime = getAccessDateTimeValue(member.beginTime)

  if (!beginTime) {
    return {
      ok: true,
      newEndTime,
      warning: MEMBER_EXTENSION_SYNC_WARNING,
    }
  }

  try {
    const addUserJob = await createAndWaitForAccessControlJob({
      jobType: 'add_user',
      payload: buildAddUserPayloadWithAccessWindow({
        employeeNo: member.employeeNo,
        name: buildHikMemberName(member.name, member.cardCode),
        beginTime,
        endTime: newEndTime,
      }),
      messages: {
        createErrorPrefix: 'Failed to create add user job',
        missingJobIdMessage: 'Failed to create add user job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read add user job ${jobId}`,
        missingJobMessage: (jobId) => `Add user job ${jobId} was not found after creation.`,
        failedJobMessage: 'Add user job failed.',
        timeoutMessage: MEMBER_EXTENSION_SYNC_TIMEOUT_ERROR,
      },
      supabase: client,
    })

    if (addUserJob.status !== 'done') {
      return {
        ok: true,
        newEndTime,
        warning: MEMBER_EXTENSION_SYNC_WARNING,
      }
    }
  } catch (syncError) {
    console.error('Failed to sync member extension access window:', syncError)

    return {
      ok: true,
      newEndTime,
      warning: MEMBER_EXTENSION_SYNC_WARNING,
    }
  }

  return {
    ok: true,
    newEndTime,
  }
}
