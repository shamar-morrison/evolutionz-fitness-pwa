import { NextResponse } from 'next/server'
import { createAndWaitForAccessControlJob } from '@/lib/access-control-jobs'
import { normalizeAvailableAccessSlots } from '@/lib/available-slots'
import { requireAdminUser } from '@/lib/server-auth'

const MAX_WAIT_MS = 60_000
const TIMEOUT_ERROR = 'Fetch available slots request timed out after 60 seconds.'

export async function GET() {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const job = await createAndWaitForAccessControlJob({
      jobType: 'list_available_slots',
      payload: {},
      messages: {
        createErrorPrefix: 'Failed to create list available slots job',
        missingJobIdMessage: 'Failed to create list available slots job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read list available slots job ${jobId}`,
        missingJobMessage: (jobId) => `List available slots job ${jobId} was not found after creation.`,
        failedJobMessage: 'List available slots job failed.',
        timeoutMessage: TIMEOUT_ERROR,
      },
      maxWaitMs: MAX_WAIT_MS,
    })

    if (job.status === 'done') {
      return NextResponse.json({
        ok: true,
        slots: normalizeAvailableAccessSlots(job.result),
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
    const message =
      error instanceof Error
        ? error.message
        : 'Unexpected server error while fetching available slots.'

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    )
  }
}
