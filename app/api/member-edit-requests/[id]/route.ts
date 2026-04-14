import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
} from '@/lib/access-control-jobs'
import {
  buildBeginTimeValue,
  buildEndTimeValue,
  calculateInclusiveEndDate,
  findMatchingMemberDuration,
  getAccessDateInputValue,
  getAccessDateTimeValue,
  getAccessTimeInputValue,
  getMemberDurationValueFromLabel,
} from '@/lib/member-access-time'
import {
  MEMBER_EDIT_REQUEST_SELECT,
  type MemberEditRequestRecord,
} from '@/lib/member-edit-request-records'
import { buildAddUserPayloadWithAccessWindow } from '@/lib/member-job'
import { buildHikMemberName } from '@/lib/member-name'
import { resolveMemberStatusForAccessWindowUpdate } from '@/lib/member-status'
import { archiveResolvedRequestNotifications } from '@/lib/pt-notifications-server'
import { buildMemberTypeUpdateValues } from '@/lib/member-type-sync'
import { type MemberTypesReadClient } from '@/lib/member-types-server'
import { readMemberWithCardCode, type MembersReadClient } from '@/lib/members'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { Member } from '@/types'
import type { MemberGender } from '@/types'

const UPDATE_MEMBER_WARNING = 'Member updated but device sync failed. Please try again.'
const UPDATE_MEMBER_TIMEOUT_ERROR = 'Member update request timed out after 10 seconds.'

const reviewMemberEditRequestSchema = z
  .object({
    action: z.enum(['approve', 'deny']),
    rejectionReason: z.string().trim().min(1).nullable().optional(),
  })
  .strict()

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type MemberEditRequestReviewRow = MemberEditRequestRecord

type MemberEditRequestGuardedUpdateQuery = {
  eq(column: 'status', value: 'pending'): {
    eq(column: 'id', value: string): {
      select(columns: string): QueryResult<MemberEditRequestReviewRow[]>
    }
  }
}

