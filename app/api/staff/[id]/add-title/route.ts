import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  STAFF_PROFILE_SELECT,
  STAFF_TITLES,
  TRAINER_SPECIALTIES,
  deriveRoleFromTitles,
  hasStaffTitle,
  normalizeProfile,
  normalizeStaffSpecialtiesForTitles,
  normalizeStaffTitles,
  normalizeTrainerSpecialties,
  readStaffProfile,
  type StaffReadClient,
} from '@/lib/staff'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type UpdateStaffValues = {
  role: 'admin' | 'staff'
  titles: string[]
  specialties: string[]
}

type AddTitleAdminClient = StaffReadClient & {
  from(table: 'profiles'): {
    update(values: UpdateStaffValues): {
      eq(column: 'id', value: string): {
        select(columns: typeof STAFF_PROFILE_SELECT): {
          maybeSingle(): QueryResult<Record<string, unknown>>
        }
      }
    }
  }
  from(table: string): unknown
}

const addStaffTitlesRequestSchema = z
  .object({
    titles: z.array(z.enum(STAFF_TITLES)).min(1, 'Select at least one title.'),
    specialties: z.array(z.enum(TRAINER_SPECIALTIES)).optional(),
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
    const input = addStaffTitlesRequestSchema.parse(await request.json())
    const supabase = getSupabaseAdminClient() as unknown as AddTitleAdminClient
    const existingProfile = await readStaffProfile(supabase, id)

    if (!existingProfile) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    const mergedTitles = normalizeStaffTitles([...existingProfile.titles, ...input.titles])
    const mergedSpecialties = hasStaffTitle(mergedTitles, 'Trainer')
      ? normalizeTrainerSpecialties([...existingProfile.specialties, ...(input.specialties ?? [])])
      : normalizeStaffSpecialtiesForTitles(mergedTitles, [])

    const { data, error } = await supabase
      .from('profiles')
      .update({
        role: deriveRoleFromTitles(mergedTitles),
        titles: mergedTitles,
        specialties: mergedSpecialties,
      })
      .eq('id', id)
      .select(STAFF_PROFILE_SELECT)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to update staff profile ${id}: ${error.message}`)
    }

    if (!data) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    const profile = normalizeProfile({
      profile: data,
    })

    if (!profile) {
      throw new Error('Failed to read the updated staff profile response.')
    }

    return NextResponse.json({
      ok: true,
      profile,
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
        : 'Unexpected server error while adding staff titles.',
      500,
    )
  }
}
