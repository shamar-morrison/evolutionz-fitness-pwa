import { NextResponse } from 'next/server'
import { PRIVATE_STABLE_READ_CACHE_CONTROL } from '@/lib/http-cache'
import type { MemberTypeRecord } from '@/types'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

export async function GET() {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('member_types')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to read membership types: ${error.message}`)
    }

    return NextResponse.json({
      ok: true,
      memberTypes: (data ?? []) as MemberTypeRecord[],
    }, {
      headers: {
        'Cache-Control': PRIVATE_STABLE_READ_CACHE_CONTROL,
      },
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading membership types.',
      500,
    )
  }
}
