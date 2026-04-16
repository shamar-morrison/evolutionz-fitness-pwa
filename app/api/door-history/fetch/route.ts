import { NextResponse } from 'next/server'
import {
  createAndWaitForAccessControlJob,
  type AccessControlJobsClient,
} from '@/lib/access-control-jobs'
import {
  buildDoorHistoryDayBounds,
  normalizeDoorHistoryDeviceResult,
  parseDoorHistoryDateInput,
} from '@/lib/door-history'
import { requireAdminUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const MAX_WAIT_MS = 55_000
const LONG_RUNNING_WARNING_MS = 45_000
const TIMEOUT_ERROR = 'Fetch door history request timed out after 55 seconds.'

type DoorHistoryCacheWriteClient = {
  from(table: 'door_history_cache'): {
    upsert(
      values: {
        cache_date: string
        events: unknown
        fetched_at: string
        total_matches: number
      },
      options: { onConflict: 'cache_date' },
    ): Promise<{
      error: { message: string } | null
    }>
  }
}

const DOOR_HISTORY_JOB_MESSAGES = {
  createErrorPrefix: 'Failed to create door history job',
  missingJobIdMessage: 'Failed to create door history job: missing job id in response',
  readErrorPrefix: (jobId: string) => `Failed to read door history job ${jobId}`,
  missingJobMessage: (jobId: string) => `Door history job ${jobId} was not found after creation.`,
  failedJobMessage: 'Door history job failed.',
  timeoutMessage: TIMEOUT_ERROR,
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

function warnIfDoorHistoryJobSlow({
  cacheDate,
  jobId,
  status,
  durationMs,
}: {
  cacheDate: string
  jobId: string
  status: 'done' | 'failed' | 'timeout'
  durationMs: number
}) {
  if (durationMs < LONG_RUNNING_WARNING_MS && status !== 'timeout') {
    return
  }

  const durationSeconds = (durationMs / 1000).toFixed(1)
  const outcomeSuffix = status === 'timeout' ? ' and timed out.' : '.'

  console.warn(
    `[door-history] Refresh bridge job ${jobId} for ${cacheDate} took ${durationSeconds}s${outcomeSuffix}`,
  )
}

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const authResult = await requireAdminUser()

    if ('response' in authResult) {
      return authResult.response
    }

    const requestBody = await request.json()
    const parsedDate = parseDoorHistoryDateInput(requestBody?.date)

    if (!parsedDate.ok) {
      return createErrorResponse(parsedDate.error, 400)
    }

    const { startTime, endTime } = buildDoorHistoryDayBounds(parsedDate.date)
    const supabase = getSupabaseAdminClient()
    const accessControlClient = supabase as unknown as AccessControlJobsClient
    const cacheClient = supabase as unknown as DoorHistoryCacheWriteClient
    const jobStartedAt = Date.now()
    const job = await createAndWaitForAccessControlJob({
      jobType: 'get_door_history',
      payload: {
        startTime,
        endTime,
      },
      messages: DOOR_HISTORY_JOB_MESSAGES,
      maxWaitMs: MAX_WAIT_MS,
      supabase: accessControlClient,
    })
    const jobDurationMs = Date.now() - jobStartedAt

    warnIfDoorHistoryJobSlow({
      cacheDate: parsedDate.date,
      jobId: job.jobId,
      status: job.status,
      durationMs: jobDurationMs,
    })

    if (job.status !== 'done') {
      return NextResponse.json(
        {
          ok: false,
          jobId: job.jobId,
          error: job.error,
        },
        { status: job.httpStatus },
      )
    }

    const normalizedResult = normalizeDoorHistoryDeviceResult(job.result)
    const fetchedAt = new Date().toISOString()
    const { error: cacheError } = await cacheClient.from('door_history_cache').upsert(
      {
        cache_date: parsedDate.date,
        events: normalizedResult.events,
        fetched_at: fetchedAt,
        total_matches: normalizedResult.totalMatches,
      },
      {
        onConflict: 'cache_date',
      },
    )

    if (cacheError) {
      throw new Error(`Failed to cache door history for ${parsedDate.date}: ${cacheError.message}`)
    }

    return NextResponse.json({
      ok: true,
      events: normalizedResult.events,
      fetchedAt,
      totalMatches: normalizedResult.totalMatches,
      cacheDate: parsedDate.date,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('Invalid JSON body.', 400)
    }

    return createErrorResponse(
      error instanceof Error
        ? error.message
        : 'Unexpected server error while refreshing door history.',
      500,
    )
  }
}
