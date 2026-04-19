import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MEMBER_EXTENSION_INACTIVE_ERROR,
  isMemberExtensionEligible,
  isSupportedMemberExtensionDurationDays,
} from '@/lib/member-extension'
import {
  MEMBER_EXTENSION_REQUEST_SELECT,
  type MemberExtensionRequestRecord,
} from '@/lib/member-extension-request-records'
import { notifyAdminsOfRequest } from '@/lib/notify-admins-of-request'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { readStaffProfile } from '@/lib/staff'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase/server'
import { durationDaysSchema } from '@/lib/validation-schemas'
import { readMemberWithCardCode, type MembersReadClient } from '@/lib/members'

const createMemberExtensionRequestSchema = z.object({
  duration_days: durationDaysSchema,
}).strict()

const SUSPENDED_ACCOUNT_ERROR =
  'Your account has been suspended. Please contact an administrator.'

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: { message: string } | null
}>

type MemberExtensionRequestInsertClient = MembersReadClient & {
  from(table: 'member_extension_requests'): {
    insert(values: {
      member_id: string
      requested_by: string
      duration_days: number
      status: 'pending'
    }): {
      select(columns: string): {
        single(): QueryResult<MemberExtensionRequestRecord>
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuthenticatedUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const { id } = await params
    const requestBody = await request.json()
    const input = createMemberExtensionRequestSchema.parse(requestBody)

    if (!isSupportedMemberExtensionDurationDays(input.duration_days)) {
      return createErrorResponse('Duration must match a supported membership option.', 400)
    }

    const profile = await readStaffProfile(await createClient(), authResult.user.id)

    if (!profile) {
      return createErrorResponse('Forbidden', 403)
    }

    if (profile.isSuspended) {
      return createErrorResponse(SUSPENDED_ACCOUNT_ERROR, 403)
    }

    const permissions = resolvePermissionsForProfile(profile)

    if (!permissions.can('members.extendMembership')) {
      return createErrorResponse('Forbidden', 403)
    }

    if (permissions.role === 'admin') {
      return createErrorResponse('Admins should extend memberships directly.', 403)
    }

    const supabase = getSupabaseAdminClient() as unknown as MemberExtensionRequestInsertClient
    const currentMember = await readMemberWithCardCode(supabase, id)

    if (!currentMember) {
      return createErrorResponse('Member not found.', 404)
    }

    if (!isMemberExtensionEligible(currentMember.endTime, currentMember.status)) {
      return createErrorResponse(MEMBER_EXTENSION_INACTIVE_ERROR, 400)
    }

    const { data, error } = await supabase
      .from('member_extension_requests')
      .insert({
        member_id: currentMember.id,
        requested_by: authResult.user.id,
        duration_days: input.duration_days,
        status: 'pending',
      })
      .select(MEMBER_EXTENSION_REQUEST_SELECT)
      .single()

    if (error) {
      throw new Error(`Failed to create member extension request: ${error.message}`)
    }

    const requestRecord = data as MemberExtensionRequestRecord

    const memberName = requestRecord.member?.name?.trim() || 'this member'
    const requestedBy = requestRecord.requestedByProfile?.name?.trim() || 'A staff member'

    await notifyAdminsOfRequest(supabase, {
      type: 'member_extension_request',
      title: 'Membership Extension Request',
      body: `New membership extension request from ${requestedBy} for ${memberName}.`,
      url: '/pending-approvals/extension-requests',
      metadata: {
        requestId: requestRecord.id,
        memberId: requestRecord.member_id,
        memberName,
        requestedBy,
        durationDays: requestRecord.duration_days,
      },
      pushBody: 'A staff member submitted a membership extension request.',
      logMessage: 'Failed to send member extension request notifications:',
    })

    return NextResponse.json({
      ok: true,
      id: requestRecord.id,
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
        : 'Unexpected server error while creating the member extension request.',
      500,
    )
  }
}
