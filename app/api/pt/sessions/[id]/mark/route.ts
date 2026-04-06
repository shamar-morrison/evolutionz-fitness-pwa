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
    status: z.enum(['completed', 'missed']),
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
      return createErrorResponse('Only scheduled sessions can be marked completed or missed.', 400)
    }

    if (authResult.profile.role === 'admin') {
      const { error: updateError } = await supabase
        .from('pt_sessions')
        .update({
          status: input.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      if (updateError) {
        throw new Error(`Failed to update the PT session: ${updateError.message}`)
      }

      const { error: auditError } = await supabase.from('pt_session_changes').insert({
        session_id: session.id,
        changed_by: authResult.profile.id,
        change_type: 'status_change' satisfies PtSessionChange['changeType'],
        old_value: {
          status: session.status,
        },
        new_value: {
          status: input.status,
        },
      })

      if (auditError) {
        throw new Error(`Failed to record PT session history: ${auditError.message}`)
      }

      return NextResponse.json({
        ok: true,
      })
    }

    const { data: pendingRequest, error: pendingRequestError } = await supabase
      .from('pt_session_update_requests')
      .select('id')
      .eq('session_id', session.id)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    if (pendingRequestError) {
      throw new Error(`Failed to check pending session update requests: ${pendingRequestError.message}`)
    }

    if (pendingRequest) {
      return createErrorResponse('A pending session update request already exists for this session.', 400)
    }

    const { data: insertedRequest, error: insertError } = await supabase
      .from('pt_session_update_requests')
      .insert({
        session_id: session.id,
        requested_by: authResult.profile.id,
        requested_status: input.status,
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
        }'s session on ${formatPtSessionDateTime(session.scheduled_at)} as ${input.status}.`,
        metadata: {
          requestId,
          sessionId: session.id,
          requestedStatus: input.status,
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
