import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
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

const pauseMemberMembershipSchema = z
  .object({
    duration_days: z.number().int().positive('Duration is required.'),
  })
  .strict()

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

    const revokeJob = await maybeQueuePauseRevokeCard(eligibility.member, supabase)

    if (revokeJob && revokeJob.status !== 'done') {
      return createErrorResponse(revokeJob.error, revokeJob.httpStatus)
    }

    return NextResponse.json({
      ok: true,
      pause_id: pauseId,
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
