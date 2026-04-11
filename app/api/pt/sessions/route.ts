import { NextResponse } from 'next/server'
import { z } from 'zod'
import { PT_SESSION_FILTER_STATUSES } from '@/lib/pt-scheduling'
import { readPtSessions } from '@/lib/pt-scheduling-server'
import { requireAuthenticatedProfile } from '@/lib/server-auth'
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

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
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