type MemberEditRequestReviewClient = AccessControlJobsClient & MemberTypesReadClient & MembersReadClient & {
  from(table: 'member_edit_requests'): {
    select(columns: string): {
      eq(column: 'id', value: string): {
        maybeSingle(): QueryResult<MemberEditRequestRecord>
      }
    }
    update(values: {
      status: 'approved' | 'denied'
      reviewed_by: string
      reviewed_at: string
      rejection_reason?: string | null
    }): MemberEditRequestGuardedUpdateQuery
  }
  from(table: 'members'): {
    update(values: {
      name?: string
      gender?: MemberGender | null
      phone?: string | null
      email?: string | null
      member_type_id?: string | null
      begin_time?: string
      end_time?: string
      type?: string
    }): {
      eq(column: 'id', value: string): {
        select(columns: 'id'): {
          maybeSingle(): QueryResult<{
            id: string
          }>
        }
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

function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
}

function hasAccessWindowProposal(request: MemberEditRequestRecord) {
  return (
    request.proposed_start_date !== null ||
    request.proposed_start_time !== null ||
    request.proposed_duration !== null
  )
}

function hasAccessWindowChanged(
  currentMember: Member,
  nextBeginTime: string,
  nextEndTime: string,
) {
  return (
    getAccessDateTimeValue(currentMember.beginTime) !== nextBeginTime ||
    getAccessDateTimeValue(currentMember.endTime) !== nextEndTime
  )
}

function resolveApprovedAccessWindow(
  request: MemberEditRequestRecord,
  currentMember: Member,
): { beginTime: string; endTime: string } | { error: string } {
  const startDate = request.proposed_start_date?.trim() || getAccessDateInputValue(currentMember.beginTime)
  const startTime =
    request.proposed_start_time?.trim() || getAccessTimeInputValue(currentMember.beginTime)
  const duration =
    request.proposed_duration !== null
      ? getMemberDurationValueFromLabel(request.proposed_duration)
      : findMatchingMemberDuration(currentMember.beginTime, currentMember.endTime)

  if (!startDate) {
    return { error: 'This request could not be resolved into a valid access window: missing start date.' }
  }

  if (!startTime) {
    return { error: 'This request could not be resolved into a valid access window: missing start time.' }
  }

  if (!duration) {
    return {
      error:
        request.proposed_duration !== null
          ? 'This request could not be resolved into a valid access window: unsupported duration.'
          : 'This request changes the access window, but the member’s current duration is unsupported. Submit a new request with a supported duration.',
    }
  }

  const endDate = calculateInclusiveEndDate(startDate, duration)

  if (!endDate) {
    return { error: 'This request could not be resolved into a valid access window.' }
  }

  const beginTime = buildBeginTimeValue(startDate, startTime)
  const endTime = buildEndTimeValue(endDate)

  if (!beginTime || !endTime) {
    return { error: 'This request could not be resolved into a valid access window.' }
  }

  return { beginTime, endTime }
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
    const input = reviewMemberEditRequestSchema.parse(requestBody)
    const reviewTimestamp = new Date().toISOString()
    const supabase = getSupabaseAdminClient() as unknown as MemberEditRequestReviewClient
    const { data: existingRequest, error: existingRequestError } = await supabase
      .from('member_edit_requests')
      .select(MEMBER_EDIT_REQUEST_SELECT)
      .eq('id', id)
      .maybeSingle()

    if (existingRequestError) {
      throw new Error(`Failed to read member edit request ${id}: ${existingRequestError.message}`)
    }

    if (!existingRequest) {
      return createErrorResponse('Member edit request not found.', 404)
    }

    if (existingRequest.status !== 'pending') {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    if (input.action === 'deny') {
      const { data: deniedRequests, error } = await supabase
        .from('member_edit_requests')
        .update({
          status: 'denied',
          reviewed_by: authResult.profile.id,
          reviewed_at: reviewTimestamp,
          rejection_reason: normalizeOptionalText(input.rejectionReason),
        })
        .eq('status', 'pending')
        .eq('id', id)
        .select(MEMBER_EDIT_REQUEST_SELECT)

      if (error) {
        throw new Error(`Failed to deny member edit request ${id}: ${error.message}`)
      }

      const deniedRequest = deniedRequests?.[0] ?? null

      if (!deniedRequest) {
        return createErrorResponse('This request has already been reviewed.', 400)
      }

      try {
        await archiveResolvedRequestNotifications(supabase, {
          requestId: deniedRequest.id,
          type: 'member_edit_request',
          archivedAt: reviewTimestamp,
        })
      } catch (archiveError) {
        console.error(
          'Failed to archive resolved member edit request notifications:',
          archiveError,
        )
      }

      return NextResponse.json({ ok: true })
    }

    const currentMember = await readMemberWithCardCode(supabase, existingRequest.member_id)

    if (!currentMember) {
      return createErrorResponse('Member not found.', 404)
    }

    const shouldUpdateAccessWindow = hasAccessWindowProposal(existingRequest)
    let nextBeginTime: string | null = null
    let nextEndTime: string | null = null

    if (shouldUpdateAccessWindow) {
      const accessWindowResult = resolveApprovedAccessWindow(existingRequest, currentMember)

      if ('error' in accessWindowResult) {
        return createErrorResponse(accessWindowResult.error, 400)
      }

      nextBeginTime = accessWindowResult.beginTime
      nextEndTime = accessWindowResult.endTime
    }

    const accessWindowChanged =
      shouldUpdateAccessWindow &&
      nextBeginTime !== null &&
      nextEndTime !== null &&
      hasAccessWindowChanged(currentMember, nextBeginTime, nextEndTime)

    const { data: approvedRequests, error: requestUpdateError } = await supabase
      .from('member_edit_requests')
      .update({
        status: 'approved',
        reviewed_by: authResult.profile.id,
        reviewed_at: reviewTimestamp,
      })
      .eq('status', 'pending')
      .eq('id', id)
      .select(MEMBER_EDIT_REQUEST_SELECT)

    if (requestUpdateError) {
      throw new Error(
        `Failed to approve member edit request ${id}: ${requestUpdateError.message}`,
      )
    }

    const approvedRequest = approvedRequests?.[0] ?? null

    if (!approvedRequest) {
      return createErrorResponse('This request has already been reviewed.', 400)
    }

    const memberUpdateValues: Record<string, unknown> = {}

    if (existingRequest.proposed_name) {
      memberUpdateValues.name = buildHikMemberName(
        existingRequest.proposed_name,
        currentMember.cardCode,
      )
    }

    if (existingRequest.proposed_gender !== null) {
      memberUpdateValues.gender = existingRequest.proposed_gender
    }

    if (existingRequest.proposed_phone !== null) {
      memberUpdateValues.phone = normalizeOptionalText(existingRequest.proposed_phone)
    }

    if (existingRequest.proposed_email !== null) {
      memberUpdateValues.email = normalizeOptionalText(existingRequest.proposed_email)
    }

    if (existingRequest.proposed_member_type_id !== null) {
      Object.assign(
        memberUpdateValues,
        await buildMemberTypeUpdateValues(
          supabase,
          existingRequest.proposed_member_type_id,
          currentMember.type,
        ),
      )
    }

    if (shouldUpdateAccessWindow && nextBeginTime && nextEndTime) {
      memberUpdateValues.begin_time = nextBeginTime
      memberUpdateValues.end_time = nextEndTime

      if (accessWindowChanged) {
        memberUpdateValues.status = resolveMemberStatusForAccessWindowUpdate({
          currentStatus: currentMember.status,
          endTime: nextEndTime,
        })
      }
    }

    const { error: memberUpdateError } = await supabase
      .from('members')
      .update(memberUpdateValues as {
        name?: string
        gender?: MemberGender | null
        phone?: string | null
        email?: string | null
        member_type_id?: string | null
        begin_time?: string
        end_time?: string
        type?: string
      })
      .eq('id', existingRequest.member_id)
      .select('id')
      .maybeSingle()

    if (memberUpdateError) {
      throw new Error(
        `Failed to update member ${existingRequest.member_id}: ${memberUpdateError.message}`,
      )
    }

    try {
      await archiveResolvedRequestNotifications(supabase, {
        requestId: approvedRequest.id,
        type: 'member_edit_request',
        archivedAt: reviewTimestamp,
      })
    } catch (archiveError) {
      console.error(
        'Failed to archive resolved member edit request notifications:',
        archiveError,
      )
    }

    if (!shouldUpdateAccessWindow || !nextBeginTime || !nextEndTime) {
      return NextResponse.json({ ok: true })
    }

    if (!accessWindowChanged) {
      return NextResponse.json({ ok: true })
    }

    const hikMemberName =
      typeof memberUpdateValues.name === 'string'
        ? memberUpdateValues.name
        : buildHikMemberName(currentMember.name, currentMember.cardCode)

    try {
      const addUserJob = await createAndWaitForAccessControlJob({
        jobType: 'add_user',
        payload: buildAddUserPayloadWithAccessWindow({
          employeeNo: currentMember.employeeNo,
          name: hikMemberName,
          beginTime: nextBeginTime,
          endTime: nextEndTime,
        }),
        messages: {
          createErrorPrefix: 'Failed to create add user job',
          missingJobIdMessage: 'Failed to create add user job: missing job id in response',
          readErrorPrefix: (jobId) => `Failed to read add user job ${jobId}`,
          missingJobMessage: (jobId) => `Add user job ${jobId} was not found after creation.`,
          failedJobMessage: 'Add user job failed.',
          timeoutMessage: UPDATE_MEMBER_TIMEOUT_ERROR,
        },
        supabase,
      })

      if (addUserJob.status !== 'done') {
        return NextResponse.json({
          ok: true,
          warning: UPDATE_MEMBER_WARNING,
        })
      }
    } catch (syncError) {
      console.error('Failed to sync updated member access window:', syncError)

      return NextResponse.json({
        ok: true,
        warning: UPDATE_MEMBER_WARNING,
      })
    }

    return NextResponse.json({ ok: true })
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
        : 'Unexpected server error while reviewing the member edit request.',
      500,
    )
  }
}
