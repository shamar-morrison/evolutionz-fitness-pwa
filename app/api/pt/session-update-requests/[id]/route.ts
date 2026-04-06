import { NextResponse } from 'next/server'
import { z } from 'zod'
import { formatPtSessionDateTime } from '@/lib/pt-scheduling'
import {
  readPtSessionRowById,
  readPtSessionUpdateRequestRowById,
  readPtSessionUpdateRequests,
} from '@/lib/pt-scheduling-server'
import { insertNotifications } from '@/lib/pt-notifications-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const reviewSessionUpdateRequestSchema = z
  .object({
    status: z.enum(['approved', 'denied']),
    reviewNote: z.string().trim().nullable().optional(),
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const requestBody = await request.json()
    const input = reviewSessionUpdateRequestSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as any
    const existingRequest = await readPtSessionUpdateRequestRowById(supabase, id)

    if (!existingRequest) {
      return createErrorResponse('Session update request not found.', 404)
    }

    if (existingRequest.status !== 'pending') {
      return createErrorResponse('This session update request has already been reviewed.', 400)
    }

    const session = await readPtSessionRowById(supabase, existingRequest.session_id)

    if (!session) {
      return createErrorResponse('PT session not found.', 404)
    }

    const reviewNote = normalizeOptionalNotes(input.reviewNote)
    const reviewTimestamp = new Date().toISOString()

    if (input.status === 'approved') {
      const { error: updateSessionError } = await supabase
        .from('pt_sessions')
        .update({
          status: existingRequest.requested_status,
          updated_at: reviewTimestamp,
        })
        .eq('id', session.id)

      if (updateSessionError) {
        throw new Error(`Failed to update the PT session: ${updateSessionError.message}`)
      }

      const { error: auditError } = await supabase.from('pt_session_changes').insert({
        session_id: session.id,
        changed_by: authResult.profile.id,
        change_type: 'status_change',
        old_value: {
          status: session.status,
        },
        new_value: {
          status: existingRequest.requested_status,
        },
      })

      if (auditError) {
        throw new Error(`Failed to record PT session history: ${auditError.message}`)
      }
    }

    const { error: reviewError } = await supabase
      .from('pt_session_update_requests')
      .update({
        status: input.status,
        reviewed_by: authResult.profile.id,
        review_note: reviewNote,
        reviewed_at: reviewTimestamp,
        updated_at: reviewTimestamp,
      })
      .eq('id', existingRequest.id)

    if (reviewError) {
      throw new Error(`Failed to review the session update request: ${reviewError.message}`)
    }

    await insertNotifications(supabase, [
      {
        recipientId: session.trainer_id,
        type: 'status_change_request',
        title:
          input.status === 'approved' ? 'Session Update Approved' : 'Session Update Denied',
        body:
          input.status === 'approved'
            ? `Your request to mark the session on ${formatPtSessionDateTime(
                session.scheduled_at,
              )} as ${existingRequest.requested_status} was approved.`
            : `Your request to mark the session on ${formatPtSessionDateTime(
                session.scheduled_at,
              )} as ${existingRequest.requested_status} was denied.`,
        metadata: {
          sessionId: session.id,
          requestId: existingRequest.id,
          requestedStatus: existingRequest.requested_status,
          reviewNote,
          status: input.status,
        },
      },
    ])

    const [reviewedRequest] = await readPtSessionUpdateRequests(supabase, { id: existingRequest.id })

    if (!reviewedRequest) {
      throw new Error('Failed to load the reviewed session update request.')
    }

    return NextResponse.json({
      ok: true,
      request: reviewedRequest,
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
        : 'Unexpected server error while reviewing the session update request.',
      500,
    )
  }
}
