import { NextResponse } from 'next/server'
import { readRecentDashboardMembers, type DashboardMembersReadClient } from '@/lib/dashboard-members'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient() as unknown as DashboardMembersReadClient
    const members = await readRecentDashboardMembers(supabase)

    return NextResponse.json({ members })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error while loading recent dashboard members.',
      },
      { status: 500 },
    )
  }
}
