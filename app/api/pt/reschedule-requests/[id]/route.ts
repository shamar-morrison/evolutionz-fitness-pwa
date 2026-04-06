import { NextResponse } from 'next/server'
import { z } from 'zod'
import { buildJamaicaScheduledAtFromLocalInput, formatPtSessionDateTime } from '@/lib/pt-scheduling'
import {
  readPtRescheduleRequestRowById,
  readPtRescheduleRequests,
  readPtSessionRowById,
} from '@/lib/pt-scheduling-server'
import { insertNotifications } from '@/lib/pt-notifications-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const reviewRescheduleRequestSchema = z
  .object({
    status: z.enum(['approved', 'denied']),
    proposedAt: z.string().trim().optional(),
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
    const input = reviewRescheduleRequestSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as any
    const existingRequest = await readPtRescheduleRequestRowById(supabase, id)

    if (!existingRequest) {
      return createErrorResponse('Reschedule request not found.', 404)
    }

    if (existingRequest.status !== 'pending') {
      return createErrorResponse('This reschedule request has already been reviewed.', 400)
    }

    const session = await readPtSessionRowById(supabase, existingRequest.session_id)

    if (!session) {
      return createErrorResponse('PT session not found.', 404)
    }

    const reviewNote = normalizeOptionalNotes(input.reviewNote)
    const reviewTimestamp = new Date().toISOString()

    if (input.status === 'approved') {
      const approvedAt =
        typeof input.proposedAt === 'string' && input.proposedAt.trim()
          ? buildJamaicaScheduledAtFromLocalInput(input.proposedAt)
          : existingRequest.proposed_at

      if (!approvedAt) {
        return createErrorResponse('Approved date and time must be valid.', 400)
      }

      if (new Date(approvedAt).getTime() <= Date.now()) {
        return createErrorResponse('Approved date and time must be in the future.', 400)
      }

      const { error: updateSessionError } = await supabase
        .from('pt_sessions')
        .update({
          scheduled_at: approvedAt,
          status: 'rescheduled',
          updated_at: reviewTimestamp,
        })
        .eq('id', session.id)

      if (updateSessionError) {
        throw new Error(`Failed to update the PT session: ${updateSessionError.message}`)
      }

      const { error: auditError } = await supabase.from('pt_session_changes').insert({
        session_id: session.id,
        changed_by: authResult.profile.id,
        change_type: 'reschedule',
        old_value: {
          scheduledAt: session.scheduled_at,
        },
        new_value: {
          scheduledAt: approvedAt,
        },
      })

      if (auditError) {
        throw new Error(`Failed to record PT session history: ${auditError.message}`)
      }

      const { error: reviewError } = await supabase
        .from('pt_reschedule_requests')
        .update({
          proposed_at: approvedAt,
          status: 'approved',
          reviewed_by: authResult.profile.id,
          review_note: reviewNote,
          reviewed_at: reviewTimestamp,
          updated_at: reviewTimestamp,
        })
        .eq('id', existingRequest.id)

      if (reviewError) {
        throw new Error(`Failed to review the reschedule request: ${reviewError.message}`)
      }

      await insertNotifications(supabase, [
        {
          recipientId: session.trainer_id,
          type: 'reschedule_approved',
          title: 'Reschedule Approved',
          body: `Your request to reschedule the session on ${formatPtSessionDateTime(
            session.scheduled_at,
          )} was approved for ${formatPtSessionDateTime(approvedAt)}.`,
          metadata: {
            sessionId: session.id,
            requestId: existingRequest.id,
          },
        },
      ])
    } else {
      const { error: reviewError } = await supabase
        .from('pt_reschedule_requests')
        .update({
          status: 'denied',
          reviewed_by: authResult.profile.id,
          review_note: reviewNote,
          reviewed_at: reviewTimestamp,
          updated_at: reviewTimestamp,
        })
        .eq('id', existingRequest.id)

      if (reviewError) {
        throw new Error(`Failed to review the reschedule request: ${reviewError.message}`)
      }

      await insertNotifications(supabase, [
        {
          recipientId: session.trainer_id,
          type: 'reschedule_denied',
          title: 'Reschedule Denied',
          body: `Your request to reschedule the session on ${formatPtSessionDateTime(
            session.scheduled_at,
          )} was denied.`,
          metadata: {
            sessionId: session.id,
            requestId: existingRequest.id,
            reviewNote,
          },
        },
      ])
    }

    const [reviewedRequest] = await readPtRescheduleRequests(supabase, { id: existingRequest.id })

    if (!reviewedRequest) {
      throw new Error('Failed to load the reviewed reschedule request.')
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
        : 'Unexpected server error while reviewing the reschedule request.',
      500,
    )
  }
}
