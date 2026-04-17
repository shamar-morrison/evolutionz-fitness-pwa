import { ZodError } from 'zod'
import { isDateValue } from '@/lib/pt-scheduling'
import { readMemberSignupsReport } from '@/lib/member-reports-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  createMemberReportErrorResponse,
  memberReportFiltersSchema,
} from '@/app/api/reports/members/route-utils'

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
      return createMemberReportErrorResponse('Start date and end date are required.', 400)
    }

    const filters = memberReportFiltersSchema.parse({
      startDate,
      endDate,
    })

    if (!isDateValue(filters.startDate) || !isDateValue(filters.endDate)) {
      return createMemberReportErrorResponse(
        'Start date and end date must be valid calendar dates.',
        400,
      )
    }

    if (filters.startDate > filters.endDate) {
      return createMemberReportErrorResponse('Start date must be on or before end date.', 400)
    }

    const supabase = getSupabaseAdminClient() as any
    const report = await readMemberSignupsReport(supabase, filters)

    return Response.json(report)
  } catch (error) {
    if (error instanceof ZodError) {
      return createMemberReportErrorResponse(error.message, 400)
    }

    return createMemberReportErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading the member signup report.',
      500,
    )
  }
}
