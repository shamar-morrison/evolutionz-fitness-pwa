import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getMemberPauseCardSyncWarning,
  getMemberPauseEligibilityError,
  getMemberPauseReviewTimestamp,
  getMemberPauseRpcErrorStatus,
  maybeQueuePauseRevokeCard,
  type MemberPauseServerClient,
} from '@/lib/member-pause-server'
import { isSupportedMemberPauseDurationDays } from '@/lib/member-pause'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { durationDaysSchema } from '@/lib/validation-schemas'

const pauseMemberMembershipSchema = z.object({
  duration_days: durationDaysSchema,
}).strict()

type RpcResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type MemberPauseDirectClient = MemberPauseServerClient & {
  rpc(
    fn: 'apply_member_pause',
    args: {
      p_member_id: string
      p_duration_days: number
      p_applied_by: string
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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params
    const requestBody = await request.json()
    const input = pauseMemberMembershipSchema.parse(requestBody)

    if (!isSupportedMemberPauseDurationDays(input.duration_days)) {
      return createErrorResponse('Duration must match a supported membership option.', 400)
    }

    const supabase = getSupabaseAdminClient() as unknown as MemberPauseDirectClient
    const eligibility = await getMemberPauseEligibilityError(supabase, id)

    if (eligibility.error) {
      return createErrorResponse(eligibility.error, eligibility.status)
    }

    const now = getMemberPauseReviewTimestamp()
    const { data: pauseId, error } = await supabase.rpc('apply_member_pause', {
      p_member_id: id,
      p_duration_days: input.duration_days,
      p_applied_by: authResult.profile.id,
      p_now: now,
    })

    if (error) {
      const status = getMemberPauseRpcErrorStatus(error.message)

      if (status !== null) {
        return createErrorResponse(error.message, status)
      }

      throw new Error(`Failed to apply member pause: ${error.message}`)
    }

    let warning: string | undefined

    try {
      const revokeJob = await maybeQueuePauseRevokeCard(eligibility.member, supabase)

      if (revokeJob && revokeJob.status !== 'done') {
        console.error('Failed to sync revoke card job after applying member pause:', revokeJob)
        warning = getMemberPauseCardSyncWarning('pause', revokeJob.error)
      }
    } catch (revokeError) {
      console.error('Failed to sync revoke card job after applying member pause:', revokeError)
      warning = getMemberPauseCardSyncWarning(
        'pause',
        revokeError instanceof Error ? revokeError.message : 'Unknown card sync error.',
      )
    }

    return NextResponse.json({
      ok: true,
      pause_id: pauseId,
      ...(warning ? { warning } : {}),
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while pausing the membership.',
      500,
    )
  }
}
