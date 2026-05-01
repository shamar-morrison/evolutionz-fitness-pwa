import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeTimeInputValue } from '@/lib/member-access-time'
import {
  buildAssignmentSchedule,
  DAYS_OF_WEEK,
  MAX_PT_SESSIONS_PER_WEEK,
  normalizeAssignmentTrainingPlan,
  PT_ASSIGNMENT_STATUSES,
  type AssignmentTrainingPlanInput,
  type ScheduledSessionInput,
} from '@/lib/pt-scheduling'
import {
  normalizePtAssignmentScheduleRows,
  readTrainerClientById,
  readTrainerClientRowById,
  replacePtAssignmentSchedule,
} from '@/lib/pt-scheduling-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const updateAssignmentSchema = z
  .object({
    status: z.enum(PT_ASSIGNMENT_STATUSES).optional(),
    ptFee: z.number().int().min(0, 'PT fee must be zero or greater.').optional(),
    sessionsPerWeek: z.number().int().min(1).max(MAX_PT_SESSIONS_PER_WEEK).optional(),
    scheduledSessions: z
      .array(
        z
          .object({
            day: z.enum(DAYS_OF_WEEK),
            sessionTime: z.string().trim().regex(/^\d{2}:\d{2}$/u, 'Session time must use HH:MM format.'),
          })
          .strict(),
      )
      .optional(),
    trainingPlan: z
      .array(
        z
          .object({
            day: z.enum(DAYS_OF_WEEK),
            trainingTypeName: z.string().trim().min(1, 'Training type is required.'),
          })
          .strict(),
      )
      .optional(),
    notes: z.string().trim().nullable().optional(),
  })
  .strict()

