import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  canAccessMedicalAssignment,
  readAuthorizedMedicalProfile,
  readMedicalAssignmentById,
  readMedicalAssignmentRowById,
} from '@/lib/medical-server'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const updateFollowUpSchema = z
  .object({
    followUpDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Follow-up date must use YYYY-MM-DD format.')
      .nullable(),
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await readAuthorizedMedicalProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    if (!authResult.permissions.can('medical.updateAssignments')) {
      return createErrorResponse('Forbidden', 403)
    }

    const { id } = await params
    const input = updateFollowUpSchema.parse(await request.json())
    const supabase = getSupabaseAdminClient() as any
    const assignmentRow = await readMedicalAssignmentRowById(supabase, id)

    if (!assignmentRow) {
      return createErrorResponse('Medical assignment not found.', 404)
    }

    if (
      !canAccessMedicalAssignment(
        authResult.permissions.role,
        authResult.profile.id,
        assignmentRow.staff_id,
      )
    ) {
      return createErrorResponse('Forbidden', 403)
    }

    if (assignmentRow.status !== 'active') {
      return createErrorResponse(
        'Only active medical assignments can be updated.',
        400,
      )
    }

    const { data, error } = await supabase
      .from('medical_assignments')
      .update({
        follow_up_date: input.followUpDate,
      })
      .eq('id', id)
      .eq('status', 'active')
      .select('id')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to update the follow-up date: ${error.message}`)
    }

    if (!data?.id) {
      return createErrorResponse(
        'Medical assignment changed before the follow-up date could be updated.',
        409,
      )
    }

    const assignment = await readMedicalAssignmentById(supabase, id)

    if (!assignment) {
      throw new Error('Failed to load the updated medical assignment.')
    }

    return NextResponse.json({
      ok: true,
      assignment,
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
        : 'Unexpected server error while updating the follow-up date.',
      500,
    )
  }
}
