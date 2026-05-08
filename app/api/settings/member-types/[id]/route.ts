import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import type { MemberTypeRecord } from '@/types'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const updateMemberTypeSchema = z
  .object({
    monthly_rate: z.number().finite().positive(),
    requires_card: z.boolean().optional(),
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

function getMemberTypeValidationError(error: ZodError) {
  const hasUnrecognizedFieldError = error.issues.some((issue) => issue.path.length === 0)
  const hasMonthlyRateError = error.issues.some((issue) => issue.path[0] === 'monthly_rate')
  const hasRequiresCardError = error.issues.some((issue) => issue.path[0] === 'requires_card')

  if (hasUnrecognizedFieldError) {
    return 'Request contains unrecognized fields.'
  }

  if (hasMonthlyRateError && hasRequiresCardError) {
    return 'monthly_rate must be a positive number and requires_card must be a boolean.'
  }

  if (hasRequiresCardError) {
    return 'requires_card must be a boolean.'
  }

  return 'monthly_rate must be a positive number.'
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
    const input = updateMemberTypeSchema.parse(requestBody)
    const updateValues =
      input.requires_card === undefined
        ? {
            monthly_rate: input.monthly_rate,
          }
        : {
            monthly_rate: input.monthly_rate,
            requires_card: input.requires_card,
          }

    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('member_types')
      .update(updateValues)
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

    if (error instanceof ZodError) {
      return createErrorResponse(getMemberTypeValidationError(error), 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while updating the membership type.',
      500,
    )
  }
}
