import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { createErrorResponse, handleCreateCardPost } from './_shared'

type QueryResult<T> = PromiseLike<{
  data: T[] | null
  error: { message: string } | null
}>

type CardsInventoryAdminClient = {
  from(table: 'cards'): {
    select(columns: 'card_no, card_code, created_at'): {
      eq(column: 'status', value: 'available'): {
        order(column: 'created_at', options: { ascending: false }): {
          order(column: 'card_no', options: { ascending: true }): QueryResult<{
            card_no: string | null
            card_code: string | null
            created_at: string | null
          }>
        }
      }
    }
  }
  from(table: string): unknown
}

const READ_CARDS_ERROR = 'Failed to read cards'

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient() as unknown as CardsInventoryAdminClient
    const { data, error } = await supabase
      .from('cards')
      .select('card_no, card_code, created_at')
      .eq('status', 'available')
      .order('created_at', { ascending: false })
      .order('card_no', { ascending: true })

    if (error) {
      console.error('Failed to read cards:', error)
      return createErrorResponse(READ_CARDS_ERROR, 500)
    }

    return NextResponse.json({
      ok: true,
      cards: (data ?? []).flatMap((row) => {
        const cardNo = typeof row.card_no === 'string' ? row.card_no.trim() : ''
        const cardCode = typeof row.card_code === 'string' ? row.card_code.trim() : null
        const createdAt = typeof row.created_at === 'string' ? row.created_at.trim() : ''

        if (!cardNo || !createdAt) {
          return []
        }

        return [
          {
            cardNo,
            cardCode,
            createdAt,
          },
        ]
      }),
    })
  } catch (error) {
    console.error('Unexpected server error while reading cards:', error)
    return createErrorResponse(READ_CARDS_ERROR, 500)
  }
}

export { handleCreateCardPost as POST }
