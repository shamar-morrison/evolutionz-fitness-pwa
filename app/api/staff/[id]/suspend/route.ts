import { NextResponse } from 'next/server'
import { z } from 'zod'
import { hasStaffTitle, readStaffProfile } from '@/lib/staff'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type SuspendStaffAdminClient = {
  rpc(
    fn: 'revoke_user_sessions',
    args: {
      p_user_id: string
    },
  ): PromiseLike<{
    data: null
    error: { message: string } | null
  }>
  from(table: 'profiles'): {
    update(values: {
      is_suspended: boolean
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
const SESSION_INVALIDATION_ERROR = 'Failed to invalidate active sessions for this account.'
const SESSION_INVALIDATION_AND_ROLLBACK_ERROR =
  'Failed to invalidate active sessions and failed to roll back the suspension state. Please manually verify the account state in the dashboard.'

const suspendStaffRequestSchema = z
  .object({
    suspended: z.boolean(),
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

async function updateSuspensionState(
  supabase: SuspendStaffAdminClient,
  id: string,
  suspended: boolean,
) {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      is_suspended: suspended,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle()

  return {
    data,
    error,
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
    const input = suspendStaffRequestSchema.parse(await request.json())

    if (authResult.profile.id === id) {
      return createErrorResponse('You cannot suspend your own account.', 400)
    }

    const supabase = getSupabaseAdminClient() as unknown as SuspendStaffAdminClient
    const existingProfile = await readStaffProfile(supabase, id, { includeArchived: true })

    if (!existingProfile) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    if (existingProfile.archivedAt) {
      return createErrorResponse(ARCHIVED_STAFF_ERROR, 409)
    }

    if (hasStaffTitle(existingProfile.titles, 'Owner')) {
      return createErrorResponse('Admin accounts cannot be suspended.', 400)
    }

    const updateResult = await updateSuspensionState(supabase, id, input.suspended)

    if (updateResult.error) {
      throw new Error(
        `Failed to update suspension state for staff profile ${id}: ${updateResult.error.message}`,
      )
    }

    if (!updateResult.data) {
      return createErrorResponse('Staff profile not found.', 404)
    }

    if (!input.suspended) {
      return NextResponse.json({
        ok: true,
      })
    }

    const { error: sessionInvalidationError } = await supabase.rpc('revoke_user_sessions', {
      p_user_id: id,
    })

    if (sessionInvalidationError) {
      const rollbackResult = await updateSuspensionState(supabase, id, false)

      if (rollbackResult.error || !rollbackResult.data) {
        const rollbackMessage =
          rollbackResult.error?.message ?? 'No profile row was returned during rollback.'

        console.error(
          `Failed to roll back suspension for profile ${id} after session invalidation failure: ${rollbackMessage}`,
        )

        return createErrorResponse(SESSION_INVALIDATION_AND_ROLLBACK_ERROR, 500)
      }

      return createErrorResponse(SESSION_INVALIDATION_ERROR, 500)
    }

    return NextResponse.json({
      ok: true,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createErrorResponse(error.issues[0]?.message ?? 'Invalid request body.', 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while updating staff suspension.',
      500,
    )
  }
}
