import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  clearFutureRegistrationAttendance,
  reconcileRegistrationAttendance,
} from '@/app/api/classes/_registration-attendance'
import {
  getNextPaymentRecordedAt,
  getStoredRegistrationAmount,
  normalizeOptionalText,
  resolveClassRegistrationFeeSelection,
} from '@/app/api/classes/_registration-utils'
import { getUtcDateFromDateValue } from '@/lib/classes'
import {
  readClassById,
  readClassRegistrationById,
} from '@/lib/classes-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const dateValueSchema = z.string().trim().regex(/^(\d{4})-(\d{2})-(\d{2})$/u)
const feeTypeSchema = z.enum(['monthly', 'per_session', 'custom'])
const amountSchema = z.number().finite().int().min(0)

const updateClassRegistrationSchema = z.object({
  period_start: dateValueSchema,
  fee_type: feeTypeSchema,
  amount_paid: amountSchema,
  payment_received: z.boolean(),
  notes: z.string().trim().nullable().optional(),
}).strict()

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

function normalizeAmount(value: number | string | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { registrationId } = await params
    const requestBody = await request.json()
    const input = updateClassRegistrationSchema.parse(requestBody)

    if (!getUtcDateFromDateValue(input.period_start)) {
      return createErrorResponse('period_start must be a valid YYYY-MM-DD date.', 400)
    }

    const supabase = getSupabaseAdminClient() as any
    const { data: existingRegistration, error: existingRegistrationError } = await supabase
      .from('class_registrations')
      .select(
        'id, class_id, status, member_id, guest_profile_id, month_start, amount_paid, payment_recorded_at',
      )
      .eq('id', registrationId)
      .maybeSingle()

    if (existingRegistrationError) {
      throw new Error(
        `Failed to read class registration ${registrationId}: ${existingRegistrationError.message}`,
      )
    }

    if (!existingRegistration) {
      return createErrorResponse('Class registration not found.', 404)
    }

    if (existingRegistration.status !== 'approved') {
      return createErrorResponse('Only approved registrations can be edited.', 400)
    }

    const classItem = await readClassById(supabase, String(existingRegistration.class_id))

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const selectedAmount = resolveClassRegistrationFeeSelection({
      classItem,
      feeType: input.fee_type,
      requestedAmount: input.amount_paid,
    })
    const previousAmountPaid = normalizeAmount(existingRegistration.amount_paid)
    const { data: updatedRegistrationResult, error: updateError } = await supabase
      .from('class_registrations')
      .update({
        month_start: input.period_start,
        fee_type: input.fee_type,
        amount_paid: getStoredRegistrationAmount({
          selectedAmount,
          paymentReceived: input.payment_received,
        }),
        payment_recorded_at: getNextPaymentRecordedAt({
          paymentReceived: input.payment_received,
          previousPaymentRecordedAt: existingRegistration.payment_recorded_at,
        }),
        notes: normalizeOptionalText(input.notes),
      })
      .eq('id', registrationId)
      .eq('status', 'approved')
      .select('id')
      .maybeSingle()

    if (updateError) {
      throw new Error(`Failed to update class registration ${registrationId}: ${updateError.message}`)
    }

    if (!updatedRegistrationResult) {
      return createErrorResponse('This registration can no longer be edited.', 400)
    }

    const updatedRegistration = await readClassRegistrationById(
      supabase,
      String(existingRegistration.class_id),
      registrationId,
    )

    if (!updatedRegistration) {
      throw new Error('Failed to load the updated class registration.')
    }

    try {
      await reconcileRegistrationAttendance({
        supabase,
        classId: String(existingRegistration.class_id),
        registration: updatedRegistration,
      })
    } catch (attendanceError) {
      console.error('Failed to reconcile class attendance rows after registration edit:', attendanceError)
    }

    return NextResponse.json({
      ok: true,
      registration: updatedRegistration,
      amountChanged: previousAmountPaid !== updatedRegistration.amount_paid,
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
        : 'Unexpected server error while updating the class registration.',
      500,
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { registrationId } = await params
    const supabase = getSupabaseAdminClient() as any
    const { data: existingRegistration, error: existingRegistrationError } = await supabase
      .from('class_registrations')
      .select('id, class_id, status, member_id, guest_profile_id, amount_paid')
      .eq('id', registrationId)
      .maybeSingle()

    if (existingRegistrationError) {
      throw new Error(
        `Failed to read class registration ${registrationId}: ${existingRegistrationError.message}`,
      )
    }

    if (!existingRegistration) {
      return createErrorResponse('Class registration not found.', 404)
    }

    if (existingRegistration.status !== 'approved') {
      return createErrorResponse('Only approved registrations can be removed.', 400)
    }

    try {
      await clearFutureRegistrationAttendance({
        supabase,
        classId: String(existingRegistration.class_id),
        registration: {
          id: String(existingRegistration.id),
          member_id: existingRegistration.member_id,
          guest_profile_id: existingRegistration.guest_profile_id,
        },
      })
    } catch (attendanceError) {
      console.error('Failed to clear future class attendance rows before registration removal:', attendanceError)
    }

    const { data: deletedRegistration, error: deleteError } = await supabase
      .from('class_registrations')
      .delete()
      .eq('id', registrationId)
      .eq('status', 'approved')
      .select('id')
      .maybeSingle()

    if (deleteError) {
      throw new Error(`Failed to remove class registration ${registrationId}: ${deleteError.message}`)
    }

    if (!deletedRegistration) {
      return createErrorResponse('This registration can no longer be removed.', 400)
    }

    return NextResponse.json({
      ok: true,
      classId: String(existingRegistration.class_id),
      amountPaid: normalizeAmount(existingRegistration.amount_paid),
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while removing the class registration.',
      500,
    )
  }
}
