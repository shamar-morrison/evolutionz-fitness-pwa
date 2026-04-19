import { NextResponse } from 'next/server'
import { normalizePendingApprovalCounts } from '@/lib/pending-approval-counts'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type PendingApprovalCountsRouteClient = {
  rpc(
    fn: 'get_pending_approval_counts',
  ): {
    single(): PromiseLike<{
      data: unknown
      error: { message: string } | null
    }>
  }
}

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient() as unknown as PendingApprovalCountsRouteClient
    const { data, error } = await supabase.rpc('get_pending_approval_counts').single()

    if (error) {
      throw new Error(`Failed to load pending approval counts: ${error.message}`)
    }

    return NextResponse.json(normalizePendingApprovalCounts(data))
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error while loading pending approval counts.',
      },
      { status: 500 },
    )
  }
}
