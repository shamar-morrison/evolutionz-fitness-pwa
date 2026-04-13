import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MEMBER_PAYMENT_REQUEST_SELECT,
  type MemberPaymentRequestRecord,
} from '@/lib/member-payment-request-records'
import { archiveResolvedRequestNotifications } from '@/lib/pt-notifications-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const reviewMemberPaymentRequestSchema = z
  .object({
    action: z.enum(['approve', 'deny']),
    rejectionReason: z.string().trim().min(1).nullable().optional(),
  })
  .strict()

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type MemberPaymentRequestReviewRow = MemberPaymentRequestRecord

type MemberPaymentRequestGuardedUpdateQuery = {
  eq(column: 'status', value: 'pending'): {
    eq(column: 'id', value: string): {
      select(columns: string): QueryResult<MemberPaymentRequestReviewRow[]>
    }
  }
}

type MemberPaymentRequestReviewClient = {
  from(table: 'member_payment_requests'): {
    select(columns: string): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<MemberPaymentRequestRecord>
      }
    }
    update(values: {
      status: 'approved' | 'denied'
      reviewed_by: string
      reviewed_at: string
      rejection_reason?: string | null
    }): MemberPaymentRequestGuardedUpdateQuery
  }
  from(table: 'members'): {
    select(columns: 'id, email, begin_time, end_time'): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<{
          id: string
          email: string | null
          begin_time: string | null
          end_time: string | null
        }>
      }
    }
  }
  from(table: string): unknown
  rpc(
    fn: 'approve_member_payment_request',
    args: {
      p_request_id: string
      p_reviewer_id: string
      p_review_timestamp: string
      p_membership_begin_time: string | null
      p_membership_end_time: string | null
    },
  ): PromiseLike<{
    data: string | null
    error: QueryError | null
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

function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
}

function getApprovalRpcErrorStatus(message: string) {
  if (message === 'Member payment request not found.' || message === 'Member not found.') {
    return 404
  }

  if (
    message === 'This request has already been reviewed.' ||
    message === 'Membership type is required to approve this payment request.'
  ) {
    return 400
  }

  return null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const requestBody = await request.json()
    const input = reviewMemberPaymentRequestSchema.parse(requestBody)
    const reviewTimestamp = new Date().toISOString()
    const supabase = getSupabaseAdminClient() as unknown as MemberPaymentRequestReviewClient

    if (input.action === 'deny') {
      const { data: existingRequest, error: existingRequestError } = await supabase
        .from('member_payment_requests')
        .select(MEMBER_PAYMENT_REQUEST_SELECT)
        .eq('id', id)
        .maybeSingle()

      if (existingRequestError) {
        throw new Error(
          `Failed to read member payment request ${id}: ${existingRequestError.message}`,
        )
      }

      if (!existingRequest) {
        return createErrorResponse('Member payment request not found.', 404)
      }

      if (existingRequest.status !== 'pending') {
        return createErrorResponse('This request has already been reviewed.', 400)
      }

      const { data: deniedRequests, error } = await supabase
        .from('member_payment_requests')
        .update({
          status: 'denied',
          reviewed_by: authResult.profile.id,
          reviewed_at: reviewTimestamp,
          rejection_reason: normalizeOptionalText(input.rejectionReason),
        })
        .eq('status', 'pending')
        .eq('id', id)
        .select(MEMBER_PAYMENT_REQUEST_SELECT)

      if (error) {
        throw new Error(`Failed to deny member payment request ${id}: ${error.message}`)
      }

      const deniedRequest = deniedRequests?.[0] ?? null

      if (!deniedRequest) {
        return createErrorResponse('This request has already been reviewed.', 400)
      }

      try {
        await archiveResolvedRequestNotifications(supabase, {
          requestId: deniedRequest.id,
          type: 'member_payment_request',
          archivedAt: reviewTimestamp,
        })
      } catch (archiveError) {
        console.error(
          'Failed to archive resolved member payment request notifications:',
          archiveError,
        )
      }

      return NextResponse.json({ ok: true })
    }

    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('member_payment_requests')
      .select(MEMBER_PAYMENT_REQUEST_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (existingRequestError) {
      throw new Error(
        `Failed to read member payment request ${id}: ${existingRequestError.message}`,
      )
    }

    if (!existingRequest) {
      return createErrorResponse('Member payment request not found.', 404)
    }

    if (existingRequest.status !== 'pending') {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    const { data: existingMember, error: existingMemberError } = await supabase
      .from('members')
      .select('id, email, begin_time, end_time')
      .eq('id', existingRequest.member_id)
      .maybeSingle()

    if (existingMemberError) {
      throw new Error(
        `Failed to read member ${existingRequest.member_id}: ${existingMemberError.message}`,
      )
    }

    if (!existingMember) {
      return createErrorResponse('Member not found.', 404)
    }

    if (!normalizeOptionalText(existingMember.email)) {
      return createErrorResponse(
        'Member email is required to approve this payment request.',
        400,
      )
    }

    const { data: paymentId, error: approvalError } = await supabase.rpc(
      'approve_member_payment_request',
      {
        p_request_id: id,
        p_reviewer_id: authResult.profile.id,
        p_review_timestamp: reviewTimestamp,
        p_membership_begin_time: existingMember.begin_time,
        p_membership_end_time: existingMember.end_time,
      },
    )

    if (approvalError) {
      const status = getApprovalRpcErrorStatus(approvalError.message)

      if (status !== null) {
        return createErrorResponse(approvalError.message, status)
      }

      throw new Error(
        `Failed to approve member payment request ${id}: ${approvalError.message}`,
      )
    }

    if (!paymentId) {
      throw new Error(
        `Failed to approve member payment request ${id}: missing payment id.`,
      )
    }

    try {
      await archiveResolvedRequestNotifications(supabase, {
        requestId: id,
        type: 'member_payment_request',
        archivedAt: reviewTimestamp,
      })
    } catch (archiveError) {
      console.error(
        'Failed to archive resolved member payment request notifications:',
        archiveError,
      )
    }

    return NextResponse.json({
      ok: true,
      paymentId,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    console.error('Unexpected error while reviewing member payment request:', error)

    return createErrorResponse(
      'Unexpected server error while reviewing the member payment request.',
      500,
    )
  }
}
