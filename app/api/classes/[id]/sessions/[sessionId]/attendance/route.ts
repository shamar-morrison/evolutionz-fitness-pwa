import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  readClassAttendance,
  readClassSessionById,
  readEligibleClassRegistrationsForSession,
} from '@/lib/classes-server'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const attendanceBodySchema = z
  .object({
    member_id: z.string().uuid().nullable().optional(),
    guest_profile_id: z.string().uuid().nullable().optional(),
    marked_by: z.string().uuid().nullable().optional(),
    marked_at: z.string().trim().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasMemberId = Boolean(value.member_id)
    const hasGuestProfileId = Boolean(value.guest_profile_id)

    if (hasMemberId === hasGuestProfileId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of member_id or guest_profile_id.',
      })
    }
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

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id, sessionId } = await params
    const supabase = getSupabaseAdminClient()
    const profile = await readStaffProfile(supabase, authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    const session = await readClassSessionById(supabase, id, sessionId)

    if (!session) {
      return createErrorResponse('Session not found.', 404)
    }

    const attendance = await readClassAttendance(supabase, sessionId)

    return NextResponse.json({
      attendance,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while loading attendance.',
      500,
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id, sessionId } = await params
    const requestBody = await request.json()
    const input = attendanceBodySchema.parse(requestBody)
    const supabase = getSupabaseAdminClient()
    const profile = await readStaffProfile(supabase, authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    const permissions = resolvePermissionsForProfile(profile)

    if (!permissions.can('classes.markAttendance')) {
      return createErrorResponse('Forbidden', 403)
    }

    const session = await readClassSessionById(supabase, id, sessionId)

    if (!session) {
      return createErrorResponse('Session not found.', 404)
    }

    const eligibleRegistrations = await readEligibleClassRegistrationsForSession(
      supabase,
      id,
      session.scheduled_at,
      session.period_start,
    )
    const isEligibleRegistrant = eligibleRegistrations.some(
      (registration) =>
        registration.member_id === (input.member_id ?? null) &&
        registration.guest_profile_id === (input.guest_profile_id ?? null),
    )

    if (!isEligibleRegistrant) {
      return createErrorResponse('Registrant is not eligible for this session.', 400)
    }

    const nextMarkedAt = input.marked_at ? new Date(input.marked_at).toISOString() : null

    if (input.marked_at && Number.isNaN(new Date(input.marked_at).getTime())) {
      return createErrorResponse('marked_at must be a valid ISO timestamp.', 400)
    }

    const baseValues = {
      session_id: sessionId,
      member_id: input.member_id ?? null,
      guest_profile_id: input.guest_profile_id ?? null,
      marked_at: nextMarkedAt,
      marked_by: nextMarkedAt ? authResult.user.id : null,
    }

    const { data, error } = await supabase
      .from('class_attendance')
      .insert(baseValues)
      .select('id')
      .maybeSingle()

    if (error && isUniqueViolation(error)) {
      let query = supabase
        .from('class_attendance')
        .select('id')
        .eq('session_id', sessionId)

      query = input.member_id
        ? query.eq('member_id', input.member_id)
        : query.eq('guest_profile_id', input.guest_profile_id)

      const { data: existingAttendance, error: existingAttendanceError } = await query.maybeSingle()

      if (existingAttendanceError) {
        throw new Error(
          `Failed to read the existing class attendance row: ${existingAttendanceError.message}`,
        )
      }

      if (!existingAttendance?.id) {
        throw new Error('Class attendance row already exists but could not be loaded.')
      }

      const { error: updateError } = await supabase
        .from('class_attendance')
        .update({
          marked_at: nextMarkedAt,
          marked_by: nextMarkedAt ? authResult.user.id : null,
        })
        .eq('id', existingAttendance.id)
        .eq('session_id', sessionId)

      if (updateError) {
        throw new Error(`Failed to update class attendance: ${updateError.message}`)
      }

      const attendance = await readClassAttendance(supabase, sessionId)
      const updatedAttendance = attendance.find((item) => item.id === existingAttendance.id)

      if (!updatedAttendance) {
        throw new Error('Failed to load the updated class attendance row.')
      }

      return NextResponse.json({
        ok: true,
        attendance: updatedAttendance,
      })
    }

    if (error) {
      throw new Error(`Failed to create class attendance: ${error.message}`)
    }

    if (!data?.id) {
      throw new Error('Failed to create class attendance.')
    }

    const attendance = await readClassAttendance(supabase, sessionId)
    const createdAttendance = attendance.find((item) => item.id === data.id)

    if (!createdAttendance) {
      throw new Error('Failed to load the created class attendance row.')
    }

    return NextResponse.json({
      ok: true,
      attendance: createdAttendance,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return createErrorResponse(error.message, 400)
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while updating attendance.',
      500,
    )
  }
}
