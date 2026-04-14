import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
  type AccessControlJobOutcome,
} from '@/lib/access-control-jobs'
import { parseLocalDateTime } from '@/lib/member-access-time'
import { DEFAULT_PLACEHOLDER_SLOT_PATTERN, buildAddCardPayload } from '@/lib/member-job'
import { resolveMembershipLifecycleStatus } from '@/lib/member-status'
import {
  MEMBER_RECORD_SELECT,
  readMemberWithCardCode,
  type MembersReadClient,
} from '@/lib/members'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const assignMemberCardRequestSchema = z.object({
  cardNo: z
    .string({ required_error: 'Card number is required.' })
    .trim()
    .min(1, 'Card number is required.'),
  beginTime: z
    .string({ required_error: 'Begin time is required.' })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'Begin time must be valid.'),
  endTime: z
    .string({ required_error: 'End time is required.' })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'End time must be valid.'),
})

const defaultPlaceholderSlotPattern = new RegExp(DEFAULT_PLACEHOLDER_SLOT_PATTERN)
const GET_CARD_TIMEOUT_ERROR = 'Check card request timed out after 10 seconds.'
const GET_USER_TIMEOUT_ERROR = 'Get user request timed out after 10 seconds.'
const REVOKE_CARD_TIMEOUT_ERROR = 'Release card request timed out after 10 seconds.'
const ISSUE_CARD_TIMEOUT_ERROR = 'Issue card request timed out after 10 seconds.'

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type AssignCardAdminClient = MembersReadClient &
  AccessControlJobsClient & {
    rpc(
      fn: 'assign_member_card',
      args: {
        p_member_id: string
        p_employee_no: string
        p_card_no: string
      },
    ): QueryResult<null>
  }

type HikCardInfoRecord = {
  cardNo?: unknown
  employeeNo?: unknown
}

