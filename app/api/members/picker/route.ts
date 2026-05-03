import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  readMemberPickerMembers,
  type MemberPickerReadClient,
} from '@/lib/member-picker'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const memberPickerFiltersSchema = z.object({
  status: z.enum(['Active', 'Expired', 'Suspended', 'Paused']).optional(),
  hasEmail: z.enum(['true', 'false']).default('false'),
})

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { searchParams } = new URL(request.url)
    const filters = memberPickerFiltersSchema.parse({
      status: searchParams.get('status') ?? undefined,
      hasEmail: searchParams.get('hasEmail') ?? 'false',
    })
    const supabase = getSupabaseAdminClient() as unknown as MemberPickerReadClient
    const members = await readMemberPickerMembers(supabase, {
      status: filters.status,
      hasEmail: filters.hasEmail === 'true',
    })

    return NextResponse.json({
      ok: true,
      members,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading member picker options.',
      500,
    )
  }
}
