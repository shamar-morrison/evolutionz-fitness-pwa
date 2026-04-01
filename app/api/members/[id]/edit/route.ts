import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
} from '@/lib/access-control-jobs'
import {
  buildAddUserPayloadWithAccessWindow,
} from '@/lib/member-job'
import {
  getAccessDateTimeValue,
  parseLocalDateTime,
} from '@/lib/member-access-time'
import { buildHikMemberName } from '@/lib/member-name'
import {
  mapMemberRecordToMemberWithCardCode,
  MEMBER_RECORD_SELECT,
  readMemberWithCardCode,
  type MembersReadClient,
} from '@/lib/members'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { MemberGender, MemberRecord, MemberType } from '@/types'

const UPDATE_MEMBER_WARNING = 'Member updated but device sync failed. Please try again.'
const UPDATE_MEMBER_TIMEOUT_ERROR = 'Member update request timed out after 10 seconds.'

const editMemberRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  type: z.enum(['General', 'Civil Servant', 'Student/BPO']),
  gender: z.enum(['Male', 'Female']).nullable().optional(),
  email: z.string().trim().email('Email must be valid.').nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  remark: z.string().trim().min(1).nullable().optional(),
  beginTime: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'Begin time must be valid.'),
  endTime: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'End time must be valid.'),
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

function normalizeOptionalText(value: string | null | undefined) {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  return normalizedValue || null
}

function validateAccessWindow(beginTime: string, endTime: string) {
  const parsedBeginTime = parseLocalDateTime(beginTime)

  if (!parsedBeginTime) {
    return 'Begin time must be a valid YYYY-MM-DDTHH:mm:ss datetime.'
  }

  const parsedEndTime = parseLocalDateTime(endTime)

  if (!parsedEndTime) {
    return 'End time must be a valid YYYY-MM-DDTHH:mm:ss datetime.'
  }

  if (parsedEndTime.getTime() <= parsedBeginTime.getTime()) {
    return 'End time must be after begin time.'
  }

  return null
}

function buildCardLookupFromMember(
  member: Awaited<ReturnType<typeof readMemberWithCardCode>>,
) {
  if (!member?.cardNo || !member.cardStatus) {
    return new Map<string, { cardCode: string | null; status: 'available' | 'assigned' | 'suspended_lost' | 'disabled'; lostAt: string | null }>()
  }

  return new Map([
    [
      member.cardNo,
      {
        cardCode: member.cardCode,
        status: member.cardStatus,
        lostAt: member.cardLostAt,
      },
    ],
  ])
}

function hasAccessWindowChanged(
  currentMember: NonNullable<Awaited<ReturnType<typeof readMemberWithCardCode>>>,
  nextBeginTime: string,
  nextEndTime: string,
) {
  return (
    getAccessDateTimeValue(currentMember.beginTime) !== nextBeginTime ||
    getAccessDateTimeValue(currentMember.endTime) !== nextEndTime
  )
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const requestBody = await request.json()
    const input = editMemberRequestSchema.parse(requestBody)
    const validationError = validateAccessWindow(input.beginTime, input.endTime)

    if (validationError) {
      return createErrorResponse(validationError, 400)
    }

    const supabase = getSupabaseAdminClient() as unknown as MembersReadClient & AccessControlJobsClient
    const currentMember = await readMemberWithCardCode(supabase, id)

    if (!currentMember) {
      return createErrorResponse('Member not found.', 404)
    }

    const prefixedName = buildHikMemberName(input.name, currentMember.cardCode)
    const { data: updatedRecord, error } = await supabase
      .from('members')
      .update({
        name: prefixedName,
        type: input.type,
        gender: input.gender ?? null,
        email: normalizeOptionalText(input.email),
        phone: normalizeOptionalText(input.phone),
        remark: normalizeOptionalText(input.remark),
        begin_time: input.beginTime,
        end_time: input.endTime,
      })
      .eq('id', id)
      .select(MEMBER_RECORD_SELECT)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to update member ${id}: ${error.message}`)
    }

    if (!updatedRecord) {
      return createErrorResponse('Member not found.', 404)
    }

    const member = mapMemberRecordToMemberWithCardCode(
      updatedRecord as MemberRecord,
      buildCardLookupFromMember(currentMember),
    )

    if (!hasAccessWindowChanged(currentMember, input.beginTime, input.endTime)) {
      return NextResponse.json({
        ok: true,
        member,
      })
    }

    try {
      const addUserJob = await createAndWaitForAccessControlJob({
        jobType: 'add_user',
        payload: buildAddUserPayloadWithAccessWindow({
          employeeNo: currentMember.employeeNo,
          name: prefixedName,
          beginTime: input.beginTime,
          endTime: input.endTime,
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
          member,
          warning: UPDATE_MEMBER_WARNING,
        })
      }
    } catch (syncError) {
      console.error('Failed to sync updated member access window:', syncError)

      return NextResponse.json({
        ok: true,
        member,
        warning: UPDATE_MEMBER_WARNING,
      })
    }

    return NextResponse.json({
      ok: true,
      member,
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
        : 'Unexpected server error while updating a member.',
      500,
    )
  }
}
