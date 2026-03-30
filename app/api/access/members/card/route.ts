import { NextResponse } from 'next/server'
import { createAndWaitForAccessControlJob } from '@/lib/access-control-jobs'
import { addMemberCardJobRequestSchema, buildAddCardPayload } from '@/lib/member-job'

const TIMEOUT_ERROR = 'Issue card request timed out after 10 seconds.'

export async function POST(request: Request) {
  try {
    const requestBody = await request.json()
    const input = addMemberCardJobRequestSchema.parse(requestBody)
    const payload = buildAddCardPayload(input)

    const job = await createAndWaitForAccessControlJob({
      jobType: 'add_card',
      payload,
      messages: {
        createErrorPrefix: 'Failed to create add card job',
        missingJobIdMessage: 'Failed to create add card job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read add card job ${jobId}`,
        missingJobMessage: (jobId) => `Add card job ${jobId} was not found after creation.`,
        failedJobMessage: 'Add card job failed.',
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
      error instanceof Error ? error.message : 'Unexpected server error while issuing a card.'

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    )
  }
}
