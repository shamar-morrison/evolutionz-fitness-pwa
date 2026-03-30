import { NextResponse } from 'next/server'
import { createAndWaitForAccessControlJob } from '@/lib/access-control-jobs'
import { resetAccessSlotJobRequestSchema } from '@/lib/member-job'

const TIMEOUT_ERROR = 'Reset slot request timed out after 10 seconds.'

export async function POST(request: Request) {
  try {
    const requestBody = await request.json()
    const input = resetAccessSlotJobRequestSchema.parse(requestBody)

    const job = await createAndWaitForAccessControlJob({
      jobType: 'reset_slot',
      payload: input,
      messages: {
        createErrorPrefix: 'Failed to create reset slot job',
        missingJobIdMessage: 'Failed to create reset slot job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read reset slot job ${jobId}`,
        missingJobMessage: (jobId) => `Reset slot job ${jobId} was not found after creation.`,
        failedJobMessage: 'Reset slot job failed.',
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
      error instanceof Error ? error.message : 'Unexpected server error while resetting a slot.'

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    )
  }
}
