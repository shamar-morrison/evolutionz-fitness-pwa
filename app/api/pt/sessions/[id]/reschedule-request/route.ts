import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  buildJamaicaScheduledAtFromLocalInput,
  formatPtSessionDateTime,
} from '@/lib/pt-scheduling'
import {
  readPtRescheduleRequests,
  readPtSessions,
  readPtSessionRowById,
} from '@/lib/pt-scheduling-server'
import {
  insertNotifications,
  readAdminNotificationRecipients,
} from '@/lib/pt-notifications-server'
import { requireAuthenticatedProfile } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const createRescheduleRequestSchema = z
  .object({
    proposedAt: z.string().trim().min(1),
    note: z.string().trim().nullable().optional(),
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

function normalizeOptionalNotes(notes: string | null | undefined) {
  const normalizedNotes = typeof notes === 'string' ? notes.trim() : ''

  return normalizedNotes || null
}

async function readPendingRequestConflict(
  supabase: any,
  sessionId: string,
) {
  const [pendingRescheduleResult, pendingStatusChangeResult] = await Promise.all([
    supabase
      .from('pt_reschedule_requests')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('pt_session_update_requests')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle(),
  ])

  if (pendingRescheduleResult.error) {
    throw new Error(
      `Failed to check pending reschedule requests: ${pendingRescheduleResult.error.message}`,
    )
  }

  if (pendingStatusChangeResult.error) {
    throw new Error(
      `Failed to check pending session update requests: ${pendingStatusChangeResult.error.message}`,
    )
  }

  return pendingRescheduleResult.data ?? pendingStatusChangeResult.data ?? null
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
    const input = createRescheduleRequestSchema.parse(requestBody)
    const proposedAt = buildJamaicaScheduledAtFromLocalInput(input.proposedAt)

    if (!proposedAt) {
      return createErrorResponse('Proposed date and time must be valid.', 400)
    }

    if (new Date(proposedAt).getTime() <= Date.now()) {
      return createErrorResponse('Proposed date and time must be in the future.', 400)
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
      return createErrorResponse('Only scheduled sessions can be rescheduled.', 400)
    }

    const pendingRequest = await readPendingRequestConflict(supabase, session.id)

    if (pendingRequest) {
      return createErrorResponse('A pending request already exists for this session.', 400)
    }

    const { data: insertedRequest, error: insertError } = await supabase
      .from('pt_reschedule_requests')
      .insert({
        session_id: session.id,
        requested_by: authResult.profile.id,
        proposed_at: proposedAt,
        note: normalizeOptionalNotes(input.note),
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      throw new Error(`Failed to create the reschedule request: ${insertError.message}`)
    }

    const requestId = insertedRequest?.id as string | undefined

    if (!requestId) {
      throw new Error('Failed to create the reschedule request.')
    }

    const [hydratedSession] = await readPtSessions(supabase, { id: session.id })
    const adminRecipients = await readAdminNotificationRecipients(supabase)

    await insertNotifications(
      supabase,
      adminRecipients.map((recipient) => ({
        recipientId: recipient.id,
        type: 'reschedule_request',
        title: 'Reschedule Request',
        body: `${authResult.profile.name} has requested to reschedule ${
          hydratedSession?.memberName ?? 'a member'
        }'s session on ${formatPtSessionDateTime(session.scheduled_at)} to ${formatPtSessionDateTime(
          proposedAt,
        )}.`,
        metadata: {
          sessionId: session.id,
          requestId,
          trainerId: session.trainer_id,
          memberId: session.member_id,
        },
      })),
    )

    const [requestRecord] = await readPtRescheduleRequests(supabase, { id: requestId })

    if (!requestRecord) {
      throw new Error('Failed to load the created reschedule request.')
    }

    return NextResponse.json(
      {
        ok: true,
        request: requestRecord,
      },
      { status: 201 },
    )
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
        : 'Unexpected server error while creating the reschedule request.',
      500,
    )
  }
}
