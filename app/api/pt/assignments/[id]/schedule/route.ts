import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeTimeInputValue } from '@/lib/member-access-time'
import {
  buildAssignmentSchedule,
  DAYS_OF_WEEK,
  MAX_PT_SESSIONS_PER_WEEK,
  normalizeAssignmentTrainingPlan,
  type AssignmentTrainingPlanInput,
  type ScheduledSessionInput,
} from '@/lib/pt-scheduling'
import {
  normalizePtAssignmentScheduleRows,
  replacePtAssignmentSchedule,
  readTrainerClientById,
  readTrainerClientRowById,
} from '@/lib/pt-scheduling-server'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase/server'

const updateAssignmentScheduleSchema = z
  .object({
    sessionsPerWeek: z.number().int().min(1).max(MAX_PT_SESSIONS_PER_WEEK),
    scheduledSessions: z
      .array(
        z
          .object({
            day: z.enum(DAYS_OF_WEEK),
            sessionTime: z.string().trim().regex(/^\d{2}:\d{2}$/u, 'Session time must use HH:MM format.'),
          })
          .strict(),
      )
      .min(1, 'At least one scheduled day is required.'),
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
  })
  .strict()

const SUSPENDED_ACCOUNT_ERROR =
  'Your account has been suspended. Please contact an administrator.'

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

function validateScheduledSessions(
  scheduledSessions: ScheduledSessionInput[],
  sessionsPerWeek: number,
) {
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

  if (uniqueDays.size === 0) {
    return 'At least one scheduled day is required.'
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

async function readAuthorizedProfile() {
  const authResult = await requireAuthenticatedUser()

  if ('response' in authResult) {
    return authResult
  }

  const profile = await readStaffProfile(await createClient(), authResult.user.id)

  if (!profile) {
    return {
      response: createErrorResponse('Forbidden', 403),
    }
  }

  if (profile.isSuspended) {
    return {
      response: createErrorResponse(SUSPENDED_ACCOUNT_ERROR, 403),
    }
  }

  return {
    user: authResult.user,
    profile,
    permissions: resolvePermissionsForProfile(profile),
  }
}

function isAuthorizedForAssignment(
  role: string,
  profileId: string,
  assignmentTrainerId: string,
) {
  return role === 'admin' || assignmentTrainerId === profileId
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await readAuthorizedProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    if (!authResult.permissions.can('pt.manageOwnSchedule')) {
      return createErrorResponse('Forbidden', 403)
    }

    const { id } = await params
    const supabase = getSupabaseAdminClient() as any
    const assignmentRow = await readTrainerClientRowById(supabase, id)

    if (!assignmentRow) {
      return createErrorResponse('PT assignment not found.', 404)
    }

    if (
      !isAuthorizedForAssignment(
        authResult.permissions.role,
        authResult.profile.id,
        assignmentRow.trainer_id,
      )
    ) {
      return createErrorResponse('Forbidden', 403)
    }

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
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading the trainer schedule.',
      500,
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await readAuthorizedProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    if (!authResult.permissions.can('pt.manageOwnSchedule')) {
      return createErrorResponse('Forbidden', 403)
    }

    const { id } = await params
    const requestBody = await request.json()
    const input = updateAssignmentScheduleSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as any
    const existingAssignmentRow = await readTrainerClientRowById(supabase, id)

    if (!existingAssignmentRow) {
      return createErrorResponse('PT assignment not found.', 404)
    }

    if (
      !isAuthorizedForAssignment(
        authResult.permissions.role,
        authResult.profile.id,
        existingAssignmentRow.trainer_id,
      )
    ) {
      return createErrorResponse('Forbidden', 403)
    }

    const scheduledSessionsError = validateScheduledSessions(
      input.scheduledSessions,
      input.sessionsPerWeek,
    )
    const trainingPlanError = validateTrainingPlan(input.trainingPlan, input.scheduledSessions)
    const nextSchedule = buildAssignmentSchedule(
      input.scheduledSessions,
      input.trainingPlan ?? [],
    )

    if (scheduledSessionsError) {
      return createErrorResponse(scheduledSessionsError, 400)
    }

    if (trainingPlanError) {
      return createErrorResponse(trainingPlanError, 400)
    }

    const normalizedSchedule = normalizePtAssignmentScheduleRows(nextSchedule)

    if (!normalizedSchedule) {
      return createErrorResponse('Session time must use HH:MM format.', 400)
    }

    const replacedAssignmentId = await replacePtAssignmentSchedule(supabase, {
      assignmentId: id,
      sessionsPerWeek: input.sessionsPerWeek,
      scheduledDays: nextSchedule.map((entry) => entry.day),
      schedule: normalizedSchedule,
    })

    if (!replacedAssignmentId) {
      return createErrorResponse('PT assignment not found.', 404)
    }

    const assignment = await readTrainerClientById(supabase, id)

    if (!assignment) {
      throw new Error('Failed to read the updated PT assignment schedule.')
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
      error instanceof Error
        ? error.message
        : 'Unexpected server error while updating the trainer schedule.',
      500,
    )
  }
}
