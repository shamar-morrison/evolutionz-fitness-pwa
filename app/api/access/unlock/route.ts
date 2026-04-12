import { NextResponse } from 'next/server'
import { createAndWaitForAccessControlJob } from '@/lib/access-control-jobs'
import { resolvePermissionsForProfile } from '@/lib/server-permissions'
import { requireAuthenticatedProfile } from '@/lib/server-auth'

const DOOR_NUMBER = 1
const TIMEOUT_ERROR = 'Unlock request timed out after 10 seconds.'

export async function POST() {
  try {
    const authResult = await requireAuthenticatedProfile()

    if ('response' in authResult) {
      return authResult.response
    }

    const permissions = resolvePermissionsForProfile(authResult.profile)

    if (!permissions.can('door.unlock')) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }

    const job = await createAndWaitForAccessControlJob({
      jobType: 'unlock_door',
      payload: { doorNo: DOOR_NUMBER },
      messages: {
        createErrorPrefix: 'Failed to create unlock job',
        missingJobIdMessage: 'Failed to create unlock job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read unlock job ${jobId}`,
        missingJobMessage: (jobId) => `Unlock job ${jobId} was not found after creation.`,
        failedJobMessage: 'Unlock job failed.',
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
    const message =
      error instanceof Error ? error.message : 'Unexpected server error while unlocking the door.'

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    )
  }
}
