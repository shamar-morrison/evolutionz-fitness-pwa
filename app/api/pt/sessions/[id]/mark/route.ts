import { NextResponse } from 'next/server'
import { z } from 'zod'
import { formatPtSessionDateTime, type PtSessionChange } from '@/lib/pt-scheduling'
import { readPtSessions, readPtSessionRowById } from '@/lib/pt-scheduling-server'
import {
  insertNotifications,
  readAdminNotificationRecipients,
} from '@/lib/pt-notifications-server'
import { requireAuthenticatedProfile } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const markPtSessionSchema = z
  .object({
    requestedStatus: z.enum(['completed', 'missed', 'cancelled']).optional(),
    status: z.enum(['completed', 'missed', 'cancelled']).optional(),
    note: z.string().trim().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.requestedStatus && !value.status) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'requestedStatus or status is required.',
      })
    }

    if (
      value.requestedStatus &&
      value.status &&
      value.requestedStatus !== value.status
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'requestedStatus and status must match when both are provided.',
      })
    }
  })

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

function normalizeOptionalNotes(notes: string | null | undefined) {
  const normalizedNotes = typeof notes === 'string' ? notes.trim() : ''

  return normalizedNotes || null
}

async function readPendingRequestConflict(
  supabase: any,
  sessionId: string,
) {
  const [pendingStatusChangeResult, pendingRescheduleResult] = await Promise.all([
    supabase
      .from('pt_session_update_requests')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('pt_reschedule_requests')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle(),
  ])

  if (pendingStatusChangeResult.error) {
    throw new Error(
      `Failed to check pending session update requests: ${pendingStatusChangeResult.error.message}`,
    )
  }

  if (pendingRescheduleResult.error) {
    throw new Error(
      `Failed to check pending reschedule requests: ${pendingRescheduleResult.error.message}`,
    )
  }

  return pendingStatusChangeResult.data ?? pendingRescheduleResult.data ?? null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuthenticatedProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const requestBody = await request.json()
    const input = markPtSessionSchema.parse(requestBody)
    const requestedStatus = input.requestedStatus ?? input.status

    if (!requestedStatus) {
      return createErrorResponse('requestedStatus or status is required.', 400)
    }

    const supabase = getSupabaseAdminClient() as any
    const session = await readPtSessionRowById(supabase, id)

    if (!session) {
      return createErrorResponse('PT session not found.', 404)
    }

    if (
      authResult.profile.role !== 'admin' &&
      session.trainer_id !== authResult.profile.id
    ) {
      return createErrorResponse('Forbidden', 403)
    }

    if (session.status !== 'scheduled') {
      return createErrorResponse(
        'Only scheduled sessions can be marked completed, missed, or cancelled.',
        400,
      )
    }

    if (authResult.profile.role === 'admin') {
      const reviewTimestamp = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('pt_sessions')
        .update({
          status: requestedStatus,
          updated_at: reviewTimestamp,
        })
        .eq('id', session.id)

      if (updateError) {
        throw new Error(`Failed to update the PT session: ${updateError.message}`)
      }

      const { error: auditError } = await supabase.from('pt_session_changes').insert({
        session_id: session.id,
        changed_by: authResult.profile.id,
        change_type:
          requestedStatus === 'cancelled'
            ? ('cancellation' satisfies PtSessionChange['changeType'])
            : ('status_change' satisfies PtSessionChange['changeType']),
        old_value: {
          status: session.status,
        },
        new_value: {
          status: requestedStatus,
        },
      })

      if (auditError) {
        throw new Error(`Failed to record PT session history: ${auditError.message}`)
      }

      return NextResponse.json({
        ok: true,
      })
    }

    const pendingRequest = await readPendingRequestConflict(supabase, session.id)

    if (pendingRequest) {
      return createErrorResponse('A pending request already exists for this session.', 400)
    }

    const { data: insertedRequest, error: insertError } = await supabase
      .from('pt_session_update_requests')
      .insert({
        session_id: session.id,
        requested_by: authResult.profile.id,
        requested_status: requestedStatus,
        note: normalizeOptionalNotes(input.note),
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      throw new Error(`Failed to create the session update request: ${insertError.message}`)
    }

    const requestId = insertedRequest?.id as string | undefined

    if (!requestId) {
      throw new Error('Failed to create the session update request.')
    }

    const [hydratedSession] = await readPtSessions(supabase, { id: session.id })
    const adminRecipients = await readAdminNotificationRecipients(supabase)

    await insertNotifications(
      supabase,
      adminRecipients.map((recipient) => ({
        recipientId: recipient.id,
        type: 'status_change_request',
        title: 'Session Update Request',
        body: `${authResult.profile.name} requested to mark ${
          hydratedSession?.memberName ?? 'a member'
        }'s session on ${formatPtSessionDateTime(session.scheduled_at)} as ${requestedStatus}.`,
        metadata: {
          requestId,
          sessionId: session.id,
          requestedStatus,
          trainerId: session.trainer_id,
          memberId: session.member_id,
        },
      })),
    )

    return NextResponse.json({
      ok: true,
      pending: true,
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
        : 'Unexpected server error while marking the PT session.',
      500,
    )
  }
}
