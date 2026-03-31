import { NextResponse } from 'next/server'
import {
  buildCardCodeByCardNo,
  mapMemberRecordToMemberWithCardCode,
  MEMBER_RECORD_SELECT,
} from '@/lib/members'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { CardRecord, MemberRecord } from '@/types'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('members')
      .select(MEMBER_RECORD_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to read member ${id}: ${error.message}`)
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Member not found.',
        },
        { status: 404 },
      )
    }

    const memberRecord = data as MemberRecord
    const cardNo = typeof memberRecord.card_no === 'string' ? memberRecord.card_no.trim() : ''
    let cardCodeByCardNo = new Map<string, string | null>()

    if (cardNo) {
      const { data: cards, error: cardsError } = await supabase
        .from('cards')
        .select('card_no, card_code')
        .in('card_no', [cardNo])

      if (cardsError) {
        throw new Error(`Failed to read member card code for ${id}: ${cardsError.message}`)
      }

      cardCodeByCardNo = buildCardCodeByCardNo((cards ?? []) as CardRecord[])
    }

    return NextResponse.json({
      ok: true,
      member: mapMemberRecordToMemberWithCardCode(memberRecord, cardCodeByCardNo),
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Unexpected server error while loading member.',
      },
      { status: 500 },
    )
  }
}
