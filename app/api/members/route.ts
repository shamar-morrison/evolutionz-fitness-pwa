import { NextResponse } from 'next/server'
import { mapMemberRecordToMember } from '@/lib/members'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { MemberRecord } from '@/types'

const MEMBERS_SELECT =
  'id, employee_no, name, card_no, type, status, expiry, balance, created_at, updated_at'

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('members')
      .select(MEMBERS_SELECT)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to read members: ${error.message}`)
    }

    return NextResponse.json({
      ok: true,
      members: ((data ?? []) as MemberRecord[]).map(mapMemberRecordToMember),
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
