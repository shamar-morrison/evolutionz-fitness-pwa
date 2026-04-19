import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  applyPreparedMemberExtension,
  prepareMemberExtension,
  type MemberExtensionServerClient,
} from '@/lib/member-extension-server'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { durationDaysSchema } from '@/lib/validation-schemas'

const extendMemberMembershipSchema = z.object({
  duration_days: durationDaysSchema,
}).strict()

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const requestBody = await request.json()
    const input = extendMemberMembershipSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as MemberExtensionServerClient
    const preparedExtension = await prepareMemberExtension(id, input.duration_days, supabase)

    if (!preparedExtension.ok) {
      return createErrorResponse(preparedExtension.error, preparedExtension.status)
    }

    const result = await applyPreparedMemberExtension(preparedExtension.extension, supabase)

    return NextResponse.json({
      ok: true,
      new_end_time: result.newEndTime,
      ...(result.warning ? { warning: result.warning } : {}),
    })
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
        : 'Unexpected server error while extending the membership.',
      500,
    )
  }
}
