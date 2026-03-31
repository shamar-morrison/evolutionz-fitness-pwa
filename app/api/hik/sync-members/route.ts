import { NextResponse } from 'next/server'
import { createAndWaitForAccessControlJob } from '@/lib/access-control-jobs'
import { normalizeMemberSyncSummary } from '@/lib/hik-sync'

const POLL_INTERVAL_MS = 2_000
const MAX_WAIT_MS = 180_000
const TIMEOUT_ERROR = 'Sync members request timed out after 180 seconds.'

export async function POST() {
  try {
    // TODO: add admin role check once auth is fully wired up
    const job = await createAndWaitForAccessControlJob({
      jobType: 'sync_all_members',
      payload: {},
      messages: {
        createErrorPrefix: 'Failed to create sync all members job',
        missingJobIdMessage: 'Failed to create sync all members job: missing job id in response',
        readErrorPrefix: (jobId) => `Failed to read sync all members job ${jobId}`,
        missingJobMessage: (jobId) => `Sync all members job ${jobId} was not found after creation.`,
        failedJobMessage: 'Sync all members job failed.',
        timeoutMessage: TIMEOUT_ERROR,
      },
      pollIntervalMs: POLL_INTERVAL_MS,
      maxWaitMs: MAX_WAIT_MS,
    })

    if (job.status === 'done') {
      return NextResponse.json({
        ok: true,
        summary: normalizeMemberSyncSummary(job.result),
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
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error while syncing members from the device.',
      },
      { status: 500 },
    )
  }
}
