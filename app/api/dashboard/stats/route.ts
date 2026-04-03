import { NextResponse } from 'next/server'
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
  nowIso: string,
  sevenDaysFromNowIso: string,
) {
  const { count, error } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Active')
    .gte('end_time', nowIso)
    .lte('end_time', sevenDaysFromNowIso)

  if (error) {
    throw new Error(`Failed to read expiring-soon member count: ${error.message}`)
  }

  return count ?? 0
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient()
    const now = new Date()
    const sevenDaysFromNow = new Date(now)
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
    const nowIso = now.toISOString()
    const sevenDaysFromNowIso = sevenDaysFromNow.toISOString()

    const [activeMembers, expiredMembers, expiringSoon] = await Promise.all([
      countMembersByStatus(supabase, 'Active'),
      countMembersByStatus(supabase, 'Expired'),
      countExpiringSoon(supabase, nowIso, sevenDaysFromNowIso),
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
