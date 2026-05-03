import { NextResponse } from 'next/server'
import { normalizeDashboardStats } from '@/lib/dashboard-stats'
import { PRIVATE_STABLE_READ_CACHE_CONTROL } from '@/lib/http-cache'
import { JAMAICA_OFFSET } from '@/lib/jamaica-time'
import { getMemberPauseJamaicaNow } from '@/lib/member-pause'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type DashboardStatsRouteClient = {
  rpc(
    fn: 'get_dashboard_stats',
    args: {
      p_now: string
      p_timezone_offset: string
    },
  ): PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>
}

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient() as unknown as DashboardStatsRouteClient
    const { timestampWithOffset } = getMemberPauseJamaicaNow(new Date())
    const { data, error } = await supabase.rpc('get_dashboard_stats', {
      p_now: timestampWithOffset,
      p_timezone_offset: JAMAICA_OFFSET,
    })

    if (error) {
      throw new Error(`Failed to load dashboard stats: ${error.message}`)
    }

    return NextResponse.json(normalizeDashboardStats(data), {
      headers: {
        'Cache-Control': PRIVATE_STABLE_READ_CACHE_CONTROL,
      },
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
