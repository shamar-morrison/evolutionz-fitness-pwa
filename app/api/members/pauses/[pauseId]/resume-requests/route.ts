import { NextResponse } from 'next/server'
import {
  getMemberPauseRequestNotificationTitle,
  type MemberPauseServerClient,
} from '@/lib/member-pause-server'
import {
  readActivePauseById,
  readPendingEarlyResumeRequestForPause,
} from '@/lib/member-pause-records'
import { MEMBER_PAUSE_EARLY_RESUME_PENDING_ERROR } from '@/lib/member-pause'
import {
  insertNotifications,
  readAdminNotificationRecipients,
} from '@/lib/pt-notifications-server'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { sendPushToProfiles } from '@/lib/web-push'

const SUSPENDED_ACCOUNT_ERROR =
  'Your account has been suspended. Please contact an administrator.'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error:
    | {
        message: string
        code?: string | null
        details?: string | null
      }
    | null
}>

type MemberPauseResumeRequestInsertClient = MemberPauseServerClient & {
  from(table: 'member_pause_resume_requests'): {
    insert(values: {
      pause_id: string
      member_id: string
      requested_by: string
      status: 'pending'
    }): {
      select(columns: string): {
        single(): QueryResult<{ id: string }>
      }
    }
  }
  from(table: string): unknown
}

function createErrorResponse(error: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status },
  )
}

function isPendingEarlyResumeConflict(error: { code?: string | null; details?: string | null }) {
  return (
    error.code === '23505' ||
    error.details?.includes('member_pause_resume_requests_pending_pause_idx') === true
  )
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ pauseId: string }> },
) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { pauseId } = await params
    const profile = await readStaffProfile(await createClient(), authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    if (profile.isSuspended) {
      return createErrorResponse(SUSPENDED_ACCOUNT_ERROR, 403)
    }

    const permissions = resolvePermissionsForProfile(profile)

    if (!permissions.can('members.pauseMembership')) {
      return createErrorResponse('Forbidden', 403)
    }

    if (permissions.role === 'admin') {
      return createErrorResponse('Admins should end pauses directly.', 403)
    }

    const supabase = getSupabaseAdminClient() as unknown as MemberPauseResumeRequestInsertClient
    const activePause = await readActivePauseById(supabase, pauseId)

    if (!activePause) {
      return createErrorResponse('Active pause not found.', 404)
    }

    const pendingRequest = await readPendingEarlyResumeRequestForPause(supabase, pauseId)

    if (pendingRequest) {
      return createErrorResponse(MEMBER_PAUSE_EARLY_RESUME_PENDING_ERROR, 400)
    }

    const { data, error } = await supabase
      .from('member_pause_resume_requests')
      .insert({
        pause_id: pauseId,
        member_id: activePause.member_id,
        requested_by: authResult.user.id,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      if (isPendingEarlyResumeConflict(error)) {
        return createErrorResponse(MEMBER_PAUSE_EARLY_RESUME_PENDING_ERROR, 400)
      }

      throw new Error(`Failed to create early resume request: ${error.message}`)
    }

    const requestId = data?.id

    if (!requestId) {
      throw new Error('Failed to create early resume request: missing request id.')
    }

    try {
      const adminRecipients = await readAdminNotificationRecipients(supabase)
      const memberName = activePause.member?.name?.trim() || 'this member'
      const requestedBy = profile.name?.trim() || 'A staff member'
      const title = getMemberPauseRequestNotificationTitle('early_resume')

      await insertNotifications(
        supabase,
        adminRecipients.map((recipient) => ({
          recipientId: recipient.id,
          type: 'member_pause_request',
          title,
          body: `New early resume request from ${requestedBy} for ${memberName}.`,
          metadata: {
            requestId,
            requestKind: 'early_resume',
            pauseId,
            memberId: activePause.member_id,
            memberName,
            requestedBy,
          },
        })),
      )

      await sendPushToProfiles(
        adminRecipients.map((recipient) => recipient.id),
        {
          title,
          body: 'A staff member submitted an early resume request.',
          url: '/pending-approvals/pause-requests',
        },
      )
    } catch (notificationError) {
      console.error('Failed to send early resume request notifications:', notificationError)
    }

    return NextResponse.json({
      ok: true,
      id: requestId,
    })
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while creating the early resume request.',
      500,
    )
  }
}
