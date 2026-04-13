import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  mapMemberPaymentRecord,
  MEMBER_PAYMENT_RECORD_SELECT,
  type MemberPaymentRecord,
} from '@/lib/member-payment-records'
import { buildMemberTypeUpdateValues } from '@/lib/member-type-sync'
import { MEMBER_PAYMENTS_PAGE_SIZE } from '@/lib/member-payments'
import { type MemberTypesReadClient } from '@/lib/member-types-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { MemberType } from '@/types'

const createMemberPaymentSchema = z
  .object({
    member_type_id: z.string().trim().uuid('Membership type is required.'),
    payment_method: z.enum(['cash', 'fygaro', 'bank_transfer', 'point_of_sale']),
    amount_paid: z.number().finite().min(0),
    promotion: z.string().trim().min(1).nullable().optional(),
    payment_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must be in YYYY-MM-DD format.'),
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

type CountQueryResult = PromiseLike<{
  count: number | null
  error: QueryError | null
}>

type MemberPaymentsGetRouteClient = {
  from(table: 'members'): {
    select(columns: 'id', options: { count: 'exact'; head: true }): {
      eq(column: 'id', value: string): CountQueryResult
    }
  }
  from(table: 'member_payments'): {
    select(columns: 'id', options: { count: 'exact'; head: true }): {
      eq(column: 'member_id', value: string): CountQueryResult
    }
    select(columns: string, options: { count: 'exact' }): {
      eq(column: 'member_id', value: string): {
        order(column: 'payment_date', options: { ascending: boolean }): {
          order(column: 'created_at', options: { ascending: boolean }): {
            order(column: 'id', options: { ascending: boolean }): {
              range(from: number, to: number): PromiseLike<{
                data: MemberPaymentRecord[] | null
                error: QueryError | null
                count: number | null
              }>
            }
          }
        }
      }
    }
  }
}

type MemberPaymentsRouteClient = MemberTypesReadClient & {
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
      payment_method: 'cash' | 'fygaro' | 'bank_transfer' | 'point_of_sale'
      amount_paid: number
      promotion: string | null
      recorded_by: string
      payment_date: string
      notes: string | null
    }): {
      select(columns: '*'): {
        maybeSingle(): QueryResult<{
          id: string
          member_id: string
          member_type_id: string
          payment_method: 'cash' | 'fygaro' | 'bank_transfer' | 'point_of_sale'
          amount_paid: number
          promotion: string | null
          recorded_by: string | null
          payment_date: string
          notes: string | null
          created_at: string
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

function parseNonNegativeInteger(value: string | null, fallback: number) {
  if (value === null) {
    return fallback
  }

  if (!/^\d+$/u.test(value)) {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
    return null
  }

  return parsedValue
}

const MAX_LIMIT = MEMBER_PAYMENTS_PAGE_SIZE

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const supabase = getSupabaseAdminClient() as unknown as MemberPaymentsGetRouteClient
    const { searchParams } = new URL(request.url)
    const page = parseNonNegativeInteger(searchParams.get('page'), 0)
    const limit = parseNonNegativeInteger(searchParams.get('limit'), MEMBER_PAYMENTS_PAGE_SIZE)

    if (page === null || limit === null) {
      return createErrorResponse('page and limit must be non-negative integers.', 400)
    }

    const clampedLimit = Math.min(limit, MAX_LIMIT)

    if (clampedLimit !== 0) {
      const maxSafePage = Math.floor(
        (Number.MAX_SAFE_INTEGER - (clampedLimit - 1)) / clampedLimit,
      )

      if (page > maxSafePage) {
        return createErrorResponse('Requested member payments page is too large.', 400)
      }
    }

    const { count: memberCount, error: memberError } = await supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)

    if (memberError) {
      throw new Error(`Failed to read member ${id}: ${memberError.message}`)
    }

    if ((memberCount ?? 0) === 0) {
      return createErrorResponse('Member not found.', 404)
    }

    if (clampedLimit === 0) {
      const { count, error } = await supabase
        .from('member_payments')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', id)

      if (error) {
        throw new Error(`Failed to read member payments for ${id}: ${error.message}`)
      }

      return NextResponse.json({
        payments: [],
        totalMatches: count ?? 0,
      })
    }

    const rangeStart = page * clampedLimit
    const rangeEnd = rangeStart + clampedLimit - 1
    const { data, error, count } = await supabase
      .from('member_payments')
      .select(MEMBER_PAYMENT_RECORD_SELECT, { count: 'exact' })
      .eq('member_id', id)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(rangeStart, rangeEnd)

    if (error) {
      throw new Error(`Failed to read member payments for ${id}: ${error.message}`)
    }

    return NextResponse.json({
      payments: ((data ?? []) as MemberPaymentRecord[]).map(mapMemberPaymentRecord),
      totalMatches: count ?? 0,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading the member payments.',
      500,
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient() as unknown as MemberPaymentsRouteClient
    const { id } = await params
    const requestBody = await request.json()
    const input = createMemberPaymentSchema.parse(requestBody)
    const { data: existingMember, error: existingMemberError } = await supabase
      .from('members')
      .select('id, type, member_type_id')
      .eq('id', id)
      .maybeSingle()

    if (existingMemberError) {
      throw new Error(`Failed to read member ${id}: ${existingMemberError.message}`)
    }

    if (!existingMember) {
      return createErrorResponse('Member not found.', 404)
    }

    if (existingMember.member_type_id !== input.member_type_id) {
      const updateValues = await buildMemberTypeUpdateValues(
        supabase,
        input.member_type_id,
        existingMember.type,
      )
      const nextMemberTypeId = updateValues.member_type_id ?? input.member_type_id
      const nextMemberType = updateValues.type ?? existingMember.type
      const { error: updateError } = await supabase
        .from('members')
        .update({
          member_type_id: nextMemberTypeId,
          type: nextMemberType,
        })
        .eq('id', id)
        .select('id')
        .maybeSingle()

      if (updateError) {
        throw new Error(`Failed to update member ${id}: ${updateError.message}`)
      }
    }

    const { data, error } = await supabase
      .from('member_payments')
      .insert({
        member_id: id,
        member_type_id: input.member_type_id,
        payment_method: input.payment_method,
        amount_paid: input.amount_paid,
        promotion: normalizeOptionalText(input.promotion),
        recorded_by: authResult.profile.id,
        payment_date: input.payment_date,
        notes: normalizeOptionalText(input.notes),
      })
      .select('*')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to record the member payment: ${error.message}`)
    }

    if (!data) {
      throw new Error('Failed to record the member payment: missing inserted row.')
    }

    return NextResponse.json({
      ok: true,
      payment: data,
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
        : 'Unexpected server error while recording the member payment.',
      500,
    )
  }
}
