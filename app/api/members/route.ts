import { NextResponse } from 'next/server'
import { readMembersWithCardCodes } from '@/lib/members'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient()
    const members = await readMembersWithCardCodes(supabase)

    return NextResponse.json({
      ok: true,
      members,
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
