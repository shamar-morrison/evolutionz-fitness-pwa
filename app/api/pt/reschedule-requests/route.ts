import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readPtRescheduleRequests } from '@/lib/pt-scheduling-server'
import { requireAuthenticatedProfile } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const requestFiltersSchema = z.object({
  status: z.enum(['pending', 'approved', 'denied']).optional(),
  requestedBy: z.literal('me').optional(),
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
    const filters = requestFiltersSchema.parse({
      status: searchParams.get('status') ?? undefined,
      requestedBy: searchParams.get('requestedBy') ?? undefined,
    })
    const requestedBy =
      filters.requestedBy === 'me'
        ? authResult.profile.id
        : authResult.profile.role === 'admin'
          ? undefined
          : null

    if (authResult.profile.role !== 'admin' && requestedBy === null) {
      return createErrorResponse('Forbidden', 403)
    }

    const supabase = getSupabaseAdminClient() as any
    const requests = await readPtRescheduleRequests(supabase, {
      status: filters.status,
      requestedBy: requestedBy ?? undefined,
    })

    return NextResponse.json({
      requests,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading reschedule requests.',
      500,
    )
  }
}
