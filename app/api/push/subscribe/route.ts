import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const subscribeSchema = z
  .object({
    endpoint: z.string().trim().min(1, 'endpoint is required.'),
    keys: z.object({
      p256dh: z.string().trim().min(1, 'keys.p256dh is required.'),
      auth: z.string().trim().min(1, 'keys.auth is required.'),
    }),
  })
  .strict()

const unsubscribeSchema = z
  .object({
    endpoint: z.string().trim().min(1, 'endpoint is required.'),
  })
  .strict()

function createErrorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminUser()
    if ('response' in authResult) return authResult.response

    const body = subscribeSchema.parse(await request.json())
    const supabase = getSupabaseAdminClient()

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          profile_id: authResult.profile.id,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
        },
        { onConflict: 'profile_id,endpoint' },
      )

    if (error) {
      throw new Error(`Failed to save push subscription: ${error.message}`)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while saving push subscription.',
      500,
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdminUser()
    if ('response' in authResult) return authResult.response

    const body = unsubscribeSchema.parse(await request.json())
    const supabase = getSupabaseAdminClient()

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('profile_id', authResult.profile.id)
      .eq('endpoint', body.endpoint)

    if (error) {
      throw new Error(`Failed to delete push subscription: ${error.message}`)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }
    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while deleting push subscription.',
      500,
    )
  }
}
