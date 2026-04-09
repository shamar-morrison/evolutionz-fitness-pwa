import { NextResponse } from 'next/server'
import { z } from 'zod'
import { CLASS_PAYMENTS_REPORT_STATUSES } from '@/lib/classes'
import { readClassPaymentsReport } from '@/lib/classes-server'
import { isDateValue } from '@/lib/pt-scheduling'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const reportFiltersSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Start date must use YYYY-MM-DD format.'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'End date must use YYYY-MM-DD format.'),
  status: z.enum(CLASS_PAYMENTS_REPORT_STATUSES),
  includeZero: z.enum(['true', 'false']).default('false'),
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
    const start = searchParams.get('start') ?? ''
    const end = searchParams.get('end') ?? ''
    const status = searchParams.get('status') ?? ''
    const includeZero = searchParams.get('includeZero') ?? 'false'

    if (!start || !end || !status) {
      return createErrorResponse('Start date, end date, and status are required.', 400)
    }

    const filters = reportFiltersSchema.parse({
      start,
      end,
      status,
      includeZero,
    })

    if (!isDateValue(filters.start) || !isDateValue(filters.end)) {
      return createErrorResponse('Start date and end date must be valid calendar dates.', 400)
    }

    if (filters.start > filters.end) {
      return createErrorResponse('Start date must be on or before end date.', 400)
    }

    const supabase = getSupabaseAdminClient() as any
    const report = await readClassPaymentsReport(supabase, {
      startDate: filters.start,
      endDate: filters.end,
      status: filters.status,
      includeZero: filters.includeZero === 'true',
    })

    return NextResponse.json(report)
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading the class payments report.',
      500,
    )
  }
}
