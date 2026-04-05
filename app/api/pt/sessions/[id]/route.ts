import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  buildJamaicaScheduledAtFromLocalInput,
  SESSION_STATUSES,
  type PtSessionChange,
} from '@/lib/pt-scheduling'
import {
  readPtSessionDetail,
  readPtSessionRowById,
} from '@/lib/pt-scheduling-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const updatePtSessionSchema = z
  .object({
    status: z.enum(SESSION_STATUSES).optional(),
    scheduledAt: z.string().trim().min(1).optional(),
    notes: z.string().trim().nullable().optional(),
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const supabase = getSupabaseAdminClient() as any
    const detail = await readPtSessionDetail(supabase, id)

    if (!detail) {
      return createErrorResponse('PT session not found.', 404)
    }

    return NextResponse.json({
      ok: true,
      session: detail.session,
      changes: detail.changes,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while loading the PT session.',
      500,
    )
  }
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
    const input = updatePtSessionSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as any
    const existingSession = await readPtSessionRowById(supabase, id)

    if (!existingSession) {
      return createErrorResponse('PT session not found.', 404)
    }

    const updateValues: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    const auditEntries: Array<{
      session_id: string
      changed_by: string
      change_type: PtSessionChange['changeType']
      old_value: Record<string, unknown> | null
      new_value: Record<string, unknown> | null
    }> = []

    if (typeof input.notes !== 'undefined') {
      updateValues.notes = input.notes
    }

    if (typeof input.scheduledAt === 'string') {
      const normalizedScheduledAt = buildJamaicaScheduledAtFromLocalInput(input.scheduledAt)

      if (!normalizedScheduledAt) {
        return createErrorResponse('Scheduled date and time must be valid.', 400)
      }

      if (normalizedScheduledAt !== existingSession.scheduled_at) {
        updateValues.scheduled_at = normalizedScheduledAt
        auditEntries.push({
          session_id: existingSession.id,
          changed_by: authResult.profile.id,
          change_type: 'reschedule',
          old_value: {
            scheduledAt: existingSession.scheduled_at,
          },
          new_value: {
            scheduledAt: normalizedScheduledAt,
          },
        })
      }
    }

    if (input.status && input.status !== existingSession.status) {
      updateValues.status = input.status
      auditEntries.push({
        session_id: existingSession.id,
        changed_by: authResult.profile.id,
        change_type: 'status_change',
        old_value: {
          status: existingSession.status,
        },
        new_value: {
          status: input.status,
        },
      })
    }

    const { data: updatedSession, error: updateError } = await supabase
      .from('pt_sessions')
      .update(updateValues)
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (updateError) {
      throw new Error(`Failed to update the PT session: ${updateError.message}`)
    }

    if (!updatedSession) {
      return createErrorResponse('PT session not found.', 404)
    }

    if (auditEntries.length > 0) {
      const { error: auditError } = await supabase
        .from('pt_session_changes')
        .insert(auditEntries)

      if (auditError) {
        throw new Error(`Failed to record PT session history: ${auditError.message}`)
      }
    }

    const detail = await readPtSessionDetail(supabase, id)

    if (!detail) {
      throw new Error('Failed to read the updated PT session.')
    }

    return NextResponse.json({
      ok: true,
      session: detail.session,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while updating the PT session.',
      500,
    )
  }
}
