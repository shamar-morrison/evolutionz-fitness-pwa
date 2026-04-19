import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getMemberPauseEligibilityError,
  getMemberPauseRequestNotificationTitle,
  type MemberPauseServerClient,
} from '@/lib/member-pause-server'
import {
  MEMBER_PAUSE_REQUEST_PENDING_ERROR,
  isSupportedMemberPauseDurationDays,
  calculatePlannedPauseResumeDate,
} from '@/lib/member-pause'
import { notifyAdminsOfRequest } from '@/lib/notify-admins-of-request'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase/server'
import { durationDaysSchema } from '@/lib/validation-schemas'

const createMemberPauseRequestSchema = z.object({
  duration_days: durationDaysSchema,
}).strict()

const SUSPENDED_ACCOUNT_ERROR =
  'Your account has been suspended. Please contact an administrator.'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error:
    | {
        message: string
        code?: string | null
        details?: string | null
      }
    | null
}>

type MemberPauseRequestInsertClient = MemberPauseServerClient & {
  from(table: 'member_pause_requests'): {
    insert(values: {
      member_id: string
      requested_by: string
      duration_days: number
      status: 'pending'
    }): {
      select(columns: string): {
        single(): QueryResult<{ id: string }>
      }
    }
  }
  from(table: string): unknown
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

function isPendingPauseRequestConflict(error: { code?: string | null; details?: string | null }) {
  return (
    error.code === '23505' ||
    error.details?.includes('member_pause_requests_pending_member_idx') === true
  )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const requestBody = await request.json()
    const input = createMemberPauseRequestSchema.parse(requestBody)

    if (!isSupportedMemberPauseDurationDays(input.duration_days)) {
      return createErrorResponse('Duration must match a supported membership option.', 400)
    }

    const profile = await readStaffProfile(await createClient(), authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    if (profile.isSuspended) {
      return createErrorResponse(SUSPENDED_ACCOUNT_ERROR, 403)
    }

    const permissions = resolvePermissionsForProfile(profile)

    if (!permissions.can('members.pauseMembership')) {
      return createErrorResponse('Forbidden', 403)
    }

    if (permissions.role === 'admin') {
      return createErrorResponse('Admins should pause memberships directly.', 403)
    }

    const supabase = getSupabaseAdminClient() as unknown as MemberPauseRequestInsertClient
    const eligibility = await getMemberPauseEligibilityError(supabase, id)

    if (eligibility.error) {
      return createErrorResponse(eligibility.error, eligibility.status)
    }

    const { data, error } = await supabase
      .from('member_pause_requests')
      .insert({
        member_id: id,
        requested_by: authResult.user.id,
        duration_days: input.duration_days,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      if (isPendingPauseRequestConflict(error)) {
        return createErrorResponse(MEMBER_PAUSE_REQUEST_PENDING_ERROR, 400)
      }

      throw new Error(`Failed to create member pause request: ${error.message}`)
    }

    const plannedResumeDate = calculatePlannedPauseResumeDate(input.duration_days)
    const requestId = data?.id

    if (!requestId) {
      throw new Error('Failed to create member pause request: missing request id.')
    }

    const memberName = eligibility.member?.name?.trim() || 'this member'
    const requestedBy = profile.name?.trim() || 'A staff member'
    const title = getMemberPauseRequestNotificationTitle('pause')

    await notifyAdminsOfRequest(supabase, {
      type: 'member_pause_request',
      title,
      body: `New membership pause request from ${requestedBy} for ${memberName}.`,
      url: '/pending-approvals/pause-requests',
      metadata: {
        requestId,
        requestKind: 'pause',
        memberId: id,
        memberName,
        requestedBy,
        durationDays: input.duration_days,
        plannedResumeDate,
      },
      pushBody: 'A staff member submitted a membership pause request.',
      logMessage: 'Failed to send member pause request notifications:',
    })

    return NextResponse.json({
      ok: true,
      id: requestId,
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
        : 'Unexpected server error while creating the member pause request.',
      500,
    )
  }
}
