import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { MemberTypeRecord } from '@/types'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const updateMemberTypeRateSchema = z
  .object({
    monthly_rate: z.number().finite().positive(),
  })
  .strict()

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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const requestBody = await request.json()
    const input = updateMemberTypeRateSchema.parse(requestBody)

    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('member_types')
      .update({
        monthly_rate: input.monthly_rate,
      })
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to update membership type rate: ${error.message}`)
    }

    if (!data) {
      return createErrorResponse('Membership type not found.', 404)
    }

    return NextResponse.json({
      ok: true,
      memberType: data as MemberTypeRecord,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse('monthly_rate must be a positive number.', 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while updating membership type rate.',
      500,
    )
  }
}
