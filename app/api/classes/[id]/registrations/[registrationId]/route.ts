import { NextResponse } from 'next/server'
import { z } from 'zod'
import { backfillRegistrationAttendanceForCurrentPeriod } from '@/app/api/classes/_registration-attendance'
import {
  getNextPaymentRecordedAt,
  getStoredRegistrationAmount,
  normalizeOptionalText,
  resolveClassRegistrationFeeSelection,
} from '@/app/api/classes/_registration-utils'
import { readClassById, readClassRegistrationById } from '@/lib/classes-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const amountSchema = z.number().finite().int().min(0)
const feeTypeSchema = z.enum(['monthly', 'per_session', 'custom'])

const reviewClassRegistrationSchema = z.union([
  z
    .object({
      status: z.literal('approved'),
      fee_type: feeTypeSchema,
      amount_paid: amountSchema,
      payment_received: z.boolean(),
      notes: z.string().trim().nullable().optional(),
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
      .select('id, class_id, status, payment_recorded_at')
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

    const reviewedAt = new Date().toISOString()
    const nextValues: Record<string, unknown> = {
      status: input.status,
      review_note: normalizeOptionalText(input.review_note),
      reviewed_by: authResult.profile.id,
      reviewed_at: reviewedAt,
    }

    if (input.status === 'approved') {
      const classItem = await readClassById(supabase, id)

      if (!classItem) {
        return createErrorResponse('Class not found.', 404)
      }

      let selectedAmount: number

      try {
        selectedAmount = resolveClassRegistrationFeeSelection({
          classItem,
          feeType: input.fee_type,
          requestedAmount: input.amount_paid,
        })
      } catch (error) {
        if (error instanceof Error) {
          return createErrorResponse(error.message, 400)
        }

        throw error
      }

      nextValues.fee_type = input.fee_type
      nextValues.amount_paid = getStoredRegistrationAmount({
        selectedAmount,
        paymentReceived: input.payment_received,
      })
      nextValues.payment_recorded_at = getNextPaymentRecordedAt({
        paymentReceived: input.payment_received,
        previousPaymentRecordedAt:
          typeof existingRegistration.payment_recorded_at === 'string'
            ? existingRegistration.payment_recorded_at
            : null,
      })
      nextValues.notes = normalizeOptionalText(input.notes)
    }

    const { data: updatedRegistration, error: updateError } = await supabase
      .from('class_registrations')
      .update(nextValues)
      .eq('id', registrationId)
      .eq('class_id', id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (updateError) {
      throw new Error(`Failed to review the class registration: ${updateError.message}`)
    }

    if (!updatedRegistration) {
      return createErrorResponse('This class registration has already been reviewed.', 400)
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
