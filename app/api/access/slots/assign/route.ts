import { NextResponse } from 'next/server'
import { createAndWaitForAccessControlJob } from '@/lib/access-control-jobs'
import { assignAccessSlotJobRequestSchema, buildAssignSlotPayload } from '@/lib/member-job'
import { requireAdminUser } from '@/lib/server-auth'

const TIMEOUT_ERROR = 'Assign slot request timed out after 10 seconds.'

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const input = assignAccessSlotJobRequestSchema.parse(requestBody)
    const payload = buildAssignSlotPayload(input)

    const job = await createAndWaitForAccessControlJob({
      jobType: 'add_user',
      payload,
      messages: {
        createErrorPrefix: 'Failed to create assign slot job',
        missingJobIdMessage: 'Failed to create assign slot job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read assign slot job ${jobId}`,
        missingJobMessage: (jobId) => `Assign slot job ${jobId} was not found after creation.`,
        failedJobMessage: 'Assign slot job failed.',
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
      error instanceof Error ? error.message : 'Unexpected server error while assigning a slot.'

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    )
  }
}
