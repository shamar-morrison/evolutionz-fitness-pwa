import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readOverallRevenueReport } from '@/lib/revenue-reports-server'
import { isDateValue } from '@/lib/pt-scheduling'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const revenueReportFiltersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'From date must use YYYY-MM-DD format.'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'To date must use YYYY-MM-DD format.'),
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
    const from = searchParams.get('from') ?? ''
    const to = searchParams.get('to') ?? ''

    if (!from || !to) {
      return createErrorResponse('From and to dates are required.', 400)
    }

    const filters = revenueReportFiltersSchema.parse({ from, to })

    if (!isDateValue(filters.from) || !isDateValue(filters.to)) {
      return createErrorResponse('From and to dates must be valid calendar dates.', 400)
    }

    if (filters.from > filters.to) {
      return createErrorResponse('From date must be on or before to date.', 400)
    }

    const supabase = getSupabaseAdminClient() as any
    const report = await readOverallRevenueReport(supabase, filters)

    return NextResponse.json(report)
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading the overall revenue report.',
      500,
    )
  }
}
