import { NextResponse } from 'next/server'
import { readStaffProfile } from '@/lib/staff'
import { readStaffRemovalState, type StaffRemovalReadClient } from '@/lib/staff-removal'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type ArchiveStaffAdminClient = StaffRemovalReadClient & {
  auth: {
    admin: {
      updateUserById(
        userId: string,
        attributes: {
          ban_duration: string
        },
      ): PromiseLike<{
        data: unknown
        error: { message: string } | null
      }>
    }
  }
  from(table: 'profiles'): {
    update(values: {
      archived_at: string | null
    }): {
      eq(column: 'id', value: string): {
        select(columns: 'id'): {
          maybeSingle(): QueryResult<{ id: string }>
        }
      }
    }
  }
  from(table: string): unknown
}

const ARCHIVED_STAFF_ERROR = 'Archived staff accounts are read-only.'
const ARCHIVE_BAN_DURATION = '876000h'

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

export async function POST(
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
      return createErrorResponse('You cannot archive your own staff account.', 403)
    }

    const supabase = getSupabaseAdminClient() as unknown as ArchiveStaffAdminClient
    const existingProfile = await readStaffProfile(supabase, id, { includeArchived: true })

    if (!existingProfile) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    if (existingProfile.archivedAt) {
      return createErrorResponse(ARCHIVED_STAFF_ERROR, 409)
    }

    const removal = await readStaffRemovalState(supabase, id)

    if (removal.mode === 'blocked') {
      return createErrorResponse(
        'This staff account still has active PT assignments. Reassign or inactivate them before archiving this staff account.',
        409,
        {
          code: 'HAS_ACTIVE_ASSIGNMENTS',
          removal,
        },
      )
    }

    if (removal.mode === 'delete') {
      return createErrorResponse(
        'This staff account has no retained history and should be deleted instead of archived.',
        409,
        {
          code: 'HAS_NO_HISTORY',
          removal,
        },
      )
    }

    const archivedAt = new Date().toISOString()
    const { data, error } = await supabase
      .from('profiles')
      .update({
        archived_at: archivedAt,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to archive staff profile ${id}: ${error.message}`)
    }

    if (!data) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    const { error: updateUserError } = await supabase.auth.admin.updateUserById(id, {
      ban_duration: ARCHIVE_BAN_DURATION,
    })

    if (updateUserError) {
      await supabase
        .from('profiles')
        .update({
          archived_at: null,
        })
        .eq('id', id)
        .select('id')
        .maybeSingle()

      throw new Error(`Failed to archive auth user ${id}: ${updateUserError.message}`)
    }

    return NextResponse.json({
      ok: true,
      archivedAt,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while archiving the staff profile.',
      500,
    )
  }
}
