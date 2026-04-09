import { NextResponse } from 'next/server'
import { readClasses } from '@/lib/classes-server'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
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
    // TODO: Centralize shared auth and role checks for class routes if route-level guards are extracted later.
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const supabase = getSupabaseAdminClient()
    const profile = await readStaffProfile(supabase, authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    const classes = await readClasses(supabase)

    return NextResponse.json({
      classes,
    })
  } catch (error) {
    console.error('Failed to load classes:', error)

    return createErrorResponse('Unexpected server error while loading classes.', 500)
  }
}
