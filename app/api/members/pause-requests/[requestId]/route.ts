import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MEMBER_PAUSE_REQUEST_SELECT,
  type MemberPauseRequestRecord,
} from '@/lib/member-pause-request-records'
import {
  getMemberPauseCardSyncWarning,
  getMemberPauseReviewTimestamp,
  getMemberPauseRpcErrorStatus,
  maybeQueuePauseRevokeCard,
  type MemberPauseServerClient,
} from '@/lib/member-pause-server'
import { archiveResolvedRequestNotifications } from '@/lib/pt-notifications-server'
import { isSupportedMemberPauseDurationDays } from '@/lib/member-pause'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { reviewActionSchema } from '@/lib/validation-schemas'
import { readMemberWithCardCode } from '@/lib/members'

const reviewMemberPauseRequestSchema = reviewActionSchema.strict()

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type MemberPauseRequestReviewClient = MemberPauseServerClient & {
  from(table: 'member_pause_requests'): {
    select(columns: string): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<MemberPauseRequestRecord>
      }
    }
    update(values: {
      status: 'approved' | 'rejected'
      reviewed_by: string
      review_timestamp: string
    }): {
      eq(column: 'status', value: 'pending'): {
        eq(column: 'id', value: string): {
          select(columns: string): QueryResult<MemberPauseRequestRecord[]>
        }
      }
    }
  }
  rpc(
    fn: 'approve_member_pause_request',
    args: {
      p_request_id: string
      p_reviewer_id: string
      p_review_timestamp: string
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
    const input = reviewMemberPauseRequestSchema.parse(requestBody)
    const reviewTimestamp = getMemberPauseReviewTimestamp()
    const supabase = getSupabaseAdminClient() as unknown as MemberPauseRequestReviewClient
    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('member_pause_requests')
      .select(MEMBER_PAUSE_REQUEST_SELECT)
      .eq('id', requestId)
      .maybeSingle()

    if (existingRequestError) {
      throw new Error(
        `Failed to read member pause request ${requestId}: ${existingRequestError.message}`,
      )
    }

    if (!existingRequest) {
      return createErrorResponse('Member pause request not found.', 404)
    }

    if (existingRequest.status !== 'pending') {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    if (!isSupportedMemberPauseDurationDays(existingRequest.duration_days)) {
      return createErrorResponse('Duration must match a supported membership option.', 400)
    }

    if (input.action === 'reject') {
      const { data: rejectedRequests, error: rejectError } = await supabase
        .from('member_pause_requests')
        .update({
          status: 'rejected',
          reviewed_by: authResult.profile.id,
          review_timestamp: reviewTimestamp,
        })
        .eq('status', 'pending')
        .eq('id', requestId)
        .select(MEMBER_PAUSE_REQUEST_SELECT)

      if (rejectError) {
        throw new Error(
          `Failed to reject member pause request ${requestId}: ${rejectError.message}`,
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
        console.error('Failed to archive resolved member pause request notifications:', archiveError)
      }

      return NextResponse.json({
        ok: true,
        success: true,
      })
    }

    const { data: approvedRequestIdResult, error: approvalError } = await supabase.rpc(
      'approve_member_pause_request',
      {
        p_request_id: requestId,
        p_reviewer_id: authResult.profile.id,
        p_review_timestamp: reviewTimestamp,
      },
    )

    if (approvalError) {
      const status = getMemberPauseRpcErrorStatus(approvalError.message)

      if (status !== null) {
        return createErrorResponse(approvalError.message, status)
      }

      throw new Error(
        `Failed to approve member pause request ${requestId}: ${approvalError.message}`,
      )
    }

    const approvedRequestId = approvedRequestIdResult ?? existingRequest.id
    let warning: string | undefined

    try {
      const member = await readMemberWithCardCode(supabase, existingRequest.member_id)
      const revokeJob = await maybeQueuePauseRevokeCard(member, supabase)

      if (revokeJob && revokeJob.status !== 'done') {
        console.error(
          'Failed to sync revoke card job after approving member pause request:',
          revokeJob,
        )
        warning = getMemberPauseCardSyncWarning('pause', revokeJob.error)
      }
    } catch (revokeError) {
      console.error(
        'Failed to sync revoke card job after approving member pause request:',
        revokeError,
      )
      warning = getMemberPauseCardSyncWarning(
        'pause',
        revokeError instanceof Error ? revokeError.message : 'Unknown card sync error.',
      )
    }

    try {
      await archiveResolvedRequestNotifications(supabase, {
        requestId: approvedRequestId,
        type: 'member_pause_request',
        archivedAt: reviewTimestamp,
      })
    } catch (archiveError) {
      console.error('Failed to archive resolved member pause request notifications:', archiveError)
    }

    return NextResponse.json({
      ok: true,
      success: true,
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
        : 'Unexpected server error while reviewing the member pause request.',
      500,
    )
  }
}
