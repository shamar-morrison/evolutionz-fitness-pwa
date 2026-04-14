import { NextResponse } from 'next/server'
import { z } from 'zod'
import { CARD_FEE_AMOUNT_JMD } from '@/lib/business-constants'
import {
  MEMBER_PAYMENT_REQUEST_SELECT,
  mapMemberPaymentRequestRecord,
  type MemberPaymentRequestRecord,
} from '@/lib/member-payment-request-records'
import {
  insertNotifications,
  readAdminNotificationRecipients,
} from '@/lib/pt-notifications-server'
import { requireAdminUser, requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type {
  MemberPaymentMethod,
  MemberPaymentType,
} from '@/types'

const membershipPaymentRequestSchema = z
  .object({
    member_id: z.string().trim().uuid('Member is required.'),
    payment_type: z.literal('membership'),
    amount: z.number().finite().positive('Amount must be greater than 0.'),
    payment_method: z.enum(['cash', 'fygaro', 'bank_transfer', 'point_of_sale']),
    payment_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must be in YYYY-MM-DD format.'),
    member_type_id: z.string().trim().uuid('Membership type must be valid.').optional(),
    notes: z.string().trim().min(1).nullable().optional(),
  })
  .strict()

const cardFeePaymentRequestSchema = z
  .object({
    member_id: z.string().trim().uuid('Member is required.'),
    payment_type: z.literal('card_fee'),
    payment_method: z.enum(['cash', 'fygaro', 'bank_transfer', 'point_of_sale']),
    payment_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must be in YYYY-MM-DD format.'),
    notes: z.string().trim().min(1).nullable().optional(),
  })
  .strict()

const createMemberPaymentRequestSchema = z.discriminatedUnion('payment_type', [
  membershipPaymentRequestSchema,
  cardFeePaymentRequestSchema,
])

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type MemberPaymentRequestMemberRow = {
  id: string
  member_type_id: string | null
  email: string | null
}

type MemberPaymentRequestsRouteClient = {
  from(table: 'member_payment_requests'): {
    select(columns: string): {
      eq(column: 'status', value: 'pending'): {
        order(
          column: 'created_at',
          options: {
            ascending: boolean
          },
        ): QueryResult<MemberPaymentRequestRecord[]>
      }
    }
    insert(values: {
      member_id: string
      requested_by: string
      status: 'pending'
      amount: number
      payment_type: MemberPaymentType
      payment_method: MemberPaymentMethod
      payment_date: string
      member_type_id: string | null
      notes?: string | null
    }): {
      select(columns: string): {
        single(): QueryResult<MemberPaymentRequestRecord>
      }
    }
  }
  from(table: 'members'): {
    select(columns: 'id, member_type_id, email'): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<MemberPaymentRequestMemberRow>
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

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient() as unknown as MemberPaymentRequestsRouteClient
    const { data, error } = await supabase
      .from('member_payment_requests')
      .select(MEMBER_PAYMENT_REQUEST_SELECT)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to read member payment requests: ${error.message}`)
    }

    return NextResponse.json({
      ok: true,
      requests: ((data ?? []) as MemberPaymentRequestRecord[]).map(mapMemberPaymentRequestRecord),
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading member payment requests.',
      500,
    )
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = createMemberPaymentRequestSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as MemberPaymentRequestsRouteClient
    const { data: existingMember, error: existingMemberError } = await supabase
      .from('members')
      .select('id, member_type_id, email')
      .eq('id', input.member_id)
      .maybeSingle()

    if (existingMemberError) {
      throw new Error(`Failed to read member ${input.member_id}: ${existingMemberError.message}`)
    }

    if (!existingMember) {
      return createErrorResponse('Member not found.', 404)
    }

    if (!existingMember.email?.trim()) {
      return createErrorResponse(
        'Add an email address to the member profile before submitting a payment.',
        400,
      )
    }

    const effectiveMemberTypeId =
      input.payment_type === 'membership'
        ? input.member_type_id ?? existingMember.member_type_id
        : null

    if (input.payment_type === 'membership' && !effectiveMemberTypeId) {
      return createErrorResponse('Membership type is required for this payment request.', 400)
    }

    const { data, error } = await supabase
      .from('member_payment_requests')
      .insert({
        member_id: input.member_id,
        requested_by: authResult.user.id,
        status: 'pending',
        amount:
          input.payment_type === 'membership'
            ? input.amount
            : CARD_FEE_AMOUNT_JMD,
        payment_type: input.payment_type,
        payment_method: input.payment_method,
        payment_date: input.payment_date,
        member_type_id: effectiveMemberTypeId,
        ...(input.notes !== undefined ? { notes: normalizeOptionalText(input.notes) } : {}),
      })
      .select(MEMBER_PAYMENT_REQUEST_SELECT)
      .single()

    if (error) {
      throw new Error(`Failed to create member payment request: ${error.message}`)
    }

    const requestRecord = data as MemberPaymentRequestRecord
    try {
      const adminRecipients = await readAdminNotificationRecipients(supabase)
      const memberName = requestRecord.member?.name?.trim() || 'this member'
      const requestedBy = requestRecord.requestedByProfile?.name?.trim() || 'A staff member'

      await insertNotifications(
        supabase,
        adminRecipients.map((recipient) => ({
          recipientId: recipient.id,
          type: 'member_payment_request',
          title: 'Member Payment Request',
          body: `New payment request from ${requestedBy} for ${memberName}.`,
          metadata: {
            requestId: requestRecord.id,
            memberId: requestRecord.member_id,
            memberName,
            requestedBy,
            amount: requestRecord.amount,
            paymentMethod: requestRecord.payment_method,
            paymentType: requestRecord.payment_type,
          },
        })),
      )
    } catch (notificationError) {
      console.error(
        'Failed to send member payment request notifications:',
        notificationError,
      )
    }

    return NextResponse.json({
      ok: true,
      request: mapMemberPaymentRequestRecord(requestRecord),
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
        : 'Unexpected server error while creating the member payment request.',
      500,
    )
  }
}
