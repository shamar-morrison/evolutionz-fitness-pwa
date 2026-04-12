import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MEMBER_PAYMENT_REQUEST_SELECT,
  type MemberPaymentRequestRecord,
} from '@/lib/member-payment-request-records'
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
    }): {
      eq(column: 'id', value: string): QueryResult<null>
    }
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

    if (input.action === 'deny') {
      const { error } = await supabase
        .from('member_payment_requests')
        .update({
          status: 'denied',
          reviewed_by: authResult.profile.id,
          reviewed_at: reviewTimestamp,
          rejection_reason: normalizeOptionalText(input.rejectionReason),
        })
        .eq('id', id)

      if (error) {
        throw new Error(`Failed to deny member payment request ${id}: ${error.message}`)
      }

      return NextResponse.json({ ok: true })
    }

    const { data: existingMember, error: existingMemberError } = await supabase
      .from('members')
      .select('id, type, member_type_id')
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

    const effectiveMemberTypeId = existingRequest.member_type_id ?? existingMember.member_type_id

    if (!effectiveMemberTypeId) {
      return createErrorResponse(
        'Membership type is required to approve this payment request.',
        400,
      )
    }

    if (
      existingRequest.member_type_id &&
      existingRequest.member_type_id !== existingMember.member_type_id
    ) {
      const updateValues = await buildMemberTypeUpdateValues(
        supabase,
        existingRequest.member_type_id,
        existingMember.type,
      )
      const nextMemberTypeId = updateValues.member_type_id ?? existingRequest.member_type_id
      const nextMemberType = (updateValues.type ?? existingMember.type) as MemberType
      const { error: updateError } = await supabase
        .from('members')
        .update({
          member_type_id: nextMemberTypeId,
          type: nextMemberType,
        })
        .eq('id', existingRequest.member_id)
        .select('id')
        .maybeSingle()

      if (updateError) {
        throw new Error(
          `Failed to update member ${existingRequest.member_id}: ${updateError.message}`,
        )
      }
    }

    const { error: paymentInsertError } = await supabase
      .from('member_payments')
      .insert({
        member_id: existingRequest.member_id,
        member_type_id: effectiveMemberTypeId,
        payment_method: existingRequest.payment_method,
        amount_paid: existingRequest.amount,
        promotion: null,
        recorded_by: authResult.profile.id,
        payment_date: existingRequest.payment_date,
        notes: normalizeOptionalText(existingRequest.notes),
      })
      .select('*')
      .maybeSingle()

    if (paymentInsertError) {
      throw new Error(
        `Failed to record approved member payment request ${id}: ${paymentInsertError.message}`,
      )
    }

    const { error: requestUpdateError } = await supabase
      .from('member_payment_requests')
      .update({
        status: 'approved',
        reviewed_by: authResult.profile.id,
        reviewed_at: reviewTimestamp,
      })
      .eq('id', id)

    if (requestUpdateError) {
      throw new Error(
        `Failed to approve member payment request ${id}: ${requestUpdateError.message}`,
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

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while reviewing the member payment request.',
      500,
    )
  }
}
