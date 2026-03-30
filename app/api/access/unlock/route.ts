import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

const DOOR_NUMBER = 1
const POLL_INTERVAL_MS = 500
const MAX_WAIT_MS = 10_000
const TIMEOUT_ERROR = `Unlock request timed out after ${MAX_WAIT_MS / 1000} seconds.`

type AccessControlJob = {
  id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  result: unknown
  error: string | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForUnlockJob(jobId: string) {
  const supabase = getSupabaseAdminClient()
  const deadline = Date.now() + MAX_WAIT_MS

  while (Date.now() <= deadline) {
    const { data: job, error } = await supabase
      .from('access_control_jobs')
      .select('id, status, result, error')
      .eq('id', jobId)
      .maybeSingle<AccessControlJob>()

    if (error) {
      throw new Error(`Failed to read unlock job ${jobId}: ${error.message}`)
    }

    if (!job) {
      throw new Error(`Unlock job ${jobId} was not found after creation.`)
    }

    if (job.status === 'done') {
      return NextResponse.json({
        ok: true,
        jobId,
        result: job.result,
      })
    }

    if (job.status === 'failed') {
      return NextResponse.json(
        {
          ok: false,
          jobId,
          error: job.error ?? 'Unlock job failed.',
        },
        { status: 502 },
      )
    }

    await sleep(POLL_INTERVAL_MS)
  }

  return NextResponse.json(
    {
      ok: false,
      jobId,
      error: TIMEOUT_ERROR,
    },
    { status: 504 },
  )
}

export async function POST() {
  try {
    const supabase = getSupabaseAdminClient()

    const { data: job, error } = await supabase
      .from('access_control_jobs')
      .insert({
        type: 'unlock_door',
        payload: { doorNo: DOOR_NUMBER },
      })
      .select('id')
      .single<{ id: string }>()

    if (error) {
      throw new Error(`Failed to create unlock job: ${error.message}`)
    }

    if (!job) {
      throw new Error('Failed to create unlock job: missing job id in response')
    }

    return waitForUnlockJob(job.id)
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
