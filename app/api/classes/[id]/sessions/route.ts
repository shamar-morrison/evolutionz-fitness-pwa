import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  addDaysToDateValue,
  getDaysBetweenDateValues,
  getUtcDateFromDateValue,
  isClassRegistrationEligibleForSession,
} from '@/lib/classes'
import {
  readClassById,
  readClassRegistrations,
  readClassSessions,
} from '@/lib/classes-server'
import { getJamaicaDateValue } from '@/lib/pt-scheduling'
import { requireAdminUser, requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const dateValueSchema = z.string().trim().regex(/^(\d{4})-(\d{2})-(\d{2})$/u)
const scheduledAtSchema = z
  .string()
  .trim()
  .regex(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})-05:00$/u)

const generateSessionsSchema = z
  .object({
    sessions: z
      .array(
        z
          .object({
            scheduled_at: scheduledAtSchema,
          })
          .strict(),
      )
      .default([]),
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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const periodStart = dateValueSchema.parse(searchParams.get('period_start'))
    const supabase = getSupabaseAdminClient()
    const profile = await readStaffProfile(supabase, authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const sessions = await readClassSessions(supabase, id, periodStart)

    return NextResponse.json({
      sessions,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse('period_start must be a valid YYYY-MM-DD date.', 400)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while loading class sessions.',
      500,
    )
  }
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
    const supabase = getSupabaseAdminClient()
    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    if (!classItem.current_period_start) {
      return createErrorResponse('Set a period start date before generating sessions.', 400)
    }

    const periodEnd = addDaysToDateValue(classItem.current_period_start, 27)

    if (!periodEnd || !getUtcDateFromDateValue(periodEnd)) {
      throw new Error('Failed to resolve the current class period.')
    }

    const scheduledAtValues = Array.from(new Set(input.sessions.map((session) => session.scheduled_at)))

    for (const scheduledAt of scheduledAtValues) {
      const sessionDateValue = getJamaicaDateValue(scheduledAt)

      if (!sessionDateValue) {
        return createErrorResponse('Each scheduled_at value must be a valid Jamaica-local timestamp.', 400)
      }

      const periodOffset = getDaysBetweenDateValues(classItem.current_period_start, sessionDateValue)

      if (periodOffset === null || periodOffset < 0 || periodOffset > 27) {
        return createErrorResponse(
          'Each scheduled_at value must fall within the current 28-day period.',
          400,
        )
      }
    }

    if (scheduledAtValues.length === 0) {
      return NextResponse.json({
        ok: true,
        count: 0,
      })
    }

    const { data: existingBeforeData, error: existingBeforeError } = await supabase
      .from('class_sessions')
      .select('id, scheduled_at')
      .eq('class_id', id)
      .eq('period_start', classItem.current_period_start)
      .in('scheduled_at', scheduledAtValues)

    if (existingBeforeError) {
      throw new Error(`Failed to read existing class sessions: ${existingBeforeError.message}`)
    }

    const existingScheduledAtSet = new Set(
      ((existingBeforeData ?? []) as Array<{ scheduled_at: string }>).map((session) =>
        String(session.scheduled_at),
      ),
    )

    const { error: upsertError } = await supabase.from('class_sessions').upsert(
      scheduledAtValues.map((scheduledAt) => ({
        class_id: id,
        scheduled_at: scheduledAt,
        period_start: classItem.current_period_start,
      })),
      {
        onConflict: 'class_id,scheduled_at',
        ignoreDuplicates: true,
      },
    )

    if (upsertError) {
      throw new Error(`Failed to generate class sessions: ${upsertError.message}`)
    }

    const { data: existingAfterData, error: existingAfterError } = await supabase
      .from('class_sessions')
      .select('id, scheduled_at, period_start')
      .eq('class_id', id)
      .eq('period_start', classItem.current_period_start)
      .in('scheduled_at', scheduledAtValues)

    if (existingAfterError) {
      throw new Error(`Failed to read generated class sessions: ${existingAfterError.message}`)
    }

    const newSessions = ((existingAfterData ?? []) as Array<{
      id: string
      scheduled_at: string
      period_start: string
    }>).filter((session) => !existingScheduledAtSet.has(String(session.scheduled_at)))

    if (newSessions.length > 0) {
      const approvedRegistrations = await readClassRegistrations(supabase, id, {
        status: 'approved',
      })
      const attendanceRows = newSessions.flatMap((session) =>
        approvedRegistrations
          .filter((registration) =>
            isClassRegistrationEligibleForSession(
              registration.month_start,
              session.scheduled_at,
              session.period_start,
            ),
          )
          .map((registration) => ({
            session_id: session.id,
            member_id: registration.member_id,
            guest_profile_id: registration.guest_profile_id,
            marked_by: null,
            marked_at: null,
          })),
      )

      if (attendanceRows.length > 0) {
        const { error: attendanceInsertError } = await supabase
          .from('class_attendance')
          .insert(attendanceRows)

        if (attendanceInsertError) {
          throw new Error(
            `Failed to seed generated class attendance rows: ${attendanceInsertError.message}`,
          )
        }
      }
    }

    return NextResponse.json({
      ok: true,
      count: newSessions.length,
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
        : 'Unexpected server error while generating class sessions.',
      500,
    )
  }
}
