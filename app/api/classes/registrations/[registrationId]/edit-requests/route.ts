import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  normalizeOptionalText,
  resolveClassRegistrationFeeSelection,
} from '@/app/api/classes/_registration-utils'
import { getUtcDateFromDateValue } from '@/lib/classes'
import { readClassById, readClassRegistrationById } from '@/lib/classes-server'
import { notifyAdminsOfRequest } from '@/lib/notify-admins-of-request'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const dateValueSchema = z.string().trim().regex(/^(\d{4})-(\d{2})-(\d{2})$/u)
const feeTypeSchema = z.enum(['monthly', 'per_session', 'custom'])
const amountSchema = z.number().finite().int().min(0)

const createClassRegistrationEditRequestSchema = z.object({
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { registrationId } = await params
    const requestBody = await request.json()
    const input = createClassRegistrationEditRequestSchema.parse(requestBody)

    if (!getUtcDateFromDateValue(input.period_start)) {
      return createErrorResponse('period_start must be a valid YYYY-MM-DD date.', 400)
    }

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
      return createErrorResponse('Admins should edit class registrations directly.', 400)
    }

    const { data: existingPendingRequest, error: existingPendingRequestError } = await supabase
      .from('class_registration_edit_requests')
      .select('id')
      .eq('registration_id', registrationId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    if (existingPendingRequestError) {
      throw new Error(
        `Failed to read pending class registration edit requests: ${existingPendingRequestError.message}`,
      )
    }

    if (existingPendingRequest) {
      return createErrorResponse('A pending edit request already exists for this registration.', 409)
    }

    const { data: registrationRow, error: registrationRowError } = await supabase
      .from('class_registrations')
      .select('id, class_id, status')
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
      return createErrorResponse('Only approved registrations can be edited.', 400)
    }

    const classItem = await readClassById(supabase, String(registrationRow.class_id))

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const registration = await readClassRegistrationById(
      supabase,
      String(registrationRow.class_id),
      registrationId,
    )

    if (!registration) {
      return createErrorResponse('Class registration not found.', 404)
    }

    const selectedAmount = resolveClassRegistrationFeeSelection({
      classItem,
      feeType: input.fee_type,
      requestedAmount: input.amount_paid,
    })

    const { data: insertedRequest, error: insertError } = await supabase
      .from('class_registration_edit_requests')
      .insert({
        registration_id: registrationId,
        class_id: registration.class_id,
        requested_by: profile.id,
        proposed_fee_type: input.fee_type,
        proposed_amount_paid: selectedAmount,
        proposed_period_start: input.period_start,
        proposed_payment_received: input.payment_received,
        proposed_notes: normalizeOptionalText(input.notes),
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      throw new Error(`Failed to create class registration edit request: ${insertError.message}`)
    }

    const requestId = insertedRequest?.id as string | undefined

    if (!requestId) {
      throw new Error('Failed to create class registration edit request.')
    }

    await notifyAdminsOfRequest(supabase, {
      type: 'class_registration_edit_request',
      title: 'Class registration edit request',
      body: `${registration.registrant_name} · ${classItem.name}`,
      url: '/pending-approvals/class-registration-requests',
      metadata: {
        requestId,
        registrationId,
        classId: registration.class_id,
        requestType: 'edit',
      },
      logMessage: 'Failed to notify admins about a class registration edit request.',
    })

    return NextResponse.json({
      ok: true,
      requestId,
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
        : 'Unexpected server error while creating the class registration edit request.',
      500,
    )
  }
}
