import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const createCardSchema = z
  .object({
    card_no: z.string().trim().min(1, 'Card number is required.'),
    card_code: z.string().trim().min(1, 'Card code is required.'),
  })
  .strict()

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string; code?: string | null } | null
}>

type CardsCreateAdminClient = {
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

const INTERNAL_SERVER_ERROR = 'Internal server error'

export function createErrorResponse(error: string, status: number) {
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

export async function handleCreateCardPost(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = createCardSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as CardsCreateAdminClient

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

      console.error('Failed to create manual card:', error)
      throw new Error(INTERNAL_SERVER_ERROR)
    }

    const cardNo = typeof data?.card_no === 'string' ? data.card_no.trim() : ''
    const cardCode = typeof data?.card_code === 'string' ? data.card_code.trim() : ''

    if (!cardNo || !cardCode) {
      console.error('Failed to create manual card: missing inserted row.', { data })
      throw new Error(INTERNAL_SERVER_ERROR)
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

    if (!(error instanceof Error && error.message === INTERNAL_SERVER_ERROR)) {
      console.error('Unexpected server error while creating the access card:', error)
    }

    return createErrorResponse(INTERNAL_SERVER_ERROR, 500)
  }
}
