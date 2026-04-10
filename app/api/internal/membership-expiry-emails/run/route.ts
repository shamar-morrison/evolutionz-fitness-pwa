import { NextResponse } from 'next/server'
import { createSupabaseMembershipExpiryEmailReminderStore, runMembershipExpiryEmailReminders } from '@/lib/membership-expiry-email-reminders-server'
import { sendResendEmail } from '@/lib/resend-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

async function authorizeRequest(request: Request) {
  const authorization = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    return null
  }

  const authResult = await requireAdminUser()

  if ('response' in authResult) {
    return authResult.response
  }

  if (!cronSecret) {
    throw new Error('Missing required server environment variable: CRON_SECRET')
  }

  return null
}

export async function GET(request: Request) {
  try {
    const unauthorizedResponse = await authorizeRequest(request)

    if (unauthorizedResponse) {
      return unauthorizedResponse
    }

    const summary = await runMembershipExpiryEmailReminders({
      store: createSupabaseMembershipExpiryEmailReminderStore(getSupabaseAdminClient()),
      sendEmail: async (input) => sendResendEmail(input),
    })

    return NextResponse.json({
      ok: true,
      summary,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error while running membership expiry email reminders.',
      },
      { status: 500 },
    )
  }
}
