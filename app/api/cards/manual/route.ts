import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const createManualCardSchema = z
  .object({
    card_no: z.string().trim().min(1, 'Card number is required.'),
    card_code: z.string().trim().min(1, 'Card code is required.'),
  })
  .strict()

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string; code?: string | null } | null
}>

type ManualCardRouteClient = {
  from(table: 'cards'): {
    insert(values: {
      card_no: string
      card_code: string
      status: 'available'
      employee_no: null
      lost_at: null
    }): {
      select(columns: 'card_no, card_code'): {
        maybeSingle(): QueryResult<{
          card_no: string
          card_code: string | null
        }>
      }
    }
  }
  from(table: string): unknown
}

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = createManualCardSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as ManualCardRouteClient

    const { data, error } = await supabase
      .from('cards')
      .insert({
        card_no: input.card_no.trim(),
        card_code: input.card_code.trim(),
        status: 'available',
        employee_no: null,
        lost_at: null,
      })
      .select('card_no, card_code')
      .maybeSingle()

    if (error) {
      if (isUniqueViolation(error)) {
        return createErrorResponse('A card with this number already exists.', 409)
      }

      throw new Error(`Failed to create manual card: ${error.message}`)
    }

    const cardNo = typeof data?.card_no === 'string' ? data.card_no.trim() : ''
    const cardCode = typeof data?.card_code === 'string' ? data.card_code.trim() : ''

    if (!cardNo || !cardCode) {
      throw new Error('Failed to create manual card: missing inserted row.')
    }

    return NextResponse.json(
      {
        ok: true,
        card: {
          cardNo,
          cardCode,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while creating the access card.',
      500,
    )
  }
}
