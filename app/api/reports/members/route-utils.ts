import { NextResponse } from 'next/server'
import { z } from 'zod'

export const memberReportFiltersSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Start date must use YYYY-MM-DD format.'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, 'End date must use YYYY-MM-DD format.'),
})

export function createMemberReportErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}
