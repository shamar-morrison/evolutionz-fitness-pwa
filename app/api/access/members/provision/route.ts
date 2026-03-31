import { NextResponse } from 'next/server'
import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
  type AccessControlJobOutcome,
} from '@/lib/access-control-jobs'
import { buildHikMemberName } from '@/lib/member-name'
import {
  mapMemberRecordToMemberWithCardCode,
  MEMBER_RECORD_SELECT,
} from '@/lib/members'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  buildAddCardPayload,
  buildAddUserPayload,
  generateEmployeeNo,
  getNextShortEmployeeNo,
  provisionMemberAccessRequestSchema,
} from '@/lib/member-job'
import type { MemberRecord, MemberType } from '@/types'

const CREATE_USER_TIMEOUT_ERROR = 'Create member request timed out after 10 seconds.'
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

type ExpiryValidationResult =
  | {
      ok: true
      value: {
        value: string
        hikEndTime: string
        persistedExpiry: string
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
      expiry: string
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

function buildPersistedExpiryTimestamp(expiry: string) {
  return `${expiry}T23:59:59Z`
}

function validateProvisioningExpiry(expiry: string, now: Date): ExpiryValidationResult {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiry)

  if (!match) {
    return {
      ok: false,
      error: 'Expiry must be in YYYY-MM-DD format.',
    }
  }

  const [, yearPart, monthPart, dayPart] = match
  const year = Number(yearPart)
  const monthIndex = Number(monthPart) - 1
  const day = Number(dayPart)
  const endOfDay = new Date(year, monthIndex, day, 23, 59, 59, 0)

  if (
    Number.isNaN(endOfDay.getTime()) ||
    endOfDay.getFullYear() !== year ||
    endOfDay.getMonth() !== monthIndex ||
    endOfDay.getDate() !== day
  ) {
    return {
      ok: false,
      error: 'Expiry must be a valid calendar date.',
    }
  }

  if (endOfDay.getTime() <= now.getTime()) {
    return {
      ok: false,
      error: 'Expiry date must be in the future.',
    }
  }

  return {
    ok: true,
    value: {
      value: expiry,
      hikEndTime: `${expiry}T23:59:59`,
      persistedExpiry: buildPersistedExpiryTimestamp(expiry),
    },
  }
}

function appendDetail(message: string, detail: string) {
  return /[.!?]$/.test(message) ? `${message} ${detail}` : `${message}. ${detail}`
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
    persistedExpiry: string
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
      expiry: input.persistedExpiry,
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

export async function POST(request: Request) {
  try {
    const requestBody = await request.json()
    const input = provisionMemberAccessRequestSchema.parse(requestBody)
    const now = new Date()
    const normalizedCardNo = input.cardNo.trim()
    const normalizedCardCode = input.cardCode.trim()
    const supabase = getSupabaseAdminClient() as unknown as ProvisioningAdminClient
    const validatedExpiry = validateProvisioningExpiry(input.expiry, now)

    if (!validatedExpiry.ok) {
      return createErrorResponse(validatedExpiry.error, 400)
    }

    const employeeNo = await getNextProvisioningEmployeeNo(now, supabase)

    const addUserJob = await createAndWaitForAccessControlJob({
      jobType: 'add_user',
      payload: buildAddUserPayload(
        {
          employeeNo,
          name: buildHikMemberName(input.name, normalizedCardCode),
          expiry: validatedExpiry.value.value,
        },
        now,
      ),
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
        let rollbackResult: AccessControlJobOutcome | null = null
        let rollbackError: string | null = null

        try {
          rollbackResult = await deleteProvisionedUser(employeeNo, supabase)
        } catch (error) {
          rollbackError = error instanceof Error ? error.message : 'Unexpected rollback error.'
        }

        return createErrorResponse(
          buildRollbackError(
            `Failed to issue card ${normalizedCardNo}: ${addCardJob.error}`,
            rollbackResult,
            rollbackError,
          ),
          addCardJob.httpStatus,
        )
      }
    } catch (error) {
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
        buildRollbackError(
          `Failed to issue card ${normalizedCardNo}: ${
            error instanceof Error ? error.message : 'Unexpected card provisioning error.'
          }`,
          rollbackResult,
          rollbackError,
        ),
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
          persistedExpiry: validatedExpiry.value.persistedExpiry,
          cardNo: normalizedCardNo,
          cardCode: normalizedCardCode,
        },
        supabase,
      )

      return NextResponse.json({
        ok: true,
        member: mapMemberRecordToMemberWithCardCode(
          memberRecord,
          new Map([[normalizedCardNo, normalizedCardCode]]),
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
