import { NextResponse } from 'next/server'
import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
  type AccessControlJobOutcome,
} from '@/lib/access-control-jobs'
import { formatDateInputValue, parseLocalDateTime } from '@/lib/member-access-time'
import { buildHikMemberName } from '@/lib/member-name'
import {
  mapMemberRecordToMemberWithCardCode,
  MEMBER_RECORD_SELECT,
} from '@/lib/members'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  buildAddCardPayload,
  buildAddUserPayloadWithAccessWindow,
  generateEmployeeNo,
  getNextShortEmployeeNo,
  provisionMemberAccessRequestSchema,
} from '@/lib/member-job'
import type { MemberGender, MemberRecord, MemberType } from '@/types'

const CREATE_USER_TIMEOUT_ERROR = 'Create member request timed out after 10 seconds.'
const GET_CARD_TIMEOUT_ERROR = 'Check card request timed out after 10 seconds.'
const REVOKE_CARD_TIMEOUT_ERROR = 'Release card request timed out after 10 seconds.'
const ISSUE_CARD_TIMEOUT_ERROR = 'Issue card request timed out after 10 seconds.'
const DELETE_USER_TIMEOUT_ERROR = 'Delete member request timed out after 10 seconds.'
const ILLEGAL_PERSON_ID_ERROR = 'The Hik device rejected the generated person ID. Please try again.'
const USER_CREATION_FAILED_PREFIX = 'Failed to create the Hik user before card assignment:'

type QueryError = {
  message: string
}

type QueryResult<T> = PromiseLike<{
  data: T | null
  error: QueryError | null
}>

type PersistedCardRow = {
  card_no: string
  card_code: string | null
}

type EmployeeNoRow = {
  employee_no: string | null
}

type HikCardInfoRecord = {
  cardNo?: unknown
  employeeNo?: unknown
}

type AccessWindowValidationResult =
  | {
      ok: true
      value: {
        beginTime: string
        endTime: string
      }
    }
  | {
      ok: false
      error: string
    }

