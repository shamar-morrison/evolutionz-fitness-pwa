import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  canAccessMedicalAssignment,
  MEDICAL_VISIT_NOTE_SELECT,
  readAuthorizedMedicalProfile,
  readMedicalAssignmentRowById,
  readMedicalVisitNotes,
} from '@/lib/medical-server'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const createVisitNoteSchema = z
  .object({
    visitDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Visit date must use YYYY-MM-DD format.'),
    notes: z.string().trim().nullable().optional(),
    followUpDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Follow-up date must use YYYY-MM-DD format.')
      .optional(),
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

function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
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

    if (!authResult.permissions.can('medical.readVisitNotes')) {
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

    const notes = await readMedicalVisitNotes(supabase, id)

    return NextResponse.json({
      notes,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading visit notes.',
      500,
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await readAuthorizedMedicalProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    if (!authResult.permissions.can('medical.createVisitNotes')) {
      return createErrorResponse('Forbidden', 403)
    }

    const { id } = await params
    const input = createVisitNoteSchema.parse(await request.json())
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
        'Visit notes can only be added to active medical assignments.',
        400,
      )
    }

    const { data, error } = await supabase
      .from('medical_visit_notes')
      .insert({
        assignment_id: id,
        visit_date: input.visitDate,
        notes: normalizeOptionalText(input.notes),
        follow_up_date: input.followUpDate ?? null,
        created_by: authResult.profile.id,
      })
      .select(MEDICAL_VISIT_NOTE_SELECT)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to create the visit note: ${error.message}`)
    }

    if (!data) {
      throw new Error('Failed to create the visit note: missing inserted row.')
    }

    if (input.followUpDate) {
      const { error: updateAssignmentError } = await supabase
        .from('medical_assignments')
        .update({
          follow_up_date: input.followUpDate,
        })
        .eq('id', id)

      if (updateAssignmentError) {
        throw new Error(
          `Visit note saved, but the assignment follow-up date could not be updated: ${updateAssignmentError.message}`,
        )
      }
    }

    const notes = await readMedicalVisitNotes(supabase, id)
    const note = notes[0] ?? null

    if (!note) {
      throw new Error('Failed to load the created visit note.')
    }

    return NextResponse.json(
      {
        ok: true,
        note,
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
        : 'Unexpected server error while creating the visit note.',
      500,
    )
  }
}
