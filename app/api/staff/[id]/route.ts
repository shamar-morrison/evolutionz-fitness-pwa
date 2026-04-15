import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  STAFF_EDITABLE_GENDERS,
  STAFF_PROFILE_SELECT,
  STAFF_TITLES,
  TRAINER_SPECIALTIES,
  deriveRoleFromTitles,
  hasStaffTitle,
  normalizeProfile,
  normalizeStaffSpecialtiesForTitles,
  readStaffProfile,
  type StaffReadClient,
  type StaffRemoval,
} from '@/lib/staff'
import { readStaffRemovalState, type StaffRemovalReadClient } from '@/lib/staff-removal'
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

type UpdateStaffValues = {
  name: string
  role: 'admin' | 'staff'
  titles: string[]
  phone: string | null
  gender?: 'male' | 'female' | null
  remark: string | null
  specialties?: string[]
}

type UpdateStaffAdminClient = StaffReadClient & {
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

type DeleteStaffAdminClient = StaffReadClient &
  StaffPhotoStorageClient &
  StaffRemovalReadClient & {
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

const ARCHIVED_STAFF_ERROR = 'Archived staff accounts are read-only.'
const DELETE_STAFF_AUTH_WARNING =
  'The staff profile was deleted, but the auth user could not be removed. Delete the user manually from Supabase Auth.'
const SELF_DEMOTION_ERROR = 'You cannot remove your own admin access.'
const STAFF_DELETE_FOREIGN_KEY_CONFLICT_MESSAGES: Record<string, string> = {
  member_approval_requests_submitted_by_fkey:
    'This staff account cannot be deleted because it submitted member approval requests. Archive the account instead so those approval records remain intact.',
  member_edit_requests_reviewed_by_fkey:
    'This staff account cannot be deleted because it reviewed member edit requests. Archive the account instead so those review records remain intact.',
  member_payment_requests_reviewed_by_fkey:
    'This staff account cannot be deleted because it reviewed member payment requests. Archive the account instead so those review records remain intact.',
}
const STAFF_DELETE_REFERENCE_LABELS: Record<string, string> = {
  trainer_clients: 'trainer assignments',
  pt_sessions: 'PT sessions',
  pt_session_changes: 'PT session change history',
  pt_reschedule_requests: 'PT reschedule requests',
  pt_session_update_requests: 'PT session update requests',
  member_approval_requests: 'member approval requests',
  member_edit_requests: 'member edit requests',
  member_payment_requests: 'member payment requests',
}

const updateStaffRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Full name is required.'),
    phone: z.string().trim().nullable().optional(),
    gender: z.enum(STAFF_EDITABLE_GENDERS).nullable().optional(),
    remark: z.string().trim().nullable().optional(),
    titles: z.array(z.enum(STAFF_TITLES)).min(1, 'Select at least one title.'),
    specialties: z.array(z.enum(TRAINER_SPECIALTIES)).optional(),
  })
  .strict()

function createErrorResponse(
  error: string,
  status: number,
  options: Record<string, unknown> = {},
) {
  return NextResponse.json(
    {
      ok: false,
      error,
      ...options,
    },
    { status },
  )
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
}

function createRemovalConflictResponse(removal: StaffRemoval) {
  if (removal.mode === 'blocked') {
    return createErrorResponse(
      'This staff account still has active PT assignments. Reassign or inactivate them before removing this staff account.',
      409,
      {
        code: 'HAS_ACTIVE_ASSIGNMENTS',
        removal,
      },
    )
  }

  return createErrorResponse(
    removal.history.memberApprovalRequestsSubmitted > 0
      ? 'This staff account has submitted member approval requests and should be archived instead of deleted.'
      : removal.history.memberEditRequestsReviewed > 0
        ? 'This staff account has reviewed member edit requests and should be archived instead of deleted.'
        : removal.history.memberPaymentRequestsReviewed > 0
          ? 'This staff account has reviewed member payment requests and should be archived instead of deleted.'
          : 'This staff account has retained history records and should be archived instead of deleted.',
    409,
    {
      code: 'HAS_HISTORY',
      removal,
    },
  )
}

function formatStaffDeleteConflict(errorMessage: string) {
  if (!/violates foreign key constraint/i.test(errorMessage)) {
    return null
  }

  const constraintMatch = errorMessage.match(/constraint "([^"]+)"/i)
  const constraint = constraintMatch?.[1]

  if (constraint && constraint in STAFF_DELETE_FOREIGN_KEY_CONFLICT_MESSAGES) {
    return STAFF_DELETE_FOREIGN_KEY_CONFLICT_MESSAGES[constraint]
  }

  const tableMatches = [...errorMessage.matchAll(/on table "([^"]+)"/gi)]
  const referencedTable = tableMatches.at(-1)?.[1]

  if (referencedTable && referencedTable !== 'profiles') {
    const referenceLabel =
      STAFF_DELETE_REFERENCE_LABELS[referencedTable] ?? referencedTable.replaceAll('_', ' ')

    return `This staff account cannot be deleted because there are still related ${referenceLabel}. Archive the account instead or remove those references first.`
  }

  return 'This staff account cannot be deleted because other records still reference it. Archive the account instead or remove those references first.'
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
    const removalClient = getSupabaseAdminClient() as unknown as StaffRemovalReadClient
    const profile = await readStaffProfile(supabase, id, { includeArchived: true })

    if (!profile) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    const [hydratedProfile, removal] = await Promise.all([
      hydrateStaffPhotoUrl(storageClient, profile),
      readStaffRemovalState(removalClient, id),
    ])

    return NextResponse.json({
      profile: hydratedProfile,
      removal,
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
    const hasSpecialtiesField =
      typeof requestBody === 'object' &&
      requestBody !== null &&
      Object.prototype.hasOwnProperty.call(requestBody, 'specialties')
    const input = updateStaffRequestSchema.parse(requestBody)

    if (authResult.user.id === id && !hasStaffTitle(input.titles, 'Owner')) {
      return createErrorResponse(SELF_DEMOTION_ERROR, 403)
    }

    const supabase = getSupabaseAdminClient() as unknown as UpdateStaffAdminClient
    const existingProfile = await readStaffProfile(supabase, id, { includeArchived: true })

    if (!existingProfile) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    if (existingProfile.archivedAt) {
      return createErrorResponse(ARCHIVED_STAFF_ERROR, 409)
    }

    const updateValues: UpdateStaffValues = {
      name: input.name.trim(),
      role: deriveRoleFromTitles(input.titles),
      titles: input.titles,
      phone: normalizeOptionalText(input.phone),
      remark: normalizeOptionalText(input.remark),
    }

    if (hasGenderField) {
      updateValues.gender = input.gender ?? null
    }

    if (!hasStaffTitle(input.titles, 'Trainer')) {
      updateValues.specialties = []
    } else if (hasSpecialtiesField) {
      updateValues.specialties = normalizeStaffSpecialtiesForTitles(
        input.titles,
        input.specialties,
      )
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
    const existingProfile = await readStaffProfile(supabase, id, { includeArchived: true })

    if (!existingProfile) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    if (existingProfile.archivedAt) {
      return createErrorResponse(ARCHIVED_STAFF_ERROR, 409)
    }

    const removal = await readStaffRemovalState(supabase, id)

    if (removal.mode !== 'delete') {
      return createRemovalConflictResponse(removal)
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
      const deleteConflictMessage = formatStaffDeleteConflict(error.message)

      if (deleteConflictMessage) {
        return createErrorResponse(deleteConflictMessage, 409, {
          code: 'HAS_HISTORY',
        })
      }

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
