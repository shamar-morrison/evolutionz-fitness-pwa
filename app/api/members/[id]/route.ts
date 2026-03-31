import { NextResponse } from 'next/server'
import { mapMemberRecordToMember } from '@/lib/members'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { MemberRecord } from '@/types'

const MEMBERS_SELECT =
  'id, employee_no, name, card_no, type, status, expiry, balance, created_at, updated_at'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('members')
      .select(MEMBERS_SELECT)
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

    return NextResponse.json({
      ok: true,
      member: mapMemberRecordToMember(data as MemberRecord),
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
