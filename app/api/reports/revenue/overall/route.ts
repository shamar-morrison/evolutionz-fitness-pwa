import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import {
  createErrorResponse,
  createForbiddenResponse,
  createUnexpectedRevenueReportErrorResponse,
  createValidationErrorResponse,
  revenueReportFiltersSchema,
} from '@/app/api/reports/revenue/route-utils'
import { readOverallRevenueReport } from '@/lib/revenue-reports-server'
import { isDateValue } from '@/lib/pt-scheduling'
import { requireAuthenticatedProfile } from '@/lib/server-auth'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

export async function GET(request: Request) {
  try {
    const authResult = await requireAuthenticatedProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    const permissions = resolvePermissionsForProfile(authResult.profile)

    if (!permissions.can('reports.view')) {
      return createForbiddenResponse()
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
    if (error instanceof ZodError) {
      return createValidationErrorResponse(error)
    }

    return createUnexpectedRevenueReportErrorResponse(
      error,
      'Unexpected server error while loading the overall revenue report.',
    )
  }
}