type ProvisioningAdminClient = AccessControlJobsClient & {
  from(table: 'members'): {
    select(columns: string): QueryResult<EmployeeNoRow[]>
    insert(values: {
      employee_no: string
      name: string
      card_no: string
      type: MemberType
      status: 'Active'
      gender: MemberGender | null
      email: string | null
      phone: string | null
      remark: string | null
      photo_url: string | null
      begin_time: string
      end_time: string
      balance: number
    }): {
      select(columns: string): {
        single(): QueryResult<MemberRecord>
      }
    }
  }
  from(table: 'cards'): {
    update(values: {
      status: 'available' | 'assigned'
      employee_no: string | null
    }): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          select(columns: string): {
            maybeSingle(): QueryResult<PersistedCardRow>
          }
        }
        select(columns: string): {
          maybeSingle(): QueryResult<PersistedCardRow>
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

function normalizeProvisioningErrorMessage(error: string) {
  if (/illegalEmployeeNo/i.test(error)) {
    console.error('[access] Hik rejected generated person ID:', error)
    return ILLEGAL_PERSON_ID_ERROR
  }

  return error
}

function buildAddUserFailureMessage(error: string) {
  const normalizedError = normalizeProvisioningErrorMessage(error)
  const stepSpecificMessage = `${USER_CREATION_FAILED_PREFIX} ${normalizedError}`

  return `${stepSpecificMessage} Card assignment was not attempted because Hik user creation failed first.`
}

function validateProvisioningAccessWindow(
  beginTime: string,
  endTime: string,
  now: Date,
): AccessWindowValidationResult {
  const parsedBeginTime = parseLocalDateTime(beginTime)

  if (!parsedBeginTime) {
    return {
      ok: false,
      error: 'Begin time must be a valid YYYY-MM-DDTHH:mm:ss datetime.',
    }
  }

  const parsedEndTime = parseLocalDateTime(endTime)

  if (!parsedEndTime) {
    return {
      ok: false,
      error: 'End time must be a valid YYYY-MM-DDTHH:mm:ss datetime.',
    }
  }

  if (beginTime.slice(0, 10) < formatDateInputValue(now)) {
    return {
      ok: false,
      error: 'Begin time date must be today or later.',
    }
  }

  if (parsedEndTime.getTime() <= parsedBeginTime.getTime()) {
    return {
      ok: false,
      error: 'End time must be after begin time.',
    }
  }

  if (parsedEndTime.getTime() <= now.getTime()) {
    return {
      ok: false,
      error: 'End time must be in the future.',
    }
  }

  return {
    ok: true,
    value: {
      beginTime,
      endTime,
    },
  }
}

function appendDetail(message: string, detail: string) {
  return /[.!?]$/.test(message) ? `${message} ${detail}` : `${message}. ${detail}`
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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

async function deleteProvisionedUser(
  employeeNo: string,
  supabase: AccessControlJobsClient,
): Promise<AccessControlJobOutcome> {
  return createAndWaitForAccessControlJob({
    jobType: 'delete_user',
    payload: {
      employeeNo,
    },
    messages: {
      createErrorPrefix: 'Failed to create delete user job',
      missingJobIdMessage: 'Failed to create delete user job: missing job id in response',
      readErrorPrefix: (jobId) => `Failed to read delete user job ${jobId}`,
      missingJobMessage: (jobId) => `Delete user job ${jobId} was not found after creation.`,
      failedJobMessage: 'Delete user job failed.',
      timeoutMessage: DELETE_USER_TIMEOUT_ERROR,
    },
    supabase,
  })
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

async function assignCardInSupabase(
  cardNo: string,
  employeeNo: string,
  supabase: ProvisioningAdminClient,
) {
  const { data, error } = await supabase
    .from('cards')
    .update({
      status: 'assigned',
      employee_no: employeeNo,
    })
    .eq('card_no', cardNo)
    .eq('status', 'available')
    .select('card_no, card_code')
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to persist assigned card ${cardNo}: ${error.message}`)
  }

  if (!data) {
    throw new Error(
      `Failed to persist assigned card ${cardNo}: selected card is not available in Supabase.`,
    )
  }

  return data
}

async function restoreCardInSupabase(cardNo: string, supabase: ProvisioningAdminClient) {
  const { data, error } = await supabase
    .from('cards')
    .update({
      status: 'available',
      employee_no: null,
    })
    .eq('card_no', cardNo)
    .select('card_no')
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to restore card ${cardNo}: ${error.message}`)
  }

  if (!data) {
    throw new Error(`Failed to restore card ${cardNo}: missing updated row.`)
  }
}

async function insertMemberRecordInSupabase(
  input: {
    employeeNo: string
    name: string
    type: MemberType
    gender: MemberGender | null
    email: string | null
    phone: string | null
    remark: string | null
    beginTime: string
    endTime: string
    cardNo: string
    cardCode: string
  },
  supabase: ProvisioningAdminClient,
) {
  const { data, error } = await supabase
    .from('members')
    .insert({
      employee_no: input.employeeNo,
      name: buildHikMemberName(input.name, input.cardCode),
      card_no: input.cardNo,
      type: input.type,
      status: 'Active',
      gender: input.gender,
      email: input.email,
      phone: input.phone,
      remark: input.remark,
      photo_url: null,
      begin_time: input.beginTime,
      end_time: input.endTime,
      balance: 0,
    })
    .select(MEMBER_RECORD_SELECT)
    .single()

  if (error) {
    throw new Error(`Failed to persist member record: ${error.message}`)
  }

  if (!data) {
    throw new Error('Failed to persist member record: missing inserted row.')
  }

  return data
}

async function getNextProvisioningEmployeeNo(now: Date, supabase: ProvisioningAdminClient) {
  const { data, error } = await supabase.from('members').select('employee_no')

  if (error) {
    throw new Error(`Failed to load existing employee numbers: ${error.message}`)
  }

  return getNextShortEmployeeNo(
    (data ?? []).map((row) => row.employee_no ?? ''),
    generateEmployeeNo(now),
  )
}

function buildRollbackError(
  baseError: string,
  rollbackResult: AccessControlJobOutcome | null,
  rollbackError: string | null,
) {
  if (rollbackResult?.status === 'done') {
    return appendDetail(baseError, 'The created Hik user was rolled back.')
  }

  if (rollbackResult) {
    return appendDetail(baseError, `Rollback failed: ${rollbackResult.error}`)
  }

  if (rollbackError) {
    return appendDetail(baseError, `Rollback failed: ${rollbackError}`)
  }

  return appendDetail(baseError, 'Rollback failed.')
}

function buildPersistenceRollbackError(
  baseError: string,
  databaseRollbackError: string | null,
  rollbackResult: AccessControlJobOutcome | null,
  rollbackError: string | null,
) {
  const message = databaseRollbackError
    ? appendDetail(baseError, `Database rollback failed: ${databaseRollbackError}`)
    : baseError

  if (rollbackResult?.status === 'done') {
    return appendDetail(message, 'The created Hik user was rolled back.')
  }

  if (rollbackResult) {
    return appendDetail(message, `Hik rollback failed: ${rollbackResult.error}`)
  }

  if (rollbackError) {
    return appendDetail(message, `Hik rollback failed: ${rollbackError}`)
  }

  return appendDetail(message, 'Hik rollback failed.')
}

async function createDeviceRollbackResponse(
  baseError: string,
  employeeNo: string,
  supabase: AccessControlJobsClient,
  status: number,
) {
  let rollbackResult: AccessControlJobOutcome | null = null
  let rollbackError: string | null = null

  try {
    rollbackResult = await deleteProvisionedUser(employeeNo, supabase)
  } catch (error) {
    rollbackError = error instanceof Error ? error.message : 'Unexpected rollback error.'
  }

  return createErrorResponse(buildRollbackError(baseError, rollbackResult, rollbackError), status)
}

export async function POST(request: Request) {
  try {
    const requestBody = await request.json()
    const input = provisionMemberAccessRequestSchema.parse(requestBody)
    const now = new Date()
    const normalizedCardNo = input.cardNo.trim()
    const normalizedCardCode = input.cardCode.trim()
    const supabase = getSupabaseAdminClient() as unknown as ProvisioningAdminClient
    const validatedAccessWindow = validateProvisioningAccessWindow(
      input.beginTime,
      input.endTime,
      now,
    )

    if (!validatedAccessWindow.ok) {
      return createErrorResponse(validatedAccessWindow.error, 400)
    }

    const employeeNo = await getNextProvisioningEmployeeNo(now, supabase)

    const addUserJob = await createAndWaitForAccessControlJob({
      jobType: 'add_user',
      payload: buildAddUserPayloadWithAccessWindow({
        employeeNo,
        name: buildHikMemberName(input.name, normalizedCardCode),
        beginTime: validatedAccessWindow.value.beginTime,
        endTime: validatedAccessWindow.value.endTime,
      }),
      messages: {
        createErrorPrefix: 'Failed to create add user job',
        missingJobIdMessage: 'Failed to create add user job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read add user job ${jobId}`,
        missingJobMessage: (jobId) => `Add user job ${jobId} was not found after creation.`,
        failedJobMessage: 'Add user job failed.',
        timeoutMessage: CREATE_USER_TIMEOUT_ERROR,
      },
      supabase,
    })

    if (addUserJob.status !== 'done') {
      return createErrorResponse(buildAddUserFailureMessage(addUserJob.error), addUserJob.httpStatus)
    }

    let existingCardEmployeeNo: string | null = null

    try {
      const getCardJob = await getCardAssignment(normalizedCardNo, supabase)

      if (getCardJob.status !== 'done') {
        return await createDeviceRollbackResponse(
          `Failed to check card ${normalizedCardNo}: ${getCardJob.error}`,
          employeeNo,
          supabase,
          getCardJob.httpStatus,
        )
      }

      existingCardEmployeeNo = getAssignedEmployeeNoForCard(getCardJob.result, normalizedCardNo)
    } catch (error) {
      return await createDeviceRollbackResponse(
        `Failed to check card ${normalizedCardNo}: ${
          error instanceof Error ? error.message : 'Unexpected card lookup error.'
        }`,
        employeeNo,
        supabase,
        500,
      )
    }

    if (existingCardEmployeeNo && existingCardEmployeeNo !== employeeNo) {
      try {
        const revokeCardJob = await revokeAssignedCard(
          existingCardEmployeeNo,
          normalizedCardNo,
          supabase,
        )

        if (revokeCardJob.status !== 'done') {
          return await createDeviceRollbackResponse(
            `Failed to release card ${normalizedCardNo} from Hik user ${existingCardEmployeeNo}: ${revokeCardJob.error}`,
            employeeNo,
            supabase,
            revokeCardJob.httpStatus,
          )
        }

        await new Promise((resolve) => setTimeout(resolve, 2000))
      } catch (error) {
        return await createDeviceRollbackResponse(
          `Failed to release card ${normalizedCardNo} from Hik user ${existingCardEmployeeNo}: ${
            error instanceof Error ? error.message : 'Unexpected card release error.'
          }`,
          employeeNo,
          supabase,
          500,
        )
      }
    }

    try {
      const addCardJob = await createAndWaitForAccessControlJob({
        jobType: 'add_card',
        payload: buildAddCardPayload({
          employeeNo,
          cardNo: normalizedCardNo,
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
        return await createDeviceRollbackResponse(
          `Failed to issue card ${normalizedCardNo}: ${addCardJob.error}`,
          employeeNo,
          supabase,
          addCardJob.httpStatus,
        )
      }

      const addCardFailure = getCompletedAddCardJobFailure(addCardJob.result)

      if (addCardFailure) {
        return await createDeviceRollbackResponse(
          `Failed to issue card ${normalizedCardNo}: ${addCardFailure}`,
          employeeNo,
          supabase,
          502,
        )
      }
    } catch (error) {
      return await createDeviceRollbackResponse(
        `Failed to issue card ${normalizedCardNo}: ${
          error instanceof Error ? error.message : 'Unexpected card provisioning error.'
        }`,
        employeeNo,
        supabase,
        500,
      )
    }

    let hasPersistedCardAssignment = false

    try {
      await assignCardInSupabase(normalizedCardNo, employeeNo, supabase)
      hasPersistedCardAssignment = true

      const memberRecord = await insertMemberRecordInSupabase(
        {
          employeeNo,
          name: input.name,
          type: input.type,
          gender: input.gender ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          remark: input.remark ?? null,
          beginTime: validatedAccessWindow.value.beginTime,
          endTime: validatedAccessWindow.value.endTime,
          cardNo: normalizedCardNo,
          cardCode: normalizedCardCode,
        },
        supabase,
      )

      return NextResponse.json({
        ok: true,
        member: mapMemberRecordToMemberWithCardCode(
          memberRecord,
          new Map([
            [
              normalizedCardNo,
              {
                cardCode: normalizedCardCode,
                status: 'assigned',
                lostAt: null,
              },
            ],
          ]),
        ),
      })
    } catch (error) {
      let databaseRollbackError: string | null = null

      if (hasPersistedCardAssignment) {
        try {
          await restoreCardInSupabase(normalizedCardNo, supabase)
        } catch (rollbackFailure) {
          databaseRollbackError =
            rollbackFailure instanceof Error
              ? rollbackFailure.message
              : 'Unexpected database rollback error.'
        }
      }

      let rollbackResult: AccessControlJobOutcome | null = null
      let rollbackError: string | null = null

      try {
        rollbackResult = await deleteProvisionedUser(employeeNo, supabase)
      } catch (rollbackFailure) {
        rollbackError =
          rollbackFailure instanceof Error
            ? rollbackFailure.message
            : 'Unexpected rollback error.'
      }

      return createErrorResponse(
        buildPersistenceRollbackError(
          error instanceof Error
            ? error.message
            : 'Failed to persist the provisioned member in Supabase.',
          databaseRollbackError,
          rollbackResult,
          rollbackError,
        ),
        500,
      )
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid JSON body.',
        },
        { status: 400 },
      )
    }

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 400 },
      )
    }

    const message =
      error instanceof Error ? error.message : 'Unexpected server error while provisioning a member.'

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    )
  }
}
