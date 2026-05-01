import { NextResponse } from 'next/server'
import { z } from 'zod'
import { config } from '@/lib/config'
import { getMonthRange, PT_SESSION_FILTER_STATUSES } from '@/lib/pt-scheduling'
import { readPtSessions } from '@/lib/pt-scheduling-server'
import { requireAdminUser, requireAuthenticatedProfile } from '@/lib/server-auth'
import { isFrontDeskStaff } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const sessionFiltersSchema = z.object({
  trainerId: z.string().uuid().optional(),
  memberId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/u, 'Month filters must use YYYY-MM format.').optional(),
  status: z.enum(PT_SESSION_FILTER_STATUSES).optional(),
  past: z.literal('true').optional(),
})

const deletePtSessionsSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/u, 'Month filters must use YYYY-MM format.'),
    assignmentIds: z.array(z.string().trim().min(1)).min(1, 'Select at least one assignment.'),
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

function createNotFoundResponse() {
  return createErrorResponse('Not found.', 404)
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAuthenticatedProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    const { searchParams } = new URL(request.url)
    const filters = sessionFiltersSchema.parse({
      trainerId: searchParams.get('trainerId') ?? undefined,
      memberId: searchParams.get('memberId') ?? undefined,
      assignmentId: searchParams.get('assignmentId') ?? undefined,
      month: searchParams.get('month') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      past: searchParams.get('past') ?? undefined,
    })
    const nextFilters = { ...filters }

    if (authResult.profile.role !== 'admin') {
      if (isFrontDeskStaff(authResult.profile.titles)) {
        if (!filters.memberId || filters.trainerId) {
          return createErrorResponse('Forbidden', 403)
        }
      } else {
        if (filters.trainerId && filters.trainerId !== authResult.profile.id) {
          return createErrorResponse('Forbidden', 403)
        }

        nextFilters.trainerId = authResult.profile.id
      }
    }

    const supabase = getSupabaseAdminClient() as any
    const sessions = await readPtSessions(supabase, nextFilters)

    return NextResponse.json({
      sessions,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while loading PT sessions.',
      500,
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    if (!config.features.showDevRemovePtSessionsButton) {
      return createNotFoundResponse()
    }

    const requestBody = await request.json()
    const input = deletePtSessionsSchema.parse(requestBody)
    const monthMatch = /^(\d{4})-(\d{2})$/u.exec(input.month)

    if (!monthMatch) {
      return createErrorResponse('Month filters must use YYYY-MM format.', 400)
    }

    const [, yearPart, monthPart] = monthMatch
    const monthRange = getMonthRange(Number(monthPart), Number(yearPart))

    if (!monthRange) {
      return createErrorResponse('Month filters must use a valid calendar month.', 400)
    }

    const assignmentIds = Array.from(new Set(input.assignmentIds))
    const supabase = getSupabaseAdminClient() as any
    const { data: matchingSessions, error: matchingSessionsError } = await supabase
      .from('pt_sessions')
      .select('id, assignment_id')
      .in('assignment_id', assignmentIds)
      .gte('scheduled_at', monthRange.startInclusive)
      .lt('scheduled_at', monthRange.endExclusive)

    if (matchingSessionsError) {
      throw new Error(`Failed to read PT sessions to remove: ${matchingSessionsError.message}`)
    }

    const targetSessions = (matchingSessions ?? []) as Array<{
      id: string
      assignment_id: string
    }>

    if (targetSessions.length === 0) {
      return NextResponse.json({
        ok: true,
        deletedSessions: 0,
        deletedAssignments: 0,
      })
    }

    const sessionIds = targetSessions.map((session) => session.id)
    const deletedAssignmentIds = new Set(targetSessions.map((session) => session.assignment_id))
    const archivedAt = new Date().toISOString()
    const { error: deleteSessionsError } = await supabase.rpc(
      'delete_pt_sessions_and_archive_notifications',
      {
        session_ids: sessionIds,
        archived_at: archivedAt,
      },
    )

    if (deleteSessionsError) {
      throw new Error(`Failed to remove PT sessions: ${deleteSessionsError.message}`)
    }

    return NextResponse.json({
      ok: true,
      deletedSessions: sessionIds.length,
      deletedAssignments: deletedAssignmentIds.size,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while removing PT sessions.',
      500,
    )
  }
}
