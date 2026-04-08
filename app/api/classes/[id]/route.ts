import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUtcDateFromDateValue } from '@/lib/classes'
import { readClassById } from '@/lib/classes-server'
import { requireAdminUser, requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const updateClassPeriodStartSchema = z
  .object({
    current_period_start: z.string().trim().regex(/^(\d{4})-(\d{2})-(\d{2})$/u),
  })
  .strict()

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // TODO: Centralize shared auth and role checks for class routes if route-level guards are extracted later.
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const supabase = getSupabaseAdminClient()
    const profile = await readStaffProfile(supabase, authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    return NextResponse.json({
      class: classItem,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while loading the class.',
      500,
    )
  }
}

export async function PATCH(
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
    const input = updateClassPeriodStartSchema.parse(requestBody)

    if (!getUtcDateFromDateValue(input.current_period_start)) {
      return createErrorResponse('current_period_start must be a valid YYYY-MM-DD date.', 400)
    }

    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('classes')
      .update({
        current_period_start: input.current_period_start,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to update the class billing period: ${error.message}`)
    }

    if (!data) {
      return createErrorResponse('Class not found.', 404)
    }

    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    return NextResponse.json({
      ok: true,
      class: classItem,
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
        : 'Unexpected server error while updating the class billing period.',
      500,
    )
  }
}
