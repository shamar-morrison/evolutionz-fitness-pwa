import { NextResponse } from 'next/server'
import { getThisMonthRange } from '@/lib/date-utils'
import { getJamaicaExpiringWindow } from '@/lib/member-access-time'
import { getDateRangeBoundsInJamaica } from '@/lib/pt-scheduling'
import { requireAdminUser } from '@/lib/server-auth'
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

async function countSignedUpThisMonth(
  supabase: DashboardStatsClient,
  startDate: string,
  endDate: string,
) {
  const { count, error } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .not('joined_at', 'is', null)
    .gte('joined_at', startDate)
    .lte('joined_at', endDate)

  if (error) {
    throw new Error(`Failed to read signed-up-this-month member count: ${error.message}`)
  }

  return count ?? 0
}

async function countExpiredThisMonth(
  supabase: DashboardStatsClient,
  startInclusive: string,
  endExclusive: string,
) {
  const { count, error } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .gte('end_time', startInclusive)
    .lt('end_time', endExclusive)

  if (error) {
    throw new Error(`Failed to read expired-this-month member count: ${error.message}`)
  }

  return count ?? 0
}

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient()
    const { startInclusive, endExclusive } = getJamaicaExpiringWindow(new Date())
    const thisMonthRange = getThisMonthRange(new Date())
    const expiryMonthBounds = getDateRangeBoundsInJamaica(
      thisMonthRange.startDate,
      thisMonthRange.endDate,
    )

    if (!expiryMonthBounds) {
      throw new Error('Failed to resolve the Jamaica month bounds for dashboard stats.')
    }

    const [activeMembers, expiredMembers, expiringSoon, signedUpThisMonth, expiredThisMonth] =
      await Promise.all([
        countMembersByStatus(supabase, 'Active'),
        countMembersByStatus(supabase, 'Expired'),
        countExpiringSoon(supabase, startInclusive, endExclusive),
        countSignedUpThisMonth(supabase, thisMonthRange.startDate, thisMonthRange.endDate),
        countExpiredThisMonth(
          supabase,
          expiryMonthBounds.startInclusive,
          expiryMonthBounds.endExclusive,
        ),
      ])

    return NextResponse.json({
      activeMembers,
      expiredMembers,
      expiringSoon,
      signedUpThisMonth,
      expiredThisMonth,
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
