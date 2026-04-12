import { NextResponse } from 'next/server'
import { z } from 'zod'
import { buildMemberTypeUpdateValues } from '@/lib/member-type-sync'
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
