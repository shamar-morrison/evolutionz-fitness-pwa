import { NextResponse } from 'next/server'
import { normalizeAvailableAccessCards } from '@/lib/available-cards'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('cards')
      .select('card_no, card_code')
      .eq('status', 'available')
      .order('card_no', { ascending: true })

    if (error) {
      throw new Error(`Failed to read available cards: ${error.message}`)
    }

    return NextResponse.json({
      ok: true,
      cards: normalizeAvailableAccessCards({
        cards: (data ?? []).map((row) => ({
          cardNo: typeof row.card_no === 'string' ? row.card_no : '',
          cardCode: typeof row.card_code === 'string' ? row.card_code : null,
        })),
      }),
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unexpected server error while fetching available cards.'

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    )
  }
}
