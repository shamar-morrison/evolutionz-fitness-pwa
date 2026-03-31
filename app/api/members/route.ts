import { NextResponse } from 'next/server'
import {
  buildCardCodeByCardNo,
  mapMemberRecordToMemberWithCardCode,
  MEMBER_RECORD_SELECT,
} from '@/lib/members'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { CardRecord, MemberRecord } from '@/types'

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('members')
      .select(MEMBER_RECORD_SELECT)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to read members: ${error.message}`)
    }

    const memberRecords = (data ?? []) as MemberRecord[]
    const cardNos = Array.from(
      new Set(
        memberRecords
          .map((record) => (typeof record.card_no === 'string' ? record.card_no.trim() : ''))
          .filter((value) => value.length > 0),
      ),
    )
    let cardCodeByCardNo = new Map<string, string | null>()

    if (cardNos.length > 0) {
      const { data: cards, error: cardsError } = await supabase
        .from('cards')
        .select('card_no, card_code')
        .in('card_no', cardNos)

      if (cardsError) {
        throw new Error(`Failed to read member card codes: ${cardsError.message}`)
      }

      cardCodeByCardNo = buildCardCodeByCardNo((cards ?? []) as CardRecord[])
    }

    return NextResponse.json({
      ok: true,
      members: memberRecords.map((record) => mapMemberRecordToMemberWithCardCode(record, cardCodeByCardNo)),
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Unexpected server error while loading members.',
      },
      { status: 500 },
    )
  }
}
