import { NextResponse } from 'next/server'
import { clearFutureRegistrationAttendance } from '@/app/api/classes/_registration-attendance'
import {
  CLASS_REGISTRATION_REMOVAL_REQUEST_SELECT,
  type ClassRegistrationRemovalRequestRecord,
} from '@/lib/class-registration-request-records'
import { readClassRegistrationById } from '@/lib/classes-server'
import { archiveResolvedRequestNotifications } from '@/lib/pt-notifications-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { reviewActionSchema } from '@/lib/validation-schemas'

const reviewClassRegistrationRemovalRequestSchema = reviewActionSchema.strict()

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

async function revertRemovalRequestToPending(
  supabase: any,
  requestId: string,
) {
  await supabase
    .from('class_registration_removal_requests')
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
    const input = reviewClassRegistrationRemovalRequestSchema.parse(requestBody)
    const reviewTimestamp = new Date().toISOString()
    const supabase = getSupabaseAdminClient() as any
    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('class_registration_removal_requests')
      .select(CLASS_REGISTRATION_REMOVAL_REQUEST_SELECT)
      .eq('id', requestId)
      .maybeSingle()

    if (existingRequestError) {
      throw new Error(
        `Failed to read class registration removal request ${requestId}: ${existingRequestError.message}`,
      )
    }

    const requestRecord = (existingRequest ?? null) as ClassRegistrationRemovalRequestRecord | null

    if (!requestRecord) {
      return createErrorResponse('Class registration removal request not found.', 404)
    }

    if (requestRecord.status !== 'pending') {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    if (input.action === 'reject') {
      const { data: rejectedRequests, error: rejectError } = await supabase
        .from('class_registration_removal_requests')
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
          `Failed to reject class registration removal request ${requestId}: ${rejectError.message}`,
        )
      }

      if (!(Array.isArray(rejectedRequests) && rejectedRequests[0])) {
        return createErrorResponse('This request has already been reviewed.', 400)
      }

      try {
        await archiveResolvedRequestNotifications(supabase, {
          requestId,
          type: 'class_registration_removal_request',
          archivedAt: reviewTimestamp,
        })
      } catch (archiveError) {
        console.error('Failed to archive class registration removal request notifications:', archiveError)
      }

      return NextResponse.json({ ok: true })
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
      return createErrorResponse('Only approved registrations can be removed.', 400)
    }

    const { data: approvedRequests, error: approveRequestError } = await supabase
      .from('class_registration_removal_requests')
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
        `Failed to approve class registration removal request ${requestId}: ${approveRequestError.message}`,
      )
    }

    if (!(Array.isArray(approvedRequests) && approvedRequests[0])) {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    try {
      const { data: deletedRegistration, error: deleteError } = await supabase
        .from('class_registrations')
        .delete()
        .eq('id', requestRecord.registration_id)
        .eq('status', 'approved')
        .select('id')
        .maybeSingle()

      if (deleteError) {
        throw new Error(
          `Failed to remove class registration ${requestRecord.registration_id}: ${deleteError.message}`,
        )
      }

      if (!deletedRegistration) {
        await revertRemovalRequestToPending(supabase, requestId)
        return createErrorResponse('This registration can no longer be removed.', 400)
      }

      try {
        await clearFutureRegistrationAttendance({
          supabase,
          classId: requestRecord.class_id,
          registration,
        })
      } catch (attendanceError) {
        console.error(
          'Failed to clear future class attendance rows after removing a registration:',
          attendanceError,
        )
      }

      try {
        await archiveResolvedRequestNotifications(supabase, {
          requestId,
          type: 'class_registration_removal_request',
          archivedAt: reviewTimestamp,
        })
      } catch (archiveError) {
        console.error('Failed to archive class registration removal request notifications:', archiveError)
      }

      return NextResponse.json({
        ok: true,
        classId: requestRecord.class_id,
        amountPaid: normalizeAmount(requestRecord.amount_paid_at_request),
      })
    } catch (approvalError) {
      await revertRemovalRequestToPending(supabase, requestId)
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
        : 'Unexpected server error while reviewing the class registration removal request.',
      500,
    )
  }
}
