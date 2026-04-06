import { NextResponse } from 'next/server'
import { createAndWaitForAccessControlJob } from '@/lib/access-control-jobs'
import { addMemberUserJobRequestSchema, buildAddUserPayload } from '@/lib/member-job'
import { requireAdminUser } from '@/lib/server-auth'

const TIMEOUT_ERROR = 'Create member request timed out after 10 seconds.'

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = addMemberUserJobRequestSchema.parse(requestBody)
    const payload = buildAddUserPayload(input)

    const job = await createAndWaitForAccessControlJob({
      jobType: 'add_user',
      payload,
      messages: {
        createErrorPrefix: 'Failed to create add user job',
        missingJobIdMessage: 'Failed to create add user job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read add user job ${jobId}`,
        missingJobMessage: (jobId) => `Add user job ${jobId} was not found after creation.`,
        failedJobMessage: 'Add user job failed.',
        timeoutMessage: TIMEOUT_ERROR,
      },
    })

    if (job.status === 'done') {
      return NextResponse.json({
        ok: true,
        jobId: job.jobId,
        result: job.result,
      })
    }

    return NextResponse.json(
      {
        ok: false,
        jobId: job.jobId,
        error: job.error,
      },
      { status: job.httpStatus },
    )
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
      error instanceof Error ? error.message : 'Unexpected server error while creating a member.'

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    )
  }
}
