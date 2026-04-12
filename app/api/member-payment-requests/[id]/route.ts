import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MEMBER_PAYMENT_REQUEST_SELECT,
  type MemberPaymentRequestRecord,
} from '@/lib/member-payment-request-records'
import { archiveResolvedRequestNotifications } from '@/lib/pt-notifications-server'
import { buildMemberTypeUpdateValues } from '@/lib/member-type-sync'
import { type MemberTypesReadClient } from '@/lib/member-types-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { MemberPaymentMethod, MemberType } from '@/types'

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

type MemberPaymentRequestReviewClient = MemberTypesReadClient & {
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
    select(columns: 'id, type, member_type_id'): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<{
          id: string
          type: MemberType
          member_type_id: string | null
        }>
      }
    }
    update(values: {
      member_type_id: string | null
      type: MemberType
    }): {
      eq(column: 'id', value: string): {
        select(columns: 'id'): {
          maybeSingle(): QueryResult<{
            id: string
          }>
        }
      }
    }
  }
  from(table: 'member_payments'): {
    insert(values: {
      member_id: string
      member_type_id: string
      payment_method: MemberPaymentMethod
      amount_paid: number
      promotion: null
      recorded_by: string
      payment_date: string
      notes: string | null
    }): {
      select(columns: '*'): {
        maybeSingle(): QueryResult<{
          id: string
        }>
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

function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
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

    const { data: approvedRequests, error: requestUpdateError } = await supabase
      .from('member_payment_requests')
      .update({
        status: 'approved',
        reviewed_by: authResult.profile.id,
        reviewed_at: reviewTimestamp,
      })
      .eq('status', 'pending')
      .eq('id', id)
      .select(MEMBER_PAYMENT_REQUEST_SELECT)

    if (requestUpdateError) {
      throw new Error(
        `Failed to approve member payment request ${id}: ${requestUpdateError.message}`,
      )
    }

    const approvedRequest = approvedRequests?.[0] ?? null

    if (!approvedRequest) {
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

      return createErrorResponse('This request has already been reviewed.', 400)
    }

    const { data: existingMember, error: existingMemberError } = await supabase
      .from('members')
      .select('id, type, member_type_id')
      .eq('id', approvedRequest.member_id)
      .maybeSingle()

    if (existingMemberError) {
      throw new Error(
        `Failed to read member ${approvedRequest.member_id}: ${existingMemberError.message}`,
      )
    }

    if (!existingMember) {
      return createErrorResponse('Member not found.', 404)
    }

    let finalMemberTypeId = approvedRequest.member_type_id ?? existingMember.member_type_id

    if (!finalMemberTypeId) {
      return createErrorResponse(
        'Membership type is required to approve this payment request.',
        400,
      )
    }

    if (
      approvedRequest.member_type_id &&
      approvedRequest.member_type_id !== existingMember.member_type_id
    ) {
      const updateValues = await buildMemberTypeUpdateValues(
        supabase,
        approvedRequest.member_type_id,
        existingMember.type,
      )
      finalMemberTypeId = updateValues.member_type_id ?? approvedRequest.member_type_id
      const nextMemberType = (updateValues.type ?? existingMember.type) as MemberType
      const { error: updateError } = await supabase
        .from('members')
        .update({
          member_type_id: finalMemberTypeId,
          type: nextMemberType,
        })
        .eq('id', approvedRequest.member_id)
        .select('id')
        .maybeSingle()

      if (updateError) {
        throw new Error(
          `Failed to update member ${approvedRequest.member_id}: ${updateError.message}`,
        )
      }
    }

    const { error: paymentInsertError } = await supabase
      .from('member_payments')
      .insert({
        member_id: approvedRequest.member_id,
        member_type_id: finalMemberTypeId,
        payment_method: approvedRequest.payment_method,
        amount_paid: approvedRequest.amount,
        promotion: null,
        recorded_by: authResult.profile.id,
        payment_date: approvedRequest.payment_date,
        notes: normalizeOptionalText(approvedRequest.notes),
      })
      .select('*')
      .maybeSingle()

    if (paymentInsertError) {
      throw new Error(
        `Failed to record approved member payment request ${id}: ${paymentInsertError.message}`,
      )
    }

    try {
      await archiveResolvedRequestNotifications(supabase, {
        requestId: approvedRequest.id,
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
