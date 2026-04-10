import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

export const revenueReportFiltersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'From date must use YYYY-MM-DD format.'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'To date must use YYYY-MM-DD format.'),
})

type ErrorDetail = {
  field: string
  message: string
}

export function createErrorResponse(
  error: string,
  status: number,
  details?: ErrorDetail[],
) {
  return NextResponse.json(
    details
      ? {
          ok: false,
          error,
          details,
        }
      : {
          ok: false,
          error,
        },
    { status },
  )
}

export function createForbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export function createValidationErrorResponse(error: ZodError) {
  const details = error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : 'query',
    message: issue.message,
  }))

  return createErrorResponse('Revenue report filters are invalid.', 400, details)
}

export function createUnexpectedRevenueReportErrorResponse(
  routeError: unknown,
  message: string,
) {
  console.error(message, routeError)

  return createErrorResponse(message, 500)
}
