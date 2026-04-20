import { NextResponse } from 'next/server'
import { readClassRegistrationById } from '@/lib/classes-server'
import { notifyAdminsOfRequest } from '@/lib/notify-admins-of-request'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { registrationId } = await params
    const supabase = getSupabaseAdminClient() as any
    const profile = await readStaffProfile(supabase, authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    const permissions = resolvePermissionsForProfile(profile)

    if (!permissions.can('classes.register')) {
      return createErrorResponse('Forbidden', 403)
    }

    if (permissions.role === 'admin') {
      return createErrorResponse('Admins should remove class registrations directly.', 400)
    }

    const { data: existingPendingRequest, error: existingPendingRequestError } = await supabase
      .from('class_registration_removal_requests')
      .select('id')
      .eq('registration_id', registrationId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    if (existingPendingRequestError) {
      throw new Error(
        `Failed to read pending class registration removal requests: ${existingPendingRequestError.message}`,
      )
    }

    if (existingPendingRequest) {
      return createErrorResponse('A pending removal request already exists for this registration.', 409)
    }

    const { data: registrationRow, error: registrationRowError } = await supabase
      .from('class_registrations')
      .select('id, class_id, status, amount_paid')
      .eq('id', registrationId)
      .maybeSingle()

    if (registrationRowError) {
      throw new Error(
        `Failed to read class registration ${registrationId}: ${registrationRowError.message}`,
      )
    }

    if (!registrationRow) {
      return createErrorResponse('Class registration not found.', 404)
    }

    if (registrationRow.status !== 'approved') {
      return createErrorResponse('Only approved registrations can be removed.', 400)
    }

    const registration = await readClassRegistrationById(
      supabase,
      String(registrationRow.class_id),
      registrationId,
    )

    if (!registration) {
      return createErrorResponse('Class registration not found.', 404)
    }

    const amountPaidAtRequest = Math.max(0, Math.round(normalizeAmount(registrationRow.amount_paid)))
    const { data: insertedRequest, error: insertError } = await supabase
      .from('class_registration_removal_requests')
      .insert({
        registration_id: registrationId,
        class_id: registration.class_id,
        requested_by: profile.id,
        amount_paid_at_request: amountPaidAtRequest,
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      throw new Error(`Failed to create class registration removal request: ${insertError.message}`)
    }

    const requestId = insertedRequest?.id as string | undefined

    if (!requestId) {
      throw new Error('Failed to create class registration removal request.')
    }

    await notifyAdminsOfRequest(supabase, {
      type: 'class_registration_removal_request',
      title: 'Class registration removal request',
      body: `${registration.registrant_name} · ${registration.amount_paid > 0 ? 'Payment reversal required' : 'No payment recorded'}`,
      url: '/pending-approvals/class-registration-requests',
      metadata: {
        requestId,
        registrationId,
        classId: registration.class_id,
        requestType: 'remove',
      },
      logMessage: 'Failed to notify admins about a class registration removal request.',
    })

    return NextResponse.json({
      ok: true,
      requestId,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while creating the class registration removal request.',
      500,
    )
  }
}
