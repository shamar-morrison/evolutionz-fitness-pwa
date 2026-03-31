import { NextResponse } from 'next/server'
import {
  type AccessControlJobsClient,
  createAndWaitForAccessControlJob,
  type AccessControlJobOutcome,
} from '@/lib/access-control-jobs'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import {
  buildAddCardPayload,
  buildAddUserPayload,
  generateEmployeeNo,
  provisionMemberAccessRequestSchema,
} from '@/lib/member-job'

const CREATE_USER_TIMEOUT_ERROR = 'Create member request timed out after 10 seconds.'
const ISSUE_CARD_TIMEOUT_ERROR = 'Issue card request timed out after 10 seconds.'
const DELETE_USER_TIMEOUT_ERROR = 'Delete member request timed out after 10 seconds.'
const ILLEGAL_PERSON_ID_ERROR = 'The Hik device rejected the generated person ID. Please try again.'
const USER_CREATION_FAILED_PREFIX = 'Failed to create the Hik user before card assignment:'

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

function buildAddUserFailureMessage(error: string, cardSource: 'inventory' | 'manual') {
  const normalizedError = normalizeProvisioningErrorMessage(error)
  const stepSpecificMessage = `${USER_CREATION_FAILED_PREFIX} ${normalizedError}`

  if (cardSource === 'manual') {
    return `${stepSpecificMessage} The manually entered card number was not yet sent to CardInfo/Modify because Hik user creation failed first.`
  }

  return `${stepSpecificMessage} Card assignment was not attempted because Hik user creation failed first.`
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

function buildRollbackError(baseError: string, rollbackResult: AccessControlJobOutcome | null, rollbackError: string | null) {
  if (rollbackResult?.status === 'done') {
    return `${baseError} The created Hik user was rolled back.`
  }

  if (rollbackResult) {
    return `${baseError} Rollback failed: ${rollbackResult.error}`
  }

  if (rollbackError) {
    return `${baseError} Rollback failed: ${rollbackError}`
  }

  return `${baseError} Rollback failed.`
}

export async function POST(request: Request) {
  try {
    const requestBody = await request.json()
    const input = provisionMemberAccessRequestSchema.parse(requestBody)
    const now = new Date()
    const employeeNo = generateEmployeeNo(now)
    const supabase = getSupabaseAdminClient() as unknown as AccessControlJobsClient

    const addUserJob = await createAndWaitForAccessControlJob({
      jobType: 'add_user',
      payload: buildAddUserPayload(
        {
          employeeNo,
          name: input.name,
          expiry: input.expiry,
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
      return createErrorResponse(
        buildAddUserFailureMessage(addUserJob.error, input.cardSource),
        addUserJob.httpStatus,
      )
    }

    try {
      const addCardJob = await createAndWaitForAccessControlJob({
        jobType: 'add_card',
        payload: buildAddCardPayload({
          employeeNo,
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
        let rollbackResult: AccessControlJobOutcome | null = null
        let rollbackError: string | null = null

        try {
          rollbackResult = await deleteProvisionedUser(employeeNo, supabase)
        } catch (error) {
          rollbackError = error instanceof Error ? error.message : 'Unexpected rollback error.'
        }

        return createErrorResponse(
          buildRollbackError(
            `Failed to issue card ${input.cardNo}: ${addCardJob.error}`,
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
          `Failed to issue card ${input.cardNo}: ${
            error instanceof Error ? error.message : 'Unexpected card provisioning error.'
          }`,
          rollbackResult,
          rollbackError,
        ),
        500,
      )
    }

    return NextResponse.json({
      ok: true,
      employeeNo,
      cardNo: input.cardNo.trim(),
    })
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
