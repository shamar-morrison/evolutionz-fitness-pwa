import { NextResponse } from 'next/server'
import {
  readExpiringDashboardMembers,
  type DashboardMembersReadClient,
} from '@/lib/dashboard-members'
import { getJamaicaExpiringWindow } from '@/lib/member-access-time'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient() as unknown as DashboardMembersReadClient
    const { startInclusive, endExclusive } = getJamaicaExpiringWindow(new Date())
    const members = await readExpiringDashboardMembers(
      supabase,
      startInclusive,
      endExclusive,
    )

    return NextResponse.json({ members })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error while loading expiring dashboard members.',
      },
      { status: 500 },
    )
  }
}
