import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  STAFF_EDITABLE_GENDERS,
  STAFF_PROFILE_SELECT,
  STAFF_TITLES,
  deriveRoleFromTitle,
  normalizeProfile,
  readStaffProfile,
  type StaffReadClient,
} from '@/lib/staff'
import {
  deleteStaffPhotoObject,
  hydrateStaffPhotoUrl,
  type StaffPhotoStorageClient,
} from '@/lib/staff-photo-storage'
import { requireAdminUser } from '@/lib/server-auth'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type DeleteStaffAdminClient = StaffReadClient &
  StaffPhotoStorageClient & {
    auth: {
      admin: {
        deleteUser(userId: string): PromiseLike<{
          data: unknown
          error: { message: string } | null
        }>
      }
    }
    from(table: 'profiles'): {
      delete(): {
        eq(column: 'id', value: string): {
          select(columns: typeof STAFF_PROFILE_SELECT): {
            maybeSingle(): QueryResult<Record<string, unknown>>
          }
        }
      }
    }
    from(table: string): unknown
  }

type UpdateStaffValues = {
  name: string
  role: 'admin' | 'staff'
  title: string
  phone: string | null
  gender?: 'male' | 'female' | null
  remark: string | null
}

type UpdateStaffAdminClient = {
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

const DELETE_STAFF_AUTH_WARNING =
  'The staff profile was deleted, but the auth user could not be removed. Delete the user manually from Supabase Auth.'
const SELF_DEMOTION_ERROR = 'You cannot remove your own admin access.'

const updateStaffRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Full name is required.'),
    phone: z.string().trim().nullable().optional(),
    gender: z.enum(STAFF_EDITABLE_GENDERS).nullable().optional(),
    remark: z.string().trim().nullable().optional(),
    title: z.enum(STAFF_TITLES),
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
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const supabase = (await createClient()) as unknown as StaffReadClient
    const storageClient = getSupabaseAdminClient() as unknown as StaffPhotoStorageClient
    const profile = await readStaffProfile(supabase, id)

    if (!profile) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    const hydratedProfile = await hydrateStaffPhotoUrl(storageClient, profile)

    return NextResponse.json({
      profile: hydratedProfile,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while loading the staff profile.',
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
    const hasGenderField =
      typeof requestBody === 'object' &&
      requestBody !== null &&
      Object.prototype.hasOwnProperty.call(requestBody, 'gender')
    const input = updateStaffRequestSchema.parse(requestBody)

    if (authResult.user.id === id && input.title !== 'Owner') {
      return createErrorResponse(SELF_DEMOTION_ERROR, 403)
    }

    const supabase = getSupabaseAdminClient() as unknown as UpdateStaffAdminClient
    const updateValues: UpdateStaffValues = {
      name: input.name.trim(),
      role: deriveRoleFromTitle(input.title),
      title: input.title,
      phone: normalizeOptionalText(input.phone),
      remark: normalizeOptionalText(input.remark),
    }

    if (hasGenderField) {
      updateValues.gender = input.gender ?? null
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updateValues)
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
        : 'Unexpected server error while updating the staff profile.',
      500,
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params

    if (authResult.user.id === id) {
      return createErrorResponse('You cannot delete your own staff account.', 403)
    }

    const supabase = getSupabaseAdminClient() as unknown as DeleteStaffAdminClient
    const existingProfile = await readStaffProfile(supabase, id)

    if (!existingProfile) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    if (existingProfile.photoUrl) {
      await deleteStaffPhotoObject(supabase, existingProfile.photoUrl)
    }

    const { data, error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id)
      .select(STAFF_PROFILE_SELECT)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to delete staff profile ${id}: ${error.message}`)
    }

    if (!data) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(id)

    if (deleteUserError) {
      console.error('Failed to delete auth user after deleting staff profile:', {
        userId: id,
        error: deleteUserError.message,
      })

      return NextResponse.json({
        ok: true,
        warning: DELETE_STAFF_AUTH_WARNING,
      })
    }

    return NextResponse.json({
      ok: true,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while deleting the staff profile.',
      500,
    )
  }
}
