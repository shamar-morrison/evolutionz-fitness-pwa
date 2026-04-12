import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readClassAttendance, readClassSessionById } from '@/lib/classes-server'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const updateAttendanceSchema = z
  .object({
    marked_at: z.string().trim().datetime({ offset: true }).nullable(),
    marked_by: z.string().uuid().nullable().optional(),
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string; attendanceId: string }> },
) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id, sessionId, attendanceId } = await params
    const requestBody = await request.json()
    const input = updateAttendanceSchema.parse(requestBody)
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

    const { data: existingAttendance, error: existingAttendanceError } = await supabase
      .from('class_attendance')
      .select('id, session_id')
      .eq('id', attendanceId)
      .eq('session_id', sessionId)
      .maybeSingle()

    if (existingAttendanceError) {
      throw new Error(`Failed to read class attendance: ${existingAttendanceError.message}`)
    }

    if (!existingAttendance) {
      return createErrorResponse('Attendance row not found.', 404)
    }

    const nextMarkedAt = input.marked_at ? new Date(input.marked_at).toISOString() : null

    if (input.marked_at && Number.isNaN(new Date(input.marked_at).getTime())) {
      return createErrorResponse('marked_at must be a valid ISO timestamp.', 400)
    }

    const { error: updateError } = await supabase
      .from('class_attendance')
      .update({
        marked_at: nextMarkedAt,
        marked_by: nextMarkedAt ? authResult.user.id : null,
      })
      .eq('id', attendanceId)
      .eq('session_id', sessionId)

    if (updateError) {
      throw new Error(`Failed to update class attendance: ${updateError.message}`)
    }

    const attendance = await readClassAttendance(supabase, sessionId)
    const updatedAttendance = attendance.find((item) => item.id === attendanceId)

    if (!updatedAttendance) {
      throw new Error('Failed to load the updated class attendance row.')
    }

    return NextResponse.json({
      ok: true,
      attendance: updatedAttendance,
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
