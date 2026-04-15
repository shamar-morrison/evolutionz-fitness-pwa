import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readClassById } from '@/lib/classes-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const updateClassSettingsSchema = z
  .object({
    monthly_fee: z
      .number({
        required_error: 'monthly_fee must be a positive number.',
        invalid_type_error: 'monthly_fee must be a positive number.',
      })
      .finite('monthly_fee must be a positive number.')
      .positive('monthly_fee must be a positive number.'),
    per_session_fee: z
      .number({
        required_error: 'per_session_fee must be a positive number or null.',
        invalid_type_error: 'per_session_fee must be a positive number or null.',
      })
      .finite('per_session_fee must be a positive number or null.')
      .positive('per_session_fee must be a positive number or null.')
      .nullable(),
    trainer_compensation_percent: z
      .number({
        required_error: 'trainer_compensation_percent must be between 0 and 100.',
        invalid_type_error: 'trainer_compensation_percent must be between 0 and 100.',
      })
      .finite('trainer_compensation_percent must be between 0 and 100.')
      .min(0, 'trainer_compensation_percent must be between 0 and 100.')
      .max(100, 'trainer_compensation_percent must be between 0 and 100.'),
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
    const input = updateClassSettingsSchema.parse(requestBody)

    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('classes')
      .update({
        monthly_fee: input.monthly_fee,
        per_session_fee: input.per_session_fee,
        trainer_compensation_pct: input.trainer_compensation_percent,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to update class settings: ${error.message}`)
    }

    if (!data) {
      return createErrorResponse('Class not found.', 404)
    }

    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    return NextResponse.json({
      ok: true,
      class: classItem,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof z.ZodError) {
      return createErrorResponse(error.issues[0]?.message ?? 'Invalid class settings.', 400)
    }

    console.error('Unexpected error while updating class settings.', error)

    return createErrorResponse('Unexpected server error while updating class settings.', 500)
  }
}
