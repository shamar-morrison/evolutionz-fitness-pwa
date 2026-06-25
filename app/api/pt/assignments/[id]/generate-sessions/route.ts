import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  buildJamaicaScheduledAt,
  getDateRangeBoundsInJamaica,
  getIsoWeekKey,
  getJamaicaDateValue,
  getPtSessionGenerationEndDate,
  getScheduledDateValuesForRange,
  getScheduledSessionForStartDate,
  MAX_PT_SESSIONS_PER_WEEK,
  PT_SESSION_GENERATION_DURATIONS,
} from '@/lib/pt-scheduling'
import { readTrainerClientById } from '@/lib/pt-scheduling-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const generateSessionsSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    duration: z.enum(PT_SESSION_GENERATION_DURATIONS),
    firstSessionTime: z.string().trim().optional(),
    override: z.boolean().optional(),
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

export async function POST(
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
    const input = generateSessionsSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as any
    const assignment = await readTrainerClientById(supabase, id)

    if (!assignment) {
      return createErrorResponse('PT assignment not found.', 404)
    }

    if (assignment.status !== 'active') {
      return createErrorResponse('Sessions can only be generated for active PT assignments.', 400)
    }

    const endDate = getPtSessionGenerationEndDate(input.startDate, input.duration)

    if (!endDate) {
      return createErrorResponse('Invalid start date or duration.', 400)
    }

    const range = getDateRangeBoundsInJamaica(input.startDate, endDate)

    if (!range) {
      return createErrorResponse('Invalid generation date range.', 400)
    }

    const startDateScheduledSession = getScheduledSessionForStartDate(
      assignment.scheduledSessions,
      input.startDate,
    )
    const firstSessionTime = startDateScheduledSession?.sessionTime ?? input.firstSessionTime
    const firstScheduledAt = firstSessionTime
      ? buildJamaicaScheduledAt(input.startDate, firstSessionTime)
      : null

    if (!firstScheduledAt) {
      return createErrorResponse(
        'First session time is required when the start date is not a scheduled training day.',
        400,
      )
    }

    const scheduledAtSet = new Set<string>([firstScheduledAt])

    for (const { day, sessionTime } of assignment.scheduledSessions) {
      for (const dateValue of getScheduledDateValuesForRange(input.startDate, endDate, [day])) {
        if (dateValue === input.startDate) {
          continue
        }

        const scheduledAt = buildJamaicaScheduledAt(dateValue, sessionTime)

        if (scheduledAt) {
          scheduledAtSet.add(scheduledAt)
        }
      }
    }

    const candidateScheduledAtValues = Array.from(scheduledAtSet).sort()

    const { data: existingAssignmentSessions, error: existingAssignmentSessionsError } =
      await supabase
        .from('pt_sessions')
        .select('scheduled_at')
        .eq('assignment_id', assignment.id)
        .gte('scheduled_at', range.startInclusive)
        .lt('scheduled_at', range.endExclusive)

    if (existingAssignmentSessionsError) {
      throw new Error(
        `Failed to read existing PT sessions for this assignment: ${existingAssignmentSessionsError.message}`,
      )
    }

    const existingAssignmentSessionSet = new Set<string>(
      ((existingAssignmentSessions ?? []) as Array<{ scheduled_at: string }>).map(
        (session) => session.scheduled_at,
      ),
    )
    const scheduledAtValuesToInsert = candidateScheduledAtValues.filter(
      (scheduledAt) => !existingAssignmentSessionSet.has(scheduledAt),
    )
    const skipped = candidateScheduledAtValues.length - scheduledAtValuesToInsert.length
    const bufferRangeStart = new Date(new Date(range.startInclusive).getTime() - 7 * 86_400_000)
    const bufferRangeEnd = new Date(new Date(range.endExclusive).getTime() + 7 * 86_400_000)
    const { data: existingPairSessions, error: existingPairSessionsError } = await supabase
      .from('pt_sessions')
      .select('id, scheduled_at')
      .eq('trainer_id', assignment.trainerId)
      .eq('member_id', assignment.memberId)
      .gte('scheduled_at', bufferRangeStart.toISOString())
      .lt('scheduled_at', bufferRangeEnd.toISOString())

    if (existingPairSessionsError) {
      throw new Error(
        `Failed to read existing PT sessions for this trainer-member pair: ${existingPairSessionsError.message}`,
      )
    }

    const sessionsByWeek = new Map<string, number>()

    for (const session of (existingPairSessions ?? []) as Array<{ scheduled_at: string }>) {
      const dateValue = getJamaicaDateValue(session.scheduled_at)
      const weekKey = dateValue ? getIsoWeekKey(dateValue) : null

      if (!weekKey) {
        continue
      }

      sessionsByWeek.set(weekKey, (sessionsByWeek.get(weekKey) ?? 0) + 1)
    }

    const pendingWeeks = new Set<string>()
    const pendingInsertsByWeek = new Map<string, number>()

    for (const scheduledAt of scheduledAtValuesToInsert) {
      const dateValue = getJamaicaDateValue(scheduledAt)
      const weekKey = dateValue ? getIsoWeekKey(dateValue) : null

      if (!weekKey) {
        continue
      }

      const nextPendingCount = (pendingInsertsByWeek.get(weekKey) ?? 0) + 1
      pendingInsertsByWeek.set(weekKey, nextPendingCount)

      if ((sessionsByWeek.get(weekKey) ?? 0) + nextPendingCount > MAX_PT_SESSIONS_PER_WEEK) {
        pendingWeeks.add(weekKey)
      }
    }

    if (pendingWeeks.size > 0 && !input.override) {
      return NextResponse.json({
        ok: false,
        code: 'WEEK_LIMIT_EXCEEDED',
        weeks: Array.from(pendingWeeks).sort(),
      })
    }

    if (scheduledAtValuesToInsert.length === 0) {
      return NextResponse.json({
        ok: true,
        generated: 0,
        skipped,
      })
    }

    const { error: insertError } = await supabase.from('pt_sessions').insert(
      scheduledAtValuesToInsert.map((scheduledAt) => ({
        assignment_id: assignment.id,
        trainer_id: assignment.trainerId,
        member_id: assignment.memberId,
        scheduled_at: scheduledAt,
        status: 'scheduled',
        is_recurring: true,
        updated_at: new Date().toISOString(),
      })),
    )

    if (insertError) {
      throw new Error(`Failed to insert generated PT sessions: ${insertError.message}`)
    }

    return NextResponse.json({
      ok: true,
      generated: scheduledAtValuesToInsert.length,
      skipped,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while generating PT sessions.',
      500,
    )
  }
}
