import { NextResponse } from 'next/server'
import {
  canAccessMedicalAssignment,
  readAuthorizedMedicalProfile,
  readMedicalAssignmentById,
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await readAuthorizedMedicalProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    if (!authResult.permissions.can('medical.viewAssignments')) {
      return createErrorResponse('Forbidden', 403)
    }

    const { id } = await params
    const supabase = getSupabaseAdminClient() as any
    const assignment = await readMedicalAssignmentById(supabase, id)

    if (!assignment) {
      return createErrorResponse('Medical assignment not found.', 404)
    }

    if (
      !canAccessMedicalAssignment(
        authResult.permissions.role,
        authResult.profile.id,
        assignment.staffId,
      )
    ) {
      return createErrorResponse('Forbidden', 403)
    }

    return NextResponse.json({
      ok: true,
      assignment,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading the medical assignment.',
      500,
    )
  }
}
