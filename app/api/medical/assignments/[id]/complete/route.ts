import { NextResponse } from 'next/server'
import {
  canAccessMedicalAssignment,
  readAuthorizedMedicalProfile,
  readMedicalAssignmentById,
  readMedicalAssignmentRowById,
} from '@/lib/medical-server'
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

export async function PATCH(
  _request: Request,
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
        'Only active medical assignments can be marked as complete.',
        400,
      )
    }

    const { error } = await supabase
      .from('medical_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: authResult.profile.id,
      })
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to complete the medical assignment: ${error.message}`)
    }

    const assignment = await readMedicalAssignmentById(supabase, id)

    if (!assignment) {
      throw new Error('Failed to load the completed medical assignment.')
    }

    return NextResponse.json({
      ok: true,
      assignment,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while completing the medical assignment.',
      500,
    )
  }
}
