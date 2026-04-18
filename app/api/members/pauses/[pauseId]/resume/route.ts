import { NextResponse } from 'next/server'
import {
  getMemberPauseReviewTimestamp,
  getMemberPauseRpcErrorStatus,
  getMemberPauseTodayDate,
  maybeQueuePauseAddCard,
  type MemberPauseServerClient,
} from '@/lib/member-pause-server'
import { readActivePauseById } from '@/lib/member-pause-records'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { readMemberWithCardCode } from '@/lib/members'

type RpcResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type MemberPauseResumeClient = MemberPauseServerClient & {
  rpc(
    fn: 'resume_member_pause',
    args: {
      p_pause_id: string
      p_actual_resume_date: string
      p_now: string
    },
  ): RpcResult<string>
}

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ pauseId: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const permissions = resolvePermissionsForProfile(authResult.profile)

    if (!permissions.can('members.pauseMembership')) {
      return createErrorResponse('Forbidden', 403)
    }

    const { pauseId } = await params
    const supabase = getSupabaseAdminClient() as unknown as MemberPauseResumeClient
    const activePause = await readActivePauseById(supabase, pauseId)

    if (!activePause) {
      return createErrorResponse('Active pause not found.', 404)
    }

    const actualResumeDate = getMemberPauseTodayDate()
    const now = getMemberPauseReviewTimestamp()
    const { data: newEndTime, error } = await supabase.rpc('resume_member_pause', {
      p_pause_id: pauseId,
      p_actual_resume_date: actualResumeDate,
      p_now: now,
    })

    if (error) {
      const status = getMemberPauseRpcErrorStatus(error.message)

      if (status !== null) {
        return createErrorResponse(error.message, status)
      }

      throw new Error(`Failed to resume member pause: ${error.message}`)
    }

    const member = await readMemberWithCardCode(supabase, activePause.member_id)
    const addCardJob = await maybeQueuePauseAddCard(member, supabase)

    if (addCardJob && addCardJob.status !== 'done') {
      return createErrorResponse(addCardJob.error, addCardJob.httpStatus)
    }

    return NextResponse.json({
      ok: true,
      new_end_time: newEndTime,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while resuming the member pause.',
      500,
    )
  }
}
