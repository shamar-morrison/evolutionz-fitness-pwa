import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MEMBER_PAUSE_RESUME_REQUEST_SELECT,
  type MemberPauseResumeRequestRecord,
} from '@/lib/member-pause-request-records'
import {
  getMemberPauseReviewTimestamp,
  getMemberPauseRpcErrorStatus,
  getMemberPauseTodayDate,
  maybeQueuePauseAddCard,
  type MemberPauseServerClient,
} from '@/lib/member-pause-server'
import { archiveResolvedRequestNotifications } from '@/lib/pt-notifications-server'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { readMemberWithCardCode } from '@/lib/members'

const reviewMemberPauseResumeRequestSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
  })
  .strict()

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type MemberPauseResumeRequestReviewClient = MemberPauseServerClient & {
  from(table: 'member_pause_resume_requests'): {
    select(columns: string): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<MemberPauseResumeRequestRecord>
      }
    }
    update(values: {
      status: 'approved' | 'rejected'
      reviewed_by: string
      review_timestamp: string
    }): {
      eq(column: 'status', value: 'pending'): {
        eq(column: 'id', value: string): {
          select(columns: string): QueryResult<MemberPauseResumeRequestRecord[]>
        }
      }
    }
  }
  rpc(
    fn: 'resume_member_pause',
    args: {
      p_pause_id: string
      p_actual_resume_date: string
      p_now: string
    },
  ): PromiseLike<{
    data: string | null
    error: { message: string } | null
  }>
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
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

    const { requestId } = await params
    const requestBody = await request.json()
    const input = reviewMemberPauseResumeRequestSchema.parse(requestBody)
    const reviewTimestamp = getMemberPauseReviewTimestamp()
    const supabase = getSupabaseAdminClient() as unknown as MemberPauseResumeRequestReviewClient
    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('member_pause_resume_requests')
      .select(MEMBER_PAUSE_RESUME_REQUEST_SELECT)
      .eq('id', requestId)
      .maybeSingle()

    if (existingRequestError) {
      throw new Error(
        `Failed to read early resume request ${requestId}: ${existingRequestError.message}`,
      )
    }

    if (!existingRequest) {
      return createErrorResponse('Early resume request not found.', 404)
    }

    if (existingRequest.status !== 'pending') {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    if (input.action === 'reject') {
      const { data: rejectedRequests, error: rejectError } = await supabase
        .from('member_pause_resume_requests')
        .update({
          status: 'rejected',
          reviewed_by: authResult.profile.id,
          review_timestamp: reviewTimestamp,
        })
        .eq('status', 'pending')
        .eq('id', requestId)
        .select(MEMBER_PAUSE_RESUME_REQUEST_SELECT)

      if (rejectError) {
        throw new Error(
          `Failed to reject early resume request ${requestId}: ${rejectError.message}`,
        )
      }

      const rejectedRequest = rejectedRequests?.[0] ?? null

      if (!rejectedRequest) {
        return createErrorResponse('This request has already been reviewed.', 400)
      }

      try {
        await archiveResolvedRequestNotifications(supabase, {
          requestId: rejectedRequest.id,
          type: 'member_pause_request',
          archivedAt: reviewTimestamp,
        })
      } catch (archiveError) {
        console.error('Failed to archive resolved early resume request notifications:', archiveError)
      }

      return NextResponse.json({
        ok: true,
        success: true,
      })
    }

    const actualResumeDate = getMemberPauseTodayDate()
    const { error: approvalError } = await supabase.rpc('resume_member_pause', {
      p_pause_id: existingRequest.pause_id,
      p_actual_resume_date: actualResumeDate,
      p_now: reviewTimestamp,
    })

    if (approvalError) {
      const status = getMemberPauseRpcErrorStatus(approvalError.message)

      if (status !== null) {
        return createErrorResponse(approvalError.message, status)
      }

      throw new Error(
        `Failed to approve early resume request ${requestId}: ${approvalError.message}`,
      )
    }

    const member = existingRequest.pause?.member_id
      ? await readMemberWithCardCode(supabase, existingRequest.pause.member_id)
      : null
    const addCardJob = await maybeQueuePauseAddCard(member, supabase)

    if (addCardJob && addCardJob.status !== 'done') {
      return createErrorResponse(addCardJob.error, addCardJob.httpStatus)
    }

    const { data: approvedRequests, error: approveUpdateError } = await supabase
      .from('member_pause_resume_requests')
      .update({
        status: 'approved',
        reviewed_by: authResult.profile.id,
        review_timestamp: reviewTimestamp,
      })
      .eq('status', 'pending')
      .eq('id', requestId)
      .select(MEMBER_PAUSE_RESUME_REQUEST_SELECT)

    if (approveUpdateError) {
      throw new Error(
        `Failed to mark early resume request ${requestId} approved: ${approveUpdateError.message}`,
      )
    }

    const approvedRequest = approvedRequests?.[0] ?? null

    if (!approvedRequest) {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    try {
      await archiveResolvedRequestNotifications(supabase, {
        requestId: approvedRequest.id,
        type: 'member_pause_request',
        archivedAt: reviewTimestamp,
      })
    } catch (archiveError) {
      console.error('Failed to archive resolved early resume request notifications:', archiveError)
    }

    return NextResponse.json({
      ok: true,
      success: true,
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
        : 'Unexpected server error while reviewing the early resume request.',
      500,
    )
  }
}
