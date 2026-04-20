import { NextResponse } from 'next/server'
import { getServerResendDailyEmailLimit } from '@/lib/admin-email'
import { getJamaicaDayWindow } from '@/lib/member-access-time'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type CountRowsResult = {
  data: Array<{ id: string }> | null
  error: { message: string } | null
}

function createErrorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

async function countSentEmailsInWindow(
  query: PromiseLike<CountRowsResult>,
  label: string,
) {
  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to read ${label}: ${error.message}`)
  }

  return Array.isArray(data) ? data.length : 0
}

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { startInclusive, endExclusive } = getJamaicaDayWindow(new Date())
    const supabase = getSupabaseAdminClient() as any
    const [adminSent, membershipExpirySent] = await Promise.all([
      countSentEmailsInWindow(
        supabase
          .from('admin_email_deliveries')
          .select('id')
          .eq('status', 'sent')
          .gte('sent_at', startInclusive)
          .lt('sent_at', endExclusive),
        'admin email quota',
      ),
      countSentEmailsInWindow(
        supabase
          .from('membership_expiry_email_sends')
          .select('id')
          .eq('status', 'sent')
          .gte('sent_at', startInclusive)
          .lt('sent_at', endExclusive),
        'membership expiry email quota',
      ),
    ])
    const limit = getServerResendDailyEmailLimit()
    const sent = adminSent + membershipExpirySent

    return NextResponse.json({
      sent,
      limit,
      remaining: Math.max(0, limit - sent),
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading email quota.',
      500,
    )
  }
}
