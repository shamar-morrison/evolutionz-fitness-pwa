import { NextResponse } from 'next/server'
import { z } from 'zod'
import { backfillRegistrationAttendanceForCurrentPeriod } from '@/app/api/classes/_registration-attendance'
import { readClassById, readClassRegistrationById } from '@/lib/classes-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const amountSchema = z.number().finite().min(0)

const reviewClassRegistrationSchema = z.union([
  z
    .object({
      status: z.literal('approved'),
      amount_paid: amountSchema,
      review_note: z.string().trim().nullable().optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal('denied'),
      review_note: z.string().trim().min(1, 'A denial reason is required.'),
    })
    .strict(),
])

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
  {
    params,
  }: {
    params: Promise<{ id: string; registrationId: string }>
  },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id, registrationId } = await params
    const requestBody = await request.json()
    const input = reviewClassRegistrationSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as any
    const { data: existingRegistration, error: existingRegistrationError } = await supabase
      .from('class_registrations')
      .select('id, class_id, status')
      .eq('id', registrationId)
      .eq('class_id', id)
      .maybeSingle()

    if (existingRegistrationError) {
      throw new Error(
        `Failed to read the class registration review state: ${existingRegistrationError.message}`,
      )
    }

    if (!existingRegistration) {
      return createErrorResponse('Class registration not found.', 404)
    }

    if (existingRegistration.status !== 'pending') {
      return createErrorResponse('This class registration has already been reviewed.', 400)
    }

    const reviewedAt = new Date().toISOString()
    const nextValues: Record<string, unknown> = {
      status: input.status,
      review_note: normalizeOptionalText(input.review_note),
      reviewed_by: authResult.profile.id,
      reviewed_at: reviewedAt,
    }

    if (input.status === 'approved') {
      nextValues.amount_paid = input.amount_paid
    }

    const { error: updateError } = await supabase
      .from('class_registrations')
      .update(nextValues)
      .eq('id', registrationId)
      .eq('class_id', id)

    if (updateError) {
      throw new Error(`Failed to review the class registration: ${updateError.message}`)
    }

    const registration = await readClassRegistrationById(supabase, id, registrationId)

    if (!registration) {
      throw new Error('Failed to load the reviewed class registration.')
    }

    if (input.status === 'approved') {
      try {
        const classItem = await readClassById(supabase, id)

        if (!classItem) {
          throw new Error('Failed to load the class for attendance backfill.')
        }

        if (classItem.current_period_start && registration.status === 'approved') {
          await backfillRegistrationAttendanceForCurrentPeriod({
            supabase,
            classId: id,
            currentPeriodStart: classItem.current_period_start,
            registration,
          })
        }
      } catch (attendanceError) {
        console.error(
          'Failed to backfill class attendance rows after registration approval:',
          attendanceError,
        )
      }
    }

    return NextResponse.json({
      ok: true,
      registration,
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
        : 'Unexpected server error while reviewing the class registration.',
      500,
    )
  }
}
