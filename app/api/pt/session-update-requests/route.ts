import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readPtSessionUpdateRequests } from '@/lib/pt-scheduling-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const requestFiltersSchema = z.object({
  status: z.enum(['pending', 'approved', 'denied']).optional(),
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
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { searchParams } = new URL(request.url)
    const filters = requestFiltersSchema.parse({
      status: searchParams.get('status') ?? undefined,
    })
    const supabase = getSupabaseAdminClient() as any
    const requests = await readPtSessionUpdateRequests(supabase, filters)

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
        : 'Unexpected server error while loading session update requests.',
      500,
    )
  }
}
