import { NextResponse } from 'next/server'
import { getJamaicaExpiringWindow } from '@/lib/member-access-time'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type DashboardStatsClient = ReturnType<typeof getSupabaseAdminClient>

async function countMembersByStatus(
  supabase: DashboardStatsClient,
  status: 'Active' | 'Expired',
) {
  const { count, error } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('status', status)

  if (error) {
    throw new Error(`Failed to read ${status.toLowerCase()} member count: ${error.message}`)
  }

  return count ?? 0
}

async function countExpiringSoon(
  supabase: DashboardStatsClient,
  startInclusive: string,
  endExclusive: string,
) {
  const { count, error } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Active')
    .gte('end_time', startInclusive)
    .lt('end_time', endExclusive)

  if (error) {
    throw new Error(`Failed to read expiring-soon member count: ${error.message}`)
  }

  return count ?? 0
}

export async function GET() {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient()
    const { startInclusive, endExclusive } = getJamaicaExpiringWindow(new Date())

    const [activeMembers, expiredMembers, expiringSoon] = await Promise.all([
      countMembersByStatus(supabase, 'Active'),
      countMembersByStatus(supabase, 'Expired'),
      countExpiringSoon(supabase, startInclusive, endExclusive),
    ])

    return NextResponse.json({
      activeMembers,
      expiredMembers,
      expiringSoon,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error while loading dashboard stats.',
      },
      { status: 500 },
    )
  }
}
