import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  buildJamaicaScheduledAt,
  getIsoWeekKey,
  getJamaicaDateValue,
  getMonthRange,
  normalizeScheduledDays,
  getScheduledDateValuesForMonth,
} from '@/lib/pt-scheduling'
import { readTrainerClientRowById } from '@/lib/pt-scheduling-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const generateSessionsSchema = z
  .object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(9999),
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
    const assignment = await readTrainerClientRowById(supabase, id)

    if (!assignment) {
      return createErrorResponse('PT assignment not found.', 404)
    }

    if (assignment.status !== 'active') {
      return createErrorResponse('Sessions can only be generated for active PT assignments.', 400)
    }

    const monthRange = getMonthRange(input.month, input.year)

    if (!monthRange) {
      return createErrorResponse('Invalid month or year.', 400)
    }

    const scheduledDateValues = getScheduledDateValuesForMonth(
      input.month,
      input.year,
      normalizeScheduledDays(assignment.scheduled_days ?? []),
    )
    const candidateScheduledAtValues = scheduledDateValues
      .map((dateValue) => buildJamaicaScheduledAt(dateValue, assignment.session_time))
      .filter((value): value is string => Boolean(value))

    const { data: existingAssignmentSessions, error: existingAssignmentSessionsError } =
      await supabase
        .from('pt_sessions')
        .select('scheduled_at')
        .eq('assignment_id', assignment.id)
        .gte('scheduled_at', monthRange.startInclusive)
        .lt('scheduled_at', monthRange.endExclusive)

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
    const bufferRangeStart = new Date(new Date(monthRange.startInclusive).getTime() - 7 * 86_400_000)
    const bufferRangeEnd = new Date(new Date(monthRange.endExclusive).getTime() + 7 * 86_400_000)
    const { data: existingPairSessions, error: existingPairSessionsError } = await supabase
      .from('pt_sessions')
      .select('id, scheduled_at')
      .eq('trainer_id', assignment.trainer_id)
      .eq('member_id', assignment.member_id)
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

      if ((sessionsByWeek.get(weekKey) ?? 0) + nextPendingCount > 3) {
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
        trainer_id: assignment.trainer_id,
        member_id: assignment.member_id,
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
