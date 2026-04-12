import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeTimeInputValue } from '@/lib/member-access-time'
import {
  buildAssignmentSchedule,
  DAYS_OF_WEEK,
  MAX_PT_SESSIONS_PER_WEEK,
  normalizeAssignmentTrainingPlan,
  PT_ASSIGNMENT_STATUSES,
  type CreatePtAssignmentData,
  type ScheduledSessionInput,
} from '@/lib/pt-scheduling'
import { readTrainerClientById, readTrainerClients } from '@/lib/pt-scheduling-server'
import { requireAdminUser, requireAuthenticatedProfile } from '@/lib/server-auth'
import { hasStaffTitle, isFrontDeskStaff, readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const assignmentFiltersSchema = z.object({
  trainerId: z.string().uuid().optional(),
  memberId: z.string().uuid().optional(),
  status: z.enum(PT_ASSIGNMENT_STATUSES).optional(),
})

const createAssignmentSchema = z
  .object({
    trainerId: z.string().uuid(),
    memberId: z.string().uuid(),
    ptFee: z.number().int().min(0, 'PT fee must be zero or greater.'),
    sessionsPerWeek: z.number().int().min(1).max(MAX_PT_SESSIONS_PER_WEEK),
    scheduledSessions: z.array(
      z
        .object({
          day: z.enum(DAYS_OF_WEEK),
          sessionTime: z.string().trim().regex(/^\d{2}:\d{2}$/u, 'Session time must use HH:MM format.'),
        })
        .strict(),
    ),
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

function validateScheduledSessions(
  input: Pick<CreatePtAssignmentData, 'scheduledSessions' | 'sessionsPerWeek'>,
) {
  const uniqueDays = new Set<string>()

  for (const entry of input.scheduledSessions) {
    if (uniqueDays.has(entry.day)) {
      return 'Scheduled days must be unique.'
    }

    if (!normalizeTimeInputValue(entry.sessionTime)) {
      return `Session time for ${entry.day} must use HH:MM format.`
    }

    uniqueDays.add(entry.day)
  }

  if (uniqueDays.size !== input.sessionsPerWeek) {
    return 'Scheduled days must match the selected sessions per week.'
  }

  return null
}

function validateTrainingPlan(
  trainingPlan: CreatePtAssignmentData['trainingPlan'] | undefined,
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

export async function GET(request: Request) {
  try {
    const authResult = await requireAuthenticatedProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    const { searchParams } = new URL(request.url)
    const filters = assignmentFiltersSchema.parse({
      trainerId: searchParams.get('trainerId') ?? undefined,
      memberId: searchParams.get('memberId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    })
    const nextFilters = { ...filters }

    if (authResult.profile.role !== 'admin') {
      const titles = authResult.profile.titles
      const isTrainer = hasStaffTitle(titles, 'Trainer')
      const isFrontDesk = isFrontDeskStaff(titles)
      const enforceTrainerScope = () => {
        if (filters.trainerId && filters.trainerId !== authResult.profile.id) {
          return createErrorResponse('Forbidden', 403)
        }

        nextFilters.trainerId = authResult.profile.id
        return null
      }

      if (isTrainer) {
        const trainerScopeResponse = enforceTrainerScope()

        if (trainerScopeResponse) {
          return trainerScopeResponse
        }
      } else if (isFrontDesk) {
        if (!filters.memberId || filters.trainerId) {
          return createErrorResponse('Forbidden', 403)
        }
      } else {
        const trainerScopeResponse = enforceTrainerScope()

        if (trainerScopeResponse) {
          return trainerScopeResponse
        }
      }
    }

    const supabase = getSupabaseAdminClient() as any
    const assignments = await readTrainerClients(supabase, nextFilters)

    return NextResponse.json({
      assignments,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while loading PT assignments.',
      500,
    )
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = createAssignmentSchema.parse(requestBody)
    const scheduledSessionsError = validateScheduledSessions(input)

    if (scheduledSessionsError) {
      return createErrorResponse(scheduledSessionsError, 400)
    }

    const normalizedTrainingPlan = normalizeAssignmentTrainingPlan(input.trainingPlan ?? [])
    const normalizedSchedule = buildAssignmentSchedule(input.scheduledSessions, normalizedTrainingPlan)
    const trainingPlanError = validateTrainingPlan(input.trainingPlan, input.scheduledSessions)

    if (trainingPlanError) {
      return createErrorResponse(trainingPlanError, 400)
    }

    const representativeSessionTime = normalizedSchedule[0]?.sessionTime
    const normalizedSessionTime =
      representativeSessionTime ? normalizeTimeInputValue(representativeSessionTime) : null

    if (!normalizedSessionTime) {
      return createErrorResponse('Session time must use HH:MM format.', 400)
    }

    const supabase = getSupabaseAdminClient() as any
    const trainerProfile = await readStaffProfile(supabase, input.trainerId)

    if (!trainerProfile || !hasStaffTitle(trainerProfile.titles, 'Trainer')) {
      return createErrorResponse('The selected staff member is not a trainer.', 400)
    }

    const { data: activeAssignment, error: activeAssignmentError } = await supabase
      .from('trainer_clients')
      .select('id')
      .eq('member_id', input.memberId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (activeAssignmentError) {
      throw new Error(`Failed to check existing PT assignments: ${activeAssignmentError.message}`)
    }

    if (activeAssignment) {
      return createErrorResponse('This member already has an active trainer assignment.', 400)
    }

    const { data: existingPair, error: existingPairError } = await supabase
      .from('trainer_clients')
      .select('id, status')
      .eq('trainer_id', input.trainerId)
      .eq('member_id', input.memberId)
      .limit(1)
      .maybeSingle()

    if (existingPairError) {
      throw new Error(`Failed to check the trainer-member assignment pair: ${existingPairError.message}`)
    }

    if (existingPair) {
      return createErrorResponse(
        existingPair.status === 'inactive'
          ? 'This trainer already has an inactive assignment for the selected member. Update that assignment instead of creating a duplicate.'
          : 'This trainer is already assigned to the selected member.',
        400,
      )
    }

    const { data: insertedAssignment, error: insertError } = await supabase
      .from('trainer_clients')
      .insert({
        trainer_id: input.trainerId,
        member_id: input.memberId,
        pt_fee: input.ptFee,
        sessions_per_week: input.sessionsPerWeek,
        scheduled_days: normalizedSchedule.map((entry) => entry.day),
        session_time: normalizedSessionTime,
        notes: normalizeOptionalNotes(input.notes),
      })
      .select('id')
      .maybeSingle()

    if (insertError) {
      throw new Error(`Failed to create the PT assignment: ${insertError.message}`)
    }

    const assignmentId = insertedAssignment?.id as string | undefined

    if (!assignmentId) {
      throw new Error('Failed to create the PT assignment: missing assignment id in response.')
    }

    if (normalizedSchedule.length > 0) {
      const { error: trainingPlanError } = await supabase.from('training_plan_days').insert(
        normalizedSchedule.map((entry) => ({
          assignment_id: assignmentId,
          day_of_week: entry.day,
          session_time: normalizeTimeInputValue(entry.sessionTime),
          training_type_name: entry.trainingTypeName,
        })),
      )

      if (trainingPlanError) {
        const { error: rollbackError } = await supabase
          .from('trainer_clients')
          .delete()
          .eq('id', assignmentId)

        if (rollbackError) {
          throw new Error(
            `Failed to create the PT assignment training plan: ${trainingPlanError.message}. Rollback also failed: ${rollbackError.message}`,
          )
        }

        throw new Error(`Failed to create the PT assignment training plan: ${trainingPlanError.message}`)
      }
    }

    const assignment = await readTrainerClientById(supabase, assignmentId)

    if (!assignment) {
      throw new Error('Failed to read the created PT assignment.')
    }

    return NextResponse.json(
      {
        ok: true,
        assignment,
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
      error instanceof Error ? error.message : 'Unexpected server error while creating the PT assignment.',
      500,
    )
  }
}
