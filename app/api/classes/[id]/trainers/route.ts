import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readClassById, readClassTrainers } from '@/lib/classes-server'
import { requireAdminUser } from '@/lib/server-auth'
import { hasStaffTitle, readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const assignTrainerSchema = z
  .object({
    profile_id: z.string().uuid(),
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const supabase = getSupabaseAdminClient()
    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const trainers = await readClassTrainers(supabase, id)

    return NextResponse.json({
      trainers,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while loading class trainers.',
      500,
    )
  }
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
    const input = assignTrainerSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient()
    const classItem = await readClassById(supabase, id)

    if (!classItem) {
      return createErrorResponse('Class not found.', 404)
    }

    const profile = await readStaffProfile(supabase, input.profile_id)

    if (!profile || !hasStaffTitle(profile.titles, 'Trainer')) {
      return createErrorResponse(
        'Only staff with the Trainer title can be assigned to a class',
        400,
      )
    }

    const { data, error } = await supabase
      .from('class_trainers')
      .insert({
        class_id: id,
        profile_id: input.profile_id,
      })
      .select('class_id, profile_id, created_at')
      .maybeSingle()

    if (error && isUniqueViolation(error)) {
      return createErrorResponse('Trainer is already assigned to this class', 409)
    }

    if (error) {
      throw new Error(`Failed to assign class trainer: ${error.message}`)
    }

    if (!data) {
      throw new Error('Failed to assign class trainer.')
    }

    return NextResponse.json(
      {
        ok: true,
        class_trainer: {
          class_id: String(data.class_id),
          profile_id: String(data.profile_id),
          created_at: String(data.created_at),
        },
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
      error instanceof Error ? error.message : 'Unexpected server error while assigning the class trainer.',
      500,
    )
  }
}
