import { NextResponse } from 'next/server'
import {
  readExpiringDashboardMembers,
  type DashboardMembersReadClient,
} from '@/lib/dashboard-members'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient() as unknown as DashboardMembersReadClient
    const now = new Date()
    const sevenDaysFromNow = new Date(now)
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
    const members = await readExpiringDashboardMembers(
      supabase,
      now.toISOString(),
      sevenDaysFromNow.toISOString(),
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
