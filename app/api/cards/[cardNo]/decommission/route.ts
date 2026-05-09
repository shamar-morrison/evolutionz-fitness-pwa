import { NextResponse } from 'next/server'
import type { CardStatus } from '@/types'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { createErrorResponse } from '@/app/api/cards/_shared'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type CardsDecommissionAdminClient = {
  from(table: 'cards'): {
    select(columns: 'card_no, status'): {
      eq(column: 'card_no', value: string): {
        maybeSingle(): QueryResult<{
          card_no: string | null
          status: CardStatus | null
        }>
      }
    }
    update(values: { status: 'decommissioned' }): {
      eq(column: 'card_no', value: string): {
        eq(column: 'status', value: 'available'): {
          select(columns: 'card_no'): {
            maybeSingle(): QueryResult<{
              card_no: string | null
            }>
          }
        }
      }
    }
  }
  from(table: string): unknown
}

const DECOMMISSION_CARD_ERROR = 'Failed to decommission card'

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ cardNo: string }> },
) {
  let normalizedCardNo = ''

  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { cardNo } = await params
    normalizedCardNo = cardNo.trim()

    if (!normalizedCardNo) {
      return createErrorResponse('Card number is required.', 400)
    }

    const supabase = getSupabaseAdminClient() as unknown as CardsDecommissionAdminClient
    const { data: existingCard, error: existingCardError } = await supabase
      .from('cards')
      .select('card_no, status')
      .eq('card_no', normalizedCardNo)
      .maybeSingle()

    if (existingCardError) {
      console.error('Failed to read card before decommissioning:', {
        normalizedCardNo,
        error: existingCardError,
      })
      return createErrorResponse(DECOMMISSION_CARD_ERROR, 500)
    }

    if (!existingCard) {
      return createErrorResponse('Card not found.', 404)
    }

    if (existingCard.status !== 'available') {
      return createErrorResponse('Only available cards can be decommissioned.', 400)
    }

    const { data: updatedCard, error: updateError } = await supabase
      .from('cards')
      .update({ status: 'decommissioned' })
      .eq('card_no', normalizedCardNo)
      .eq('status', 'available')
      .select('card_no')
      .maybeSingle()

    if (updateError) {
      console.error('Failed to decommission card:', {
        normalizedCardNo,
        error: updateError,
      })
      return createErrorResponse(DECOMMISSION_CARD_ERROR, 500)
    }

    if (!updatedCard) {
      return createErrorResponse('Only available cards can be decommissioned.', 400)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Unexpected error while decommissioning card:', {
      normalizedCardNo,
      error,
    })
    return createErrorResponse(DECOMMISSION_CARD_ERROR, 500)
  }
}