const deleteAssignmentSchema = z
  .object({
    cancelFutureSessions: z.boolean(),
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

function validateScheduledSessions(scheduledSessions: ScheduledSessionInput[], sessionsPerWeek: number) {
  const uniqueDays = new Set<string>()

  for (const entry of scheduledSessions) {
    if (uniqueDays.has(entry.day)) {
      return 'Scheduled days must be unique.'
    }

    if (!normalizeTimeInputValue(entry.sessionTime)) {
      return `Session time for ${entry.day} must use HH:MM format.`
    }

    uniqueDays.add(entry.day)
  }

  if (uniqueDays.size !== sessionsPerWeek) {
    return 'Scheduled days must match the selected sessions per week.'
  }

  return null
}

function validateTrainingPlan(
  trainingPlan: AssignmentTrainingPlanInput[] | undefined,
  scheduledSessions: ScheduledSessionInput[],
) {
  const scheduledDays = scheduledSessions.map((entry) => entry.day)
  const normalizedTrainingPlan = normalizeAssignmentTrainingPlan(trainingPlan ?? [])

  if (normalizedTrainingPlan.length !== (trainingPlan ?? []).length) {
    return 'Training plan days must be unique and use valid training types.'
  }

  for (const entry of normalizedTrainingPlan) {
    if (!scheduledDays.includes(entry.day)) {
      return `Training plan day ${entry.day} must also be selected in scheduled days.`
    }
  }

  return null
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
    const assignment = await readTrainerClientById(supabase, id)

    if (!assignment) {
      return createErrorResponse('PT assignment not found.', 404)
    }

    return NextResponse.json({
      ok: true,
      assignment,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while loading the PT assignment.',
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
    const input = updateAssignmentSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as any
    const existingAssignmentRow = await readTrainerClientRowById(supabase, id)
    const existingAssignment = await readTrainerClientById(supabase, id)

    if (!existingAssignmentRow || !existingAssignment) {
      return createErrorResponse('PT assignment not found.', 404)
    }

    const existingScheduledSessions = existingAssignment.scheduledSessions.map(({ day, sessionTime }) => ({
      day,
      sessionTime,
    }))
    const nextSessionsPerWeek = input.sessionsPerWeek ?? existingAssignmentRow.sessions_per_week
    const nextScheduledSessions = input.scheduledSessions ?? existingScheduledSessions
    const nextTrainingPlan =
      typeof input.trainingPlan === 'undefined'
        ? existingAssignment.trainingPlan.map(({ day, trainingTypeName }) => ({
            day,
            trainingTypeName,
          }))
        : normalizeAssignmentTrainingPlan(input.trainingPlan)
    const scheduledSessionsError = validateScheduledSessions(nextScheduledSessions, nextSessionsPerWeek)
    const trainingPlanError = validateTrainingPlan(nextTrainingPlan, nextScheduledSessions)
    const nextSchedule = buildAssignmentSchedule(nextScheduledSessions, nextTrainingPlan)
    const shouldReplaceSchedule =
      typeof input.trainingPlan !== 'undefined' || typeof input.scheduledSessions !== 'undefined'

    if (scheduledSessionsError) {
      return createErrorResponse(scheduledSessionsError, 400)
    }

    if (trainingPlanError) {
      return createErrorResponse(trainingPlanError, 400)
    }

    const normalizedSchedule = shouldReplaceSchedule
      ? normalizePtAssignmentScheduleRows(nextSchedule)
      : null

    if (shouldReplaceSchedule && !normalizedSchedule) {
      return createErrorResponse('Session time must use HH:MM format.', 400)
    }

    const nextStatus = input.status ?? existingAssignment.status

    if (nextStatus === 'active') {
      const { data: activeAssignment, error: activeAssignmentError } = await supabase
        .from('trainer_clients')
        .select('id')
        .eq('member_id', existingAssignmentRow.member_id)
        .eq('status', 'active')
        .neq('id', id)
        .limit(1)
        .maybeSingle()

      if (activeAssignmentError) {
        throw new Error(`Failed to validate active PT assignments: ${activeAssignmentError.message}`)
      }

      if (activeAssignment) {
        return createErrorResponse('This member already has another active trainer assignment.', 400)
      }
    }

    const updateValues: Record<string, unknown> = {}
    const hasDirectAssignmentFieldUpdates =
      Boolean(input.status) ||
      typeof input.ptFee === 'number' ||
      typeof input.notes !== 'undefined' ||
      (typeof input.sessionsPerWeek === 'number' && !shouldReplaceSchedule)

    if (!shouldReplaceSchedule || hasDirectAssignmentFieldUpdates) {
      updateValues.updated_at = new Date().toISOString()
    }

    if (input.status) {
      updateValues.status = input.status
    }

    if (typeof input.ptFee === 'number') {
      updateValues.pt_fee = input.ptFee
    }

    if (typeof input.sessionsPerWeek === 'number' && !shouldReplaceSchedule) {
      updateValues.sessions_per_week = input.sessionsPerWeek
    }

    if (typeof input.notes !== 'undefined') {
      updateValues.notes = normalizeOptionalNotes(input.notes)
    }

    if (Object.keys(updateValues).length > 0) {
      const { data: updatedAssignment, error: updateError } = await supabase
        .from('trainer_clients')
        .update(updateValues)
        .eq('id', id)
        .select('id')
        .maybeSingle()

      if (updateError) {
        throw new Error(`Failed to update the PT assignment: ${updateError.message}`)
      }

      if (!updatedAssignment) {
        return createErrorResponse('PT assignment not found.', 404)
      }
    }

    if (shouldReplaceSchedule && normalizedSchedule) {
      const replacedAssignmentId = await replacePtAssignmentSchedule(supabase, {
        assignmentId: id,
        sessionsPerWeek: nextSessionsPerWeek,
        scheduledDays: nextSchedule.map((entry) => entry.day),
        schedule: normalizedSchedule,
      })

      if (!replacedAssignmentId) {
        return createErrorResponse('PT assignment not found.', 404)
      }
    }

    const assignment = await readTrainerClientById(supabase, id)

    if (!assignment) {
      throw new Error('Failed to read the updated PT assignment.')
    }

    return NextResponse.json({
      ok: true,
      assignment,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while updating the PT assignment.',
      500,
    )
  }
}

export async function DELETE(
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
    const input = deleteAssignmentSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as any
    const existingAssignment = await readTrainerClientRowById(supabase, id)

    if (!existingAssignment) {
      return createErrorResponse('PT assignment not found.', 404)
    }

    const { data: updatedAssignment, error: assignmentError } = await supabase
      .from('trainer_clients')
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (assignmentError) {
      throw new Error(`Failed to remove the PT assignment: ${assignmentError.message}`)
    }

    if (!updatedAssignment) {
      return createErrorResponse('PT assignment not found.', 404)
    }

    let cancelledSessions = 0

    if (input.cancelFutureSessions) {
      const { data: cancelledRows, error: sessionError } = await supabase
        .from('pt_sessions')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('assignment_id', id)
        .eq('status', 'scheduled')
        .gt('scheduled_at', new Date().toISOString())
        .select('id')

      if (sessionError) {
        throw new Error(`Failed to cancel future PT sessions: ${sessionError.message}`)
      }

      cancelledSessions = Array.isArray(cancelledRows) ? cancelledRows.length : 0
    }

    return NextResponse.json({
      ok: true,
      cancelledSessions,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while removing the PT assignment.',
      500,
    )
  }
}
