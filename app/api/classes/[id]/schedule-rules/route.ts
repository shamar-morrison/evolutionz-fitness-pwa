import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readClassById, readClassScheduleRules } from '@/lib/classes-server'
import { normalizeTimeInputValue } from '@/lib/member-access-time'
import { requireAdminUser, requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { ClassScheduleRuleDay } from '@/types'

const createScheduleRuleSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6),
    session_time: z.string().trim().min(1),
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
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const supabase = getSupabaseAdminClient()
    const profile = await readStaffProfile(supabase, authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const scheduleRules = await readClassScheduleRules(supabase, id)

    return NextResponse.json({
      schedule_rules: scheduleRules,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading class schedule rules.',
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
    const input = createScheduleRuleSchema.parse(requestBody)
    const normalizedTime = normalizeTimeInputValue(input.session_time)

    if (!normalizedTime) {
      return createErrorResponse('session_time must be a valid HH:MM or HH:MM:SS time.', 400)
    }

    const supabase = getSupabaseAdminClient()
    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const { data, error } = await supabase
      .from('class_schedule_rules')
      .insert({
        class_id: id,
        day_of_week: input.day_of_week,
        session_time: normalizedTime,
      })
      .select('id, class_id, day_of_week, session_time, created_at')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to create class schedule rule: ${error.message}`)
    }

    if (!data) {
      throw new Error('Failed to create class schedule rule.')
    }

    return NextResponse.json({
      ok: true,
      schedule_rule: {
        id: String(data.id),
        class_id: String(data.class_id),
        day_of_week: Number(data.day_of_week) as ClassScheduleRuleDay,
        session_time: normalizedTime,
        created_at: String(data.created_at),
      },
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
        : 'Unexpected server error while creating the class schedule rule.',
      500,
    )
  }
}
