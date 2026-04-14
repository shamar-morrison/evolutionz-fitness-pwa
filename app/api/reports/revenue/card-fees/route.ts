import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import {
  createErrorResponse,
  createUnexpectedRevenueReportErrorResponse,
  createValidationErrorResponse,
  revenueReportFiltersSchema,
} from '@/app/api/reports/revenue/route-utils'
import {
  readCardFeeRevenueReport,
  type RevenueReportsAdminClient,
} from '@/lib/revenue-reports-server'
import { isDateValue } from '@/lib/pt-scheduling'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

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

    const supabase: RevenueReportsAdminClient = getSupabaseAdminClient()
    const report = await readCardFeeRevenueReport(supabase, filters)

    return NextResponse.json(report)
  } catch (error) {
    if (error instanceof ZodError) {
      return createValidationErrorResponse(error)
    }

    return createUnexpectedRevenueReportErrorResponse(
      error,
      'Unexpected server error while loading the card fee revenue report.',
    )
  }
}
