import { NextResponse } from 'next/server'
import { z } from 'zod'
import { reconcileRegistrationAttendance } from '@/app/api/classes/_registration-attendance'
import {
  getNextPaymentRecordedAt,
  getStoredRegistrationAmount,
  normalizeOptionalText,
  resolveClassRegistrationFeeSelection,
} from '@/app/api/classes/_registration-utils'
import {
  CLASS_REGISTRATION_EDIT_REQUEST_SELECT,
  type ClassRegistrationEditRequestRecord,
} from '@/lib/class-registration-request-records'
import { readClassById, readClassRegistrationById } from '@/lib/classes-server'
import { archiveResolvedRequestNotifications } from '@/lib/pt-notifications-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { reviewActionSchema } from '@/lib/validation-schemas'

const reviewClassRegistrationEditRequestSchema = reviewActionSchema.strict()

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

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

async function revertEditRequestToPending(
  supabase: any,
  requestId: string,
) {
  await supabase
    .from('class_registration_edit_requests')
    .update({
      status: 'pending',
      reviewed_by: null,
      review_timestamp: null,
    })
    .eq('id', requestId)
    .eq('status', 'approved')
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { requestId } = await params
    const requestBody = await request.json()
    const input = reviewClassRegistrationEditRequestSchema.parse(requestBody)
    const reviewTimestamp = new Date().toISOString()
    const supabase = getSupabaseAdminClient() as any
    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('class_registration_edit_requests')
      .select(CLASS_REGISTRATION_EDIT_REQUEST_SELECT)
      .eq('id', requestId)
      .maybeSingle()

    if (existingRequestError) {
      throw new Error(
        `Failed to read class registration edit request ${requestId}: ${existingRequestError.message}`,
      )
    }

    const requestRecord = (existingRequest ?? null) as ClassRegistrationEditRequestRecord | null

    if (!requestRecord) {
      return createErrorResponse('Class registration edit request not found.', 404)
    }

    if (requestRecord.status !== 'pending') {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    if (input.action === 'reject') {
      const { data: rejectedRequests, error: rejectError } = await supabase
        .from('class_registration_edit_requests')
        .update({
          status: 'rejected',
          reviewed_by: authResult.profile.id,
          review_timestamp: reviewTimestamp,
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('id')

      if (rejectError) {
        throw new Error(
          `Failed to reject class registration edit request ${requestId}: ${rejectError.message}`,
        )
      }

      if (!(Array.isArray(rejectedRequests) && rejectedRequests[0])) {
        return createErrorResponse('This request has already been reviewed.', 400)
      }

      try {
        await archiveResolvedRequestNotifications(supabase, {
          requestId,
          type: 'class_registration_edit_request',
          archivedAt: reviewTimestamp,
        })
      } catch (archiveError) {
        console.error('Failed to archive class registration edit request notifications:', archiveError)
      }

      return NextResponse.json({ ok: true })
    }

    const classItem = await readClassById(supabase, requestRecord.class_id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const registration = await readClassRegistrationById(
      supabase,
      requestRecord.class_id,
      requestRecord.registration_id,
    )

    if (!registration) {
      return createErrorResponse('Class registration not found.', 404)
    }

    if (registration.status !== 'approved') {
      return createErrorResponse('Only approved registrations can be edited.', 400)
    }

    const { data: approvedRequests, error: approveRequestError } = await supabase
      .from('class_registration_edit_requests')
      .update({
        status: 'approved',
        reviewed_by: authResult.profile.id,
        review_timestamp: reviewTimestamp,
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select('id')

    if (approveRequestError) {
      throw new Error(
        `Failed to approve class registration edit request ${requestId}: ${approveRequestError.message}`,
      )
    }

    if (!(Array.isArray(approvedRequests) && approvedRequests[0])) {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    try {
      const effectiveFeeType = requestRecord.proposed_fee_type ?? 'custom'
      const selectedAmount = resolveClassRegistrationFeeSelection({
        classItem,
        feeType: effectiveFeeType,
        requestedAmount: normalizeAmount(requestRecord.proposed_amount_paid),
      })
      const previousAmountPaid = registration.amount_paid
      const { data: updatedRegistrationResult, error: updateError } = await supabase
        .from('class_registrations')
        .update({
          month_start: requestRecord.proposed_period_start,
          fee_type: effectiveFeeType,
          amount_paid: getStoredRegistrationAmount({
            selectedAmount,
            paymentReceived: requestRecord.proposed_payment_received,
          }),
          payment_recorded_at: getNextPaymentRecordedAt({
            paymentReceived: requestRecord.proposed_payment_received,
            previousPaymentRecordedAt: registration.payment_recorded_at,
          }),
          notes: normalizeOptionalText(requestRecord.proposed_notes),
        })
        .eq('id', requestRecord.registration_id)
        .eq('status', 'approved')
        .select('id')
        .maybeSingle()

      if (updateError) {
        throw new Error(
          `Failed to apply class registration edit request ${requestId}: ${updateError.message}`,
        )
      }

      if (!updatedRegistrationResult) {
        await revertEditRequestToPending(supabase, requestId)
        return createErrorResponse('This registration can no longer be edited.', 400)
      }

      const updatedRegistration = await readClassRegistrationById(
        supabase,
        requestRecord.class_id,
        requestRecord.registration_id,
      )

      if (!updatedRegistration) {
        throw new Error('Failed to load the updated class registration.')
      }

      try {
        await reconcileRegistrationAttendance({
          supabase,
          classId: requestRecord.class_id,
          registration: updatedRegistration,
        })
      } catch (attendanceError) {
        console.error(
          'Failed to reconcile class attendance rows after approving registration edit request:',
          attendanceError,
        )
      }

      try {
        await archiveResolvedRequestNotifications(supabase, {
          requestId,
          type: 'class_registration_edit_request',
          archivedAt: reviewTimestamp,
        })
      } catch (archiveError) {
        console.error('Failed to archive class registration edit request notifications:', archiveError)
      }

      return NextResponse.json({
        ok: true,
        registration: updatedRegistration,
        amountChanged: previousAmountPaid !== updatedRegistration.amount_paid,
      })
    } catch (approvalError) {
      await revertEditRequestToPending(supabase, requestId)
      throw approvalError
    }
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
        : 'Unexpected server error while reviewing the class registration edit request.',
      500,
    )
  }
}
