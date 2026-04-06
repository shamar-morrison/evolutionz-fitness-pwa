import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isDateValue } from '@/lib/pt-scheduling'
import { readPtPaymentsReport } from '@/lib/pt-scheduling-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const reportFiltersSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Start date must use YYYY-MM-DD format.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'End date must use YYYY-MM-DD format.'),
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
    const startDate = searchParams.get('startDate') ?? ''
    const endDate = searchParams.get('endDate') ?? ''

    if (!startDate || !endDate) {
      return createErrorResponse('Start date and end date are required.', 400)
    }

    const filters = reportFiltersSchema.parse({
      startDate,
      endDate,
    })

    if (!isDateValue(filters.startDate) || !isDateValue(filters.endDate)) {
      return createErrorResponse('Start date and end date must be valid calendar dates.', 400)
    }

    if (filters.startDate > filters.endDate) {
      return createErrorResponse('Start date must be on or before end date.', 400)
    }

    const supabase = getSupabaseAdminClient() as any
    const report = await readPtPaymentsReport(supabase, filters)

    return NextResponse.json(report)
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading the PT payments report.',
      500,
    )
  }
}
