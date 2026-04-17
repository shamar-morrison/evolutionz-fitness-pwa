import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MEMBER_EXTENSION_REQUEST_SELECT,
  type MemberExtensionRequestRecord,
} from '@/lib/member-extension-request-records'
import {
  applyPreparedMemberExtension,
  prepareMemberExtension,
  type MemberExtensionServerClient,
} from '@/lib/member-extension-server'
import { archiveResolvedRequestNotifications } from '@/lib/pt-notifications-server'
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

    const { data: approvedRequests, error: approveError } = await supabase
      .from('member_extension_requests')
      .update({
        status: 'approved',
        reviewed_by: authResult.profile.id,
        review_timestamp: reviewTimestamp,
      })
      .eq('status', 'pending')
      .eq('id', requestId)
      .select(MEMBER_EXTENSION_REQUEST_SELECT)

    if (approveError) {
      throw new Error(
        `Failed to approve member extension request ${requestId}: ${approveError.message}`,
      )
    }

    const approvedRequest = approvedRequests?.[0] ?? null

    if (!approvedRequest) {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    const result = await applyPreparedMemberExtension(preparedExtension.extension, supabase)

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
