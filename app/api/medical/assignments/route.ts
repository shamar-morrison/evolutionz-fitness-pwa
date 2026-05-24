import { NextResponse } from 'next/server'
import { z } from 'zod'
import { MEDICAL_ASSIGNMENT_STATUSES, type MedicalAssignmentFilters } from '@/lib/medical'
import {
  readAuthorizedMedicalProfile,
  readMedicalAssignmentById,
  readMedicalAssignments,
} from '@/lib/medical-server'
import { requireAdminUser } from '@/lib/server-auth'
import { hasStaffTitle, readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const assignmentFiltersSchema = z.object({
  memberId: z.string().uuid().optional(),
  staffId: z.string().uuid().optional(),
  status: z.enum(MEDICAL_ASSIGNMENT_STATUSES).optional(),
})

const createAssignmentSchema = z
  .object({
    memberId: z.string().uuid(),
    staffId: z.string().uuid(),
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

function isActiveMedicalAssignmentConflict(error: {
  code?: string | null
  details?: string | null
  message?: string | null
}) {
  return (
    error.code === '23505' &&
    (error.message?.includes('medical_assignments_member_staff_active_idx') === true ||
      error.details?.includes('medical_assignments_member_staff_active_idx') === true)
  )
}

export async function GET(request: Request) {
  try {
    const authResult = await readAuthorizedMedicalProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    if (!authResult.permissions.can('medical.viewAssignments')) {
      return createErrorResponse('Forbidden', 403)
    }

    const { searchParams } = new URL(request.url)
    const filters = assignmentFiltersSchema.parse({
      memberId: searchParams.get('memberId') ?? undefined,
      staffId: searchParams.get('staffId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    })
    const nextFilters: MedicalAssignmentFilters = {
      ...filters,
      status: filters.status ?? 'active',
    }

    if (authResult.permissions.role !== 'admin') {
      if (filters.staffId && filters.staffId !== authResult.profile.id) {
        return createErrorResponse('Forbidden', 403)
      }

      nextFilters.staffId = authResult.profile.id
    }

    const supabase = getSupabaseAdminClient() as any
    const assignments = await readMedicalAssignments(supabase, nextFilters)

    return NextResponse.json({
      assignments,
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
        : 'Unexpected server error while loading medical assignments.',
      500,
    )
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const input = createAssignmentSchema.parse(await request.json())
    const supabase = getSupabaseAdminClient() as any
    const staffProfile = await readStaffProfile(supabase, input.staffId, {
      includeArchived: true,
    })

    if (!staffProfile || staffProfile.archivedAt) {
      return createErrorResponse('The selected staff member is unavailable.', 400)
    }

    if (!hasStaffTitle(staffProfile.titles, 'Medical/Consultant')) {
      return createErrorResponse(
        'The selected staff member is not assigned the Medical/Consultant title.',
        400,
      )
    }

    const { data: existingAssignment, error: existingAssignmentError } = await supabase
      .from('medical_assignments')
      .select('id')
      .eq('member_id', input.memberId)
      .eq('staff_id', input.staffId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (existingAssignmentError) {
      throw new Error(
        `Failed to check existing medical assignments: ${existingAssignmentError.message}`,
      )
    }

    if (existingAssignment) {
      return createErrorResponse(
        'This staff member already has an active medical assignment for the selected client.',
        400,
      )
    }

    const { data, error } = await supabase
      .from('medical_assignments')
      .insert({
        member_id: input.memberId,
        staff_id: input.staffId,
        status: 'active',
        follow_up_date: null,
        created_by: authResult.profile.id,
      })
      .select('id')
      .maybeSingle()

    if (error) {
      if (isActiveMedicalAssignmentConflict(error)) {
        return createErrorResponse(
          'This staff member already has an active medical assignment for the selected client.',
          400,
        )
      }

      throw new Error(`Failed to create the medical assignment: ${error.message}`)
    }

    if (!data?.id) {
      throw new Error('Failed to create the medical assignment: missing assignment id.')
    }

    const assignment = await readMedicalAssignmentById(supabase, data.id)

    if (!assignment) {
      throw new Error('Failed to load the created medical assignment.')
    }

    return NextResponse.json(
      {
        ok: true,
        assignment,
      },
      { status: 201 },
    )
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
        : 'Unexpected server error while creating the medical assignment.',
      500,
    )
  }
}
