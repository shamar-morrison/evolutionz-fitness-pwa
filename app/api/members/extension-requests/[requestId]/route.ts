import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MEMBER_EXTENSION_REQUEST_SELECT,
  type MemberExtensionRequestRecord,
} from '@/lib/member-extension-request-records'
import {
  prepareMemberExtension,
  type MemberExtensionServerClient,
  syncPreparedMemberExtensionAccessWindow,
} from '@/lib/member-extension-server'
import { MEMBER_EXTENSION_INACTIVE_ERROR } from '@/lib/member-extension'
import { archiveResolvedRequestNotifications } from '@/lib/pt-notifications-server'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const reviewMemberExtensionRequestSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
  })
  .strict()

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type MemberExtensionRequestReviewClient = MemberExtensionServerClient & {
  from(table: 'member_extension_requests'): {
    select(columns: string): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<MemberExtensionRequestRecord>
      }
    }
    update(values: {
      status: 'approved' | 'rejected'
      reviewed_by: string
      review_timestamp: string
    }): {
      eq(column: 'status', value: 'pending'): {
        eq(column: 'id', value: string): {
          select(columns: string): QueryResult<MemberExtensionRequestRecord[]>
        }
      }
    }
  }
  from(table: string): unknown
  rpc(
    fn: 'approve_member_extension_request',
    args: {
      p_request_id: string
      p_reviewer_id: string
      p_review_timestamp: string
      p_new_end_time: string
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

function getApprovalRpcErrorStatus(message: string) {
  if (
    message === 'Member extension request not found.' ||
    message === 'Member not found.'
  ) {
    return 404
  }

  if (
    message === 'This request has already been reviewed.' ||
    message === MEMBER_EXTENSION_INACTIVE_ERROR
  ) {
    return 400
  }

  return null
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

    if (!permissions.can('members.extendMembership')) {
      return createErrorResponse('Forbidden', 403)
    }

    const { requestId } = await params
    const requestBody = await request.json()
    const input = reviewMemberExtensionRequestSchema.parse(requestBody)
    const reviewTimestamp = new Date().toISOString()
    const supabase = getSupabaseAdminClient() as unknown as MemberExtensionRequestReviewClient
    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('member_extension_requests')
      .select(MEMBER_EXTENSION_REQUEST_SELECT)
      .eq('id', requestId)
      .maybeSingle()

    if (existingRequestError) {
      throw new Error(
        `Failed to read member extension request ${requestId}: ${existingRequestError.message}`,
      )
    }

    if (!existingRequest) {
      return createErrorResponse('Member extension request not found.', 404)
    }

    if (existingRequest.status !== 'pending') {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    if (input.action === 'reject') {
      const { data: rejectedRequests, error: rejectError } = await supabase
        .from('member_extension_requests')
        .update({
          status: 'rejected',
          reviewed_by: authResult.profile.id,
          review_timestamp: reviewTimestamp,
        })
        .eq('status', 'pending')
        .eq('id', requestId)
        .select(MEMBER_EXTENSION_REQUEST_SELECT)

      if (rejectError) {
        throw new Error(
          `Failed to reject member extension request ${requestId}: ${rejectError.message}`,
        )
      }

      const rejectedRequest = rejectedRequests?.[0] ?? null

      if (!rejectedRequest) {
        return createErrorResponse('This request has already been reviewed.', 400)
      }

      try {
        await archiveResolvedRequestNotifications(supabase, {
          requestId: rejectedRequest.id,
          type: 'member_extension_request',
          archivedAt: reviewTimestamp,
        })
      } catch (archiveError) {
        console.error(
          'Failed to archive resolved member extension request notifications:',
          archiveError,
        )
      }

      return NextResponse.json({
        ok: true,
        success: true,
      })
    }

    const preparedExtension = await prepareMemberExtension(
      existingRequest.member_id,
      existingRequest.duration_days,
      supabase,
    )

    if (!preparedExtension.ok) {
      return createErrorResponse(preparedExtension.error, preparedExtension.status)
    }

    const { data: approvedRequestId, error: approvalError } = await supabase.rpc(
      'approve_member_extension_request',
      {
        p_request_id: requestId,
        p_reviewer_id: authResult.profile.id,
        p_review_timestamp: reviewTimestamp,
        p_new_end_time: preparedExtension.extension.newEndTime,
      },
    )

    if (approvalError) {
      const status = getApprovalRpcErrorStatus(approvalError.message)

      if (status !== null) {
        return createErrorResponse(approvalError.message, status)
      }

      throw new Error(
        `Failed to approve member extension request ${requestId}: ${approvalError.message}`,
      )
    }

    if (!approvedRequestId) {
      throw new Error(
        `Failed to approve member extension request ${requestId}: missing request id.`,
      )
    }

    const { data: approvedRequest, error: approvedRequestError } = await supabase
      .from('member_extension_requests')
      .select(MEMBER_EXTENSION_REQUEST_SELECT)
      .eq('id', approvedRequestId)
      .maybeSingle()

    if (approvedRequestError) {
      throw new Error(
        `Failed to read approved member extension request ${approvedRequestId}: ${approvedRequestError.message}`,
      )
    }

    if (!approvedRequest) {
      throw new Error(
        `Failed to read approved member extension request ${approvedRequestId}: request not found.`,
      )
    }

    const result = await syncPreparedMemberExtensionAccessWindow(
      preparedExtension.extension,
      supabase,
    )

    try {
      await archiveResolvedRequestNotifications(supabase, {
        requestId: approvedRequest.id,
        type: 'member_extension_request',
        archivedAt: reviewTimestamp,
      })
    } catch (archiveError) {
      console.error(
        'Failed to archive resolved member extension request notifications:',
        archiveError,
      )
    }

    return NextResponse.json({
      ok: true,
      success: true,
      ...(result.warning ? { warning: result.warning } : {}),
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
        : 'Unexpected server error while reviewing the member extension request.',
      500,
    )
  }
}
