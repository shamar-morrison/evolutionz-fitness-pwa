import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  STAFF_EDITABLE_GENDERS,
  STAFF_PROFILE_SELECT,
  STAFF_TITLES,
  TRAINER_SPECIALTIES,
  deriveRoleFromTitles,
  normalizeExistingStaffProfileSummary,
  normalizeProfile,
  normalizeStaffSpecialtiesForTitles,
  readStaffProfiles,
  type StaffReadClient,
} from '@/lib/staff'
import { hydrateStaffPhotoUrls, type StaffPhotoStorageClient } from '@/lib/staff-photo-storage'
import { requireAdminUser } from '@/lib/server-auth'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type CreateStaffAdminClient = StaffPhotoStorageClient & {
  auth: {
    admin: {
      createUser(input: {
        email: string
        password: string
        email_confirm: boolean
      }): PromiseLike<{
        data: {
          user: {
            id: string
          } | null
        }
        error: { message: string } | null
      }>
      deleteUser(userId: string): PromiseLike<{
        data: unknown
        error: { message: string } | null
      }>
    }
  }
  from(table: 'profiles'): {
    select(columns: 'id, name, titles'): {
      ilike(column: 'email', value: string): {
        maybeSingle(): QueryResult<Record<string, unknown>>
      }
    }
    insert(values: {
      id: string
      name: string
      email: string
      role: 'admin' | 'staff'
      titles: string[]
      phone: string | null
      gender: 'male' | 'female' | null
      remark: string | null
      specialties: string[]
    }): {
      select(columns: typeof STAFF_PROFILE_SELECT): {
        maybeSingle(): QueryResult<Record<string, unknown>>
      }
    }
  }
  from(table: string): unknown
}

const createStaffRequestSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required.'),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  phone: z.string().trim().optional(),
  gender: z.enum(STAFF_EDITABLE_GENDERS).optional(),
  remark: z.string().trim().optional(),
  titles: z.array(z.enum(STAFF_TITLES)).min(1, 'Select at least one title.'),
  specialties: z.array(z.enum(TRAINER_SPECIALTIES)).optional(),
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

function normalizeOptionalText(value: string | undefined) {
  const normalizedValue = value?.trim() ?? ''
  return normalizedValue || null
}

async function rollbackCreatedAuthUser(
  supabase: CreateStaffAdminClient,
  userId: string,
) {
  const { error } = await supabase.auth.admin.deleteUser(userId)

  if (error) {
    console.error('Failed to roll back created auth user after staff profile error:', {
      userId,
      error: error.message,
    })
  }
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const searchParams = new URL(request.url).searchParams
    const archivedOnly = searchParams.get('archived') === '1'
    const supabase = (await createClient()) as unknown as StaffReadClient
    const storageClient = getSupabaseAdminClient() as unknown as StaffPhotoStorageClient
    const staff = await readStaffProfiles(supabase, archivedOnly ? { archivedOnly: true } : {})
    const hydratedStaff = await hydrateStaffPhotoUrls(storageClient, staff)

    return NextResponse.json({
      staff: hydratedStaff,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : 'Unexpected server error while loading staff.',
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

    const requestBody = await request.json()
    const input = createStaffRequestSchema.parse(requestBody)
    const supabase = getSupabaseAdminClient() as unknown as CreateStaffAdminClient
    const normalizedEmail = input.email.trim()
    const { data: existingProfileData, error: existingProfileError } = await supabase
      .from('profiles')
      .select('id, name, titles')
      .ilike('email', normalizedEmail)
      .maybeSingle()

    if (existingProfileError) {
      throw new Error(`Failed to check for an existing staff profile: ${existingProfileError.message}`)
    }

    const existingProfile = normalizeExistingStaffProfileSummary(existingProfileData)

    if (existingProfile) {
      return NextResponse.json(
        {
          ok: false,
          code: 'EMAIL_EXISTS',
          existingProfile,
        },
        { status: 409 },
      )
    }

    const { data: authData, error: createUserError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: input.password,
      email_confirm: true,
    })

    if (createUserError) {
      throw new Error(`Failed to create auth user: ${createUserError.message}`)
    }

    const createdUserId = authData.user?.id

    if (!createdUserId) {
      throw new Error('Failed to create auth user: missing user id in response.')
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: createdUserId,
        name: input.name.trim(),
        email: normalizedEmail,
        role: deriveRoleFromTitles(input.titles),
        titles: input.titles,
        phone: normalizeOptionalText(input.phone),
        gender: input.gender ?? null,
        remark: normalizeOptionalText(input.remark),
        specialties: normalizeStaffSpecialtiesForTitles(input.titles, input.specialties),
      })
      .select(STAFF_PROFILE_SELECT)
      .maybeSingle()

    if (error) {
      await rollbackCreatedAuthUser(supabase, createdUserId)
      throw new Error(`Failed to create staff profile: ${error.message}`)
    }

    const profile = normalizeProfile({
      profile: data,
    })

    if (!profile) {
      await rollbackCreatedAuthUser(supabase, createdUserId)
      throw new Error('Failed to create staff profile: missing inserted profile row.')
    }

    return NextResponse.json(
      {
        ok: true,
        profile,
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
      error instanceof Error ? error.message : 'Unexpected server error while creating staff.',
      500,
    )
  }
}