type HikUserInfoRecord = {
  employeeNo?: unknown
  name?: unknown
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

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function canonicalizeEmployeeNo(value: unknown) {
  const normalizedValue = normalizeText(value)

  if (!normalizedValue) {
    return ''
  }

  return normalizedValue.replace(/^0+/, '') || '0'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getHikCardInfoRecords(result: unknown): HikCardInfoRecord[] {
  if (!isRecord(result)) {
    return []
  }

  const cardInfoSearch = result.CardInfoSearch

  if (!isRecord(cardInfoSearch)) {
    return []
  }

  const cardInfo = cardInfoSearch.CardInfo

  if (Array.isArray(cardInfo)) {
    return cardInfo.filter(isRecord)
  }

  if (isRecord(cardInfo)) {
    return [cardInfo]
  }

  return []
}

function getAssignedEmployeeNoForCard(result: unknown, cardNo: string) {
  const normalizedCardNo = normalizeText(cardNo)

  if (!normalizedCardNo) {
    return null
  }

  for (const cardInfo of getHikCardInfoRecords(result)) {
    if (normalizeText(cardInfo.cardNo) !== normalizedCardNo) {
      continue
    }

    const employeeNo = normalizeText(cardInfo.employeeNo)
    return employeeNo || null
  }

  return null
}

function getHikUserInfoRecords(result: unknown): HikUserInfoRecord[] {
  if (!isRecord(result)) {
    return []
  }

  const userInfoSearch = result.UserInfoSearch

  if (!isRecord(userInfoSearch)) {
    return []
  }

  const userInfo = userInfoSearch.UserInfo

  if (Array.isArray(userInfo)) {
    return userInfo.filter(isRecord)
  }

  if (isRecord(userInfo)) {
    return [userInfo]
  }

  return []
}

function getUserNameForEmployeeNo(result: unknown, employeeNo: string) {
  const normalizedEmployeeNo = normalizeText(employeeNo)
  const canonicalEmployeeNo = canonicalizeEmployeeNo(employeeNo)
  const userInfoRecords = getHikUserInfoRecords(result)

  for (const userInfo of userInfoRecords) {
    const recordEmployeeNo = normalizeText(userInfo.employeeNo)

    if (
      recordEmployeeNo === normalizedEmployeeNo ||
      canonicalizeEmployeeNo(recordEmployeeNo) === canonicalEmployeeNo
    ) {
      return normalizeText(userInfo.name) || null
    }
  }

  if (userInfoRecords.length === 1) {
    return normalizeText(userInfoRecords[0]?.name) || null
  }

  return null
}

function getCompletedAddCardJobFailure(result: unknown) {
  if (!isRecord(result) || result.type !== 'ResponseStatus') {
    return null
  }

  const subStatusCode = normalizeText(result.subStatusCode)

  if (result.statusCode === 1 || subStatusCode.toLowerCase() === 'ok') {
    return null
  }

  const details = [
    typeof result.statusCode === 'number' ? `statusCode=${result.statusCode}` : null,
    normalizeText(result.statusString)
      ? `statusString=${normalizeText(result.statusString)}`
      : null,
    subStatusCode ? `subStatusCode=${subStatusCode}` : null,
    normalizeText(result.errorMsg) ? `errorMsg=${normalizeText(result.errorMsg)}` : null,
  ].filter((detail): detail is string => Boolean(detail))

  if (details.length === 0) {
    return 'Device reported unsuccessful card assignment response.'
  }

  return `Device reported unsuccessful card assignment response (${details.join(', ')}).`
}

async function getCardAssignment(
  cardNo: string,
  supabase: AccessControlJobsClient,
): Promise<AccessControlJobOutcome> {
  return createAndWaitForAccessControlJob({
    jobType: 'get_card',
    payload: {
      cardNo,
    },
    messages: {
      createErrorPrefix: 'Failed to create get card job',
      missingJobIdMessage: 'Failed to create get card job: missing job id in response',
      readErrorPrefix: (jobId) => `Failed to read get card job ${jobId}`,
      missingJobMessage: (jobId) => `Get card job ${jobId} was not found after creation.`,
      failedJobMessage: 'Get card job failed.',
      timeoutMessage: GET_CARD_TIMEOUT_ERROR,
    },
    supabase,
  })
}

async function getDeviceUser(
  employeeNo: string,
  supabase: AccessControlJobsClient,
): Promise<AccessControlJobOutcome> {
  return createAndWaitForAccessControlJob({
    jobType: 'get_user',
    payload: {
      employeeNo,
    },
    messages: {
      createErrorPrefix: 'Failed to create get user job',
      missingJobIdMessage: 'Failed to create get user job: missing job id in response',
      readErrorPrefix: (jobId) => `Failed to read get user job ${jobId}`,
      missingJobMessage: (jobId) => `Get user job ${jobId} was not found after creation.`,
      failedJobMessage: 'Get user job failed.',
      timeoutMessage: GET_USER_TIMEOUT_ERROR,
    },
    supabase,
  })
}

async function revokeAssignedCard(
  employeeNo: string,
  cardNo: string,
  supabase: AccessControlJobsClient,
): Promise<AccessControlJobOutcome> {
  return createAndWaitForAccessControlJob({
    jobType: 'revoke_card',
    payload: {
      employeeNo,
      cardNo,
    },
    messages: {
      createErrorPrefix: 'Failed to create revoke card job',
      missingJobIdMessage: 'Failed to create revoke card job: missing job id in response',
      readErrorPrefix: (jobId) => `Failed to read revoke card job ${jobId}`,
      missingJobMessage: (jobId) => `Revoke card job ${jobId} was not found after creation.`,
      failedJobMessage: 'Revoke card job failed.',
      timeoutMessage: REVOKE_CARD_TIMEOUT_ERROR,
    },
    supabase,
  })
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
    const requestBody = await request.json()
    const input = assignMemberCardRequestSchema.parse(requestBody)
    const validationError = validateAccessWindow(input.beginTime, input.endTime)

    if (validationError) {
      return createErrorResponse(validationError, 400)
    }

    const supabase = getSupabaseAdminClient() as unknown as AssignCardAdminClient

    const currentMember = await readMemberWithCardCode(supabase, id)

    if (!currentMember) {
      return createErrorResponse('Member not found.', 404)
    }

    if (currentMember.status === 'Suspended') {
      return createErrorResponse(
        'Suspended members must be reactivated before a card can be assigned.',
        400,
      )
    }

    if (currentMember.cardNo) {
      return createErrorResponse('This member already has a card assigned.', 400)
    }

    const memberEmployeeNo = currentMember.employeeNo
    const getCardJob = await getCardAssignment(input.cardNo, supabase)

    if (getCardJob.status !== 'done') {
      return createErrorResponse(getCardJob.error, getCardJob.httpStatus)
    }

    const existingCardEmployeeNo = getAssignedEmployeeNoForCard(getCardJob.result, input.cardNo)

    if (existingCardEmployeeNo && existingCardEmployeeNo !== memberEmployeeNo) {
      const getUserJob = await getDeviceUser(existingCardEmployeeNo, supabase)

      if (getUserJob.status !== 'done') {
        return createErrorResponse(getUserJob.error, getUserJob.httpStatus)
      }

      const holderName = getUserNameForEmployeeNo(getUserJob.result, existingCardEmployeeNo)

      if (!holderName) {
        return createErrorResponse(
          `Card ${input.cardNo} is assigned on the Hik device to employee ${existingCardEmployeeNo}, but that device user could not be confirmed as a placeholder slot.`,
          400,
        )
      }

      if (!defaultPlaceholderSlotPattern.test(holderName)) {
        return createErrorResponse(
          `Card ${input.cardNo} is assigned on the Hik device to employee ${existingCardEmployeeNo} (${holderName}). Only placeholder-held cards can be reassigned automatically.`,
          400,
        )
      }

      const revokeCardJob = await revokeAssignedCard(existingCardEmployeeNo, input.cardNo, supabase)

      if (revokeCardJob.status !== 'done') {
        return createErrorResponse(revokeCardJob.error, revokeCardJob.httpStatus)
      }

      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    const addCardJob = await createAndWaitForAccessControlJob({
      jobType: 'add_card',
      payload: buildAddCardPayload({
        employeeNo: memberEmployeeNo,
        cardNo: input.cardNo,
      }),
      messages: {
        createErrorPrefix: 'Failed to create add card job',
        missingJobIdMessage: 'Failed to create add card job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read add card job ${jobId}`,
        missingJobMessage: (jobId) => `Add card job ${jobId} was not found after creation.`,
        failedJobMessage: 'Add card job failed.',
        timeoutMessage: ISSUE_CARD_TIMEOUT_ERROR,
      },
      supabase,
    })

    if (addCardJob.status !== 'done') {
      return createErrorResponse(addCardJob.error, addCardJob.httpStatus)
    }

    const addCardFailure = getCompletedAddCardJobFailure(addCardJob.result)

    if (addCardFailure) {
      return createErrorResponse(`Failed to issue card ${input.cardNo}: ${addCardFailure}`, 502)
    }

    const { error } = await supabase.rpc('assign_member_card', {
      p_member_id: id,
      p_employee_no: memberEmployeeNo,
      p_card_no: input.cardNo,
    })

    if (error) {
      throw new Error(`Failed to assign card ${input.cardNo}: ${error.message}`)
    }

    const { data: updatedRecord, error: updateError } = await supabase
      .from('members')
      .update({
        begin_time: input.beginTime,
        end_time: input.endTime,
        status: resolveMembershipLifecycleStatus(input.endTime),
      })
      .eq('id', id)
      .eq('employee_no', memberEmployeeNo)
      .select(MEMBER_RECORD_SELECT)
      .maybeSingle()

    if (updateError) {
      throw new Error(`Failed to update member ${id}: ${updateError.message}`)
    }

    if (!updatedRecord) {
      return createErrorResponse('Member not found.', 404)
    }

    const member = await readMemberWithCardCode(supabase, id)

    if (!member) {
      return createErrorResponse('Member not found.', 404)
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
        : 'Unexpected server error while assigning a card.',
      500,
    )
  }
}
