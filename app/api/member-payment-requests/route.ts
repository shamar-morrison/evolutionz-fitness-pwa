import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MEMBER_PAYMENT_REQUEST_SELECT,
  mapMemberPaymentRequestRecord,
  type MemberPaymentRequestRecord,
} from '@/lib/member-payment-request-records'
import { requireAdminUser, requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { MemberPaymentMethod } from '@/types'

const createMemberPaymentRequestSchema = z
  .object({
    member_id: z.string().trim().uuid('Member is required.'),
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

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

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
      payment_method: MemberPaymentMethod
      payment_date: string
      member_type_id?: string
      notes?: string | null
    }): {
      select(columns: string): {
        single(): QueryResult<MemberPaymentRequestRecord>
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
    const { data, error } = await supabase
      .from('member_payment_requests')
      .insert({
        member_id: input.member_id,
        requested_by: authResult.user.id,
        status: 'pending',
        amount: input.amount,
        payment_method: input.payment_method,
        payment_date: input.payment_date,
        ...(input.member_type_id ? { member_type_id: input.member_type_id } : {}),
        ...(input.notes !== undefined ? { notes: normalizeOptionalText(input.notes) } : {}),
      })
      .select(MEMBER_PAYMENT_REQUEST_SELECT)
      .single()

    if (error) {
      throw new Error(`Failed to create member payment request: ${error.message}`)
    }

    return NextResponse.json({
      ok: true,
      request: mapMemberPaymentRequestRecord(data as MemberPaymentRequestRecord),
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
